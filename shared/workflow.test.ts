import { describe, expect, it } from "vitest";

import {
  WORKFLOW_STEP_MAX,
  isWorkflowRelativePath,
  isWorkflowSlug,
  workflowDefinitionSchema,
  workflowStartsManual,
  requireMatches,
  requireMismatch,
  resultField,
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

const branchWorkflow = (overrides: Record<string, unknown> = {}) => definition({
  steps: [
    { id: "coletar", kind: "bot", name: "Collect", botId: "bot-a", instructions: "Collect.", outputs: [{ path: "numbers.csv", required: true }] },
    {
      id: "validar",
      kind: "script",
      name: "Validate",
      run: "validar.mjs",
      outputs: [{ path: "result.json", required: true }],
      result: "result.json",
      when: [{ field: "ok", equals: false, next: "corrigir" }],
    },
    { id: "corrigir", kind: "bot", name: "Fix", botId: "bot-b", instructions: "Fix.", outputs: [{ path: "result.json" }], onSuccess: "fechar" },
    { id: "fechar", kind: "bot", name: "Close", botId: "bot-b", instructions: "Close.", outputs: [{ path: "result.json" }], result: "result.json" },
  ],
  ...overrides,
});

describe("script steps and flow edges", () => {
  it("parses bot and script steps, defaulting the script timeout and leaving the bot unlimited", () => {
    const parsed = workflowDefinitionSchema.parse(branchWorkflow());
    expect(parsed.steps[0]!.kind).toBe("bot");
    expect(parsed.steps[0]!.kind === "bot" && parsed.steps[0]!.timeoutMs).toBe(0);
    expect(parsed.steps[0]!.kind === "bot" && parsed.steps[0]!.mode).toBe("auto");
    const script = parsed.steps[1]!;
    expect(script.kind).toBe("script");
    if (script.kind !== "script") throw new Error("expected a script step");
    expect(script.run).toBe("validar.mjs");
    expect(script.timeoutMs).toBe(60_000);
    expect(script.mode).toBe("auto");
  });

  it("keeps a manual mode on bot and script steps", () => {
    const workflow = branchWorkflow();
    (workflow.steps[0] as Record<string, unknown>).mode = "manual";
    (workflow.steps[1] as Record<string, unknown>).mode = "manual";
    const parsed = workflowDefinitionSchema.parse(workflow);
    expect(parsed.steps[0]!.kind === "bot" && parsed.steps[0]!.mode).toBe("manual");
    expect(parsed.steps[1]!.kind === "script" && parsed.steps[1]!.mode).toBe("manual");
    expect(workflowStartsManual(parsed)).toBe(true);
  });

  it("does not give a condition a mode", () => {
    const workflow = definition({
      steps: [
        { id: "revisar", name: "Review", botId: "bot-b", instructions: "Review.", outputs: [{ path: "decision.json" }], result: "decision.json" },
        { id: "checar", kind: "condition", name: "Check", from: "revisar", field: "ok", op: "equals", value: true, mode: "manual" },
      ],
    });
    const parsed = workflowDefinitionSchema.parse(workflow);
    expect(parsed.steps[1]!.kind).toBe("condition");
    expect(parsed.steps[1] !== undefined && "mode" in parsed.steps[1]).toBe(false);
    expect(workflowStartsManual(parsed)).toBe(false);
  });

  it("treats a step without kind as a bot step", () => {
    const parsed = workflowDefinitionSchema.parse(definition());
    expect(parsed.steps.map((step) => step.kind)).toEqual(["bot", "bot"]);
  });

  it("reads the old next field as onSuccess and drops it", () => {
    const workflow = branchWorkflow();
    (workflow.steps[2] as Record<string, unknown>).onSuccess = undefined;
    (workflow.steps[2] as Record<string, unknown>).next = "fechar";
    const parsed = workflowDefinitionSchema.parse(workflow);
    expect(parsed.steps[2]!.kind === "bot" && parsed.steps[2]!.onSuccess).toBe("fechar");
    expect((parsed.steps[2] as Record<string, unknown>).next).toBeUndefined();
    expect(parsed.steps[1]!.kind === "script" && parsed.steps[1]!.when?.[0]?.next).toBe("corrigir");
  });

  it("keeps an explicit end and every forward destination", () => {
    const workflow = branchWorkflow();
    (workflow.steps[2] as Record<string, unknown>).onSuccess = null;
    const parsed = workflowDefinitionSchema.parse(workflow);
    expect(parsed.steps[2]!.kind === "bot" && parsed.steps[2]!.onSuccess).toBeNull();
    expect(parsed.steps[1]!.kind === "script" && parsed.steps[1]!.when?.[0]?.next).toBe("corrigir");
  });

  it("refuses an edge that points backwards", () => {
    const backwardNext = branchWorkflow();
    (backwardNext.steps[2] as Record<string, unknown>).onSuccess = "coletar";
    expect(issues(backwardNext)).toContain("steps.2.onSuccess");

    const backwardFailure = branchWorkflow();
    (backwardFailure.steps[2] as Record<string, unknown>).onFailure = "validar";
    expect(issues(backwardFailure)).toContain("steps.2.onFailure");

    const backwardTimeout = branchWorkflow();
    (backwardTimeout.steps[1] as Record<string, unknown>).onTimeout = "coletar";
    expect(issues(backwardTimeout)).toContain("steps.1.onTimeout");

    const backwardWhen = branchWorkflow();
    (backwardWhen.steps[1] as Record<string, unknown>).when = [{ field: "ok", equals: false, next: "coletar" }];
    expect(issues(backwardWhen)).toContain("steps.1.when.0.next");
  });

  it("refuses onTimeout without a maximum time", () => {
    const workflow = branchWorkflow();
    (workflow.steps[2] as Record<string, unknown>).onTimeout = "fechar";
    expect(issues(workflow)).toContain("steps.2.onTimeout");
  });

  it("rejects a script name that is a path or another extension", () => {
    for (const run of ["../validar.mjs", "sub/validar.mjs", "validar.sh", "Validar.mjs", ""]) {
      const workflow = branchWorkflow();
      (workflow.steps[1] as Record<string, unknown>).run = run;
      expect(issues(workflow)).toContain("steps.1.run");
    }
  });

  it("rejects an unknown onSuccess, onFailure or when target", () => {
    const unknownNext = branchWorkflow();
    (unknownNext.steps[2] as Record<string, unknown>).onSuccess = "nope";
    expect(issues(unknownNext)).toContain("steps.2.onSuccess");

    const unknownFailure = branchWorkflow();
    (unknownFailure.steps[2] as Record<string, unknown>).onFailure = "nope";
    expect(issues(unknownFailure)).toContain("steps.2.onFailure");

    const unknownBranch = branchWorkflow();
    (unknownBranch.steps[1] as Record<string, unknown>).when = [{ field: "ok", equals: false, next: "nope" }];
    expect(issues(unknownBranch)).toContain("steps.1.when.0.next");
  });

  it("rejects when without a declared result", () => {
    const workflow = branchWorkflow();
    (workflow.steps[1] as Record<string, unknown>).result = undefined;
    expect(issues(workflow)).toContain("steps.1.when");
  });

  it("reads a dotted field out of the result", () => {
    expect(resultField({ ok: true, check: { total: 3 } }, "check.total")).toEqual({ found: true, value: 3 });
    expect(resultField({ check: { total: 3 } }, "check.missing")).toEqual({ found: false, value: undefined });
    expect(resultField({ ok: true }, "a.b.c")).toEqual({ found: false, value: undefined });
    expect(resultField(null, "ok")).toEqual({ found: false, value: undefined });
  });
});

describe("condition steps and the Studio canvas", () => {
  const withCondition = (overrides: Record<string, unknown> = {}) => definition({
    steps: [
      { id: "revisar", name: "Review", botId: "bot-b", instructions: "Review.", outputs: [{ path: "decision.json" }], result: "decision.json" },
      { id: "checar", kind: "condition", name: "Check", from: "revisar", field: "ok", op: "equals", value: true, whenTrue: "fechar", whenFalse: "corrigir" },
      { id: "fechar", name: "Close", botId: "bot-a", instructions: "Close.", outputs: [{ path: "done.txt" }] },
      { id: "corrigir", name: "Fix", botId: "bot-a", instructions: "Fix.", outputs: [{ path: "fixed.txt" }] },
    ],
    ...overrides,
  });

  it("parses a condition and its two routes", () => {
    const parsed = workflowDefinitionSchema.parse(withCondition());
    const condition = parsed.steps[1]!;
    expect(condition.kind).toBe("condition");
    expect(condition.kind === "condition" && condition.whenTrue).toBe("fechar");
    expect(condition.kind === "condition" && condition.whenFalse).toBe("corrigir");
  });

  it("normalizes the legacy loose comparison into a group of one", () => {
    const parsed = workflowDefinitionSchema.parse(withCondition());
    const condition = parsed.steps[1]!;
    expect(condition.kind === "condition" && condition.match).toBe("all");
    expect(condition.kind === "condition" && condition.conditions).toEqual([{ field: "ok", op: "equals", value: true }]);
    const record = condition as Record<string, unknown>;
    expect(record.field).toBeUndefined();
    expect(record.op).toBeUndefined();
    expect(record.value).toBeUndefined();
  });

  it("accepts an explicit all or any group", () => {
    const group = (match: string) => withCondition({
      steps: [
        { id: "revisar", name: "Review", botId: "bot-b", instructions: "Review.", outputs: [{ path: "decision.json" }], result: "decision.json" },
        {
          id: "checar",
          kind: "condition",
          name: "Check",
          from: "revisar",
          match,
          conditions: [
            { field: "ok", op: "equals", value: false },
            { field: "check.total", op: "gte", value: 10 },
          ],
          whenTrue: "fechar",
          whenFalse: "corrigir",
        },
        { id: "fechar", name: "Close", botId: "bot-a", instructions: "Close.", outputs: [{ path: "done.txt" }] },
        { id: "corrigir", name: "Fix", botId: "bot-a", instructions: "Fix.", outputs: [{ path: "fixed.txt" }] },
      ],
    });
    for (const match of ["all", "any"]) {
      const parsed = workflowDefinitionSchema.parse(group(match));
      const condition = parsed.steps[1]!;
      expect(condition.kind === "condition" && condition.match).toBe(match);
      expect(condition.kind === "condition" && condition.conditions).toHaveLength(2);
    }
  });

  it("defaults an explicit group with no match to all", () => {
    const workflow = withCondition({
      steps: [
        { id: "revisar", name: "Review", botId: "bot-b", instructions: "Review.", outputs: [{ path: "decision.json" }], result: "decision.json" },
        {
          id: "checar",
          kind: "condition",
          name: "Check",
          from: "revisar",
          conditions: [{ field: "ok", op: "equals", value: true }],
          whenTrue: "fechar",
          whenFalse: "corrigir",
        },
        { id: "fechar", name: "Close", botId: "bot-a", instructions: "Close.", outputs: [{ path: "done.txt" }] },
        { id: "corrigir", name: "Fix", botId: "bot-a", instructions: "Fix.", outputs: [{ path: "fixed.txt" }] },
      ],
    });
    const parsed = workflowDefinitionSchema.parse(workflow);
    const condition = parsed.steps[1]!;
    expect(condition.kind === "condition" && condition.match).toBe("all");
  });

  it("refuses an empty group and more than twenty comparisons", () => {
    const empty = withCondition({
      steps: [
        { id: "revisar", name: "Review", botId: "bot-b", instructions: "Review.", outputs: [{ path: "decision.json" }], result: "decision.json" },
        { id: "checar", kind: "condition", name: "Check", from: "revisar", match: "all", conditions: [], whenTrue: "fechar", whenFalse: "corrigir" },
        { id: "fechar", name: "Close", botId: "bot-a", instructions: "Close.", outputs: [{ path: "done.txt" }] },
        { id: "corrigir", name: "Fix", botId: "bot-a", instructions: "Fix.", outputs: [{ path: "fixed.txt" }] },
      ],
    });
    expect(issues(empty)).toContain("steps.1.conditions");

    const many = withCondition({
      steps: [
        { id: "revisar", name: "Review", botId: "bot-b", instructions: "Review.", outputs: [{ path: "decision.json" }], result: "decision.json" },
        {
          id: "checar",
          kind: "condition",
          name: "Check",
          from: "revisar",
          match: "all",
          conditions: Array.from({ length: 21 }, () => ({ field: "ok", op: "equals", value: true })),
          whenTrue: "fechar",
          whenFalse: "corrigir",
        },
        { id: "fechar", name: "Close", botId: "bot-a", instructions: "Close.", outputs: [{ path: "done.txt" }] },
        { id: "corrigir", name: "Fix", botId: "bot-a", instructions: "Fix.", outputs: [{ path: "fixed.txt" }] },
      ],
    });
    expect(issues(many)).toContain("steps.1.conditions");
  });

  it("requires a value for every operator except exists", () => {
    for (const op of ["equals", "not_equals", "contains", "gt", "gte", "lt", "lte"]) {
      const missing = withCondition({
        steps: [
          { id: "revisar", name: "Review", botId: "bot-b", instructions: "Review.", outputs: [{ path: "decision.json" }], result: "decision.json" },
          { id: "checar", kind: "condition", name: "Check", from: "revisar", match: "all", conditions: [{ field: "ok", op }], whenTrue: "fechar", whenFalse: "corrigir" },
          { id: "fechar", name: "Close", botId: "bot-a", instructions: "Close.", outputs: [{ path: "done.txt" }] },
          { id: "corrigir", name: "Fix", botId: "bot-a", instructions: "Fix.", outputs: [{ path: "fixed.txt" }] },
        ],
      });
      expect(issues(missing)).toContain("steps.1.conditions.0.value");
    }
    const exists = withCondition({
      steps: [
        { id: "revisar", name: "Review", botId: "bot-b", instructions: "Review.", outputs: [{ path: "decision.json" }], result: "decision.json" },
        { id: "checar", kind: "condition", name: "Check", from: "revisar", match: "all", conditions: [{ field: "ok", op: "exists" }], whenTrue: "fechar", whenFalse: "corrigir" },
        { id: "fechar", name: "Close", botId: "bot-a", instructions: "Close.", outputs: [{ path: "done.txt" }] },
        { id: "corrigir", name: "Fix", botId: "bot-a", instructions: "Fix.", outputs: [{ path: "fixed.txt" }] },
      ],
    });
    expect(issues(exists)).toEqual([]);
  });

  it("refuses a compared value over the size limit", () => {
    const workflow = withCondition({
      steps: [
        { id: "revisar", name: "Review", botId: "bot-b", instructions: "Review.", outputs: [{ path: "decision.json" }], result: "decision.json" },
        {
          id: "checar",
          kind: "condition",
          name: "Check",
          from: "revisar",
          match: "all",
          conditions: [{ field: "ok", op: "equals", value: "x".repeat(4_097) }],
          whenTrue: "fechar",
          whenFalse: "corrigir",
        },
        { id: "fechar", name: "Close", botId: "bot-a", instructions: "Close.", outputs: [{ path: "done.txt" }] },
        { id: "corrigir", name: "Fix", botId: "bot-a", instructions: "Fix.", outputs: [{ path: "fixed.txt" }] },
      ],
    });
    expect(issues(workflow)).toContain("steps.1.conditions.0.value");
  });

  it("requires the source step to declare a result", () => {
    const workflow = withCondition();
    delete (workflow.steps[0] as Record<string, unknown>).result;
    expect(issues(workflow)).toContain("steps.1.from");
  });

  it("refuses a condition that points at a step that does not exist", () => {
    const workflow = withCondition();
    (workflow.steps[1] as Record<string, unknown>).whenTrue = "missing";
    expect(issues(workflow)).toContain("steps.1.whenTrue");
  });

  it("refuses a condition route or source that points backwards", () => {
    const backwardTrue = withCondition();
    (backwardTrue.steps[1] as Record<string, unknown>).whenTrue = "revisar";
    expect(issues(backwardTrue)).toContain("steps.1.whenTrue");

    const backwardFalse = withCondition();
    (backwardFalse.steps[1] as Record<string, unknown>).whenFalse = "revisar";
    expect(issues(backwardFalse)).toContain("steps.1.whenFalse");

    const backwardSource = withCondition();
    (backwardSource.steps[1] as Record<string, unknown>).from = "fechar";
    expect(issues(backwardSource)).toContain("steps.1.from");
  });

  it("keeps the canvas with positions, notes and containers", () => {
    const parsed = workflowDefinitionSchema.parse(withCondition({
      canvas: {
        nodes: { revisar: { x: 10, y: 20 } },
        notes: [{ id: "note-1", x: 1, y: 2, width: 255, height: 180, markdown: "# Title" }],
        containers: [{ id: "container-1", x: 0, y: 0, width: 520, height: 310, name: "Group" }],
      },
    }));
    expect(parsed.canvas?.nodes.revisar).toEqual({ x: 10, y: 20 });
    expect(parsed.canvas?.notes[0]?.markdown).toBe("# Title");
  });

  it("refuses a note linked to an element that does not exist", () => {
    const workflow = withCondition({
      canvas: {
        nodes: {},
        notes: [{ id: "note-1", x: 1, y: 2, width: 255, height: 180, markdown: "", link: { kind: "step", id: "missing" } }],
        containers: [],
      },
    });
    expect(issues(workflow)).toContain("canvas.notes.0.link.id");
  });
});
