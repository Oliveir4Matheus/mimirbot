import { describe, expect, it } from "vitest";

import { workflowDefinitionSchema, type WorkflowStep } from "../../shared/workflow.ts";
import { failureStepIndex, nextStepIndex } from "./flow.ts";

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
      result: "result.json",
      when: [
        { field: "ok", equals: true, next: "fechar" },
        { field: "check.total", equals: 0, next: "corrigir" },
      ],
      onFailure: "corrigir",
    },
    { id: "corrigir", name: "Fix", botId: "bot-b", instructions: "Fix.", outputs: [{ path: "result.json" }], next: "validar" },
    { id: "fechar", name: "Close", botId: "bot-b", instructions: "Close.", outputs: [{ path: "result.json" }], result: "result.json" },
  ],
  createdAt: 1,
  updatedAt: 1,
}).steps;

describe("nextStepIndex", () => {
  it("takes the first when branch that matches, including a dotted field", () => {
    expect(nextStepIndex(steps(), 1, { ok: true })).toBe(3);
    expect(nextStepIndex(steps(), 1, { ok: false, check: { total: 0 } })).toBe(2);
  });

  it("falls back to next, then to the following step, then to the end", () => {
    expect(nextStepIndex(steps(), 1, { ok: false, check: { total: 5 } })).toBe(2);
    expect(nextStepIndex(steps(), 0, {})).toBe(1);
    expect(nextStepIndex(steps(), 3, {})).toBeNull();
  });

  it("treats a missing field as no match", () => {
    expect(nextStepIndex(steps(), 1, null)).toBe(2);
  });
});

describe("failureStepIndex", () => {
  it("returns the onFailure target, or null when the run must stop", () => {
    expect(failureStepIndex(steps(), 1)).toBe(2);
    expect(failureStepIndex(steps(), 0)).toBeNull();
  });
});
