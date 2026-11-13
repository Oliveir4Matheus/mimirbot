// A Workflow the bot designed from a conversation stays a proposal until the
// person says yes. The proposal carries the same definition the engine will
// run, so validation happens once and the "yes" only re-checks it.
import { z } from "zod";

import {
  workflowDefinitionSchema,
  workflowStartsManual,
  type WorkflowDefinition,
} from "./workflow.ts";

export const WORKFLOW_PROPOSAL_SUMMARY_MAX = 4_000;
export const WORKFLOW_PROPOSAL_ANSWER_MAX = 2_000;
export const WORKFLOW_PROPOSAL_ASSUMPTION_MAX = 500;
export const WORKFLOW_PROPOSAL_ASSUMPTIONS_MAX = 30;

export const workflowProposalStatuses = ["draft", "archived", "created"] as const;
export type WorkflowProposalStatus = (typeof workflowProposalStatuses)[number];

const interviewSchema = z.object({
  /** A one-time task is not a Workflow; the bot says so instead of proposing one. */
  recurring: z.boolean(),
  /** What changes between runs; "não sei" is a valid answer and becomes an assumption. */
  changes: z.string().trim().max(WORKFLOW_PROPOSAL_ANSWER_MAX).default(""),
  /** Who answers a missing field and who confirms an irreversible effect. */
  confirmer: z.string().trim().max(WORKFLOW_PROPOSAL_ANSWER_MAX).default(""),
});

export type WorkflowProposalInterview = z.output<typeof interviewSchema>;
export const workflowProposalInterviewSchema = interviewSchema;

const proposalScriptSchema = z.object({
  name: z.string().min(1).max(67),
  content: z.string().min(1).max(256 * 1024),
});

const assumptionSchema = z.string().trim().min(1).max(WORKFLOW_PROPOSAL_ASSUMPTION_MAX);

const rehearsalStepSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  label: z.enum(["passed", "diverged", "untested"]),
  detail: z.string().max(4_000).optional(),
  produced: z.array(z.string()).max(50).optional(),
  expected: z.array(z.string()).max(50).optional(),
});

const rehearsalSchema = z.object({
  at: z.number().int().nonnegative(),
  status: z.enum(["passed", "diverged", "untested"]),
  steps: z.array(rehearsalStepSchema).max(40),
  example: z.array(z.string()).max(50).optional(),
});

export const workflowProposalSchema = z.object({
  id: z.uuid(),
  department: z.string().trim().min(1).max(60),
  status: z.enum(workflowProposalStatuses),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  /** The conversation that asked for the proposal. */
  createdBy: z.object({ botId: z.string().min(1), threadId: z.string().min(1) }).optional(),
  interview: interviewSchema,
  summary: z.string().trim().max(WORKFLOW_PROPOSAL_SUMMARY_MAX).default(""),
  assumptions: z.array(assumptionSchema).max(WORKFLOW_PROPOSAL_ASSUMPTIONS_MAX).default([]),
  /** Per-step notes the person writes while reviewing; they travel with the Workflow. */
  annotations: z.record(z.string().min(1).max(64), z.string().max(2_000)).default({}),
  /** How many review rounds this proposal has had; the ladder appears at 3. */
  rounds: z.number().int().nonnegative().default(0),
  rehearsal: rehearsalSchema.optional(),
  /** The content hash the person approved; changing any byte changes it. */
  approvalHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  definition: workflowDefinitionSchema,
  /** The script files the definition names, kept with the proposal until the yes. */
  scripts: z.array(proposalScriptSchema).max(50).default([]),
  /** Set once the person said yes. */
  createdWorkflowId: z.uuid().optional(),
}).superRefine((proposal, context) => {
  if (proposal.definition.id !== proposal.id) {
    context.addIssue({ code: "custom", path: ["definition", "id"], message: "the definition id must match the proposal id" });
  }
  if (proposal.definition.department !== proposal.department) {
    context.addIssue({ code: "custom", path: ["definition", "department"], message: "the definition department must match the proposal department" });
  }
});

export type WorkflowProposal = z.output<typeof workflowProposalSchema>;

export type WorkflowProposalRehearsalLabel = "passed" | "diverged" | "untested";

export interface WorkflowProposalRehearsalStep {
  id: string;
  name: string;
  label: WorkflowProposalRehearsalLabel;
  detail?: string;
  produced?: string[];
  expected?: string[];
}

export interface WorkflowProposalRehearsal {
  at: number;
  status: WorkflowProposalRehearsalLabel;
  steps: WorkflowProposalRehearsalStep[];
  /** What the example carried, by file name; the bytes stay in the fixture folder. */
  example?: string[];
}

/** What the bot sends: the definition is assembled here, never trusted as already valid. */
export const workflowProposalInputSchema = z.object({
  /** Omitted by the bot: the server owns the id the definition will keep. */
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(80),
  department: z.string().trim().min(1).max(60),
  retentionDays: z.number().int().min(1).max(3_650).optional(),
  createdAt: z.number().int().nonnegative().optional(),
  interview: interviewSchema,
  summary: z.string().trim().max(WORKFLOW_PROPOSAL_SUMMARY_MAX).default(""),
  assumptions: z.array(assumptionSchema).max(WORKFLOW_PROPOSAL_ASSUMPTIONS_MAX).default([]),
  createdBy: z.object({ botId: z.string().min(1), threadId: z.string().min(1) }).optional(),
  steps: z.array(z.unknown()).min(1).max(40),
  scripts: z.array(proposalScriptSchema).max(50).optional(),
});

export type WorkflowProposalInput = z.input<typeof workflowProposalInputSchema>;

const UNKNOWN_ANSWERS = /^(?:n[ãa]o sei|nao sei|not sure|unknown|idk|n\/a|-)?$/i;

export function isUnknownProposalAnswer(value: string): boolean {
  return UNKNOWN_ANSWERS.test(value.trim());
}

export type ProposalEvaluation =
  | { ok: true; assumptions: string[] }
  | { ok: false; error: string };

/** The interview gate and the assumptions the preview shows in amber. */
export function evaluateProposal(interview: WorkflowProposalInterview, assumptions: readonly string[] = []): ProposalEvaluation {
  if (!interview.recurring) {
    return { ok: false, error: "a one-time task is not a Workflow; finish the task instead of proposing one" };
  }
  const list = [...assumptions];
  if (isUnknownProposalAnswer(interview.changes)) {
    list.push("O que muda a cada execução não foi respondido.");
  }
  if (isUnknownProposalAnswer(interview.confirmer)) {
    list.push("Quem confirma antes de um efeito irreversível não foi respondido.");
  }
  return { ok: true, assumptions: [...new Set(list)] };
}

/** The execution gate: a Workflow created from a conversation always waits for a person. */
export function startManualDefinition(definition: WorkflowDefinition): WorkflowDefinition {
  const first = definition.steps[0];
  if (!first || (first.kind !== "bot" && first.kind !== "script")) {
    throw new Error("a proposal must start with a bot or script step");
  }
  if (workflowStartsManual(definition)) return definition;
  return {
    ...definition,
    steps: definition.steps.map((step, index) => index === 0 ? { ...step, mode: "manual" as const } : step),
  };
}

/** Builds the definition from the bot's flat input; the schema is the only authority. */
export function proposalDefinition(
  input: z.output<typeof workflowProposalInputSchema>,
  id: string,
  createdAt = input.createdAt ?? 0,
): { ok: true; definition: WorkflowDefinition } | { ok: false; error: string } {
  const parsed = workflowDefinitionSchema.safeParse({
    id,
    version: 1,
    name: input.name,
    department: input.department,
    steps: input.steps,
    ...(input.retentionDays === undefined ? {} : { retentionDays: input.retentionDays }),
    createdAt,
    updatedAt: createdAt,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((issue) => `${issue.path.join(".") || "workflow"}: ${issue.message}`).join("; ") };
  }
  return { ok: true, definition: parsed.data };
}

export interface WorkflowProposalCardData {
  id: string;
  name: string;
  department: string;
  steps: number;
  assumptions: number;
}
