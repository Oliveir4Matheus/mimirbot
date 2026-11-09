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
/** A script the Workflow can reference: a flat name; the extension picks the runtime. */
export const WORKFLOW_SCRIPT_MAX_BYTES = 256 * 1024;
export const WORKFLOW_SCRIPT_TIMEOUT_DEFAULT_MS = 60_000;
export const WORKFLOW_SCRIPT_TIMEOUT_MAX_MS = 300_000;
/** The longest an executable step may declare; 0 turns the limit off. */
export const WORKFLOW_STEP_TIMEOUT_MAX_MS = 3_600_000;
export const WORKFLOW_BOT_TIMEOUT_DEFAULT_MS = 0;
export const WORKFLOW_BRANCH_MAX = 8;
/** The Studio keeps at most this many notes and containers, and this much Markdown per note. */
export const WORKFLOW_CANVAS_NOTE_MAX = 30;
export const WORKFLOW_CANVAS_CONTAINER_MAX = 20;
export const WORKFLOW_CANVAS_MARKDOWN_MAX = 20_000;
/** A compared value, and the whole group's JSON, must stay small. */
export const WORKFLOW_CONDITION_VALUE_MAX = 4_096;
export const WORKFLOW_CONDITION_GROUP_MAX = 64 * 1024;
/** How many comparisons one IF/Else step may hold. */
export const WORKFLOW_CONDITION_ROWS_MAX = 20;
export const WORKFLOW_SKILLS_BOT_MAX = 200;
export const WORKFLOW_SKILLS_BUNDLED_MAX = 100;
export const WORKFLOW_SKILLS_IMPORTED_MAX = 200;
export const WORKFLOW_SKILL_NAME_MAX = 64;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SCRIPT_NAME = /^[a-z0-9][a-z0-9-]{0,62}\.(?:mjs|js|ts|py)$/;
const RESULT_FIELD = /^[A-Za-z0-9_-]{1,64}(?:\.[A-Za-z0-9_-]{1,64})*$/;

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

/** The file name a script step points at inside the Workflow's `scripts/` folder.
 * The extension picks the runtime: `.mjs`/`.js` Node, `.ts` Node strip-types, `.py` Python. */
export function isWorkflowScriptName(value: string): boolean {
  return value.length <= 67 && SCRIPT_NAME.test(value);
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

const canvasPointSchema = z.object({
  x: z.number().finite().min(-1_000_000).max(1_000_000),
  y: z.number().finite().min(-1_000_000).max(1_000_000),
});

const canvasNoteSchema = z.object({
  id: z.string().min(1).max(64),
  ...canvasPointSchema.shape,
  width: z.number().finite().min(120).max(4_000),
  height: z.number().finite().min(90).max(4_000),
  markdown: z.string().max(WORKFLOW_CANVAS_MARKDOWN_MAX).default(""),
  /** Documentation only: a note never joins the run. */
  link: z.object({ kind: z.enum(["step", "container"]), id: z.string().min(1).max(64) }).optional(),
});

const canvasContainerSchema = z.object({
  id: z.string().min(1).max(64),
  ...canvasPointSchema.shape,
  width: z.number().finite().min(200).max(8_000),
  height: z.number().finite().min(120).max(8_000),
  name: z.string().trim().max(64).default("Container"),
});

/** The Studio's visual state: positions, notes and containers. The engine never reads it. */
export const workflowCanvasSchema = z.object({
  nodes: z.record(z.string(), canvasPointSchema).default({}),
  notes: z.array(canvasNoteSchema).max(WORKFLOW_CANVAS_NOTE_MAX).default([]),
  containers: z.array(canvasContainerSchema).max(WORKFLOW_CANVAS_CONTAINER_MAX).default([]),
}).superRefine((canvas, context) => {
  const noteIds = new Set<string>();
  canvas.notes.forEach((note, index) => {
    if (noteIds.has(note.id)) {
      context.addIssue({ code: "custom", path: ["notes", index, "id"], message: `note id ${JSON.stringify(note.id)} is used more than once` });
    }
    noteIds.add(note.id);
  });
  const containerIds = new Set<string>();
  canvas.containers.forEach((container, index) => {
    if (containerIds.has(container.id)) {
      context.addIssue({ code: "custom", path: ["containers", index, "id"], message: `container id ${JSON.stringify(container.id)} is used more than once` });
    }
    containerIds.add(container.id);
  });
});

export type WorkflowCanvas = z.output<typeof workflowCanvasSchema>;

const requireSchema = z.record(z.string().min(1).max(64), z.unknown()).refine(
  (value) => Object.keys(value).length <= 64 && JSON.stringify(value).length <= 4_096,
  { message: "require must be a small JSON object" },
);

const stepIdSchema = z.string().refine(isWorkflowSlug, { message: "must be lowercase letters, digits and single hyphens" });

const whenSchema = z.object({
  /** Dotted path into the step's declared result, e.g. `ok` or `check.total`. */
  field: z.string().regex(RESULT_FIELD, { message: "must be a dotted path of letters, digits, _ or -" }),
  equals: z.unknown(),
  next: stepIdSchema,
}).refine((value) => JSON.stringify(value).length <= 4_096, { message: "a when branch must be small" });

const stepBaseSchema = z.object({
  id: stepIdSchema,
  name: z.string().trim().min(1).max(120),
  inputs: z.array(stepInputSchema).max(50).default([]),
  outputs: z.array(stepOutputSchema).min(1).max(50),
  /** The short JSON object a later branch reads; must be one of the outputs. */
  result: workflowPath.optional(),
  /** Fields of the declared result that must match by equality for the step to pass. */
  require: requireSchema.optional(),
  /** Where to go after this step passes. null ends the flow; absent means the next step in array order. */
  onSuccess: stepIdSchema.nullable().optional(),
  /** Where to go when this step fails. Without it the run stops, as it always did. */
  onFailure: stepIdSchema.optional(),
  /** Where to go when this step times out; needs `timeoutMs` greater than 0. */
  onTimeout: stepIdSchema.optional(),
  /** The first branch whose field matches the declared result chooses the next step. */
  when: z.array(whenSchema).min(1).max(WORKFLOW_BRANCH_MAX).optional(),
});

const skillNameSchema = z.string().trim().min(1).max(WORKFLOW_SKILL_NAME_MAX);

const skillNamesSchema = (max: number) => z.array(skillNameSchema).max(max).superRefine((names, context) => {
  const seen = new Set<string>();
  names.forEach((name, index) => {
    if (seen.has(name)) {
      context.addIssue({ code: "custom", path: [index], message: `skill ${JSON.stringify(name)} is listed more than once` });
    }
    seen.add(name);
  });
});

const stepSkillsSchema = z.object({
  bot: skillNamesSchema(WORKFLOW_SKILLS_BOT_MAX).default([]),
  bundled: skillNamesSchema(WORKFLOW_SKILLS_BUNDLED_MAX).default([]),
  imported: skillNamesSchema(WORKFLOW_SKILLS_IMPORTED_MAX).default([]),
}).transform((skills) => {
  const normalized = {
    ...(skills.bot.length > 0 ? { bot: skills.bot } : {}),
    ...(skills.bundled.length > 0 ? { bundled: skills.bundled } : {}),
    ...(skills.imported.length > 0 ? { imported: skills.imported } : {}),
  };
  return Object.keys(normalized).length > 0 ? normalized : undefined;
});

export type WorkflowStepSkills = NonNullable<z.output<typeof stepSkillsSchema>>;

export interface WorkflowSkillOption {
  name: string;
  label: string;
  description: string;
  available: boolean;
}

export interface WorkflowSkillOptions {
  bot: WorkflowSkillOption[];
  bundled: WorkflowSkillOption[];
  imported: WorkflowSkillOption[];
}

/** How an executable step starts: on its own, or only after a person continues it. */
const stepModeSchema = z.enum(["auto", "manual"]).default("auto");

const botStepSchema = stepBaseSchema.extend({
  kind: z.literal("bot"),
  botId: z.string().min(1).max(200),
  instructions: z.string().trim().min(1).max(WORKFLOW_INSTRUCTIONS_MAX),
  skills: stepSkillsSchema.optional(),
  /** 0 means the bot's turn has no limit. An approval pause stops the clock. */
  timeoutMs: z.number().int().min(0).max(WORKFLOW_STEP_TIMEOUT_MAX_MS).default(WORKFLOW_BOT_TIMEOUT_DEFAULT_MS),
  mode: stepModeSchema,
});

const scriptStepSchema = stepBaseSchema.extend({
  kind: z.literal("script"),
  /** A file name inside the Workflow's `scripts/` folder, never a path. */
  run: z.string().refine(isWorkflowScriptName, { message: "must be a flat .mjs, .js, .ts or .py file name" }),
  timeoutMs: z.number().int().min(1_000).max(WORKFLOW_SCRIPT_TIMEOUT_MAX_MS).default(WORKFLOW_SCRIPT_TIMEOUT_DEFAULT_MS),
  mode: stepModeSchema,
});

export const conditionOps = ["equals", "not_equals", "exists", "contains", "gt", "gte", "lt", "lte"] as const;

const conditionLineSchema = z.object({
  /** Dotted path into the source result, e.g. `ok` or `check.total`. */
  field: z.string().regex(RESULT_FIELD, { message: "must be a dotted path of letters, digits, _ or -" }),
  op: z.enum(conditionOps),
  /** Compared as JSON; required for every operator except `exists`. */
  value: z.unknown().optional(),
});

const conditionStepSchema = z.object({
  id: stepIdSchema,
  kind: z.literal("condition"),
  name: z.string().trim().min(1).max(120),
  /** The step whose result.json this condition reads. It must declare a result. */
  from: stepIdSchema,
  /** Which comparisons must hold: all of them, or at least one. */
  match: z.enum(["all", "any"]).default("all"),
  conditions: z.array(conditionLineSchema).min(1).max(WORKFLOW_CONDITION_ROWS_MAX),
  /** Where each answer sends the run. Without one, that answer ends the run. */
  whenTrue: stepIdSchema.optional(),
  whenFalse: stepIdSchema.optional(),
  onFailure: stepIdSchema.optional(),
});

const stepUnionSchema = z.discriminatedUnion("kind", [botStepSchema, scriptStepSchema, conditionStepSchema]);

/** Older Workflows have no `kind` (a step without one was always a bot step),
 * spell the success edge `next`, and keep one loose comparison on a condition;
 * all three are normalized here on read. */
export const workflowStepSchema = z.preprocess(
  (value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
    const record = { ...(value as Record<string, unknown>) };
    if (record.kind === undefined) record.kind = "bot";
    if (record.onSuccess === undefined && record.next !== undefined) record.onSuccess = record.next;
    delete record.next;
    if (record.kind === "condition") {
      if (record.conditions === undefined && record.field !== undefined) {
        record.conditions = [{ field: record.field, op: record.op, value: record.value }];
      }
      delete record.field;
      delete record.op;
      delete record.value;
    }
    return record;
  },
  stepUnionSchema,
);

export const workflowDefinitionSchema = z.object({
  id: z.uuid(),
  version: z.number().int().min(1),
  name: z.string().trim().min(1).max(80),
  department: z.string().trim().min(1).max(60),
  steps: z.array(workflowStepSchema).min(1).max(WORKFLOW_STEP_MAX),
  retentionDays: z.number().int().min(1).max(WORKFLOW_RETENTION_MAX_DAYS).default(WORKFLOW_RETENTION_DEFAULT_DAYS),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  /** Where the Studio drew the steps, notes and containers. Never used by the engine. */
  canvas: workflowCanvasSchema.optional(),
}).superRefine((definition, context) => {
  const positions = new Map<string, number>();
  definition.steps.forEach((step, index) => {
    if (positions.has(step.id)) {
      context.addIssue({ code: "custom", path: ["steps", index, "id"], message: `step id ${JSON.stringify(step.id)} is used more than once` });
    } else {
      positions.set(step.id, index);
    }
  });
  definition.steps.forEach((step, index) => {
    if (step.kind !== "condition") return;
    const sourceIndex = positions.get(step.from);
    if (sourceIndex === undefined) {
      context.addIssue({ code: "custom", path: ["steps", index, "from"], message: `source step ${JSON.stringify(step.from)} does not exist` });
    } else if (sourceIndex >= index) {
      context.addIssue({ code: "custom", path: ["steps", index, "from"], message: "a condition must read an earlier step" });
    } else {
      const source = definition.steps[sourceIndex]!;
      if (source.kind === "condition") {
        context.addIssue({ code: "custom", path: ["steps", index, "from"], message: "a condition must read a bot or script step" });
      } else if (source.result === undefined) {
        context.addIssue({ code: "custom", path: ["steps", index, "from"], message: `step ${JSON.stringify(source.id)} must declare a result` });
      }
    }
    step.conditions.forEach((line, lineIndex) => {
      if (line.op !== "exists" && line.value === undefined) {
        context.addIssue({ code: "custom", path: ["steps", index, "conditions", lineIndex, "value"], message: `the ${line.op} operator needs a value` });
      }
      if (line.value !== undefined && JSON.stringify(line.value).length > WORKFLOW_CONDITION_VALUE_MAX) {
        context.addIssue({ code: "custom", path: ["steps", index, "conditions", lineIndex, "value"], message: "the compared value must be small" });
      }
    });
    if (JSON.stringify(step.conditions).length > WORKFLOW_CONDITION_GROUP_MAX) {
      context.addIssue({ code: "custom", path: ["steps", index, "conditions"], message: "the condition group must be small" });
    }
    for (const [field, target] of [["whenTrue", step.whenTrue], ["whenFalse", step.whenFalse], ["onFailure", step.onFailure]] as const) {
      if (target === undefined) continue;
      const targetIndex = positions.get(target);
      if (targetIndex === undefined) {
        context.addIssue({ code: "custom", path: ["steps", index, field], message: `${field} step ${JSON.stringify(target)} does not exist` });
      } else if (targetIndex <= index) {
        context.addIssue({ code: "custom", path: ["steps", index, field], message: `${field} step ${JSON.stringify(target)} must come after this step` });
      }
    }
  });
  const outputs = new Map<string, Map<string, z.output<typeof stepOutputSchema>>>();
  definition.steps.forEach((step, index) => {
    if (step.kind === "condition") return;
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
    if (step.when !== undefined && step.result === undefined) {
      context.addIssue({ code: "custom", path: ["steps", index, "when"], message: "when needs a declared result" });
    }
    for (const [field, target] of [["onSuccess", step.onSuccess], ["onFailure", step.onFailure], ["onTimeout", step.onTimeout]] as const) {
      if (target === undefined || target === null) continue;
      const targetIndex = positions.get(target);
      if (targetIndex === undefined) {
        context.addIssue({ code: "custom", path: ["steps", index, field], message: `${field} step ${JSON.stringify(target)} does not exist` });
      } else if (targetIndex <= index) {
        context.addIssue({ code: "custom", path: ["steps", index, field], message: `${field} step ${JSON.stringify(target)} must come after this step` });
      }
    }
    if (step.onTimeout !== undefined && step.timeoutMs <= 0) {
      context.addIssue({ code: "custom", path: ["steps", index, "onTimeout"], message: "onTimeout needs a timeoutMs greater than 0" });
    }
    step.when?.forEach((branch, branchIndex) => {
      const targetIndex = positions.get(branch.next);
      if (targetIndex === undefined) {
        context.addIssue({ code: "custom", path: ["steps", index, "when", branchIndex, "next"], message: `next step ${JSON.stringify(branch.next)} does not exist` });
      } else if (targetIndex <= index) {
        context.addIssue({ code: "custom", path: ["steps", index, "when", branchIndex, "next"], message: `next step ${JSON.stringify(branch.next)} must come after this step` });
      }
    });
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
  if (definition.canvas) {
    const containerIds = new Set(definition.canvas.containers.map((container) => container.id));
    definition.canvas.notes.forEach((note, index) => {
      if (!note.link) return;
      const exists = note.link.kind === "step" ? positions.has(note.link.id) : containerIds.has(note.link.id);
      if (!exists) {
        context.addIssue({ code: "custom", path: ["canvas", "notes", index, "link", "id"], message: "the linked element does not exist" });
      }
    });
  }
});

export type StepInput = z.output<typeof stepInputSchema>;
export type StepOutput = z.output<typeof stepOutputSchema>;
export type BotWorkflowStep = z.output<typeof botStepSchema>;
export type ScriptWorkflowStep = z.output<typeof scriptStepSchema>;
export type ConditionLine = z.output<typeof conditionLineSchema>;
export type ConditionMatch = "all" | "any";
export type ConditionWorkflowStep = z.output<typeof conditionStepSchema>;
export type ConditionOp = (typeof conditionOps)[number];
export type WorkflowStep = z.output<typeof workflowStepSchema>;
export type WorkflowDefinition = z.output<typeof workflowDefinitionSchema>;

export function isBotStep(step: WorkflowStep): step is BotWorkflowStep {
  return step.kind === "bot";
}

export function isScriptStep(step: WorkflowStep): step is ScriptWorkflowStep {
  return step.kind === "script";
}

export function isConditionStep(step: WorkflowStep): step is ConditionWorkflowStep {
  return step.kind === "condition";
}

/** Whether a person must continue the Workflow before its first step can run. A routine cannot start such a Workflow. */
export function workflowStartsManual(definition: Pick<WorkflowDefinition, "steps">): boolean {
  const first = definition.steps[0];
  return first !== undefined && first.kind !== "condition" && first.mode === "manual";
}

export type WorkflowRunStatus = "queued" | "running" | "waiting_manual" | "waiting_approval" | "succeeded" | "failed" | "cancelled";
export type WorkflowStepStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";

export interface WorkflowRunStep {
  id: string;
  status: WorkflowStepStatus;
  assignmentId?: string;
  threadId?: string;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  /** Whether the step stopped as a plain failure or as a timeout; absent means failure. */
  failureKind?: "failure" | "timeout";
  /** The declared outputs the engine found, in declaration order. */
  verified?: string[];
}

export interface WorkflowRunPause {
  stepId: string;
  question: string;
  cardIds: string[];
  askedAt: number;
}

/** Where a manual step holds the run: the step index, and when the person was asked to continue. */
export interface WorkflowRunHold {
  step: number;
  since: number;
}

/** A routine started the run instead of a person or a bot conversation. */
export interface WorkflowRunTrigger {
  routineId: string;
  routineName: string;
}

/** The names a run keeps after its Workflow is deleted or edited. */
export interface WorkflowRunSnapshot {
  name: string;
  steps: Array<{ id: string; name: string }>;
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
  /** Set while a manual step waits for a person to continue it. */
  hold?: WorkflowRunHold;
  /** The last step's parsed result.json, when it declared one. */
  result?: unknown;
  /** Why the run stopped: the verified failure, or the person's cancellation reason. */
  error?: string;
  /** The bot conversation that asked for the run; only it may cancel a run started by a bot. */
  requestedBy?: { botId: string; threadId: string };
  /** The routine that started the run, when a trigger did. */
  triggeredBy?: WorkflowRunTrigger;
  /** The Workflow and step names at run time, so the run stays readable after the Workflow is gone. */
  snapshot?: WorkflowRunSnapshot;
}

const workflowRunStepSchema = z.object({
  id: z.string().min(1).max(WORKFLOW_SLUG_MAX),
  status: z.enum(["pending", "running", "succeeded", "failed", "skipped"]),
  assignmentId: z.string().min(1).optional(),
  threadId: z.string().min(1).optional(),
  startedAt: z.number().int().nonnegative().optional(),
  finishedAt: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
  failureKind: z.enum(["failure", "timeout"]).optional(),
  verified: z.array(z.string()).optional(),
});

const workflowRunPauseSchema = z.object({
  stepId: z.string().min(1).max(WORKFLOW_SLUG_MAX),
  question: z.string(),
  cardIds: z.array(z.string()),
  askedAt: z.number().int().nonnegative(),
});

const workflowRunHoldSchema = z.object({
  step: z.number().int().nonnegative(),
  since: z.number().int().nonnegative(),
});

const workflowRunSnapshotSchema = z.object({
  name: z.string().trim().min(1).max(80),
  steps: z.array(z.object({
    id: z.string().min(1).max(WORKFLOW_SLUG_MAX),
    name: z.string().trim().min(1).max(120),
  })).min(1).max(WORKFLOW_STEP_MAX),
});

/** `run.json` as the store reads it back: a hand-edited or half-written file never becomes a run. */
export const workflowRunSchema: z.ZodType<WorkflowRun> = z.object({
  id: z.string().min(1).max(64),
  workflowId: z.uuid(),
  workflowVersion: z.number().int().min(1),
  department: z.string().trim().min(1).max(60),
  status: z.enum(["queued", "running", "waiting_manual", "waiting_approval", "succeeded", "failed", "cancelled"]),
  currentStep: z.number().int().nonnegative(),
  steps: z.array(workflowRunStepSchema).min(1).max(WORKFLOW_STEP_MAX),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  startedAt: z.number().int().nonnegative().optional(),
  finishedAt: z.number().int().nonnegative().optional(),
  pause: workflowRunPauseSchema.optional(),
  hold: workflowRunHoldSchema.optional(),
  result: z.unknown().optional(),
  error: z.string().optional(),
  requestedBy: z.object({ botId: z.string().min(1), threadId: z.string().min(1) }).optional(),
  triggeredBy: z.object({ routineId: z.string().min(1).max(200), routineName: z.string().min(1).max(80) }).optional(),
  snapshot: workflowRunSnapshotSchema.optional(),
});

export function sameJsonValue(left: unknown, right: unknown): boolean {
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

/** A dotted path read out of a step's `result.json`; `found` is false when a segment is missing. */
export function resultField(result: unknown, field: string): { found: boolean; value: unknown } {
  let current: unknown = result;
  for (const segment of field.split(".")) {
    if (current === null || typeof current !== "object" || Array.isArray(current) || !Object.hasOwn(current, segment)) {
      return { found: false, value: undefined };
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return { found: true, value: current };
}
