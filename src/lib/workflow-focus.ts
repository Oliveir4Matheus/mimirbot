import type { WorkflowRun } from "../../shared/workflow";

export type WorkflowFocusSelection =
  | { kind: "wait" }
  | { kind: "missing" }
  | { kind: "open"; runId: string; workflowId: string };

export function resolveWorkflowFocus(
  focus: { runId?: string; workflowId?: string },
  runs: readonly WorkflowRun[],
  loading: boolean,
): WorkflowFocusSelection | null {
  if (!focus.runId) return null;
  if (loading) return { kind: "wait" };
  const run = runs.find((candidate) => candidate.id === focus.runId);
  if (!run) return { kind: "missing" };
  return { kind: "open", runId: run.id, workflowId: run.workflowId || focus.workflowId || "" };
}
