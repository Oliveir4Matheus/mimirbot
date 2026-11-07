import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { workflowDefinitionSchema, type WorkflowDefinition } from "../../shared/workflow.ts";
import type { HostTurnResult } from "../coordinator.ts";
import { createWorkflowEngine, type WorkflowTurnOptions } from "./engine.ts";
import { WORKFLOWS_ROOT_ENV } from "./paths.ts";
import { createWorkflowStore, type WorkflowStore } from "./store.ts";

const NOW = new Date("2026-11-07T12:00:00.000Z").getTime();

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "omb-workflow-engine-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const definition = (overrides: Record<string, unknown> = {}): WorkflowDefinition => workflowDefinitionSchema.parse({
  id: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
  version: 1,
  name: "Contrato mensal",
  department: "Financeiro",
  steps: [
    { id: "coletar", name: "Collect", botId: "bot-a", instructions: "Collect the numbers.", outputs: [{ path: "numbers.csv" }] },
    { id: "revisar", name: "Review", botId: "bot-b", instructions: "Review the numbers.", inputs: [{ as: "numbers.csv", from: { step: "coletar", output: "numbers.csv" } }], outputs: [{ path: "decision.json" }], result: "decision.json", require: { ok: true } },
  ],
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

type TurnHandler = (botId: string, text: string, options: WorkflowTurnOptions) => Promise<void> | void;

function setup(def: WorkflowDefinition = definition(), createThread?: (input: { botId: string; title: string; cwd: string }) => string | null) {
  const store = createWorkflowStore({
    dataDir: join(root, "data"),
    env: { [WORKFLOWS_ROOT_ENV]: join(root, "runs") },
    now: () => NOW,
    log: () => {},
  });
  const saved = store.saveWorkflow(def);
  if (!saved.ok) throw new Error(saved.error);
  const calls: Array<{ botId: string; text: string; options: WorkflowTurnOptions }> = [];
  const broadcasts: Array<Record<string, unknown>> = [];
  let handler: TurnHandler = () => {};
  const engine = createWorkflowEngine({
    store,
    startTurn: async (botId, text, options) => {
      calls.push({ botId, text, options });
      await handler(botId, text, options);
    },
    createThread: createThread ?? ((input) => `thread-${input.botId}-${input.cwd.split(/[\\/]/).pop()}`),
    broadcast: (frame) => broadcasts.push(frame),
    now: () => NOW,
    log: () => {},
  });
  return { store, engine, calls, broadcasts, definition: saved.workflow, onTurn: (next: TurnHandler) => { handler = next; } };
}

const stepIndex = (store: WorkflowStore, options: WorkflowTurnOptions): number => {
  const run = store.readRun(options.workflowStep.runId)!;
  return run.steps.findIndex((step) => step.id === options.workflowStep.stepId);
};

const write = (store: WorkflowStore, options: WorkflowTurnOptions, files: Record<string, string>): void => {
  const run = store.readRun(options.workflowStep.runId)!;
  const output = join(store.stepFolder(run, stepIndex(store, options)), "output");
  for (const [path, content] of Object.entries(files)) writeFileSync(join(output, path), content);
};

const happy = (store: WorkflowStore): TurnHandler => (_botId, _text, options) => {
  write(store, options, options.workflowStep.stepId === "coletar"
    ? { "numbers.csv": "1,2,3\n" }
    : { "decision.json": JSON.stringify({ ok: true }) });
  options.onSettled({ ok: true, text: "done" });
};

describe("engine", () => {
  it("runs every step in order, verifies the outputs and keeps the last result", async () => {
    const { store, engine, calls, definition: def, broadcasts, onTurn } = setup();
    onTurn(happy(store));
    const run = engine.start(def.id);
    if (!run.ok) throw new Error(run.error);
    await engine.idle();
    const finished = store.readRun(run.run.id)!;
    expect(finished.status).toBe("succeeded");
    expect(finished.steps.map((step) => step.status)).toEqual(["succeeded", "succeeded"]);
    expect(finished.steps[0]!.verified).toEqual(["numbers.csv"]);
    expect(finished.steps[1]!.verified).toEqual(["decision.json"]);
    expect(finished.result).toEqual({ ok: true });
    expect(calls.map((call) => call.options.workflowStep.stepId)).toEqual(["coletar", "revisar"]);
    expect(calls[1]!.text).toContain("Step 2 of 2");
    expect(broadcasts.some((frame) => frame.kind === "workflow.run")).toBe(true);
  });

  it("copies a declared output into the next step's input/", async () => {
    const { store, engine, definition: def, onTurn } = setup();
    onTurn((_botId, _text, options) => {
      if (options.workflowStep.stepId === "coletar") {
        write(store, options, { "numbers.csv": "1,2,3\n" });
      } else {
        const run = store.readRun(options.workflowStep.runId)!;
        const input = join(store.stepFolder(run, stepIndex(store, options)), "input", "numbers.csv");
        write(store, options, { "decision.json": JSON.stringify({ ok: readFileSync(input, "utf8") === "1,2,3\n" }) });
      }
      options.onSettled({ ok: true, text: "done" });
    });
    const run = engine.start(def.id);
    if (!run.ok) throw new Error(run.error);
    await engine.idle();
    expect(store.readRun(run.run.id)!.status).toBe("succeeded");
  });

  it("fails the run when a required output is missing", async () => {
    const { store, engine, calls, definition: def, onTurn } = setup();
    onTurn((_botId, _text, options) => { options.onSettled({ ok: true, text: "done" }); });
    const run = engine.start(def.id);
    if (!run.ok) throw new Error(run.error);
    await engine.idle();
    const finished = store.readRun(run.run.id)!;
    expect(finished.status).toBe("failed");
    expect(finished.error).toContain("missing required output");
    expect(calls).toHaveLength(1);
  });

  it("fails the step with the result's own reason when require does not match", async () => {
    const { store, engine, definition: def, onTurn } = setup();
    onTurn((_botId, _text, options) => {
      write(store, options, options.workflowStep.stepId === "coletar"
        ? { "numbers.csv": "1,2,3\n" }
        : { "decision.json": JSON.stringify({ ok: false, reason: "not enough data" }) });
      options.onSettled({ ok: true, text: "done" });
    });
    const run = engine.start(def.id);
    if (!run.ok) throw new Error(run.error);
    await engine.idle();
    const finished = store.readRun(run.run.id)!;
    expect(finished.status).toBe("failed");
    expect(finished.error).toBe("not enough data");
  });

  it("fails the run with the turn's reason when the step's turn fails", async () => {
    const { store, engine, definition: def, onTurn } = setup();
    onTurn((_botId, _text, options) => { options.onSettled({ ok: false, text: "the provider failed" }); });
    const run = engine.start(def.id);
    if (!run.ok) throw new Error(run.error);
    await engine.idle();
    expect(store.readRun(run.run.id)!.error).toBe("the provider failed");
  });

  it("fails the run when startTurn throws", async () => {
    const { store, engine, definition: def, onTurn } = setup();
    onTurn(() => { throw new Error("thread is busy"); });
    const run = engine.start(def.id);
    if (!run.ok) throw new Error(run.error);
    await engine.idle();
    expect(store.readRun(run.run.id)!.error).toBe("thread is busy");
  });

  it("fails the run when the step's bot does not exist", async () => {
    const { store, engine, definition: def } = setup(definition(), () => null);
    const run = engine.start(def.id);
    if (!run.ok) throw new Error(run.error);
    await engine.idle();
    expect(store.readRun(run.run.id)!.error).toContain("does not exist");
  });

  it("refuses a Workflow it does not have", () => {
    const { engine } = setup();
    const started = engine.start("11111111-2222-4333-8444-555555555555");
    expect(started.ok).toBe(false);
  });

  it("cancels a run and ignores the turn that settles afterwards", async () => {
    const { store, engine, definition: def, onTurn } = setup();
    let settle: ((outcome: HostTurnResult) => void) | undefined;
    onTurn((_botId, _text, options) => { settle = options.onSettled; });
    const run = engine.start(def.id);
    if (!run.ok) throw new Error(run.error);
    await engine.idle();
    expect(store.readRun(run.run.id)!.status).toBe("running");
    const cancelled = engine.cancel(run.run.id, "person stopped it");
    expect(cancelled.ok).toBe(true);
    settle?.({ ok: true, text: "late" });
    await engine.idle();
    expect(store.readRun(run.run.id)!.status).toBe("cancelled");
    expect(store.readRun(run.run.id)!.error).toBe("person stopped it");
  });
});

describe("recover", () => {
  it("fails a step left running by a restart instead of running it twice", async () => {
    const { store, engine, definition: def } = setup();
    const run = store.createRun(def);
    store.writeRun({ ...run, status: "running", startedAt: NOW, steps: [{ id: "coletar", status: "running", attempts: 1, threadId: "t-1", startedAt: NOW }, ...run.steps.slice(1)] });
    engine.recover();
    await engine.idle();
    const recovered = store.readRun(run.id)!;
    expect(recovered.status).toBe("failed");
    expect(recovered.error).toContain("restarted");
    expect(recovered.steps[0]).toMatchObject({ status: "failed", attempts: 1 });
  });

  it("continues a queued run and a run stopped between steps", async () => {
    const { store, engine, definition: def, onTurn } = setup();
    onTurn(happy(store));
    const queued = store.createRun(def);
    const between = store.createRun(def);
    store.writeRun({ ...between, status: "running", startedAt: NOW });
    engine.recover();
    await engine.idle();
    expect(store.readRun(queued.id)!.status).toBe("succeeded");
    expect(store.readRun(between.id)!.status).toBe("succeeded");
  });
});
