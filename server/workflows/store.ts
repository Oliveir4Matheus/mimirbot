// Definitions and runs on disk. `workflows.json` lives in the app's data dir,
// so a workspace backup carries the recipes; each run's `run.json` lives in
// its own folder under ~/MimirBot and is the only state the engine trusts.
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import {
  WORKFLOW_RETENTION_DEFAULT_DAYS,
  WORKFLOW_SCRIPT_MAX_BYTES,
  isScriptStep,
  isWorkflowScriptName,
  workflowDefinitionSchema,
  workflowRunSchema,
  type WorkflowDefinition,
  type WorkflowRun,
} from "../../shared/workflow.ts";
import { writeFileAtomic } from "../atomic.ts";
import { prepareRunDirectories } from "./files.ts";
import {
  isWorkflowId, isWorkflowRunId, newWorkflowRunId, workflowRunPaths, workflowScriptsDir, workflowsRoot, stepDir,
} from "./paths.ts";
import { createRun, isActiveRun } from "./state.ts";

export interface WorkflowStoreOptions {
  dataDir: string;
  home?: string;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  log?: (line: string) => void;
}

export type WorkflowSave = { ok: true; workflow: WorkflowDefinition } | { ok: false; error: string };

/** A script file a Workflow's `scripts/` folder holds. */
export interface WorkflowScriptInfo {
  name: string;
  bytes: number;
  updatedAt: number;
}

export interface WorkflowScript extends WorkflowScriptInfo {
  content: string;
}

/** A script the Studio saves together with the definition that references it. */
export interface WorkflowScriptUpload {
  name: string;
  content: string;
}

export type WorkflowScriptSave =
  | { ok: true; script: WorkflowScriptInfo }
  | { ok: false; error: string };

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
  saveWorkflow(input: unknown, options?: { scripts?: readonly WorkflowScriptUpload[] }): WorkflowSave;
  removeWorkflow(id: string): boolean;
  createRun(definition: WorkflowDefinition, options?: { requestedBy?: WorkflowRun["requestedBy"]; triggeredBy?: WorkflowRun["triggeredBy"] }): WorkflowRun;
  readRun(runId: string): WorkflowRun | undefined;
  writeRun(run: WorkflowRun): void;
  listRuns(filter?: WorkflowRunFilter): WorkflowRun[];
  deleteRun(runId: string): boolean;
  runDir(run: WorkflowRun): string;
  stepFolder(run: WorkflowRun, index: number): string;
  retentionDays(workflowId: string): number;
  /** The `scripts/` folder of the Workflow's latest version, or undefined when the Workflow is gone. */
  scriptsFolder(workflowId: string): string | undefined;
  readScript(workflowId: string, name: string): WorkflowScript | undefined;
  writeScript(workflowId: string, name: string, content: string): WorkflowScriptSave;
  listScripts(workflowId: string): WorkflowScriptInfo[];
  hasActiveRuns(workflowId: string): boolean;
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

const comparable = (definition: WorkflowDefinition): string =>
  JSON.stringify({ ...definition, version: 0, createdAt: 0, updatedAt: 0, canvas: undefined });

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

  const scriptsDirOf = (id: string): string | undefined => {
    const definition = latestOf(id);
    if (!definition) return undefined;
    return workflowScriptsDir({ department: definition.department, workflowId: definition.id, home, env });
  };

  const scriptFile = (workflowId: string, name: string): string | undefined => {
    if (!isWorkflowScriptName(name)) return undefined;
    const dir = scriptsDirOf(workflowId);
    return dir ? join(dir, name) : undefined;
  };

  const scriptInfo = (name: string, info: { size: number; mtimeMs: number }): WorkflowScriptInfo => ({
    name,
    bytes: info.size,
    updatedAt: Math.floor(info.mtimeMs),
  });

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

  const store: WorkflowStore = {
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
    saveWorkflow(input, options) {
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
      if (options?.scripts && options.scripts.length > 0) {
        const dir = workflowScriptsDir({ department: parsed.data.department, workflowId: id, home, env });
        for (const script of options.scripts) {
          if (!isWorkflowScriptName(script.name)) {
            return { ok: false, error: `script name ${JSON.stringify(script.name)} must be a flat .mjs or .js file name` };
          }
          if (Buffer.byteLength(script.content, "utf8") > WORKFLOW_SCRIPT_MAX_BYTES) {
            return { ok: false, error: `script ${JSON.stringify(script.name)} is larger than ${WORKFLOW_SCRIPT_MAX_BYTES / 1024}KB` };
          }
          try {
            mkdirSync(dir, { recursive: true, mode: 0o700 });
            writeFileAtomic(join(dir, script.name), script.content, { mode: 0o600 });
          } catch (error) {
            return { ok: false, error: `could not write ${join(dir, script.name)}: ${reason(error)}` };
          }
        }
      }
      const invalidScript = parsed.data.steps.find((step) => {
        if (!isScriptStep(step)) return false;
        const file = join(workflowScriptsDir({ department: parsed.data.department, workflowId: id, home, env }), step.run);
        try {
          const info = lstatSync(file);
          return info.isSymbolicLink() || !info.isFile();
        } catch {
          return true;
        }
      });
      if (invalidScript && isScriptStep(invalidScript)) {
        return { ok: false, error: `script ${JSON.stringify(invalidScript.run)} is not in the Workflow's scripts folder` };
      }
      const existing = latestOf(id);
      const hasCanvas = Object.hasOwn(input as object, "canvas");
      const normalized: WorkflowDefinition = { ...parsed.data, id, ...(hasCanvas || !existing?.canvas ? {} : { canvas: existing.canvas }) };
      if (existing && comparable(existing) === comparable(normalized)) {
        if (!hasCanvas || JSON.stringify(existing.canvas) === JSON.stringify(normalized.canvas)) return { ok: true, workflow: existing };
        const index = definitions.findIndex((candidate) => candidate.id === id && candidate.version === existing.version);
        const moved: WorkflowDefinition = { ...existing, canvas: normalized.canvas };
        if (index < 0) return { ok: false, error: `could not find the current version of ${id}` };
        definitions[index] = moved;
        try {
          persist();
        } catch (error) {
          definitions[index] = existing;
          return { ok: false, error: `could not save ${file}: ${reason(error)}` };
        }
        return { ok: true, workflow: moved };
      }
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
    scriptsFolder(workflowId) {
      return isWorkflowId(workflowId) ? scriptsDirOf(workflowId.toLowerCase()) : undefined;
    },
    readScript(workflowId, name) {
      if (!isWorkflowId(workflowId)) return undefined;
      const file = scriptFile(workflowId.toLowerCase(), name);
      if (!file) return undefined;
      try {
        const info = lstatSync(file);
        if (info.isSymbolicLink() || !info.isFile()) return undefined;
        const content = readFileSync(file, "utf8");
        return { ...scriptInfo(name, info), content };
      } catch {
        return undefined;
      }
    },
    writeScript(workflowId, name, content) {
      if (!isWorkflowId(workflowId)) return { ok: false, error: "the Workflow id must be a uuid" };
      if (!isWorkflowScriptName(name)) return { ok: false, error: "a script name must be a flat .mjs or .js file name" };
      const dir = scriptsDirOf(workflowId.toLowerCase());
      if (!dir) return { ok: false, error: "no such workflow" };
      if (Buffer.byteLength(content, "utf8") > WORKFLOW_SCRIPT_MAX_BYTES) {
        return { ok: false, error: `a script may be at most ${WORKFLOW_SCRIPT_MAX_BYTES / 1024}KB` };
      }
      const file = join(dir, name);
      try {
        mkdirSync(dir, { recursive: true, mode: 0o700 });
        writeFileAtomic(file, content, { mode: 0o600 });
        return { ok: true, script: scriptInfo(name, lstatSync(file)) };
      } catch (error) {
        return { ok: false, error: `could not write ${file}: ${reason(error)}` };
      }
    },
    listScripts(workflowId) {
      if (!isWorkflowId(workflowId)) return [];
      const dir = scriptsDirOf(workflowId.toLowerCase());
      if (!dir) return [];
      try {
        return readdirSync(dir, { withFileTypes: true })
          .filter((entry) => entry.isFile() && isWorkflowScriptName(entry.name))
          .map((entry) => scriptInfo(entry.name, lstatSync(join(dir, entry.name))))
          .sort((left, right) => left.name.localeCompare(right.name));
      } catch {
        return [];
      }
    },
    hasActiveRuns(workflowId) {
      return store.listRuns({ workflowId, limit: Number.POSITIVE_INFINITY }).some((run) => isActiveRun(run.status));
    },
  };
  return store;
}
