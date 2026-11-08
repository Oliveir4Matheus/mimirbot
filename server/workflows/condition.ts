// A condition step reads one value out of the source step's result.json and
// answers true or false. It never evaluates free-form expressions: the
// operator is a closed list, so the answer is the same on every run.
import { resultField, sameJsonValue, type ConditionOp } from "../../shared/workflow.ts";

export type ConditionOutcome = { ok: true; match: boolean } | { ok: false; error: string };

const number = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

export function evaluateCondition(result: unknown, op: ConditionOp, field: string, value: unknown): ConditionOutcome {
  const { found, value: actual } = resultField(result, field);
  if (op === "exists") return { ok: true, match: found && actual !== null && actual !== undefined };
  if (op === "equals") return { ok: true, match: found && sameJsonValue(actual, value) };
  if (op === "not_equals") return { ok: true, match: !found || !sameJsonValue(actual, value) };
  if (op === "contains") {
    if (!found) return { ok: true, match: false };
    if (typeof actual === "string") return { ok: true, match: typeof value === "string" && actual.includes(value) };
    if (Array.isArray(actual)) return { ok: true, match: actual.some((item) => sameJsonValue(item, value)) };
    return { ok: false, error: `the field ${JSON.stringify(field)} is neither text nor a list` };
  }
  if (!found) return { ok: true, match: false };
  const left = number(actual);
  const right = number(value);
  if (left === undefined || right === undefined) {
    return { ok: false, error: `the ${op} operator needs two numbers; ${JSON.stringify(field)} is ${JSON.stringify(actual)}` };
  }
  const match = op === "gt" ? left > right
    : op === "gte" ? left >= right
      : op === "lt" ? left < right
        : left <= right;
  return { ok: true, match };
}
