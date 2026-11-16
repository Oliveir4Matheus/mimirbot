// Parameters are declared by the step that reads them. The run receives one
// flat map for the values supplied at the start; a value that is born later has
// a declared origin and is checked when that origin becomes available.
import { resultField, type WorkflowDefinition, type WorkflowParameter, type WorkflowStep } from "../../shared/workflow.ts";

export interface ParameterIssue {
  step: string;
  name: string;
  reason?: string;
}

export interface ParameterFailure {
  status: "needs_input";
  missing: ParameterIssue[];
  invalid: ParameterIssue[];
  unknown: string[];
  allowed: string[];
}

export type WorkflowInputs = Record<string, unknown>;

export type ParameterValidation =
  | { ok: true; values: WorkflowInputs }
  | { ok: false; failure: ParameterFailure };

export type ParameterResolution =
  | { ok: true; values: WorkflowInputs }
  | { ok: false; error: string };

interface Declaration {
  step: string;
  stepId: string;
  parameter: WorkflowParameter;
}

const ISSUE_DATE = /^\d{4}-\d{2}-\d{2}$/;

function declarations(definition: WorkflowDefinition): Declaration[] {
  const list: Declaration[] = [];
  const visit = (step: WorkflowStep): void => {
    if (step.kind === "condition") return;
    if (step.kind === "loop") {
      for (const body of step.body) visit(body);
      return;
    }
    for (const parameter of step.parameters ?? []) list.push({ step: step.name, stepId: step.id, parameter });
  };
  for (const step of definition.steps) visit(step);
  return list;
}

/** The parameters a run must supply at the start: the ones without a declared origin. */
export function workflowStartParameters(definition: WorkflowDefinition): WorkflowParameter[] {
  const seen = new Set<string>();
  const list: WorkflowParameter[] = [];
  for (const entry of declarations(definition)) {
    if (entry.parameter.from !== undefined || entry.parameter.collectedBy !== undefined) continue;
    if (seen.has(entry.parameter.name)) continue;
    seen.add(entry.parameter.name);
    list.push(entry.parameter);
  }
  return list;
}

/** Every parameter name a run may supply at the start, in declaration order. */
export function workflowParameterNames(definition: WorkflowDefinition): string[] {
  return workflowStartParameters(definition).map((parameter) => parameter.name);
}

/** The parameters one manual step collects from the person, by name. */
export function collectedParameters(definition: WorkflowDefinition, stepId: string): WorkflowParameter[] {
  const seen = new Set<string>();
  const list: WorkflowParameter[] = [];
  for (const entry of declarations(definition)) {
    if (entry.parameter.collectedBy !== stepId || seen.has(entry.parameter.name)) continue;
    seen.add(entry.parameter.name);
    list.push(entry.parameter);
  }
  return list;
}

/** The parameters a single step receives in `params.json`, in declaration order. */
export function workflowStepParameterNames(definition: WorkflowDefinition, stepId: string): string[] {
  return declarations(definition).filter((entry) => entry.stepId === stepId).map((entry) => entry.parameter.name);
}

function validDate(value: string): boolean {
  if (!ISSUE_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
}

function scalarReason(type: WorkflowParameter["type"], values: readonly string[], value: unknown): string | undefined {
  switch (type) {
    case "string":
      return typeof value === "string" ? undefined : "must be text";
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? undefined : "must be a number";
    case "integer":
      return typeof value === "number" && Number.isInteger(value) ? undefined : "must be an integer";
    case "boolean":
      return typeof value === "boolean" ? undefined : "must be true or false";
    case "date":
      return typeof value === "string" && validDate(value) ? undefined : "must be a date as YYYY-MM-DD";
    case "enum":
      return typeof value === "string" && values.includes(value)
        ? undefined
        : `must be one of ${values.join(", ")}`;
  }
}

/** Why a value cannot be the parameter: absent means it fits. A `list` parameter holds only scalars. */
export function parameterReason(parameter: WorkflowParameter, value: unknown): string | undefined {
  if (!parameter.list) return scalarReason(parameter.type, parameter.values ?? [], value);
  if (!Array.isArray(value)) return `must be a list of ${parameter.type}`;
  for (const item of value) {
    const reason = scalarReason(parameter.type, parameter.values ?? [], item);
    if (reason) return `every item ${reason}`;
  }
  return undefined;
}

/** Validates the flat map against the parameters the start supplies. A parameter with an origin
 * is never supplied here: it is checked when its source becomes available. */
export function validateWorkflowInputs(definition: WorkflowDefinition, inputs: WorkflowInputs = {}): ParameterValidation {
  const all = declarations(definition);
  const start = workflowStartParameters(definition);
  const allowed = start.map((parameter) => parameter.name);
  const missing: ParameterIssue[] = [];
  const invalid: ParameterIssue[] = [];
  const byName = new Map<string, Declaration[]>();
  for (const entry of all) {
    const list = byName.get(entry.parameter.name) ?? [];
    list.push(entry);
    byName.set(entry.parameter.name, list);
  }
  const startNames = new Set(allowed);
  for (const [name, list] of byName) {
    const first = list[0]!;
    for (const entry of list.slice(1)) {
      if (entry.parameter.type !== first.parameter.type
        || entry.parameter.list !== first.parameter.list
        || JSON.stringify(entry.parameter.values ?? []) !== JSON.stringify(first.parameter.values ?? [])) {
        invalid.push({ step: entry.step, name, reason: `conflicts with the declaration in ${first.step}` });
      }
    }
    if (!startNames.has(name)) continue;
    if (!Object.hasOwn(inputs, name)) {
      if (first.parameter.required) missing.push({ step: first.step, name });
      continue;
    }
    const reason = parameterReason(first.parameter, inputs[name]);
    if (reason) invalid.push({ step: first.step, name, reason });
  }
  const unknown = Object.keys(inputs).filter((name) => !startNames.has(name));
  if (missing.length > 0 || invalid.length > 0 || unknown.length > 0) {
    return { ok: false, failure: { status: "needs_input", missing, invalid, unknown, allowed } };
  }
  return { ok: true, values: Object.fromEntries(Object.entries(inputs)) };
}

/** The answers a person gives when continuing a manual step, checked against that step's collected fields. */
export function validateCollectedInputs(
  definition: WorkflowDefinition,
  stepId: string,
  inputs: WorkflowInputs = {},
): ParameterValidation {
  const collected = collectedParameters(definition, stepId);
  const allowed = collected.map((parameter) => parameter.name);
  const allowedNames = new Set(allowed);
  const stepName = declarations(definition).find((entry) => entry.parameter.collectedBy === stepId)?.step ?? stepId;
  const missing: ParameterIssue[] = [];
  const invalid: ParameterIssue[] = [];
  for (const parameter of collected) {
    if (!Object.hasOwn(inputs, parameter.name)) {
      if (parameter.required) missing.push({ step: stepName, name: parameter.name });
      continue;
    }
    const reason = parameterReason(parameter, inputs[parameter.name]);
    if (reason) invalid.push({ step: stepName, name: parameter.name, reason });
  }
  const unknown = Object.keys(inputs).filter((name) => !allowedNames.has(name));
  if (missing.length > 0 || invalid.length > 0 || unknown.length > 0) {
    return { ok: false, failure: { status: "needs_input", missing, invalid, unknown, allowed } };
  }
  return { ok: true, values: Object.fromEntries(collected.filter((parameter) => Object.hasOwn(inputs, parameter.name)).map((parameter) => [parameter.name, inputs[parameter.name]])) };
}

/** Reads the values a step declares with `from`, plus the values already in the run.
 * A failure names the step, the output and the field, so the consumer's failure is readable. */
export function resolveStepParameters(
  step: { name: string; parameters?: readonly WorkflowParameter[] },
  inputs: WorkflowInputs,
  readSource: (stepId: string, output: string) => { ok: true; value: unknown } | { ok: false; error: string },
): ParameterResolution {
  const declared = step.parameters ?? [];
  const values: WorkflowInputs = {};
  for (const parameter of declared) {
    if (parameter.from !== undefined) continue;
    if (Object.hasOwn(inputs, parameter.name)) values[parameter.name] = inputs[parameter.name];
  }
  for (const parameter of declared) {
    const origin = parameter.from;
    if (origin === undefined) continue;
    const read = readSource(origin.step, origin.output);
    if (!read.ok) {
      return { ok: false, error: `parameter ${JSON.stringify(parameter.name)} in step ${JSON.stringify(step.name)} could not read step ${JSON.stringify(origin.step)} output ${JSON.stringify(origin.output)}: ${read.error}` };
    }
    const field = resultField(read.value, origin.field);
    if (!field.found) {
      return { ok: false, error: `parameter ${JSON.stringify(parameter.name)} in step ${JSON.stringify(step.name)}: field ${JSON.stringify(origin.field)} is missing from step ${JSON.stringify(origin.step)} output ${JSON.stringify(origin.output)}` };
    }
    const reason = parameterReason(parameter, field.value);
    if (reason) {
      return { ok: false, error: `parameter ${JSON.stringify(parameter.name)} in step ${JSON.stringify(step.name)}: field ${JSON.stringify(origin.field)} of step ${JSON.stringify(origin.step)} output ${JSON.stringify(origin.output)} ${reason}` };
    }
    values[parameter.name] = field.value;
  }
  return { ok: true, values };
}

/** The subset one step sees from the run's own values; a declared origin supplies the rest. */
export function stepParameterValues(definition: WorkflowDefinition, stepId: string, inputs: WorkflowInputs = {}): WorkflowInputs {
  const names = workflowStepParameterNames(definition, stepId);
  const origins = new Set(declarations(definition)
    .filter((entry) => entry.stepId === stepId && entry.parameter.from !== undefined)
    .map((entry) => entry.parameter.name));
  return Object.fromEntries(names.filter((name) => !origins.has(name) && Object.hasOwn(inputs, name)).map((name) => [name, inputs[name]]));
}
