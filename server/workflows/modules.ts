// Packages a script step declares are installed into a per-step folder and
// removed when the step ends: the Workflow keeps no dependency tree between
// runs. The script runs against a copy of its folder so `import` finds the
// installed packages next to it. Same user permissions as the app; installing
// a package runs its own build hooks, so the person is trusting both names.
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { augmentedPath, findCliCandidates, resolveCliSpawn } from "../env-path.ts";
import { runWorkflowProcess } from "./process.ts";

export type WorkflowModulesRuntime = "node" | "python";

/** The installer a script needs: pip for `.py`, npm for everything else. */
export function workflowModulesRuntime(scriptPath: string): WorkflowModulesRuntime {
  return scriptPath.toLowerCase().endsWith(".py") ? "python" : "node";
}

/** `dir` is where the packages land; for Node it must sit beside the script. */
export function workflowModulesArgs(runtime: WorkflowModulesRuntime, dir: string, specs: readonly string[]): string[] {
  if (runtime === "python") {
    return ["-m", "pip", "install", "--quiet", "--disable-pip-version-check", "--no-input", "--target", dir, ...specs];
  }
  return ["install", "--prefix", dir, "--no-save", "--no-audit", "--no-fund", "--loglevel=error", ...specs];
}

export type WorkflowModulePreparation =
  | { ok: true; scriptPath: string; env: NodeJS.ProcessEnv; cleanup(): void }
  | { ok: false; error: string; timedOut?: true };

export interface WorkflowModuleHandle {
  promise: Promise<WorkflowModulePreparation>;
  kill(): void;
}

export interface WorkflowModuleOptions {
  /** The script the step runs; its folder is copied and its extension picks the installer. */
  scriptPath: string;
  specs: readonly string[];
  stepDir: string;
  env: NodeJS.ProcessEnv;
  /** Epoch milliseconds; installing and running share the step's one deadline. */
  deadline: number;
  /** The interpreter a `.py` script uses, so pip belongs to the same install. */
  python: string;
}

const MODULES_DIR = ".workflow-modules";
const OUTPUT_KEEP = 8 * 1024;
const ERROR_KEEP = 2_000;
/** npm and pip read these on Windows and in GUI launches where PATH is bare. */
const INSTALLER_ENV_KEYS = [
  "APPDATA",
  "LOCALAPPDATA",
  "ComSpec",
  "SystemDrive",
  "USER",
  "LOGNAME",
  "XDG_CACHE_HOME",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
] as const;

const tail = (value: string): string => value.trim().slice(-ERROR_KEEP);

function installerEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next = { ...env };
  for (const key of INSTALLER_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined && value !== "") next[key] = value;
  }
  return next;
}

function installCommand(runtime: WorkflowModulesRuntime, target: string, specs: readonly string[], python: string): { command: string; args: string[] } | { error: string } {
  const args = workflowModulesArgs(runtime, target, specs);
  if (runtime === "python") return { command: python, args };
  const cli = findCliCandidates("npm", augmentedPath())[0];
  if (!cli) return { error: `could not find npm on PATH to install ${specs.join(", ")}; scripts that import packages need Node.js with npm` };
  return resolveCliSpawn(cli, args);
}

export function prepareWorkflowModules(options: WorkflowModuleOptions): WorkflowModuleHandle {
  const runtime = workflowModulesRuntime(options.scriptPath);
  const root = join(options.stepDir, MODULES_DIR);
  const remove = (): void => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // The next run of this step removes whatever the OS would not release now.
    }
  };
  const fail = (error: string, timedOut = false): WorkflowModulePreparation => {
    remove();
    return { ok: false, error, ...(timedOut ? { timedOut: true as const } : {}) };
  };

  try {
    remove();
    mkdirSync(root, { recursive: true, mode: 0o700 });
    cpSync(dirname(options.scriptPath), join(root, "scripts"), { recursive: true });
  } catch (error) {
    return {
      promise: Promise.resolve(fail(`could not copy the Workflow's scripts folder: ${error instanceof Error ? error.message : String(error)}`)),
      kill() {},
    };
  }

  const target = runtime === "python" ? join(root, "python") : join(root, "scripts");
  const plan = installCommand(runtime, target, options.specs, options.python);
  if ("error" in plan) {
    return { promise: Promise.resolve(fail(plan.error)), kill() {} };
  }

  const remaining = options.deadline - Date.now();
  if (remaining <= 0) {
    return {
      promise: Promise.resolve(fail(`installing ${options.specs.join(", ")} took longer than the step allows`, true)),
      kill() {},
    };
  }

  const installer = runWorkflowProcess({
    command: plan.command,
    args: plan.args,
    cwd: options.stepDir,
    env: installerEnv(options.env),
    timeoutMs: remaining,
    stdoutKeep: OUTPUT_KEEP,
    stderrKeep: ERROR_KEEP,
  });

  const promise = installer.promise.then((exit): WorkflowModulePreparation => {
    const specs = options.specs.join(", ");
    if (exit.kind === "timeout") return fail(`installing ${specs} took longer than the step allows`, true);
    if (exit.kind === "missing") return fail(`could not find ${exit.command} on PATH to install ${specs}`);
    if (exit.kind === "error") return fail(`could not install ${specs}: ${exit.message}`);
    if (exit.code !== 0) {
      const output = installer.output();
      const detail = tail(output.stderr) || tail(output.stdout);
      return fail(`could not install ${specs}${detail ? `: ${detail}` : ""}`);
    }
    return {
      ok: true,
      scriptPath: join(root, "scripts", basename(options.scriptPath)),
      env: runtime === "python" ? { ...options.env, PYTHONPATH: target } : options.env,
      cleanup: remove,
    };
  });

  return { promise, kill: installer.kill };
}
