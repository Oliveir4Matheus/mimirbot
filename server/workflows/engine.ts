// The engine is the only code that decides what runs next. It copies a step's
// declared inputs, opens one thread with cwd = step-N, waits for that turn's
// single onSettled, verifies the declared outputs (and `require`), and only
// then moves on. A run advances one step at a time; a step that fails stops it.
import { requireMismatch, type WorkflowRun } from "../../shared/workflow.ts";
import type { HostTurnResult } from "../coordinator.ts";
import { stepBrief, stepThreadTitle } from "./brief.ts";
import { copyStepInputs, verifyStepOutputs } from "./files.ts";
import { stepOutputDir } from "./paths.ts";
import {
  beginRun, beginStep, cancelRun, completeStep, failRun, failStep, isTerminalRun, pauseRun, resumeRun, type RunTransition,
} from "./state.ts";
import type { WorkflowStore } from "./store.ts";

/** The reason a refused card leaves on the run. */
export const APPROVAL_REFUSED = "aprovação negada";

export interface WorkflowTurnOptions {
  threadId: string;
  workflowStep: { runId: string; stepId: string };
  onSettled(outcome: HostTurnResult): void;
}

export interface WorkflowEngineDeps {
  store: WorkflowStore;
  startTurn(botId: string, text: string, options: WorkflowTurnOptions): Promise<unknown>;
  createThread(input: { botId: string; title: string; cwd: string }): string | null;
  broadcast(frame: Record<string, unknown>): void;
  interrupt?(botId: string, threadId: string): void;
  /** Cards in a step's conversation still waiting on a person, in the order they were posted. */
  openCards?(threadId: string): Array<{ id: string; question: string }>;
  now?: () => number;
  log?: (line: string) => void;
}

export type StartResult = { ok: true; run: WorkflowRun } | { ok: false; error: string };

export interface WorkflowEngine {
  start(workflowId: string, options?: { version?: number; requestedBy?: WorkflowRun["requestedBy"] }): StartResult;
  status(runId: string): WorkflowRun | undefined;
  cancel(runId: string, reason?: string): RunTransition;
  /** A turn on a step's conversation settled: a run waiting on that step re-checks its outputs. */
  turnSettled(threadId: string, generation: string, outcome: HostTurnResult): void;
  /** The person refused the card a waiting run paused on; the run is cancelled. */
  refuse(threadId: string, cardId?: string): RunTransition;
  /** Whether a live run owns this conversation as one of its steps. */
  ownsThread(threadId: string): boolean;
  /** Reconciles runs left behind by a restart: queued and between-step runs continue, a running step fails. */
  recover(): void;
  /** Resolves once every scheduled advance has finished; tests and shutdown use it. */
  idle(): Promise<void>;
}

const everything = { limit: Number.POSITIVE_INFINITY };

export function createWorkflowEngine(deps: WorkflowEngineDeps): WorkflowEngine {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((line: string) => console.warn(line));
  const chains = new Map<string, Promise<void>>();
  /** Step conversations a live run owns, so a settled turn finds its run without scanning every run.json. */
  const stepThreads = new Map<string, { runId: string; index: number }>();
  /** The last turn reported per step conversation: the host settles a turn more than once, and only the first is news. */
  const reportedTurns = new Map<string, string>();

  const enqueue = (runId: string, task: () => Promise<void>): Promise<void> => {
    const previous = chains.get(runId) ?? Promise.resolve();
    const next = previous
      .then(task)
      .catch((error: unknown) => log(`workflows: run ${runId}: ${error instanceof Error ? error.message : String(error)}`));
    chains.set(runId, next);
    void next.finally(() => {
      if (chains.get(runId) === next) chains.delete(runId);
    });
    return next;
  };

  const forgetRun = (runId: string): void => {
    for (const [threadId, entry] of stepThreads) {
      if (entry.runId !== runId) continue;
      stepThreads.delete(threadId);
      reportedTurns.delete(threadId);
    }
  };

  const apply = (transition: RunTransition): WorkflowRun | undefined => {
    if (!transition.ok) {
      log(`workflows: ${transition.error}`);
      return undefined;
    }
    deps.store.writeRun(transition.run);
    deps.broadcast({ kind: "workflow.run", run: transition.run });
    if (isTerminalRun(transition.run.status)) forgetRun(transition.run.id);
    return transition.run;
  };

  const waitingCards = (
    threadId: string | undefined,
    resolved: ReadonlySet<string>,
  ): { question: string; ids: string[] } | undefined => {
    if (!threadId) return undefined;
    const cards = (deps.openCards?.(threadId) ?? []).filter((card) => !resolved.has(card.id));
    if (cards.length === 0) return undefined;
    return {
      question: cards.map((card) => card.question).filter(Boolean).join("; ") || "Waiting on the person",
      ids: cards.map((card) => card.id),
    };
  };

  /** Reads the step's files, or parks the run while a card the step left open has no answer. */
  const finishStep = (
    run: WorkflowRun,
    index: number,
    outcome: HostTurnResult,
    resolved: ReadonlySet<string> = new Set(),
  ): void => {
    const stepState = run.steps[index];
    if (!stepState || stepState.status !== "running") return;
    const definition = deps.store.workflow(run.workflowId, run.workflowVersion);
    if (!definition) {
      apply(failRun(run, `definition ${run.workflowId} version ${run.workflowVersion} is not available`, now()));
      return;
    }
    const step = definition.steps[index];
    if (!step) {
      apply(failStep(run, index, `the run has no step ${index + 1} in the definition`, now()));
      return;
    }
    if (!outcome.ok) {
      apply(failStep(run, index, outcome.text.trim() || "the step's turn failed", now()));
      return;
    }
    const reported = outcome.cards
      ? { question: outcome.cards.question, ids: outcome.cards.ids.filter((id) => !resolved.has(id)) }
      : undefined;
    const waiting = reported && reported.ids.length > 0 ? reported : waitingCards(stepState.threadId, resolved);
    if (waiting) {
      apply(pauseRun(run, { stepId: step.id, question: waiting.question, cardIds: waiting.ids, askedAt: now() }, now()));
      return;
    }
    const verification = verifyStepOutputs(stepOutputDir(deps.store.runDir(run), index + 1), step.outputs, step.result);
    if (!verification.ok) {
      apply(failStep(run, index, verification.error, now()));
      return;
    }
    if (step.require !== undefined) {
      const mismatch = requireMismatch(verification.result, step.require);
      if (mismatch) {
        apply(failStep(run, index, resultReason(verification.result) ?? mismatch, now()));
        return;
      }
    }
    const completed = apply(completeStep(run, index, { verified: verification.verified, result: verification.result }, now()));
    if (completed && !isTerminalRun(completed.status)) void enqueue(run.id, () => advance(run.id));
  };

  const settle = async (runId: string, index: number, outcome: HostTurnResult): Promise<void> => {
    const run = deps.store.readRun(runId);
    if (!run || run.status !== "running") return;
    finishStep(run, index, outcome);
  };

  const advance = async (runId: string): Promise<void> => {
    let run = deps.store.readRun(runId);
    if (!run) return;
    if (run.status === "queued") {
      const started = apply(beginRun(run, now()));
      if (!started) return;
      run = started;
    }
    if (run.status !== "running") return;
    const definition = deps.store.workflow(run.workflowId, run.workflowVersion);
    if (!definition) {
      apply(failRun(run, `definition ${run.workflowId} version ${run.workflowVersion} is not available`, now()));
      return;
    }
    const index = run.currentStep;
    const step = definition.steps[index];
    const stepState = run.steps[index];
    if (!step || !stepState) {
      apply(failRun(run, "the run points past its last step", now()));
      return;
    }
    if (stepState.status !== "pending") return;
    const copied = copyStepInputs(deps.store.runDir(run), index, step, definition.steps);
    if (!copied.ok) {
      apply(failStep(run, index, copied.error, now()));
      return;
    }
    const threadId = deps.createThread({
      botId: step.botId,
      title: stepThreadTitle(definition.name, step, run.id),
      cwd: deps.store.stepFolder(run, index),
    });
    if (!threadId) {
      apply(failStep(run, index, `bot ${JSON.stringify(step.botId)} does not exist`, now()));
      return;
    }
    const started = apply(beginStep(run, index, { threadId }, now()));
    if (!started) return;
    stepThreads.set(threadId, { runId: run.id, index });
    // A cancel can land between beginStep and the dispatch; never start a turn for a run that already stopped.
    if (deps.store.readRun(run.id)?.status !== "running") return;
    try {
      await deps.startTurn(step.botId, stepBrief({ workflowName: definition.name, step, index, total: definition.steps.length }), {
        threadId,
        workflowStep: { runId: run.id, stepId: step.id },
        onSettled: (outcome) => {
          void enqueue(run.id, () => settle(run.id, index, outcome));
        },
      });
    } catch (error) {
      await settle(run.id, index, { ok: false, text: error instanceof Error ? error.message : String(error) });
    }
  };

  return {
    start(workflowId, options = {}) {
      const definition = deps.store.workflow(workflowId, options.version);
      if (!definition) {
        return { ok: false, error: `no Workflow ${JSON.stringify(workflowId)}${options.version === undefined ? "" : ` version ${options.version}`}` };
      }
      try {
        const run = deps.store.createRun(definition, { requestedBy: options.requestedBy });
        deps.broadcast({ kind: "workflow.run", run });
        void enqueue(run.id, () => advance(run.id));
        return { ok: true, run };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    status(runId) {
      return deps.store.readRun(runId);
    },
    turnSettled(threadId, generation, outcome) {
      const entry = stepThreads.get(threadId);
      if (!entry) return;
      if (reportedTurns.get(threadId) === generation) return;
      reportedTurns.set(threadId, generation);
      void enqueue(entry.runId, async () => {
        const run = deps.store.readRun(entry.runId);
        if (!run || run.status !== "waiting_approval" || run.currentStep !== entry.index) return;
        if (run.steps[entry.index]?.threadId !== threadId) return;
        const resumed = apply(resumeRun(run, now()));
        if (!resumed) return;
        finishStep(resumed, entry.index, outcome, new Set(run.pause?.cardIds ?? []));
      });
    },
    refuse(threadId, cardId) {
      const entry = stepThreads.get(threadId);
      if (!entry) return { ok: false, error: "no such run" };
      const run = deps.store.readRun(entry.runId);
      if (!run || run.status !== "waiting_approval") return { ok: false, error: "this run is not waiting for approval" };
      if (cardId !== undefined && !(run.pause?.cardIds ?? []).includes(cardId)) {
        return { ok: false, error: "that card does not belong to this run" };
      }
      const cancelled = cancelRun(run, APPROVAL_REFUSED, now());
      if (!cancelled.ok) return cancelled;
      apply(cancelled);
      return cancelled;
    },
    ownsThread(threadId) {
      return stepThreads.has(threadId);
    },
    cancel(runId, reason) {
      const run = deps.store.readRun(runId);
      if (!run) return { ok: false, error: "no such run" };
      const cancelled = cancelRun(run, reason, now());
      if (!cancelled.ok) return cancelled;
      apply(cancelled);
      const current = run.steps[run.currentStep];
      if (current?.threadId) {
        const botId = deps.store.workflow(run.workflowId, run.workflowVersion)?.steps[run.currentStep]?.botId;
        if (botId) {
          try {
            deps.interrupt?.(botId, current.threadId);
          } catch (error) {
            log(`workflows: could not interrupt ${current.threadId}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
      return cancelled;
    },
    recover() {
      stepThreads.clear();
      reportedTurns.clear();
      for (const run of deps.store.listRuns(everything)) {
        if (run.status === "running" || run.status === "waiting_approval") {
          const threadId = run.steps[run.currentStep]?.threadId;
          if (threadId) stepThreads.set(threadId, { runId: run.id, index: run.currentStep });
        }
        if (run.status === "queued") {
          void enqueue(run.id, () => advance(run.id));
          continue;
        }
        if (run.status !== "running") continue;
        const current = run.steps[run.currentStep];
        if (current?.status === "pending") {
          void enqueue(run.id, () => advance(run.id));
          continue;
        }
        apply(failRun(run, "the app restarted while this step was running; start the run again", now()));
      }
    },
    async idle() {
      while (chains.size > 0) await Promise.all(chains.values());
    },
  };
}

/** The step's own words for a failed requirement, when it left a reason. */
function resultReason(result: unknown): string | undefined {
  if (result === null || typeof result !== "object" || Array.isArray(result)) return undefined;
  const reason = (result as Record<string, unknown>).reason;
  return typeof reason === "string" && reason.trim() ? reason.trim() : undefined;
}
