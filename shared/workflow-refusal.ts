// The refusal contract shared by the Workflow routes and every bot tool that
// saves or creates a definition. A 4xx body names one code, keeps a readable
// `error` for callers that only read text, and, for authoring, carries every
// issue with the same dotted path the validator used. A tool parses this body
// instead of forwarding raw JSON, so the model receives the problems and what
// to correct in each one.
import type { AuthoringIssue } from "./workflow-authoring.ts";

export type WorkflowRefusalCode = "authoringErrors" | "needsConfirmation" | "needsAcknowledgement";

/** How many issues one refusal carries; the rest are counted in `truncated`. */
export const WORKFLOW_REFUSAL_ISSUES_MAX = 50;

export interface WorkflowRefusalAuthoring {
  errors: AuthoringIssue[];
  warnings: AuthoringIssue[];
  /** Issues the cap left out of `errors`; `error` says how many. */
  truncated?: number;
}

/** The body of a refused save or create, and what the creating tool reads. */
export interface WorkflowRefusal {
  code: WorkflowRefusalCode;
  /** The readable summary, for a caller that only reads text. */
  error: string;
  authoring?: WorkflowRefusalAuthoring;
}

const REFUSAL_CODES: ReadonlySet<string> = new Set<WorkflowRefusalCode>([
  "authoringErrors",
  "needsConfirmation",
  "needsAcknowledgement",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isIssue = (value: unknown): value is AuthoringIssue =>
  isRecord(value) && typeof value.path === "string" && typeof value.message === "string";

/** A refusal that carries the authoring report, capped, with the count left out. */
export function authoringRefusal(
  errors: readonly AuthoringIssue[],
  warnings: readonly AuthoringIssue[] = [],
): WorkflowRefusal {
  const shown = errors.slice(0, WORKFLOW_REFUSAL_ISSUES_MAX);
  const truncated = errors.length - shown.length;
  const summary = shown.map((issue) => issue.path ? `${issue.path}: ${issue.message}` : issue.message).join("; ") || "the definition is refused";
  return {
    code: "authoringErrors",
    error: truncated > 0 ? `${summary}; ${truncated} more problems were not shown` : summary,
    authoring: { errors: shown, warnings: [...warnings], ...(truncated > 0 ? { truncated } : {}) },
  };
}

/** A refusal without an authoring report: a gate, or a refusal the validator reported as one line. */
export function workflowRefusal(code: WorkflowRefusalCode, error: string): WorkflowRefusal {
  return { code, error };
}

/** Reads a 4xx body as a refusal; undefined when it does not follow the contract. */
export function parseWorkflowRefusal(body: unknown): WorkflowRefusal | undefined {
  if (!isRecord(body)) return undefined;
  const code = body.code;
  if (typeof code !== "string" || !REFUSAL_CODES.has(code)) return undefined;
  if (typeof body.error !== "string") return undefined;
  if (body.authoring === undefined) return { code: code as WorkflowRefusalCode, error: body.error };
  const authoring = body.authoring;
  if (!isRecord(authoring)) return undefined;
  if (!Array.isArray(authoring.errors) || !Array.isArray(authoring.warnings)) return undefined;
  if (!authoring.errors.every(isIssue) || !authoring.warnings.every(isIssue)) return undefined;
  const truncated = authoring.truncated;
  if (truncated !== undefined && (typeof truncated !== "number" || !Number.isSafeInteger(truncated) || truncated < 0)) return undefined;
  return {
    code: code as WorkflowRefusalCode,
    error: body.error,
    authoring: {
      errors: authoring.errors,
      warnings: authoring.warnings,
      ...(truncated === undefined ? {} : { truncated }),
    },
  };
}
