import { closeSync, ftruncateSync, mkdirSync, mkdtempSync, openSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { workflowDefinitionSchema, type WorkflowDefinition, type WorkflowRun, type WorkflowSkillOptions } from "../../shared/workflow.ts";
import { json, readBody } from "../harness/http.ts";
import type { RequestAuth } from "../request-auth.ts";
import { createWorkflowEngine } from "../workflows/engine.ts";
import { iterationStepOutputDir, stepDir, stepOutputDir, WORKFLOWS_ROOT_ENV } from "../workflows/paths.ts";
import { createWorkflowStore } from "../workflows/store.ts";
import { createWorkflowInternalRoutes, createWorkflowRoutes, type WorkflowInternalContext, type WorkflowRoutesDeps } from "./workflows.ts";
import { requiredScope } from "../request-auth.ts";
import { dispatchRoutes, PASS, type RouteContext } from "./table.ts";

const NOW = new Date("2026-11-07T12:00:00.000Z").getTime();

let root: string;
const artifactServers: Server[] = [];

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "omb-process-routes-"));
});

afterEach(async () => {
  await Promise.all(artifactServers.splice(0).map((server) => new Promise((done) => server.close(done))));
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

function harness(
  botSection = "Financeiro",
  skillOptions?: (botId: string) => WorkflowSkillOptions | undefined,
  extra: Partial<WorkflowRoutesDeps> = {},
) {
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
    ...extra,
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
        outputs: [{ path: "result.json", shape: { type: "object" } }],
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
        { id: "revisar", name: "Review", botId: "bot-a", instructions: "Review.", outputs: [{ path: "decision.json" }], onSuccess: null },
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
      triggers: [{ id: "manual", kind: "manual", name: "Manual" }],
      steps: [
        { id: "coletar", name: "Collect", botId: "bot-a", instructions: "Collect.", outputs: [{ path: "numbers.csv" }], next: "revisar" },
        { id: "revisar", name: "Review", botId: "bot-a", instructions: "Review.", outputs: [{ path: "decision.json" }] },
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
      triggers: [{ id: "manual", kind: "manual", name: "Manual" }],
      steps: [
        { id: "coletar", name: "Collect", botId: "bot-a", instructions: "Collect.", outputs: [{ path: "numbers.csv" }], onSuccess: "revisar" },
        { id: "revisar", name: "Review", botId: "bot-a", instructions: "Review.", outputs: [{ path: "decision.json" }], onSuccess: "coletar" },
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

  it("returns the trigger track and keeps the one a save names", async () => {
    const { call, state, definition: def } = harness();
    await call("GET", `/api/workflows/${def.id}`);
    expect((state.body as { workflow: WorkflowDefinition }).workflow.triggers).toEqual([
      { id: "manual", kind: "manual", name: "Manual" },
    ]);

    await call("PUT", `/api/workflows/${def.id}`, {
      ...def,
      triggers: [
        { id: "manual", kind: "manual", name: "Manual" },
        { id: "diaria", kind: "routine", name: "Diária" },
      ],
    });
    expect(state.status).toBe(200);
    expect((state.body as { workflow: WorkflowDefinition }).workflow.triggers.map((trigger) => trigger.kind)).toEqual(["manual", "routine"]);
  });

  it("refuses a save without triggers", async () => {
    const { call, state, definition: def } = harness();
    await call("PUT", `/api/workflows/${def.id}`, { ...def, triggers: [] });
    expect(state.status).toBe(400);
    expect((state.body as { error: string }).error).toContain("triggers");
  });

  it("refuses a webhook when the Workflow receives no external parameter", async () => {
    const { call, state, definition: def } = harness();
    await call("PUT", `/api/workflows/${def.id}`, {
      ...def,
      triggers: [
        { id: "manual", kind: "manual", name: "Manual" },
        { id: "pedidos", kind: "webhook", name: "Pedidos" },
      ],
    });
    expect(state.status).toBe(400);
    expect((state.body as { authoring: { errors: Array<{ path: string }> } }).authoring.errors.map((issue) => issue.path)).toContain("triggers.1");
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
      steps: [{ id: "coletar", name: "Collect", botId: "bot-a", instructions: "Collect.", mode: "manual", parameters: [{ name: "link", type: "string", collectedBy: "coletar" }], outputs: [{ path: "numbers.csv" }] }],
    });
    const saved = store.saveWorkflow(manual);
    if (!saved.ok) throw new Error(saved.error);
    const run = store.createRun(saved.workflow);
    store.writeRun({ ...run, status: "waiting_manual", startedAt: NOW, hold: { step: 0, since: NOW } });

    await call("DELETE", `/api/workflows/runs/${run.id}`);
    expect(state.status).toBe(409);
    await call("DELETE", `/api/workflows/${saved.workflow.id}`);
    expect(state.status).toBe(409);

    await call("POST", `/api/workflows/runs/${run.id}/continue`, { inputs: { link: "https://x" } });
    expect(state.status).toBe(200);
    expect((state.body as { run: { status: string } }).run.status).toBe("running");

    await call("POST", `/api/workflows/runs/${run.id}/continue`);
    expect(state.status).toBe(409);

    await call("POST", "/api/workflows/runs/missing-run/continue");
    expect(state.status).toBe(404);
  });

  it("refuses a save with a field of another kind instead of dropping it", async () => {
    const { call, state, definition: def } = harness();
    await call("POST", "/api/workflows", {
      id: def.id,
      name: "Validate",
      department: "Financeiro",
      steps: [{ id: "validar", kind: "script", name: "Validate", run: "validar.mjs", instructions: "Not a script field.", outputs: [{ path: "result.json" }] }],
    });
    expect(state.status).toBe(400);
    expect(String((state.body as { error: string }).error)).toContain("steps.0.instructions");
    expect(String((state.body as { error: string }).error)).toContain("is not a field of this contract");
  });

  it("asks a manual step's fields at continue, and stores the answers before the step runs", async () => {
    const { call, state, store } = harness();
    const manual = definition({
      id: "22222222-3333-4444-8555-666666666666",
      steps: [{
        id: "coletar", name: "Collect", botId: "bot-a", instructions: "Ask for the link.", mode: "manual",
        outputs: [{ path: "link.txt" }],
        parameters: [{ name: "link", type: "string", collectedBy: "coletar" }],
      }],
    });
    const saved = store.saveWorkflow(manual);
    if (!saved.ok) throw new Error(saved.error);
    const run = store.createRun(saved.workflow);
    store.writeRun({ ...run, status: "waiting_manual", startedAt: NOW, hold: { step: 0, since: NOW } });

    await call("POST", `/api/workflows/runs/${run.id}/continue`, {});
    expect(state.status).toBe(400);
    expect((state.body as { missing: unknown[] }).missing).toEqual([{ step: "Collect", name: "link" }]);

    await call("POST", `/api/workflows/runs/${run.id}/continue`, { inputs: { link: "https://x" } });
    expect(state.status).toBe(200);
    expect(store.readRun(run.id)!.inputs).toEqual({ link: "https://x" });
  });

  it("refuses a save with every authoring problem as a WorkflowRefusal", async () => {
    const { call, state, definition: def } = harness();
    await call("PUT", `/api/workflows/${def.id}`, {
      ...def,
      id: def.id,
      steps: [
        { id: "pedir", kind: "bot", name: "Pedir", botId: "bot-a", instructions: "Ask.", mode: "manual", outputs: [{ path: "link.txt" }] },
        { id: "entregar", kind: "bot", name: "Entregar", botId: "bot-a", instructions: "Deliver.", outputs: [{ path: "resumo" }, { path: "clip_*.mp4" }] },
      ],
    });
    expect(state.status).toBe(400);
    const refusal = state.body as { code: string; error: string; authoring: { errors: Array<{ path: string; message: string }> } };
    expect(refusal.code).toBe("authoringErrors");
    expect(refusal.authoring.errors.map((issue) => issue.path)).toEqual(["steps.0.mode", "steps.1.outputs.0.path", "steps.1.outputs.1.path"]);
    expect(refusal.error).toContain("steps.0.mode");
  });

  it("answers a valid save without an authoring report", async () => {
    const { call, state, definition: def } = harness();
    await call("PUT", `/api/workflows/${def.id}`, { ...def, id: def.id });
    expect(state.status).toBe(200);
    expect(state.body).not.toHaveProperty("authoring");
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
  const scriptStep = { id: "validar", kind: "script", name: "Validate", run: "validar.mjs", outputs: [{ path: "result.json", shape: { type: "object" } }] } as const;

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
      body: [{ id: "atualiza", kind: "bot", name: "Update", botId: "bot-a", instructions: "Update.", outputs: [{ path: "result.json", shape: { type: "object" } }] }],
      from: { step: "atualiza", output: "result.json" },
      conditions: [{ field: "restantes", op: "lte", value: 0 }],
      maxIterations: 3,
      outputs: [{ path: "result.json", shape: { type: "object" } }],
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
          outputs: [{ path: "result.json", shape: { type: "object" } }],
        }],
        from: { step: "atualiza", output: "result.json" },
        conditions: [{ field: "restantes", op: "lte", value: 0 }],
        maxIterations: 3,
        outputs: [{ path: "result.json", shape: { type: "object" } }],
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
          body: [{ id: "atualiza", kind: "bot", name: "Update", botId: "bot-a", instructions: "Update.", outputs: [{ path: "result.json", shape: { type: "object" } }] }],
          from: { step: "atualiza", output: "result.json" }, conditions: [{ field: "ok", op: "equals", value: true }], maxIterations: 1, outputs: [{ path: "result.json", shape: { type: "object" } }],
        }],
        from: { step: "atualiza", output: "result.json" }, conditions: [{ field: "ok", op: "equals", value: true }], maxIterations: 1, outputs: [{ path: "result.json", shape: { type: "object" } }],
      }],
    };
    await call("PUT", `/api/workflows/${def.id}`, { ...nested, id: def.id });
    expect(state.status).toBe(400);

    const ambiguous = {
      ...valid,
      steps: [{
        id: "laco", kind: "loop", name: "Loop",
        body: [
          { id: "a", kind: "bot", name: "A", botId: "bot-a", instructions: "A.", outputs: [{ path: "result.json", shape: { type: "object" } }] },
          { id: "b", kind: "bot", name: "B", botId: "bot-a", instructions: "B.", outputs: [{ path: "result.json", shape: { type: "object" } }] },
        ],
        from: { step: "a", output: "result.json" }, conditions: [{ field: "ok", op: "equals", value: true }], maxIterations: 1, outputs: [{ path: "result.json", shape: { type: "object" } }],
      }],
    };
    await call("PUT", `/api/workflows/${def.id}`, { ...ambiguous, id: def.id });
    expect(state.status).toBe(400);

    const missingSource = {
      ...valid,
      steps: [{
        id: "laco", kind: "loop", name: "Loop",
        body: [{ id: "a", kind: "bot", name: "A", botId: "bot-a", instructions: "A.", outputs: [{ path: "result.json", shape: { type: "object" } }] }],
        from: { step: "sumiu", output: "result.json" }, conditions: [{ field: "ok", op: "equals", value: true }], maxIterations: 1, outputs: [{ path: "result.json", shape: { type: "object" } }],
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
          mode: "manual", parameters: [{ name: "link", type: "string", collectedBy: "atualiza" }], outputs: [{ path: "result.json", shape: { type: "object" } }],
        }],
        from: { step: "atualiza", output: "result.json" },
        conditions: [{ field: "restantes", op: "lte", value: 0 }],
        maxIterations: 3,
        outputs: [{ path: "result.json", shape: { type: "object" } }],
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
    await call("POST", `/api/workflows/runs/${run.id}/continue`, { inputs: { link: "https://x" } });
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

describe("the environment routes", () => {
  const env = () => ({ [WORKFLOWS_ROOT_ENV]: join(root, "runs") });

  it("prepares the union of saved Workflows and draft proposals", async () => {
    const draft = definition({
      id: "11111111-1111-4111-8111-111111111111",
      steps: [{
        id: "baixar", kind: "script", name: "Download", run: "baixar.mjs",
        modules: [{ name: "faster-whisper", runtime: "python", version: "1.2.1" }],
        outputs: [{ path: "transcript.json" }],
      }],
    });
    let seen: readonly WorkflowDefinition[] = [];
    const { call, state, definition: saved } = harness("Financeiro", undefined, {
      env: env(),
      draftDefinitions: () => [draft],
      prepareEnvironment: async (options) => {
        seen = options.definitions;
        return { ok: true, preparedAt: NOW, hash: "sha256:test", installed: [], missing: [] };
      },
    });

    await call("POST", "/api/workflows/environment/prepare");
    expect(state.status).toBe(200);
    expect(state.body).toMatchObject({ ok: true, preparedAt: NOW, hash: "sha256:test" });
    expect(seen.map((entry) => entry.id).sort()).toEqual([saved.id, draft.id].sort());
  });

  it("reports the panel status without touching the real installation", async () => {
    const { call, state } = harness("Financeiro", undefined, { env: env() });
    await call("GET", "/api/workflows/environment");
    expect(state.status).toBe(200);
    expect(state.body).toMatchObject({ prepared: false, stale: false, declared: 0, modules: [] });
  });

  it("keeps both environment routes admin-only", () => {
    expect(requiredScope("POST", "/api/workflows/environment/prepare")).toBe("admin");
    expect(requiredScope("GET", "/api/workflows/environment")).toBe("admin");
  });
});

describe("Run artifacts", () => {
  const artifactDefinition = () => definition({
    steps: [
      {
        id: "coletar", kind: "bot", name: "Coletar", botId: "bot-a", instructions: "Collect.",
        outputs: [{ path: "dados.csv" }, { path: "resumo.md" }],
      },
      {
        id: "laco", kind: "loop", name: "Do While",
        body: [{ id: "preparar", kind: "bot", name: "Preparar", botId: "bot-a", instructions: "Prepare.", outputs: [{ path: "result.json", shape: { type: "object" } }] }],
        from: { step: "preparar", output: "result.json" },
        conditions: [{ field: "restantes", op: "lte", value: 0 }],
        maxIterations: 2,
        outputs: [{ path: "result.json", shape: { type: "object" } }],
      },
    ],
  });

  async function artifactHarness(extra?: (runDir: string) => void) {
    const store = createWorkflowStore({
      dataDir: join(root, "data"),
      env: { [WORKFLOWS_ROOT_ENV]: join(root, "runs") },
      now: () => NOW,
      log: () => {},
    });
    const saved = store.saveWorkflow(artifactDefinition());
    if (!saved.ok) throw new Error(saved.error);
    const engine = createWorkflowEngine({
      store, startTurn: async () => undefined, createThread: () => "thread-1", broadcast: () => {}, now: () => NOW, log: () => {},
    });
    const run = store.createRun(saved.workflow);
    const runDir = store.runDir(run);
    const write = (path: string, text: string) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
    };
    const output = stepOutputDir(runDir, 1);
    write(join(output, "dados.csv"), "nome,total\nana,10\n");
    write(join(output, "resumo.md"), "# resumo\n");
    write(join(output, "relatório final.pdf"), "%PDF-1.4\n");
    write(join(output, "pagina.html"), "<script>alert(1)</script>");
    write(join(output, "icone.svg"), "<svg onload=\"alert(1)\"/>");
    write(join(output, "doc.json"), "{\"ok\":true}");
    write(join(output, "grande.txt"), "a".repeat(300 * 1024));
    write(join(stepDir(runDir, 1), "input", "params.json"), "{\"token\":\"segredo\"}");
    write(join(stepOutputDir(runDir, 2), "result.json"), "{\"restantes\":0}");
    write(join(iterationStepOutputDir(runDir, 1, "preparar"), "result.json"), "{\"restantes\":1}");
    write(join(iterationStepOutputDir(runDir, 2, "preparar"), "result.json"), "{\"restantes\":0}");
    extra?.(runDir);
    store.writeRun({
      ...run,
      status: "succeeded",
      startedAt: NOW,
      finishedAt: NOW,
      currentStep: 2,
      steps: [
        { id: "coletar", status: "succeeded", verified: ["dados.csv", "resumo.md"] },
        {
          id: "laco", kind: "loop", status: "succeeded", verified: ["result.json"],
          iterations: [
            { index: 1, status: "succeeded", steps: [{ id: "preparar", status: "succeeded", verified: ["result.json"] }] },
            { index: 2, status: "succeeded", steps: [{ id: "preparar", status: "succeeded", verified: ["result.json"] }] },
          ],
        },
      ],
    });
    const routes = [createWorkflowRoutes({
      store, engine, bot: () => undefined, log: () => {},
      now: () => NOW,
    })];
    const server: Server = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const auth = { kind: "loopback", scopes: ["admin"] } as unknown as RequestAuth;
      try {
        const handled = await dispatchRoutes(routes, { req, res, url, path: url.pathname, method: req.method ?? "GET", auth, json, readBody });
        if (!handled) json(res, 404, { from: "inline routes" });
      } catch (error) {
        json(res, 500, { error: String(error) });
      }
    });
    artifactServers.push(server);
    await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
    return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, run, runDir };
  }

  const artifact = (base: string, runId: string, query: Record<string, string>, init?: RequestInit) => {
    const url = new URL(`${base}/api/workflows/runs/${runId}/artifact`);
    for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
    return fetch(url, init);
  };

  it("lists every step and round, with types, verification and the retention window", async () => {
    const { base, run } = await artifactHarness();
    const response = await fetch(`${base}/api/workflows/runs/${run.id}/artifacts`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json() as {
      runId: string; expiresAt: number; runStatus: string;
      sources: Array<{ origin: Record<string, unknown>; name: string; status: string; files: Array<{ path: string; contentType: string; preview: string; verified: boolean }> }>;
      totals: { files: number; truncated: boolean };
    };
    expect(body.runId).toBe(run.id);
    expect(body.runStatus).toBe("succeeded");
    expect(body.expiresAt).toBe(NOW + 90 * 86_400_000);
    expect(body.totals.truncated).toBe(false);
    expect(body.sources.map((source) => source.origin)).toEqual([
      { kind: "step", step: 1 },
      { kind: "step", step: 2 },
      { kind: "iteration", step: 2, iteration: 1, body: "preparar" },
      { kind: "iteration", step: 2, iteration: 2, body: "preparar" },
    ]);
    const first = body.sources[0]!;
    expect(first.files.map((file) => file.path)).not.toContain("params.json");
    expect(first.files.find((file) => file.path === "dados.csv")).toMatchObject({ contentType: "text/csv; charset=utf-8", preview: "csv", verified: true });
    expect(first.files.find((file) => file.path === "doc.json")).toMatchObject({ preview: "json", verified: false });
    expect(body.sources[1]!.name).toBe("Do While");
    expect(body.sources[2]!.name).toBe("Do While · volta 1 · Preparar");
  });

  it("answers 404 for a missing run, step, round or file, and never serves input/", async () => {
    const { base, run } = await artifactHarness();
    expect((await fetch(`${base}/api/workflows/runs/20261107-120000-000000/artifacts`)).status).toBe(404);
    expect((await artifact(base, run.id, { step: "3", path: "dados.csv" })).status).toBe(404);
    expect((await artifact(base, run.id, { step: "1", path: "missing.csv" })).status).toBe(404);
    expect((await artifact(base, run.id, { step: "2", iteration: "9", body: "preparar", path: "result.json" })).status).toBe(404);
    expect((await artifact(base, run.id, { step: "2", iteration: "1", body: "outro", path: "result.json" })).status).toBe(404);
    expect((await artifact(base, run.id, { step: "1", path: "../input/params.json" })).status).toBe(400);
    expect((await artifact(base, run.id, { step: "1", path: "../run.json" })).status).toBe(400);
  });

  it("answers 400 for an out-of-range parameter", async () => {
    const { base, run } = await artifactHarness();
    for (const query of [
      { step: "0", path: "dados.csv" },
      { step: "41", path: "dados.csv" },
      { path: "dados.csv" },
      { step: "1", path: "../x" },
      { step: "1", path: "/etc/passwd" },
      { step: "1", path: "a\\b" },
      { step: "2", body: "preparar", path: "result.json" },
      { step: "2", iteration: "0", body: "preparar", path: "result.json" },
      { step: "1", path: "dados.csv", disposition: "preview" },
    ] as Array<Record<string, string>>) {
      const response = await artifact(base, run.id, query);
      expect(response.status, JSON.stringify(query)).toBe(400);
    }
    expect((await fetch(`${base}/api/workflows/runs/${run.id}/artifacts.zip?step=0`)).status).toBe(400);
  });

  it("answers 405 for a method other than GET or HEAD", async () => {
    const { base, run } = await artifactHarness();
    expect((await fetch(`${base}/api/workflows/runs/${run.id}/artifacts`, { method: "POST" })).status).toBe(405);
    expect((await fetch(`${base}/api/workflows/runs/${run.id}/artifact?step=1&path=dados.csv`, { method: "POST" })).status).toBe(405);
    expect((await fetch(`${base}/api/workflows/runs/${run.id}/artifacts.zip`, { method: "POST" })).status).toBe(405);
  });

  it("sends the artifact as an uncached sandboxed stream, and HEAD sends only the headers", async () => {
    const { base, run } = await artifactHarness();
    const response = await artifact(base, run.id, { step: "1", path: "dados.csv" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-length")).toBe("18");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toBe("sandbox");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(response.headers.get("content-disposition")).toMatch(/^inline; filename="dados.csv"/);
    expect(await response.text()).toBe("nome,total\nana,10\n");

    const head = await artifact(base, run.id, { step: "1", path: "dados.csv" }, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe("18");
    expect(head.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(await head.text()).toBe("");
  });

  it("honours a Range and refuses a start past the end", async () => {
    const { base, run } = await artifactHarness();
    const partial = await artifact(base, run.id, { step: "1", path: "dados.csv" }, { headers: { range: "bytes=0-9" } });
    expect(partial.status).toBe(206);
    expect(partial.headers.get("content-range")).toBe("bytes 0-9/18");
    expect(partial.headers.get("content-length")).toBe("10");
    expect(await partial.text()).toBe("nome,total");
    const past = await artifact(base, run.id, { step: "1", path: "dados.csv" }, { headers: { range: "bytes=18-" } });
    expect(past.status).toBe(416);
    expect(past.headers.get("content-range")).toBe("bytes */18");
    const malformed = await artifact(base, run.id, { step: "1", path: "dados.csv" }, { headers: { range: "bytes=abc" } });
    expect(malformed.status).toBe(200);
  });

  it("downloads an accented name with filename*", async () => {
    const { base, run } = await artifactHarness();
    const response = await artifact(base, run.id, { step: "1", path: "relatório final.pdf", disposition: "download" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("filename*=UTF-8''relat%C3%B3rio%20final.pdf");
    expect(await response.text()).toBe("%PDF-1.4\n");
  });

  it("never serves HTML or SVG inline", async () => {
    const { base, run } = await artifactHarness();
    for (const path of ["pagina.html", "icone.svg"]) {
      const response = await artifact(base, run.id, { step: "1", path });
      expect(response.status, path).toBe(200);
      expect(response.headers.get("content-type"), path).toBe("text/plain; charset=utf-8");
      expect(response.headers.get("content-disposition"), path).toMatch(/^attachment;/);
      expect(response.headers.get("x-content-type-options"), path).toBe("nosniff");
      expect(await artifact(base, run.id, { step: "1", path, disposition: "inline" }).then((answer) => answer.headers.get("content-disposition")), path)
        .toMatch(/^attachment;/);
    }
  });

  it("truncates a text preview at 256 KB and refuses a binary preview past 100 MB", async () => {
    const { base, run } = await artifactHarness((runDir) => {
      const path = join(stepOutputDir(runDir, 1), "clip.mp4");
      const fd = openSync(path, "w");
      ftruncateSync(fd, 100 * 1024 * 1024 + 1);
      closeSync(fd);
    });
    const text = await artifact(base, run.id, { step: "1", path: "grande.txt" });
    expect(text.status).toBe(200);
    expect(text.headers.get("x-artifact-truncated")).toBe("1");
    expect(text.headers.get("content-length")).toBe(String(256 * 1024));
    expect((await text.text()).length).toBe(256 * 1024);

    const inline = await artifact(base, run.id, { step: "1", path: "clip.mp4" });
    expect(inline.status).toBe(413);
    expect(await inline.json()).toEqual({ error: "the file is too large to preview", limit: 100 * 1024 * 1024 });
    const download = await artifact(base, run.id, { step: "1", path: "clip.mp4", disposition: "download" }, { method: "HEAD" });
    expect(download.status).toBe(200);
    expect(download.headers.get("content-length")).toBe(String(100 * 1024 * 1024 + 1));
  });

  it("refuses a symlink and a linked folder, and answers 404 once the run folder is gone", async () => {
    const { base, run, runDir } = await artifactHarness((dir) => {
      symlinkSync("/etc/passwd", join(stepOutputDir(dir, 1), "link.txt"));
      symlinkSync("/etc", join(stepOutputDir(dir, 1), "fora"));
    });
    expect((await artifact(base, run.id, { step: "1", path: "link.txt" })).status).toBe(404);
    expect((await artifact(base, run.id, { step: "1", path: "fora/passwd" })).status).toBe(404);
    expect((await fetch(`${base}/api/workflows/runs/${run.id}/artifacts`)).status).toBe(200);
    rmSync(runDir, { recursive: true, force: true });
    expect((await fetch(`${base}/api/workflows/runs/${run.id}/artifacts`)).status).toBe(404);
    expect((await artifact(base, run.id, { step: "1", path: "dados.csv" })).status).toBe(404);
    expect((await fetch(`${base}/api/workflows/runs/${run.id}/artifacts.zip`)).status).toBe(404);
  });

  it("downloads the whole run or one step as a store-only zip", async () => {
    const { base, run } = await artifactHarness();
    const response = await fetch(`${base}/api/workflows/runs/${run.id}/artifacts.zip`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toBe(`attachment; filename="run-${run.id}.zip"`);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const all = Buffer.from(await response.arrayBuffer());
    expect(all.readUInt32LE(0)).toBe(0x04034b50);
    for (const name of ["step-1/dados.csv", "step-2/result.json", "step-2/iter-1/preparar/result.json", "step-2/iter-2/preparar/result.json"]) {
      expect(all.includes(Buffer.from(name)), name).toBe(true);
    }
    const onlyStep2 = Buffer.from(await (await fetch(`${base}/api/workflows/runs/${run.id}/artifacts.zip?step=2`)).arrayBuffer());
    expect(onlyStep2.includes(Buffer.from("step-2/iter-1/preparar/result.json"))).toBe(true);
    expect(onlyStep2.includes(Buffer.from("step-1/dados.csv"))).toBe(false);
  });

  it("refuses a zip past its entry or byte cap before the first byte", async () => {
    const entries = await artifactHarness((runDir) => {
      const dir = stepOutputDir(runDir, 1);
      for (let index = 0; index < 2_001; index += 1) writeFileSync(join(dir, `bulk-${String(index).padStart(4, "0")}.txt`), "x");
    });
    const tooMany = await fetch(`${entries.base}/api/workflows/runs/${entries.run.id}/artifacts.zip`);
    expect(tooMany.status).toBe(413);
    expect(await tooMany.json()).toEqual({ error: "the zip has too many files", limit: 2_000 });

    const bytes = await artifactHarness((runDir) => {
      const fd = openSync(join(stepOutputDir(runDir, 1), "enorme.bin"), "w");
      ftruncateSync(fd, 512 * 1024 * 1024 + 1);
      closeSync(fd);
    });
    const tooBig = await fetch(`${bytes.base}/api/workflows/runs/${bytes.run.id}/artifacts.zip`);
    expect(tooBig.status).toBe(413);
    expect(await tooBig.json()).toEqual({ error: "the zip is larger than its limit", limit: 512 * 1024 * 1024 });
  });

  it("keeps the artifact routes admin-only", () => {
    expect(requiredScope("GET", "/api/workflows/runs/20261107-120000-000000/artifacts")).toBe("admin");
    expect(requiredScope("GET", "/api/workflows/runs/20261107-120000-000000/artifact")).toBe("admin");
    expect(requiredScope("HEAD", "/api/workflows/runs/20261107-120000-000000/artifact")).toBe("admin");
    expect(requiredScope("GET", "/api/workflows/runs/20261107-120000-000000/artifacts.zip")).toBe("admin");
  });
});
