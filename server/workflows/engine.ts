// The engine is the only code that decides what runs next. It copies a step's
// declared inputs, opens one thread with cwd = step-N (or runs the step's
// script), waits for that turn's single onSettled, verifies the declared
// outputs, and only then moves on. A step never judges its own content: a
// `condition` reads the named `.json` output and chooses the route. A run
// advances one step at a time, always forward: a step that fails stops the run
// unless the Workflow declared an `onFailure` (or, for a timeout, an
// `onTimeout`) path. A Do While runs a nested body one round at a time and
// never becomes a cycle on the canvas.
import { lstatSync } from "node:fs";
import { join } from "node:path";

import {
  type BotWorkflowStep,
  type ConditionWorkflowStep,
  type LoopWorkflowStep,
  type ScriptWorkflowStep,
  type WorkflowBodyStep,
  type WorkflowDefinition,
  type WorkflowRun,
  type WorkflowStep,
  type WorkflowStepSkills,
} from "../../shared/workflow.ts";
import type { HostTurnResult } from "../coordinator.ts";
import { stepBrief, stepThreadTitle } from "./brief.ts";
import { evaluateConditionGroup, matchedConditionLine } from "./condition.ts";
import {
  copyBodyStepInputs,
  copyStepInputs,
  prepareIterationDirectories,
  projectLoopOutputs,
  readStepJson,
  verifyStepOutputs,
  writeStepParameters,
  type OutputVerification,
} from "./files.ts";
import {
  bodyFailureStepIndex,
  bodyNextStepIndex,
  failureStepIndex,
  nextStepIndex,
  type StepFailureKind,
} from "./flow.ts";
import { iterationStepDir, iterationStepInputDir, iterationStepOutputDir, stepInputDir, stepOutputDir } from "./paths.ts";
import { validateWorkflowInputs, resolveStepParameters, validateCollectedInputs, type ParameterFailure, type WorkflowInputs } from "./parameters.ts";
import { missingWorkflowModules, binWorkflowModules } from "./preflight.ts";
import { environmentPreflightIssue, workflowEnvironmentPaths } from "./environment.ts";
import { runWorkflowScript, type WorkflowScriptHandle } from "./script.ts";
import {
  beginBodyStep,
  beginLoopIteration,
  beginRun,
  beginStep,
  cancelRun,
  completeBodyStep,
  completeStep,
  failBodyStepTo,
  failIteration,
  failRun,
  failStep,
  failStepTo,
  finishIteration,
  holdBodyRun,
  holdRun,
  isTerminalRun,
  pauseRun,
  releaseRun,
  resumeRun,
  type RunTransition,
} from "./state.ts";
import type { WorkflowStore } from "./store.ts";

/** The reason a refused card leaves on the run. */
export const APPROVAL_REFUSED = "aprovação negada";

/** A manual step's failure says what continuing cannot deliver when the step collects nothing. */
function manualFailure(step: BotWorkflowStep | ScriptWorkflowStep, error: string): string {
  if (step.mode !== "manual") return error;
  if (step.parameters.some((parameter) => parameter.collectedBy === step.id)) return error;
  return `${error}; this manual step declares no collectedBy, so continuing delivers no value — write the outputs from input/ and params.json`;
}

export interface WorkflowTurnOptions {
  threadId: string;
  workflowStep: { runId: string; stepId: string };
  skills?: WorkflowStepSkills;
  onSettled(outcome: HostTurnResult): void;
}

export interface WorkflowEngineDeps {
  store: WorkflowStore;
  home?: string;
  env?: NodeJS.ProcessEnv;
  startTurn(botId: string, text: string, options: WorkflowTurnOptions): Promise<unknown>;
  createThread(input: { botId: string; title: string; cwd: string }): string | null;
  broadcast(frame: Record<string, unknown>): void;
  interrupt?(botId: string, threadId: string): void;
  /** Cards in a step's conversation still waiting on a person, in the order they were posted. */
  openCards?(threadId: string): Array<{ id: string; question: string }>;
  /** Every persisted transition, for a trigger that mirrors the run's state. */
  onRun?(run: WorkflowRun): void;
  missingSkills?(botId: string, skills: WorkflowStepSkills | undefined): readonly string[];
  /** The machine dependencies this deployment does not have; tests inject it, a run reads the machine. */
  checkModules?(modules: readonly string[]): readonly string[];
  /** Whether the prepared environment fits this definition; tests inject it, a run reads state.json. */
  checkEnvironment?(definition: WorkflowDefinition): string | undefined;
  now?: () => number;
  log?: (line: string) => void;
}

export type StartResult = { ok: true; run: WorkflowRun } | { ok: false; error: string; needsInput?: ParameterFailure };

export type ResumeResult =
  | { ok: true; run: WorkflowRun }
  | { ok: false; error: string; needsInput?: ParameterFailure };

export interface WorkflowStartOptions {
  version?: number;
  requestedBy?: WorkflowRun["requestedBy"];
  triggeredBy?: WorkflowRun["triggeredBy"];
  inputs?: WorkflowInputs;
  requestId?: string;
}

export interface WorkflowEngine {
  start(workflowId: string, options?: WorkflowStartOptions): StartResult;
  status(runId: string): WorkflowRun | undefined;
  cancel(runId: string, reason?: string): RunTransition;
  /** The person continued a manual step: release it once and resume the same run.
   * The values the step collects are checked here and stored on the run before it advances. */
  resume(runId: string, inputs?: WorkflowInputs): ResumeResult;
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

/** [stepIndex] for a top-level step, [loopIndex, iterationArrayIndex, bodyIndex] inside a Do While. */
type StepPath = number[];

interface LoopCursor {
  iteration: number;
  body: number | null;
}

const samePath = (left: readonly number[], right: readonly number[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

export function createWorkflowEngine(deps: WorkflowEngineDeps): WorkflowEngine {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((line: string) => console.warn(line));
  const environmentIssue = (definition: WorkflowDefinition): string | undefined => {
    const missingBinaries = deps.checkModules
      ? deps.checkModules(binWorkflowModules(definition).map((module) => module.name))
      : missingWorkflowModules(definition, deps.env);
    if (missingBinaries.length > 0) {
      return `this machine does not have ${missingBinaries.map((name) => JSON.stringify(name)).join(", ")}; a script step declares it in modules, and the engine never installs it`;
    }
    return deps.checkEnvironment
      ? deps.checkEnvironment(definition)
      : environmentPreflightIssue(definition, { home: deps.home, env: deps.env });
  };
  const scriptEnvironment = workflowEnvironmentPaths({ home: deps.home, env: deps.env });
  const chains = new Map<string, Promise<void>>();
  /** Step conversations a live run owns, so a settled turn finds its run without scanning every run.json. */
  const stepThreads = new Map<string, { runId: string; path: StepPath }>();
  /** The last turn reported per step conversation: the host settles a turn more than once, and only the first is news. */
  const reportedTurns = new Map<string, string>();
  /** Script processes a live run owns, so a cancel can stop the child. */
  const scripts = new Map<string, WorkflowScriptHandle>();
  /** The running step's timeout clock, one per run: a pause stops it and it never restarts. */
  const timers = new Map<string, { handle: ReturnType<typeof setTimeout>; path: StepPath }>();
  /** A manual step a person just released. Process memory only, so a restart leaves the run parked. */
  const released = new Map<string, StepPath>();

  const clearTimer = (runId: string): void => {
    const timer = timers.get(runId);
    if (timer === undefined) return;
    clearTimeout(timer.handle);
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
    released.delete(runId);
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
    }
    return transition.run;
  };

  const consumeRelease = (runId: string, path: StepPath): boolean => {
    const held = released.get(runId);
    if (!held || !samePath(held, path)) return false;
    released.delete(runId);
    return true;
  };

  /** The step a manual hold parks, top-level or inside a Do While round. */
  const heldStep = (run: WorkflowRun, definition: WorkflowDefinition): WorkflowStep | undefined => {
    const path = run.hold?.path ?? (run.hold?.step === undefined ? undefined : [run.hold.step]);
    if (!path) return undefined;
    if (path.length === 1) return definition.steps[path[0]!];
    const loop = definition.steps[path[0]!];
    return loop?.kind === "loop" ? loop.body[path[2]!] : undefined;
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

  /** The step delivered: pick the declared next step and complete it. No step judges its own content. */
  const passStep = (
    run: WorkflowRun,
    index: number,
    definition: WorkflowDefinition,
    verification: Extract<OutputVerification, { ok: true }>,
  ): void => {
    const target = nextStepIndex(definition.steps, index);
    const completed = apply(completeStep(run, index, { verified: verification.verified }, now(), target));
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
      apply(pauseRun(run, { stepId: step.id, question: waiting.question, cardIds: waiting.ids, askedAt: now(), path: [index] }, now()));
      return;
    }
    const verification = verifyStepOutputs(stepOutputDir(deps.store.runDir(run), index + 1), step.outputs);
    if (!verification.ok) {
      failOrRoute(run, index, manualFailure(step, verification.error), definition);
      return;
    }
    passStep(run, index, definition, verification);
  };

  /** Runs a script step's file and then verifies it exactly like a bot step's output. */
  const runScriptStep = async (
    run: WorkflowRun,
    index: number,
    step: Extract<WorkflowStep, { kind: "script" }>,
    definition: WorkflowDefinition,
  ): Promise<void> => {
    const issue = environmentIssue(definition);
    if (issue !== undefined) {
      failOrRoute(run, index, issue, definition);
      return;
    }
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
      environment: scriptEnvironment,
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
    const verification = verifyStepOutputs(stepOutputDir(runDir, index + 1), step.outputs);
    if (!verification.ok) {
      failOrRoute(current, index, manualFailure(step, verification.error), definition);
      return;
    }
    passStep(current, index, definition, verification);
  };

  /** A condition reads the output it names and sends the run down one of two routes. */
  const runConditionStep = (
    run: WorkflowRun,
    index: number,
    step: ConditionWorkflowStep,
    definition: WorkflowDefinition,
  ): void => {
    const started = apply(beginStep(run, index, {}, now()));
    if (!started) return;
    const sourceIndex = definition.steps.findIndex((candidate) => candidate.id === step.from.step);
    const source = definition.steps[sourceIndex];
    if (!source || source.kind === "condition") {
      failOrRoute(started, index, `condition ${JSON.stringify(step.id)} reads ${JSON.stringify(step.from.step)}, which is not an earlier step`, definition);
      return;
    }
    const read = readStepJson(stepOutputDir(deps.store.runDir(started), sourceIndex + 1), step.from.output);
    if (!read.ok) {
      failOrRoute(started, index, `condition ${JSON.stringify(step.id)} could not read step ${JSON.stringify(source.id)}: ${read.error}`, definition);
      return;
    }
    const outcome = evaluateConditionGroup(read.value, step);
    if (!outcome.ok) {
      failOrRoute(started, index, outcome.error, definition);
      return;
    }
    const targetId = outcome.match ? step.whenTrue : step.whenFalse;
    const target = targetId === undefined || targetId === null ? null : definition.steps.findIndex((candidate) => candidate.id === targetId);
    if (target !== null && target < 0) {
      failOrRoute(started, index, `condition ${JSON.stringify(step.id)} points at ${JSON.stringify(targetId)}, which does not exist`, definition);
      return;
    }
    const matched = matchedConditionLine(read.value, step);
    const completed = apply(completeStep(started, index, {
      verified: [],
      branch: outcome.match,
      source: { step: source.id, output: step.from.output },
      ...(outcome.match ? (matched === undefined ? {} : { condition: matched }) : {}),
    }, now(), target));
    if (completed && !isTerminalRun(completed.status)) void enqueue(started.id, () => advance(started.id));
  };

  const loopAt = (definition: WorkflowDefinition, loopIndex: number): LoopWorkflowStep | undefined => {
    const step = definition.steps[loopIndex];
    return step?.kind === "loop" ? step : undefined;
  };

  /** Fails the Do While as a whole, applying its `onFailure` when it has one. */
  const failLoop = (run: WorkflowRun, loopIndex: number, error: string, definition: WorkflowDefinition, kind: StepFailureKind = "failure"): void => {
    const target = failureStepIndex(definition.steps, loopIndex, kind);
    if (target === null) {
      apply(failStep(run, loopIndex, error, now(), kind));
      return;
    }
    const moved = apply(failStepTo(run, loopIndex, error, target, now(), kind));
    if (moved) void enqueue(run.id, () => advance(run.id));
  };

  /** A body step failed: follow its own edge, or fail the round and the Do While. */
  const failBodyOrLoop = (
    run: WorkflowRun,
    loopIndex: number,
    iterationIndex: number,
    bodyIndex: number,
    error: string,
    definition: WorkflowDefinition,
    kind: StepFailureKind = "failure",
  ): void => {
    const loop = loopAt(definition, loopIndex);
    if (!loop) {
      apply(failRun(run, `the run has no Do While ${loopIndex + 1} in the definition`, now()));
      return;
    }
    const target = bodyFailureStepIndex(loop.body, bodyIndex, kind);
    if (target !== null) {
      const failed = apply(failBodyStepTo(run, loopIndex, iterationIndex, bodyIndex, error, now(), kind));
      if (failed) void enqueue(run.id, () => advanceLoop(run.id, loopIndex, { iteration: iterationIndex, body: target }));
      return;
    }
    let current = apply(failBodyStepTo(run, loopIndex, iterationIndex, bodyIndex, error, now(), kind));
    if (!current) return;
    current = apply(failIteration(current, loopIndex, iterationIndex, error, now(), kind));
    if (!current) return;
    failLoop(current, loopIndex, error, definition, kind);
  };

  const bodyStepOutput = (run: WorkflowRun, loopIndex: number, iterationIndex: number, step: WorkflowBodyStep): OutputVerification => {
    if (step.kind === "condition") return { ok: true, verified: [] };
    const iteration = run.steps[loopIndex]?.iterations?.[iterationIndex];
    if (!iteration) return { ok: false, error: "the round does not exist" };
    return verifyStepOutputs(iterationStepOutputDir(deps.store.runDir(run), iteration.index, step.id), step.outputs);
  };

  /** Completes a body step and lets the round continue where its edge points. */
  const passBodyStep = (
    run: WorkflowRun,
    loopIndex: number,
    iterationIndex: number,
    bodyIndex: number,
    loop: LoopWorkflowStep,
    verification: Extract<OutputVerification, { ok: true }>,
  ): void => {
    const target = bodyNextStepIndex(loop.body, bodyIndex);
    const completed = apply(completeBodyStep(run, loopIndex, iterationIndex, bodyIndex, { verified: verification.verified }, now()));
    if (completed) void enqueue(run.id, () => advanceLoop(run.id, loopIndex, { iteration: iterationIndex, body: target }));
  };

  const finishBodyStep = (
    run: WorkflowRun,
    path: StepPath,
    outcome: HostTurnResult,
    resolved: ReadonlySet<string> = new Set(),
  ): void => {
    const [loopIndex, iterationIndex, bodyIndex] = path as [number, number, number];
    const iteration = run.steps[loopIndex]?.iterations?.[iterationIndex];
    const stepState = iteration?.steps[bodyIndex];
    if (!iteration || !stepState || stepState.status !== "running") return;
    clearTimer(run.id);
    const definition = deps.store.workflow(run.workflowId, run.workflowVersion);
    if (!definition) {
      apply(failRun(run, `definition ${run.workflowId} version ${run.workflowVersion} is not available`, now()));
      return;
    }
    const loop = loopAt(definition, loopIndex);
    const step = loop?.body[bodyIndex];
    if (!loop || !step || step.kind !== "bot") {
      apply(failRun(run, `the run has no bot step in round ${iteration.index} of the Do While`, now()));
      return;
    }
    if (!outcome.ok) {
      failBodyOrLoop(run, loopIndex, iterationIndex, bodyIndex, outcome.text.trim() || "the step's turn failed", definition);
      return;
    }
    const reported = outcome.cards
      ? { question: outcome.cards.question, ids: outcome.cards.ids.filter((id) => !resolved.has(id)) }
      : undefined;
    const waiting = reported && reported.ids.length > 0 ? reported : waitingCards(stepState.threadId, resolved);
    if (waiting) {
      apply(pauseRun(run, {
        stepId: step.id,
        question: waiting.question,
        cardIds: waiting.ids,
        askedAt: now(),
        path: [loopIndex, iterationIndex, bodyIndex],
      }, now()));
      return;
    }
    const verification = bodyStepOutput(run, loopIndex, iterationIndex, step);
    if (!verification.ok) {
      failBodyOrLoop(run, loopIndex, iterationIndex, bodyIndex, manualFailure(step, verification.error), definition);
      return;
    }
    passBodyStep(run, loopIndex, iterationIndex, bodyIndex, loop, verification);
  };

  const runBodyScriptStep = async (
    run: WorkflowRun,
    loopIndex: number,
    iterationIndex: number,
    bodyIndex: number,
    step: ScriptWorkflowStep,
    definition: WorkflowDefinition,
  ): Promise<void> => {
    const loop = loopAt(definition, loopIndex);
    const iteration = run.steps[loopIndex]?.iterations?.[iterationIndex];
    if (!loop || !iteration) return;
    const issue = environmentIssue(definition);
    if (issue !== undefined) {
      failBodyOrLoop(run, loopIndex, iterationIndex, bodyIndex, issue, definition);
      return;
    }
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
      failBodyOrLoop(run, loopIndex, iterationIndex, bodyIndex, `script ${JSON.stringify(step.run)} is not in the Workflow's scripts folder`, definition);
      return;
    }
    const started = apply(beginBodyStep(run, loopIndex, iterationIndex, bodyIndex, {}, now()));
    if (!started) return;
    if (deps.store.readRun(run.id)?.status !== "running") return;
    const runDir = deps.store.runDir(run);
    const handle = runWorkflowScript({
      scriptPath,
      stepDir: iterationStepDir(runDir, iteration.index, step.id),
      inputDir: iterationStepInputDir(runDir, iteration.index, step.id),
      outputDir: iterationStepOutputDir(runDir, iteration.index, step.id),
      timeoutMs: step.timeoutMs,
      runId: run.id,
      stepId: step.id,
      environment: scriptEnvironment,
    });
    scripts.set(run.id, handle);
    let outcome;
    try {
      outcome = await handle.promise;
    } finally {
      scripts.delete(run.id);
    }
    const current = deps.store.readRun(run.id);
    if (!current || current.status !== "running" || current.currentStep !== loopIndex) return;
    const currentIteration = current.steps[loopIndex]?.iterations?.[iterationIndex];
    if (!currentIteration || currentIteration.status !== "running") return;
    if (!outcome.ok) {
      failBodyOrLoop(current, loopIndex, iterationIndex, bodyIndex, outcome.error, definition, outcome.timedOut ? "timeout" : "failure");
      return;
    }
    const verification = bodyStepOutput(current, loopIndex, iterationIndex, step);
    if (!verification.ok) {
      failBodyOrLoop(current, loopIndex, iterationIndex, bodyIndex, manualFailure(step, verification.error), definition);
      return;
    }
    passBodyStep(current, loopIndex, iterationIndex, bodyIndex, loop, verification);
  };

  const runBodyConditionStep = (
    run: WorkflowRun,
    loopIndex: number,
    iterationIndex: number,
    bodyIndex: number,
    step: ConditionWorkflowStep,
    definition: WorkflowDefinition,
  ): void => {
    const loop = loopAt(definition, loopIndex);
    const iteration = run.steps[loopIndex]?.iterations?.[iterationIndex];
    if (!loop || !iteration) return;
    const started = apply(beginBodyStep(run, loopIndex, iterationIndex, bodyIndex, {}, now()));
    if (!started) return;
    const sourceIndex = loop.body.findIndex((candidate) => candidate.id === step.from.step);
    const source = loop.body[sourceIndex];
    if (sourceIndex < 0 || !source || source.kind === "condition") {
      failBodyOrLoop(started, loopIndex, iterationIndex, bodyIndex, `condition ${JSON.stringify(step.id)} reads ${JSON.stringify(step.from.step)}, which is not an earlier body step`, definition);
      return;
    }
    const read = readStepJson(iterationStepOutputDir(deps.store.runDir(started), iteration.index, source.id), step.from.output);
    if (!read.ok) {
      failBodyOrLoop(started, loopIndex, iterationIndex, bodyIndex, `condition ${JSON.stringify(step.id)} could not read step ${JSON.stringify(source.id)}: ${read.error}`, definition);
      return;
    }
    const outcome = evaluateConditionGroup(read.value, step);
    if (!outcome.ok) {
      failBodyOrLoop(started, loopIndex, iterationIndex, bodyIndex, outcome.error, definition);
      return;
    }
    const matched = matchedConditionLine(read.value, step);
    const targetId = outcome.match ? step.whenTrue : step.whenFalse;
    const target = targetId === undefined || targetId === null ? null : loop.body.findIndex((candidate) => candidate.id === targetId);
    if (target !== null && target < 0) {
      failBodyOrLoop(started, loopIndex, iterationIndex, bodyIndex, `condition ${JSON.stringify(step.id)} points at ${JSON.stringify(targetId)}, which is not in the body`, definition);
      return;
    }
    const completed = apply(completeBodyStep(started, loopIndex, iterationIndex, bodyIndex, {
      verified: [],
      branch: outcome.match,
      source: { step: source.id, output: step.from.output },
      ...(outcome.match ? (matched === undefined ? {} : { condition: matched }) : {}),
    }, now()));
    if (completed) void enqueue(started.id, () => advanceLoop(started.id, loopIndex, { iteration: iterationIndex, body: target }));
  };

  const buildBodyBrief = (definition: WorkflowDefinition, loop: LoopWorkflowStep, step: BotWorkflowStep, bodyIndex: number): string =>
    stepBrief({ workflowName: `${definition.name} · ${loop.name}`, step, index: bodyIndex, total: loop.body.length });

  /** Copies the last round's declared outputs and closes the Do While. */
  const finishLoopSuccess = (run: WorkflowRun, loopIndex: number, iterationIndex: number, definition: WorkflowDefinition, loop: LoopWorkflowStep): void => {
    const iteration = run.steps[loopIndex]?.iterations?.[iterationIndex];
    if (!iteration) return;
    const runDir = deps.store.runDir(run);
    const projected = projectLoopOutputs(runDir, loopIndex, iteration.index, loop);
    if (!projected.ok) {
      failLoop(run, loopIndex, projected.error, definition);
      return;
    }
    const verification = verifyStepOutputs(stepOutputDir(runDir, loopIndex + 1), loop.outputs);
    if (!verification.ok) {
      failLoop(run, loopIndex, verification.error, definition);
      return;
    }
    const target = nextStepIndex(definition.steps, loopIndex);
    const completed = apply(completeStep(run, loopIndex, { verified: verification.verified }, now(), target));
    if (completed && !isTerminalRun(completed.status)) void enqueue(run.id, () => advance(run.id));
  };

  /** Evaluates the stop condition after a whole round and decides what comes next. */
  const endRound = (run: WorkflowRun, loopIndex: number, iterationIndex: number, definition: WorkflowDefinition, loop: LoopWorkflowStep): void => {
    const iteration = run.steps[loopIndex]?.iterations?.[iterationIndex];
    if (!iteration) return;
    const fromIndex = loop.body.findIndex((step) => step.id === loop.from.step);
    const source = loop.body[fromIndex];
    if (fromIndex < 0 || !source || source.kind === "condition") {
      const reason = `could not read step ${JSON.stringify(loop.from.step)}: it is not a body step with a declared output`;
      let current = apply(failIteration(run, loopIndex, iterationIndex, reason, now()));
      if (current) failLoop(current, loopIndex, reason, definition);
      return;
    }
    const read = readStepJson(iterationStepOutputDir(deps.store.runDir(run), iteration.index, source.id), loop.from.output);
    if (!read.ok) {
      const reason = `could not read step ${JSON.stringify(loop.from.step)}: ${read.error}`;
      const current = apply(failIteration(run, loopIndex, iterationIndex, reason, now()));
      if (current) failLoop(current, loopIndex, reason, definition);
      return;
    }
    const outcome = evaluateConditionGroup(read.value, loop);
    if (!outcome.ok) {
      const current = apply(failIteration(run, loopIndex, iterationIndex, outcome.error, now()));
      if (current) failLoop(current, loopIndex, outcome.error, definition);
      return;
    }
    const matched = outcome.match ? matchedConditionLine(read.value, loop) : undefined;
    const finished = apply(finishIteration(run, loopIndex, iterationIndex, {
      conditionMatched: outcome.match,
      ...(matched === undefined ? {} : { condition: matched }),
      result: read.value,
    }, now()));
    if (!finished) return;
    if (outcome.match) {
      finishLoopSuccess(finished, loopIndex, iterationIndex, definition, loop);
      return;
    }
    if (iteration.index >= loop.maxIterations) {
      const reason = `step "${loop.id}" reached the iteration limit of ${loop.maxIterations}`;
      const failed = apply(failIteration(finished, loopIndex, iterationIndex, reason, now(), "limit"));
      if (failed) failLoop(failed, loopIndex, reason, definition, "limit");
      return;
    }
    const next = apply(beginLoopIteration(finished, loopIndex, loop.body, now()));
    if (next) {
      prepareIterationDirectories(deps.store.runDir(next), next.steps[loopIndex]!.iterations![iterationIndex + 1]!.index, loop.body);
      void enqueue(run.id, () => advanceLoop(run.id, loopIndex, { iteration: iterationIndex + 1, body: 0 }));
    }
  };

  /** Runs one body step, or decides the round's next move. */
  const advanceLoop = async (runId: string, loopIndex: number, cursor?: LoopCursor): Promise<void> => {
    let run = deps.store.readRun(runId);
    if (!run || run.status !== "running" || run.currentStep !== loopIndex) return;
    const definition = deps.store.workflow(run.workflowId, run.workflowVersion);
    if (!definition) {
      apply(failRun(run, `definition ${run.workflowId} version ${run.workflowVersion} is not available`, now()));
      return;
    }
    const loop = loopAt(definition, loopIndex);
    if (!loop) {
      apply(failRun(run, `the run has no Do While ${loopIndex + 1} in the definition`, now()));
      return;
    }
    if (run.steps[loopIndex]!.status === "pending") {
      const started = apply(beginStep(run, loopIndex, {}, now()));
      if (!started) return;
      run = started;
    }
    if (run.steps[loopIndex]!.status !== "running") return;

    let iterationIndex: number;
    let bodyIndex: number | null;
    if (cursor) {
      iterationIndex = cursor.iteration;
      bodyIndex = cursor.body;
    } else {
      const iterations = run.steps[loopIndex]!.iterations ?? [];
      if (iterations.length === 0) {
        const started = apply(beginLoopIteration(run, loopIndex, loop.body, now()));
        if (!started) return;
        run = started;
        prepareIterationDirectories(deps.store.runDir(run), started.steps[loopIndex]!.iterations![0]!.index, loop.body);
        iterationIndex = 0;
        bodyIndex = 0;
      } else {
        const lastIndex = iterations.length - 1;
        const last = iterations[lastIndex]!;
        if (last.status === "running") {
          iterationIndex = lastIndex;
          const running = last.steps.findIndex((step) => step.status === "running");
          const pending = last.steps.findIndex((step) => step.status === "pending");
          bodyIndex = running >= 0 ? running : pending >= 0 ? pending : null;
        } else if (last.status === "succeeded") {
          if (last.conditionMatched === true) {
            finishLoopSuccess(run, loopIndex, lastIndex, definition, loop);
            return;
          }
          if (last.index >= loop.maxIterations) {
            const reason = `step "${loop.id}" reached the iteration limit of ${loop.maxIterations}`;
            const failed = apply(failIteration(run, loopIndex, lastIndex, reason, now(), "limit"));
            if (failed) failLoop(failed, loopIndex, reason, definition, "limit");
            return;
          }
          const started = apply(beginLoopIteration(run, loopIndex, loop.body, now()));
          if (!started) return;
          run = started;
          prepareIterationDirectories(deps.store.runDir(run), started.steps[loopIndex]!.iterations![lastIndex + 1]!.index, loop.body);
          iterationIndex = lastIndex + 1;
          bodyIndex = 0;
        } else {
          failLoop(run, loopIndex, last.error ?? "the round failed", definition, last.failureKind ?? "failure");
          return;
        }
      }
    }

    if (bodyIndex === null) {
      endRound(run, loopIndex, iterationIndex, definition, loop);
      return;
    }
    const iteration = run.steps[loopIndex]!.iterations?.[iterationIndex];
    const bodyState = iteration?.steps[bodyIndex];
    const step = loop.body[bodyIndex];
    if (!iteration || !bodyState || !step) {
      apply(failRun(run, `the run has no body step ${bodyIndex + 1} in Do While ${loopIndex + 1}`, now()));
      return;
    }
    if (bodyState.status === "running") {
      // An approval pause resumes through turnSettled; a manual hold through resume().
      return;
    }
    if (bodyState.status !== "pending") {
      if (bodyState.status === "failed") {
        failBodyOrLoop(run, loopIndex, iterationIndex, bodyIndex, bodyState.error ?? "the body step failed", definition, bodyState.failureKind ?? "failure");
        return;
      }
      endRound(run, loopIndex, iterationIndex, definition, loop);
      return;
    }
    const path: StepPath = [loopIndex, iterationIndex, bodyIndex];
    if ((step.kind === "bot" || step.kind === "script") && step.mode === "manual" && !consumeRelease(run.id, path)) {
      apply(holdBodyRun(run, loopIndex, iterationIndex, bodyIndex, now()));
      return;
    }
    if (step.kind === "bot") {
      const missing = deps.missingSkills?.(step.botId, step.skills) ?? [];
      if (missing.length > 0) {
        failBodyOrLoop(run, loopIndex, iterationIndex, bodyIndex, `skill ${JSON.stringify(missing[0])} is not available for this Workflow step`, definition);
        return;
      }
    }
    const copied = copyBodyStepInputs(
      deps.store.runDir(run),
      loopIndex,
      iteration.index,
      bodyIndex,
      step,
      loop.body,
      definition.steps,
    );
    if (!copied.ok) {
      failBodyOrLoop(run, loopIndex, iterationIndex, bodyIndex, copied.error, definition);
      return;
    }
    const resolved = resolveStepParameters(step, run.inputs ?? {}, (sourceStep, output) => {
      const bodySource = loop.body.findIndex((candidate) => candidate.id === sourceStep);
      if (bodySource >= 0 && bodySource < bodyIndex) {
        return readStepJson(iterationStepOutputDir(deps.store.runDir(run), iteration.index, loop.body[bodySource]!.id), output);
      }
      const topSource = definition.steps.findIndex((candidate) => candidate.id === sourceStep);
      if (bodySource < 0 && topSource >= 0 && topSource < loopIndex) {
        return readStepJson(stepOutputDir(deps.store.runDir(run), topSource + 1), output);
      }
      return { ok: false, error: "the source is not an earlier body step or an earlier top-level step" };
    });
    if (!resolved.ok) {
      failBodyOrLoop(run, loopIndex, iterationIndex, bodyIndex, resolved.error, definition);
      return;
    }
    const wroteParams = writeStepParameters(iterationStepInputDir(deps.store.runDir(run), iteration.index, step.id), step, resolved.values);
    if (!wroteParams.ok) {
      failBodyOrLoop(run, loopIndex, iterationIndex, bodyIndex, wroteParams.error, definition);
      return;
    }
    if (step.kind === "script") {
      await runBodyScriptStep(run, loopIndex, iterationIndex, bodyIndex, step, definition);
      return;
    }
    if (step.kind === "condition") {
      runBodyConditionStep(run, loopIndex, iterationIndex, bodyIndex, step, definition);
      return;
    }
    const runDir = deps.store.runDir(run);
    const threadId = deps.createThread({
      botId: step.botId,
      title: stepThreadTitle(`${definition.name} · ${loop.name}`, step, run.id),
      cwd: iterationStepDir(runDir, iteration.index, step.id),
    });
    if (!threadId) {
      failBodyOrLoop(run, loopIndex, iterationIndex, bodyIndex, `bot ${JSON.stringify(step.botId)} does not exist`, definition);
      return;
    }
    const started = apply(beginBodyStep(run, loopIndex, iterationIndex, bodyIndex, { threadId }, now()));
    if (!started) return;
    stepThreads.set(threadId, { runId: run.id, path });
    if (step.timeoutMs > 0) {
      const timer = setTimeout(() => {
        timers.delete(run.id);
        void enqueue(run.id, () => timeOutStep(run.id, path, step.timeoutMs));
      }, step.timeoutMs);
      timer.unref?.();
      timers.set(run.id, { handle: timer, path });
    }
    if (deps.store.readRun(run.id)?.status !== "running") return;
    try {
      await deps.startTurn(step.botId, buildBodyBrief(definition, loop, step, bodyIndex), {
        threadId,
        workflowStep: { runId: run.id, stepId: step.id },
        ...(step.skills === undefined ? {} : { skills: step.skills }),
        onSettled: (outcome) => {
          void enqueue(run.id, () => settleBody(run.id, path, outcome));
        },
      });
    } catch (error) {
      await settleBody(run.id, path, { ok: false, text: error instanceof Error ? error.message : String(error) });
    }
  };

  const settle = async (runId: string, index: number, outcome: HostTurnResult): Promise<void> => {
    const run = deps.store.readRun(runId);
    if (!run || run.status !== "running") return;
    finishStep(run, index, outcome);
  };

  const settleBody = async (runId: string, path: StepPath, outcome: HostTurnResult): Promise<void> => {
    const run = deps.store.readRun(runId);
    if (!run || run.status !== "running" || run.currentStep !== path[0]) return;
    finishBodyStep(run, path, outcome);
  };

  /** A step's turn outlived its declared limit: route it as its own kind of failure. */
  const timeOutStep = (runId: string, path: StepPath, timeoutMs: number): void => {
    const run = deps.store.readRun(runId);
    if (!run || run.status !== "running" || run.currentStep !== path[0]) return;
    const definition = deps.store.workflow(run.workflowId, run.workflowVersion);
    if (!definition) {
      apply(failRun(run, `definition ${run.workflowId} version ${run.workflowVersion} is not available`, now()));
      return;
    }
    if (path.length === 1) {
      const index = path[0]!;
      const stepState = run.steps[index];
      if (stepState?.status !== "running") return;
      const step = definition.steps[index];
      if (step?.kind === "bot" && stepState.threadId) {
        try {
          deps.interrupt?.(step.botId, stepState.threadId);
        } catch (error) {
          log(`workflows: could not interrupt ${stepState.threadId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      failOrRoute(run, index, `the step timed out after ${timeoutMs}ms`, definition, "timeout");
      return;
    }
    const [loopIndex, iterationIndex, bodyIndex] = path as [number, number, number];
    const iteration = run.steps[loopIndex]?.iterations?.[iterationIndex];
    const stepState = iteration?.steps[bodyIndex];
    if (!iteration || !stepState || stepState.status !== "running") return;
    const loop = loopAt(definition, loopIndex);
    const step = loop?.body[bodyIndex];
    if (step?.kind === "bot" && stepState.threadId) {
      try {
        deps.interrupt?.(step.botId, stepState.threadId);
      } catch (error) {
        log(`workflows: could not interrupt ${stepState.threadId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    failBodyOrLoop(run, loopIndex, iterationIndex, bodyIndex, `the step timed out after ${timeoutMs}ms`, definition, "timeout");
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
    if (step.kind === "loop") {
      await advanceLoop(runId, index);
      return;
    }
    if (stepState.status !== "pending") return;
    if (step.kind === "condition") {
      runConditionStep(run, index, step, definition);
      return;
    }
    if (step.mode === "manual" && !consumeRelease(run.id, [index])) {
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
    const resolved = resolveStepParameters(step, run.inputs ?? {}, (sourceStep, output) => {
      const sourceIndex = definition.steps.findIndex((candidate) => candidate.id === sourceStep);
      if (sourceIndex < 0 || sourceIndex >= index) return { ok: false, error: "the source step is not an earlier step" };
      return readStepJson(stepOutputDir(deps.store.runDir(run), sourceIndex + 1), output);
    });
    if (!resolved.ok) {
      failOrRoute(run, index, resolved.error, definition);
      return;
    }
    const wroteParams = writeStepParameters(stepInputDir(deps.store.runDir(run), index + 1), step, resolved.values);
    if (!wroteParams.ok) {
      failOrRoute(run, index, wroteParams.error, definition);
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
    const path: StepPath = [index];
    stepThreads.set(threadId, { runId: run.id, path });
    if (step.timeoutMs > 0) {
      const timer = setTimeout(() => {
        timers.delete(run.id);
        void enqueue(run.id, () => timeOutStep(run.id, path, step.timeoutMs));
      }, step.timeoutMs);
      timer.unref?.();
      timers.set(run.id, { handle: timer, path });
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

  /** The thread a live run owns right now, top-level or inside a Do While round. */
  const activeThread = (run: WorkflowRun, definition: WorkflowDefinition | undefined): { threadId: string; path: StepPath; botId?: string } | undefined => {
    const top = run.steps[run.currentStep];
    if (top?.threadId) {
      const step = definition?.steps[run.currentStep];
      return { threadId: top.threadId, path: [run.currentStep], ...(step?.kind === "bot" ? { botId: step.botId } : {}) };
    }
    if (top?.kind !== "loop") return undefined;
    const iterations = top.iterations ?? [];
    for (const [iterationIndex, iteration] of iterations.entries()) {
      if (iteration.status !== "running") continue;
      const bodyIndex = iteration.steps.findIndex((step) => step.status === "running");
      const stepState = bodyIndex >= 0 ? iteration.steps[bodyIndex] : undefined;
      if (!stepState?.threadId) continue;
      const loop = definition?.steps[run.currentStep];
      const step = loop?.kind === "loop" ? loop.body[bodyIndex] : undefined;
      return {
        threadId: stepState.threadId,
        path: [run.currentStep, iterationIndex, bodyIndex],
        ...(step?.kind === "bot" ? { botId: step.botId } : {}),
      };
    }
    return undefined;
  };

  const recoverLoop = (run: WorkflowRun, definition: WorkflowDefinition): void => {
    const loopIndex = run.currentStep;
    const loopState = run.steps[loopIndex];
    if (!loopState) return;
    if (loopState.status === "pending") {
      void enqueue(run.id, () => advance(run.id));
      return;
    }
    if (loopState.status !== "running") return;
    const iterations = loopState.iterations ?? [];
    const iterationIndex = iterations.findIndex((iteration) => iteration.status === "running");
    const iteration = iterationIndex >= 0 ? iterations[iterationIndex] : undefined;
    const bodyIndex = iteration?.steps.findIndex((step) => step.status === "running") ?? -1;
    if (iteration && bodyIndex >= 0) {
      const error = "the app restarted while this step was running";
      let current = apply(failBodyStepTo(run, loopIndex, iterationIndex, bodyIndex, error, now()));
      if (!current) return;
      current = apply(failIteration(current, loopIndex, iterationIndex, error, now()));
      if (!current) return;
      failLoop(current, loopIndex, error, definition);
      return;
    }
    // Between rounds (or after a crash between two body steps): continue from disk.
    void enqueue(run.id, () => advanceLoop(run.id, loopIndex));
  };

  return {
    start(workflowId, options = {}) {
      const definition = deps.store.workflow(workflowId, options.version);
      if (!definition) {
        return { ok: false, error: `no Workflow ${JSON.stringify(workflowId)}${options.version === undefined ? "" : ` version ${options.version}`}` };
      }
      const issue = environmentIssue(definition);
      if (issue !== undefined) return { ok: false, error: issue };
      const inputs = validateWorkflowInputs(definition, options.inputs);
      if (!inputs.ok) {
        return {
          ok: false,
          error: "the run is missing or has invalid parameters",
          needsInput: inputs.failure,
        };
      }
      try {
        const run = deps.store.createRun(definition, {
          requestedBy: options.requestedBy,
          triggeredBy: options.triggeredBy,
          ...(Object.keys(inputs.values).length > 0 ? { inputs: inputs.values } : {}),
          ...(options.requestId === undefined ? {} : { requestId: options.requestId }),
        });
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
    resume(runId, inputs = {}) {
      const run = deps.store.readRun(runId);
      if (!run) return { ok: false, error: "no such run" };
      if (run.status === "waiting_manual") {
        const definition = deps.store.workflow(run.workflowId, run.workflowVersion);
        if (!definition) return { ok: false, error: `definition ${run.workflowId} version ${run.workflowVersion} is not available` };
        const step = heldStep(run, definition);
        if (!step) return { ok: false, error: "the run's held step is not in the definition" };
        const collected = validateCollectedInputs(definition, step.id, inputs);
        if (!collected.ok) {
          return { ok: false, error: "the step's fields are missing or invalid", needsInput: collected.failure };
        }
        const releasedRun = releaseRun(run, now(), collected.values);
        if (!releasedRun.ok) return releasedRun;
        const holdPath = run.hold?.path ?? (run.hold?.step === undefined ? undefined : [run.hold.step]);
        if (holdPath) released.set(runId, holdPath);
        const applied = apply(releasedRun);
        if (applied) void enqueue(runId, () => advance(runId));
        return releasedRun;
      }
      const holdPath = run.hold?.path ?? (run.hold?.step === undefined ? undefined : [run.hold.step]);
      const releasedRun = releaseRun(run, now());
      if (!releasedRun.ok) return releasedRun;
      if (holdPath) released.set(runId, holdPath);
      const applied = apply(releasedRun);
      if (applied) void enqueue(runId, () => advance(runId));
      return releasedRun;
    },
    turnSettled(threadId, generation, outcome) {
      const entry = stepThreads.get(threadId);
      if (!entry) return;
      if (reportedTurns.get(threadId) === generation) return;
      reportedTurns.set(threadId, generation);
      void enqueue(entry.runId, () => {
        const run = deps.store.readRun(entry.runId);
        if (!run || run.status !== "waiting_approval" || run.currentStep !== entry.path[0]) return;
        if (entry.path.length === 1) {
          if (run.steps[entry.path[0]!]?.threadId !== threadId) return;
          const resumed = apply(resumeRun(run, now()));
          if (!resumed) return;
          finishStep(resumed, entry.path[0]!, outcome, new Set(run.pause?.cardIds ?? []));
          return;
        }
        const [, iterationIndex, bodyIndex] = entry.path as [number, number, number];
        const iteration = run.steps[entry.path[0]!]?.iterations?.[iterationIndex];
        if (iteration?.steps[bodyIndex]?.threadId !== threadId) return;
        const resumed = apply(resumeRun(run, now()));
        if (!resumed) return;
        finishBodyStep(resumed, entry.path, outcome, new Set(run.pause?.cardIds ?? []));
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
      const definition = deps.store.workflow(run.workflowId, run.workflowVersion);
      const active = activeThread(run, definition);
      const cancelled = cancelRun(run, reason, now());
      if (!cancelled.ok) return cancelled;
      clearTimer(runId);
      released.delete(runId);
      apply(cancelled);
      scripts.get(runId)?.kill();
      if (active?.threadId && active.botId) {
        try {
          deps.interrupt?.(active.botId, active.threadId);
        } catch (error) {
          log(`workflows: could not interrupt ${active.threadId}: ${error instanceof Error ? error.message : String(error)}`);
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
        const definition = deps.store.workflow(run.workflowId, run.workflowVersion);
        if (run.status === "running" || run.status === "waiting_approval") {
          const active = activeThread(run, definition);
          if (active) stepThreads.set(active.threadId, { runId: run.id, path: active.path });
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
        const step = definition?.steps[run.currentStep];
        if (step?.kind === "loop") {
          if (!definition) {
            apply(failRun(run, "the app restarted while this step was running; start the run again", now()));
            continue;
          }
          recoverLoop(run, definition);
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
