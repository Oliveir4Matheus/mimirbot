import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { BotWorkflowStep, StepOutput } from "../../shared/workflow.ts";
import { WORKFLOW_RESULT_MAX_BYTES, copyStepInputs, prepareRunDirectories, safeWorkflowPath, verifyStepOutputs } from "./files.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "omb-workflow-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const required = (...paths: string[]): StepOutput[] => paths.map((path) => ({ path, required: true }));

const step = (overrides: Partial<BotWorkflowStep> = {}): BotWorkflowStep => ({
  id: "revisar",
  kind: "bot",
  name: "Review",
  botId: "bot-reviewer",
  instructions: "Read the input and leave a decision.",
  timeoutMs: 0,
  mode: "auto",
  inputs: [],
  outputs: required("decision.json"),
  ...overrides,
});

const outputDir = () => {
  const made = join(root, "step-1", "output");
  mkdirSync(made, { recursive: true });
  return made;
};

const writeOutput = (path: string, text: string) => {
  const dir = outputDir();
  const target = join(dir, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
  return dir;
};

describe("safeWorkflowPath", () => {
  it("resolves a declared relative path under the step folder", () => {
    expect(safeWorkflowPath(root, "a.txt")).toBe(join(root, "a.txt"));
    expect(safeWorkflowPath(root, "sub/dir/a.txt")).toBe(join(root, "sub", "dir", "a.txt"));
  });

  it("refuses a path that would leave the step folder", () => {
    for (const declared of ["../x", "a/../../x", "/etc/passwd", "C:/x", "a\\b", ""]) {
      expect(safeWorkflowPath(root, declared)).toBeNull();
    }
  });
});

describe("prepareRunDirectories", () => {
  it("gives every step its own input and output before any bot runs", () => {
    const dirs = prepareRunDirectories(root, 2);
    expect(dirs).toEqual([join(root, "step-1"), join(root, "step-2")]);
    for (const dir of dirs) {
      expect(statSync(join(dir, "input")).isDirectory()).toBe(true);
      expect(statSync(join(dir, "output")).isDirectory()).toBe(true);
    }
  });

  it("refuses a step count no workflow can have", () => {
    for (const count of [0, -1, 1.5]) expect(() => prepareRunDirectories(root, count)).toThrow();
  });
});

describe("verifyStepOutputs", () => {
  it("accepts a plain, non-empty required output", () => {
    const dir = writeOutput("numbers.csv", "1,2,3\n");
    expect(verifyStepOutputs(dir, required("numbers.csv"))).toEqual({ ok: true, verified: ["numbers.csv"] });
  });

  it("accepts a nested output", () => {
    const dir = writeOutput("reports/numbers.csv", "1,2,3\n");
    expect(verifyStepOutputs(dir, required("reports/numbers.csv"))).toEqual({ ok: true, verified: ["reports/numbers.csv"] });
  });

  it("fails when a required output is missing", () => {
    const result = verifyStepOutputs(outputDir(), required("numbers.csv"));
    expect(result).toEqual({ ok: false, error: expect.stringContaining("missing required output") });
  });

  it("lets an optional output be absent and still reports the ones present", () => {
    const dir = writeOutput("numbers.csv", "1,2,3\n");
    const outputs: StepOutput[] = [{ path: "numbers.csv", required: true }, { path: "notes.md", required: false }];
    expect(verifyStepOutputs(dir, outputs)).toEqual({ ok: true, verified: ["numbers.csv"] });
  });

  it("fails when a required output is empty", () => {
    const dir = writeOutput("numbers.csv", "");
    expect(verifyStepOutputs(dir, required("numbers.csv"))).toEqual({ ok: false, error: expect.stringContaining("is empty") });
  });

  it("fails when the output is a folder", () => {
    const dir = outputDir();
    mkdirSync(join(dir, "numbers.csv"));
    expect(verifyStepOutputs(dir, required("numbers.csv"))).toEqual({ ok: false, error: expect.stringContaining("is not a file") });
  });

  it("fails when the output is a symlink, even to a real file", () => {
    const dir = outputDir();
    const target = join(root, "elsewhere.csv");
    writeFileSync(target, "1,2,3\n");
    symlinkSync(target, join(dir, "numbers.csv"));
    expect(verifyStepOutputs(dir, required("numbers.csv"))).toEqual({ ok: false, error: expect.stringContaining("is a link") });
  });

  it("reads a declared result as a small JSON object", () => {
    const dir = writeOutput("decision.json", JSON.stringify({ approved: true, reason: "ok" }));
    expect(verifyStepOutputs(dir, required("decision.json"), "decision.json")).toEqual({
      ok: true,
      verified: ["decision.json"],
      result: { approved: true, reason: "ok" },
    });
  });

  it("fails when the result is not declared as an output", () => {
    const dir = writeOutput("decision.json", "{}");
    expect(verifyStepOutputs(dir, required("decision.json"), "other.json")).toEqual({
      ok: false,
      error: expect.stringContaining("must be one of the step's outputs"),
    });
  });

  it("fails when the result is missing, empty or not JSON", () => {
    const dir = outputDir();
    const optional: StepOutput[] = [{ path: "decision.json", required: false }];
    expect(verifyStepOutputs(dir, optional, "decision.json")).toEqual({
      ok: false,
      error: expect.stringContaining("missing result"),
    });
    writeFileSync(join(dir, "decision.json"), "");
    expect(verifyStepOutputs(dir, optional, "decision.json")).toEqual({
      ok: false,
      error: expect.stringContaining("is empty"),
    });
    writeFileSync(join(dir, "decision.json"), "{not json");
    expect(verifyStepOutputs(dir, optional, "decision.json")).toEqual({
      ok: false,
      error: expect.stringContaining("is not valid JSON"),
    });
  });

  it("fails when the result is an array, a scalar or null", () => {
    const dir = outputDir();
    for (const text of ["[]", '"yes"', "null", "3"]) {
      writeFileSync(join(dir, "decision.json"), text);
      expect(verifyStepOutputs(dir, required("decision.json"), "decision.json")).toEqual({
        ok: false,
        error: expect.stringContaining("must be a JSON object"),
      });
    }
  });

  it("fails when the result is larger than the limit", () => {
    const dir = writeOutput("decision.json", JSON.stringify({ text: "x".repeat(WORKFLOW_RESULT_MAX_BYTES) }));
    expect(verifyStepOutputs(dir, required("decision.json"), "decision.json")).toEqual({
      ok: false,
      error: expect.stringContaining("larger than"),
    });
  });
});

describe("copyStepInputs", () => {
  const first = step({
    id: "coletar",
    name: "Collect",
    botId: "bot-analyst",
    instructions: "Leave numbers.csv.",
    outputs: required("numbers.csv"),
  });

  it("copies only the declared output of an earlier step into input/", () => {
    writeOutput("numbers.csv", "1,2,3\n");
    writeOutput("secret.txt", "not for the next step");
    const second = step({
      inputs: [{ as: "numbers.csv", from: { step: "coletar", output: "numbers.csv" } }],
    });
    const result = copyStepInputs(root, 1, second, [first, second]);
    expect(result).toEqual({ ok: true, copied: ["numbers.csv"] });
    expect(readFileSync(join(root, "step-2", "input", "numbers.csv"), "utf8")).toBe("1,2,3\n");
    expect(() => readFileSync(join(root, "step-2", "input", "secret.txt"), "utf8")).toThrow();
  });

  it("copies a nested input under the name the step declared", () => {
    writeOutput("reports/numbers.csv", "1,2,3\n");
    const second = step({
      inputs: [{ as: "data/numbers.csv", from: { step: "coletar", output: "reports/numbers.csv" } }],
    });
    expect(copyStepInputs(root, 1, second, [first, second])).toEqual({ ok: true, copied: ["data/numbers.csv"] });
    expect(readFileSync(join(root, "step-2", "input", "data", "numbers.csv"), "utf8")).toBe("1,2,3\n");
  });

  it("makes a copied input readable only by the person running it", () => {
    if (process.platform === "win32") return;
    writeOutput("numbers.csv", "1,2,3\n");
    const second = step({
      inputs: [{ as: "numbers.csv", from: { step: "coletar", output: "numbers.csv" } }],
    });
    copyStepInputs(root, 1, second, [first, second]);
    expect(statSync(join(root, "step-2", "input", "numbers.csv")).mode & 0o777).toBe(0o600);
  });

  it("refuses an input that does not come from an earlier step", () => {
    const second = step({
      inputs: [{ as: "numbers.csv", from: { step: "revisar", output: "decision.json" } }],
    });
    expect(copyStepInputs(root, 1, second, [first, second])).toEqual({
      ok: false,
      error: expect.stringContaining("must come from an earlier step"),
    });
  });

  it("refuses an input from a step that does not exist", () => {
    const second = step({
      inputs: [{ as: "numbers.csv", from: { step: "nope", output: "numbers.csv" } }],
    });
    expect(copyStepInputs(root, 1, second, [first, second])).toEqual({
      ok: false,
      error: expect.stringContaining("must come from an earlier step"),
    });
  });

  it("refuses a missing or non-file source", () => {
    const second = step({
      inputs: [{ as: "numbers.csv", from: { step: "coletar", output: "numbers.csv" } }],
    });
    expect(copyStepInputs(root, 1, second, [first, second])).toEqual({
      ok: false,
      error: expect.stringContaining("missing source"),
    });
    mkdirSync(join(root, "step-1", "output", "numbers.csv"), { recursive: true });
    expect(copyStepInputs(root, 1, second, [first, second])).toEqual({
      ok: false,
      error: expect.stringContaining("is not a plain file"),
    });
  });

  it("refuses a symlinked source", () => {
    const dir = outputDir();
    const target = join(root, "elsewhere.csv");
    writeFileSync(target, "1,2,3\n");
    symlinkSync(target, join(dir, "numbers.csv"));
    const second = step({
      inputs: [{ as: "numbers.csv", from: { step: "coletar", output: "numbers.csv" } }],
    });
    expect(copyStepInputs(root, 1, second, [first, second])).toEqual({
      ok: false,
      error: expect.stringContaining("is not a plain file"),
    });
  });

  it("refuses a declared name or source that would leave its folder", () => {
    writeOutput("numbers.csv", "1,2,3\n");
    const escaping = step({
      inputs: [{ as: "../escape.csv", from: { step: "coletar", output: "numbers.csv" } }],
    });
    expect(copyStepInputs(root, 1, escaping, [first, escaping])).toEqual({
      ok: false,
      error: expect.stringContaining("is not a safe relative path"),
    });
    const readingOut = step({
      inputs: [{ as: "numbers.csv", from: { step: "coletar", output: "../numbers.csv" } }],
    });
    expect(copyStepInputs(root, 1, readingOut, [first, readingOut])).toEqual({
      ok: false,
      error: expect.stringContaining("is not a safe relative path"),
    });
  });
});
