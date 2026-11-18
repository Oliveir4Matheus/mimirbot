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

const interviewAnswersSchema = z.object({
  /** A one-time task is not a Workflow; the bot says so instead of proposing one. */
  recurring: z.boolean(),
  /** What changes between runs; "não sei" is a valid answer and becomes an assumption. */
  changes: z.string().trim().max(WORKFLOW_PROPOSAL_ANSWER_MAX).default(""),
  /** Who answers a missing field and who confirms an irreversible effect. */
  confirmer: z.string().trim().max(WORKFLOW_PROPOSAL_ANSWER_MAX).default(""),
});

export type WorkflowProposalAnswers = z.output<typeof interviewAnswersSchema>;
export const workflowProposalAnswersSchema = interviewAnswersSchema;

const interviewSchema = interviewAnswersSchema.extend({
  /** Set by the person confirming the three answers on the card, never by the bot. */
  confirmedAt: z.number().int().nonnegative().optional(),
  confirmedBy: z.string().trim().min(1).max(80).optional(),
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
  /** The content hash the person approved: definition, scripts and interview answers.
   * Changing any of them changes it, and a create then asks for a new confirmation. */
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
  if (proposal.interview.confirmedBy !== undefined && proposal.interview.confirmedAt === undefined) {
    context.addIssue({ code: "custom", path: ["interview", "confirmedBy"], message: "a confirmation carries its time" });
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
  /** The bot's answers only: the confirmation belongs to the person and is refused here. */
  interview: interviewAnswersSchema.strict(),
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

const UNKNOWN_CHANGES_ASSUMPTION = "O que muda a cada execução não foi respondido.";
const UNKNOWN_CONFIRMER_ASSUMPTION = "Quem confirma antes de um efeito irreversível não foi respondido.";

/** The bot's own assumptions, without the two the interview derives from an unanswered question:
 * when the person corrects an answer, its assumption leaves with the old answer. */
export function proposalAssumptionsBase(assumptions: readonly string[]): string[] {
  return assumptions.filter((line) => line !== UNKNOWN_CHANGES_ASSUMPTION && line !== UNKNOWN_CONFIRMER_ASSUMPTION);
}

export type ProposalEvaluation =
  | { ok: true; assumptions: string[] }
  | { ok: false; error: string };

/** The interview gate and the assumptions the preview shows in amber. */
export function evaluateProposal(interview: WorkflowProposalInterview, assumptions: readonly string[] = []): ProposalEvaluation {
  if (!interview.recurring) {
    return { ok: false, error: "a one-time task is not a Workflow; finish the task instead of proposing one" };
  }
  const list = proposalAssumptionsBase(assumptions);
  if (isUnknownProposalAnswer(interview.changes)) {
    list.push(UNKNOWN_CHANGES_ASSUMPTION);
  }
  if (isUnknownProposalAnswer(interview.confirmer)) {
    list.push(UNKNOWN_CONFIRMER_ASSUMPTION);
  }
  return { ok: true, assumptions: [...new Set(list)] };
}

/** The execution gate: a proposal that starts by collecting a value waits for the person.
 * A first step with nothing to collect starts after the approval card, where the person already confirmed. */
export function startManualDefinition(definition: WorkflowDefinition): WorkflowDefinition {
  const first = definition.steps[0];
  if (!first || (first.kind !== "bot" && first.kind !== "script")) {
    throw new Error("a proposal must start with a bot or script step");
  }
  if (workflowStartsManual(definition)) return definition;
  if (!first.parameters.some((parameter) => parameter.collectedBy === first.id)) return definition;
  return {
    ...definition,
    steps: definition.steps.map((step, index) => index === 0 ? { ...step, mode: "manual" as const } : step),
  };
}

const STEP_BASE_FIELDS = ["id", "kind", "name", "inputs", "outputs", "parameters", "onSuccess", "onFailure", "onTimeout", "result", "require", "when"] as const;

/** Every field the reading schema knows for a step kind. A bot's mistyped or invented field is
 * refused here instead of being dropped by the schema, so the author learns the contract. */
const STEP_FIELDS: Record<string, readonly string[]> = {
  bot: [...STEP_BASE_FIELDS, "botId", "instructions", "skills", "timeoutMs", "mode"],
  script: [...STEP_BASE_FIELDS, "run", "timeoutMs", "modules", "mode"],
  condition: ["id", "kind", "name", "onSuccess", "onFailure", "onTimeout", "result", "require", "when", "from", "match", "conditions", "whenTrue", "whenFalse"],
  loop: ["id", "kind", "name", "onSuccess", "onFailure", "onTimeout", "result", "require", "from", "match", "conditions", "maxIterations", "outputs", "body"],
};

/** The first field a step record carries that its kind does not declare. */
export function unknownStepField(steps: readonly unknown[]): string | undefined {
  for (const [index, step] of steps.entries()) {
    if (step === null || typeof step !== "object" || Array.isArray(step)) continue;
    const record = step as Record<string, unknown>;
    const kind = typeof record.kind === "string" ? record.kind : "bot";
    const allowed = STEP_FIELDS[kind];
    if (!allowed) return `steps.${index}.kind: ${JSON.stringify(kind)} is not a step kind`;
    const unknown = Object.keys(record).find((key) => !allowed.includes(key));
    if (unknown !== undefined) {
      return `steps.${index}.${unknown}: a ${kind} step does not declare ${JSON.stringify(unknown)}; use only ${allowed.join(", ")}`;
    }
    if (kind === "loop" && Array.isArray(record.body)) {
      const nested = unknownStepField(record.body);
      if (nested !== undefined) return `steps.${index}.body.${nested.slice("steps.".length)}`;
    }
  }
  return undefined;
}

/** Builds the definition from the bot's flat input; the schema is the only authority. */
export function proposalDefinition(
  input: z.output<typeof workflowProposalInputSchema>,
  id: string,
  createdAt = input.createdAt ?? 0,
): { ok: true; definition: WorkflowDefinition } | { ok: false; error: string } {
  const unknown = unknownStepField(input.steps);
  if (unknown !== undefined) return { ok: false, error: unknown };
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
