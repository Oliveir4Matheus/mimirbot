// Pure run transitions. The engine decides when one happens; this module only
// says what the run looks like afterwards, so a transition is testable without
// a disk, a turn or a clock.
import type { WorkflowDefinition, WorkflowRun, WorkflowRunPause } from "../../shared/workflow.ts";

export type RunTransition = { ok: true; run: WorkflowRun } | { ok: false; error: string };

const TERMINAL = new Set<WorkflowRun["status"]>(["succeeded", "failed", "cancelled"]);

export function isTerminalRun(status: WorkflowRun["status"]): boolean {
  return TERMINAL.has(status);
}

/** A run that still owns a step or a turn: deleting its Workflow or the run itself must wait. */
export function isActiveRun(status: WorkflowRun["status"]): boolean {
  return status === "queued" || status === "running" || status === "waiting_approval";
}

const clone = (run: WorkflowRun): WorkflowRun => structuredClone(run);

export function createRun(input: {
  definition: Pick<WorkflowDefinition, "id" | "version" | "name" | "department" | "steps">;
  runId: string;
  now: number;
  requestedBy?: WorkflowRun["requestedBy"];
  triggeredBy?: WorkflowRun["triggeredBy"];
}): WorkflowRun {
  const { definition, runId, now, requestedBy, triggeredBy } = input;
  return {
    id: runId,
    workflowId: definition.id,
    workflowVersion: definition.version,
    department: definition.department,
    status: "queued",
    currentStep: 0,
    steps: definition.steps.map((step) => ({ id: step.id, status: "pending", attempts: 0 })),
    createdAt: now,
    updatedAt: now,
    ...(requestedBy ? { requestedBy } : {}),
    ...(triggeredBy ? { triggeredBy } : {}),
    snapshot: {
      name: definition.name,
      steps: definition.steps.map((step) => ({ id: step.id, name: step.name })),
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
  target.attempts += 1;
  if (input.threadId !== undefined) target.threadId = input.threadId;
  if (input.assignmentId !== undefined) target.assignmentId = input.assignmentId;
  target.startedAt ??= now;
  next.updatedAt = now;
  return { ok: true, run: next };
}

/** Points the run at `index` and clears the previous visit's marks, keeping `attempts` as the visit count. */
function enterStep(run: WorkflowRun, index: number, now: number): void {
  const target = run.steps[index];
  if (!target) return;
  if (target.status !== "pending") {
    target.status = "pending";
    target.threadId = undefined;
    target.assignmentId = undefined;
    target.startedAt = undefined;
    target.finishedAt = undefined;
    target.error = undefined;
    target.verified = undefined;
  }
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
export function failStepTo(run: WorkflowRun, index: number, error: string, nextIndex: number, now: number): RunTransition {
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
  enterStep(next, nextIndex, now);
  return { ok: true, run: next };
}

export function failStep(run: WorkflowRun, index: number, error: string, now: number): RunTransition {
  const step = run.steps[index];
  if (!step) return { ok: false, error: `the run has no step ${index + 1}` };
  if (isTerminalRun(run.status)) return { ok: false, error: `a ${run.status} run cannot fail` };
  const next = clone(run);
  const target = next.steps[index]!;
  target.status = "failed";
  target.error = error;
  target.finishedAt = now;
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
  next.status = "cancelled";
  if (reason) next.error = reason;
  next.finishedAt = now;
  next.updatedAt = now;
  next.pause = undefined;
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
