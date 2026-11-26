// One local process with a closed environment, a hard deadline and capped
// output. The script step and its package installer share these rules.
import { spawn, type ChildProcess } from "node:child_process";

export type WorkflowProcessExit =
  | { kind: "exit"; code: number | null; signal: NodeJS.Signals | null }
  | { kind: "timeout" }
  | { kind: "missing"; command: string }
  | { kind: "error"; message: string };

export interface WorkflowProcessHandle {
  promise: Promise<WorkflowProcessExit>;
  kill(): void;
  output(): { stdout: string; stderr: string };
}

export interface WorkflowProcessOptions {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  stdoutKeep: number;
  stderrKeep: number;
}

function appendCapped(current: string, chunk: Buffer, limit: number): string {
  if (current.length >= limit) return current;
  return (current + chunk.toString("utf8")).slice(0, limit);
}

export function runWorkflowProcess(options: WorkflowProcessOptions): WorkflowProcessHandle {
  let stdout = "";
  let stderr = "";
  const output = (): { stdout: string; stderr: string } => ({ stdout, stderr });
  let child: ChildProcess;
  try {
    child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
  } catch (error) {
    return {
      promise: Promise.resolve({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      }),
      kill() {},
      output,
    };
  }

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
  }, options.timeoutMs);

  const promise = new Promise<WorkflowProcessExit>((resolve) => {
    const settle = (result: WorkflowProcessExit): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = appendCapped(stdout, chunk, options.stdoutKeep);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = appendCapped(stderr, chunk, options.stderrKeep);
    });
    child.on("error", (error) => {
      const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
      settle(missing ? { kind: "missing", command: options.command } : { kind: "error", message: error.message });
    });
    child.on("close", (code, signal) => {
      settle(timedOut ? { kind: "timeout" } : { kind: "exit", code, signal });
    });
  });

  return { promise, kill, output };
}
