import type { WorkflowDefinition, WorkflowRun, WorkflowRunStatus } from "../../shared/workflow";
import { api } from "@/state/api";

export interface WorkflowDetail {
  workflow: WorkflowDefinition;
  versions: WorkflowDefinition[];
}

export interface ActiveRunRef {
  id: string;
  status: WorkflowRunStatus;
  currentStep: number;
}

export interface RequestOptions {
  background?: boolean;
}

const json = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body ?? {}) });

export function listWorkflows(options: RequestOptions = {}): Promise<WorkflowDefinition[]> {
  return api<{ workflows: WorkflowDefinition[] }>("/api/workflows", { background: options.background })
    .then((answer) => answer.workflows ?? []);
}

export function listRuns(limit = 200, options: RequestOptions = {}): Promise<WorkflowRun[]> {
  return api<{ runs: WorkflowRun[] }>(`/api/workflows/runs?limit=${limit}`, { background: options.background })
    .then((answer) => answer.runs ?? []);
}

export function readWorkflow(id: string): Promise<WorkflowDetail> {
  return api<WorkflowDetail>(`/api/workflows/${encodeURIComponent(id)}`);
}

export function readRun(id: string): Promise<WorkflowRun> {
  return api<{ run: WorkflowRun }>(`/api/workflows/runs/${encodeURIComponent(id)}`).then((answer) => answer.run);
}

export function startRun(id: string, version?: number): Promise<WorkflowRun> {
  return api<{ run: WorkflowRun }>(`/api/workflows/${encodeURIComponent(id)}/run`, json(version === undefined ? {} : { version }))
    .then((answer) => answer.run);
}

export function cancelRun(id: string, reason?: string): Promise<WorkflowRun> {
  return api<{ run: WorkflowRun }>(`/api/workflows/runs/${encodeURIComponent(id)}/cancel`, json(reason?.trim() ? { reason: reason.trim() } : {}))
    .then((answer) => answer.run);
}

export function deleteWorkflow(id: string): Promise<boolean> {
  return api<{ removed: boolean }>(`/api/workflows/${encodeURIComponent(id)}`, { method: "DELETE" })
    .then((answer) => answer.removed === true);
}

export function deleteRun(id: string): Promise<boolean> {
  return api<{ removed: boolean }>(`/api/workflows/runs/${encodeURIComponent(id)}`, { method: "DELETE" })
    .then((answer) => answer.removed === true);
}
