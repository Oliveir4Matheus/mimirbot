import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { WORKFLOWS_ROOT_ENV } from "./workflows/paths.ts";
import { createWorkflowStore, type WorkflowStore } from "./workflows/store.ts";
import type { WorkflowEngine, WorkflowStartOptions } from "./workflows/engine.ts";
import { WorkflowTriggerManager, WorkflowTriggerRefusal } from "./workflow-triggers.ts";
import type { WorkflowDefinition } from "../shared/workflow.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "omb-workflow-trigger-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const PARAMETERS = [
  { name: "customer_id", type: "string" },
  { name: "amount", type: "number" },
  { name: "sent_at", type: "date", required: false, whenAbsent: "rule:sem_data" },
];

const INPUTS = {
  customer_id: { source: "payload", pointer: "/data/customer/id" },
  amount: { source: "payload", pointer: "/data/amount" },
  sent_at: { source: "header", name: "x-sent-at", onMissing: "omit" },
};

const PAYLOAD = { data: { customer: { id: "cus_42" }, amount: 18.5 } };
const HEADERS = { "x-sent-at": "2026-11-17" };

interface Harness {
  store: WorkflowStore;
  manager: WorkflowTriggerManager;
  definition: WorkflowDefinition;
  file: string;
  engine: WorkflowEngine;
}

function harness(file = join(root, "workflow-triggers.json"), env?: NodeJS.ProcessEnv): Harness {
  const store = createWorkflowStore({
    dataDir: join(root, "data"),
    env: { [WORKFLOWS_ROOT_ENV]: join(root, "runs") },
    now: () => 1_000,
    log: () => {},
  });
  const saved = store.saveWorkflow({
    id: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
    version: 1,
    name: "Pedidos",
    department: "Financeiro",
    triggers: [{ id: "webhook", kind: "webhook", name: "Pedidos pagos" }],
    steps: [
      {
        id: "receber", name: "Receive", botId: "bot-a", instructions: "Receive.",
        parameters: PARAMETERS, outputs: [{ path: "data.json" }],
      },
      {
        id: "aprovar", name: "Approve", botId: "bot-a", mode: "manual", instructions: "Approve.",
        parameters: [{ name: "approved_by", type: "string", collectedBy: "aprovar" }], outputs: [{ path: "ok.json" }],
      },
    ],
    createdAt: 1,
    updatedAt: 2,
  });
  if (!saved.ok) throw new Error(saved.error);
  const engine = {
    start(workflowId: string, options: WorkflowStartOptions = {}) {
      const definition = store.workflow(workflowId, options.version);
      if (!definition) return { ok: false as const, error: "no such workflow" };
      const run = store.createRun(definition, {
        ...(options.inputs === undefined ? {} : { inputs: options.inputs }),
        ...(options.triggeredBy === undefined ? {} : { triggeredBy: options.triggeredBy }),
        ...(options.requestId === undefined ? {} : { requestId: options.requestId }),
      });
      return { ok: true as const, run };
    },
  } as unknown as WorkflowEngine;
  const manager = new WorkflowTriggerManager({
    file,
    store,
    engine,
    bot: (id) => id === "bot-a" ? { id } : undefined,
    baseUrl: () => "https://hooks.example.test",
    now: () => 1_000,
    log: () => {},
    ...(env === undefined ? {} : { env }),
  });
  return { store, manager, definition: saved.workflow, file, engine };
}

function create(manager: WorkflowTriggerManager, inputs: Record<string, unknown> = INPUTS) {
  return manager.create("8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d", {
    name: "Pedidos pagos",
    workflowVersion: 1,
    inputs,
    eventTypes: ["order.paid"],
    nodeId: "webhook",
  });
}

function delivery(overrides: Record<string, unknown> = {}) {
  return {
    payload: PAYLOAD,
    eventName: "order.paid",
    deliveryId: "evt-1",
    headers: HEADERS,
    query: {},
    ...overrides,
  };
}

function refusal(run: () => unknown): WorkflowTriggerRefusal {
  try {
    run();
  } catch (error) {
    if (error instanceof WorkflowTriggerRefusal) return error;
    throw error;
  }
  throw new Error("expected a refusal");
}

describe("Workflow trigger configuration", () => {
  it("creates a trigger, keeps only the secret hash and returns the URL once", () => {
    const { manager, file } = harness();
    const created = create(manager);
    expect(created.trigger.endpointId).toMatch(/^wfw_[A-Za-z0-9_-]{16}$/);
    expect(created.credential.secret).toMatch(/^wfsec_/);
    expect(created.credential.url).toBe(`https://hooks.example.test/hooks/${created.trigger.endpointId}/${encodeURIComponent(created.credential.secret)}`);
    const stored = readFileSync(file, "utf8");
    expect(stored).not.toContain(created.credential.secret);
    expect((JSON.parse(stored) as { triggers: Array<{ secretHash: string }> }).triggers[0]!.secretHash).toMatch(/^[a-f0-9]{64}$/);
    expect(manager.listDepartment()).toEqual([expect.objectContaining({ id: created.trigger.id, nodeId: "webhook" })]);
    expect(Object.hasOwn(manager.listDepartment()[0]!, "inputs")).toBe(false);
  });

  it("refuses an incomplete map, an unknown key, a collected parameter and a bad constant", () => {
    const { manager } = harness();
    const missing = refusal(() => create(manager, { ...INPUTS, amount: undefined }));
    expect(missing.status).toBe(400);
    expect(missing.body.issues?.some((entry) => entry.path === "inputs.amount")).toBe(true);
    const extra = refusal(() => create(manager, { ...INPUTS, other: null }));
    expect(extra.body.issues?.some((entry) => entry.path === "inputs.other")).toBe(true);
    const collected = refusal(() => create(manager, { ...INPUTS, approved_by: null }));
    expect(collected.body.issues?.some((entry) => entry.path === "inputs.approved_by" && /collectedBy|from/.test(entry.message))).toBe(true);
    const constant = refusal(() => create(manager, { ...INPUTS, amount: { source: "constant", value: "12" } }));
    expect(constant.body.issues?.some((entry) => entry.path.startsWith("inputs.amount"))).toBe(true);
    const header = refusal(() => create(manager, { ...INPUTS, amount: { source: "header", name: "x-amount" } }));
    expect(header.body.issues?.some((entry) => entry.path === "inputs.amount")).toBe(true);
    const pointer = refusal(() => create(manager, { ...INPUTS, amount: { source: "payload", pointer: "data/amount" } }));
    expect(pointer.body.issues?.some((entry) => entry.path === "inputs.amount.pointer")).toBe(true);
    const forbidden = refusal(() => create(manager, { ...INPUTS, sent_at: { source: "header", name: "authorization" } }));
    expect(forbidden.body.issues?.some((entry) => entry.path === "inputs.sent_at.name")).toBe(true);
  });

  it("requires an existing pinned version and no parameter with an origin", () => {
    const { manager } = harness();
    expect(refusal(() => manager.create("8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d", {
      name: "Pedidos", workflowVersion: 9, inputs: INPUTS,
    })).status).toBe(404);
    const created = create(manager);
    const updated = manager.update("8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d", created.trigger.id, {
      inputs: { ...INPUTS, amount: { source: "payload", pointer: "/nope" } },
    });
    expect(updated.workflowVersion).toBe(1);
  });
});

describe("Workflow trigger delivery", () => {
  it("resolves the pointer and header, starts a run and records the trigger origin", async () => {
    const { manager, store } = harness();
    const created = create(manager);
    const result = await manager.receive(created.trigger.endpointId, created.credential.secret, delivery());
    expect(result).toMatchObject({ accepted: true, deliveryId: "evt-1", duplicate: false, runId: expect.any(String) });
    const run = store.readRun(result.runId!)!;
    expect(run.inputs).toEqual({ customer_id: "cus_42", amount: 18.5, sent_at: "2026-11-17" });
    expect(run.triggeredBy).toEqual({ triggerId: created.trigger.id, triggerName: "Pedidos pagos", deliveryId: "evt-1" });
    expect(run.requestId).toMatch(/^wfw:/);
    expect(manager.get("8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d", created.trigger.id)?.deliveryCount).toBe(1);
  });

  it("reads RFC 6901 escapes and an array index without coercion", async () => {
    const { manager } = harness();
    const created = create(manager, {
      customer_id: { source: "payload", pointer: "/a~1b/~0key" },
      amount: { source: "payload", pointer: "/items/1" },
      sent_at: null,
    });
    const result = await manager.receive(created.trigger.endpointId, created.credential.secret, delivery({
      payload: { "a/b": { "~key": "cus" }, items: [1, 2] },
    }));
    expect(result.runId).toBeDefined();
  });

  it("refuses a repeated header and a string where a number was declared", async () => {
    const { manager, store } = harness();
    const created = create(manager);
    await expect(manager.receive(created.trigger.endpointId, created.credential.secret, delivery({
      headers: { "x-sent-at": ["2026-11-17", "2026-11-18"] },
    }))).rejects.toMatchObject({ status: 422 });
    await expect(manager.receive(created.trigger.endpointId, created.credential.secret, delivery({
      deliveryId: "evt-2", payload: { data: { customer: { id: "cus" }, amount: "18.5" } },
    }))).rejects.toMatchObject({ status: 422 });
    expect(store.listRuns({ limit: Number.POSITIVE_INFINITY })).toHaveLength(0);
    const attempts = manager.listAttempts("8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d", created.trigger.id);
    expect(attempts.attempts).toHaveLength(2);
    expect(attempts.attempts.every((attempt) => attempt.outcome === "rejected" && attempt.statusCode === 422)).toBe(true);
    expect(JSON.stringify(attempts.attempts)).not.toContain("18.5");
  });

  it("answers a duplicate with the same run and starts exactly one run", async () => {
    const { manager, store } = harness();
    const created = create(manager);
    const first = await manager.receive(created.trigger.endpointId, created.credential.secret, delivery());
    const second = await manager.receive(created.trigger.endpointId, created.credential.secret, delivery());
    expect(second).toEqual({ ...first, duplicate: true });
    const results = await Promise.all(Array.from({ length: 5 }, () =>
      manager.receive(created.trigger.endpointId, created.credential.secret, delivery())));
    expect(new Set(results.map((result) => result.runId))).toEqual(new Set([first.runId]));
    expect(store.listRuns({ limit: Number.POSITIVE_INFINITY })).toHaveLength(1);
  });


  it("recovers the same run after a crash between the run and its receipt", async () => {
    const { manager, store, file, engine } = harness(undefined, { OMB_WORKFLOW_TRIGGER_FAULT: "after-start" });
    const created = create(manager);
    await expect(manager.receive(created.trigger.endpointId, created.credential.secret, delivery()))
      .rejects.toMatchObject({ status: 500 });
    const runs = store.listRuns({ limit: Number.POSITIVE_INFINITY });
    expect(runs).toHaveLength(1);
    const runId = runs[0]!.id;
    const restarted = new WorkflowTriggerManager({
      file,
      store,
      engine,
      bot: (id) => id === "bot-a" ? { id } : undefined,
      baseUrl: () => "https://hooks.example.test",
      now: () => 1_000,
      log: () => {},
      env: {},
    });
    const retry = await restarted.receive(created.trigger.endpointId, created.credential.secret, delivery());
    expect(retry).toMatchObject({ runId, duplicate: true });
    expect(store.listRuns({ limit: Number.POSITIVE_INFINITY })).toHaveLength(1);
  });

  it("rebuilds the delivery index from run.json after a restart", async () => {
    const { manager, store, engine, file } = harness();
    const created = create(manager);
    const run = store.createRun(store.workflow("8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d", 1)!, {
      triggeredBy: { triggerId: created.trigger.id, triggerName: created.trigger.name, deliveryId: "evt-boot" },
    });
    const restarted = new WorkflowTriggerManager({
      file,
      store,
      engine,
      bot: (id) => id === "bot-a" ? { id } : undefined,
      baseUrl: () => "https://hooks.example.test",
      now: () => 1_000,
      log: () => {},
    });
    const duplicate = await restarted.receive(created.trigger.endpointId, created.credential.secret, delivery({ deliveryId: "evt-boot" }));
    expect(duplicate).toMatchObject({ runId: run.id, duplicate: true });
    expect(store.listRuns({ limit: Number.POSITIVE_INFINITY })).toHaveLength(1);
  });

  it("ignores an event outside eventTypes and refuses a full pending quota", async () => {
    const { manager } = harness();
    const created = create(manager);
    const ignored = await manager.receive(created.trigger.endpointId, created.credential.secret, delivery({ eventName: "order.refunded" }));
    expect(ignored).toMatchObject({ ignored: true, duplicate: false });
    manager.update("8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d", created.trigger.id, { maxPendingRuns: 1, eventTypes: [] });
    await manager.receive(created.trigger.endpointId, created.credential.secret, delivery({ deliveryId: "evt-3", eventName: "other" }));
    await expect(manager.receive(created.trigger.endpointId, created.credential.secret, delivery({ deliveryId: "evt-4", eventName: "other" })))
      .rejects.toMatchObject({ status: 429 });
  });

  it("limits deliveries per endpoint and authenticates before anything else", async () => {
    const { manager } = harness();
    const created = create(manager);
    manager.update("8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d", created.trigger.id, { maxPendingRuns: 50 });
    await expect(manager.receive(created.trigger.endpointId, "wrong", delivery())).rejects.toMatchObject({ status: 401 });
    for (let index = 0; index < 10; index += 1) {
      await manager.receive(created.trigger.endpointId, created.credential.secret, delivery({ deliveryId: `evt-rate-${index}` }));
    }
    await expect(manager.receive(created.trigger.endpointId, created.credential.secret, delivery({ deliveryId: "evt-rate-10" })))
      .rejects.toMatchObject({ status: 429 });
  });


  it("collapses a run of wrong secrets into one rolling burst record", () => {
    const { manager } = harness();
    const created = create(manager);
    manager.recordUnauthorized(created.trigger.endpointId, { deliveryId: "probe-1" });
    manager.recordUnauthorized(created.trigger.endpointId, { deliveryId: "probe-2" });
    const attempts = manager.listAttempts("8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d", created.trigger.id).attempts;
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ outcome: "rejected", statusCode: 401 });
    expect(attempts[0]!.reason).toContain("(2 requests)");
  });

  it("previews without a run or an attempt and rotates only the current secret", async () => {
    const { manager, store } = harness();
    const created = create(manager);
    const preview = manager.preview("8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d", created.trigger.id, {
      payload: PAYLOAD, headers: HEADERS, query: {},
    });
    expect(preview.resolvedInputs).toEqual({ customer_id: "cus_42", amount: 18.5, sent_at: "2026-11-17" });
    expect(store.listRuns({ limit: Number.POSITIVE_INFINITY })).toHaveLength(0);
    expect(manager.listAttempts("8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d", created.trigger.id).attempts).toHaveLength(0);
    const rotated = manager.rotateSecret("8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d", created.trigger.id);
    expect(manager.authorize(created.trigger.endpointId, created.credential.secret)).toBe(false);
    expect(manager.authorize(created.trigger.endpointId, rotated.credential.secret)).toBe(true);
  });

  it("moves a deleted trigger to the trash and restores it with a new credential", async () => {
    const { manager } = harness();
    const created = create(manager);
    expect(manager.remove("8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d", created.trigger.id)).toMatchObject({ deleted: true });
    expect(manager.authorize(created.trigger.endpointId, created.credential.secret)).toBe(false);
    const restored = manager.restore("8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d", created.trigger.id);
    expect(restored.trigger.credentialResetAt).toBe(1_000);
    expect(restored.credential.secret).not.toBe(created.credential.secret);
    expect(manager.authorize(restored.trigger.endpointId, restored.credential.secret)).toBe(true);
    expect(manager.authorize(created.trigger.endpointId, created.credential.secret)).toBe(false);
  });
});
