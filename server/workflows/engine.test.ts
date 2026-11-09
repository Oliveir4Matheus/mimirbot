import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { workflowDefinitionSchema, type WorkflowDefinition, type WorkflowRun } from "../../shared/workflow.ts";
import type { HostTurnResult } from "../coordinator.ts";
import { createWorkflowEngine, type WorkflowTurnOptions } from "./engine.ts";
import { WORKFLOWS_ROOT_ENV, workflowScriptsDir } from "./paths.ts";
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

function setup(
  def: WorkflowDefinition = definition(),
  createThread?: (input: { botId: string; title: string; cwd: string }) => string | null,
  openCards?: (threadId: string) => Array<{ id: string; question: string }>,
  missingSkills?: (botId: string, skills: WorkflowTurnOptions["skills"]) => readonly string[],
) {
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
  const transitions: WorkflowRun[] = [];
  let handler: TurnHandler = () => {};
  const engine = createWorkflowEngine({
    store,
    startTurn: async (botId, text, options) => {
      calls.push({ botId, text, options });
      await handler(botId, text, options);
    },
    createThread: createThread ?? ((input) => `thread-${input.botId}-${input.cwd.split(/[\\/]/).pop()}`),
    broadcast: (frame) => broadcasts.push(frame),
    onRun: (run) => transitions.push(run),
    ...(openCards ? { openCards } : {}),
    ...(missingSkills ? { missingSkills } : {}),
    now: () => NOW,
    log: () => {},
  });
  return { store, engine, calls, broadcasts, transitions, definition: saved.workflow, onTurn: (next: TurnHandler) => { handler = next; } };
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

  it("routes a condition by the source step's result", async () => {
    const def = definition({
      steps: [
        { id: "revisar", name: "Review", botId: "bot-b", instructions: "Review.", outputs: [{ path: "decision.json" }], result: "decision.json" },
        { id: "checar", kind: "condition", name: "Check", from: "revisar", field: "ok", op: "equals", value: true, whenTrue: "fechar", whenFalse: "corrigir" },
        { id: "fechar", name: "Close", botId: "bot-a", instructions: "Close.", outputs: [{ path: "done.txt" }] },
        { id: "corrigir", name: "Fix", botId: "bot-a", instructions: "Fix.", outputs: [{ path: "fixed.txt" }] },
      ],
    });
    const { store, engine, calls, onTurn } = setup(def);
    onTurn((_botId, _text, options) => {
      if (options.workflowStep.stepId === "revisar") {
        write(store, options, { "decision.json": JSON.stringify({ ok: false }) });
      } else {
        write(store, options, { "fixed.txt": "fixed\n" });
      }
      options.onSettled({ ok: true, text: "done" });
    });
    const run = engine.start(def.id);
    if (!run.ok) throw new Error(run.error);
    await engine.idle();
    const finished = store.readRun(run.run.id)!;
    expect(finished.status).toBe("succeeded");
    expect(finished.steps.map((step) => step.status)).toEqual(["succeeded", "succeeded", "skipped", "succeeded"]);
    expect(finished.steps[1]!.verified).toEqual([]);
    expect(calls.map((call) => call.options.workflowStep.stepId)).toEqual(["revisar", "corrigir"]);
  });

  it("routes an all group by every line and an any group by one line", async () => {
    const groupDefinition = (match: "all" | "any"): WorkflowDefinition => definition({
      steps: [
        { id: "revisar", name: "Review", botId: "bot-b", instructions: "Review.", outputs: [{ path: "decision.json" }], result: "decision.json" },
        {
          id: "checar",
          kind: "condition",
          name: "Check",
          from: "revisar",
          match,
          conditions: [
            { field: "ok", op: "equals", value: true },
            { field: "check.total", op: "gte", value: 10 },
          ],
          whenTrue: "fechar",
          whenFalse: "corrigir",
        },
        { id: "fechar", name: "Close", botId: "bot-a", instructions: "Close.", outputs: [{ path: "done.txt" }], onSuccess: null },
        { id: "corrigir", name: "Fix", botId: "bot-a", instructions: "Fix.", outputs: [{ path: "fixed.txt" }], onSuccess: null },
      ],
    });
    const runGroup = async (match: "all" | "any") => {
      const def = groupDefinition(match);
      const { store, engine, calls, onTurn } = setup(def);
      onTurn((_botId, _text, options) => {
        if (options.workflowStep.stepId === "revisar") {
          write(store, options, { "decision.json": JSON.stringify({ ok: false, check: { total: 12 } }) });
        } else {
          write(store, options, { "done.txt": "done\n", "fixed.txt": "fixed\n" });
        }
        options.onSettled({ ok: true, text: "done" });
      });
      const run = engine.start(def.id);
      if (!run.ok) throw new Error(run.error);
      await engine.idle();
      return { run: store.readRun(run.run.id)!, calls };
    };

    const all = await runGroup("all");
    expect(all.run.status).toBe("succeeded");
    expect(all.calls.map((call) => call.options.workflowStep.stepId)).toEqual(["revisar", "corrigir"]);

    const any = await runGroup("any");
    expect(any.run.status).toBe("succeeded");
    expect(any.calls.map((call) => call.options.workflowStep.stepId)).toEqual(["revisar", "fechar"]);
  });

  it("fails the condition with the line and field when a comparison has the wrong type", async () => {
    const def = definition({
      steps: [
        { id: "revisar", name: "Review", botId: "bot-b", instructions: "Review.", outputs: [{ path: "decision.json" }], result: "decision.json" },
        {
          id: "checar",
          kind: "condition",
          name: "Check",
          from: "revisar",
          match: "all",
          conditions: [
            { field: "ok", op: "equals", value: true },
            { field: "total", op: "gt", value: 1 },
          ],
          whenTrue: "fechar",
          whenFalse: "corrigir",
        },
        { id: "fechar", name: "Close", botId: "bot-a", instructions: "Close.", outputs: [{ path: "done.txt" }] },
        { id: "corrigir", name: "Fix", botId: "bot-a", instructions: "Fix.", outputs: [{ path: "fixed.txt" }] },
      ],
    });
    const { store, engine, calls, onTurn } = setup(def);
    onTurn((_botId, _text, options) => {
      write(store, options, { "decision.json": JSON.stringify({ ok: true, total: "12" }) });
      options.onSettled({ ok: true, text: "done" });
    });
    const run = engine.start(def.id);
    if (!run.ok) throw new Error(run.error);
    await engine.idle();
    const finished = store.readRun(run.run.id)!;
    expect(finished.status).toBe("failed");
    expect(finished.steps[1]!.status).toBe("failed");
    expect(finished.steps[1]!.error).toContain("condition 2 (\"total\")");
    expect(calls.map((call) => call.options.workflowStep.stepId)).toEqual(["revisar"]);
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

describe("long approval", () => {
  const asked = (store: WorkflowStore): TurnHandler =>
    (_botId, _text, options) => {
      if (options.workflowStep.stepId === "coletar") {
        write(store, options, { "numbers.csv": "1,2,3\n" });
        options.onSettled({ ok: true, text: "asked the person" });
        return;
      }
      write(store, options, { "decision.json": JSON.stringify({ ok: true }) });
      options.onSettled({ ok: true, text: "done" });
    };

  it("waits on the step's open card and finishes the step once the person answers", async () => {
    let open: Array<{ id: string; question: string }> = [];
    const { store, engine, definition: def, onTurn } = setup(definition(), undefined, () => open);
    onTurn(asked(store));
    open = [{ id: "card-1", question: "Posso enviar o relatório?" }];
    const run = engine.start(def.id);
    if (!run.ok) throw new Error(run.error);
    await engine.idle();
    const paused = store.readRun(run.run.id)!;
    expect(paused.status).toBe("waiting_approval");
    expect(paused.pause).toMatchObject({ stepId: "coletar", question: "Posso enviar o relatório?", cardIds: ["card-1"] });
    expect(paused.steps[0]!.status).toBe("running");

    open = [];
    engine.turnSettled("thread-bot-a-step-1", "turn-1", { ok: true, text: "answered" });
    await engine.idle();
    const finished = store.readRun(run.run.id)!;
    expect(finished.status).toBe("succeeded");
    expect(finished.steps.map((step) => step.status)).toEqual(["succeeded", "succeeded"]);
  });

  it("pauses on the cards the host reports even when the conversation has none open", async () => {
    const { store, engine, definition: def, onTurn } = setup();
    onTurn((_botId, _text, options) => {
      options.onSettled({ ok: true, text: "waiting", cards: { question: "connect Gmail", ids: ["m-1"] } });
    });
    const run = engine.start(def.id);
    if (!run.ok) throw new Error(run.error);
    await engine.idle();
    const paused = store.readRun(run.run.id)!;
    expect(paused.status).toBe("waiting_approval");
    expect(paused.pause).toMatchObject({ cardIds: ["m-1"], question: "connect Gmail" });
  });

  it("resumes even when the answer arrives before the card is marked answered", async () => {
    let open: Array<{ id: string; question: string }> = [];
    const { store, engine, definition: def, onTurn } = setup(definition(), undefined, (threadId) => threadId.endsWith("step-1") ? open : []);
    onTurn(asked(store));
    open = [{ id: "card-1", question: "Posso enviar?" }];
    const run = engine.start(def.id);
    if (!run.ok) throw new Error(run.error);
    await engine.idle();
    expect(store.readRun(run.run.id)!.status).toBe("waiting_approval");

    engine.turnSettled("thread-bot-a-step-1", "turn-1", { ok: true, text: "answered" });
    await engine.idle();
    expect(store.readRun(run.run.id)!.status).toBe("succeeded");
  });

  it("keeps waiting when the answer leaves another card open", async () => {
    let open: Array<{ id: string; question: string }> = [];
    const { store, engine, definition: def, onTurn } = setup(definition(), undefined, () => open);
    onTurn(asked(store));
    open = [{ id: "card-1", question: "first?" }];
    const run = engine.start(def.id);
    if (!run.ok) throw new Error(run.error);
    await engine.idle();

    open = [{ id: "card-2", question: "second?" }];
    engine.turnSettled("thread-bot-a-step-1", "turn-1", { ok: true, text: "answered" });
    await engine.idle();
    const paused = store.readRun(run.run.id)!;
    expect(paused.status).toBe("waiting_approval");
    expect(paused.pause).toMatchObject({ cardIds: ["card-2"], question: "second?" });
    expect(paused.steps[0]!.status).toBe("running");
  });

  it("cancels the run with the refusal reason when the person denies the card", async () => {
    let open: Array<{ id: string; question: string }> = [];
    const { store, engine, definition: def, onTurn } = setup(definition(), undefined, () => open);
    onTurn(asked(store));
    open = [{ id: "card-1", question: "Posso enviar?" }];
    const run = engine.start(def.id);
    if (!run.ok) throw new Error(run.error);
    await engine.idle();

    const other = engine.refuse("thread-bot-a-step-1", "card-9");
    expect(other.ok).toBe(false);
    expect(store.readRun(run.run.id)!.status).toBe("waiting_approval");

    const refused = engine.refuse("thread-bot-a-step-1", "card-1");
    expect(refused.ok).toBe(true);
    await engine.idle();
    const cancelled = store.readRun(run.run.id)!;
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.error).toBe("aprovação negada");
    expect(cancelled.pause).toBeUndefined();
  });

  it("reports each turn once, so the host's cleanup settle cannot fail the step", async () => {
    let open: Array<{ id: string; question: string }> = [];
    const { store, engine, definition: def, onTurn } = setup(definition(), undefined, (threadId) => threadId.endsWith("step-1") ? open : []);
    onTurn(asked(store));
    open = [{ id: "card-1", question: "first?" }];
    const run = engine.start(def.id);
    if (!run.ok) throw new Error(run.error);
    await engine.idle();

    open = [{ id: "card-2", question: "second?" }];
    engine.turnSettled("thread-bot-a-step-1", "g1", { ok: true, text: "answered" });
    await engine.idle();
    engine.turnSettled("thread-bot-a-step-1", "g1", { ok: false, text: "The coordinated turn was interrupted" });
    await engine.idle();
    const paused = store.readRun(run.run.id)!;
    expect(paused.status).toBe("waiting_approval");
    expect(paused.pause).toMatchObject({ cardIds: ["card-2"] });

    open = [];
    engine.turnSettled("thread-bot-a-step-1", "g2", { ok: true, text: "answered" });
    await engine.idle();
    expect(store.readRun(run.run.id)!.status).toBe("succeeded");
  });

  it("resumes a paused run from its step's conversation after a restart", async () => {
    const { store, engine, definition: def } = setup();
    const run = store.createRun(def);
    writeFileSync(join(store.stepFolder(run, 0), "output", "numbers.csv"), "1,2,3\n");
    store.writeRun({
      ...run,
      status: "waiting_approval",
      startedAt: NOW,
      steps: [{ id: "coletar", status: "running", threadId: "t-1", startedAt: NOW }, run.steps[1]!],
      pause: { stepId: "coletar", question: "ok?", cardIds: ["card-1"], askedAt: NOW },
    });
    engine.recover();
    await engine.idle();
    expect(store.readRun(run.id)!.status).toBe("waiting_approval");
    expect(engine.ownsThread("t-1")).toBe(true);

    engine.turnSettled("t-1", "turn-1", { ok: true, text: "answered" });
    await engine.idle();
    const resumed = store.readRun(run.id)!;
    expect(resumed.steps[0]!.status).toBe("succeeded");
    expect(resumed.currentStep).toBe(1);
  });

  it("ignores a settled turn that belongs to no run", async () => {
    const { engine } = setup();
    expect(engine.ownsThread("someone-else")).toBe(false);
    engine.turnSettled("someone-else", "turn-1", { ok: true, text: "nothing" });
    await engine.idle();
  });
});

describe("recover", () => {
  it("fails a step left running by a restart instead of running it twice", async () => {
    const { store, engine, definition: def } = setup();
    const run = store.createRun(def);
    store.writeRun({ ...run, status: "running", startedAt: NOW, steps: [{ id: "coletar", status: "running", threadId: "t-1", startedAt: NOW }, ...run.steps.slice(1)] });
    engine.recover();
    await engine.idle();
    const recovered = store.readRun(run.id)!;
    expect(recovered.status).toBe("failed");
    expect(recovered.error).toContain("restarted");
    expect(recovered.steps[0]).toMatchObject({ status: "failed" });
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

describe("manual steps", () => {
  const manualFirst = () => definition({
    steps: [
      { id: "coletar", name: "Collect", botId: "bot-a", instructions: "Collect.", mode: "manual", outputs: [{ path: "numbers.csv" }] },
      { id: "revisar", name: "Review", botId: "bot-b", instructions: "Review.", inputs: [{ as: "numbers.csv", from: { step: "coletar", output: "numbers.csv" } }], outputs: [{ path: "decision.json" }], result: "decision.json", require: { ok: true } },
    ],
  });

  it("parks before a manual step without opening a thread, then resumes once", async () => {
    const def = manualFirst();
    const { store, engine, calls, onTurn } = setup(def);
    onTurn(happy(store));
    const started = engine.start(def.id);
    if (!started.ok) throw new Error(started.error);
    await engine.idle();

    const held = store.readRun(started.run.id)!;
    expect(held.status).toBe("waiting_manual");
    expect(held.hold).toEqual({ step: 0, since: NOW });
    expect(held.steps[0]).toMatchObject({ status: "pending" });
    expect(held.steps[0]!.threadId).toBeUndefined();
    expect(calls).toHaveLength(0);

    const resumed = engine.resume(started.run.id);
    expect(resumed.ok).toBe(true);
    expect(engine.resume(started.run.id).ok).toBe(false);

    await engine.idle();
    expect(store.readRun(started.run.id)!.status).toBe("succeeded");
    expect(calls.map((call) => call.options.workflowStep.stepId)).toEqual(["coletar", "revisar"]);
  });

  it("holds before a later manual step and keeps the earlier step running normally", async () => {
    const def = definition({
      steps: [
        { id: "coletar", name: "Collect", botId: "bot-a", instructions: "Collect.", outputs: [{ path: "numbers.csv" }] },
        { id: "revisar", name: "Review", botId: "bot-b", instructions: "Review.", mode: "manual", inputs: [{ as: "numbers.csv", from: { step: "coletar", output: "numbers.csv" } }], outputs: [{ path: "decision.json" }], result: "decision.json", require: { ok: true } },
      ],
    });
    const { store, engine, calls, onTurn } = setup(def);
    onTurn(happy(store));
    const started = engine.start(def.id);
    if (!started.ok) throw new Error(started.error);
    await engine.idle();

    const held = store.readRun(started.run.id)!;
    expect(held.status).toBe("waiting_manual");
    expect(held.hold?.step).toBe(1);
    expect(held.steps.map((step) => step.status)).toEqual(["succeeded", "pending"]);
    expect(calls.map((call) => call.options.workflowStep.stepId)).toEqual(["coletar"]);

    engine.resume(started.run.id);
    await engine.idle();
    expect(store.readRun(started.run.id)!.status).toBe("succeeded");
    expect(calls.map((call) => call.options.workflowStep.stepId)).toEqual(["coletar", "revisar"]);
  });

  it("keeps a manual run parked across a restart and resumes it afterwards", async () => {
    const def = manualFirst();
    const { store, engine, calls, transitions, onTurn } = setup(def);
    const run = store.createRun(def);
    store.writeRun({ ...run, status: "waiting_manual", startedAt: NOW, hold: { step: 0, since: NOW } });

    engine.recover();
    await engine.idle();
    expect(store.readRun(run.id)!.status).toBe("waiting_manual");
    expect(calls).toHaveLength(0);
    expect(transitions).toEqual([]);

    onTurn(happy(store));
    engine.resume(run.id);
    await engine.idle();
    expect(store.readRun(run.id)!.status).toBe("succeeded");
  });

  it("reports the waiting_manual transition once, and never again on recovery", async () => {
    const def = manualFirst();
    const { engine, transitions } = setup(def);
    const started = engine.start(def.id);
    if (!started.ok) throw new Error(started.error);
    await engine.idle();

    expect(transitions.filter((transition) => transition.status === "waiting_manual")).toHaveLength(1);

    engine.recover();
    await engine.idle();
    expect(transitions.filter((transition) => transition.status === "waiting_manual")).toHaveLength(1);
  });

  it("does not spend the step's timeout while the person is deciding", async () => {
    const def = definition({
      steps: [
        { id: "coletar", name: "Collect", botId: "bot-a", instructions: "Collect.", mode: "manual", timeoutMs: 20, outputs: [{ path: "numbers.csv" }] },
        { id: "revisar", name: "Review", botId: "bot-b", instructions: "Review.", inputs: [{ as: "numbers.csv", from: { step: "coletar", output: "numbers.csv" } }], outputs: [{ path: "decision.json" }], result: "decision.json", require: { ok: true } },
      ],
    });
    const { store, engine, onTurn } = setup(def);
    onTurn(happy(store));
    const started = engine.start(def.id);
    if (!started.ok) throw new Error(started.error);
    await engine.idle();
    expect(store.readRun(started.run.id)!.status).toBe("waiting_manual");

    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(store.readRun(started.run.id)!.status).toBe("waiting_manual");

    engine.resume(started.run.id);
    await engine.idle();
    expect(store.readRun(started.run.id)!.status).toBe("succeeded");
  });
});

describe("script steps and branching", () => {
  const scriptDefinition = (overrides: Record<string, unknown> = {}): WorkflowDefinition => workflowDefinitionSchema.parse({
    id: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
    version: 1,
    name: "Contrato mensal",
    department: "Financeiro",
    steps: [
      {
        id: "validar",
        kind: "script",
        name: "Validate",
        run: "validar.mjs",
        outputs: [{ path: "result.json" }],
        result: "result.json",
      },
      { id: "fechar", name: "Close", botId: "bot-b", instructions: "Close.", outputs: [{ path: "result.json" }], result: "result.json" },
    ],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  });

  const installScript = (def: WorkflowDefinition, source: string, name = "validar.mjs"): void => {
    const dir = workflowScriptsDir({ department: def.department, workflowId: def.id, env: { [WORKFLOWS_ROOT_ENV]: join(root, "runs") } });
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), source);
  };

  const writeResult = `import { writeFileSync } from "node:fs";\nwriteFileSync("output/result.json", JSON.stringify({ ok: true }));\n`;

  it("runs a script with no bot and verifies its result like any step", async () => {
    const def = scriptDefinition();
    installScript(def, writeResult);
    const { store, engine, calls, onTurn } = setup(def);
    onTurn((_botId, _text, options) => {
      write(store, options, { "result.json": JSON.stringify({ ok: true }) });
      options.onSettled({ ok: true, text: "done" });
    });
    const started = engine.start(def.id);
    if (!started.ok) throw new Error(started.error);
    await engine.idle();
    const finished = store.readRun(started.run.id)!;
    expect(finished.status).toBe("succeeded");
    expect(finished.currentStep).toBe(2);
    expect(finished.steps.map((step) => step.status)).toEqual(["succeeded", "succeeded"]);
    expect(finished.steps[0]!.verified).toEqual(["result.json"]);
    expect(calls.map((call) => call.options.workflowStep.stepId)).toEqual(["fechar"]);
  });

  it("continues on the declared onFailure path and keeps the failed step on record", async () => {
    const def = scriptDefinition({
      steps: [
        { id: "coletar", name: "Collect", botId: "bot-a", instructions: "Collect.", outputs: [{ path: "numbers.csv" }], onFailure: "avisar" },
        { id: "avisar", name: "Warn", botId: "bot-b", instructions: "Warn.", outputs: [{ path: "result.json" }], result: "result.json" },
        { id: "fechar", name: "Close", botId: "bot-b", instructions: "Close.", outputs: [{ path: "result.json" }], result: "result.json" },
      ],
    });
    const { store, engine, calls, onTurn } = setup(def);
    onTurn((_botId, _text, options) => {
      if (options.workflowStep.stepId !== "coletar") write(store, options, { "result.json": JSON.stringify({ ok: true }) });
      options.onSettled({ ok: true, text: "done" });
    });
    const started = engine.start(def.id);
    if (!started.ok) throw new Error(started.error);
    await engine.idle();
    const finished = store.readRun(started.run.id)!;
    expect(finished.status).toBe("succeeded");
    expect(finished.steps.map((step) => step.status)).toEqual(["failed", "succeeded", "succeeded"]);
    expect(finished.steps[0]!.error).toContain("missing required output");
    expect(calls.map((call) => call.options.workflowStep.stepId)).toEqual(["coletar", "avisar", "fechar"]);
  });

  it("routes a script that is missing on disk through onFailure", async () => {
    const def = scriptDefinition({
      steps: [
        { id: "validar", kind: "script", name: "Validate", run: "validar.mjs", outputs: [{ path: "result.json" }], result: "result.json", onFailure: "fechar" },
        { id: "fechar", name: "Close", botId: "bot-b", instructions: "Close.", outputs: [{ path: "result.json" }], result: "result.json" },
      ],
    });
    installScript(def, writeResult);
    const { store, engine, calls, onTurn } = setup(def);
    rmSync(join(workflowScriptsDir({ department: def.department, workflowId: def.id, env: { [WORKFLOWS_ROOT_ENV]: join(root, "runs") } }), "validar.mjs"));
    onTurn((_botId, _text, options) => {
      write(store, options, { "result.json": JSON.stringify({ ok: true }) });
      options.onSettled({ ok: true, text: "done" });
    });
    const started = engine.start(def.id);
    if (!started.ok) throw new Error(started.error);
    await engine.idle();
    const finished = store.readRun(started.run.id)!;
    expect(finished.status).toBe("succeeded");
    expect(finished.steps.map((step) => step.status)).toEqual(["failed", "succeeded"]);
    expect(finished.error).toBeUndefined();
    expect(calls.map((call) => call.options.workflowStep.stepId)).toEqual(["fechar"]);
  });

  it("marks the steps the chosen path never took as skipped", async () => {
    const def = scriptDefinition({
      steps: [
        {
          id: "validar",
          kind: "script",
          name: "Validate",
          run: "validar.mjs",
          outputs: [{ path: "result.json" }],
          result: "result.json",
          when: [{ field: "ok", equals: true, next: "fechar" }],
        },
        { id: "corrigir", name: "Fix", botId: "bot-b", instructions: "Fix.", outputs: [{ path: "result.json" }] },
        { id: "fechar", name: "Close", botId: "bot-b", instructions: "Close.", outputs: [{ path: "result.json" }], result: "result.json" },
      ],
    });
    installScript(def, writeResult);
    const { store, engine, onTurn } = setup(def);
    onTurn((_botId, _text, options) => {
      write(store, options, { "result.json": JSON.stringify({ ok: true }) });
      options.onSettled({ ok: true, text: "done" });
    });
    const started = engine.start(def.id);
    if (!started.ok) throw new Error(started.error);
    await engine.idle();
    const finished = store.readRun(started.run.id)!;
    expect(finished.steps.map((step) => step.status)).toEqual(["succeeded", "skipped", "succeeded"]);
  });

  it("routes a script that outlives its timeout through onTimeout", async () => {
    const def = scriptDefinition({
      steps: [
        { id: "validar", kind: "script", name: "Validate", run: "validar.mjs", timeoutMs: 1_000, onTimeout: "fechar", onFailure: "corrigir", outputs: [{ path: "result.json" }], result: "result.json" },
        { id: "corrigir", name: "Fix", botId: "bot-b", instructions: "Fix.", outputs: [{ path: "result.json" }], result: "result.json" },
        { id: "fechar", name: "Close", botId: "bot-b", instructions: "Close.", outputs: [{ path: "result.json" }], result: "result.json" },
      ],
    });
    installScript(def, `setTimeout(() => {}, 60_000);`);
    const { store, engine, calls, onTurn } = setup(def);
    onTurn((_botId, _text, options) => {
      write(store, options, { "result.json": JSON.stringify({ ok: true }) });
      options.onSettled({ ok: true, text: "done" });
    });
    const started = engine.start(def.id);
    if (!started.ok) throw new Error(started.error);
    await engine.idle();
    const finished = store.readRun(started.run.id)!;
    expect(finished.status).toBe("succeeded");
    expect(finished.steps.map((step) => step.status)).toEqual(["failed", "skipped", "succeeded"]);
    expect(finished.steps[0]).toMatchObject({ failureKind: "timeout" });
    expect(finished.steps[0]!.error).toContain("longer than 1000ms");
    expect(calls.map((call) => call.options.workflowStep.stepId)).toEqual(["fechar"]);
  });

  it("routes a script that exits with an error through onFailure, not onTimeout", async () => {
    const def = scriptDefinition({
      steps: [
        { id: "validar", kind: "script", name: "Validate", run: "validar.mjs", timeoutMs: 1_000, onTimeout: "fechar", onFailure: "corrigir", outputs: [{ path: "result.json" }], result: "result.json" },
        { id: "corrigir", name: "Fix", botId: "bot-b", instructions: "Fix.", outputs: [{ path: "result.json" }], result: "result.json" },
        { id: "fechar", name: "Close", botId: "bot-b", instructions: "Close.", outputs: [{ path: "result.json" }], result: "result.json" },
      ],
    });
    installScript(def, `console.error("broken"); process.exit(1);`);
    const { store, engine, calls, onTurn } = setup(def);
    onTurn((_botId, _text, options) => {
      write(store, options, { "result.json": JSON.stringify({ ok: true }) });
      options.onSettled({ ok: true, text: "done" });
    });
    const started = engine.start(def.id);
    if (!started.ok) throw new Error(started.error);
    await engine.idle();
    const finished = store.readRun(started.run.id)!;
    expect(finished.status).toBe("succeeded");
    expect(finished.steps.map((step) => step.status)).toEqual(["failed", "succeeded", "succeeded"]);
    expect(finished.steps[0]).toMatchObject({ failureKind: "failure" });
    expect(calls.map((call) => call.options.workflowStep.stepId)).toEqual(["corrigir", "fechar"]);
  });

  it("times out a bot step that never settles and follows onTimeout", async () => {
    const def = definition({
      steps: [
        { id: "coletar", name: "Collect", botId: "bot-a", instructions: "Collect.", timeoutMs: 20, onTimeout: "avisar", outputs: [{ path: "numbers.csv" }] },
        { id: "avisar", name: "Warn", botId: "bot-b", instructions: "Warn.", outputs: [{ path: "result.json" }], result: "result.json" },
      ],
    });
    const { store, engine, calls, onTurn } = setup(def);
    onTurn((_botId, _text, options) => {
      if (options.workflowStep.stepId !== "avisar") return;
      write(store, options, { "result.json": JSON.stringify({ ok: true }) });
      options.onSettled({ ok: true, text: "done" });
    });
    const started = engine.start(def.id);
    if (!started.ok) throw new Error(started.error);
    await engine.idle();
    await new Promise((resolve) => setTimeout(resolve, 80));
    await engine.idle();
    const finished = store.readRun(started.run.id)!;
    expect(finished.status).toBe("succeeded");
    expect(finished.steps[0]).toMatchObject({ status: "failed", failureKind: "timeout" });
    expect(finished.steps[0]!.error).toContain("timed out after 20ms");
    expect(finished.steps[1]!.status).toBe("succeeded");
    expect(calls.map((call) => call.options.workflowStep.stepId)).toEqual(["coletar", "avisar"]);
  });

  it("stops the timeout clock while the run waits for approval", async () => {
    let open: Array<{ id: string; question: string }> = [];
    const def = definition({
      steps: [
        { id: "coletar", name: "Collect", botId: "bot-a", instructions: "Collect.", timeoutMs: 20, onTimeout: "revisar", outputs: [{ path: "numbers.csv" }] },
        { id: "revisar", name: "Review", botId: "bot-b", instructions: "Review.", inputs: [{ as: "numbers.csv", from: { step: "coletar", output: "numbers.csv" } }], outputs: [{ path: "decision.json" }], result: "decision.json" },
      ],
    });
    const { store, engine, onTurn } = setup(def, undefined, (threadId) => threadId.endsWith("step-1") ? open : []);
    onTurn((_botId, _text, options) => {
      if (options.workflowStep.stepId === "coletar") {
        write(store, options, { "numbers.csv": "1,2,3\n" });
        options.onSettled({ ok: true, text: "asked", cards: { question: "ok?", ids: ["card-1"] } });
        return;
      }
      write(store, options, { "decision.json": JSON.stringify({ ok: true }) });
      options.onSettled({ ok: true, text: "done" });
    });
    open = [{ id: "card-1", question: "ok?" }];
    const started = engine.start(def.id);
    if (!started.ok) throw new Error(started.error);
    await engine.idle();
    expect(store.readRun(started.run.id)!.status).toBe("waiting_approval");
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(store.readRun(started.run.id)!.status).toBe("waiting_approval");
    open = [];
    engine.turnSettled("thread-bot-a-step-1", "turn-1", { ok: true, text: "answered" });
    await engine.idle();
    expect(store.readRun(started.run.id)!.status).toBe("succeeded");
  });
});

describe("step skills", () => {
  const oneStep = (skills?: Record<string, string[]>) => definition({
    steps: [{
      id: "coletar", name: "Collect", botId: "bot-a", instructions: "Collect.",
      ...(skills ? { skills } : {}),
      outputs: [{ path: "numbers.csv" }],
    }],
  });

  it("passes no selection when the step declares none", async () => {
    const def = oneStep();
    const { store, engine, calls, onTurn } = setup(def);
    onTurn((_botId, _text, options) => {
      write(store, options, { "numbers.csv": "1\n" });
      options.onSettled({ ok: true, text: "done" });
    });
    const started = engine.start(def.id);
    if (!started.ok) throw new Error(started.error);
    await engine.idle();
    expect(calls[0]!.options.skills).toBeUndefined();
  });

  it("passes exactly the declared groups to the turn", async () => {
    const def = oneStep({ bot: ["own"], bundled: ["create-bot"], imported: ["from-claude"] });
    const { store, engine, calls, onTurn } = setup(def);
    onTurn((_botId, _text, options) => {
      write(store, options, { "numbers.csv": "1\n" });
      options.onSettled({ ok: true, text: "done" });
    });
    const started = engine.start(def.id);
    if (!started.ok) throw new Error(started.error);
    await engine.idle();
    expect(calls[0]!.options.skills).toEqual({ bot: ["own"], bundled: ["create-bot"], imported: ["from-claude"] });
  });

  it("fails the step before its turn when a declared skill is gone", async () => {
    const def = oneStep({ bot: ["gone"] });
    const { store, engine, calls } = setup(def, undefined, undefined, (_botId, skills) => skills?.bot ?? []);
    const started = engine.start(def.id);
    if (!started.ok) throw new Error(started.error);
    await engine.idle();
    const run = store.readRun(started.run.id)!;
    expect(run.status).toBe("failed");
    expect(run.steps[0]!.error).toBe('skill "gone" is not available for this Workflow step');
    expect(calls).toHaveLength(0);
  });
});
