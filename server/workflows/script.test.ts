import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runWorkflowScript } from "./script.ts";

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

function script(source: string): string {
  const path = join(root, "run.mjs");
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
