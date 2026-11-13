// Pure run transitions. The engine decides when one happens; this module only
// says what the run looks like afterwards, so a transition is testable without
// a disk, a turn or a clock.
import type {
  WorkflowBodyStep,
  WorkflowDefinition,
  WorkflowRun,
  WorkflowRunFailureKind,
  WorkflowRunIteration,
  WorkflowRunPause,
  WorkflowRunStep,
} from "../../shared/workflow.ts";

export type RunTransition = { ok: true; run: WorkflowRun } | { ok: false; error: string };

const TERMINAL = new Set<WorkflowRun["status"]>(["succeeded", "failed", "cancelled"]);

export function isTerminalRun(status: WorkflowRun["status"]): boolean {
  return TERMINAL.has(status);
}

/** A run that still owns a step or a turn: deleting its Workflow or the run itself must wait. */
export function isActiveRun(status: WorkflowRun["status"]): boolean {
  return status === "queued" || status === "running" || status === "waiting_manual" || status === "waiting_approval";
}

const clone = (run: WorkflowRun): WorkflowRun => structuredClone(run);

export function createRun(input: {
  definition: Pick<WorkflowDefinition, "id" | "version" | "name" | "department" | "steps">;
  runId: string;
  now: number;
  requestedBy?: WorkflowRun["requestedBy"];
  triggeredBy?: WorkflowRun["triggeredBy"];
  inputs?: WorkflowRun["inputs"];
  requestId?: WorkflowRun["requestId"];
}): WorkflowRun {
  const { definition, runId, now, requestedBy, triggeredBy, inputs, requestId } = input;
  return {
    id: runId,
    workflowId: definition.id,
    workflowVersion: definition.version,
    department: definition.department,
    status: "queued",
    currentStep: 0,
    steps: definition.steps.map((step) => step.kind === "loop"
      ? { id: step.id, status: "pending" as const, kind: "loop" as const, iterations: [] }
      : { id: step.id, status: "pending" as const }),
    createdAt: now,
    updatedAt: now,
    ...(requestedBy ? { requestedBy } : {}),
    ...(triggeredBy ? { triggeredBy } : {}),
    ...(inputs ? { inputs } : {}),
    ...(requestId ? { requestId } : {}),
    snapshot: {
      name: definition.name,
      steps: definition.steps.map((step) => step.kind === "loop"
        ? { id: step.id, name: step.name, body: step.body.map((bodyStep) => ({ id: bodyStep.id, name: bodyStep.name })) }
        : { id: step.id, name: step.name }),
    },
  };
}

export function beginRun(run: WorkflowRun, now: number): RunTransition {
  if (run.status !== "queued") return { ok: false, error: `a ${run.status} run cannot start` };
  const next = clone(run);
  next.status = "running";
  next.startedAt = now;
  next.updatedAt = now;
  return { ok: true, run: next };
}

export function beginStep(
  run: WorkflowRun,
  index: number,
  input: { threadId?: string; assignmentId?: string },
  now: number,
): RunTransition {
  if (run.status !== "running") return { ok: false, error: `a ${run.status} run cannot start a step` };
  if (index !== run.currentStep) return { ok: false, error: `step ${index + 1} is not the current step` };
  const step = run.steps[index];
  if (!step) return { ok: false, error: `the run has no step ${index + 1}` };
  if (step.status !== "pending") return { ok: false, error: `step ${index + 1} is already ${step.status}` };
  const next = clone(run);
  const target = next.steps[index]!;
  target.status = "running";
  if (input.threadId !== undefined) target.threadId = input.threadId;
  if (input.assignmentId !== undefined) target.assignmentId = input.assignmentId;
  target.startedAt ??= now;
  next.updatedAt = now;
  return { ok: true, run: next };
}

/** Points the run at `index`. Only a forward edge reaches this, so the step is still pending. */
function enterStep(run: WorkflowRun, index: number, now: number): void {
  run.currentStep = index;
  run.updatedAt = now;
}

/** Marks a run successful: steps the path never took are `skipped`, not `pending`. */
function finishRun(run: WorkflowRun, now: number, result?: unknown): void {
  for (const step of run.steps) {
    if (step.status === "pending") step.status = "skipped";
  }
  run.status = "succeeded";
  run.currentStep = run.steps.length;
  run.finishedAt = now;
  run.updatedAt = now;
  if (result !== undefined) run.result = result;
}

export function completeStep(
  run: WorkflowRun,
  index: number,
  input: { verified: string[]; result?: unknown },
  now: number,
  nextIndex?: number | null,
): RunTransition {
  if (run.status !== "running") return { ok: false, error: `a ${run.status} run cannot complete a step` };
  const step = run.steps[index];
  if (!step || step.status !== "running") return { ok: false, error: `step ${index + 1} is not running` };
  const next = clone(run);
  const target = next.steps[index]!;
  target.status = "succeeded";
  target.finishedAt = now;
  target.verified = [...input.verified];
  next.updatedAt = now;
  const destination = nextIndex === undefined
    ? (index + 1 < next.steps.length ? index + 1 : null)
    : nextIndex;
  if (destination === null) finishRun(next, now, input.result);
  else enterStep(next, destination, now);
  return { ok: true, run: next };
}

/** A step failed on a path the Workflow declared with `onFailure`: the run continues there. */
export function failStepTo(
  run: WorkflowRun,
  index: number,
  error: string,
  nextIndex: number,
  now: number,
  failureKind?: WorkflowRunStep["failureKind"],
): RunTransition {
  if (run.status !== "running") return { ok: false, error: `a ${run.status} run cannot fail a step` };
  const step = run.steps[index];
  if (!step || (step.status !== "running" && step.status !== "pending")) {
    return { ok: false, error: `step ${index + 1} is not running` };
  }
  if (!run.steps[nextIndex]) return { ok: false, error: `the run has no step ${nextIndex + 1}` };
  const next = clone(run);
  const target = next.steps[index]!;
  target.status = "failed";
  target.error = error;
  target.finishedAt = now;
  if (failureKind !== undefined) target.failureKind = failureKind;
  enterStep(next, nextIndex, now);
  return { ok: true, run: next };
}

export function failStep(
  run: WorkflowRun,
  index: number,
  error: string,
  now: number,
  failureKind?: WorkflowRunStep["failureKind"],
): RunTransition {
  const step = run.steps[index];
  if (!step) return { ok: false, error: `the run has no step ${index + 1}` };
  if (isTerminalRun(run.status)) return { ok: false, error: `a ${run.status} run cannot fail` };
  const next = clone(run);
  const target = next.steps[index]!;
  target.status = "failed";
  target.error = error;
  target.finishedAt = now;
  if (failureKind !== undefined) target.failureKind = failureKind;
  next.status = "failed";
  next.error = error;
  next.finishedAt = now;
  next.updatedAt = now;
  return { ok: true, run: next };
}

/** A failure outside a step (a missing definition, a thread that could not open). */
export function failRun(run: WorkflowRun, error: string, now: number): RunTransition {
  if (isTerminalRun(run.status)) return { ok: false, error: `a ${run.status} run cannot fail` };
  const next = clone(run);
  const current = next.steps[next.currentStep];
  if (current?.status === "running") {
    current.status = "failed";
    current.error = error;
    current.finishedAt = now;
  }
  next.status = "failed";
  next.error = error;
  next.finishedAt = now;
  next.updatedAt = now;
  return { ok: true, run: next };
}

export function cancelRun(run: WorkflowRun, reason: string | undefined, now: number): RunTransition {
  if (isTerminalRun(run.status)) return { ok: false, error: `a ${run.status} run cannot be cancelled` };
  const next = clone(run);
  const current = next.steps[next.currentStep];
  if (current?.status === "running") {
    current.status = "skipped";
    current.error = reason ?? "cancelled";
    current.finishedAt = now;
  }
  const iteration = current?.iterations?.find((entry) => entry.status === "running");
  if (iteration) {
    for (const body of iteration.steps) {
      if (body.status !== "running" && body.status !== "pending") continue;
      body.status = "skipped";
      body.error = reason ?? "cancelled";
      body.finishedAt = now;
    }
    iteration.status = "skipped";
    iteration.error = reason ?? "cancelled";
    iteration.finishedAt = now;
  }
  next.status = "cancelled";
  if (reason) next.error = reason;
  next.finishedAt = now;
  next.updatedAt = now;
  next.pause = undefined;
  next.hold = undefined;
  return { ok: true, run: next };
}

export function pauseRun(run: WorkflowRun, pause: WorkflowRunPause, now: number): RunTransition {
  if (run.status !== "running") return { ok: false, error: `a ${run.status} run cannot wait for approval` };
  const next = clone(run);
  next.status = "waiting_approval";
  next.pause = structuredClone(pause);
  next.updatedAt = now;
  return { ok: true, run: next };
}

export function resumeRun(run: WorkflowRun, now: number): RunTransition {
  if (run.status !== "waiting_approval") return { ok: false, error: `a ${run.status} run is not waiting for approval` };
  const next = clone(run);
  next.status = "running";
  next.pause = undefined;
  next.updatedAt = now;
  return { ok: true, run: next };
}

/** Parks a run before a manual step; the step stays pending until a person continues it. */
export function holdRun(run: WorkflowRun, index: number, now: number): RunTransition {
  if (run.status !== "running") return { ok: false, error: `a ${run.status} run cannot wait for a person` };
  if (index !== run.currentStep) return { ok: false, error: `step ${index + 1} is not the current step` };
  const step = run.steps[index];
  if (!step) return { ok: false, error: `the run has no step ${index + 1}` };
  if (step.status !== "pending") return { ok: false, error: `step ${index + 1} is already ${step.status}` };
  const next = clone(run);
  next.status = "waiting_manual";
  next.hold = { path: [index], step: index, since: now };
  next.updatedAt = now;
  return { ok: true, run: next };
}

function iterationAt(run: WorkflowRun, loopIndex: number, iterationIndex: number): WorkflowRunIteration | undefined {
  return run.steps[loopIndex]?.iterations?.[iterationIndex];
}

/** Starts the next round and gives every body step a pending state. */
export function beginLoopIteration(run: WorkflowRun, loopIndex: number, body: readonly WorkflowBodyStep[], now: number): RunTransition {
  if (run.status !== "running") return { ok: false, error: `a ${run.status} run cannot start a round` };
  const loop = run.steps[loopIndex];
  if (!loop) return { ok: false, error: `the run has no step ${loopIndex + 1}` };
  if (loop.status !== "running") return { ok: false, error: `step ${loopIndex + 1} is not running` };
  const next = clone(run);
  const target = next.steps[loopIndex]!;
  target.kind = "loop";
  const iterations = target.iterations ?? [];
  const index = iterations.length + 1;
  iterations.push({
    index,
    status: "running",
    startedAt: now,
    steps: body.map((step) => ({ id: step.id, status: "pending" })),
  });
  target.iterations = iterations;
  next.updatedAt = now;
  return { ok: true, run: next };
}

/** Marks one body step as started; its thread or script handle is optional. */
export function beginBodyStep(
  run: WorkflowRun,
  loopIndex: number,
  iterationIndex: number,
  bodyIndex: number,
  input: { threadId?: string; assignmentId?: string },
  now: number,
): RunTransition {
  if (run.status !== "running") return { ok: false, error: `a ${run.status} run cannot start a body step` };
  const iteration = iterationAt(run, loopIndex, iterationIndex);
  const step = iteration?.steps[bodyIndex];
  if (!iteration || !step) return { ok: false, error: `the round has no body step ${bodyIndex + 1}` };
  if (step.status !== "pending") return { ok: false, error: `body step ${bodyIndex + 1} is already ${step.status}` };
  const next = clone(run);
  const target = next.steps[loopIndex]!.iterations![iterationIndex]!.steps[bodyIndex]!;
  target.status = "running";
  if (input.threadId !== undefined) target.threadId = input.threadId;
  if (input.assignmentId !== undefined) target.assignmentId = input.assignmentId;
  target.startedAt ??= now;
  next.updatedAt = now;
  return { ok: true, run: next };
}

/** Marks one body step successful; the caller decides whether the round continues. */
export function completeBodyStep(
  run: WorkflowRun,
  loopIndex: number,
  iterationIndex: number,
  bodyIndex: number,
  input: { verified: string[] },
  now: number,
): RunTransition {
  if (run.status !== "running") return { ok: false, error: `a ${run.status} run cannot complete a body step` };
  const step = iterationAt(run, loopIndex, iterationIndex)?.steps[bodyIndex];
  if (!step || step.status !== "running") return { ok: false, error: `body step ${bodyIndex + 1} is not running` };
  const next = clone(run);
  const target = next.steps[loopIndex]!.iterations![iterationIndex]!.steps[bodyIndex]!;
  target.status = "succeeded";
  target.finishedAt = now;
  target.verified = [...input.verified];
  next.updatedAt = now;
  return { ok: true, run: next };
}

export function failBodyStepTo(
  run: WorkflowRun,
  loopIndex: number,
  iterationIndex: number,
  bodyIndex: number,
  error: string,
  now: number,
  failureKind?: WorkflowRunFailureKind,
): RunTransition {
  if (run.status !== "running") return { ok: false, error: `a ${run.status} run cannot fail a body step` };
  const step = iterationAt(run, loopIndex, iterationIndex)?.steps[bodyIndex];
  if (!step || (step.status !== "running" && step.status !== "pending")) {
    return { ok: false, error: `body step ${bodyIndex + 1} is not running` };
  }
  const next = clone(run);
  const target = next.steps[loopIndex]!.iterations![iterationIndex]!.steps[bodyIndex]!;
  target.status = "failed";
  target.error = error;
  target.finishedAt = now;
  if (failureKind !== undefined) target.failureKind = failureKind;
  next.updatedAt = now;
  return { ok: true, run: next };
}

/** Ends the round, keeping any failed body step visible in its history. */
export function finishIteration(
  run: WorkflowRun,
  loopIndex: number,
  iterationIndex: number,
  input: { conditionMatched: boolean; condition?: WorkflowRunIteration["condition"]; result?: unknown },
  now: number,
): RunTransition {
  if (run.status !== "running") return { ok: false, error: `a ${run.status} run cannot finish a round` };
  const iteration = iterationAt(run, loopIndex, iterationIndex);
  if (!iteration || iteration.status !== "running") return { ok: false, error: "the round is not running" };
  const next = clone(run);
  const target = next.steps[loopIndex]!.iterations![iterationIndex]!;
  target.status = "succeeded";
  target.finishedAt = now;
  target.conditionMatched = input.conditionMatched;
  if (input.condition !== undefined) target.condition = input.condition;
  if (input.result !== undefined) target.result = input.result;
  for (const step of target.steps) {
    if (step.status === "pending") step.status = "skipped";
  }
  next.updatedAt = now;
  return { ok: true, run: next };
}

/** A round that cannot continue: the Do While then fails as a whole. */
export function failIteration(
  run: WorkflowRun,
  loopIndex: number,
  iterationIndex: number,
  error: string,
  now: number,
  failureKind: WorkflowRunFailureKind = "failure",
): RunTransition {
  if (run.status !== "running") return { ok: false, error: `a ${run.status} run cannot fail a round` };
  const iteration = iterationAt(run, loopIndex, iterationIndex);
  if (!iteration) return { ok: false, error: "the round does not exist" };
  const next = clone(run);
  const target = next.steps[loopIndex]!.iterations![iterationIndex]!;
  target.status = "failed";
  target.error = error;
  target.failureKind = failureKind;
  target.finishedAt = now;
  for (const step of target.steps) {
    if (step.status === "pending") step.status = "skipped";
  }
  next.updatedAt = now;
  return { ok: true, run: next };
}

/** Parks the run before a manual body step; the hold carries the full path. */
export function holdBodyRun(run: WorkflowRun, loopIndex: number, iterationIndex: number, bodyIndex: number, now: number): RunTransition {
  if (run.status !== "running") return { ok: false, error: `a ${run.status} run cannot wait for a person` };
  if (run.currentStep !== loopIndex) return { ok: false, error: `step ${loopIndex + 1} is not the current step` };
  const iteration = iterationAt(run, loopIndex, iterationIndex);
  const step = iteration?.steps[bodyIndex];
  if (!iteration || !step) return { ok: false, error: `the round has no body step ${bodyIndex + 1}` };
  if (step.status !== "pending") return { ok: false, error: `body step ${bodyIndex + 1} is already ${step.status}` };
  const next = clone(run);
  next.status = "waiting_manual";
  next.hold = { path: [loopIndex, iterationIndex, bodyIndex], since: now };
  next.updatedAt = now;
  return { ok: true, run: next };
}

/** The person continued the manual step: the run may advance it once. */
export function releaseRun(run: WorkflowRun, now: number): RunTransition {
  if (run.status !== "waiting_manual") return { ok: false, error: `a ${run.status} run is not waiting for a person` };
  const next = clone(run);
  next.status = "running";
  next.hold = undefined;
  next.updatedAt = now;
  return { ok: true, run: next };
}
