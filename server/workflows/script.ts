// Runs one script step. The script is a local Node process with the step folder
// as cwd: no shell, a closed environment, a hard timeout and captured output.
// It gets the same user permissions as the app; this is not a sandbox.
import { spawn, type ChildProcess } from "node:child_process";

import { WORKFLOW_SCRIPT_TIMEOUT_MAX_MS } from "../../shared/workflow.ts";

export interface WorkflowScriptOptions {
  scriptPath: string;
  stepDir: string;
  inputDir: string;
  outputDir: string;
  timeoutMs: number;
  runId: string;
  stepId: string;
}

export type WorkflowScriptResult = { ok: true } | { ok: false; error: string; timedOut?: true };

export interface WorkflowScriptHandle {
  promise: Promise<WorkflowScriptResult>;
  kill(): void;
}

const OUTPUT_KEEP = 8 * 1024;
const ERROR_KEEP = 2_000;

function scriptEnv(options: WorkflowScriptOptions): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    WORKFLOW_STEP_INPUT: options.inputDir,
    WORKFLOW_STEP_OUTPUT: options.outputDir,
    WORKFLOW_RUN_ID: options.runId,
    WORKFLOW_STEP_ID: options.stepId,
  };
  for (const key of ["PATH", "HOME", "USERPROFILE", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "SYSTEMROOT"]) {
    const value = process.env[key];
    if (value !== undefined && value !== "") env[key] = value;
  }
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
  let child: ChildProcess;
  try {
    child = spawn(process.execPath, [options.scriptPath], {
      cwd: options.stepDir,
      env: scriptEnv(options),
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
      settle({ ok: false, error: `could not start the script: ${error.message}` });
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
