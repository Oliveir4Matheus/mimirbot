import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { workflowDefinitionSchema, type WorkflowDefinition, type WorkflowRun } from "../../shared/workflow.ts";
import { createWorkflowEngine, type WorkflowTurnOptions } from "./engine.ts";
import { WORKFLOWS_ROOT_ENV, workflowScriptsDir } from "./paths.ts";
import { createWorkflowStore, type WorkflowStore } from "./store.ts";

const NOW = new Date("2026-11-12T12:00:00.000Z").getTime();

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "omb-workflow-loop-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const baseDefinition = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
  version: 1,
  name: "Lote de clientes",
  department: "Financeiro",
  steps: [{
    id: "laco",
    kind: "loop",
    name: "Atualiza em lotes",
    body: [{
      id: "atualiza",
      kind: "script",
      name: "Atualiza 100",
      run: "atualiza.mjs",
      outputs: [{ path: "result.json" }],
      result: "result.json",
    }],
    from: "atualiza",
    conditions: [{ field: "restantes", op: "lte", value: 0 }],
    maxIterations: 5,
    outputs: [{ path: "result.json" }],
    result: "result.json",
  }],
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

const definition = (overrides: Record<string, unknown> = {}): WorkflowDefinition =>
  workflowDefinitionSchema.parse(baseDefinition(overrides));

type TurnHandler = (botId: string, text: string, options: WorkflowTurnOptions) => Promise<void> | void;

function setup(
  def: WorkflowDefinition = definition(),
  openCards?: (threadId: string) => Array<{ id: string; question: string }>,
  scripts: readonly { name: string; content: string }[] = [],
) {
  const store = createWorkflowStore({
    dataDir: join(root, "data"),
    env: { [WORKFLOWS_ROOT_ENV]: join(root, "runs") },
    now: () => NOW,
    log: () => {},
  });
  if (scripts.length > 0) {
    const dir = workflowScriptsDir({ department: def.department, workflowId: def.id, env: { [WORKFLOWS_ROOT_ENV]: join(root, "runs") } });
    mkdirSync(dir, { recursive: true });
    for (const script of scripts) writeFileSync(join(dir, script.name), script.content);
  }
  const saved = store.saveWorkflow(def);
  if (!saved.ok) throw new Error(saved.error);
  const calls: Array<{ botId: string; text: string; options: WorkflowTurnOptions }> = [];
  const transitions: WorkflowRun[] = [];
  let handler: TurnHandler = () => {};
  const engine = createWorkflowEngine({
    store,
    startTurn: async (botId, text, options) => {
      calls.push({ botId, text, options });
      await handler(botId, text, options);
    },
    createThread: (input) => `thread-${input.botId}-${input.cwd.split(/[\\/]/).pop()}`,
    broadcast: () => {},
    onRun: (run) => transitions.push(run),
    ...(openCards ? { openCards } : {}),
    now: () => NOW,
    log: () => {},
  });
  return { store, engine, calls, transitions, definition: saved.workflow, onTurn: (next: TurnHandler) => { handler = next; } };
}

function bodyOutputDir(store: WorkflowStore, options: WorkflowTurnOptions, bodyId: string): string {
  const run = store.readRun(options.workflowStep.runId)!;
  const loopIndex = run.steps.findIndex((step) => step.kind === "loop");
  const iteration = run.steps[loopIndex]!.iterations!.find((entry) => entry.status === "running")!;
  return join(store.runDir(run), "iterations", `iter-${iteration.index}`, `step-${bodyId}`, "output");
}

const writeBody = (store: WorkflowStore, options: WorkflowTurnOptions, files: Record<string, string>): void => {
  const dir = bodyOutputDir(store, options, options.workflowStep.stepId);
  mkdirSync(dir, { recursive: true });
  for (const [path, content] of Object.entries(files)) writeFileSync(join(dir, path), content);
};

const scriptBody = (body: Record<string, unknown>, overrides: Record<string, unknown> = {}): WorkflowDefinition => definition({
  steps: [{
    id: "laco",
    kind: "loop",
    name: "Atualiza em lotes",
    body: [{
      id: "atualiza",
      kind: "bot",
      name: "Atualiza 100",
      botId: "bot-a",
      instructions: "Update 100 rows.",
      outputs: [{ path: "result.json" }],
      result: "result.json",
      ...body,
    }],
    from: "atualiza",
    conditions: [{ field: "restantes", op: "lte", value: 0 }],
    maxIterations: 5,
    outputs: [{ path: "result.json" }],
    result: "result.json",
    ...overrides,
  }],
});

describe("Do While contract", () => {
  it("accepts a minimal loop and applies the documented defaults", () => {
    const minimal = baseDefinition();
    const rawLoop = (minimal.steps as Array<Record<string, unknown>>)[0]!;
    delete rawLoop.maxIterations;
    delete rawLoop.match;
    const parsed = workflowDefinitionSchema.parse(minimal);
    const loop = parsed.steps[0]!;
    expect(loop.kind).toBe("loop");
    if (loop.kind !== "loop") throw new Error("not a loop");
    expect(loop.match).toBe("all");
    expect(loop.maxIterations).toBe(1);
    expect(loop.conditions).toHaveLength(1);
  });

  it("counts top-level steps and every body toward the 40-step limit", () => {
    const base = baseDefinition();
    const loopStep = (base.steps as Array<Record<string, unknown>>)[0]!;
    loopStep.body = Array.from({ length: 20 }, (_, index) => ({
      id: `body-${index}`,
      kind: "bot",
      name: `Body ${index}`,
      botId: "bot-a",
      instructions: "Body.",
      outputs: [{ path: `body-${index}.txt` }],
    }));
    loopStep.from = "body-0";
    loopStep.outputs = [{ path: "body-0.txt", required: true }];
    loopStep.result = "body-0.txt";
    base.steps = [
      loopStep,
      ...Array.from({ length: 21 }, (_, index) => ({
        id: `top-${index}`,
        kind: "bot",
        name: `Top ${index}`,
        botId: "bot-a",
        instructions: "Top.",
        outputs: [{ path: `top-${index}.txt` }],
      })),
    ];
    const parsed = workflowDefinitionSchema.safeParse(base);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.message.includes("at most 40 steps"))).toBe(true);
    }
  });

  it("refuses a nested loop", () => {
    const nested = baseDefinition({
      steps: [{
        id: "laco",
        kind: "loop",
        name: "Outer",
        body: [{
          id: "inner",
          kind: "loop",
          name: "Inner",
          body: [{ id: "atualiza", kind: "script", name: "A", run: "a.mjs", outputs: [{ path: "result.json" }], result: "result.json" }],
          from: "atualiza",
          conditions: [{ field: "ok", op: "equals", value: true }],
          maxIterations: 1,
          outputs: [{ path: "result.json" }],
        }],
        from: "inner",
        conditions: [{ field: "ok", op: "equals", value: true }],
        maxIterations: 1,
        outputs: [{ path: "result.json" }],
      }],
    });
    expect(workflowDefinitionSchema.safeParse(nested).success).toBe(false);
  });

  it("refuses a body edge that leaves the body or points backwards", () => {
    const outside = baseDefinition({
      steps: [
        {
          id: "laco",
          kind: "loop",
          name: "Loop",
          body: [{
            id: "atualiza",
            kind: "script",
            name: "A",
            run: "a.mjs",
            outputs: [{ path: "result.json" }],
            result: "result.json",
            onSuccess: "depois",
          }],
          from: "atualiza",
          conditions: [{ field: "ok", op: "equals", value: true }],
          maxIterations: 1,
          outputs: [{ path: "result.json" }],
        },
        { id: "depois", kind: "script", name: "After", run: "b.mjs", outputs: [{ path: "done.txt" }] },
      ],
    });
    expect(workflowDefinitionSchema.safeParse(outside).success).toBe(false);

    const backwards = baseDefinition({
      steps: [{
        id: "laco",
        kind: "loop",
        name: "Loop",
        body: [
          { id: "primeiro", kind: "script", name: "First", run: "a.mjs", outputs: [{ path: "result.json" }], result: "result.json", onFailure: "segundo" },
          { id: "segundo", kind: "script", name: "Second", run: "b.mjs", outputs: [{ path: "done.txt" }], onSuccess: "primeiro" },
        ],
        from: "primeiro",
        conditions: [{ field: "ok", op: "equals", value: true }],
        maxIterations: 1,
        outputs: [{ path: "result.json" }],
      }],
    });
    expect(workflowDefinitionSchema.safeParse(backwards).success).toBe(false);
  });

  it("refuses an ambiguous output and a required loop output from an optional body output", () => {
    const ambiguous = baseDefinition({
      steps: [{
        id: "laco",
        kind: "loop",
        name: "Loop",
        body: [
          { id: "a", kind: "script", name: "A", run: "a.mjs", outputs: [{ path: "result.json" }], result: "result.json" },
          { id: "b", kind: "script", name: "B", run: "b.mjs", outputs: [{ path: "result.json" }], result: "result.json" },
        ],
        from: "a",
        conditions: [{ field: "ok", op: "equals", value: true }],
        maxIterations: 1,
        outputs: [{ path: "result.json" }],
      }],
    });
    expect(workflowDefinitionSchema.safeParse(ambiguous).success).toBe(false);

    const optional = baseDefinition({
      steps: [{
        id: "laco",
        kind: "loop",
        name: "Loop",
        body: [{ id: "a", kind: "script", name: "A", run: "a.mjs", outputs: [{ path: "result.json", required: false }], result: "result.json" }],
        from: "a",
        conditions: [{ field: "ok", op: "equals", value: true }],
        maxIterations: 1,
        outputs: [{ path: "result.json", required: true }],
      }],
    });
    expect(workflowDefinitionSchema.safeParse(optional).success).toBe(false);
  });

  it("refuses a loop field that belongs only to executable steps", () => {
    const withMode = {
      ...definition(),
      steps: [{ ...definition().steps[0], mode: "manual" }],
    };
    expect(workflowDefinitionSchema.safeParse(withMode).success).toBe(false);
  });

  it("reads canvas.loops and refuses a note link to the main canvas", () => {
    const valid = baseDefinition({
      canvas: {
        nodes: { laco: { x: 10, y: 20 } },
        notes: [],
        containers: [],
        loops: {
          laco: {
            nodes: { atualiza: { x: 40, y: 60 } },
            notes: [],
            containers: [],
          },
        },
      },
    });
    expect(workflowDefinitionSchema.safeParse(valid).success).toBe(true);

    const badLink = baseDefinition({
      canvas: {
        nodes: { laco: { x: 10, y: 20 } },
        notes: [],
        containers: [],
        loops: {
          laco: {
            nodes: { atualiza: { x: 40, y: 60 } },
            notes: [{ id: "n1", x: 1, y: 1, width: 200, height: 100, markdown: "", link: { kind: "step", id: "laco" } }],
            containers: [],
          },
        },
      },
    });
    expect(workflowDefinitionSchema.safeParse(badLink).success).toBe(false);
  });
});

describe("Do While engine", () => {
  it("runs the body at least once even when the condition is already true", async () => {
    const def = scriptBody({}, {});
    const { store, engine, calls, onTurn } = setup(def);
    onTurn((_bot, _text, options) => {
      writeBody(store, options, { "result.json": JSON.stringify({ restantes: 0 }) });
      options.onSettled({ ok: true, text: "done" });
    });
    const started = engine.start(def.id);
    if (!started.ok) throw new Error(started.error);
    await engine.idle();
    const run = store.readRun(started.run.id)!;
    expect(run.status).toBe("succeeded");
    expect(run.steps[0]!.iterations).toHaveLength(1);
    expect(run.steps[0]!.iterations![0]!.conditionMatched).toBe(true);
    expect(run.steps[0]!.verified).toEqual(["result.json"]);
    expect(calls).toHaveLength(1);
  });

  it("repeats until the counter reaches zero and keeps every round", async () => {
    const def = scriptBody({}, { maxIterations: 5 });
    const { store, engine, calls, onTurn } = setup(def);
    let counter = 0;
    onTurn((_bot, _text, options) => {
      const restantes = [2, 1, 0][counter] ?? 0;
      counter += 1;
      writeBody(store, options, { "result.json": JSON.stringify({ restantes }) });
      options.onSettled({ ok: true, text: "done" });
    });
    const started = engine.start(def.id);
    if (!started.ok) throw new Error(started.error);
    await engine.idle();
    const run = store.readRun(started.run.id)!;
    const loop = run.steps[0]!;
    expect(run.status).toBe("succeeded");
    expect(calls).toHaveLength(3);
    expect(loop.iterations).toHaveLength(3);
    expect(loop.iterations!.map((iteration) => iteration.status)).toEqual(["succeeded", "succeeded", "succeeded"]);
    expect(loop.iterations!.map((iteration) => iteration.conditionMatched)).toEqual([false, false, true]);
    expect(loop.iterations![2]!.condition).toMatchObject({ field: "restantes", op: "lte", value: 0 });
    expect(run.result).toEqual({ restantes: 0 });
  });

  it("fails with the iteration limit and follows onFailure", async () => {
    const def = definition({
      steps: [
        scriptBody({}, { maxIterations: 2 }).steps[0]!,
        { id: "fallback", kind: "bot", name: "Fallback", botId: "bot-a", instructions: "Fallback.", outputs: [{ path: "done.txt" }] },
      ],
    });
    const loop = def.steps[0];
    if (loop?.kind !== "loop") throw new Error("not a loop");
    (loop as { onFailure?: string }).onFailure = "fallback";
    const parsed = workflowDefinitionSchema.parse(def);
    const { store, engine, calls, onTurn } = setup(parsed);
    onTurn((_bot, _text, options) => {
      if (options.workflowStep.stepId === "fallback") {
        const run = store.readRun(options.workflowStep.runId)!;
        const index = run.steps.findIndex((step) => step.id === "fallback");
        writeFileSync(join(store.stepFolder(run, index), "output", "done.txt"), "done\n");
      } else {
        writeBody(store, options, { "result.json": JSON.stringify({ restantes: 99 }) });
      }
      options.onSettled({ ok: true, text: "done" });
    });
    const started = engine.start(parsed.id);
    if (!started.ok) throw new Error(started.error);
    await engine.idle();
    const run = store.readRun(started.run.id)!;
    const loopState = run.steps[0]!;
    expect(loopState.status).toBe("failed");
    expect(loopState.failureKind).toBe("limit");
    expect(loopState.error).toContain('step "laco" reached the iteration limit of 2');
    expect(loopState.iterations).toHaveLength(2);
    expect(loopState.iterations![1]!.failureKind).toBe("limit");
    expect(run.steps[1]!.status).toBe("succeeded");
    expect(calls.some((call) => call.options.workflowStep.stepId === "fallback")).toBe(true);
  });

  it("fails when the source step did not run in the round", async () => {
    const def = definition({
      steps: [{
        id: "laco",
        kind: "loop",
        name: "Loop",
        body: [
          { id: "prep", kind: "bot", name: "Prep", botId: "bot-a", instructions: "Prep.", outputs: [{ path: "sinal.json" }], result: "sinal.json" },
          { id: "gate", kind: "condition", name: "Gate", from: "prep", conditions: [{ field: "stop", op: "equals", value: true }], whenTrue: null },
          { id: "atualiza", kind: "bot", name: "Update", botId: "bot-a", instructions: "Update.", outputs: [{ path: "result.json" }], result: "result.json" },
        ],
        from: "atualiza",
        conditions: [{ field: "restantes", op: "lte", value: 0 }],
        maxIterations: 3,
        outputs: [{ path: "result.json" }],
      }],
    });
    const { store, engine, onTurn } = setup(def);
    onTurn((_bot, _text, options) => {
      writeBody(store, options, { "sinal.json": JSON.stringify({ stop: true }) });
      options.onSettled({ ok: true, text: "done" });
    });
    const started = engine.start(def.id);
    if (!started.ok) throw new Error(started.error);
    await engine.idle();
    const run = store.readRun(started.run.id)!;
    expect(run.status).toBe("failed");
    expect(run.steps[0]!.status).toBe("failed");
    expect(run.error).toContain('could not read step "atualiza"');
  });

  it("fails when a comparison has the wrong type", async () => {
    const def = scriptBody({});
    const { store, engine, onTurn } = setup(def);
    onTurn((_bot, _text, options) => {
      writeBody(store, options, { "result.json": JSON.stringify({ restantes: "zero" }) });
      options.onSettled({ ok: true, text: "done" });
    });
    const started = engine.start(def.id);
    if (!started.ok) throw new Error(started.error);
    await engine.idle();
    const run = store.readRun(started.run.id)!;
    expect(run.status).toBe("failed");
    expect(run.error).toContain("needs two numbers");
  });

  it("fails the loop when a body step fails without a route", async () => {
    const def = scriptBody({});
    const { store, engine, onTurn } = setup(def);
    onTurn((_bot, _text, options) => {
      options.onSettled({ ok: false, text: "database locked" });
    });
    const started = engine.start(def.id);
    if (!started.ok) throw new Error(started.error);
    await engine.idle();
    const run = store.readRun(started.run.id)!;
    expect(run.status).toBe("failed");
    expect(run.steps[0]!.status).toBe("failed");
    expect(run.steps[0]!.iterations![0]!.status).toBe("failed");
    expect(run.steps[0]!.iterations![0]!.steps[0]!.status).toBe("failed");
  });

  it("keeps a failed body step visible when its own route lets the round continue", async () => {
    const def = definition({
      steps: [{
        id: "laco",
        kind: "loop",
        name: "Loop",
        body: [
          {
            id: "tenta", kind: "bot", name: "Try", botId: "bot-a", instructions: "Try.",
            outputs: [{ path: "tentativa.json" }], result: "tentativa.json", onFailure: "recupera",
          },
          {
            id: "recupera", kind: "bot", name: "Recover", botId: "bot-a", instructions: "Recover.",
            outputs: [{ path: "result.json" }], result: "result.json",
          },
        ],
        from: "recupera",
        conditions: [{ field: "restantes", op: "lte", value: 0 }],
        maxIterations: 3,
        outputs: [{ path: "result.json" }],
      }],
    });
    const { store, engine, onTurn } = setup(def);
    onTurn((_bot, _text, options) => {
      if (options.workflowStep.stepId === "tenta") {
        options.onSettled({ ok: false, text: "locked" });
        return;
      }
      writeBody(store, options, { "result.json": JSON.stringify({ restantes: 0 }) });
      options.onSettled({ ok: true, text: "done" });
    });
    const started = engine.start(def.id);
    if (!started.ok) throw new Error(started.error);
    await engine.idle();
    const run = store.readRun(started.run.id)!;
    expect(run.status).toBe("succeeded");
    const iteration = run.steps[0]!.iterations![0]!;
    expect(iteration.status).toBe("succeeded");
    expect(iteration.steps[0]!.status).toBe("failed");
    expect(iteration.steps[1]!.status).toBe("succeeded");
  });

  it("ends the round when a body condition has a null branch", async () => {
    const def = definition({
      steps: [{
        id: "laco",
        kind: "loop",
        name: "Loop",
        body: [
          { id: "prep", kind: "bot", name: "Prep", botId: "bot-a", instructions: "Prep.", outputs: [{ path: "sinal.json" }], result: "sinal.json" },
          { id: "gate", kind: "condition", name: "Gate", from: "prep", conditions: [{ field: "stop", op: "equals", value: true }], whenTrue: null, whenFalse: "atualiza" },
          { id: "atualiza", kind: "bot", name: "Update", botId: "bot-a", instructions: "Update.", outputs: [{ path: "result.json" }], result: "result.json" },
        ],
        from: "prep",
        conditions: [{ field: "stop", op: "equals", value: true }],
        maxIterations: 3,
        outputs: [{ path: "sinal.json" }],
        result: "sinal.json",
      }],
    });
    const { store, engine, calls, onTurn } = setup(def);
    onTurn((_bot, _text, options) => {
      writeBody(store, options, { "sinal.json": JSON.stringify({ stop: true }) });
      options.onSettled({ ok: true, text: "done" });
    });
    const started = engine.start(def.id);
    if (!started.ok) throw new Error(started.error);
    await engine.idle();
    const run = store.readRun(started.run.id)!;
    expect(run.status).toBe("succeeded");
    expect(calls.map((call) => call.options.workflowStep.stepId)).toEqual(["prep"]);
    expect(run.steps[0]!.iterations![0]!.steps[2]!.status).toBe("skipped");
  });

  it("parks before a manual body step and resumes it once", async () => {
    const def = scriptBody({ mode: "manual" });
    const { store, engine, calls, onTurn } = setup(def);
    onTurn((_bot, _text, options) => {
      writeBody(store, options, { "result.json": JSON.stringify({ restantes: 0 }) });
      options.onSettled({ ok: true, text: "done" });
    });
    const started = engine.start(def.id);
    if (!started.ok) throw new Error(started.error);
    await engine.idle();
    const held = store.readRun(started.run.id)!;
    expect(held.status).toBe("waiting_manual");
    expect(held.hold?.path).toEqual([0, 0, 0]);
    expect(calls).toHaveLength(0);

    expect(engine.resume(started.run.id).ok).toBe(true);
    expect(engine.resume(started.run.id).ok).toBe(false);
    await engine.idle();
    expect(store.readRun(started.run.id)!.status).toBe("succeeded");
    expect(calls).toHaveLength(1);
  });

  it("pauses for approval in the body and resumes on the settled turn", async () => {
    let open: Array<{ id: string; question: string }> = [];
    const def = scriptBody({ kind: "bot", botId: "bot-a", instructions: "Update." });
    const { store, engine, calls, onTurn } = setup(def, () => open);
    let first = true;
    onTurn((_bot, _text, options) => {
      if (first) {
        first = false;
        open = [{ id: "card-1", question: "continue?" }];
        options.onSettled({ ok: true, text: "need approval" });
        return;
      }
      open = [];
      writeBody(store, options, { "result.json": JSON.stringify({ restantes: 0 }) });
      options.onSettled({ ok: true, text: "done" });
    });
    const started = engine.start(def.id);
    if (!started.ok) throw new Error(started.error);
    await engine.idle();
    const paused = store.readRun(started.run.id)!;
    expect(paused.status).toBe("waiting_approval");
    expect(paused.pause?.path).toEqual([0, 0, 0]);

    const threadId = paused.steps[0]!.iterations![0]!.steps[0]!.threadId!;
    const output = join(store.runDir(paused), "iterations", "iter-1", "step-atualiza", "output");
    writeFileSync(join(output, "result.json"), JSON.stringify({ restantes: 0 }));
    engine.turnSettled(threadId, "g2", { ok: true, text: "approved" });
    await engine.idle();
    const resumed = store.readRun(started.run.id)!;
    expect(resumed.status).toBe("succeeded");
    expect(calls).toHaveLength(1);
  });

  it("cancels a waiting body step and marks the round and loop skipped", async () => {
    const def = scriptBody({ mode: "manual" });
    const { store, engine, onTurn } = setup(def);
    onTurn(() => {});
    const started = engine.start(def.id);
    if (!started.ok) throw new Error(started.error);
    await engine.idle();
    expect(store.readRun(started.run.id)!.status).toBe("waiting_manual");

    const cancelled = engine.cancel(started.run.id, "stop");
    expect(cancelled.ok).toBe(true);
    const run = store.readRun(started.run.id)!;
    expect(run.status).toBe("cancelled");
    expect(run.steps[0]!.status).toBe("skipped");
    expect(run.steps[0]!.iterations![0]!.status).toBe("skipped");
    expect(run.steps[0]!.iterations![0]!.steps[0]!.status).toBe("skipped");
  });

  it("fails a running body step on recovery instead of running it twice", async () => {
    const def = scriptBody({});
    const { store, engine } = setup(def);
    const run = store.createRun(def);
    store.writeRun({
      ...run,
      status: "running",
      startedAt: NOW,
      steps: [{
        id: "laco",
        status: "running",
        kind: "loop",
        startedAt: NOW,
        iterations: [{
          index: 1,
          status: "running",
          startedAt: NOW,
          steps: [{ id: "atualiza", status: "running", threadId: "t-1", startedAt: NOW }],
        }],
      }],
    });
    engine.recover();
    await engine.idle();
    const recovered = store.readRun(run.id)!;
    expect(recovered.status).toBe("failed");
    expect(recovered.steps[0]!.status).toBe("failed");
    expect(recovered.steps[0]!.iterations![0]!.steps[0]!.status).toBe("failed");
    expect(recovered.steps[0]!.iterations![0]!.steps[0]!.error).toContain("restarted");
  });

  it("projects the last round's outputs into the loop output and copies them downstream", async () => {
    const def = definition({
      steps: [
        {
          id: "laco",
          kind: "loop",
          name: "Loop",
          body: [{
            id: "atualiza",
            kind: "bot",
            name: "Update",
            botId: "bot-a",
            instructions: "Update.",
            outputs: [{ path: "registros.json" }],
            result: "registros.json",
          }],
          from: "atualiza",
          conditions: [{ field: "restantes", op: "lte", value: 0 }],
          maxIterations: 3,
          outputs: [{ path: "registros.json" }],
          result: "registros.json",
        },
        {
          id: "revisar",
          kind: "bot",
          name: "Review",
          botId: "bot-b",
          instructions: "Review.",
          inputs: [{ as: "registros.json", from: { step: "laco", output: "registros.json" } }],
          outputs: [{ path: "decision.json" }],
          result: "decision.json",
        },
      ],
    });
    const { store, engine, calls, onTurn } = setup(def);
    let round = 0;
    onTurn((_bot, _text, options) => {
      if (options.workflowStep.stepId === "atualiza") {
        round += 1;
        const restantes = round === 1 ? 100 : 0;
        writeBody(store, options, { "registros.json": JSON.stringify({ updated: 100, restantes }) });
        options.onSettled({ ok: true, text: "done" });
        return;
      }
      const run = store.readRun(options.workflowStep.runId)!;
      const index = run.steps.findIndex((step) => step.id === "revisar");
      const input = join(store.stepFolder(run, index), "input", "registros.json");
      const content = readFileSync(input, "utf8");
      const output = join(store.stepFolder(run, index), "output");
      writeFileSync(join(output, "decision.json"), JSON.stringify({ seen: JSON.parse(content) }));
      options.onSettled({ ok: true, text: "done" });
    });
    const started = engine.start(def.id);
    if (!started.ok) throw new Error(started.error);
    await engine.idle();
    const run = store.readRun(started.run.id)!;
    expect(run.status).toBe("succeeded");
    expect(run.steps[0]!.verified).toEqual(["registros.json"]);
    expect(run.result).toEqual({ seen: { updated: 100, restantes: 0 } });
    expect(calls.map((call) => call.options.workflowStep.stepId)).toEqual(["atualiza", "atualiza", "revisar"]);
  });

  it("gives a body step an input from an earlier top-level step", async () => {
    const def = definition({
      steps: [
        { id: "preparar", kind: "bot", name: "Prepare", botId: "bot-a", instructions: "Prepare.", outputs: [{ path: "dados.csv" }] },
        {
          id: "laco",
          kind: "loop",
          name: "Loop",
          body: [{
            id: "atualiza",
            kind: "bot",
            name: "Update",
            botId: "bot-a",
            instructions: "Update.",
            inputs: [{ as: "dados.csv", from: { step: "preparar", output: "dados.csv" } }],
            outputs: [{ path: "result.json" }],
            result: "result.json",
          }],
          from: "atualiza",
          conditions: [{ field: "restantes", op: "lte", value: 0 }],
          maxIterations: 2,
          outputs: [{ path: "result.json" }],
        },
      ],
    });
    const { store, engine, onTurn } = setup(def);
    onTurn((_bot, _text, options) => {
      if (options.workflowStep.stepId === "preparar") {
        const run = store.readRun(options.workflowStep.runId)!;
        const index = run.steps.findIndex((step) => step.id === "preparar");
        writeFileSync(join(store.stepFolder(run, index), "output", "dados.csv"), "id\n1\n");
        options.onSettled({ ok: true, text: "done" });
        return;
      }
      const run = store.readRun(options.workflowStep.runId)!;
      const loopIndex = run.steps.findIndex((step) => step.kind === "loop");
      const iteration = run.steps[loopIndex]!.iterations!.find((entry) => entry.status === "running")!;
      const input = join(store.runDir(run), "iterations", `iter-${iteration.index}`, "step-atualiza", "input", "dados.csv");
      const seen = readFileSync(input, "utf8");
      writeBody(store, options, { "result.json": JSON.stringify({ restantes: 0, seen }) });
      options.onSettled({ ok: true, text: "done" });
    });
    const started = engine.start(def.id);
    if (!started.ok) throw new Error(started.error);
    await engine.idle();
    const run = store.readRun(started.run.id)!;
    expect(run.status).toBe("succeeded");
    expect(run.steps[1]!.iterations![0]!.result).toEqual({ restantes: 0, seen: "id\n1\n" });
  });

  it("runs a real script body for three rounds and projects its last result", async () => {
    const content = [
      'import { readFileSync, writeFileSync } from "node:fs";',
      'import { join } from "node:path";',
      'const counter = join(process.cwd(), "..", "..", "..", ".counter");',
      "let round = 0;",
      'try { round = Number(readFileSync(counter, "utf8")) || 0; } catch {}',
      "round += 1;",
      'writeFileSync(counter, String(round));',
      "const restantes = [150, 50, 0][round - 1] ?? 0;",
      'writeFileSync(join(process.env.WORKFLOW_STEP_OUTPUT, "result.json"), JSON.stringify({ lote: round, restantes }));',
      "",
    ].join("\n");
    const def = definition({
      steps: [{
        id: "laco",
        kind: "loop",
        name: "Atualiza em lotes",
        body: [{
          id: "atualiza",
          kind: "script",
          name: "Atualiza 100",
          run: "atualiza.mjs",
          timeoutMs: 20_000,
          outputs: [{ path: "result.json" }],
          result: "result.json",
        }],
        from: "atualiza",
        conditions: [{ field: "restantes", op: "lte", value: 0 }],
        maxIterations: 5,
        outputs: [{ path: "result.json" }],
        result: "result.json",
      }],
    });
    const { store, engine } = setup(def, undefined, [{ name: "atualiza.mjs", content }]);
    const started = engine.start(def.id);
    if (!started.ok) throw new Error(started.error);
    await engine.idle();
    const run = store.readRun(started.run.id)!;
    const loop = run.steps[0]!;
    expect(run.status).toBe("succeeded");
    expect(loop.iterations).toHaveLength(3);
    expect(loop.iterations!.map((iteration) => iteration.result)).toEqual([
      { lote: 1, restantes: 150 },
      { lote: 2, restantes: 50 },
      { lote: 3, restantes: 0 },
    ]);
    expect(run.result).toEqual({ lote: 3, restantes: 0 });
    expect(loop.verified).toEqual(["result.json"]);
    expect(JSON.parse(readFileSync(join(store.stepFolder(run, 0), "output", "result.json"), "utf8"))).toEqual({ lote: 3, restantes: 0 });
  });

  it("ends the run on onSuccess null after the loop", async () => {
    const def = definition({
      steps: [
        scriptBody({}).steps[0]!,
        { id: "depois", kind: "bot", name: "After", botId: "bot-a", instructions: "After.", outputs: [{ path: "done.txt" }] },
      ],
    });
    const loop = def.steps[0];
    if (loop?.kind !== "loop") throw new Error("not a loop");
    (loop as { onSuccess?: string | null }).onSuccess = null;
    const parsed = workflowDefinitionSchema.parse(def);
    const { store, engine, calls, onTurn } = setup(parsed);
    onTurn((_bot, _text, options) => {
      writeBody(store, options, { "result.json": JSON.stringify({ restantes: 0 }) });
      options.onSettled({ ok: true, text: "done" });
    });
    const started = engine.start(parsed.id);
    if (!started.ok) throw new Error(started.error);
    await engine.idle();
    const run = store.readRun(started.run.id)!;
    expect(run.status).toBe("succeeded");
    expect(run.steps[1]!.status).toBe("skipped");
    expect(calls).toHaveLength(1);
  });
});
