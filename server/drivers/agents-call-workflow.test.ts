import { describe, expect, it } from "vitest";

import { callTool, type ToolCallContext } from "./agents-call.ts";

type Reply = { ok: boolean; status: number; body: Record<string, unknown> };

function context(reply: Reply | ((path: string, init?: RequestInit) => Reply), overrides: Partial<ToolCallContext> = {}): ToolCallContext {
  const answer = (path: string, init?: RequestInit) => typeof reply === "function" ? reply(path, init) : reply;
  return {
    botId: "bot-a",
    threadId: "t-1",
    depth: 0,
    externalRuntime: false,
    sharedComputers: false,
    client: {
      api: async (path, init) => answer(path, init).body,
      apiResponse: async (path, init) => answer(path, init),
    },
    ...overrides,
  };
}

const run = {
  id: "20261103-123456-abcdef",
  workflowId: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
  workflowVersion: 1,
  department: "Financeiro",
  status: "running",
  currentStep: 1,
  steps: [
    { id: "coletar", status: "succeeded", verified: ["numbers.csv"] },
    { id: "revisar", status: "running" },
  ],
  createdAt: 1,
  updatedAt: 2,
};

describe("list_workflows", () => {
  it("lists the Workflows the bot can start", async () => {
    const result = await callTool("list_workflows", {}, context({ ok: true, status: 200, body: { workflows: [{ id: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d", name: "Contrato mensal", version: 2, steps: [{}, {}] }] } }));
    expect(result.isError).toBeFalsy();
    expect(result.text).toContain("Contrato mensal");
    expect(result.text).toContain("version 2");
    expect(result.text).toContain("2 steps");
    expect(result.text).toContain("run_workflow");
  });

  it("says so when the department has no Workflow", async () => {
    const result = await callTool("list_workflows", {}, context({ ok: true, status: 200, body: { workflows: [] } }));
    expect(result.text).toContain("No Workflow in your department yet");
  });
});

describe("run_workflow", () => {
  it("posts to the internal run route and reports the run id", async () => {
    const calls: Array<{ path: string; init?: RequestInit }> = [];
    const result = await callTool("run_workflow", { workflow_id: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d" }, context((path, init) => {
      calls.push({ path, init });
      return { ok: true, status: 202, body: { run } };
    }));
    expect(calls[0]?.path).toBe("/api/internal/workflows/8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d/run");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(result.isError).toBeFalsy();
    expect(result.text).toContain("20261103-123456-abcdef");
    expect(result.text).toContain("step 1 of 2");
  });

  it("tells the model to list again when the Workflow is not there", async () => {
    const result = await callTool("run_workflow", { workflow_id: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d" }, context({ ok: false, status: 404, body: { error: "no such workflow" } }));
    expect(result.isError).toBe(true);
    expect(result.text).toContain("list_workflows");
  });

  it("needs a workflow id", async () => {
    const result = await callTool("run_workflow", {}, context({ ok: true, status: 202, body: {} }));
    expect(result.isError).toBe(true);
    expect(result.text).toContain("workflow_id");
  });
});

describe("workflow_status", () => {
  it("renders the current step, the verified files and why it stopped", async () => {
    const result = await callTool("workflow_status", { run_id: run.id }, context({ ok: true, status: 200, body: { run, workflow: { name: "Contrato mensal", version: 1 } } }));
    expect(result.isError).toBeFalsy();
    expect(result.text).toContain("Contrato mensal");
    expect(result.text).toContain("Current step: 2 of 2");
    expect(result.text).toContain("verified: numbers.csv");
    expect(result.text).toContain("still running");
  });

  it("shows the failure reason", async () => {
    const failed = { ...run, status: "failed", error: "missing required output \"numbers.csv\"" };
    const result = await callTool("workflow_status", { run_id: run.id }, context({ ok: true, status: 200, body: { run: failed } }));
    expect(result.text).toContain("missing required output");
    expect(result.text).not.toContain("still running");
  });
});

describe("cancel_workflow", () => {
  it("refuses a run another conversation started", async () => {
    const result = await callTool("cancel_workflow", { run_id: run.id }, context({ ok: false, status: 403, body: { error: "only the conversation that started this run can cancel it" } }));
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Only the conversation that started this run");
  });

  it("reports the cancellation", async () => {
    const result = await callTool("cancel_workflow", { run_id: run.id }, context({ ok: true, status: 200, body: { run: { ...run, status: "cancelled" } } }));
    expect(result.isError).toBeFalsy();
    expect(result.text).toContain(`Run ${run.id} is cancelled`);
  });
});
