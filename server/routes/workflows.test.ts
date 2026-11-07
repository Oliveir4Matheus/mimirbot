import { mkdtempSync, rmSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { workflowDefinitionSchema, type WorkflowDefinition } from "../../shared/workflow.ts";
import { createWorkflowEngine } from "../workflows/engine.ts";
import { WORKFLOWS_ROOT_ENV } from "../workflows/paths.ts";
import { createWorkflowStore } from "../workflows/store.ts";
import { createWorkflowInternalRoutes, createWorkflowRoutes, type WorkflowInternalContext } from "./workflows.ts";
import { PASS, type RouteContext } from "./table.ts";

const NOW = new Date("2026-11-07T12:00:00.000Z").getTime();

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "omb-process-routes-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const definition = (overrides: Record<string, unknown> = {}): WorkflowDefinition => workflowDefinitionSchema.parse({
  id: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
  version: 1,
  name: "Contrato mensal",
  department: "Financeiro",
  steps: [{ id: "coletar", name: "Collect", botId: "bot-a", instructions: "Collect.", outputs: [{ path: "numbers.csv" }] }],
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

function harness(botSection = "Financeiro") {
  const store = createWorkflowStore({
    dataDir: join(root, "data"),
    env: { [WORKFLOWS_ROOT_ENV]: join(root, "runs") },
    now: () => NOW,
    log: () => {},
  });
  const saved = store.saveWorkflow(definition());
  if (!saved.ok) throw new Error(saved.error);
  const engine = createWorkflowEngine({
    store,
    startTurn: async () => undefined,
    createThread: () => "thread-1",
    broadcast: () => {},
    now: () => NOW,
    log: () => {},
  });
  const deps = { store, engine, bot: (id: string) => id === "bot-a" ? { id, name: "A", section: botSection } : undefined };
  const publicRoutes = createWorkflowRoutes(deps);
  const internalRoutes = createWorkflowInternalRoutes(deps);
  const state = { status: 0, body: undefined as unknown };
  const res = { headersSent: false, writableEnded: false };
  const json = ((_res: ServerResponse, status: number, body: unknown) => {
    state.status = status;
    state.body = body;
    res.writableEnded = true;
  }) as unknown as RouteContext["json"];
  const call = (method: string, path: string, body?: unknown) => {
    state.status = 0;
    state.body = undefined;
    res.writableEnded = false;
    const url = new URL(`http://127.0.0.1${path}`);
    return publicRoutes({
      req: {} as IncomingMessage, res: res as unknown as ServerResponse, url, path, method, auth: {} as RouteContext["auth"], json,
      readBody: (async () => body) as unknown as RouteContext["readBody"],
    });
  };
  const callInternal = (method: string, path: string, botId = "bot-a", threadId = "t-1", body?: unknown) => {
    state.status = 0;
    state.body = undefined;
    res.writableEnded = false;
    const ctx: WorkflowInternalContext = { method, path, res: res as unknown as ServerResponse, json, readBody: async () => body, botId, threadId };
    return internalRoutes(ctx);
  };
  return { store, engine, deps, definition: saved.workflow, state, call, callInternal };
}

describe("the person's routes", () => {
  it("lists, saves and reads a workflow", async () => {
    const { call, state, definition: def } = harness();
    await call("GET", "/api/workflows");
    expect(state.status).toBe(200);
    expect((state.body as { workflows: unknown[] }).workflows).toHaveLength(1);

    await call("POST", "/api/workflows", { ...def, name: "Novo nome" });
    expect(state.status).toBe(200);
    expect((state.body as { workflow: WorkflowDefinition }).workflow.version).toBe(2);

    await call("GET", `/api/workflows/${def.id}`);
    expect(state.status).toBe(200);
    expect((state.body as { versions: unknown[] }).versions).toHaveLength(2);
  });

  it("starts a run and shows it by id", async () => {
    const { call, state, definition: def } = harness();
    await call("POST", `/api/workflows/${def.id}/run`);
    expect(state.status).toBe(202);
    const run = (state.body as { run: { id: string } }).run;
    await call("GET", `/api/workflows/runs/${run.id}`);
    expect(state.status).toBe(200);
    expect((state.body as { run: { id: string } }).run.id).toBe(run.id);
  });

  it("refuses to delete a Workflow with an active run, then allows it after cancellation", async () => {
    const { call, state, definition: def } = harness();
    await call("POST", `/api/workflows/${def.id}/run`);
    const run = (state.body as { run: { id: string } }).run;

    await call("DELETE", `/api/workflows/${def.id}`);
    expect(state.status).toBe(409);
    expect((state.body as { runs: Array<{ id: string }> }).runs.map((entry) => entry.id)).toContain(run.id);

    await call("POST", `/api/workflows/runs/${run.id}/cancel`);
    expect(state.status).toBe(200);
    await call("DELETE", `/api/workflows/${def.id}`);
    expect(state.status).toBe(200);
    expect((state.body as { removed: boolean }).removed).toBe(true);
  });

  it("refuses to delete an active run, then deletes it after cancellation", async () => {
    const { call, state, definition: def } = harness();
    await call("POST", `/api/workflows/${def.id}/run`);
    const run = (state.body as { run: { id: string } }).run;

    await call("DELETE", `/api/workflows/runs/${run.id}`);
    expect(state.status).toBe(409);
    expect((state.body as { run: { status: string } }).run.status).toBe("running");

    await call("POST", `/api/workflows/runs/${run.id}/cancel`);
    expect(state.status).toBe(200);
    await call("DELETE", `/api/workflows/runs/${run.id}`);
    expect(state.status).toBe(200);
    expect((state.body as { removed: boolean }).removed).toBe(true);
    await call("GET", `/api/workflows/runs/${run.id}`);
    expect(state.status).toBe(404);
  });

  it("passes a path that is not its own", async () => {
    const { call } = harness();
    expect(await call("GET", "/api/bots")).toBe(PASS);
  });
});

describe("a bot's routes", () => {
  it("lists only the Processes of its department", async () => {
    const { callInternal, state } = harness("Operações");
    await callInternal("GET", "/api/internal/workflows");
    expect(state.status).toBe(200);
    expect((state.body as { workflows: unknown[] }).workflows).toEqual([]);
  });

  it("refuses to start another department's Process", async () => {
    const { callInternal, state, definition: def } = harness("Operações");
    await callInternal("POST", `/api/internal/workflows/${def.id}/run`);
    expect(state.status).toBe(403);
  });

  it("starts a run and lets only its own conversation cancel it", async () => {
    const { callInternal, state, definition: def } = harness();
    await callInternal("POST", `/api/internal/workflows/${def.id}/run`);
    expect(state.status).toBe(202);
    const run = (state.body as { run: { id: string; requestedBy: { botId: string; threadId: string } } }).run;
    expect(run.requestedBy).toEqual({ botId: "bot-a", threadId: "t-1" });

    await callInternal("POST", `/api/internal/workflows/runs/${run.id}/cancel`, "bot-a", "t-2");
    expect(state.status).toBe(403);

    await callInternal("GET", `/api/internal/workflows/runs/${run.id}`, "bot-a", "t-2");
    expect(state.status).toBe(200);
    expect((state.body as { run: { id: string } }).run.id).toBe(run.id);

    await callInternal("POST", `/api/internal/workflows/runs/${run.id}/cancel`, "bot-a", "t-1");
    expect(state.status).toBe(200);
    expect((state.body as { run: { status: string } }).run.status).toBe("cancelled");
  });
});
