import { mkdtempSync, rmSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { workflowDefinitionSchema, type WorkflowDefinition, type WorkflowRun, type WorkflowSkillOptions } from "../../shared/workflow.ts";
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

function harness(botSection = "Financeiro", skillOptions?: (botId: string) => WorkflowSkillOptions | undefined) {
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
  const deps = {
    store,
    engine,
    bot: (id: string) => id === "bot-a" ? { id, name: "A", section: botSection } : undefined,
    ...(skillOptions ? { skillOptions } : {}),
  };
  const publicRoutes = createWorkflowRoutes(deps);
  const internalRoutes = createWorkflowInternalRoutes(deps);
  const state = { status: 0, body: undefined as unknown };
  const res = { headersSent: false, writableEnded: false };
  const json = ((_res: ServerResponse, status: number, body: unknown) => {
    state.status = status;
    state.body = body;
    res.writableEnded = true;
  }) as unknown as RouteContext["json"];
  const call = (method: string, path: string, body?: unknown, query?: Record<string, string>) => {
    state.status = 0;
    state.body = undefined;
    res.writableEnded = false;
    const url = new URL(`http://127.0.0.1${path}`);
    for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, value);
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

  it("continues a waiting manual run once, and refuses a second click or a missing run", async () => {
    const { call, state, store } = harness();
    const manual = definition({
      id: "11111111-2222-4333-8444-555555555555",
      steps: [{ id: "coletar", name: "Collect", botId: "bot-a", instructions: "Collect.", mode: "manual", outputs: [{ path: "numbers.csv" }] }],
    });
    const saved = store.saveWorkflow(manual);
    if (!saved.ok) throw new Error(saved.error);
    const run = store.createRun(saved.workflow);
    store.writeRun({ ...run, status: "waiting_manual", startedAt: NOW, hold: { step: 0, since: NOW } });

    await call("DELETE", `/api/workflows/runs/${run.id}`);
    expect(state.status).toBe(409);
    await call("DELETE", `/api/workflows/${saved.workflow.id}`);
    expect(state.status).toBe(409);

    await call("POST", `/api/workflows/runs/${run.id}/continue`);
    expect(state.status).toBe(200);
    expect((state.body as { run: { status: string } }).run.status).toBe("running");

    await call("POST", `/api/workflows/runs/${run.id}/continue`);
    expect(state.status).toBe(409);

    await call("POST", "/api/workflows/runs/missing-run/continue");
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

describe("Do While routes", () => {
  const loopDefinition = (overrides: Record<string, unknown> = {}) => definition({
    steps: [{
      id: "laco",
      kind: "loop",
      name: "Loop",
      body: [{ id: "atualiza", kind: "bot", name: "Update", botId: "bot-a", instructions: "Update.", outputs: [{ path: "result.json" }], result: "result.json" }],
      from: "atualiza",
      conditions: [{ field: "restantes", op: "lte", value: 0 }],
      maxIterations: 3,
      outputs: [{ path: "result.json" }],
      result: "result.json",
    }],
    ...overrides,
  });

  it("saves the loop, its sub-canvas and a body script together", async () => {
    const { call, state, definition: def, store } = harness();
    const looped = loopDefinition({
      steps: [{
        id: "laco",
        kind: "loop",
        name: "Loop",
        body: [{
          id: "atualiza", kind: "script", name: "Update", run: "atualiza.mjs", timeoutMs: 60_000,
          outputs: [{ path: "result.json" }], result: "result.json",
        }],
        from: "atualiza",
        conditions: [{ field: "restantes", op: "lte", value: 0 }],
        maxIterations: 3,
        outputs: [{ path: "result.json" }],
      }],
      canvas: {
        nodes: { laco: { x: 10, y: 20 } },
        notes: [],
        containers: [],
        loops: { laco: { nodes: { atualiza: { x: 40, y: 60 } }, notes: [], containers: [] } },
      },
    });
    await call("PUT", `/api/workflows/${def.id}`, {
      ...looped,
      id: def.id,
      scripts: [{ name: "atualiza.mjs", content: "console.log('ok')\n" }],
    });
    expect(state.status).toBe(200);
    expect(store.readScript(def.id, "atualiza.mjs")?.content).toBe("console.log('ok')\n");
    expect(store.workflow(def.id)?.canvas?.loops.laco?.nodes.atualiza).toEqual({ x: 40, y: 60 });
  });

  it("refuses a nested loop, an ambiguous output and a missing source", async () => {
    const { call, state, definition: def } = harness();
    const valid = loopDefinition();
    const nested = {
      ...valid,
      steps: [{
        id: "laco", kind: "loop", name: "Loop",
        body: [{
          id: "inner", kind: "loop", name: "Inner",
          body: [{ id: "atualiza", kind: "bot", name: "Update", botId: "bot-a", instructions: "Update.", outputs: [{ path: "result.json" }], result: "result.json" }],
          from: "atualiza", conditions: [{ field: "ok", op: "equals", value: true }], maxIterations: 1, outputs: [{ path: "result.json" }],
        }],
        from: "atualiza", conditions: [{ field: "ok", op: "equals", value: true }], maxIterations: 1, outputs: [{ path: "result.json" }],
      }],
    };
    await call("PUT", `/api/workflows/${def.id}`, { ...nested, id: def.id });
    expect(state.status).toBe(400);

    const ambiguous = {
      ...valid,
      steps: [{
        id: "laco", kind: "loop", name: "Loop",
        body: [
          { id: "a", kind: "bot", name: "A", botId: "bot-a", instructions: "A.", outputs: [{ path: "result.json" }], result: "result.json" },
          { id: "b", kind: "bot", name: "B", botId: "bot-a", instructions: "B.", outputs: [{ path: "result.json" }], result: "result.json" },
        ],
        from: "a", conditions: [{ field: "ok", op: "equals", value: true }], maxIterations: 1, outputs: [{ path: "result.json" }],
      }],
    };
    await call("PUT", `/api/workflows/${def.id}`, { ...ambiguous, id: def.id });
    expect(state.status).toBe(400);

    const missingSource = {
      ...valid,
      steps: [{
        id: "laco", kind: "loop", name: "Loop",
        body: [{ id: "a", kind: "bot", name: "A", botId: "bot-a", instructions: "A.", outputs: [{ path: "result.json" }], result: "result.json" }],
        from: "sumiu", conditions: [{ field: "ok", op: "equals", value: true }], maxIterations: 1, outputs: [{ path: "result.json" }],
      }],
    };
    await call("PUT", `/api/workflows/${def.id}`, { ...missingSource, id: def.id });
    expect(state.status).toBe(400);
    expect((state.body as { error: string }).error).toContain("is not in the body");
  });

  it("starts a run with the loop and returns its rounds", async () => {
    const { call, state, definition: def, store } = harness();
    const looped = loopDefinition();
    await call("PUT", `/api/workflows/${def.id}`, { ...looped, id: def.id });
    expect(state.status).toBe(200);
    await call("POST", `/api/workflows/${def.id}/run`, {});
    expect(state.status).toBe(202);
    const started = (state.body as { run: WorkflowRun }).run;
    expect(started.steps[0]).toMatchObject({ id: "laco", kind: "loop", iterations: [] });

    const run = store.readRun(started.id)!;
    store.writeRun({
      ...run,
      status: "running",
      startedAt: NOW,
      currentStep: 0,
      steps: [{
        id: "laco", kind: "loop", status: "running", startedAt: NOW,
        iterations: [{ index: 1, status: "running", startedAt: NOW, steps: [{ id: "atualiza", status: "running", startedAt: NOW }] }],
      }],
    });
    await call("GET", `/api/workflows/runs/${run.id}`);
    expect(state.status).toBe(200);
    expect((state.body as { run: WorkflowRun }).run.steps[0]!.iterations).toHaveLength(1);
  });

  it("cancels a running round and marks the body step and loop skipped", async () => {
    const { call, engine, definition: def, store } = harness();
    const looped = loopDefinition();
    await call("PUT", `/api/workflows/${def.id}`, { ...looped, id: def.id });
    const run = store.createRun(store.workflow(def.id)!);
    store.writeRun({
      ...run,
      status: "running",
      startedAt: NOW,
      currentStep: 0,
      steps: [{
        id: "laco", kind: "loop", status: "running", startedAt: NOW,
        iterations: [{ index: 1, status: "running", startedAt: NOW, steps: [{ id: "atualiza", status: "running", startedAt: NOW }] }],
      }],
    });
    const cancelled = engine.cancel(run.id, "stop");
    expect(cancelled.ok).toBe(true);
    const stored = store.readRun(run.id)!;
    expect(stored.status).toBe("cancelled");
    expect(stored.steps[0]!.status).toBe("skipped");
    expect(stored.steps[0]!.iterations![0]!.status).toBe("skipped");
  });

  it("continues a manual body step through its hold.path", async () => {
    const { call, state, engine, definition: def, store } = harness();
    const manual = definition({
      steps: [{
        id: "laco",
        kind: "loop",
        name: "Loop",
        body: [{
          id: "atualiza", kind: "bot", name: "Update", botId: "bot-a", instructions: "Update.",
          mode: "manual", outputs: [{ path: "result.json" }], result: "result.json",
        }],
        from: "atualiza",
        conditions: [{ field: "restantes", op: "lte", value: 0 }],
        maxIterations: 3,
        outputs: [{ path: "result.json" }],
      }],
    });
    await call("PUT", `/api/workflows/${def.id}`, { ...manual, id: def.id });
    expect(state.status).toBe(200);
    const run = store.createRun(store.workflow(def.id)!);
    store.writeRun({
      ...run,
      status: "waiting_manual",
      startedAt: NOW,
      currentStep: 0,
      hold: { path: [0, 0, 0], since: NOW },
      steps: [{
        id: "laco", kind: "loop", status: "running", startedAt: NOW,
        iterations: [{ index: 1, status: "running", startedAt: NOW, steps: [{ id: "atualiza", status: "pending" }] }],
      }],
    });
    await call("POST", `/api/workflows/runs/${run.id}/continue`, {});
    expect(state.status).toBe(200);
    expect((state.body as { run: WorkflowRun }).run.status).toBe("running");
    await engine.idle();
    const resumed = store.readRun(run.id)!;
    expect(resumed.hold).toBeUndefined();
    expect(resumed.steps[0]!.iterations![0]!.steps[0]!.status).toBe("running");
    expect(resumed.steps[0]!.iterations![0]!.steps[0]!.threadId).toBe("thread-1");
  });

  it("refuses a new body script while a run is active", async () => {
    const { call, state, definition: def, store } = harness();
    const looped = loopDefinition();
    await call("PUT", `/api/workflows/${def.id}`, { ...looped, id: def.id });
    store.createRun(store.workflow(def.id)!);
    await call("PUT", `/api/workflows/${def.id}`, {
      ...looped,
      id: def.id,
      scripts: [{ name: "atualiza.mjs", content: "x" }],
    });
    expect(state.status).toBe(409);
  });
});

describe("step skill options", () => {
  const options: WorkflowSkillOptions = {
    bot: [{ name: "own", label: "own", description: "Own skill", available: true }],
    bundled: [{ name: "create-bot", label: "Create a Bot", description: "Bundled", available: true }],
    imported: [{ name: "from-claude", label: "from-claude", description: "Imported", available: true }],
  };
  const withSkills = (def: WorkflowDefinition, skills: Record<string, string[]>) => ({
    ...def,
    steps: [{ ...def.steps[0]!, skills }],
  });

  it("lists the three groups for a bot", async () => {
    const { call, state } = harness("Financeiro", () => options);
    await call("GET", "/api/workflows/skill-options", undefined, { botId: "bot-a" });
    expect(state.status).toBe(200);
    expect((state.body as { options: WorkflowSkillOptions }).options).toEqual(options);
  });

  it("accepts a selection made only of skills the bot can use", async () => {
    const { call, state, definition: def } = harness("Financeiro", () => options);
    await call("PUT", `/api/workflows/${def.id}`, withSkills(def, { bot: ["own"], bundled: ["create-bot"], imported: ["from-claude"] }));
    expect(state.status).toBe(200);
    expect((state.body as { workflow: WorkflowDefinition }).workflow.version).toBe(2);
  });

  it("refuses a skill outside the bot's available groups", async () => {
    const { call, state, definition: def, store } = harness("Financeiro", () => options);
    await call("PUT", `/api/workflows/${def.id}`, withSkills(def, { bot: ["someone-else"] }));
    expect(state.status).toBe(400);
    expect((state.body as { error: string }).error).toContain('skill "someone-else" is not available for this Workflow step');
    expect(store.versions(def.id)).toHaveLength(1);
  });

  it("saves an unchanged Workflow without creating a version when skills are absent or empty", async () => {
    const { call, state, definition: def, store } = harness("Financeiro", () => options);
    await call("PUT", `/api/workflows/${def.id}`, withSkills(def, { bot: [], bundled: [], imported: [] }));
    expect(state.status).toBe(200);
    expect((state.body as { workflow: WorkflowDefinition }).workflow.version).toBe(1);
    expect(store.versions(def.id)).toHaveLength(1);
  });
});
