import { describe, expect, it } from "vitest";

import { workflowDefinitionSchema, type BotWorkflowStep, type WorkflowStep } from "../../shared/workflow.ts";
import { bodyNextStepIndex, failureStepIndex, nextStepIndex } from "./flow.ts";

const steps = (): WorkflowStep[] => workflowDefinitionSchema.parse({
  id: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
  version: 1,
  name: "Contrato mensal",
  department: "Financeiro",
  steps: [
    { id: "coletar", name: "Collect", botId: "bot-a", instructions: "Collect.", outputs: [{ path: "numbers.csv" }] },
    {
      id: "validar",
      kind: "script",
      name: "Validate",
      run: "validar.mjs",
      outputs: [{ path: "result.json" }],
      onFailure: "corrigir",
      onTimeout: "fechar",
    },
    { id: "corrigir", name: "Fix", botId: "bot-b", instructions: "Fix.", outputs: [{ path: "result.json" }], onSuccess: "fechar" },
    { id: "fechar", name: "Close", botId: "bot-b", instructions: "Close.", outputs: [{ path: "result.json" }] },
  ],
  createdAt: 1,
  updatedAt: 1,
}).steps;

describe("nextStepIndex", () => {
  it("follows the following step in array order when no edge is declared", () => {
    expect(nextStepIndex(steps(), 0)).toBe(1);
    expect(nextStepIndex(steps(), 3)).toBeNull();
  });

  it("follows onSuccess before the following step", () => {
    expect(nextStepIndex(steps(), 1)).toBe(2);
    expect(nextStepIndex(steps(), 2)).toBe(3);
  });

  it("ends the flow when onSuccess is null, even with a step after it", () => {
    const list = steps();
    (list[2] as BotWorkflowStep).onSuccess = null;
    expect(nextStepIndex(list, 2)).toBeNull();
  });

  it("ends the run after a condition, which picks its own route", () => {
    const list = steps();
    list.splice(1, 1, { id: "checar", kind: "condition", name: "Check", from: { step: "coletar", output: "numbers.csv" }, match: "all", conditions: [{ field: "ok", op: "equals", value: true }] });
    expect(nextStepIndex(list, 1)).toBeNull();
  });
});

describe("bodyNextStepIndex", () => {
  it("follows a condition's branch inside a Do While", () => {
    const body = workflowDefinitionSchema.parse({
      id: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
      version: 1,
      name: "Contrato mensal",
      department: "Financeiro",
      steps: [{
        id: "laco",
        kind: "loop",
        name: "Loop",
        body: [
          { id: "atualiza", name: "Update", botId: "bot-a", instructions: "Update.", outputs: [{ path: "result.json" }] },
          { id: "checar", kind: "condition", name: "Check", from: { step: "atualiza", output: "result.json" }, conditions: [{ field: "ok", op: "equals", value: true }], whenTrue: "fim" },
          { id: "fim", name: "End", botId: "bot-a", instructions: "End.", outputs: [{ path: "done.txt" }] },
        ],
        from: { step: "atualiza", output: "result.json" },
        conditions: [{ field: "ok", op: "equals", value: true }],
        maxIterations: 2,
        outputs: [{ path: "result.json" }],
      }],
      createdAt: 1,
      updatedAt: 1,
    }).steps[0];
    if (body.kind !== "loop") throw new Error("not a loop");
    expect(bodyNextStepIndex(body.body, 1, true)).toBe(2);
    expect(bodyNextStepIndex(body.body, 1, false)).toBeNull();
    expect(bodyNextStepIndex(body.body, 0)).toBe(1);
  });
});

describe("failureStepIndex", () => {
  it("returns the onFailure target, or null when the run must stop", () => {
    expect(failureStepIndex(steps(), 1)).toBe(2);
    expect(failureStepIndex(steps(), 0)).toBeNull();
  });

  it("prefers onTimeout for a timeout and falls back to onFailure", () => {
    expect(failureStepIndex(steps(), 1, "timeout")).toBe(3);
    const list = steps();
    (list[1] as { onTimeout?: string }).onTimeout = undefined;
    expect(failureStepIndex(list, 1, "timeout")).toBe(2);
  });
});
