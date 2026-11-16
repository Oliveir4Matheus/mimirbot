// Runs one script step as a local process with the step folder as cwd: no
// shell, a closed environment, a hard timeout and captured output. Only `.mjs`
// runs: the app is already Node, so there is no second runtime to ship. It gets
// the same user permissions as the app; this is not a sandbox.
import { spawn, type ChildProcess } from "node:child_process";
import { delimiter } from "node:path";

import { WORKFLOW_SCRIPT_TIMEOUT_MAX_MS } from "../../shared/workflow.ts";
import { workflowEnvironmentPaths, type WorkflowEnvironmentPaths } from "./environment.ts";

export interface WorkflowScriptOptions {
  scriptPath: string;
  stepDir: string;
  inputDir: string;
  outputDir: string;
  timeoutMs: number;
  runId: string;
  stepId: string;
  /** The installation environment whose python and node_modules the script uses. */
  environment?: WorkflowEnvironmentPaths;
}

export type WorkflowScriptResult = { ok: true } | { ok: false; error: string; timedOut?: true };

export interface WorkflowScriptHandle {
  promise: Promise<WorkflowScriptResult>;
  kill(): void;
}

const OUTPUT_KEEP = 8 * 1024;
const ERROR_KEEP = 2_000;

/** The interpreter and arguments for a script: always this app's own Node. */
export function workflowScriptCommand(scriptPath: string): { command: string; args: string[] } {
  return { command: process.execPath, args: [scriptPath] };
}

/** The environment one script step gets: no shell, the installation's interpreter and node
 * modules named, and the venv's `bin` first on PATH. A bot step never receives any of it. */
export function workflowScriptEnvironment(options: WorkflowScriptOptions): NodeJS.ProcessEnv {
  const environment = options.environment ?? workflowEnvironmentPaths();
  const env: NodeJS.ProcessEnv = {
    WORKFLOW_STEP_INPUT: options.inputDir,
    WORKFLOW_STEP_OUTPUT: options.outputDir,
    WORKFLOW_RUN_ID: options.runId,
    WORKFLOW_STEP_ID: options.stepId,
    WORKFLOW_PYTHON: environment.python,
    WORKFLOW_NODE_MODULES: environment.nodeModules,
  };
  for (const key of ["PATH", "HOME", "USERPROFILE", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "SYSTEMROOT"]) {
    const value = process.env[key];
    if (value !== undefined && value !== "") env[key] = value;
  }
  env.PATH = [environment.binDir, env.PATH].filter((entry) => entry !== undefined && entry !== "").join(delimiter);
  // A packaged app's execPath is Electron; this is its documented way to run a Node script.
  if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = "1";
  return env;
}

function appendCapped(current: string, chunk: Buffer, limit: number): string {
  if (current.length >= limit) return current;
  return (current + chunk.toString("utf8")).slice(0, limit);
}

const tail = (value: string): string => value.trim().slice(-ERROR_KEEP);

export function runWorkflowScript(options: WorkflowScriptOptions): WorkflowScriptHandle {
  const timeoutMs = Math.min(Math.max(options.timeoutMs, 1_000), WORKFLOW_SCRIPT_TIMEOUT_MAX_MS);
  const { command, args } = workflowScriptCommand(options.scriptPath);
  let child: ChildProcess;
  try {
    child = spawn(command, args, {
      cwd: options.stepDir,
      env: workflowScriptEnvironment(options),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
  } catch (error) {
    return {
      promise: Promise.resolve({ ok: false, error: `could not start the script: ${error instanceof Error ? error.message : String(error)}` }),
      kill() {},
    };
  }

  let stdout = "";
  let stderr = "";
  let timedOut = false;
  let settled = false;

  const kill = (): void => {
    if (child.pid === undefined) return;
    try {
      if (process.platform === "win32") child.kill("SIGKILL");
      else process.kill(-child.pid, "SIGKILL");
    } catch {
      try {
        child.kill("SIGKILL");
      } catch {
        // The process already exited.
      }
    }
  };

  const timer = setTimeout(() => {
    timedOut = true;
    kill();
  }, timeoutMs);

  const promise = new Promise<WorkflowScriptResult>((resolve) => {
    const settle = (result: WorkflowScriptResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = appendCapped(stdout, chunk, OUTPUT_KEEP);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = appendCapped(stderr, chunk, ERROR_KEEP);
    });
    child.on("error", (error) => {
      const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
      settle({
        ok: false,
        error: missing
          ? `could not find ${command} on PATH to run this script`
          : `could not start the script: ${error.message}`,
      });
    });
    child.on("close", (code, signal) => {
      if (timedOut) {
        settle({ ok: false, error: `the script ran longer than ${timeoutMs}ms`, timedOut: true });
        return;
      }
      if (code !== 0) {
        const detail = tail(stderr) || tail(stdout);
        const ending = signal ? `signal ${signal}` : `code ${code ?? "?"}`;
        settle({ ok: false, error: `the script exited with ${ending}${detail ? `: ${detail}` : ""}` });
        return;
      }
      settle({ ok: true });
    });
  });

  return { promise, kill };
}
