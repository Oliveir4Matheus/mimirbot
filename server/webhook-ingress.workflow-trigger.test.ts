import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { WorkflowEngine, WorkflowStartOptions } from "./workflows/engine.ts";
import { WORKFLOWS_ROOT_ENV } from "./workflows/paths.ts";
import { createWorkflowStore, type WorkflowStore } from "./workflows/store.ts";
import { WorkflowTriggerManager } from "./workflow-triggers.ts";
import { listenWebhookIngress, type WebhookIngress } from "./webhook-ingress.ts";
import type { WebhookManager } from "./webhooks.ts";

const WORKFLOW = "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d";
const INPUTS = {
  customer_id: { source: "payload", pointer: "/data/customer/id" },
  amount: { source: "payload", pointer: "/data/amount" },
  sent_at: { source: "header", name: "x-sent-at", onMissing: "omit" },
};
const PAYLOAD = { data: { customer: { id: "cus_42" }, amount: 18.5 } };

let root: string;
let store: WorkflowStore;
let manager: WorkflowTriggerManager;
let engine: WorkflowEngine;
let ingress: WebhookIngress;
let endpointId: string;
let secret: string;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "omb-workflow-trigger-ingress-"));
  store = createWorkflowStore({
    dataDir: join(root, "data"),
    env: { [WORKFLOWS_ROOT_ENV]: join(root, "runs") },
    now: () => 1_000,
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
          ...(options.requestId === undefined ? {} : { requestId: options.requestId }),
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
    now: () => 1_000,
    log: () => {},
  });
  const created = manager.create(WORKFLOW, { name: "Pedidos pagos", workflowVersion: 1, inputs: INPUTS, eventTypes: ["order.paid"], nodeId: "webhook" });
  endpointId = created.trigger.endpointId;
  secret = created.credential.secret;
  ingress = await listenWebhookIngress({} as WebhookManager, { port: 0, workflowTriggers: manager });
});

afterEach(async () => {
  await new Promise<void>((done) => ingress.server.close(() => done()));
  rmSync(root, { recursive: true, force: true });
});

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${ingress.baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("the Workflow webhook ingress", () => {
  it("starts a run, then answers the same delivery with the same run", async () => {
    const first = await post(`/hooks/${endpointId}/${encodeURIComponent(secret)}`, PAYLOAD, {
      "Idempotency-Key": "evt-1",
      "x-sent-at": "2026-11-17",
      "x-github-event": "order.paid",
    });
    expect(first.status).toBe(202);
    const accepted = await first.json() as { accepted: boolean; runId: string; deliveryId: string; duplicate: boolean };
    expect(accepted).toMatchObject({ accepted: true, deliveryId: "evt-1", duplicate: false });
    const run = store.readRun(accepted.runId)!;
    expect(run.inputs).toEqual({ customer_id: "cus_42", amount: 18.5, sent_at: "2026-11-17" });
    expect(run.triggeredBy).toEqual({ triggerId: expect.any(String), triggerName: "Pedidos pagos", deliveryId: "evt-1" });

    const retry = await post(`/hooks/${endpointId}/${encodeURIComponent(secret)}`, PAYLOAD, {
      "Idempotency-Key": "evt-1",
      "x-sent-at": "2026-11-17",
      "x-github-event": "order.paid",
    });
    expect(retry.status).toBe(202);
    expect(await retry.json()).toMatchObject({ runId: accepted.runId, duplicate: true });
    expect(store.listRuns({ limit: Number.POSITIVE_INFINITY })).toHaveLength(1);
  });

  it("answers a wrong secret and an unknown endpoint with the same 401", async () => {
    const wrong = await post(`/hooks/${endpointId}/wrong`, PAYLOAD);
    expect(wrong.status).toBe(401);
    const unknown = await post("/hooks/wfw_aaaaaaaaaaaaaaaa/secret", PAYLOAD);
    expect(unknown.status).toBe(401);
    const bearer = await post(`/hooks/${endpointId}`, PAYLOAD, { authorization: `Bearer ${secret}` });
    expect(bearer.status).toBe(202);
  });

  it("returns 422 without a run when a value cannot be resolved", async () => {
    const response = await post(`/hooks/${endpointId}/${encodeURIComponent(secret)}`, {
      data: { customer: { id: "cus_42" }, amount: "18.5" },
    }, { "Idempotency-Key": "evt-422", "x-github-event": "order.paid" });
    expect(response.status).toBe(422);
    expect(store.listRuns({ limit: Number.POSITIVE_INFINITY })).toHaveLength(0);
    const trigger = manager.list(WORKFLOW)[0]!;
    expect(manager.listAttempts(WORKFLOW, trigger.id).attempts[0]).toMatchObject({ statusCode: 422, deliveryId: "evt-422" });
    expect(JSON.stringify(await response.clone().json())).not.toContain("18.5");
  });

  it("answers 413 above 256 KiB", async () => {
    const response = await post(`/hooks/${endpointId}/${encodeURIComponent(secret)}`, { data: "x".repeat(300 * 1024) });
    expect(response.status).toBe(413);
    expect(store.listRuns({ limit: Number.POSITIVE_INFINITY })).toHaveLength(0);
  });

  it("answers 409 for a paused trigger and for a missing Workflow, without a run", async () => {
    manager.update(WORKFLOW, manager.list(WORKFLOW)[0]!.id, { enabled: false });
    const paused = await post(`/hooks/${endpointId}/${encodeURIComponent(secret)}`, PAYLOAD);
    expect(paused.status).toBe(409);
    manager.update(WORKFLOW, manager.list(WORKFLOW)[0]!.id, { enabled: true });
    store.removeWorkflow(WORKFLOW);
    const missing = await post(`/hooks/${endpointId}/${encodeURIComponent(secret)}`, PAYLOAD);
    expect(missing.status).toBe(409);
    expect(store.listRuns({ limit: Number.POSITIVE_INFINITY })).toHaveLength(0);
    expect(manager.list(WORKFLOW)[0]!.pausedReason).toBe("missing-workflow");
  });

  it("starts one run for simultaneous identical deliveries", async () => {
    const responses = await Promise.all(Array.from({ length: 5 }, () => post(
      `/hooks/${endpointId}/${encodeURIComponent(secret)}`,
      PAYLOAD,
      { "Idempotency-Key": "evt-race", "x-github-event": "order.paid", "x-sent-at": "2026-11-17" },
    )));
    const bodies = await Promise.all(responses.map((response) => response.json() as Promise<{ runId: string; duplicate: boolean }>));
    expect(new Set(bodies.map((body) => body.runId)).size).toBe(1);
    expect(bodies.filter((body) => body.duplicate === false)).toHaveLength(1);
    expect(store.listRuns({ limit: Number.POSITIVE_INFINITY })).toHaveLength(1);
  });


  it("answers 429 after ten authenticated deliveries in a minute", async () => {
    manager.update(WORKFLOW, manager.list(WORKFLOW)[0]!.id, { maxPendingRuns: 50 });
    for (let index = 0; index < 10; index += 1) {
      const response = await post(`/hooks/${endpointId}/${encodeURIComponent(secret)}`, PAYLOAD, {
        "Idempotency-Key": `evt-rate-${index}`,
        "x-github-event": "order.paid",
      });
      expect(response.status).toBe(202);
    }
    const limited = await post(`/hooks/${endpointId}/${encodeURIComponent(secret)}`, PAYLOAD, {
      "Idempotency-Key": "evt-rate-10",
      "x-github-event": "order.paid",
    });
    expect(limited.status).toBe(429);
  });

  it("fails closed for wfw_ when the workflow runtime is absent", async () => {
    const down = await listenWebhookIngress({} as WebhookManager, { port: 0 });
    try {
      const response = await fetch(`${down.baseUrl}/hooks/${endpointId}/${encodeURIComponent(secret)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(PAYLOAD),
      });
      expect(response.status).toBe(401);
    } finally {
      await new Promise<void>((done) => down.server.close(() => done()));
    }
  });
});
