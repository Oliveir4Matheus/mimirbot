import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { requiredScope } from "../request-auth.ts";
import type { WorkflowEngine, WorkflowStartOptions } from "../workflows/engine.ts";
import { WORKFLOWS_ROOT_ENV } from "../workflows/paths.ts";
import { createWorkflowStore, type WorkflowStore } from "../workflows/store.ts";
import { WorkflowTriggerManager } from "../workflow-triggers.ts";
import { createWorkflowRoutes } from "./workflows.ts";
import { createWorkflowTriggerRoutes } from "./workflow-triggers.ts";
import { dispatchRoutes, type RouteContext } from "./table.ts";

const NOW = 1_000;
const WORKFLOW = "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d";
const INPUTS = {
  customer_id: { source: "payload", pointer: "/data/customer/id" },
  amount: { source: "payload", pointer: "/data/amount" },
  sent_at: { source: "header", name: "x-sent-at", onMissing: "omit" },
};

let root: string;
let store: WorkflowStore;
let engine: WorkflowEngine;
let manager: WorkflowTriggerManager;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "omb-workflow-trigger-routes-"));
  store = createWorkflowStore({
    dataDir: join(root, "data"),
    env: { [WORKFLOWS_ROOT_ENV]: join(root, "runs") },
    now: () => NOW,
    log: () => {},
  });
  const saved = store.saveWorkflow({
    id: WORKFLOW,
    version: 1,
    name: "Pedidos",
    department: "Financeiro",
    triggers: [{ id: "webhook", kind: "webhook", name: "Pedidos pagos" }],
    steps: [{
      id: "receber", name: "Receive", botId: "bot-a", instructions: "Receive.",
      parameters: [
        { name: "customer_id", type: "string" },
        { name: "amount", type: "number" },
        { name: "sent_at", type: "date", required: false, whenAbsent: "rule:sem_data" },
      ],
      outputs: [{ path: "data.json" }],
    }],
    createdAt: 1,
    updatedAt: 2,
  });
  if (!saved.ok) throw new Error(saved.error);
  engine = {
    start(workflowId: string, options: WorkflowStartOptions = {}) {
      const definition = store.workflow(workflowId, options.version);
      if (!definition) return { ok: false as const, error: "no such workflow" };
      return {
        ok: true as const,
        run: store.createRun(definition, {
          ...(options.inputs === undefined ? {} : { inputs: options.inputs }),
          ...(options.triggeredBy === undefined ? {} : { triggeredBy: options.triggeredBy }),
        }),
      };
    },
  } as unknown as WorkflowEngine;
  manager = new WorkflowTriggerManager({
    file: join(root, "workflow-triggers.json"),
    store,
    engine,
    bot: (id) => id === "bot-a" ? { id } : undefined,
    baseUrl: () => "https://hooks.example.test",
    now: () => NOW,
    log: () => {},
  });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function harness() {
  const routes = createWorkflowRoutes({
    store,
    engine,
    bot: (id) => id === "bot-a" ? { id, name: "A", section: "Financeiro" } : undefined,
    triggers: () => manager,
  });
  const department = createWorkflowTriggerRoutes({ triggers: manager });
  const state = { status: 0, body: undefined as unknown };
  const res = { headersSent: false, writableEnded: false };
  const json = ((_res: ServerResponse, status: number, body: unknown) => {
    state.status = status;
    state.body = body;
    res.writableEnded = true;
  }) as unknown as RouteContext["json"];
  const call = async (method: string, path: string, body?: unknown, query?: Record<string, string>) => {
    state.status = 0;
    state.body = undefined;
    res.writableEnded = false;
    const url = new URL(`http://127.0.0.1${path}`);
    for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, value);
    const answered = await dispatchRoutes([routes, department], {
      req: {} as IncomingMessage,
      res: res as unknown as ServerResponse,
      url,
      path,
      method,
      auth: {} as RouteContext["auth"],
      json,
      readBody: (async () => body) as unknown as RouteContext["readBody"],
    });
    if (!answered) state.status = 404;
    return state;
  };
  return { call };
}

function createBody(overrides: Record<string, unknown> = {}) {
  return { name: "Pedidos pagos", workflowVersion: 1, inputs: INPUTS, eventTypes: ["order.paid"], nodeId: "webhook", ...overrides };
}

async function created(call: ReturnType<typeof harness>["call"]) {
  const answer = await call("POST", `/api/workflows/${WORKFLOW}/triggers`, createBody());
  if (answer.status !== 201) throw new Error(JSON.stringify(answer.body));
  return answer.body as { trigger: { id: string; endpointId: string; workflowVersion: number }; credential: { secret: string; url: string } };
}

describe("Workflow trigger routes", () => {
  it("creates, lists, reads, patches and deletes a trigger", async () => {
    const { call } = harness();
    const createdAnswer = await created(call);
    expect(createdAnswer.credential.url).toContain(createdAnswer.trigger.endpointId);
    const list = await call("GET", `/api/workflows/${WORKFLOW}/triggers`);
    expect(list.status).toBe(200);
    expect(list.body).toEqual({ triggers: [expect.objectContaining({ id: createdAnswer.trigger.id, nodeId: "webhook" })] });
    expect(JSON.stringify(list.body)).not.toContain(createdAnswer.credential.secret);
    const detail = await call("GET", `/api/workflows/${WORKFLOW}/triggers/${createdAnswer.trigger.id}`);
    expect(detail.status).toBe(200);
    expect(JSON.stringify(detail.body)).not.toContain("secretHash");
    const patched = await call("PATCH", `/api/workflows/${WORKFLOW}/triggers/${createdAnswer.trigger.id}`, { name: "Pagos", maxPendingRuns: null });
    expect(patched.status).toBe(200);
    expect(patched.body).toEqual({ trigger: expect.objectContaining({ name: "Pagos" }) });
    const removed = await call("DELETE", `/api/workflows/${WORKFLOW}/triggers/${createdAnswer.trigger.id}`);
    expect(removed.status).toBe(200);
    expect(removed.body).toMatchObject({ deleted: true, undoUntil: expect.any(Number) });
    const restored = await call("POST", `/api/workflows/${WORKFLOW}/triggers/${createdAnswer.trigger.id}/restore`, {});
    expect(restored.status).toBe(200);
    expect((restored.body as { credential: { secret: string } }).credential.secret).not.toBe(createdAnswer.credential.secret);
  });

  it("answers a bad map, unknown fields, missing Workflows and missing triggers", async () => {
    const { call } = harness();
    const badMap = await call("POST", `/api/workflows/${WORKFLOW}/triggers`, createBody({ inputs: { ...INPUTS, amount: undefined } }));
    expect(badMap.status).toBe(400);
    expect((badMap.body as { issues: Array<{ path: string }> }).issues.some((entry) => entry.path === "inputs.amount")).toBe(true);
    const unknown = await call("POST", `/api/workflows/${WORKFLOW}/triggers`, createBody({ prompt: "hi" }));
    expect(unknown.status).toBe(400);
    const noWorkflow = await call("GET", "/api/workflows/00000000-0000-4000-8000-000000000000/triggers");
    expect(noWorkflow.status).toBe(404);
    const noTrigger = await call("GET", `/api/workflows/${WORKFLOW}/triggers/00000000-0000-4000-8000-000000000000`);
    expect(noTrigger.status).toBe(404);
  });

  it("refuses a second runtime for the same Studio node", async () => {
    const { call } = harness();
    await created(call);
    const second = await call("POST", `/api/workflows/${WORKFLOW}/triggers`, createBody({ name: "Outro" }));
    expect(second.status).toBe(409);
  });

  it("previews without a run or an attempt, and answers a bad value with 422", async () => {
    const { call } = harness();
    const trigger = await created(call);
    const preview = await call("POST", `/api/workflows/${WORKFLOW}/triggers/${trigger.trigger.id}/preview`, {
      payload: { data: { customer: { id: "cus_42" }, amount: 18.5 } },
      headers: { "x-sent-at": "2026-11-17" },
      query: {},
    });
    expect(preview.status).toBe(200);
    expect(preview.body).toEqual({ preview: { workflowVersion: 1, resolvedInputs: { customer_id: "cus_42", amount: 18.5, sent_at: "2026-11-17" }, omitted: [] } });
    const invalid = await call("POST", `/api/workflows/${WORKFLOW}/triggers/${trigger.trigger.id}/preview`, {
      payload: { data: { customer: { id: "cus_42" }, amount: "18.5" } },
    });
    expect(invalid.status).toBe(422);
    expect((invalid.body as { issues: Array<{ path: string }> }).issues.some((entry) => entry.path === "inputs.amount")).toBe(true);
    expect(store.listRuns({ limit: Number.POSITIVE_INFINITY })).toHaveLength(0);
    expect(manager.listAttempts(WORKFLOW, trigger.trigger.id).attempts).toHaveLength(0);
  });

  it("rotates the secret and keeps it out of every read", async () => {
    const { call } = harness();
    const trigger = await created(call);
    const rotated = await call("POST", `/api/workflows/${WORKFLOW}/triggers/${trigger.trigger.id}/rotate-secret`, {});
    expect(rotated.status).toBe(200);
    const nextSecret = (rotated.body as { credential: { secret: string } }).credential.secret;
    expect(nextSecret).not.toBe(trigger.credential.secret);
    expect(manager.authorize(trigger.trigger.endpointId, trigger.credential.secret)).toBe(false);
    expect(manager.authorize(trigger.trigger.endpointId, nextSecret)).toBe(true);
    const detail = await call("GET", `/api/workflows/${WORKFLOW}/triggers/${trigger.trigger.id}`);
    expect(JSON.stringify(detail.body)).not.toContain(nextSecret);
  });

  it("lists attempts as metadata after a refused delivery", async () => {
    const { call } = harness();
    const trigger = await created(call);
    await expect(manager.receive(trigger.trigger.endpointId, trigger.credential.secret, {
      payload: { data: { customer: { id: "cus" }, amount: "18.5" } },
      eventName: "order.paid",
      deliveryId: "evt-422",
      headers: {},
      query: {},
    })).rejects.toMatchObject({ status: 422 });
    const attempts = await call("GET", `/api/workflows/${WORKFLOW}/triggers/${trigger.trigger.id}/attempts`, undefined, { limit: "10" });
    expect(attempts.status).toBe(200);
    expect(attempts.body).toEqual({
      attempts: [expect.objectContaining({ deliveryId: "evt-422", outcome: "rejected", statusCode: 422, eventName: "order.paid" })],
      truncated: false,
    });
    expect(JSON.stringify(attempts.body)).not.toContain("18.5");
  });

  it("refuses to delete a Workflow with triggers, then removes both with withTriggers", async () => {
    const { call } = harness();
    const trigger = await created(call);
    const refused = await call("DELETE", `/api/workflows/${WORKFLOW}`);
    expect(refused.status).toBe(409);
    expect(store.workflow(WORKFLOW)).toBeDefined();
    const deleted = await call("DELETE", `/api/workflows/${WORKFLOW}`, undefined, { withTriggers: "true" });
    expect(deleted.status).toBe(200);
    expect(store.workflow(WORKFLOW)).toBeUndefined();
    expect(manager.list(WORKFLOW)).toHaveLength(0);
    expect(manager.listDeleted(WORKFLOW)).toEqual([expect.objectContaining({ trigger: expect.objectContaining({ id: trigger.trigger.id }) })]);
  });


  it("refuses to change a Workflow's department while it has triggers", async () => {
    const { call } = harness();
    await created(call);
    const definition = store.workflow(WORKFLOW)!;
    const answer = await call("PUT", `/api/workflows/${WORKFLOW}`, { ...definition, department: "Outro" });
    expect(answer.status).toBe(409);
    expect(store.workflow(WORKFLOW)?.department).toBe("Financeiro");
  });

  it("serves the department list without credentials, constants or inputs", async () => {
    const { call } = harness();
    await created(call);
    const list = await call("GET", "/api/workflow-triggers");
    expect(list.status).toBe(200);
    const triggers = (list.body as { triggers: Array<Record<string, unknown>> }).triggers;
    expect(triggers).toHaveLength(1);
    expect(triggers[0]).not.toHaveProperty("inputs");
    expect(triggers[0]).not.toHaveProperty("secretHash");
    expect(JSON.stringify(list.body)).not.toContain("customer_id");
    const refused = await call("POST", "/api/workflow-triggers", {});
    expect(refused.status).toBe(405);
  });

  it("keeps every administrative route out of a client session", () => {
    expect(requiredScope("GET", `/api/workflows/${WORKFLOW}/triggers`)).toBe("admin");
    expect(requiredScope("POST", `/api/workflows/${WORKFLOW}/triggers`)).toBe("admin");
    expect(requiredScope("PATCH", `/api/workflows/${WORKFLOW}/triggers/x`)).toBe("admin");
    expect(requiredScope("GET", "/api/workflow-triggers")).toBe("admin");
    expect(requiredScope("POST", "/hooks/wfw_aaaaaaaaaaaaaaaa/secret")).toBe("admin");
  });
});
