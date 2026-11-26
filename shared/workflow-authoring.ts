// The authoring contract: what the engine needs from a definition, said once and checked
// with three strengths. The reading schema normalizes and never refuses, so an existing
// Workflow always stays in the list; refusal belongs here, at save, create and preflight.
import {
  WORKFLOW_SHAPE_MAX_BYTES,
  isWorkflowJsonPath,
  workflowFileExtension,
  workflowAllSteps,
  type BotWorkflowStep,
  type ScriptWorkflowStep,
  type StepOutput,
  type WorkflowDefinition,
  type WorkflowModule,
  type WorkflowParameter,
  type WorkflowStep,
} from "./workflow.ts";

export type WorkflowAuthoringMode = "preview" | "save" | "preflight";

export interface AuthoringIssue {
  /** Where the problem is, in the same dotted form the reading schema uses. */
  path: string;
  message: string;
}

export interface AuthoringReport {
  errors: AuthoringIssue[];
  warnings: AuthoringIssue[];
}

export interface AuthoringScript {
  name: string;
  content: string;
}

export interface AuthoringOptions {
  /** Compiles one output's JSON Schema. The server passes the compiler MCP tools use,
   * so a `shape` is exactly as strong as a tool's input schema. */
  compileShape?: (schema: Record<string, unknown>) => void;
  /** Machine dependencies that are not available right now. */
  missingModules?: (modules: readonly WorkflowModule[]) => readonly string[];
  /** Whether a command resolves on this computer's PATH. Provided by the server, so the
   * warning about a package written as a binary is only made when the name is really absent. */
  binOnPath?: (name: string) => boolean;
  /** The script files the definition names; only their text is read, never run. */
  scripts?: readonly AuthoringScript[];
}

const FILE_IN_TEXT = /(?:^|[\s"'`(])([\w-][\w./-]*\.(?:json|txt|md|csv|tsv|mp4|mov|wav|mp3|png|jpg|jpeg|webm|mkv|srt|vtt))\b/gi;
const PARAMETER_IN_ARGV = /process\.argv/;

/** A promise of a deadline or a default action after an unanswered approval: the engine has neither. */
const APPROVAL_FALLBACKS: ReadonlyArray<RegExp> = [
  /\bse n[ãa]o houver (?:uma )?resposta\b/i,
  /\bse n[ãa]o responder\b/i,
  /\bsiga (?:mesmo )?ap[óo]s\b/i,
  /\bcontinue mesmo sem\b/i,
  /\bap[óo]s (?:\d+|alguns|poucos) (?:minutos?|horas?|dias?),?\s+(?:siga|continue|prossiga)\b/i,
  /\bif (?:there (?:is|are) )?no (?:answer|response)\b/i,
  /\bif (?:the person |they )?(?:does not|doesn't|do not|don't) (?:answer|respond)\b/i,
  /\bcontinue without\b/i,
  /\bafter (?:\d+|a few) (?:minutes?|hours?|days?)[,]? (?:proceed|continue|carry on)\b/i,
];

function stepLabel(step: { id: string; name: string }): string {
  return `step ${JSON.stringify(step.name)}`;
}

function declaredOutputs(step: WorkflowStep): readonly StepOutput[] {
  return step.kind === "condition" ? [] : step.outputs;
}

/** Every output path a condition or Do While reads, so the ones that must carry a `shape` are known. */
function consumedOutputs(definition: WorkflowDefinition): Set<string> {
  const consumed = new Set<string>();
  for (const step of workflowAllSteps(definition)) {
    if (step.kind === "condition" || step.kind === "loop") consumed.add(`${step.from.step}\u0000${step.from.output}`);
  }
  return consumed;
}

function checkOutput(
  step: WorkflowStep,
  output: StepOutput,
  path: string,
  consumed: boolean,
  report: AuthoringReport,
  options: AuthoringOptions,
): void {
  if (output.path.includes("*")) {
    report.errors.push({
      path,
      message: `${stepLabel(step)}: output ${JSON.stringify(output.path)} cannot hold *; the engine looks for the exact name, so put the alias inside a .json output instead`,
    });
    return;
  }
  if (workflowFileExtension(output.path) === undefined) {
    report.errors.push({
      path,
      message: `${stepLabel(step)}: output ${JSON.stringify(output.path)} needs a file extension, such as ${output.path}.txt or ${output.path}.json`,
    });
    return;
  }
  if (consumed && !isWorkflowJsonPath(output.path)) {
    report.errors.push({
      path,
      message: `${stepLabel(step)}: a condition can only read a .json output, and ${JSON.stringify(output.path)} is not one; write the value to a .json output and read that file instead`,
    });
    return;
  }
  if (output.shape === undefined) {
    if (consumed) {
      report.errors.push({
        path,
        message: `${stepLabel(step)}: output ${JSON.stringify(output.path)} is read by a condition, so it needs a shape saying which fields it holds`,
      });
    }
    return;
  }
  const shapeBytes = new TextEncoder().encode(JSON.stringify(output.shape)).length;
  if (shapeBytes > WORKFLOW_SHAPE_MAX_BYTES) {
    report.errors.push({
      path,
      message: `${stepLabel(step)}: the shape of ${JSON.stringify(output.path)} is larger than ${WORKFLOW_SHAPE_MAX_BYTES / 1024}KB; keep only the fields a condition or a parameter reads`,
    });
    return;
  }
  if (!options.compileShape) return;
  try {
    options.compileShape(output.shape);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    report.errors.push({
      path,
      message: `${stepLabel(step)}: the shape of ${JSON.stringify(output.path)} does not compile (${reason}); correct the shape until it compiles`,
    });
  }
}

function checkSource(
  step: WorkflowStep,
  path: string,
  pool: readonly WorkflowStep[],
  index: number,
  report: AuthoringReport,
): void {
  if (step.kind !== "condition" && step.kind !== "loop") return;
  const from = step.from;
  if (from.output.includes("*")) {
    report.errors.push({
      path: `${path}.from.output`,
      message: `${stepLabel(step)}: it reads ${JSON.stringify(from.output)}, which holds *; a condition reads an exact output name`,
    });
    return;
  }
  if (!isWorkflowJsonPath(from.output)) {
    report.errors.push({
      path: `${path}.from.output`,
      message: `${stepLabel(step)}: a condition reads a .json output, and ${JSON.stringify(from.output)} is not one; read a .json output instead`,
    });
    return;
  }
  const sourceIndex = pool.findIndex((candidate) => candidate.id === from.step);
  const source = pool[sourceIndex];
  if (!source || sourceIndex >= index || source.kind === "condition") {
    report.errors.push({
      path: `${path}.from.step`,
      message: `${stepLabel(step)}: it reads ${JSON.stringify(from.step)}, which is not an earlier step; point from.step at an earlier bot, script or Do While step`,
    });
    return;
  }
  const output = declaredOutputs(source).find((candidate) => candidate.path === from.output);
  if (!output) {
    report.errors.push({
      path: `${path}.from.output`,
      message: `${stepLabel(step)}: ${JSON.stringify(from.step)} does not declare the output ${JSON.stringify(from.output)}; read one of the outputs that step declares`,
    });
  } else if (!output.required) {
    report.errors.push({
      path: `${path}.from.output`,
      message: `${stepLabel(step)}: it reads ${JSON.stringify(from.output)}, which ${JSON.stringify(from.step)} marks optional; read a required output, or make it required`,
    });
  } else if (output.shape === undefined) {
    report.errors.push({
      path: `${path}.from.output`,
      message: `${stepLabel(step)}: it reads ${JSON.stringify(from.output)}, which needs a shape saying which fields it holds; declare the fields with shape on that output`,
    });
  }
}

/** A manual step exists to receive a value from the person; without collectedBy the
 * Continue button delivers nothing and the step has no reason to be manual. */
function checkManualStep(step: BotWorkflowStep | ScriptWorkflowStep, path: string, report: AuthoringReport): void {
  if (step.mode !== "manual") return;
  if (step.parameters.some((parameter) => parameter.collectedBy === step.id)) return;
  report.errors.push({
    path: `${path}.mode`,
    message: `${stepLabel(step)}: a manual step must declare a parameter with collectedBy ${JSON.stringify(step.id)}; declare one so continuing delivers the value the person sends, since the Continue button alone delivers nothing`,
  });
}

/** A name written as a binary that looks like a package and is not on PATH: the environment
 * installs packages, so say which runtime the author meant. */
function moduleWarnings(
  step: BotWorkflowStep | ScriptWorkflowStep,
  path: string,
  report: AuthoringReport,
  options: AuthoringOptions,
): void {
  if (step.kind !== "script" || options.binOnPath === undefined) return;
  for (const module of step.modules) {
    if (module.runtime !== "bin" || !module.name.includes("-") || options.binOnPath(module.name)) continue;
    report.warnings.push({
      path: `${path}.modules`,
      message: `${stepLabel(step)}: modules names ${JSON.stringify(module.name)} as a binary, and it is not on PATH; if it is a package, declare { "name": ${JSON.stringify(module.name)}, "runtime": "python" } (or "node") so Prepare environment installs it`,
    });
  }
}

/** File names an instruction mentions that the step neither receives nor writes. */
function instructionWarnings(step: WorkflowStep, path: string, report: AuthoringReport): void {
  if (step.kind !== "bot") return;
  const known = new Set<string>([
    ...step.inputs.map((input) => input.as),
    ...declaredOutputs(step).map((output) => output.path),
  ]);
  const mentioned = new Set<string>();
  for (const match of step.instructions.matchAll(FILE_IN_TEXT)) {
    const name = match[1]!;
    const knownName = [...known].some((candidate) => candidate === name || name.endsWith(`/${candidate}`));
    if (knownName || mentioned.has(name)) continue;
    mentioned.add(name);
    report.warnings.push({
      path: `${path}.instructions`,
      message: `${stepLabel(step)}: the instructions mention ${JSON.stringify(name)}, which does not arrive through input/ and is not an output of this step; declare it as an input of this step or as an output, or stop naming it`,
    });
  }
}

function approvalFallbackWarnings(step: WorkflowStep, path: string, report: AuthoringReport): void {
  if (step.kind !== "bot") return;
  const seen = new Set<string>();
  for (const pattern of APPROVAL_FALLBACKS) {
    const match = pattern.exec(step.instructions);
    if (!match || seen.has(match[0])) continue;
    seen.add(match[0]);
    report.warnings.push({
      path: `${path}.instructions`,
      message: `${stepLabel(step)}: the instructions promise ${JSON.stringify(match[0])}, but the engine has no fallback: without an answer the run waits indefinitely`,
    });
  }
}

export function validateWorkflowAuthoring(
  definition: WorkflowDefinition,
  mode: WorkflowAuthoringMode,
  options: AuthoringOptions = {},
): AuthoringReport {
  const report: AuthoringReport = { errors: [], warnings: [] };
  const consumed = consumedOutputs(definition);

  definition.steps.forEach((step, index) => {
    const path = `steps.${index}`;
    const sourcePool = step.kind === "loop" ? step.body : definition.steps;
    checkSource(step, path, sourcePool, step.kind === "loop" ? step.body.length : index, report);
    if (step.kind === "condition") return;
    if (step.kind !== "loop") checkManualStep(step, path, report);

    if (step.kind === "loop") {
      step.body.forEach((bodyStep, bodyIndex) => {
        const bodyPath = `${path}.body.${bodyIndex}`;
        checkSource(bodyStep, bodyPath, step.body, bodyIndex, report);
        if (bodyStep.kind === "condition") return;
        checkManualStep(bodyStep, bodyPath, report);
        if (bodyStep.require !== undefined) {
          report.errors.push({
            path: `${bodyPath}.require`,
            message: `${stepLabel(bodyStep)}: require is gone; replace it with a condition step that reads the output`,
          });
        }
        if (bodyStep.when !== undefined) {
          report.errors.push({
            path: `${bodyPath}.when`,
            message: `${stepLabel(bodyStep)}: when is gone; replace it with a condition step after this one`,
          });
        }
        bodyStep.outputs.forEach((output, outputIndex) => {
          checkOutput(bodyStep, output, `${bodyPath}.outputs.${outputIndex}.path`, consumed.has(`${bodyStep.id}\u0000${output.path}`), report, options);
        });
        moduleWarnings(bodyStep, bodyPath, report, options);
        if (mode === "preview") approvalFallbackWarnings(bodyStep, bodyPath, report);
      });
      if (step.require !== undefined) {
        report.errors.push({
          path: `${path}.require`,
          message: `${stepLabel(step)}: require is gone; replace it with a condition step that reads the output`,
        });
      }
      step.outputs.forEach((output, outputIndex) => {
        checkOutput(step, output, `${path}.outputs.${outputIndex}.path`, consumed.has(`${step.id}\u0000${output.path}`), report, options);
      });
      return;
    }

    if (step.require !== undefined) {
      report.errors.push({
        path: `${path}.require`,
        message: `${stepLabel(step)}: require is gone; the engine checks the shape of a file, not its opinion. Replace it with a condition step that reads the output and chooses the route`,
      });
    }
    if (step.when !== undefined) {
      report.errors.push({
        path: `${path}.when`,
        message: `${stepLabel(step)}: when is gone; a step does not decide where the run goes. Replace it with a condition step after this one`,
      });
    }
    if (step.result !== undefined) {
      report.warnings.push({
        path: `${path}.result`,
        message: `${stepLabel(step)}: result no longer declares what a condition reads; remove result and read the step and output with from in a condition instead`,
      });
    }

    if (index > 0 && step.inputs.length === 0) {
      report.warnings.push({
        path: `${path}.inputs`,
        message: `${stepLabel(step)}: it declares no inputs, so the engine delivers an empty input/ folder; a file from an earlier step arrives only through input`,
      });
    }
    step.outputs.forEach((output, outputIndex) => {
      checkOutput(step, output, `${path}.outputs.${outputIndex}.path`, consumed.has(`${step.id}\u0000${output.path}`), report, options);
    });
    instructionWarnings(step, path, report);
    if (mode === "preview") approvalFallbackWarnings(step, path, report);

    if (step.kind === "script") {
      const script = options.scripts?.find((entry) => entry.name === step.run);
      if (script && PARAMETER_IN_ARGV.test(script.content)) {
        report.warnings.push({
          path: `${path}.run`,
          message: `${stepLabel(step)}: ${step.run} reads process.argv, but a Workflow script gets input/params.json and WORKFLOW_STEP_INPUT/WORKFLOW_STEP_OUTPUT, with no arguments; read params.json instead`,
        });
      }
      if (mode === "preflight" && options.missingModules) {
        for (const missing of options.missingModules(step.modules)) {
          report.errors.push({
            path: `${path}.modules`,
            message: `${stepLabel(step)}: ${missing} is declared in modules but is not available on this machine; install it before running`,
          });
        }
      }
      moduleWarnings(step, path, report, options);
    }
  });

  const outputNames = new Set(workflowAllSteps(definition).flatMap((step) => declaredOutputs(step).map((output) => output.path)));
  definition.steps.forEach((step, index) => {
    const steps: readonly WorkflowStep[] = step.kind === "loop" ? step.body : [step];
    steps.forEach((candidate, stepIndex) => {
      if (candidate.kind === "condition" || candidate.kind === "loop") return;
      const path = step.kind === "loop" ? `steps.${index}.body.${stepIndex}` : `steps.${index}`;
      for (const parameter of candidate.parameters) {
        if (parameter.from !== undefined || parameter.collectedBy !== undefined) continue;
        const collision = [...outputNames].find((name) => name === parameter.name || name.split(".")[0] === parameter.name);
        if (collision) {
          report.warnings.push({
            path: `${path}.parameters`,
            message: `${stepLabel(candidate)}: parameter ${JSON.stringify(parameter.name)} has the same name as the output ${JSON.stringify(collision)}; a document travels as a file, and a parameter travels in params.json, never both, so rename one of them`,
          });
        }
      }
    });
  });

  checkParameterOrigins(definition, report);

  return report;
}

type FieldLookup =
  | { kind: "found"; schema: Record<string, unknown> }
  | { kind: "missing" }
  | { kind: "unknown" };

/** A JSON Schema object at the end of a dotted field path: missing when the shape names the
 * object's fields and this one is absent, unknown when the shape does not say. */
function fieldSchema(shape: Record<string, unknown>, field: string): FieldLookup {
  let current: Record<string, unknown> | undefined = shape;
  for (const segment of field.split(".")) {
    if (!current) return { kind: "unknown" };
    const properties = current.properties;
    if (properties === null || typeof properties !== "object" || Array.isArray(properties)) return { kind: "unknown" };
    const next = (properties as Record<string, unknown>)[segment];
    if (next === undefined) {
      return current.additionalProperties === true || (typeof current.additionalProperties === "object")
        ? { kind: "unknown" }
        : { kind: "missing" };
    }
    if (next === null || typeof next !== "object" || Array.isArray(next)) return { kind: "unknown" };
    current = next as Record<string, unknown>;
  }
  return { kind: "found", schema: current };
}

const shapeType = (schema: Record<string, unknown>): string | undefined =>
  typeof schema.type === "string" ? schema.type : Array.isArray(schema.type) ? schema.type.find((entry): entry is string => typeof entry === "string") : undefined;

function shapeTypeReason(parameter: WorkflowParameter, type: string, schema: Record<string, unknown>): string | undefined {
  const agree = "; make the parameter type and the shape agree";
  if (parameter.type === "date") return type === "string" ? undefined : `declares ${type}, and a date travels as text${agree}`;
  if (parameter.type === "number") return type === "number" || type === "integer" ? undefined : `declares ${type}, not a number${agree}`;
  if (parameter.type === "enum") {
    if (type !== "string") return `declares ${type}, and an enum travels as text${agree}`;
    const allowed = Array.isArray(schema.enum) ? schema.enum.filter((entry): entry is string => typeof entry === "string") : undefined;
    if (allowed !== undefined && allowed.length > 0) {
      const outside = (parameter.values ?? []).find((value) => !allowed.includes(value));
      if (outside !== undefined) return `accepts ${allowed.map((value) => JSON.stringify(value)).join(", ")}, which does not include ${JSON.stringify(outside)}${agree}`;
    }
    return undefined;
  }
  return type === parameter.type ? undefined : `declares ${type}, not ${parameter.type}${agree}`;
}

function shapeReason(parameter: WorkflowParameter, shape: Record<string, unknown>, field: string): string | undefined {
  const found = fieldSchema(shape, field);
  if (found.kind === "missing") return `its shape does not declare the field ${JSON.stringify(field)}; declare the field in the shape or read another field`;
  if (found.kind === "unknown") return undefined;
  const schema = found.schema;
  const type = shapeType(schema);
  if (type === undefined) return undefined;
  if (!parameter.list) return shapeTypeReason(parameter, type, schema);
  if (type !== "array") return `declares field ${JSON.stringify(field)} as ${type}, not a list; make the parameter type and the shape agree`;
  const items = schema.items !== null && typeof schema.items === "object" && !Array.isArray(schema.items)
    ? schema.items as Record<string, unknown>
    : undefined;
  const itemType = items ? shapeType(items) : undefined;
  return itemType === undefined ? undefined : shapeTypeReason(parameter, itemType, items ?? {});
}

/** A parameter with `from` reads one field of an earlier `.json` output, so that output needs a
 * shape and the shape must agree with the declared type. The same value never also arrives as a file. */
function checkParameterOrigins(definition: WorkflowDefinition, report: AuthoringReport): void {
  const all = workflowAllSteps(definition);
  const pathOf = (id: string): string => {
    const top = definition.steps.findIndex((step) => step.id === id);
    if (top >= 0) return `steps.${top}`;
    for (const [index, step] of definition.steps.entries()) {
      if (step.kind !== "loop") continue;
      const body = step.body.findIndex((candidate) => candidate.id === id);
      if (body >= 0) return `steps.${index}.body.${body}`;
    }
    return "steps";
  };
  for (const step of all) {
    if (step.kind === "condition" || step.kind === "loop") continue;
    for (const [index, parameter] of step.parameters.entries()) {
      const origin = parameter.from;
      if (origin === undefined) continue;
      const path = `${pathOf(step.id)}.parameters.${index}`;
      const label = `parameter ${JSON.stringify(parameter.name)} in ${stepLabel(step)}`;
      if (origin.output.includes("*")) {
        report.errors.push({ path: `${path}.from.output`, message: `${label}: it reads ${JSON.stringify(origin.output)}, which holds *; a parameter reads an exact output name, so name the exact output` });
        continue;
      }
      if (step.inputs.some((input) => input.from.step === origin.step && input.from.output === origin.output)) {
        report.errors.push({
          path: `${path}.from`,
          message: `${label}: output ${JSON.stringify(origin.output)} of step ${JSON.stringify(origin.step)} already arrives through inputs; a value travels as a document or as a parameter, never both, so keep one origin`,
        });
        continue;
      }
      const source = all.find((candidate) => candidate.id === origin.step);
      const output = source && source.kind !== "condition" ? source.outputs.find((candidate) => candidate.path === origin.output) : undefined;
      if (!output) continue;
      if (output.shape === undefined) {
        report.errors.push({
          path: `${path}.from.output`,
          message: `${label}: it reads ${JSON.stringify(origin.output)}, which needs a shape saying which fields it holds; declare the fields with shape on that output`,
        });
        continue;
      }
      if (!isWorkflowJsonPath(output.path)) {
        report.errors.push({ path: `${path}.from.output`, message: `${label}: it reads ${JSON.stringify(origin.output)}, and a parameter reads a .json output; read a .json output instead` });
        continue;
      }
      const reason = shapeReason(parameter, output.shape, origin.field);
      if (reason) {
        report.errors.push({
          path: `${path}.from.field`,
          message: `${label}: field ${JSON.stringify(origin.field)} of ${JSON.stringify(origin.output)} in step ${JSON.stringify(origin.step)}: ${reason}`,
        });
      }
    }
  }
}

/** The first refusal in a sentence, for the save and create responses. */
export function firstAuthoringError(report: AuthoringReport): string | undefined {
  return report.errors[0]?.message;
}
export function isAuthoringReportOk(report: AuthoringReport): boolean {
  return report.errors.length === 0;
}
