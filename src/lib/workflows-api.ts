import type { WorkflowDefinition, WorkflowRun, WorkflowRunStatus, WorkflowSkillOptions } from "../../shared/workflow";
import type { WorkflowProposal, WorkflowProposalStatus } from "../../shared/workflow-proposal";
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

export function readWorkflowSkillOptions(botId: string): Promise<WorkflowSkillOptions> {
  return api<{ options: WorkflowSkillOptions }>(`/api/workflows/skill-options?botId=${encodeURIComponent(botId)}`)
    .then((answer) => answer.options);
}

export function readRun(id: string): Promise<WorkflowRun> {
  return api<{ run: WorkflowRun }>(`/api/workflows/runs/${encodeURIComponent(id)}`).then((answer) => answer.run);
}

export function startRun(id: string, version?: number): Promise<WorkflowRun> {
  return api<{ run: WorkflowRun }>(`/api/workflows/${encodeURIComponent(id)}/run`, json(version === undefined ? {} : { version }))
    .then((answer) => answer.run);
}

export function continueRun(id: string): Promise<WorkflowRun> {
  return api<{ run: WorkflowRun }>(`/api/workflows/runs/${encodeURIComponent(id)}/continue`, json({}))
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

export function listProposals(status: WorkflowProposalStatus | "all" = "archived", options: RequestOptions = {}): Promise<WorkflowProposal[]> {
  return api<{ proposals: WorkflowProposal[] }>(`/api/workflow-proposals?status=${status}`, { background: options.background })
    .then((answer) => answer.proposals ?? []);
}

export function readProposal(id: string): Promise<WorkflowProposal> {
  return api<{ proposal: WorkflowProposal }>(`/api/workflow-proposals/${encodeURIComponent(id)}`).then((answer) => answer.proposal);
}

export function createWorkflowFromProposal(id: string): Promise<{ workflowId: string; version: number }> {
  return api<{ workflowId: string; version: number }>(`/api/workflow-proposals/${encodeURIComponent(id)}/create`, json({}));
}

export function archiveProposal(id: string): Promise<WorkflowProposal> {
  return api<{ proposal: WorkflowProposal }>(`/api/workflow-proposals/${encodeURIComponent(id)}/archive`, json({}))
    .then((answer) => answer.proposal);
}

export function deleteProposal(id: string): Promise<boolean> {
  return api<{ removed: boolean }>(`/api/workflow-proposals/${encodeURIComponent(id)}`, { method: "DELETE" })
    .then((answer) => answer.removed === true);
}

export interface RehearsalExample {
  inputs?: Record<string, unknown>;
  files?: Array<{ name: string; content: string }>;
  expected?: Record<string, string>;
}

export function rehearseProposal(id: string, example: RehearsalExample = {}): Promise<{ rehearsal: WorkflowProposal["rehearsal"]; proposal: WorkflowProposal }> {
  return api<{ rehearsal: WorkflowProposal["rehearsal"]; proposal: WorkflowProposal }>(`/api/workflow-proposals/${encodeURIComponent(id)}/rehearse`, {
    method: "POST",
    body: JSON.stringify({ example }),
  });
}

export function annotateProposal(id: string, annotations: Record<string, string>): Promise<WorkflowProposal> {
  return api<{ proposal: WorkflowProposal }>(`/api/workflow-proposals/${encodeURIComponent(id)}/annotate`, {
    method: "POST",
    body: JSON.stringify({ annotations }),
  }).then((answer) => answer.proposal);
}

export function bumpProposalRound(id: string): Promise<WorkflowProposal> {
  return api<{ proposal: WorkflowProposal }>(`/api/workflow-proposals/${encodeURIComponent(id)}/round`, { method: "POST", body: "{}" })
    .then((answer) => answer.proposal);
}

export interface WorkflowScriptUpload {
  name: string;
  content: string;
}

const saveBody = (definition: WorkflowDefinition, scripts?: readonly WorkflowScriptUpload[]): RequestInit => ({
  method: "POST",
  body: JSON.stringify(scripts && scripts.length > 0 ? { ...definition, scripts } : definition),
});

export function createWorkflow(definition: WorkflowDefinition, scripts?: readonly WorkflowScriptUpload[]): Promise<WorkflowDefinition> {
  return api<{ workflow: WorkflowDefinition }>("/api/workflows", saveBody(definition, scripts)).then((answer) => answer.workflow);
}

export function updateWorkflow(definition: WorkflowDefinition, scripts?: readonly WorkflowScriptUpload[]): Promise<WorkflowDefinition> {
  return api<{ workflow: WorkflowDefinition }>(`/api/workflows/${encodeURIComponent(definition.id)}`, {
    ...saveBody(definition, scripts),
    method: "PUT",
  }).then((answer) => answer.workflow);
}

export function listScripts(id: string): Promise<Array<{ name: string }>> {
  return api<{ scripts: Array<{ name: string }> }>(`/api/workflows/${encodeURIComponent(id)}/scripts`)
    .then((answer) => answer.scripts ?? []);
}

export function readScript(id: string, name: string): Promise<string> {
  return api<{ script: { content: string } }>(`/api/workflows/${encodeURIComponent(id)}/scripts/${encodeURIComponent(name)}`)
    .then((answer) => answer.script?.content ?? "");
}
