// Where a Workflow run lives on disk. D5/D6: departments sit in the person's
// home, outside the app's data folder, so a teammate's cwd can be shared;
// every step gets its own folder and the engine is the only writer.
import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { hasControlCharacter, WORKFLOW_STEP_MAX } from "../../shared/workflow.ts";

export const WORKFLOWS_ROOT_ENV = "OMB_WORKFLOWS_ROOT";
export const WORKFLOWS_ROOT_NAME = "MimirBot";
export const WORKFLOW_RUN_ID = /^\d{8}-\d{6}-[0-9a-f]{6}$/;
/** `WorkflowDefinition.id` is a UUID; the folder keeps it lowercase so two spellings share one run history. */
export const WORKFLOW_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function isWorkflowRunId(value: string): boolean {
  return WORKFLOW_RUN_ID.test(value);
}

export function isWorkflowId(value: string): boolean {
  return WORKFLOW_ID.test(value);
}

export interface WorkflowsRootOptions {
  home?: string;
  env?: NodeJS.ProcessEnv;
}

/** `~/MimirBot`, or OMB_WORKFLOWS_ROOT for tests and unusual installs. */
export function workflowsRoot(options: WorkflowsRootOptions = {}): string {
  const override = options.env?.[WORKFLOWS_ROOT_ENV]?.trim();
  if (override) return resolve(override);
  return join(options.home ?? homedir(), WORKFLOWS_ROOT_NAME);
}

/** A department's display name kept as its folder when the filesystem takes
 * it; otherwise a slug plus a hash, so two odd names never share a folder. */
export function departmentFolder(department: string): string {
  const raw = department.trim();
  if (raw && raw.length <= 60 && raw !== "." && raw !== ".." && !raw.includes("/") && !raw.includes("\\")
    && !hasControlCharacter(raw) && !/[. ]$/.test(raw) && !WINDOWS_RESERVED.test(raw)) return raw;
  const slug = raw.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "department";
  const hash = createHash("sha256").update(raw).digest("hex").slice(0, 8);
  return `${slug}-${hash}`;
}

/** Sortable, collision-resistant, and safe as a folder name. */
export function newWorkflowRunId(now = Date.now(), suffix: string = randomUUID()): string {
  const stamp = new Date(now).toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const hex = suffix.replace(/[^0-9a-f]/gi, "").toLowerCase().slice(0, 6).padEnd(6, "0");
  return `${stamp}-${hex}`;
}

export interface WorkflowRunPaths {
  runDir: string;
  departmentDir: string;
  workflowDir: string;
  runsDir: string;
}

export function workflowRunPaths(input: {
  department: string;
  workflowId: string;
  runId: string;
  home?: string;
  env?: NodeJS.ProcessEnv;
}): WorkflowRunPaths {
  if (!isWorkflowId(input.workflowId)) throw new Error(`invalid workflow id ${JSON.stringify(input.workflowId)}`);
  if (!isWorkflowRunId(input.runId)) throw new Error(`invalid workflow run id ${JSON.stringify(input.runId)}`);
  const departmentDir = join(workflowsRoot({ home: input.home, env: input.env }), departmentFolder(input.department));
  const workflowDir = join(departmentDir, "workflows", input.workflowId.toLowerCase());
  const runsDir = join(workflowDir, "runs");
  return { departmentDir, workflowDir, runsDir, runDir: join(runsDir, input.runId) };
}

/** D14: one folder per step, numbered from 1 in workflow order. */
export function stepDir(runDir: string, stepNumber: number): string {
  if (!Number.isInteger(stepNumber) || stepNumber < 1 || stepNumber > WORKFLOW_STEP_MAX) {
    throw new Error(`invalid step number ${String(stepNumber)}`);
  }
  return join(runDir, `step-${stepNumber}`);
}

export function stepInputDir(runDir: string, stepNumber: number): string {
  return join(stepDir(runDir, stepNumber), "input");
}

export function stepOutputDir(runDir: string, stepNumber: number): string {
  return join(stepDir(runDir, stepNumber), "output");
}
