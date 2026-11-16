import type { WorkflowDefinition, WorkflowParameter, WorkflowStep } from "../../shared/workflow";

const stepParameters = (step: WorkflowStep): readonly WorkflowParameter[] => {
  if (step.kind === "condition") return [];
  if (step.kind === "loop") return step.body.flatMap((body) => body.kind === "condition" ? [] : body.parameters);
  return step.parameters;
};

const unique = (parameters: readonly WorkflowParameter[]): WorkflowParameter[] => {
  const seen = new Set<string>();
  return parameters.filter((parameter) => {
    if (seen.has(parameter.name)) return false;
    seen.add(parameter.name);
    return true;
  });
};

/** The values a run takes at the start: a parameter with an origin is never typed on this screen. */
export function startParameters(definition: WorkflowDefinition): WorkflowParameter[] {
  return unique(definition.steps
    .flatMap((step) => stepParameters(step))
    .filter((parameter) => parameter.from === undefined && parameter.collectedBy === undefined));
}

/** The values one manual step asks the person for. */
export function stepCollectedParameters(definition: WorkflowDefinition, stepId: string): WorkflowParameter[] {
  return unique(definition.steps
    .flatMap((step) => stepParameters(step))
    .filter((parameter) => parameter.collectedBy === stepId));
}

export type ParameterFormValues = Record<string, string>;

export function parameterLabel(parameter: WorkflowParameter): string {
  const type = parameter.list ? `list[${parameter.type}]` : parameter.type;
  return `${parameter.name} · ${type}`;
}

function scalarValue(parameter: WorkflowParameter, raw: string): unknown {
  const text = raw.trim();
  if (parameter.type === "boolean") return text === "true" || text === "on" || text === "1";
  if (parameter.type === "number" || parameter.type === "integer") {
    const value = Number(text);
    return Number.isFinite(value) ? value : text;
  }
  return text;
}

/** A blank field is left out, so the server names it as missing instead of receiving an empty string. */
export function parameterValues(parameters: readonly WorkflowParameter[], values: ParameterFormValues): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const parameter of parameters) {
    const raw = values[parameter.name];
    if (raw === undefined || raw.trim() === "") continue;
    payload[parameter.name] = parameter.list
      ? raw.split(",").map((entry) => scalarValue(parameter, entry)).filter((entry) => entry !== "")
      : scalarValue(parameter, raw);
  }
  return payload;
}

/** What a refused start or continue says, from the API's own `missing`/`invalid`/`unknown`/`allowed`. */
export function inputRefusal(body: Record<string, unknown> | undefined): string[] {
  if (!body) return [];
  const missing = Array.isArray(body.missing)
    ? body.missing.flatMap((entry) => entry && typeof entry === "object" && "name" in entry ? [String((entry as { name: unknown }).name)] : [])
    : [];
  const invalid = Array.isArray(body.invalid)
    ? body.invalid.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const row = entry as { name?: unknown; reason?: unknown };
      return row.name === undefined ? [] : [`${String(row.name)} (${String(row.reason ?? "invalid")})`];
    })
    : [];
  const unknown = Array.isArray(body.unknown) ? body.unknown.map(String) : [];
  const allowed = Array.isArray(body.allowed) ? body.allowed.map(String) : [];
  const lines: string[] = [];
  if (missing.length > 0) lines.push(`missing: ${missing.join(", ")}`);
  if (invalid.length > 0) lines.push(`invalid: ${invalid.join(", ")}`);
  if (unknown.length > 0) lines.push(`unknown: ${unknown.join(", ")}`);
  lines.push(allowed.length > 0 ? `allowed: ${allowed.join(", ")}` : "this Workflow takes no inputs at the start");
  return lines;
}
