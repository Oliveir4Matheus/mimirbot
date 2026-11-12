// Where a step sends the run next. The definition is validated first, so an
// id that is not in `steps` means the Workflow was edited under a live run.
import { resultField, sameJsonValue, type WorkflowBodyStep, type WorkflowStep } from "../../shared/workflow.ts";

export type StepFailureKind = "failure" | "timeout" | "limit";

function indexOf(steps: readonly WorkflowStep[], id: string): number | null {
  const index = steps.findIndex((step) => step.id === id);
  return index < 0 ? null : index;
}

function bodyIndexOf(steps: readonly WorkflowBodyStep[], id: string): number | null {
  const index = steps.findIndex((step) => step.id === id);
  return index < 0 ? null : index;
}

/** The next step after `index` passes, or null when this step ends the run. */
export function nextStepIndex(steps: readonly WorkflowStep[], index: number, result: unknown): number | null {
  const step = steps[index];
  if (!step || step.kind === "condition") return null;
  if (step.kind === "bot" || step.kind === "script") {
    for (const branch of step.when ?? []) {
      const { found, value } = resultField(result, branch.field);
      if (found && sameJsonValue(value, branch.equals)) return indexOf(steps, branch.next);
    }
  }
  if (step.onSuccess === null) return null;
  if (step.onSuccess !== undefined) return indexOf(steps, step.onSuccess);
  return index + 1 < steps.length ? index + 1 : null;
}

/** The step a failure or timeout routes to, or null when the run must stop. */
export function failureStepIndex(steps: readonly WorkflowStep[], index: number, kind: StepFailureKind = "failure"): number | null {
  const step = steps[index];
  if (!step) return null;
  if (step.kind === "condition" || step.kind === "loop") return step.onFailure === undefined ? null : indexOf(steps, step.onFailure);
  const target = kind === "timeout" ? step.onTimeout ?? step.onFailure : step.onFailure;
  return target === undefined ? null : indexOf(steps, target);
}

/** Where a body step sends the next round step, or null when the round ends. */
export function bodyNextStepIndex(body: readonly WorkflowBodyStep[], index: number, result: unknown): number | null {
  const step = body[index];
  if (!step) return null;
  if (step.kind === "condition") {
    const target = result ? step.whenTrue : step.whenFalse;
    return target === undefined || target === null ? null : bodyIndexOf(body, target);
  }
  for (const branch of step.when ?? []) {
    const { found, value } = resultField(result, branch.field);
    if (found && sameJsonValue(value, branch.equals)) return bodyIndexOf(body, branch.next);
  }
  if (step.onSuccess === null) return null;
  if (step.onSuccess !== undefined) return bodyIndexOf(body, step.onSuccess);
  return index + 1 < body.length ? index + 1 : null;
}

/** The body step a failure or timeout routes to, or null when the Do While must fail. */
export function bodyFailureStepIndex(body: readonly WorkflowBodyStep[], index: number, kind: StepFailureKind = "failure"): number | null {
  const step = body[index];
  if (!step) return null;
  const target = kind === "timeout" && step.kind !== "condition" ? step.onTimeout ?? step.onFailure : step.onFailure;
  return target === undefined ? null : bodyIndexOf(body, target);
}
