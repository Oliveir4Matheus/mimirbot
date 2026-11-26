import { describe, expect, it } from "vitest";

import {
  WORKFLOW_TRIGGER_MAX,
  workflowDefinitionSaveSchema,
  workflowDefinitionSchema,
  workflowReceivesExternalParameters,
  workflowUnknownFields,
} from "./workflow.ts";

const MANUAL = [{ id: "manual", kind: "manual", name: "Manual" }];

const definition = (overrides: Record<string, unknown> = {}) => ({
  id: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
  version: 1,
  name: "Contrato mensal",
  department: "Financeiro",
  triggers: MANUAL,
  steps: [
    { id: "coletar", name: "Collect", botId: "bot-a", instructions: "Collect.", outputs: [{ path: "numbers.csv" }] },
  ],
  createdAt: 1,
  updatedAt: 2,
  ...overrides,
});

const stepWith = (parameters: unknown[], overrides: Record<string, unknown> = {}) => ({
  id: "coletar", name: "Collect", botId: "bot-a", instructions: "Collect.",
  parameters, outputs: [{ path: "numbers.json" }], ...overrides,
});

const webhook = (index = 0) => ({ id: `webhook-${index}`, kind: "webhook", name: "Pedidos pagos" });

const issuePaths = (parsed: ReturnType<typeof workflowDefinitionSaveSchema.safeParse>): string[] =>
  parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join("."));

describe("triggers in a Workflow definition", () => {
  it("reads an older file without triggers as one manual node, without touching the input", () => {
    const input = definition({ triggers: undefined });
    delete (input as Record<string, unknown>).triggers;
    const parsed = workflowDefinitionSchema.parse(input);
    expect(parsed.triggers).toEqual([{ id: "manual", kind: "manual", name: "Manual" }]);
    expect("triggers" in input).toBe(false);
  });

  it("reads an empty trigger list as the manual node", () => {
    expect(workflowDefinitionSchema.parse(definition({ triggers: [] })).triggers).toEqual([
      { id: "manual", kind: "manual", name: "Manual" },
    ]);
  });

  it("keeps the triggers a save names, in order", () => {
    const parsed = workflowDefinitionSaveSchema.parse(definition({
      triggers: [MANUAL[0]!, { id: "diaria", kind: "routine", name: "Diária", routineId: "rtn-1" }],
    }));
    expect(parsed.triggers.map((trigger) => trigger.kind)).toEqual(["manual", "routine"]);
    expect(parsed.triggers[1]!.routineId).toBe("rtn-1");
  });

  it("refuses a save without triggers", () => {
    expect(issuePaths(workflowDefinitionSaveSchema.safeParse(definition({ triggers: undefined })))).toContain("triggers");
    expect(issuePaths(workflowDefinitionSaveSchema.safeParse(definition({ triggers: [] })))).toContain("triggers");
  });

  it("refuses duplicate trigger ids", () => {
    const parsed = workflowDefinitionSaveSchema.safeParse(definition({
      triggers: [MANUAL[0]!, { id: "manual", kind: "routine", name: "Diária" }],
    }));
    expect(issuePaths(parsed)).toContain("triggers.1.id");
  });

  it("refuses a trigger kind outside the contract", () => {
    const parsed = workflowDefinitionSaveSchema.safeParse(definition({
      triggers: [{ id: "web", kind: "email", name: "Mail" }],
    }));
    expect(issuePaths(parsed)).toContain("triggers.0.kind");
    expect(workflowDefinitionSchema.safeParse(definition({ triggers: [{ id: "web", kind: "email", name: "Mail" }] })).success).toBe(false);
  });

  it("refuses more triggers than the track holds", () => {
    const triggers = Array.from({ length: WORKFLOW_TRIGGER_MAX + 1 }, (_, index) => ({ id: `t-${index}`, kind: "manual", name: `T${index}` }));
    expect(issuePaths(workflowDefinitionSaveSchema.safeParse(definition({ triggers })))).toContain("triggers");
  });

  it("refuses a webhook when the Workflow receives no external parameter", () => {
    const parsed = workflowDefinitionSaveSchema.safeParse(definition({ triggers: [...MANUAL, webhook()] }));
    expect(issuePaths(parsed)).toContain("triggers.1");
  });

  it("accepts a webhook when a parameter comes from the start of the run", () => {
    const parsed = workflowDefinitionSaveSchema.safeParse(definition({
      triggers: [...MANUAL, webhook()],
      steps: [stepWith([{ name: "link", type: "string" }])],
    }));
    expect(parsed.success).toBe(true);
  });

  it("accepts a webhook when a manual step collects the parameter", () => {
    const parsed = workflowDefinitionSaveSchema.safeParse(definition({
      triggers: [...MANUAL, webhook()],
      steps: [stepWith([{ name: "link", type: "string", collectedBy: "coletar" }], { mode: "manual" })],
    }));
    expect(parsed.success).toBe(true);
  });

  it("does not count a parameter that comes from an earlier step", () => {
    const parsed = workflowDefinitionSaveSchema.safeParse(definition({
      triggers: [...MANUAL, webhook()],
      steps: [
        { id: "preparar", name: "Prepare", botId: "bot-a", instructions: "Prepare.", outputs: [{ path: "dados.json" }] },
        stepWith([{ name: "link", type: "string", from: { step: "preparar", output: "dados.json", field: "total" } }]),
      ],
    }));
    expect(issuePaths(parsed)).toContain("triggers.1");
    expect(workflowReceivesExternalParameters(workflowDefinitionSchema.parse(definition({
      steps: [
        { id: "preparar", name: "Prepare", botId: "bot-a", instructions: "Prepare.", outputs: [{ path: "dados.json" }] },
        stepWith([{ name: "link", type: "string", from: { step: "preparar", output: "dados.json", field: "total" } }]),
      ],
    })))).toBe(false);
  });

  it("refuses a field the trigger contract does not name", () => {
    const issues = workflowUnknownFields(definition({
      triggers: [{ ...MANUAL[0]!, secret: "nope" }],
    }));
    expect(issues.map((issue) => issue.path)).toContain("triggers.0.secret");
  });
});
