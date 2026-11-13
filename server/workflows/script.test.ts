import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runWorkflowScript, workflowScriptCommand } from "./script.ts";

let root: string;
let stepDir: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "omb-workflow-script-"));
  stepDir = join(root, "step-1");
  mkdirSync(join(stepDir, "input"), { recursive: true });
  mkdirSync(join(stepDir, "output"), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function script(source: string, name = "run.mjs"): string {
  const path = join(root, name);
  writeFileSync(path, source);
  return path;
}

const pythonCommand = process.env.WORKFLOW_PYTHON || (process.platform === "win32" ? "python" : "python3");
const hasPython = spawnSync(pythonCommand, ["--version"], { stdio: "ignore" }).status === 0;

const run = (scriptPath: string, timeoutMs = 5_000) => runWorkflowScript({
  scriptPath,
  stepDir,
  inputDir: join(stepDir, "input"),
  outputDir: join(stepDir, "output"),
  timeoutMs,
  runId: "20261108-101500-a1b2c3",
  stepId: "validar",
});

describe("runWorkflowScript", () => {
  it("runs with the step folder as cwd and the step paths in the environment", async () => {
    const path = script(`
      import { readFileSync, writeFileSync } from "node:fs";
      readFileSync(process.env.WORKFLOW_STEP_INPUT + "/numbers.csv");
      writeFileSync(process.env.WORKFLOW_STEP_OUTPUT + "/result.json", JSON.stringify({
        cwd: process.cwd(),
        input: process.env.WORKFLOW_STEP_INPUT,
        output: process.env.WORKFLOW_STEP_OUTPUT,
        run: process.env.WORKFLOW_RUN_ID,
        step: process.env.WORKFLOW_STEP_ID,
      }));
    `);
    writeFileSync(join(stepDir, "input", "numbers.csv"), "1,2,3\n");
    const result = await run(path).promise;
    expect(result).toEqual({ ok: true });
    const written = JSON.parse(readFileSync(join(stepDir, "output", "result.json"), "utf8"));
    expect(written).toEqual({
      cwd: stepDir,
      input: join(stepDir, "input"),
      output: join(stepDir, "output"),
      run: "20261108-101500-a1b2c3",
      step: "validar",
    });
  });

  it("fails with the exit code and the stderr tail", async () => {
    const path = script(`console.error("missing file"); process.exit(3);`);
    const result = await run(path).promise;
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("code 3");
    expect(result.error).toContain("missing file");
  });

  it("picks the runtime from the script extension", () => {
    expect(workflowScriptCommand("/tmp/run.mjs")).toEqual({ command: process.execPath, args: ["/tmp/run.mjs"] });
    expect(workflowScriptCommand("/tmp/run.js")).toEqual({ command: process.execPath, args: ["/tmp/run.js"] });
    expect(workflowScriptCommand("/tmp/run.ts")).toEqual({ command: process.execPath, args: ["--experimental-strip-types", "/tmp/run.ts"] });
    const previous = process.env.WORKFLOW_PYTHON;
    process.env.WORKFLOW_PYTHON = "/opt/custom-python";
    try {
      expect(workflowScriptCommand("/tmp/run.py")).toEqual({ command: "/opt/custom-python", args: ["/tmp/run.py"] });
    } finally {
      if (previous === undefined) delete process.env.WORKFLOW_PYTHON;
      else process.env.WORKFLOW_PYTHON = previous;
    }
  });

  it("runs a TypeScript script with type stripping", async () => {
    const path = script(`
      import { writeFileSync } from "node:fs";
      const answer: string = "typed";
      writeFileSync(process.env.WORKFLOW_STEP_OUTPUT + "/result.txt", answer);
    `, "run.ts");
    const result = await run(path).promise;
    expect(result).toEqual({ ok: true });
    expect(readFileSync(join(stepDir, "output", "result.txt"), "utf8")).toBe("typed");
  });

  it.skipIf(!hasPython)("runs a Python script with the step environment and cwd", async () => {
    const path = script(`
import json
import os
from pathlib import Path
Path(os.environ["WORKFLOW_STEP_OUTPUT"], "result.json").write_text(json.dumps({
    "cwd": os.getcwd(),
    "input": os.environ["WORKFLOW_STEP_INPUT"],
    "output": os.environ["WORKFLOW_STEP_OUTPUT"],
    "run": os.environ["WORKFLOW_RUN_ID"],
    "step": os.environ["WORKFLOW_STEP_ID"],
}))
`, "run.py");
    const result = await run(path).promise;
    expect(result).toEqual({ ok: true });
    expect(JSON.parse(readFileSync(join(stepDir, "output", "result.json"), "utf8"))).toEqual({
      cwd: stepDir,
      input: join(stepDir, "input"),
      output: join(stepDir, "output"),
      run: "20261108-101500-a1b2c3",
      step: "validar",
    });
  });

  it("names the missing Python interpreter instead of showing a stack", async () => {
    const previous = process.env.WORKFLOW_PYTHON;
    process.env.WORKFLOW_PYTHON = "omb-missing-python-interpreter";
    try {
      const path = script("print('never runs')\n", "run.py");
      const result = await run(path).promise;
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toContain("could not find omb-missing-python-interpreter on PATH to run this script");
    } finally {
      if (previous === undefined) delete process.env.WORKFLOW_PYTHON;
      else process.env.WORKFLOW_PYTHON = previous;
    }
  });

  it("kills a script that runs past its timeout and marks it as timed out", async () => {
    const path = script(`setTimeout(() => {}, 60_000);`);
    const result = await run(path, 1_000).promise;
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("longer than 1000ms");
    expect(result.timedOut).toBe(true);
  });

  it("stops a running script when the run is cancelled", async () => {
    const path = script(`setTimeout(() => {}, 60_000);`);
    const handle = run(path);
    handle.kill();
    const result = await handle.promise;
    expect(result.ok).toBe(false);
  });
});
