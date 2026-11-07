// Workflow's wire contract: a deterministic sequence of bot steps. Each step
// declares the files it receives and the files it must leave behind; the
// engine verifies those before the next step starts, so no step chooses what
// runs after it. Order is the array order.
import { z } from "zod";

export const WORKFLOW_SLUG_MAX = 64;
export const WORKFLOW_STEP_MAX = 40;
export const WORKFLOW_INSTRUCTIONS_MAX = 12_000;
export const WORKFLOW_PATH_MAX = 200;
export const WORKFLOW_RETENTION_DEFAULT_DAYS = 90;
export const WORKFLOW_RETENTION_MAX_DAYS = 3_650;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** C0 controls and DEL: never in a folder or file name the engine writes. */
export function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function isWorkflowSlug(value: string): boolean {
  return value.length >= 1 && value.length <= WORKFLOW_SLUG_MAX && SLUG.test(value);
}

/** A path a step may declare: relative, no `.`/`..` segment, no absolute
 * path, no backslash and no control character. This rule is also the
 * traversal gate for the run folder. */
export function isWorkflowRelativePath(value: string): boolean {
  if (!value || value.length > WORKFLOW_PATH_MAX) return false;
  if (value.startsWith("/") || value.startsWith("\\") || /^[A-Za-z]:/.test(value)) return false;
  if (value.includes("\\") || hasControlCharacter(value)) return false;
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".." && segment.trim() === segment);
}

const workflowPath = z.string().refine(isWorkflowRelativePath, {
  message: "must be a relative path inside the step folder (no .., no absolute path, no backslash)",
});

const stepInputSchema = z.object({
  /** The file name this step sees under its own input/ folder. */
  as: workflowPath,
  from: z.object({
    step: z.string().refine(isWorkflowSlug, { message: "must be a step id" }),
    output: workflowPath,
  }),
});

const stepOutputSchema = z.object({
  path: workflowPath,
  /** A missing optional output does not fail the step; a declared result always does. */
  required: z.boolean().default(true),
});

const requireSchema = z.record(z.string().min(1).max(64), z.unknown()).refine(
  (value) => Object.keys(value).length <= 64 && JSON.stringify(value).length <= 4_096,
  { message: "require must be a small JSON object" },
);

export const workflowStepSchema = z.object({
  id: z.string().refine(isWorkflowSlug, { message: "must be lowercase letters, digits and single hyphens" }),
  name: z.string().trim().min(1).max(120),
  botId: z.string().min(1).max(200),
  instructions: z.string().trim().min(1).max(WORKFLOW_INSTRUCTIONS_MAX),
  inputs: z.array(stepInputSchema).max(50).default([]),
  outputs: z.array(stepOutputSchema).min(1).max(50),
  /** The short JSON object a later branch reads; must be one of the outputs. */
  result: workflowPath.optional(),
  /** Fields of the declared result that must match by equality for the step to pass. */
  require: requireSchema.optional(),
});

export const workflowDefinitionSchema = z.object({
  id: z.uuid(),
  version: z.number().int().min(1),
  name: z.string().trim().min(1).max(80),
  department: z.string().trim().min(1).max(60),
  steps: z.array(workflowStepSchema).min(1).max(WORKFLOW_STEP_MAX),
  retentionDays: z.number().int().min(1).max(WORKFLOW_RETENTION_MAX_DAYS).default(WORKFLOW_RETENTION_DEFAULT_DAYS),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
}).superRefine((definition, context) => {
  const positions = new Map<string, number>();
  definition.steps.forEach((step, index) => {
    if (positions.has(step.id)) {
      context.addIssue({ code: "custom", path: ["steps", index, "id"], message: `step id ${JSON.stringify(step.id)} is used more than once` });
    } else {
      positions.set(step.id, index);
    }
  });
  const outputs = new Map<string, Map<string, z.output<typeof stepOutputSchema>>>();
  definition.steps.forEach((step, index) => {
    const own = new Map<string, z.output<typeof stepOutputSchema>>();
    step.outputs.forEach((output, outputIndex) => {
      if (own.has(output.path)) {
        context.addIssue({ code: "custom", path: ["steps", index, "outputs", outputIndex, "path"], message: `output ${JSON.stringify(output.path)} is declared more than once` });
      }
      own.set(output.path, output);
    });
    if (step.result !== undefined && !own.has(step.result)) {
      context.addIssue({ code: "custom", path: ["steps", index, "result"], message: "result must be one of this step's outputs" });
    }
    if (step.require !== undefined && step.result === undefined) {
      context.addIssue({ code: "custom", path: ["steps", index, "require"], message: "require needs a declared result" });
    }
    const names = new Set<string>();
    step.inputs.forEach((input, inputIndex) => {
      if (names.has(input.as)) {
        context.addIssue({ code: "custom", path: ["steps", index, "inputs", inputIndex, "as"], message: `input ${JSON.stringify(input.as)} is declared more than once` });
      }
      names.add(input.as);
      const sourceIndex = positions.get(input.from.step);
      if (sourceIndex === undefined || sourceIndex >= index) {
        context.addIssue({ code: "custom", path: ["steps", index, "inputs", inputIndex, "from", "step"], message: "an input may only come from an earlier step" });
        return;
      }
      const source = outputs.get(input.from.step)?.get(input.from.output);
      if (!source) {
        context.addIssue({ code: "custom", path: ["steps", index, "inputs", inputIndex, "from", "output"], message: "the source step does not declare that output" });
      } else if (!source.required) {
        context.addIssue({ code: "custom", path: ["steps", index, "inputs", inputIndex, "from", "output"], message: "an input may only come from a required output" });
      }
    });
    outputs.set(step.id, own);
  });
});

export type StepInput = z.output<typeof stepInputSchema>;
export type StepOutput = z.output<typeof stepOutputSchema>;
export type WorkflowStep = z.output<typeof workflowStepSchema>;
export type WorkflowDefinition = z.output<typeof workflowDefinitionSchema>;

export type WorkflowRunStatus = "queued" | "running" | "waiting_approval" | "succeeded" | "failed" | "cancelled";
export type WorkflowStepStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";

export interface WorkflowRunStep {
  id: string;
  status: WorkflowStepStatus;
  attempts: number;
  assignmentId?: string;
  threadId?: string;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  /** The declared outputs the engine found, in declaration order. */
  verified?: string[];
}

export interface WorkflowRunPause {
  stepId: string;
  question: string;
  cardIds: string[];
  askedAt: number;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  workflowVersion: number;
  department: string;
  status: WorkflowRunStatus;
  /** 0-based index of the step the engine is on; steps.length when finished. */
  currentStep: number;
  steps: WorkflowRunStep[];
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  finishedAt?: number;
  pause?: WorkflowRunPause;
  /** The last step's parsed result.json, when it declared one. */
  result?: unknown;
  /** Why the run stopped: the verified failure, or the person's cancellation reason. */
  error?: string;
  /** The bot conversation that asked for the run; only it may cancel a run started by a bot. */
  requestedBy?: { botId: string; threadId: string };
}

const workflowRunStepSchema = z.object({
  id: z.string().min(1).max(WORKFLOW_SLUG_MAX),
  status: z.enum(["pending", "running", "succeeded", "failed", "skipped"]),
  attempts: z.number().int().nonnegative(),
  assignmentId: z.string().min(1).optional(),
  threadId: z.string().min(1).optional(),
  startedAt: z.number().int().nonnegative().optional(),
  finishedAt: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
  verified: z.array(z.string()).optional(),
});

const workflowRunPauseSchema = z.object({
  stepId: z.string().min(1).max(WORKFLOW_SLUG_MAX),
  question: z.string(),
  cardIds: z.array(z.string()),
  askedAt: z.number().int().nonnegative(),
});

/** `run.json` as the store reads it back: a hand-edited or half-written file never becomes a run. */
export const workflowRunSchema: z.ZodType<WorkflowRun> = z.object({
  id: z.string().min(1).max(64),
  workflowId: z.uuid(),
  workflowVersion: z.number().int().min(1),
  department: z.string().trim().min(1).max(60),
  status: z.enum(["queued", "running", "waiting_approval", "succeeded", "failed", "cancelled"]),
  currentStep: z.number().int().nonnegative(),
  steps: z.array(workflowRunStepSchema).min(1).max(WORKFLOW_STEP_MAX),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  startedAt: z.number().int().nonnegative().optional(),
  finishedAt: z.number().int().nonnegative().optional(),
  pause: workflowRunPauseSchema.optional(),
  result: z.unknown().optional(),
  error: z.string().optional(),
  requestedBy: z.object({ botId: z.string().min(1), threadId: z.string().min(1) }).optional(),
});

function sameJsonValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left !== typeof right) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => sameJsonValue(value, right[index]));
  }
  if (left !== null && right !== null && typeof left === "object" && typeof right === "object") {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every((key) => Object.hasOwn(right, key)
      && sameJsonValue((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
  }
  return false;
}

/** Why `result.json` does not satisfy the step's `require`, or undefined when it does. */
export function requireMismatch(result: unknown, requirement: Record<string, unknown>): string | undefined {
  if (result === null || typeof result !== "object" || Array.isArray(result)) return "the declared result is not a JSON object";
  const record = result as Record<string, unknown>;
  for (const [key, expected] of Object.entries(requirement)) {
    if (!Object.hasOwn(record, key)) return `the result has no ${JSON.stringify(key)} field`;
    if (!sameJsonValue(record[key], expected)) {
      return `the result's ${JSON.stringify(key)} is ${JSON.stringify(record[key])}, but the step requires ${JSON.stringify(expected)}`;
    }
  }
  return undefined;
}

export function requireMatches(result: unknown, requirement: Record<string, unknown>): boolean {
  return requireMismatch(result, requirement) === undefined;
}
