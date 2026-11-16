// The binaries a script step declares in `modules`. A package is the prepared
// environment's business (server/workflows/environment.ts); this checks only what
// must already be on PATH, and never installs anything.
import { accessSync, constants, existsSync } from "node:fs";
import { delimiter, join } from "node:path";

import { workflowModules, type WorkflowDefinition, type WorkflowModule } from "../../shared/workflow.ts";

/** Whether a command resolves on PATH, including the platform's executable extensions. */
export function isCommandOnPath(command: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const path = env.PATH ?? "";
  const extensions = process.platform === "win32" ? (env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
  for (const folder of path.split(delimiter)) {
    if (!folder) continue;
    for (const extension of extensions) {
      try {
        accessSync(join(folder, `${command}${extension}`), constants.X_OK);
        return true;
      } catch {}
    }
  }
  return false;
}

function gpuAvailable(env: NodeJS.ProcessEnv): boolean {
  if (process.platform === "darwin") return true;
  if (process.platform === "linux" && existsSync("/dev/nvidia0")) return true;
  return isCommandOnPath("nvidia-smi", env);
}

/** Why a declared binary cannot be used here, or undefined when it can. */
export function moduleIssue(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (name === "gpu") return gpuAvailable(env) ? undefined : "a GPU (gpu)";
  return isCommandOnPath(name, env) ? undefined : name;
}

/** The binary entries of a definition, each once. */
export function binWorkflowModules(definition: Pick<WorkflowDefinition, "steps">): WorkflowModule[] {
  return workflowModules(definition).filter((module) => module.runtime === "bin");
}

/** Every binary the definition declares that this machine does not have. */
export function missingWorkflowModules(
  definition: Pick<WorkflowDefinition, "steps">,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  return [...new Set(binWorkflowModules(definition).flatMap((module) => moduleIssue(module.name, env) === undefined ? [] : [module.name]))];
}
