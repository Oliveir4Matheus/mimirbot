// Runs a saved Skill Burger without the AI: each step exactly as it was recorded, a command in the bot's box or a file
// inside the conversation's folder, with values piped from earlier steps and args filled from the request. A run stops
// at the first failed step; each step has a time limit and an output cap.
import type { Workflow, WorkflowRef, WorkflowStep } from "../../shared/skill-burger/format.ts";
import { redactSecretsInText } from "../../shared/redact.ts";

export const STEP_TIMEOUT_MS = 60_000;
export const OUTPUT_MAX_BYTES = 512 * 1024;
const ERROR_MAX = 400;

export type StepState = "done" | "failed" | "skipped";

/** What a step left for later steps, and how it went. */
export interface StepResult {
  id: string;
  label: string;
  state: StepState;
  output?: unknown;
  error?: string;
}

export interface RunResult {
  ok: boolean;
  steps: StepResult[];
  output?: unknown;
  error?: { type: "step_failed" | "timeout" | "output_too_large" | "runtime_error"; message: string; step?: string };
}

export type ExecResult = { ok: true; output: unknown } | { ok: false; error: string; tooLarge?: true };

export interface StepExecutors {
  shell(input: { command: string; cwd?: string; env: Record<string, string>; stdin?: string; signal: AbortSignal; maxBytes: number }): Promise<ExecResult>;
  file(input: { path: string; content: string; signal: AbortSignal }): Promise<ExecResult>;
}

export interface RunDeps {
  exec: StepExecutors;
  signal?: AbortSignal;
  now?: () => number;
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** The value at a dotted path ("data.items.0.id") of `value`. */
export function valueAt(value: unknown, path: string | undefined): unknown {
  if (!path) return value;
  let current = value;
  for (const part of path.split(".")) {
    if (Array.isArray(current)) current = current[Number(part)];
    else if (isRecord(current)) current = current[part];
    else return undefined;
  }
  return current;
}

const isRef = (value: unknown): value is WorkflowRef => isRecord(value) && (typeof value.$arg === "string" || typeof value.$step === "string") && Object.keys(value).every((key) => key === "$arg" || key === "$step" || key === "path");

/** `node` with every reference filled in: args from the run's args, steps from what earlier steps left. */
export function resolve(node: unknown, args: Record<string, unknown>, results: Record<string, StepResult>): unknown {
  if (isRef(node)) return "$arg" in node ? args[node.$arg] : valueAt(results[node.$step]?.output, node.path);
  if (Array.isArray(node)) return node.map((item) => resolve(item, args, results));
  if (isRecord(node)) return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, resolve(value, args, results)]));
  return node;
}

const asText = (value: unknown): string => (value === undefined || value === null ? "" : typeof value === "string" ? value : JSON.stringify(value));

function compare(left: unknown, op: string, right: unknown): boolean {
  switch (op) {
    case "exists": return left !== undefined && left !== null && left !== "" && !(Array.isArray(left) && left.length === 0);
    case "eq": return asText(left) === asText(right);
    case "ne": return asText(left) !== asText(right);
    case "gt": return Number(left) > Number(right);
    case "lt": return Number(left) < Number(right);
    default: return false;
  }
}

type Condition = NonNullable<WorkflowStep["when"]>;
const holds = (when: Condition, results: Record<string, StepResult>) => compare(valueAt(results[when.$step]?.output, when.path), when.op, when.value);

/** The args a run uses: the defaults it was saved with, then what the caller filled in from the request. */
export function runArgs(workflow: Workflow, given: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, arg] of Object.entries(workflow.args)) if (arg.default !== undefined) out[name] = arg.default;
  for (const [name, value] of Object.entries(given)) if (Object.hasOwn(workflow.args, name)) out[name] = value;
  return out;
}

/** OMB_ARG_<NAME> for each arg, so a command reads its inputs without any text being spliced into it. */
export function argEnv(args: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(args).map(([name, value]) => [`OMB_ARG_${name.toUpperCase()}`, asText(value)]));
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function parsed(output: unknown): unknown {
  if (typeof output !== "string") return output;
  const trimmed = output.trim();
  if (!/^[[{]/.test(trimmed)) return output;
  try { return JSON.parse(trimmed); } catch { return output; }
}

/** Waits for `run` up to `ms`, aborting what it was given when the time is up. */
async function timed(ms: number, outer: AbortSignal | undefined, run: (signal: AbortSignal) => Promise<ExecResult>): Promise<ExecResult | "timeout"> {
  const controller = new AbortController();
  const stop = () => controller.abort();
  outer?.addEventListener("abort", stop, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(controller.signal),
      new Promise<"timeout">((done) => { timer = setTimeout(() => { controller.abort(); done("timeout"); }, ms); }),
    ]);
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", stop);
  }
}

/** Runs `workflow` from its first step, in order, until it ends or a step fails. */
export async function runWorkflow(input: { workflow: Workflow; args?: Record<string, unknown> }, deps: RunDeps): Promise<RunResult> {
  const { workflow } = input;
  const args = runArgs(workflow, input.args);
  const results: Record<string, StepResult> = {};
  const steps: StepResult[] = [];
  const end = (step: WorkflowStep, result: Omit<StepResult, "id" | "label">) => {
    const row: StepResult = { id: step.id, label: step.label, ...result };
    results[step.id] = row;
    steps.push(row);
    return row;
  };
  for (const step of workflow.steps) {
    if (deps.signal?.aborted) return { ok: false, steps, error: { type: "runtime_error", message: "The run was stopped.", step: step.id } };
    if (step.when && !holds(step.when, results)) {
      end(step, { state: "skipped" });
      continue;
    }
    const outcome = await timed(STEP_TIMEOUT_MS, deps.signal, (signal) => execute(step, args, results, deps.exec, signal));
    if (outcome === "timeout") {
      end(step, { state: "failed", error: "timed out" });
      return { ok: false, steps, error: { type: "timeout", message: `"${step.label}" took longer than ${Math.round(STEP_TIMEOUT_MS / 1000)} s and was stopped.`, step: step.id } };
    }
    if (!outcome.ok) {
      const message = clip(redactSecretsInText(outcome.error), ERROR_MAX);
      end(step, { state: "failed", error: message });
      return { ok: false, steps, error: { type: outcome.tooLarge ? "output_too_large" : "step_failed", message: `"${step.label}" failed: ${message}`, step: step.id } };
    }
    end(step, { state: "done", output: parsed(outcome.output) });
  }
  const last = [...workflow.steps].reverse().find((step) => results[step.id]?.state === "done" && results[step.id]?.output !== undefined);
  return { ok: true, steps, ...(last ? { output: results[last.id]!.output } : {}) };
}

async function execute(step: WorkflowStep, args: Record<string, unknown>, results: Record<string, StepResult>, exec: StepExecutors, signal: AbortSignal): Promise<ExecResult> {
  switch (step.kind) {
    case "shell": {
      const stdin = step.stdin ? asText(resolve(step.stdin, args, results)) : undefined;
      return exec.shell({ command: step.run, ...(step.cwd ? { cwd: step.cwd } : {}), env: argEnv(args), ...(stdin !== undefined ? { stdin } : {}), signal, maxBytes: OUTPUT_MAX_BYTES });
    }
    case "file":
      return exec.file({ path: step.path, content: asText(resolve(step.content, args, results)), signal });
    default:
      return { ok: false, error: "this step's kind can't run here" };
  }
}
