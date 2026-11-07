// D10: a run ages out by the Workflow's own retention, but a run still moving
// or paused for a person is never touched. The engine only writes; this module
// is the only code that removes a run folder.
import type { WorkflowStore } from "./store.ts";
import { isActiveRun } from "./state.ts";

export interface RetentionResult {
  removed: string[];
  kept: number;
}

const DAY_MS = 86_400_000;

export function pruneWorkflowRuns(deps: {
  store: Pick<WorkflowStore, "listRuns" | "deleteRun" | "retentionDays">;
  now?: () => number;
  log?: (line: string) => void;
}): RetentionResult {
  const now = deps.now?.() ?? Date.now();
  const removed: string[] = [];
  let kept = 0;
  for (const run of deps.store.listRuns({ limit: Number.POSITIVE_INFINITY })) {
    if (isActiveRun(run.status)) {
      kept += 1;
      continue;
    }
    const age = now - (run.finishedAt ?? run.createdAt);
    const limit = deps.store.retentionDays(run.workflowId) * DAY_MS;
    if (age <= limit) {
      kept += 1;
      continue;
    }
    if (deps.store.deleteRun(run.id)) removed.push(run.id);
    else kept += 1;
  }
  if (removed.length > 0) deps.log?.(`workflows: removed ${removed.length} run${removed.length === 1 ? "" : "s"} past retention`);
  return { removed, kept };
}
