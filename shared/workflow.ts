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
/** A script the Workflow can reference: a flat `.mjs` name; Node is the only runtime. */
export const WORKFLOW_SCRIPT_MAX_BYTES = 256 * 1024;
export const WORKFLOW_SCRIPT_TIMEOUT_DEFAULT_MS = 5 * 60 * 1000;
export const WORKFLOW_SCRIPT_TIMEOUT_MAX_MS = 3_600_000;
/** A declared JSON Schema per output: the bytes the definition may carry for one `shape`. */
export const WORKFLOW_SHAPE_MAX_BYTES = 16 * 1024;
/** The longest file extension an output may declare; longer than any real one. */
export const WORKFLOW_EXTENSION_MAX = 12;
/** How many machine dependencies one script step may name. */
export const WORKFLOW_MODULES_MAX = 16;
export const WORKFLOW_MODULE_NAME_MAX = 64;
export const WORKFLOW_MODULE_VERSION_MAX = 64;
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
/** How many comparisons one IF/Else step or Do While may hold. */
export const WORKFLOW_CONDITION_ROWS_MAX = 20;
/** A step declares the values a run must supply; the run gets a flat map. */
export const WORKFLOW_PARAMETER_MAX = 50;
export const WORKFLOW_PARAMETER_NAME_MAX = 64;
export const workflowParameterTypes = ["string", "number", "integer", "boolean", "date", "enum"] as const;
/** How many steps one Do While body may hold; nested loops are not part of the contract. */
export const WORKFLOW_LOOP_BODY_MAX = 20;
export const WORKFLOW_SKILLS_BOT_MAX = 200;
export const WORKFLOW_SKILLS_BUNDLED_MAX = 100;
export const WORKFLOW_SKILLS_IMPORTED_MAX = 200;
export const WORKFLOW_SKILL_NAME_MAX = 64;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SCRIPT_NAME = /^[a-z0-9][a-z0-9-]{0,59}\.mjs$/;
const BIN_MODULE_NAME = /^[a-z0-9][a-z0-9._-]*$/;
const NODE_MODULE_NAME = /^(@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/;
const MODULE_VERSION = /^[0-9A-Za-z.+!_*-]+$/;
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
 * Only `.mjs` runs: the engine is Node, so timeout, kill and rehearsal need no second runtime. */
export function isWorkflowScriptName(value: string): boolean {
  return value.length <= 67 && SCRIPT_NAME.test(value);
}

/** The extension of a declared output, in lowercase, or undefined when the name has none.
 * The engine parses an output as JSON exactly when this ends with `json`. */
export function workflowFileExtension(path: string): string | undefined {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return undefined;
  const extension = name.slice(dot + 1);
  return extension.length <= WORKFLOW_EXTENSION_MAX && /^[A-Za-z0-9]+$/.test(extension) ? extension.toLowerCase() : undefined;
}

/** Whether the engine parses this output as JSON: the name ends in `.json`, compared lowercase. */
export function isWorkflowJsonPath(path: string): boolean {
  return workflowFileExtension(path) === "json";
}

/** How a module is provided: a binary on PATH, or a package in the installation's own
 * python venv (`~/.workflow-env/`) or `node_modules` (`~/MimirBot/node_modules`). */
export const workflowModuleRuntimes = ["bin", "python", "node"] as const;
export type WorkflowModuleRuntime = (typeof workflowModuleRuntimes)[number];

/** One entry of a script step's `modules`. A version pins the package exactly and is compared at preflight. */
export interface WorkflowModule {
  name: string;
  runtime: WorkflowModuleRuntime;
  version?: string;
}

/** `gpu` names the machine's GPU rather than a package; only a binary entry may use it. */
const SPECIAL_BIN = "gpu";

export function isWorkflowModuleName(value: string, runtime: WorkflowModuleRuntime = "bin"): boolean {
  if (value.length === 0 || value.length > WORKFLOW_MODULE_NAME_MAX) return false;
  if (value === SPECIAL_BIN) return runtime === "bin";
  return (runtime === "node" ? NODE_MODULE_NAME : BIN_MODULE_NAME).test(value);
}

/** A version, never a URL, a path, a flag or anything with a space. */
export function isWorkflowModuleVersion(value: string): boolean {
  if (value.length === 0 || value.length > WORKFLOW_MODULE_VERSION_MAX) return false;
  if (value.startsWith("-") || value.includes("/") || value.includes(":")) return false;
  return MODULE_VERSION.test(value);
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
  /** A missing optional output does not fail the step; a required one always does. */
  required: z.boolean().default(true),
  /** A JSON Schema for the file's content, validated with the same compiler MCP tools use.
   * A `.json` a `condition` reads must declare one; a last-step `.json` may. */
  shape: z.record(z.string(), z.unknown()).optional(),
});

const conditionSourceSchema = z.object({
  /** The step whose output this condition reads; it must be earlier in the same list. */
  step: z.string().refine(isWorkflowSlug, { message: "must be a step id" }),
  /** That step's declared output, which must be a required file. */
  output: workflowPath,
});

const stepIdSchema = z.string().refine(isWorkflowSlug, { message: "must be lowercase letters, digits and single hyphens" });

const parameterName = z.string()
  .trim()
  .min(1)
  .max(WORKFLOW_PARAMETER_NAME_MAX)
  .regex(/^[a-z][a-z0-9_]*$/, { message: "must start with a lowercase letter and use letters, digits or _ only" });

/** A value a later step extracts from an earlier step's JSON output. */
const workflowParameterSourceSchema = z.object({
  step: stepIdSchema,
  output: workflowPath,
  /** A dotted path into that JSON, such as `total` or `check.clips`. */
  field: z.string().regex(RESULT_FIELD, { message: "must be a dotted path of letters, digits, _ or -" }),
});

export const workflowParameterSchema = z.object({
  name: parameterName,
  type: z.enum(workflowParameterTypes),
  /** The closed list an `enum` parameter accepts. */
  values: z.array(z.string().trim().min(1).max(200)).min(1).max(100).optional(),
  /** The value is a list of scalars of `type`; a list of objects is never a parameter. */
  list: z.boolean().default(false),
  required: z.boolean().default(true),
  /** An optional parameter must say what happens when it is absent: `rule:<name>`. */
  whenAbsent: z.string().trim().regex(/^rule:[a-z0-9]+(?:[-_][a-z0-9]+)*$/, { message: "must name a rule as rule:<name>" }).optional(),
  /** Where a value that does not come from the start comes from: one field of an earlier
   * step's `.json` output, or the person answering a manual step. */
  from: workflowParameterSourceSchema.optional(),
  collectedBy: stepIdSchema.optional(),
}).superRefine((parameter, context) => {
  if (parameter.type === "enum" && parameter.values === undefined) {
    context.addIssue({ code: "custom", path: ["values"], message: "an enum parameter needs its values" });
  }
  if (parameter.type !== "enum" && parameter.values !== undefined) {
    context.addIssue({ code: "custom", path: ["values"], message: "only an enum parameter declares values" });
  }
  const origins = (parameter.from === undefined ? 0 : 1) + (parameter.collectedBy === undefined ? 0 : 1);
  if (origins > 1) {
    context.addIssue({ code: "custom", path: ["from"], message: "a parameter has one origin: from, collectedBy, or the start of the run" });
  }
  if (origins > 0 && !parameter.required) {
    context.addIssue({ code: "custom", path: ["required"], message: "a parameter with an origin is always required; its value comes from the run, not from a fallback" });
  }
  if (!parameter.required && parameter.whenAbsent === undefined) {
    context.addIssue({ code: "custom", path: ["whenAbsent"], message: "an optional parameter needs whenAbsent, such as rule:periodo_padrao" });
  }
  if (parameter.required && parameter.whenAbsent !== undefined) {
    context.addIssue({ code: "custom", path: ["whenAbsent"], message: "a required parameter does not use whenAbsent" });
  }
  if (parameter.required && parameter.type === "enum" && parameter.values !== undefined && parameter.values.length === 0) {
    context.addIssue({ code: "custom", path: ["values"], message: "an enum parameter needs at least one value" });
  }
});

export type WorkflowParameter = z.output<typeof workflowParameterSchema>;
export type WorkflowParameterType = (typeof workflowParameterTypes)[number];

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

const canvasContentShape = {
  nodes: z.record(z.string(), canvasPointSchema).default({}),
  notes: z.array(canvasNoteSchema).max(WORKFLOW_CANVAS_NOTE_MAX).default([]),
  containers: z.array(canvasContainerSchema).max(WORKFLOW_CANVAS_CONTAINER_MAX).default([]),
};

function validateCanvasContent(canvas: { notes: Array<{ id: string }>; containers: Array<{ id: string }> }, context: z.RefinementCtx): void {
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
}

/** The layout of one Do While body: the same visual grammar as the main canvas, without another loop. */
export const workflowSubcanvasSchema = z.object(canvasContentShape).superRefine(validateCanvasContent);

/** The Studio's visual state: positions, notes and containers. The engine never reads it. */
export const workflowCanvasSchema = z.object({
  ...canvasContentShape,
  loops: z.record(z.string(), workflowSubcanvasSchema).default({}),
}).superRefine(validateCanvasContent);

export type WorkflowSubcanvas = z.output<typeof workflowSubcanvasSchema>;
export type WorkflowCanvas = z.output<typeof workflowCanvasSchema>;

/** A legacy field the engine no longer reads: accepted on load so an existing Workflow never
 * disappears from the list, refused on save with a message that names the condition step. */
const legacyResultSchema = workflowPath;
const legacyRequireSchema = z.record(z.string().min(1).max(64), z.unknown()).refine(
  (value) => Object.keys(value).length <= 64 && JSON.stringify(value).length <= 4_096,
  { message: "require must be a small JSON object" },
);

const legacyWhenSchema = z.object({
  field: z.string().regex(RESULT_FIELD, { message: "must be a dotted path of letters, digits, _ or -" }),
  equals: z.unknown(),
  next: stepIdSchema,
}).refine((value) => JSON.stringify(value).length <= 4_096, { message: "a when branch must be small" });

const stepBaseSchema = z.object({
  id: stepIdSchema,
  name: z.string().trim().min(1).max(120),
  inputs: z.array(stepInputSchema).max(50).default([]),
  outputs: z.array(stepOutputSchema).min(1).max(50),
  /** The values a run supplies to this step; each step receives only its own subset. */
  parameters: z.array(workflowParameterSchema).max(WORKFLOW_PARAMETER_MAX).default([]),
  /** Where to go after this step passes. null ends the flow; absent means the next step in array order. */
  onSuccess: stepIdSchema.nullable().optional(),
  /** Where to go when this step fails. Without it the run stops, as it always did. */
  onFailure: stepIdSchema.optional(),
  /** Where to go when this step times out; needs `timeoutMs` greater than 0. */
  onTimeout: stepIdSchema.optional(),
  result: legacyResultSchema.optional(),
  require: legacyRequireSchema.optional(),
  when: z.array(legacyWhenSchema).min(1).max(WORKFLOW_BRANCH_MAX).optional(),
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

/** A module entry as read: a bare string is a binary, and an object names its runtime. */
const workflowModuleObjectSchema = z.object({
  name: z.string(),
  runtime: z.enum(workflowModuleRuntimes).default("bin"),
  /** Installs exactly this version, and preflight compares the prepared one against it. */
  version: z.string().optional(),
}).superRefine((module, context) => {
  if (!isWorkflowModuleName(module.name, module.runtime)) {
    context.addIssue({
      code: "custom",
      path: ["name"],
      message: module.runtime === "node"
        ? 'must be a node package name, such as sharp or @scope/sharp'
        : 'must be a lowercase name of letters, digits, dots, hyphens or underscores',
    });
  }
  if (module.version !== undefined && !isWorkflowModuleVersion(module.version)) {
    context.addIssue({ code: "custom", path: ["version"], message: "must be a version such as 1.2.1, with no URL, path, flag or space" });
  }
  if (module.runtime === "bin" && module.version !== undefined) {
    context.addIssue({
      code: "custom",
      path: ["version"],
      message: "a binary is checked on PATH and has no version; remove version or declare the package with runtime python or node",
    });
  }
});

export const workflowModuleSchema = z.preprocess(
  (value) => typeof value === "string" ? { name: value, runtime: "bin" } : value,
  workflowModuleObjectSchema,
);

const scriptStepSchema = stepBaseSchema.extend({
  kind: z.literal("script"),
  /** A file name inside the Workflow's `scripts/` folder, never a path. */
  run: z.string().refine(isWorkflowScriptName, { message: "must be a flat .mjs file name" }),
  timeoutMs: z.number().int().min(1_000).max(WORKFLOW_SCRIPT_TIMEOUT_MAX_MS).default(WORKFLOW_SCRIPT_TIMEOUT_DEFAULT_MS),
  /** What the machine must provide: a binary on PATH, or a package in the installation's
   * python/node environment. Checked before a run, never installed during one. */
  modules: z.array(workflowModuleSchema).max(WORKFLOW_MODULES_MAX).default([]),
  mode: stepModeSchema,
});

export const conditionOps = ["equals", "not_equals", "exists", "contains", "gt", "gte", "lt", "lte"] as const;

const conditionLineSchema = z.object({
  /** Dotted path into the source output, e.g. `ok` or `check.total`. */
  field: z.string().regex(RESULT_FIELD, { message: "must be a dotted path of letters, digits, _ or -" }),
  op: z.enum(conditionOps),
  /** Compared as JSON; required for every operator except `exists`. */
  value: z.unknown().optional(),
});

const conditionStepSchema = z.object({
  id: stepIdSchema,
  kind: z.literal("condition"),
  name: z.string().trim().min(1).max(120),
  /** The step and output this condition reads: one `.json` file, declared by an earlier step. */
  from: conditionSourceSchema,
  /** Which comparisons must hold: all of them, or at least one. */
  match: z.enum(["all", "any"]).default("all"),
  conditions: z.array(conditionLineSchema).min(1).max(WORKFLOW_CONDITION_ROWS_MAX),
  /** Where each answer sends the run. Without one, that answer ends the run or the Do While round. */
  whenTrue: stepIdSchema.nullable().optional(),
  whenFalse: stepIdSchema.nullable().optional(),
  onFailure: stepIdSchema.optional(),
});

const bodyStepUnionSchema = z.discriminatedUnion("kind", [botStepSchema, scriptStepSchema, conditionStepSchema]);

const loopStepSchema = z.object({
  id: stepIdSchema,
  kind: z.literal("loop"),
  name: z.string().trim().min(1).max(120),
  /** The steps of one round, in execution order. A Do While cannot hold another one. */
  body: z.array(bodyStepUnionSchema).min(1).max(WORKFLOW_LOOP_BODY_MAX),
  /** The body step and output the stop condition reads after each round. */
  from: conditionSourceSchema,
  match: z.enum(["all", "any"]).default("all"),
  conditions: z.array(conditionLineSchema).min(1).max(WORKFLOW_CONDITION_ROWS_MAX),
  /** Integer at least 1; there is no product maximum. It is not a timeout. */
  maxIterations: z.number().int().min(1).default(1),
  /** Projected from the last round; each path belongs to exactly one body step. */
  outputs: z.array(stepOutputSchema).min(1).max(50),
  result: legacyResultSchema.optional(),
  require: legacyRequireSchema.optional(),
  onSuccess: stepIdSchema.nullable().optional(),
  onFailure: stepIdSchema.optional(),
}).strict();

const stepUnionSchema = z.discriminatedUnion("kind", [botStepSchema, scriptStepSchema, conditionStepSchema, loopStepSchema]);

/** Older Workflows have no `kind` (a step without one was always a bot step),
 * spell the success edge `next`, and keep one loose comparison on a condition;
 * all three are normalized here on read, including inside a Do While body. */
function normalizeStepRecord(value: unknown): unknown {
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
  if (record.kind === "loop" && Array.isArray(record.body)) {
    record.body = record.body.map(normalizeStepRecord);
  }
  return record;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** A Workflow saved before `result` left the contract still reads: a condition or Do While
 * that named one step becomes a pair of step and output, the output being that step's old `result`.
 * An unknown source keeps an empty output so the definition is refused, exactly as before. */
function normalizeDefinitionRecord(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value.steps)) return value;
  const steps = value.steps.map(normalizeStepRecord);
  const legacyResults = new Map<string, string>();
  const collect = (record: unknown): void => {
    if (!isRecord(record)) return;
    if (typeof record.id === "string" && typeof record.result === "string") legacyResults.set(record.id, record.result);
    if (Array.isArray(record.body)) record.body.forEach(collect);
  };
  steps.forEach(collect);
  const sourcePair = (from: unknown): unknown => typeof from === "string"
    ? { step: from, output: legacyResults.get(from) ?? "" }
    : from;
  const clean = (record: unknown): unknown => {
    if (!isRecord(record)) return record;
    const next = { ...record };
    if (next.kind === "condition") next.from = sourcePair(next.from);
    if (next.kind === "loop") {
      next.from = sourcePair(next.from);
      if (Array.isArray(next.body)) next.body = next.body.map(clean);
    }
    return next;
  };
  return { ...value, steps: steps.map(clean) };
}

export const workflowBodyStepSchema = z.preprocess(normalizeStepRecord, bodyStepUnionSchema);

export const workflowStepSchema = z.preprocess(normalizeStepRecord, stepUnionSchema);

/** Where an origin may point: the step's own list (top level or one Do While body) first,
 * then the top-level steps that ran before the Do While. */
interface OriginPools {
  local: ReadonlyMap<string, number>;
  localIndex: number;
  localSteps: readonly WorkflowStep[];
  top: ReadonlyMap<string, number>;
  topIndex: number;
  topSteps: readonly WorkflowStep[];
}

function originSource(
  stepId: string,
  pools: OriginPools,
  allowSelf: boolean,
): { step: WorkflowStep } | { error: string } {
  const local = pools.local.get(stepId);
  if (local !== undefined) {
    if (local > pools.localIndex || (!allowSelf && local === pools.localIndex)) {
      return { error: "a parameter origin must read an earlier step" };
    }
    return { step: pools.localSteps[local]! };
  }
  const top = pools.top.get(stepId);
  if (top !== undefined) {
    if (top > pools.topIndex || (!allowSelf && top === pools.topIndex)) {
      return { error: "a parameter origin must read an earlier step" };
    }
    return { step: pools.topSteps[top]! };
  }
  return { error: `the origin step ${JSON.stringify(stepId)} does not exist` };
}

function checkParameterOrigins(
  step: { name: string; parameters: readonly WorkflowParameter[] },
  path: Array<string | number>,
  pools: OriginPools,
  context: z.RefinementCtx,
): void {
  step.parameters.forEach((parameter, parameterIndex) => {
    const issue = (field: string, message: string) =>
      context.addIssue({ code: "custom", path: [...path, "parameters", parameterIndex, ...field.split(".")], message });
    const label = `parameter ${JSON.stringify(parameter.name)} in step ${JSON.stringify(step.name)}`;
    const origin = parameter.from;
    if (origin !== undefined) {
      const source = originSource(origin.step, pools, false);
      if ("error" in source) {
        issue("from.step", `${label}: ${source.error}`);
      } else if (source.step.kind === "condition") {
        issue("from.step", `${label}: a parameter origin must read a bot, script or Do While step`);
      } else {
        const output = source.step.outputs.find((candidate) => candidate.path === origin.output);
        if (!output) {
          issue("from.output", `${label}: step ${JSON.stringify(origin.step)} does not declare the output ${JSON.stringify(origin.output)}`);
        } else if (!output.required) {
          issue("from.output", `${label}: a parameter origin may only read a required output`);
        } else if (!isWorkflowJsonPath(output.path)) {
          issue("from.output", `${label}: a parameter origin reads a .json output`);
        }
      }
    }
    if (parameter.collectedBy !== undefined) {
      const collector = originSource(parameter.collectedBy, pools, true);
      if ("error" in collector) {
        issue("collectedBy", `${label}: ${collector.error}`);
      } else if (collector.step.kind === "condition" || collector.step.kind === "loop") {
        issue("collectedBy", `${label}: a manual bot or script step collects the value`);
      } else if (collector.step.mode !== "manual") {
        issue("collectedBy", `${label}: step ${JSON.stringify(parameter.collectedBy)} is not manual, so it never asks a person`);
      }
    }
  });
}

const workflowDefinitionObjectSchema = z.object({
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

  const validateConditionGroup = (conditions: readonly ConditionLine[], path: Array<string | number>, message: string): void => {
    conditions.forEach((line, lineIndex) => {
      if (line.op !== "exists" && line.value === undefined) {
        context.addIssue({ code: "custom", path: [...path, lineIndex, "value"], message: `the ${line.op} operator needs a value` });
      }
      if (line.value !== undefined && JSON.stringify(line.value).length > WORKFLOW_CONDITION_VALUE_MAX) {
        context.addIssue({ code: "custom", path: [...path, lineIndex, "value"], message: "the compared value must be small" });
      }
    });
    if (JSON.stringify(conditions).length > WORKFLOW_CONDITION_GROUP_MAX) {
      context.addIssue({ code: "custom", path, message: `${message}: the condition group must be small` });
    }
  };

  let totalSteps = definition.steps.length;
  const takenIds = new Set(positions.keys());
  definition.steps.forEach((step, loopIndex) => {
    if (step.kind !== "loop") return;
    totalSteps += step.body.length;
    const bodyPositions = new Map<string, number>();
    step.body.forEach((bodyStep, bodyIndex) => {
      if (takenIds.has(bodyStep.id) || bodyPositions.has(bodyStep.id)) {
        context.addIssue({
          code: "custom",
          path: ["steps", loopIndex, "body", bodyIndex, "id"],
          message: `step id ${JSON.stringify(bodyStep.id)} is used more than once`,
        });
      }
      bodyPositions.set(bodyStep.id, bodyIndex);
      takenIds.add(bodyStep.id);
    });

    const bodyOutputs = new Map<string, Array<{ required: boolean; stepId: string }>>();
    const bodyStepOutputs = new Map<string, Map<string, z.output<typeof stepOutputSchema>>>();
    step.body.forEach((bodyStep, bodyIndex) => {
      if (bodyStep.kind === "condition") {
        const sourceIndex = bodyPositions.get(bodyStep.from.step);
        if (sourceIndex === undefined) {
          context.addIssue({ code: "custom", path: ["steps", loopIndex, "body", bodyIndex, "from", "step"], message: `source step ${JSON.stringify(bodyStep.from.step)} is not in the body` });
        } else if (sourceIndex >= bodyIndex) {
          context.addIssue({ code: "custom", path: ["steps", loopIndex, "body", bodyIndex, "from", "step"], message: "a condition must read an earlier body step" });
        } else {
          const source = step.body[sourceIndex]!;
          if (source.kind === "condition") {
            context.addIssue({ code: "custom", path: ["steps", loopIndex, "body", bodyIndex, "from", "step"], message: "a condition must read a bot or script step" });
          } else {
            const output = source.outputs.find((candidate) => candidate.path === bodyStep.from.output);
            if (!output) {
              context.addIssue({ code: "custom", path: ["steps", loopIndex, "body", bodyIndex, "from", "output"], message: "the source step does not declare that output" });
            } else if (!output.required) {
              context.addIssue({ code: "custom", path: ["steps", loopIndex, "body", bodyIndex, "from", "output"], message: "a condition may only read a required output" });
            }
          }
        }
        validateConditionGroup(
          bodyStep.conditions,
          ["steps", loopIndex, "body", bodyIndex, "conditions"],
          `condition ${JSON.stringify(bodyStep.id)}`,
        );
        for (const [field, target] of [["whenTrue", bodyStep.whenTrue], ["whenFalse", bodyStep.whenFalse], ["onFailure", bodyStep.onFailure]] as const) {
          if (target === undefined || target === null) continue;
          const targetIndex = bodyPositions.get(target);
          if (targetIndex === undefined) {
            context.addIssue({ code: "custom", path: ["steps", loopIndex, "body", bodyIndex, field], message: `${field} step ${JSON.stringify(target)} is not in the body` });
          } else if (targetIndex <= bodyIndex) {
            context.addIssue({ code: "custom", path: ["steps", loopIndex, "body", bodyIndex, field], message: `${field} step ${JSON.stringify(target)} must come after this step` });
          }
        }
        return;
      }

      const own = new Map<string, z.output<typeof stepOutputSchema>>();
      bodyStep.outputs.forEach((output, outputIndex) => {
        if (own.has(output.path)) {
          context.addIssue({ code: "custom", path: ["steps", loopIndex, "body", bodyIndex, "outputs", outputIndex, "path"], message: `output ${JSON.stringify(output.path)} is declared more than once` });
        }
        own.set(output.path, output);
        const declared = bodyOutputs.get(output.path) ?? [];
        declared.push({ required: output.required, stepId: bodyStep.id });
        bodyOutputs.set(output.path, declared);
      });
      if (bodyStep.result !== undefined && !own.has(bodyStep.result)) {
        context.addIssue({ code: "custom", path: ["steps", loopIndex, "body", bodyIndex, "result"], message: "result must be one of this step's outputs" });
      }
      for (const [field, target] of [["onSuccess", bodyStep.onSuccess], ["onFailure", bodyStep.onFailure], ["onTimeout", bodyStep.onTimeout]] as const) {
        if (target === undefined || target === null) continue;
        const targetIndex = bodyPositions.get(target);
        if (targetIndex === undefined) {
          context.addIssue({ code: "custom", path: ["steps", loopIndex, "body", bodyIndex, field], message: `${field} step ${JSON.stringify(target)} is not in the body` });
        } else if (targetIndex <= bodyIndex) {
          context.addIssue({ code: "custom", path: ["steps", loopIndex, "body", bodyIndex, field], message: `${field} step ${JSON.stringify(target)} must come after this step` });
        }
      }
      if (bodyStep.onTimeout !== undefined && bodyStep.timeoutMs <= 0) {
        context.addIssue({ code: "custom", path: ["steps", loopIndex, "body", bodyIndex, "onTimeout"], message: "onTimeout needs a timeoutMs greater than 0" });
      }
      bodyStep.when?.forEach((branch, branchIndex) => {
        const targetIndex = bodyPositions.get(branch.next);
        if (targetIndex === undefined) {
          context.addIssue({ code: "custom", path: ["steps", loopIndex, "body", bodyIndex, "when", branchIndex, "next"], message: `next step ${JSON.stringify(branch.next)} is not in the body` });
        } else if (targetIndex <= bodyIndex) {
          context.addIssue({ code: "custom", path: ["steps", loopIndex, "body", bodyIndex, "when", branchIndex, "next"], message: `next step ${JSON.stringify(branch.next)} must come after this step` });
        }
      });
      const names = new Set<string>();
      bodyStep.inputs.forEach((input, inputIndex) => {
        if (names.has(input.as)) {
          context.addIssue({ code: "custom", path: ["steps", loopIndex, "body", bodyIndex, "inputs", inputIndex, "as"], message: `input ${JSON.stringify(input.as)} is declared more than once` });
        }
        names.add(input.as);
        const bodySource = bodyPositions.get(input.from.step);
        const topSource = positions.get(input.from.step);
        const bodySourceIndex = bodySource ?? -1;
        const topBeforeLoop = topSource !== undefined && topSource < loopIndex;
        if (!(bodySource !== undefined && bodySourceIndex < bodyIndex) && !topBeforeLoop) {
          context.addIssue({ code: "custom", path: ["steps", loopIndex, "body", bodyIndex, "inputs", inputIndex, "from", "step"], message: "an input may only come from an earlier body step or an earlier top-level step" });
          return;
        }
        const bodySourceOutput = bodySource !== undefined
          ? bodyStepOutputs.get(input.from.step)?.get(input.from.output)
          : undefined;
        const topSourceStep = topBeforeLoop ? definition.steps[topSource!]! : undefined;
        const topSourceOutput = topSourceStep !== undefined && topSourceStep.kind !== "condition"
          ? topSourceStep.outputs.find((output) => output.path === input.from.output)
          : undefined;
        const resolved = bodySource !== undefined ? bodySourceOutput : topSourceOutput;
        if (!resolved) {
          context.addIssue({ code: "custom", path: ["steps", loopIndex, "body", bodyIndex, "inputs", inputIndex, "from", "output"], message: "the source step does not declare that output" });
        } else if (!resolved.required) {
          context.addIssue({ code: "custom", path: ["steps", loopIndex, "body", bodyIndex, "inputs", inputIndex, "from", "output"], message: "an input may only come from a required output" });
        }
      });
      bodyStepOutputs.set(bodyStep.id, own);
    });

    const fromIndex = bodyPositions.get(step.from.step);
    if (fromIndex === undefined) {
      context.addIssue({ code: "custom", path: ["steps", loopIndex, "from", "step"], message: `source step ${JSON.stringify(step.from.step)} is not in the body` });
    } else {
      const source = step.body[fromIndex]!;
      if (source.kind === "condition") {
        context.addIssue({ code: "custom", path: ["steps", loopIndex, "from", "step"], message: "a Do While must read a bot or script step" });
      } else {
        const output = source.outputs.find((candidate) => candidate.path === step.from.output);
        if (!output) {
          context.addIssue({ code: "custom", path: ["steps", loopIndex, "from", "output"], message: "the source step does not declare that output" });
        } else if (!output.required) {
          context.addIssue({ code: "custom", path: ["steps", loopIndex, "from", "output"], message: "a Do While may only read a required output" });
        }
      }
    }
    validateConditionGroup(step.conditions, ["steps", loopIndex, "conditions"], `Do While ${JSON.stringify(step.id)}`);

    const declaredOutputs = new Map<string, { required: boolean; count: number }>();
    for (const [path, declarations] of bodyOutputs) {
      declaredOutputs.set(path, { required: declarations.every((entry) => entry.required), count: declarations.length });
    }
    const loopOutputPaths = new Set<string>();
    step.outputs.forEach((output, outputIndex) => {
      if (loopOutputPaths.has(output.path)) {
        context.addIssue({ code: "custom", path: ["steps", loopIndex, "outputs", outputIndex, "path"], message: `output ${JSON.stringify(output.path)} is declared more than once` });
      }
      loopOutputPaths.add(output.path);
      const declaration = declaredOutputs.get(output.path);
      if (!declaration) {
        context.addIssue({ code: "custom", path: ["steps", loopIndex, "outputs", outputIndex, "path"], message: `no body step declares output ${JSON.stringify(output.path)}` });
      } else if (declaration.count > 1) {
        context.addIssue({ code: "custom", path: ["steps", loopIndex, "outputs", outputIndex, "path"], message: `more than one body step declares output ${JSON.stringify(output.path)}` });
      } else if (output.required && !declaration.required) {
        context.addIssue({ code: "custom", path: ["steps", loopIndex, "outputs", outputIndex, "path"], message: `output ${JSON.stringify(output.path)} is required by the Do While but optional in the body` });
      }
    });
    if (step.result !== undefined && !loopOutputPaths.has(step.result)) {
      context.addIssue({ code: "custom", path: ["steps", loopIndex, "result"], message: "result must be one of the Do While's outputs" });
    }
    for (const [field, target] of [["onSuccess", step.onSuccess], ["onFailure", step.onFailure]] as const) {
      if (target === undefined || target === null) continue;
      const targetIndex = positions.get(target);
      if (targetIndex === undefined) {
        context.addIssue({ code: "custom", path: ["steps", loopIndex, field], message: `${field} step ${JSON.stringify(target)} does not exist` });
      } else if (targetIndex <= loopIndex) {
        context.addIssue({ code: "custom", path: ["steps", loopIndex, field], message: `${field} step ${JSON.stringify(target)} must come after this step` });
      }
    }
  });
  if (totalSteps > WORKFLOW_STEP_MAX) {
    context.addIssue({ code: "custom", path: ["steps"], message: `a Workflow may have at most ${WORKFLOW_STEP_MAX} steps including Do While bodies` });
  }

  definition.steps.forEach((step, index) => {
    if (step.kind !== "condition") return;
    const sourceIndex = positions.get(step.from.step);
    if (sourceIndex === undefined) {
      context.addIssue({ code: "custom", path: ["steps", index, "from", "step"], message: `source step ${JSON.stringify(step.from.step)} does not exist` });
    } else if (sourceIndex >= index) {
      context.addIssue({ code: "custom", path: ["steps", index, "from", "step"], message: "a condition must read an earlier step" });
    } else {
      const source = definition.steps[sourceIndex]!;
      if (source.kind === "condition") {
        context.addIssue({ code: "custom", path: ["steps", index, "from", "step"], message: "a condition must read a bot, script or Do While step" });
      } else {
        const output = source.outputs.find((candidate) => candidate.path === step.from.output);
        if (!output) {
          context.addIssue({ code: "custom", path: ["steps", index, "from", "output"], message: "the source step does not declare that output" });
        } else if (!output.required) {
          context.addIssue({ code: "custom", path: ["steps", index, "from", "output"], message: "a condition may only read a required output" });
        }
      }
    }
    validateConditionGroup(step.conditions, ["steps", index, "conditions"], `condition ${JSON.stringify(step.id)}`);
    for (const [field, target] of [["whenTrue", step.whenTrue], ["whenFalse", step.whenFalse], ["onFailure", step.onFailure]] as const) {
      if (target === undefined || target === null) continue;
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
    if (step.kind === "bot" || step.kind === "script") {
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
    }
    if (step.kind === "loop") {
      for (const [field, target] of [["onSuccess", step.onSuccess], ["onFailure", step.onFailure]] as const) {
        if (target === undefined || target === null) continue;
        const targetIndex = positions.get(target);
        if (targetIndex === undefined) {
          context.addIssue({ code: "custom", path: ["steps", index, field], message: `${field} step ${JSON.stringify(target)} does not exist` });
        } else if (targetIndex <= index) {
          context.addIssue({ code: "custom", path: ["steps", index, field], message: `${field} step ${JSON.stringify(target)} must come after this step` });
        }
      }
    }
    const names = new Set<string>();
    const inputs = step.kind === "loop" ? [] : step.inputs;
    inputs.forEach((input, inputIndex) => {
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
  const parameterKinds = new Map<string, { type: string; values: string; step: string }>();
  const checkParameters = (step: WorkflowStep | WorkflowBodyStep, path: Array<string | number>): void => {
    if (step.kind === "condition" || step.kind === "loop") return;
    const seen = new Set<string>();
    step.parameters.forEach((parameter, parameterIndex) => {
      if (seen.has(parameter.name)) {
        context.addIssue({ code: "custom", path: [...path, "parameters", parameterIndex, "name"], message: `parameter ${JSON.stringify(parameter.name)} is declared more than once` });
      }
      seen.add(parameter.name);
      const kind = `${parameter.type}|${JSON.stringify(parameter.values ?? [])}|${parameter.list ? "list" : "one"}`;
      const previous = parameterKinds.get(parameter.name);
      if (!previous) {
        parameterKinds.set(parameter.name, { type: kind, values: kind, step: step.id });
      } else if (previous.type !== kind) {
        context.addIssue({ code: "custom", path: [...path, "parameters", parameterIndex, "type"], message: `parameter ${JSON.stringify(parameter.name)} has a different type in step ${JSON.stringify(previous.step)}` });
      }
    });
  };
  definition.steps.forEach((step, index) => {
    checkParameters(step, ["steps", index]);
    if (step.kind === "loop") {
      const bodyPositions = new Map(step.body.map((entry, position) => [entry.id, position] as const));
      step.body.forEach((body, bodyIndex) => {
        checkParameters(body, ["steps", index, "body", bodyIndex]);
        if (body.kind === "condition") return;
        checkParameterOrigins(
          body,
          ["steps", index, "body", bodyIndex],
          { local: bodyPositions, localIndex: bodyIndex, localSteps: step.body, top: positions, topIndex: index, topSteps: definition.steps },
          context,
        );
      });
      return;
    }
    if (step.kind === "condition") return;
    checkParameterOrigins(
      step,
      ["steps", index],
      { local: positions, localIndex: index, localSteps: definition.steps, top: positions, topIndex: index, topSteps: definition.steps },
      context,
    );
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
    for (const [loopId, subcanvas] of Object.entries(definition.canvas.loops)) {
      const loop = definition.steps.find((step) => step.id === loopId);
      if (!loop || loop.kind !== "loop") {
        context.addIssue({ code: "custom", path: ["canvas", "loops", loopId], message: `there is no Do While ${JSON.stringify(loopId)}` });
        continue;
      }
      const bodyIds = new Set(loop.body.map((step) => step.id));
      const bodyContainers = new Set(subcanvas.containers.map((container) => container.id));
      subcanvas.notes.forEach((note, index) => {
        if (!note.link) return;
        const exists = note.link.kind === "step" ? bodyIds.has(note.link.id) : bodyContainers.has(note.link.id);
        if (!exists) {
          context.addIssue({ code: "custom", path: ["canvas", "loops", loopId, "notes", index, "link", "id"], message: "the linked element is not in this Do While body" });
        }
      });
      for (const nodeId of Object.keys(subcanvas.nodes)) {
        if (!bodyIds.has(nodeId)) {
          context.addIssue({ code: "custom", path: ["canvas", "loops", loopId, "nodes", nodeId], message: "the position names no step in this Do While body" });
        }
      }
    }
  }
});

/** Reads a definition from disk or a request. It only normalizes: refusing here would make an
 * existing Workflow disappear from the list instead of appearing to be corrected. */
export const workflowDefinitionSchema = z.preprocess(normalizeDefinitionRecord, workflowDefinitionObjectSchema);

type ObjectSchema = { shape: Record<string, unknown> };
const keysOf = (schema: ObjectSchema): Set<string> => new Set(Object.keys(schema.shape));

const DEFINITION_FIELDS = keysOf(workflowDefinitionObjectSchema);
const STEP_FIELDS: Record<WorkflowStep["kind"], Set<string>> = {
  bot: keysOf(botStepSchema),
  script: keysOf(scriptStepSchema),
  condition: keysOf(conditionStepSchema),
  loop: keysOf(loopStepSchema),
};
const STEP_INPUT_FIELDS = keysOf(stepInputSchema);
const STEP_INPUT_SOURCE_FIELDS = keysOf(stepInputSchema.shape.from as ObjectSchema);
const STEP_OUTPUT_FIELDS = keysOf(stepOutputSchema);
const MODULE_FIELDS = keysOf(workflowModuleObjectSchema);
const PARAMETER_FIELDS = keysOf(workflowParameterSchema);
const PARAMETER_SOURCE_FIELDS = keysOf(workflowParameterSourceSchema);
const CONDITION_LINE_FIELDS = keysOf(conditionLineSchema);
/** Fields an older save may still carry: the reading schema turns them into their current form. */
const LEGACY_STEP_FIELDS = new Set(["next"]);
const LEGACY_CONDITION_STEP_FIELDS = new Set(["field", "op", "value"]);

function unknownKey(
  entry: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  label: string,
  issues: Array<{ path: string; message: string }>,
): boolean {
  let found = false;
  for (const key of Object.keys(entry)) {
    if (allowed.has(key)) continue;
    found = true;
    issues.push({ path: `${path}.${key}`, message: `${label}: ${JSON.stringify(key)} is not a field of this contract` });
  }
  return found;
}

/** Every field a save may carry. The reading schema drops what it does not know, so an existing
 * Workflow never disappears from the list; a save refuses the same field instead of dropping it. */
export function workflowUnknownFields(input: unknown): Array<{ path: string; message: string }> {
  const issues: Array<{ path: string; message: string }> = [];
  if (!isRecord(input)) return issues;
  unknownKey(input, DEFINITION_FIELDS, "workflow", "A Workflow", issues);
  if (!Array.isArray(input.steps)) return issues;
  const walkStep = (record: unknown, path: string, topLevel: boolean): void => {
    if (!isRecord(record)) return;
    const kind = record.kind === undefined ? "bot" : record.kind;
    const allowed = typeof kind === "string" && Object.hasOwn(STEP_FIELDS, kind)
      ? new Set([...STEP_FIELDS[kind as WorkflowStep["kind"]], ...LEGACY_STEP_FIELDS, ...(kind === "condition" ? LEGACY_CONDITION_STEP_FIELDS : [])])
      : new Set<string>(LEGACY_STEP_FIELDS);
    const label = typeof record.name === "string" ? `step ${JSON.stringify(record.name)}` : "a step";
    unknownKey(record, allowed, path, label, issues);
    if (Array.isArray(record.inputs)) {
      record.inputs.forEach((entry, index) => {
        if (!isRecord(entry)) return;
        unknownKey(entry, STEP_INPUT_FIELDS, `${path}.inputs.${index}`, `input ${index + 1} of ${label}`, issues);
        if (isRecord(entry.from)) {
          unknownKey(entry.from, STEP_INPUT_SOURCE_FIELDS, `${path}.inputs.${index}.from`, `input ${index + 1} of ${label}`, issues);
        }
      });
    }
    if (Array.isArray(record.outputs)) {
      record.outputs.forEach((entry, index) => {
        if (!isRecord(entry)) return;
        unknownKey(entry, STEP_OUTPUT_FIELDS, `${path}.outputs.${index}`, `output ${index + 1} of ${label}`, issues);
      });
    }
    if (Array.isArray(record.modules)) {
      record.modules.forEach((entry, index) => {
        if (!isRecord(entry)) return;
        unknownKey(entry, MODULE_FIELDS, `${path}.modules.${index}`, `module ${index + 1} of ${label}`, issues);
      });
    }
    if (Array.isArray(record.parameters)) {
      record.parameters.forEach((entry, index) => {
        if (!isRecord(entry)) return;
        unknownKey(entry, PARAMETER_FIELDS, `${path}.parameters.${index}`, `parameter ${index + 1} of ${label}`, issues);
        if (isRecord(entry.from)) {
          unknownKey(entry.from, PARAMETER_SOURCE_FIELDS, `${path}.parameters.${index}.from`, `parameter ${index + 1} of ${label}`, issues);
        }
      });
    }
    if (kind === "condition" && Array.isArray(record.conditions)) {
      record.conditions.forEach((entry, index) => {
        if (!isRecord(entry)) return;
        unknownKey(entry, CONDITION_LINE_FIELDS, `${path}.conditions.${index}`, `comparison ${index + 1} of ${label}`, issues);
      });
    }
    if (topLevel && kind === "loop" && Array.isArray(record.body)) {
      record.body.forEach((entry, index) => walkStep(entry, `${path}.body.${index}`, false));
    }
  };
  input.steps.forEach((step, index) => walkStep(step, `steps.${index}`, true));
  return issues;
}

export type StepInput = z.output<typeof stepInputSchema>;
export type StepOutput = z.output<typeof stepOutputSchema>;
export type BotWorkflowStep = z.output<typeof botStepSchema>;
export type ScriptWorkflowStep = z.output<typeof scriptStepSchema>;
export type ConditionLine = z.output<typeof conditionLineSchema>;
export type ConditionMatch = "all" | "any";
export type ConditionWorkflowStep = z.output<typeof conditionStepSchema>;
export type ConditionOp = (typeof conditionOps)[number];
export type WorkflowBodyStep = BotWorkflowStep | ScriptWorkflowStep | ConditionWorkflowStep;
export type LoopWorkflowStep = z.output<typeof loopStepSchema>;
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

export function isLoopStep(step: WorkflowStep): step is LoopWorkflowStep {
  return step.kind === "loop";
}

/** Every step the definition holds, top level first, then each Do While body in order. */
export function workflowAllSteps(definition: { steps: readonly WorkflowStep[] }): WorkflowStep[] {
  return definition.steps.flatMap((step) => step.kind === "loop" ? [step, ...step.body] : [step]);
}

/** The modules its script steps declare, each once. Preparation unions these across every Workflow. */
export function workflowModules(definition: { steps: readonly WorkflowStep[] }): WorkflowModule[] {
  const unique = new Map<string, WorkflowModule>();
  for (const step of workflowAllSteps(definition)) {
    if (step.kind !== "script") continue;
    for (const module of step.modules) {
      unique.set(`${module.runtime}\u0000${module.name}\u0000${module.version ?? ""}`, module);
    }
  }
  return [...unique.values()];
}

/** Whether a person must continue the Workflow before its first step can run. A routine cannot start such a Workflow. */
export function workflowStartsManual(definition: Pick<WorkflowDefinition, "steps">): boolean {
  const first = definition.steps[0];
  return first !== undefined && (first.kind === "bot" || first.kind === "script") && first.mode === "manual";
}

export type WorkflowRunStatus = "queued" | "running" | "waiting_manual" | "waiting_approval" | "succeeded" | "failed" | "cancelled";
export type WorkflowStepStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";

export type WorkflowRunFailureKind = "failure" | "timeout" | "limit";

export interface WorkflowRunStep {
  id: string;
  status: WorkflowStepStatus;
  assignmentId?: string;
  threadId?: string;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  /** Whether the step stopped as a plain failure, a timeout or the Do While's iteration limit; absent means failure. */
  failureKind?: WorkflowRunFailureKind;
  /** The declared outputs the engine found, in declaration order. */
  verified?: string[];
  /** The answer a condition step gave, and the comparison that produced it. */
  branch?: boolean;
  condition?: ConditionLine;
  /** The step and output a condition read. */
  source?: { step: string; output: string };
  /** Marks a Do While among the top-level steps. */
  kind?: "loop";
  /** One entry per round; only a Do While has them. */
  iterations?: WorkflowRunIteration[];
}

export interface WorkflowRunIteration {
  /** 1-based, as shown in F2. */
  index: number;
  status: "running" | "succeeded" | "failed" | "skipped";
  startedAt?: number;
  finishedAt?: number;
  steps: WorkflowRunStep[];
  /** Whether the stop condition was satisfied after this round. */
  conditionMatched?: boolean;
  /** The comparison that stopped the Do While, for the timeline. */
  condition?: ConditionLine;
  result?: unknown;
  error?: string;
  failureKind?: WorkflowRunFailureKind;
}

export interface WorkflowRunPause {
  stepId: string;
  question: string;
  cardIds: string[];
  askedAt: number;
  /** The step's path in the run; a body step is [loopIndex, iterationArrayIndex, bodyIndex]. */
  path?: number[];
}

/** Where a manual step holds the run: the step path, and when the person was asked to continue.
 * `step` is the legacy top-level index that older run.json files still carry. */
export interface WorkflowRunHold {
  path?: number[];
  step?: number;
  since: number;
}

/** The index a legacy or current hold names, for UI and recovery code that only needs the top step. */
export function workflowHoldTopIndex(hold: WorkflowRunHold, fallback: number): number {
  return hold.path?.[0] ?? hold.step ?? fallback;
}

/** The full path a hold names; a legacy hold only knows its top-level step. */
export function workflowHoldPath(hold: WorkflowRunHold): number[] | undefined {
  if (hold.path) return [...hold.path];
  return hold.step === undefined ? undefined : [hold.step];
}

/** A routine started the run instead of a person or a bot conversation. */
export interface WorkflowRunTrigger {
  routineId: string;
  routineName: string;
}

/** The names a run keeps after its Workflow is deleted or edited. */
export interface WorkflowRunSnapshot {
  name: string;
  steps: Array<{ id: string; name: string; body?: Array<{ id: string; name: string }> }>;
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
  /** The flat parameter map the person or bot supplied; each step receives its own subset. */
  inputs?: Record<string, unknown>;
  /** The caller's own request id, stored for traceability; it does not deduplicate. */
  requestId?: string;
  /** The routine that started the run, when a trigger did. */
  triggeredBy?: WorkflowRunTrigger;
  /** The Workflow and step names at run time, so the run stays readable after the Workflow is gone. */
  snapshot?: WorkflowRunSnapshot;
}

const runPathSchema = z.array(z.number().int().nonnegative()).min(1).max(3);

const workflowRunIterationSchema: z.ZodType<WorkflowRunIteration> = z.lazy(() => z.object({
  index: z.number().int().min(1),
  status: z.enum(["running", "succeeded", "failed", "skipped"]),
  startedAt: z.number().int().nonnegative().optional(),
  finishedAt: z.number().int().nonnegative().optional(),
  steps: z.array(workflowRunStepSchema).min(1).max(WORKFLOW_LOOP_BODY_MAX),
  conditionMatched: z.boolean().optional(),
  condition: conditionLineSchema.optional(),
  result: z.unknown().optional(),
  error: z.string().optional(),
  failureKind: z.enum(["failure", "timeout", "limit"]).optional(),
}));

const workflowRunStepSchema: z.ZodType<WorkflowRunStep> = z.lazy(() => z.object({
  id: z.string().min(1).max(WORKFLOW_SLUG_MAX),
  status: z.enum(["pending", "running", "succeeded", "failed", "skipped"]),
  assignmentId: z.string().min(1).optional(),
  threadId: z.string().min(1).optional(),
  startedAt: z.number().int().nonnegative().optional(),
  finishedAt: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
  failureKind: z.enum(["failure", "timeout", "limit"]).optional(),
  verified: z.array(z.string()).optional(),
  branch: z.boolean().optional(),
  condition: conditionLineSchema.optional(),
  source: z.object({ step: z.string().min(1).max(WORKFLOW_SLUG_MAX), output: z.string().min(1).max(WORKFLOW_PATH_MAX) }).optional(),
  kind: z.literal("loop").optional(),
  iterations: z.array(workflowRunIterationSchema).optional(),
}));

const workflowRunPauseSchema = z.object({
  stepId: z.string().min(1).max(WORKFLOW_SLUG_MAX),
  question: z.string(),
  cardIds: z.array(z.string()),
  askedAt: z.number().int().nonnegative(),
  path: runPathSchema.optional(),
});

const workflowRunHoldSchema = z.object({
  path: runPathSchema.optional(),
  step: z.number().int().nonnegative().optional(),
  since: z.number().int().nonnegative(),
}).superRefine((hold, context) => {
  if (hold.path === undefined && hold.step === undefined) {
    context.addIssue({ code: "custom", path: ["path"], message: "a hold needs a step path" });
  }
});

const workflowRunSnapshotSchema = z.object({
  name: z.string().trim().min(1).max(80),
  steps: z.array(z.object({
    id: z.string().min(1).max(WORKFLOW_SLUG_MAX),
    name: z.string().trim().min(1).max(120),
    body: z.array(z.object({
      id: z.string().min(1).max(WORKFLOW_SLUG_MAX),
      name: z.string().trim().min(1).max(120),
    })).max(WORKFLOW_LOOP_BODY_MAX).optional(),
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
  inputs: z.record(z.string(), z.unknown()).optional(),
  requestId: z.string().min(1).max(200).optional(),
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

/** A dotted path read out of a step's JSON output; `found` is false when a segment is missing. */
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
