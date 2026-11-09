// The engine is the only code that decides what runs next. It copies a step's
// declared inputs, opens one thread with cwd = step-N (or runs the step's
// script), waits for that turn's single onSettled, verifies the declared
// outputs (and `require`), and only then moves on. A run advances one step at
// a time, always forward: a step that fails stops the run unless the Workflow
// declared an `onFailure` (or, for a timeout, an `onTimeout`) path.
import { lstatSync } from "node:fs";
import { join } from "node:path";

import { requireMismatch, type BotWorkflowStep, type ConditionWorkflowStep, type ScriptWorkflowStep, type WorkflowDefinition, type WorkflowRun, type WorkflowStep, type WorkflowStepSkills } from "../../shared/workflow.ts";
import type { HostTurnResult } from "../coordinator.ts";
import { stepBrief, stepThreadTitle } from "./brief.ts";
import { evaluateConditionGroup } from "./condition.ts";
import { copyStepInputs, verifyStepOutputs, type OutputVerification } from "./files.ts";
import { failureStepIndex, nextStepIndex, type StepFailureKind } from "./flow.ts";
import { stepInputDir, stepOutputDir } from "./paths.ts";
import { runWorkflowScript, type WorkflowScriptHandle } from "./script.ts";
import {
  beginRun, beginStep, cancelRun, completeStep, failRun, failStep, failStepTo, holdRun, isTerminalRun, pauseRun, releaseRun, resumeRun, type RunTransition,
} from "./state.ts";
import type { WorkflowStore } from "./store.ts";

/** The reason a refused card leaves on the run. */
export const APPROVAL_REFUSED = "aprovação negada";

export interface WorkflowTurnOptions {
  threadId: string;
  workflowStep: { runId: string; stepId: string };
  skills?: WorkflowStepSkills;
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
  /** Every persisted transition, for a trigger that mirrors the run's state. */
  onRun?(run: WorkflowRun): void;
  missingSkills?(botId: string, skills: WorkflowStepSkills | undefined): readonly string[];
  now?: () => number;
  log?: (line: string) => void;
}

export type StartResult = { ok: true; run: WorkflowRun } | { ok: false; error: string };

export interface WorkflowEngine {
  start(workflowId: string, options?: { version?: number; requestedBy?: WorkflowRun["requestedBy"]; triggeredBy?: WorkflowRun["triggeredBy"] }): StartResult;
  status(runId: string): WorkflowRun | undefined;
  cancel(runId: string, reason?: string): RunTransition;
  /** The person continued a manual step: release it once and resume the same run. */
  resume(runId: string): RunTransition;
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
  /** Script processes a live run owns, so a cancel can stop the child. */
  const scripts = new Map<string, WorkflowScriptHandle>();
  /** The running bot step's timeout clock, one per run: a pause stops it and it never restarts. */
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** A manual step a person just released. Process memory only, so a restart leaves the run parked. */
  const released = new Set<string>();

  const clearTimer = (runId: string): void => {
    const timer = timers.get(runId);
    if (timer === undefined) return;
    clearTimeout(timer);
    timers.delete(runId);
  };

  const enqueue = (runId: string, task: () => Promise<void> | void): Promise<void> => {
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
    deps.onRun?.(transition.run);
    if (isTerminalRun(transition.run.status)) {
      forgetRun(transition.run.id);
      clearTimer(transition.run.id);
      released.delete(transition.run.id);
    }
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

  /** A verified failure stops the run, or follows the step's `onFailure` (or `onTimeout`) edge. */
  const failOrRoute = (run: WorkflowRun, index: number, error: string, definition: WorkflowDefinition, kind: StepFailureKind = "failure"): void => {
    const target = failureStepIndex(definition.steps, index, kind);
    if (target === null) {
      apply(failStep(run, index, error, now(), kind));
      return;
    }
    const moved = apply(failStepTo(run, index, error, target, now(), kind));
    if (moved) void enqueue(run.id, () => advance(run.id));
  };

  /** The step delivered: check `require`, pick the declared next step and complete it. */
  const passStep = (
    run: WorkflowRun,
    index: number,
    step: BotWorkflowStep | ScriptWorkflowStep,
    definition: WorkflowDefinition,
    verification: Extract<OutputVerification, { ok: true }>,
  ): void => {
    if (step.require !== undefined) {
      const mismatch = requireMismatch(verification.result, step.require);
      if (mismatch) {
        failOrRoute(run, index, resultReason(verification.result) ?? mismatch, definition);
        return;
      }
    }
    const target = nextStepIndex(definition.steps, index, verification.result);
    const completed = apply(completeStep(run, index, { verified: verification.verified, result: verification.result }, now(), target));
    if (completed && !isTerminalRun(completed.status)) void enqueue(run.id, () => advance(run.id));
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
    clearTimer(run.id);
    const definition = deps.store.workflow(run.workflowId, run.workflowVersion);
    if (!definition) {
      apply(failRun(run, `definition ${run.workflowId} version ${run.workflowVersion} is not available`, now()));
      return;
    }
    const step = definition.steps[index];
    if (!step || step.kind !== "bot") {
      apply(failStep(run, index, `the run has no bot step ${index + 1} in the definition`, now()));
      return;
    }
    if (!outcome.ok) {
      failOrRoute(run, index, outcome.text.trim() || "the step's turn failed", definition);
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
      failOrRoute(run, index, verification.error, definition);
      return;
    }
    passStep(run, index, step, definition, verification);
  };

  /** Runs a script step's file and then verifies it exactly like a bot step's output. */
  const runScriptStep = async (
    run: WorkflowRun,
    index: number,
    step: Extract<WorkflowStep, { kind: "script" }>,
    definition: WorkflowDefinition,
  ): Promise<void> => {
    const scriptsFolder = deps.store.scriptsFolder(run.workflowId);
    const scriptPath = scriptsFolder ? join(scriptsFolder, step.run) : undefined;
    let plain = false;
    if (scriptPath) {
      try {
        const info = lstatSync(scriptPath);
        plain = !info.isSymbolicLink() && info.isFile();
      } catch {
        plain = false;
      }
    }
    if (!scriptPath || !plain) {
      failOrRoute(run, index, `script ${JSON.stringify(step.run)} is not in the Workflow's scripts folder`, definition);
      return;
    }
    const started = apply(beginStep(run, index, {}, now()));
    if (!started) return;
    if (deps.store.readRun(run.id)?.status !== "running") return;
    const runDir = deps.store.runDir(run);
    const handle = runWorkflowScript({
      scriptPath,
      stepDir: deps.store.stepFolder(run, index),
      inputDir: stepInputDir(runDir, index + 1),
      outputDir: stepOutputDir(runDir, index + 1),
      timeoutMs: step.timeoutMs,
      runId: run.id,
      stepId: step.id,
    });
    scripts.set(run.id, handle);
    let outcome;
    try {
      outcome = await handle.promise;
    } finally {
      scripts.delete(run.id);
    }
    const current = deps.store.readRun(run.id);
    if (!current || current.status !== "running") return;
    if (!outcome.ok) {
      failOrRoute(current, index, outcome.error, definition, outcome.timedOut ? "timeout" : "failure");
      return;
    }
    const verification = verifyStepOutputs(stepOutputDir(runDir, index + 1), step.outputs, step.result);
    if (!verification.ok) {
      failOrRoute(current, index, verification.error, definition);
      return;
    }
    passStep(current, index, step, definition, verification);
  };

  /** A condition reads its source step's result.json and sends the run down one of two routes. */
  const runConditionStep = (
    run: WorkflowRun,
    index: number,
    step: ConditionWorkflowStep,
    definition: WorkflowDefinition,
  ): void => {
    const started = apply(beginStep(run, index, {}, now()));
    if (!started) return;
    const sourceIndex = definition.steps.findIndex((candidate) => candidate.id === step.from);
    const source = definition.steps[sourceIndex];
    if (!source || source.kind === "condition" || source.result === undefined) {
      failOrRoute(started, index, `condition ${JSON.stringify(step.id)} reads ${JSON.stringify(step.from)}, which declares no result`, definition);
      return;
    }
    const verification = verifyStepOutputs(stepOutputDir(deps.store.runDir(started), sourceIndex + 1), source.outputs, source.result);
    if (!verification.ok) {
      failOrRoute(started, index, `condition ${JSON.stringify(step.id)} could not read step ${JSON.stringify(source.id)}: ${verification.error}`, definition);
      return;
    }
    const outcome = evaluateConditionGroup(verification.result, step);
    if (!outcome.ok) {
      failOrRoute(started, index, outcome.error, definition);
      return;
    }
    const targetId = outcome.match ? step.whenTrue : step.whenFalse;
    const target = targetId === undefined ? null : definition.steps.findIndex((candidate) => candidate.id === targetId);
    if (target !== null && target < 0) {
      failOrRoute(started, index, `condition ${JSON.stringify(step.id)} points at ${JSON.stringify(targetId)}, which does not exist`, definition);
      return;
    }
    const completed = apply(completeStep(started, index, { verified: [] }, now(), target));
    if (completed && !isTerminalRun(completed.status)) void enqueue(started.id, () => advance(started.id));
  };

  const settle = async (runId: string, index: number, outcome: HostTurnResult): Promise<void> => {
    const run = deps.store.readRun(runId);
    if (!run || run.status !== "running") return;
    finishStep(run, index, outcome);
  };

  /** A bot step's turn outlived its declared limit: route it as its own kind of failure. */
  const timeOutStep = (runId: string, index: number, timeoutMs: number): void => {
    const run = deps.store.readRun(runId);
    if (!run || run.status !== "running" || run.currentStep !== index) return;
    const stepState = run.steps[index];
    if (stepState?.status !== "running") return;
    const definition = deps.store.workflow(run.workflowId, run.workflowVersion);
    if (!definition) {
      apply(failRun(run, `definition ${run.workflowId} version ${run.workflowVersion} is not available`, now()));
      return;
    }
    const step = definition.steps[index];
    if (step?.kind === "bot" && stepState.threadId) {
      try {
        deps.interrupt?.(step.botId, stepState.threadId);
      } catch (error) {
        log(`workflows: could not interrupt ${stepState.threadId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    failOrRoute(run, index, `the step timed out after ${timeoutMs}ms`, definition, "timeout");
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
    if (step.kind === "condition") {
      runConditionStep(run, index, step, definition);
      return;
    }
    if (step.mode === "manual" && !released.delete(run.id)) {
      apply(holdRun(run, index, now()));
      return;
    }
    if (step.kind === "bot") {
      const missing = deps.missingSkills?.(step.botId, step.skills) ?? [];
      if (missing.length > 0) {
        failOrRoute(run, index, `skill ${JSON.stringify(missing[0])} is not available for this Workflow step`, definition);
        return;
      }
    }
    const copied = copyStepInputs(deps.store.runDir(run), index, step, definition.steps);
    if (!copied.ok) {
      failOrRoute(run, index, copied.error, definition);
      return;
    }
    if (step.kind === "script") {
      await runScriptStep(run, index, step, definition);
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
    if (step.timeoutMs > 0) {
      const timer = setTimeout(() => {
        timers.delete(run.id);
        void enqueue(run.id, () => timeOutStep(run.id, index, step.timeoutMs));
      }, step.timeoutMs);
      timer.unref?.();
      timers.set(run.id, timer);
    }
    // A cancel can land between beginStep and the dispatch; never start a turn for a run that already stopped.
    if (deps.store.readRun(run.id)?.status !== "running") return;
    try {
      await deps.startTurn(step.botId, stepBrief({ workflowName: definition.name, step, index, total: definition.steps.length }), {
        threadId,
        workflowStep: { runId: run.id, stepId: step.id },
        ...(step.skills === undefined ? {} : { skills: step.skills }),
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
        const run = deps.store.createRun(definition, { requestedBy: options.requestedBy, triggeredBy: options.triggeredBy });
        deps.broadcast({ kind: "workflow.run", run });
        deps.onRun?.(run);
        void enqueue(run.id, () => advance(run.id));
        return { ok: true, run };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    status(runId) {
      return deps.store.readRun(runId);
    },
    resume(runId) {
      const run = deps.store.readRun(runId);
      if (!run) return { ok: false, error: "no such run" };
      const releasedRun = releaseRun(run, now());
      if (!releasedRun.ok) return releasedRun;
      released.add(runId);
      const applied = apply(releasedRun);
      if (applied) void enqueue(runId, () => advance(runId));
      return releasedRun;
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
      clearTimer(runId);
      released.delete(runId);
      apply(cancelled);
      scripts.get(runId)?.kill();
      const current = run.steps[run.currentStep];
      if (current?.threadId) {
        const currentStep = deps.store.workflow(run.workflowId, run.workflowVersion)?.steps[run.currentStep];
        const botId = currentStep?.kind === "bot" ? currentStep.botId : undefined;
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
      for (const runId of timers.keys()) clearTimer(runId);
      stepThreads.clear();
      reportedTurns.clear();
      released.clear();
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
