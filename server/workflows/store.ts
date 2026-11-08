// Definitions and runs on disk. `workflows.json` lives in the app's data dir,
// so a workspace backup carries the recipes; each run's `run.json` lives in
// its own folder under ~/MimirBot and is the only state the engine trusts.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import {
  WORKFLOW_RETENTION_DEFAULT_DAYS,
  workflowDefinitionSchema,
  workflowRunSchema,
  type WorkflowDefinition,
  type WorkflowRun,
} from "../../shared/workflow.ts";
import { writeFileAtomic } from "../atomic.ts";
import { prepareRunDirectories } from "./files.ts";
import { isWorkflowId, isWorkflowRunId, newWorkflowRunId, workflowRunPaths, workflowsRoot, stepDir } from "./paths.ts";
import { createRun } from "./state.ts";

export interface WorkflowStoreOptions {
  dataDir: string;
  home?: string;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  log?: (line: string) => void;
}

export type WorkflowSave = { ok: true; workflow: WorkflowDefinition } | { ok: false; error: string };

export interface WorkflowRunFilter {
  workflowId?: string;
  department?: string;
  limit?: number;
}

export interface WorkflowStore {
  readonly file: string;
  /** The latest version of every workflow, in the order they were first saved. */
  workflows(): WorkflowDefinition[];
  workflow(id: string, version?: number): WorkflowDefinition | undefined;
  versions(id: string): WorkflowDefinition[];
  saveWorkflow(input: unknown): WorkflowSave;
  removeWorkflow(id: string): boolean;
  createRun(definition: WorkflowDefinition, options?: { requestedBy?: WorkflowRun["requestedBy"]; triggeredBy?: WorkflowRun["triggeredBy"] }): WorkflowRun;
  readRun(runId: string): WorkflowRun | undefined;
  writeRun(run: WorkflowRun): void;
  listRuns(filter?: WorkflowRunFilter): WorkflowRun[];
  deleteRun(runId: string): boolean;
  runDir(run: WorkflowRun): string;
  stepFolder(run: WorkflowRun, index: number): string;
  retentionDays(workflowId: string): number;
}

const RUNS_SHOWN = 200;
const RUN_ID_ATTEMPTS = 5;

const reason = (error: unknown): string => error instanceof SyntaxError ? "invalid JSON" : error instanceof Error ? error.message : String(error);

function subdirectories(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => join(dir, entry.name));
  } catch {
    return [];
  }
}

const comparable = (definition: WorkflowDefinition): string => JSON.stringify({ ...definition, version: 0, createdAt: 0, updatedAt: 0 });

export function createWorkflowStore(options: WorkflowStoreOptions): WorkflowStore {
  const file = join(options.dataDir, "workflows.json");
  const now = options.now ?? Date.now;
  const log = options.log ?? ((line: string) => console.warn(line));
  const home = options.home;
  const env = options.env ?? process.env;
  let definitions: WorkflowDefinition[] = [];
  let unreadable = false;

  try {
    const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new Error("invalid workflows file");
    const list = (raw as { workflows?: unknown }).workflows;
    if (!Array.isArray(list)) throw new Error("invalid workflows file: workflows is not a list");
    for (const entry of list) {
      const parsed = workflowDefinitionSchema.safeParse(entry);
      if (parsed.success) definitions.push({ ...parsed.data, id: parsed.data.id.toLowerCase() });
      else log(`workflows: ignoring an invalid definition in ${file}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      unreadable = true;
      log(`workflows: ignoring unreadable ${file}: ${reason(error)}`);
    }
  }

  const persist = (): void => {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    writeFileAtomic(file, JSON.stringify({ version: 1, workflows: definitions }, null, 2), { mode: 0o600 });
  };

  const versionsOf = (id: string): WorkflowDefinition[] => definitions.filter((candidate) => candidate.id === id.toLowerCase());

  const latestOf = (id: string): WorkflowDefinition | undefined => versionsOf(id)
    .reduce<WorkflowDefinition | undefined>((best, candidate) => !best || candidate.version > best.version ? candidate : best, undefined);

  const pathsOf = (run: Pick<WorkflowRun, "id" | "workflowId" | "department">) =>
    workflowRunPaths({ department: run.department, workflowId: run.workflowId, runId: run.id, home, env });

  const runFiles = (): string[] => {
    const files: string[] = [];
    for (const departmentDir of subdirectories(workflowsRoot({ home, env }))) {
      for (const workflowDir of subdirectories(join(departmentDir, "workflows"))) {
        if (!isWorkflowId(basename(workflowDir))) continue;
        for (const runDir of subdirectories(join(workflowDir, "runs"))) {
          if (!isWorkflowRunId(basename(runDir))) continue;
          files.push(join(runDir, "run.json"));
        }
      }
    }
    return files;
  };

  const readRunFile = (path: string): WorkflowRun | undefined => {
    try {
      const parsed = workflowRunSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
      if (!parsed.success) {
        log(`workflows: ignoring an invalid run at ${path}`);
        return undefined;
      }
      return parsed.data;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") log(`workflows: could not read ${path}: ${reason(error)}`);
      return undefined;
    }
  };

  const findRunFile = (runId: string): string | undefined =>
    runFiles().find((path) => basename(dirname(path)) === runId);

  const writeRun = (run: WorkflowRun): void => {
    const parsed = workflowRunSchema.parse(run);
    const dir = pathsOf(parsed).runDir;
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileAtomic(join(dir, "run.json"), JSON.stringify(parsed, null, 2), { mode: 0o600 });
  };

  return {
    file,
    workflows() {
      const latest = new Map<string, WorkflowDefinition>();
      for (const definition of definitions) {
        const current = latest.get(definition.id);
        if (!current || definition.version > current.version) latest.set(definition.id, definition);
      }
      return [...latest.values()];
    },
    workflow(id, version) {
      const list = versionsOf(id);
      if (version !== undefined) return list.find((candidate) => candidate.version === version);
      return latestOf(id);
    },
    versions(id) {
      return [...versionsOf(id)].sort((left, right) => left.version - right.version);
    },
    saveWorkflow(input) {
      if (unreadable) return { ok: false, error: `workflows.json is unreadable; fix or remove ${file}` };
      if (input === null || typeof input !== "object" || Array.isArray(input)) {
        return { ok: false, error: "a Workflow must be a JSON object" };
      }
      const stamp = now();
      const draft: Record<string, unknown> = { ...(input as Record<string, unknown>) };
      draft.createdAt ??= stamp;
      draft.updatedAt = stamp;
      draft.version ??= 1;
      const parsed = workflowDefinitionSchema.safeParse(draft);
      if (!parsed.success) {
        return { ok: false, error: parsed.error.issues.map((issue) => `${issue.path.join(".") || "workflow"}: ${issue.message}`).join("; ") };
      }
      const id = parsed.data.id.toLowerCase();
      const existing = latestOf(id);
      const normalized: WorkflowDefinition = { ...parsed.data, id };
      if (existing && comparable(existing) === comparable(normalized)) return { ok: true, workflow: existing };
      const version = existing ? Math.max(...versionsOf(id).map((candidate) => candidate.version)) + 1 : normalized.version;
      const saved: WorkflowDefinition = { ...normalized, version, createdAt: existing?.createdAt ?? normalized.createdAt, updatedAt: stamp };
      definitions.push(saved);
      try {
        persist();
      } catch (error) {
        definitions.pop();
        return { ok: false, error: `could not save ${file}: ${reason(error)}` };
      }
      return { ok: true, workflow: saved };
    },
    removeWorkflow(id) {
      if (!isWorkflowId(id)) return false;
      const before = definitions.length;
      definitions = definitions.filter((candidate) => candidate.id !== id.toLowerCase());
      if (definitions.length === before) return false;
      persist();
      return true;
    },
    createRun(definition, runOptions) {
      const stamp = now();
      let runId = newWorkflowRunId(stamp);
      let paths = workflowRunPaths({ department: definition.department, workflowId: definition.id, runId, home, env });
      for (let attempt = 1; attempt < RUN_ID_ATTEMPTS && existsSync(paths.runDir); attempt += 1) {
        runId = newWorkflowRunId(now());
        paths = workflowRunPaths({ department: definition.department, workflowId: definition.id, runId, home, env });
      }
      mkdirSync(paths.runDir, { recursive: true, mode: 0o700 });
      prepareRunDirectories(paths.runDir, definition.steps.length);
      const run = createRun({ definition, runId, now: stamp, requestedBy: runOptions?.requestedBy, triggeredBy: runOptions?.triggeredBy });
      writeRun(run);
      return run;
    },
    readRun(runId) {
      if (!isWorkflowRunId(runId)) return undefined;
      const path = findRunFile(runId);
      return path ? readRunFile(path) : undefined;
    },
    writeRun,
    listRuns(filter = {}) {
      const workflowId = filter.workflowId?.toLowerCase();
      const runs = runFiles()
        .map(readRunFile)
        .filter((run): run is WorkflowRun => run !== undefined)
        .filter((run) => (workflowId === undefined || run.workflowId === workflowId)
          && (filter.department === undefined || run.department === filter.department));
      runs.sort((left, right) => right.createdAt - left.createdAt || (left.id < right.id ? 1 : -1));
      return runs.slice(0, filter.limit ?? RUNS_SHOWN);
    },
    deleteRun(runId) {
      if (!isWorkflowRunId(runId)) return false;
      const path = findRunFile(runId);
      if (!path) return false;
      rmSync(dirname(path), { recursive: true, force: true });
      return true;
    },
    runDir(run) {
      return pathsOf(run).runDir;
    },
    stepFolder(run, index) {
      return stepDir(pathsOf(run).runDir, index + 1);
    },
    retentionDays(workflowId) {
      return latestOf(workflowId)?.retentionDays ?? WORKFLOW_RETENTION_DEFAULT_DAYS;
    },
  };
}
