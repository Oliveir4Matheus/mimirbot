// Parameters are declared by the step that reads them. The run receives one
// flat map; a name declared by two steps is the same value. Validation happens
// before the run folder is created, so a missing field never leaves a half run.
import type { WorkflowDefinition, WorkflowParameter, WorkflowStep } from "../../shared/workflow.ts";

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

/** Every parameter name the run may supply, in declaration order. */
export function workflowParameterNames(definition: WorkflowDefinition): string[] {
  return [...new Set(declarations(definition).map((entry) => entry.parameter.name))];
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

function reasonFor(parameter: WorkflowParameter, value: unknown): string | undefined {
  switch (parameter.type) {
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
      return typeof value === "string" && (parameter.values ?? []).includes(value)
        ? undefined
        : `must be one of ${(parameter.values ?? []).join(", ")}`;
  }
}

/** Validates the flat map against the union of every step's declarations. */
export function validateWorkflowInputs(definition: WorkflowDefinition, inputs: WorkflowInputs = {}): ParameterValidation {
  const all = declarations(definition);
  const allowed = workflowParameterNames(definition);
  const missing: ParameterIssue[] = [];
  const invalid: ParameterIssue[] = [];
  const byName = new Map<string, Declaration[]>();
  for (const entry of all) {
    const list = byName.get(entry.parameter.name) ?? [];
    list.push(entry);
    byName.set(entry.parameter.name, list);
  }
  for (const [name, list] of byName) {
    const first = list[0]!;
    for (const entry of list.slice(1)) {
      if (entry.parameter.type !== first.parameter.type
        || JSON.stringify(entry.parameter.values ?? []) !== JSON.stringify(first.parameter.values ?? [])) {
        invalid.push({ step: entry.step, name, reason: `conflicts with the declaration in ${first.step}` });
      }
    }
    if (!Object.hasOwn(inputs, name)) {
      if (first.parameter.required) missing.push({ step: first.step, name });
      continue;
    }
    const reason = reasonFor(first.parameter, inputs[name]);
    if (reason) invalid.push({ step: first.step, name, reason });
  }
  const unknown = Object.keys(inputs).filter((name) => !byName.has(name));
  if (missing.length > 0 || invalid.length > 0 || unknown.length > 0) {
    return { ok: false, failure: { status: "needs_input", missing, invalid, unknown, allowed } };
  }
  return { ok: true, values: Object.fromEntries(Object.entries(inputs)) };
}

/** The subset one step sees; an absent optional field is simply not written. */
export function stepParameterValues(definition: WorkflowDefinition, stepId: string, inputs: WorkflowInputs = {}): WorkflowInputs {
  const names = workflowStepParameterNames(definition, stepId);
  return Object.fromEntries(names.filter((name) => Object.hasOwn(inputs, name)).map((name) => [name, inputs[name]]));
}
