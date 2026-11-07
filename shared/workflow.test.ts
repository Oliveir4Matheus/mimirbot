import { describe, expect, it } from "vitest";

import {
  WORKFLOW_STEP_MAX,
  isWorkflowRelativePath,
  isWorkflowSlug,
  workflowDefinitionSchema,
  requireMatches,
  requireMismatch,
} from "./workflow.ts";

const definition = (overrides: Record<string, unknown> = {}) => ({
  id: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
  version: 1,
  name: "Contrato mensal",
  department: "Financeiro",
  steps: [
    {
      id: "coletar",
      name: "Collect the numbers",
      botId: "bot-analyst",
      instructions: "Read the folder and leave numbers.csv.",
      outputs: [{ path: "numbers.csv" }],
    },
    {
      id: "revisar",
      name: "Review the numbers",
      botId: "bot-reviewer",
      instructions: "Check numbers.csv and answer with a decision.",
      inputs: [{ as: "numbers.csv", from: { step: "coletar", output: "numbers.csv" } }],
      outputs: [{ path: "decision.json" }],
      result: "decision.json",
    },
  ],
  createdAt: 1,
  updatedAt: 2,
  ...overrides,
});

const issues = (input: unknown) => {
  const parsed = workflowDefinitionSchema.safeParse(input);
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join("."));
};

describe("workflowDefinitionSchema", () => {
  it("parses a linear workflow and applies the run defaults", () => {
    const parsed = workflowDefinitionSchema.parse(definition());
    expect(parsed.retentionDays).toBe(90);
    expect(parsed.steps[0]!.inputs).toEqual([]);
    expect(parsed.steps[0]!.outputs).toEqual([{ path: "numbers.csv", required: true }]);
    expect(parsed.steps[1]!.result).toBe("decision.json");
  });

  it("keeps a retention the owner chose", () => {
    expect(workflowDefinitionSchema.parse(definition({ retentionDays: 7 })).retentionDays).toBe(7);
  });

  it("rejects duplicate step ids", () => {
    const workflow = definition();
    workflow.steps[1]!.id = "coletar";
    expect(issues(workflow)).toContain(`steps.1.id`);
  });

  it("rejects an input that points at a later step", () => {
    const workflow = definition();
    workflow.steps[0]!.inputs = [{ as: "x", from: { step: "revisar", output: "decision.json" } }] as never;
    expect(issues(workflow)).toContain("steps.0.inputs.0.from.step");
  });

  it("rejects an input from a step that does not exist", () => {
    const workflow = definition();
    workflow.steps[1]!.inputs = [{ as: "x", from: { step: "nope", output: "numbers.csv" } }] as never;
    expect(issues(workflow)).toContain("steps.1.inputs.0.from.step");
  });

  it("rejects an input whose source step did not declare the output", () => {
    const workflow = definition();
    workflow.steps[1]!.inputs = [{ as: "x", from: { step: "coletar", output: "other.csv" } }] as never;
    expect(issues(workflow)).toContain("steps.1.inputs.0.from.output");
  });

  it("rejects a result that is not one of the step's outputs", () => {
    const workflow = definition();
    workflow.steps[1]!.result = "answer.json";
    expect(issues(workflow)).toContain("steps.1.result");
  });

  it("rejects the same output declared twice", () => {
    const workflow = definition();
    workflow.steps[0]!.outputs = [{ path: "numbers.csv" }, { path: "numbers.csv" }] as never;
    expect(issues(workflow)).toContain("steps.0.outputs.1.path");
  });

  it("rejects the same input name declared twice", () => {
    const workflow = definition();
    workflow.steps[1]!.inputs = [
      { as: "same.csv", from: { step: "coletar", output: "numbers.csv" } },
      { as: "same.csv", from: { step: "coletar", output: "numbers.csv" } },
    ] as never;
    expect(issues(workflow)).toContain("steps.1.inputs.1.as");
  });

  it("rejects unsafe paths wherever a step declares one", () => {
    const workflow = definition();
    workflow.steps[0]!.outputs = [{ path: "../escape.csv" }] as never;
    workflow.steps[1]!.inputs = [{ as: "/abs.csv", from: { step: "coletar", output: "numbers.csv" } }] as never;
    expect(issues(workflow)).toEqual(expect.arrayContaining(["steps.0.outputs.0.path", "steps.1.inputs.0.as"]));
  });

  it("rejects a workflow with no steps", () => {
    expect(issues(definition({ steps: [] }))).toContain("steps");
  });

  it("rejects more steps than the limit", () => {
    const steps = Array.from({ length: WORKFLOW_STEP_MAX + 1 }, (_, index) => ({
      id: `step-${index}`,
      name: `Step ${index}`,
      botId: "bot",
      instructions: "Do it.",
      outputs: [{ path: "out.txt" }],
    }));
    expect(issues(definition({ steps }))).toContain("steps");
  });

  it("rejects a workflow id that is not a uuid", () => {
    expect(issues(definition({ id: "contrato-mensal" }))).toContain("id");
  });

  it("keeps the step's require object", () => {
    const workflow = definition();
    workflow.steps[1]!.require = { ok: true, reason: "done" };
    expect(workflowDefinitionSchema.parse(workflow).steps[1]!.require).toEqual({ ok: true, reason: "done" });
  });

  it("rejects require without a declared result", () => {
    const workflow = definition();
    workflow.steps[1]!.result = undefined;
    workflow.steps[1]!.require = { ok: true };
    expect(issues(workflow)).toContain("steps.1.require");
  });

  it("rejects an input that comes from an optional output", () => {
    const workflow = definition();
    workflow.steps[0]!.outputs = [{ path: "numbers.csv", required: false }] as never;
    expect(issues(workflow)).toContain("steps.1.inputs.0.from.output");
  });
});

describe("requireMismatch", () => {
  it("accepts a result whose declared fields match by equality", () => {
    expect(requireMismatch({ ok: true, reason: "done", nested: { at: 1 } }, { ok: true, nested: { at: 1 } })).toBeUndefined();
    expect(requireMatches({ ok: false }, { ok: false })).toBe(true);
  });

  it("names the field that differs or is missing", () => {
    expect(requireMismatch({ ok: false }, { ok: true })).toContain('"ok" is false');
    expect(requireMismatch({}, { ok: true })).toContain('no "ok" field');
  });

  it("compares arrays and nested objects by value, not by reference", () => {
    expect(requireMatches({ list: [1, { a: "b" }] }, { list: [1, { a: "b" }] })).toBe(true);
    expect(requireMatches({ list: [1, 2] }, { list: [2, 1] })).toBe(false);
  });

  it("refuses a result that is not an object", () => {
    expect(requireMismatch([], { ok: true })).toContain("not a JSON object");
    expect(requireMismatch(null, { ok: true })).toContain("not a JSON object");
  });
});

describe("isWorkflowSlug", () => {
  it("accepts lowercase words joined by single hyphens", () => {
    for (const value of ["a", "step-1", "coletar-numeros", "a1-b2"]) expect(isWorkflowSlug(value)).toBe(true);
  });

  it("rejects anything a folder name could not keep verbatim", () => {
    for (const value of ["", "Step", "step_1", "-step", "step-", "step--1", "step 1", "a/b", ".."]) {
      expect(isWorkflowSlug(value)).toBe(false);
    }
  });
});

describe("isWorkflowRelativePath", () => {
  it("accepts plain and nested files", () => {
    for (const value of ["a.txt", "sub/dir/report.json", "a b/c d.txt"]) expect(isWorkflowRelativePath(value)).toBe(true);
  });

  it("refuses absolute paths, traversal and backslashes", () => {
    for (const value of ["/etc/passwd", "C:/x", "\\\\server\\share", "../x", "a/../b", "a/./b", "a\\b", "a//b", "..", ""]) {
      expect(isWorkflowRelativePath(value)).toBe(false);
    }
  });

  it("refuses segments with padding or control characters", () => {
    for (const value of [" a.txt", "a.txt ", "a/\tb.txt", "a\u0000b"]) expect(isWorkflowRelativePath(value)).toBe(false);
  });
});
