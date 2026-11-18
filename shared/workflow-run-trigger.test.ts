import { describe, expect, it } from "vitest";

import { workflowRunSchema } from "./workflow.ts";

const RUN = {
  id: "run-1",
  workflowId: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
  workflowVersion: 1,
  department: "Financeiro",
  status: "queued",
  currentStep: 0,
  steps: [{ id: "receber", status: "pending" }],
  createdAt: 1,
  updatedAt: 1,
};

describe("run.json trigger origin", () => {
  it("reads the routine origin written by older runs", () => {
    const parsed = workflowRunSchema.parse({ ...RUN, triggeredBy: { routineId: "routine-1", routineName: "Diário" } });
    expect(parsed.triggeredBy).toEqual({ routineId: "routine-1", routineName: "Diário" });
  });

  it("reads the webhook origin with its delivery id", () => {
    const parsed = workflowRunSchema.parse({
      ...RUN,
      triggeredBy: { triggerId: "trigger-1", triggerName: "Pedidos pagos", deliveryId: "evt-1" },
    });
    expect(parsed.triggeredBy).toEqual({ triggerId: "trigger-1", triggerName: "Pedidos pagos", deliveryId: "evt-1" });
  });

  it("refuses an origin that names neither a routine nor a trigger", () => {
    expect(workflowRunSchema.safeParse({ ...RUN, triggeredBy: { triggerId: "trigger-1", triggerName: "Pedidos" } }).success).toBe(false);
    expect(workflowRunSchema.safeParse({ ...RUN, triggeredBy: { triggerId: "trigger-1", triggerName: "Pedidos", deliveryId: "" } }).success).toBe(false);
  });
});
