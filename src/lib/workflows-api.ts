import type { WorkflowDefinition, WorkflowModule, WorkflowRun, WorkflowRunStatus, WorkflowSkillOptions } from "../../shared/workflow";
import type { AuthoringIssue } from "../../shared/workflow-authoring";
import type { WorkflowProposal, WorkflowProposalAnswers, WorkflowProposalStatus } from "../../shared/workflow-proposal";
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

/** The installation's script environment: prepared or not, when, and what changed since. */
export interface WorkflowEnvironmentStatus {
  prepared: boolean;
  stale: boolean;
  preparedAt?: number;
  hash?: string;
  changed: number;
  declared: number;
  python?: string;
  node?: string;
  modules: WorkflowModule[];
}

export interface WorkflowEnvironmentPreparation {
  ok: boolean;
  preparedAt?: number;
  hash?: string;
  installed: WorkflowModule[];
  missing: string[];
  tail?: string;
}

export function readEnvironment(): Promise<WorkflowEnvironmentStatus> {
  return api<WorkflowEnvironmentStatus>("/api/workflows/environment");
}

export function prepareEnvironment(): Promise<WorkflowEnvironmentPreparation> {
  return api<WorkflowEnvironmentPreparation>("/api/workflows/environment/prepare", json({}));
}

export function readRun(id: string): Promise<WorkflowRun> {
  return api<{ run: WorkflowRun }>(`/api/workflows/runs/${encodeURIComponent(id)}`).then((answer) => answer.run);
}

export interface StartRunOptions {
  version?: number;
  /** Only the parameters the version takes at the start; a value with an origin is never typed here. */
  inputs?: Record<string, unknown>;
}

export function startRun(id: string, options: StartRunOptions = {}): Promise<WorkflowRun> {
  const body: Record<string, unknown> = {};
  if (options.version !== undefined) body.version = options.version;
  if (options.inputs !== undefined && Object.keys(options.inputs).length > 0) body.inputs = options.inputs;
  return api<{ run: WorkflowRun }>(`/api/workflows/${encodeURIComponent(id)}/run`, json(body))
    .then((answer) => answer.run);
}

export function continueRun(id: string, inputs: Record<string, unknown> = {}): Promise<WorkflowRun> {
  return api<{ run: WorkflowRun }>(`/api/workflows/runs/${encodeURIComponent(id)}/continue`, json(Object.keys(inputs).length > 0 ? { inputs } : {}))
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

export function createWorkflowFromProposal(id: string, acknowledge?: { reason: string }): Promise<{ workflowId: string; version: number }> {
  return api<{ workflowId: string; version: number }>(
    `/api/workflow-proposals/${encodeURIComponent(id)}/create`,
    json(acknowledge === undefined ? {} : { acknowledge }),
  );
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

/** The person's answers under the three interview questions; the bot cannot confirm them. */
export function confirmProposal(id: string, interview: WorkflowProposalAnswers): Promise<WorkflowProposal> {
  return api<{ proposal: WorkflowProposal }>(`/api/workflow-proposals/${encodeURIComponent(id)}/confirm`, {
    method: "POST",
    body: JSON.stringify({ interview }),
  }).then((answer) => answer.proposal);
}

export interface WorkflowScriptUpload {
  name: string;
  content: string;
}

const saveBody = (definition: WorkflowDefinition, scripts?: readonly WorkflowScriptUpload[]): RequestInit => ({
  method: "POST",
  body: JSON.stringify(scripts && scripts.length > 0 ? { ...definition, scripts } : definition),
});

export interface WorkflowSaveResult {
  workflow: WorkflowDefinition;
  /** What the author should look at without blocking the save. */
  warnings: AuthoringIssue[];
}

export function createWorkflow(definition: WorkflowDefinition, scripts?: readonly WorkflowScriptUpload[]): Promise<WorkflowSaveResult> {
  return api<{ workflow: WorkflowDefinition; warnings?: AuthoringIssue[] }>("/api/workflows", saveBody(definition, scripts))
    .then((answer) => ({ workflow: answer.workflow, warnings: answer.warnings ?? [] }));
}

export function updateWorkflow(definition: WorkflowDefinition, scripts?: readonly WorkflowScriptUpload[]): Promise<WorkflowSaveResult> {
  return api<{ workflow: WorkflowDefinition; warnings?: AuthoringIssue[] }>(`/api/workflows/${encodeURIComponent(definition.id)}`, {
    ...saveBody(definition, scripts),
    method: "PUT",
  }).then((answer) => ({ workflow: answer.workflow, warnings: answer.warnings ?? [] }));
}

export function listScripts(id: string): Promise<Array<{ name: string }>> {
  return api<{ scripts: Array<{ name: string }> }>(`/api/workflows/${encodeURIComponent(id)}/scripts`)
    .then((answer) => answer.scripts ?? []);
}

export function readScript(id: string, name: string): Promise<string> {
  return api<{ script: { content: string } }>(`/api/workflows/${encodeURIComponent(id)}/scripts/${encodeURIComponent(name)}`)
    .then((answer) => answer.script?.content ?? "");
}
