import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { workflowEnvironmentPaths } from "./environment.ts";
import { runWorkflowScript, workflowScriptCommand, workflowScriptEnvironment } from "./script.ts";

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
    const resolvedStep = realpathSync(stepDir);
    expect(written).toEqual({
      cwd: resolvedStep,
      input: join(resolvedStep, "input"),
      output: join(resolvedStep, "output"),
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

  it("always runs the script with this app's own Node", () => {
    expect(workflowScriptCommand("/tmp/run.mjs")).toEqual({ command: process.execPath, args: ["/tmp/run.mjs"] });
    expect(workflowScriptCommand("/tmp/run.js")).toEqual({ command: process.execPath, args: ["/tmp/run.js"] });
  });

  it("names the installation's python and node_modules and puts the venv bin first on PATH", async () => {
    const environment = workflowEnvironmentPaths({ env: { OMB_WORKFLOWS_ROOT: join(root, "project") }, platform: "linux" });
    const path = script(`
      import { writeFileSync } from "node:fs";
      writeFileSync(process.env.WORKFLOW_STEP_OUTPUT + "/env.json", JSON.stringify({
        python: process.env.WORKFLOW_PYTHON,
        nodeModules: process.env.WORKFLOW_NODE_MODULES,
        path: process.env.PATH,
      }));
    `);
    const options = {
      scriptPath: path,
      stepDir,
      inputDir: join(stepDir, "input"),
      outputDir: join(stepDir, "output"),
      timeoutMs: 5_000,
      runId: "20261108-101500-a1b2c3",
      stepId: "validar",
      environment,
    };
    const result = await runWorkflowScript(options).promise;
    expect(result).toEqual({ ok: true });
    const written = JSON.parse(readFileSync(join(stepDir, "output", "env.json"), "utf8"));

    expect(written).toEqual({
      python: environment.python,
      nodeModules: join(environment.root, "node_modules"),
      path: expect.any(String),
    });
    expect(written.path.startsWith(`${environment.binDir}${delimiter}`)).toBe(true);
    expect(Object.keys(workflowScriptEnvironment(options))).toEqual([
      "WORKFLOW_STEP_INPUT", "WORKFLOW_STEP_OUTPUT", "WORKFLOW_RUN_ID", "WORKFLOW_STEP_ID",
      "WORKFLOW_PYTHON", "WORKFLOW_NODE_MODULES",
      ...["PATH", "HOME", "USERPROFILE", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "SYSTEMROOT"].filter((key) => process.env[key]),
    ]);
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
