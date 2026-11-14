// Runs one script step as a local process with the step folder as cwd: no
// shell, a closed environment, a hard timeout and captured output. The file
// extension picks the runtime (Node, Node with type stripping, or Python), and
// the packages the step declares are installed for this run only.
// It gets the same user permissions as the app; this is not a sandbox.
import { WORKFLOW_SCRIPT_TIMEOUT_MAX_MS } from "../../shared/workflow.ts";
import { prepareWorkflowModules } from "./modules.ts";
import { runWorkflowProcess } from "./process.ts";

export interface WorkflowScriptOptions {
  scriptPath: string;
  stepDir: string;
  inputDir: string;
  outputDir: string;
  timeoutMs: number;
  runId: string;
  stepId: string;
  /** Packages installed before the script starts and removed when it ends. */
  modules?: readonly string[];
}

export type WorkflowScriptResult = { ok: true } | { ok: false; error: string; timedOut?: true };

export interface WorkflowScriptHandle {
  promise: Promise<WorkflowScriptResult>;
  kill(): void;
}

const OUTPUT_KEEP = 8 * 1024;
const ERROR_KEEP = 2_000;
const MIN_TIMEOUT_MS = 1_000;

/** The interpreter and arguments for a script, chosen by its extension. */
export function workflowScriptCommand(scriptPath: string): { command: string; args: string[] } {
  const lower = scriptPath.toLowerCase();
  if (lower.endsWith(".py")) {
    const python = process.env.WORKFLOW_PYTHON || (process.platform === "win32" ? "python" : "python3");
    return { command: python, args: [scriptPath] };
  }
  if (lower.endsWith(".ts")) return { command: process.execPath, args: ["--experimental-strip-types", scriptPath] };
  return { command: process.execPath, args: [scriptPath] };
}

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

const tail = (value: string): string => value.trim().slice(-ERROR_KEEP);

export function runWorkflowScript(options: WorkflowScriptOptions): WorkflowScriptHandle {
  const timeoutMs = Math.min(Math.max(options.timeoutMs, MIN_TIMEOUT_MS), WORKFLOW_SCRIPT_TIMEOUT_MAX_MS);
  const deadline = Date.now() + timeoutMs;
  const timeoutResult = (): WorkflowScriptResult => ({ ok: false, error: `the script ran longer than ${timeoutMs}ms`, timedOut: true });
  const specs = options.modules ?? [];
  let active: { kill(): void } | undefined;
  let cancelled = false;

  const promise = (async (): Promise<WorkflowScriptResult> => {
    let cleanup: (() => void) | undefined;
    try {
      let scriptPath = options.scriptPath;
      let env = scriptEnv(options);
      if (specs.length > 0) {
        const prepare = prepareWorkflowModules({
          scriptPath,
          specs,
          stepDir: options.stepDir,
          env,
          deadline,
          python: workflowScriptCommand(scriptPath).command,
        });
        active = prepare;
        const prepared = await prepare.promise;
        active = undefined;
        if (!prepared.ok) return prepared;
        scriptPath = prepared.scriptPath;
        env = prepared.env;
        cleanup = prepared.cleanup;
      }
      if (cancelled) return { ok: false, error: "the run was cancelled" };
      if (Date.now() >= deadline) return timeoutResult();

      const { command, args } = workflowScriptCommand(scriptPath);
      const child = runWorkflowProcess({
        command,
        args,
        cwd: options.stepDir,
        env,
        timeoutMs: deadline - Date.now(),
        stdoutKeep: OUTPUT_KEEP,
        stderrKeep: ERROR_KEEP,
      });
      active = child;
      const exit = await child.promise;
      active = undefined;
      if (exit.kind === "timeout") return timeoutResult();
      if (exit.kind === "missing") return { ok: false, error: `could not find ${exit.command} on PATH to run this script` };
      if (exit.kind === "error") return { ok: false, error: `could not start the script: ${exit.message}` };
      if (exit.code !== 0) {
        const output = child.output();
        const detail = tail(output.stderr) || tail(output.stdout);
        const ending = exit.signal ? `signal ${exit.signal}` : `code ${exit.code ?? "?"}`;
        return { ok: false, error: `the script exited with ${ending}${detail ? `: ${detail}` : ""}` };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: `the step could not prepare the script: ${error instanceof Error ? error.message : String(error)}` };
    } finally {
      try {
        cleanup?.();
      } catch {
        // A leftover file the OS will not release must not turn a finished step into a rejection.
      }
    }
  })();

  return {
    promise,
    kill() {
      cancelled = true;
      active?.kill();
    },
  };
}
