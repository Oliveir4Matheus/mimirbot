import type { WorkflowRunStatus } from "../../../shared/workflow";
import type { ActiveRunRef } from "@/lib/workflows-api";

export type Tab = "workflows" | "runs";
export type WorkflowSituation = "all" | "active" | "inactive";
export type WorkflowSort = "name" | "activity";
export type RunPeriod = "today" | "7" | "30" | "all";

export interface WorkflowFilters {
  department: string;
  situation: WorkflowSituation;
  sort: WorkflowSort;
}

export interface RunFilters {
  workflowId: string;
  statuses: WorkflowRunStatus[];
  department: string;
  period: RunPeriod;
}

export type DialogState =
  | { kind: "run"; workflowId: string; version?: number }
  | { kind: "cancel"; runId: string }
  | { kind: "deleteWorkflow"; workflowId: string }
  | { kind: "deleteRun"; runId: string };

export interface WorkflowConflict {
  message: string;
  runs: ActiveRunRef[];
}

export interface ToastMessage {
  id: number;
  text: string;
}
