// Where a step sends the run next. The definition is validated first, so an
// id that is not in `steps` means the Workflow was edited under a live run.
import { resultField, sameJsonValue, type WorkflowStep } from "../../shared/workflow.ts";

export type StepFailureKind = "failure" | "timeout";

function indexOf(steps: readonly WorkflowStep[], id: string): number | null {
  const index = steps.findIndex((step) => step.id === id);
  return index < 0 ? null : index;
}

/** The next step after `index` passes, or null when this step ends the run. */
export function nextStepIndex(steps: readonly WorkflowStep[], index: number, result: unknown): number | null {
  const step = steps[index];
  if (!step || step.kind === "condition") return null;
  for (const branch of step.when ?? []) {
    const { found, value } = resultField(result, branch.field);
    if (found && sameJsonValue(value, branch.equals)) return indexOf(steps, branch.next);
  }
  if (step.onSuccess === null) return null;
  if (step.onSuccess !== undefined) return indexOf(steps, step.onSuccess);
  return index + 1 < steps.length ? index + 1 : null;
}

/** The step a failure or timeout routes to, or null when the run must stop. */
export function failureStepIndex(steps: readonly WorkflowStep[], index: number, kind: StepFailureKind = "failure"): number | null {
  const step = steps[index];
  if (!step) return null;
  const target = kind === "timeout" && step.kind !== "condition" ? step.onTimeout ?? step.onFailure : step.onFailure;
  return target === undefined ? null : indexOf(steps, target);
}
