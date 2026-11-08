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
  it("saves a script step together with the file the Studio carries", async () => {
    const { call, state, store, definition: def } = harness();
    const scripted = definition({
      steps: [{
        id: "validar", kind: "script", name: "Validate", run: "validar.mjs", timeoutMs: 60_000,
        outputs: [{ path: "result.json" }], result: "result.json",
      }],
    });
    await call("PUT", `/api/workflows/${def.id}`, {
      ...scripted,
      id: def.id,
      scripts: [{ name: "validar.mjs", content: "console.log('ok')\n" }],
    });
    expect(state.status).toBe(200);
    expect(store.readScript(def.id, "validar.mjs")?.content).toBe("console.log('ok')\n");
  });

  it("refuses a save whose scripts list is malformed", async () => {
    const { call, state, definition: def } = harness();
    await call("PUT", `/api/workflows/${def.id}`, { ...def, scripts: [{ name: "validar.mjs" }] });
    expect(state.status).toBe(400);
  });

  it("saves the success, failure and timeout routes and reads them back", async () => {
    const { call, state, definition: def } = harness();
    const routed = definition({
      steps: [
        { id: "coletar", name: "Collect", botId: "bot-a", instructions: "Collect.", timeoutMs: 30_000, onSuccess: "revisar", onFailure: "revisar", onTimeout: "revisar", outputs: [{ path: "numbers.csv" }] },
        { id: "revisar", name: "Review", botId: "bot-a", instructions: "Review.", outputs: [{ path: "decision.json" }], result: "decision.json", onSuccess: null },
      ],
    });
    await call("POST", "/api/workflows", { ...routed, id: def.id });
    expect(state.status).toBe(200);
    const saved = (state.body as { workflow: WorkflowDefinition }).workflow;
    const first = saved.steps[0]!;
    expect(first.kind === "bot" && first.onSuccess).toBe("revisar");
    expect(first.kind === "bot" && first.onFailure).toBe("revisar");
    expect(first.kind === "bot" && first.onTimeout).toBe("revisar");
    expect(saved.steps[1]!.kind === "bot" && saved.steps[1]!.onSuccess).toBeNull();
  });

  it("reads an old next edge as onSuccess when saving", async () => {
    const { call, state, definition: def } = harness();
    const body = {
      id: def.id,
      version: 1,
      name: "Legacy",
      department: "Financeiro",
      steps: [
        { id: "coletar", name: "Collect", botId: "bot-a", instructions: "Collect.", outputs: [{ path: "numbers.csv" }], next: "revisar" },
        { id: "revisar", name: "Review", botId: "bot-a", instructions: "Review.", outputs: [{ path: "decision.json" }], result: "decision.json" },
      ],
      createdAt: 1,
      updatedAt: 1,
    };
    await call("POST", "/api/workflows", body);
    expect(state.status).toBe(200);
    const saved = (state.body as { workflow: WorkflowDefinition }).workflow;
    expect(saved.steps[0]!.kind === "bot" && saved.steps[0]!.onSuccess).toBe("revisar");
    expect((saved.steps[0] as Record<string, unknown>).next).toBeUndefined();
  });

  it("refuses a save whose success edge points backwards", async () => {
    const { call, state, definition: def } = harness();
    const body = {
      id: def.id,
      version: 1,
      name: "Backwards",
      department: "Financeiro",
      steps: [
        { id: "coletar", name: "Collect", botId: "bot-a", instructions: "Collect.", outputs: [{ path: "numbers.csv" }], onSuccess: "revisar" },
        { id: "revisar", name: "Review", botId: "bot-a", instructions: "Review.", outputs: [{ path: "decision.json" }], result: "decision.json", onSuccess: "coletar" },
      ],
      createdAt: 1,
      updatedAt: 1,
    };
    await call("POST", "/api/workflows", body);
    expect(state.status).toBe(400);
    expect((state.body as { error: string }).error).toContain("onSuccess");
  });

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

describe("Workflow scripts", () => {
  const scriptStep = { id: "validar", kind: "script", name: "Validate", run: "validar.mjs", outputs: [{ path: "result.json" }], result: "result.json" } as const;

  it("uploads, lists and reads a script", async () => {
    const { call, state, definition: def } = harness();
    await call("PUT", `/api/workflows/${def.id}/scripts/validar.mjs`, { content: "export {};\n" });
    expect(state.status).toBe(200);
    expect(state.body).toMatchObject({ script: { name: "validar.mjs", bytes: 11 } });

    await call("GET", `/api/workflows/${def.id}/scripts/validar.mjs`);
    expect(state.status).toBe(200);
    expect((state.body as { script: { content: string } }).script.content).toBe("export {};\n");

    await call("GET", `/api/workflows/${def.id}/scripts`);
    expect(state.status).toBe(200);
    expect((state.body as { scripts: unknown[] }).scripts).toHaveLength(1);
  });

  it("refuses a name that is a path or another extension", async () => {
    const { call, state, definition: def } = harness();
    for (const name of ["../validar.mjs", "validar.sh", "sub%2Fvalidar.mjs"]) {
      await call("PUT", `/api/workflows/${def.id}/scripts/${name}`, { content: "x" });
      expect(state.status).toBe(400);
    }
  });

  it("refuses a script for a Workflow that does not exist", async () => {
    const { call, state } = harness();
    await call("PUT", "/api/workflows/11111111-2222-4333-8444-555555555555/scripts/validar.mjs", { content: "x" });
    expect(state.status).toBe(404);
  });

  it("refuses to change a script while a run is active", async () => {
    const { call, state, definition: def, store } = harness();
    const run = store.createRun(def);
    store.writeRun({ ...run, status: "running", startedAt: NOW });
    await call("PUT", `/api/workflows/${def.id}/scripts/validar.mjs`, { content: "x" });
    expect(state.status).toBe(409);
  });

  it("refuses to save a Workflow whose script is not uploaded yet", async () => {
    const { call, state, definition: def } = harness();
    const body = { ...def, steps: [...def.steps, scriptStep] };
    await call("PUT", `/api/workflows/${def.id}`, body);
    expect(state.status).toBe(400);
    expect((state.body as { error: string }).error).toContain("scripts folder");

    await call("PUT", `/api/workflows/${def.id}/scripts/validar.mjs`, { content: "export {};\n" });
    await call("PUT", `/api/workflows/${def.id}`, body);
    expect(state.status).toBe(200);
    expect((state.body as { workflow: { version: number } }).workflow.version).toBe(2);
  });
});
