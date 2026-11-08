// The run folder's file rules: a step only writes inside its own output/,
// the engine verifies what it declared, and the engine alone copies one
// step's declared output into the next step's input/.
import { chmodSync, copyFileSync, lstatSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { isWorkflowRelativePath, type WorkflowStep, type StepOutput } from "../../shared/workflow.ts";
import { stepDir, stepInputDir, stepOutputDir } from "./paths.ts";

export const WORKFLOW_RESULT_MAX_BYTES = 64 * 1024;

/** A declared path resolved under `root`, or null when it would leave it. */
export function safeWorkflowPath(root: string, declared: string): string | null {
  if (!isWorkflowRelativePath(declared)) return null;
  const base = resolve(root);
  const full = resolve(base, declared);
  const inside = relative(base, full);
  return inside && !inside.startsWith("..") && !isAbsolute(inside) ? full : null;
}

export type OutputVerification =
  | { ok: true; verified: string[]; result?: unknown }
  | { ok: false; error: string };

/** D2/D3: every required output exists as a plain, non-empty file; the
 * declared result is a small JSON object. Links are refused, since a step
 * could otherwise point the engine at a file it does not own. */
export function verifyStepOutputs(
  outputDir: string,
  outputs: readonly StepOutput[],
  resultPath?: string,
): OutputVerification {
  const verified: string[] = [];
  for (const output of outputs) {
    const full = safeWorkflowPath(outputDir, output.path);
    if (!full) return { ok: false, error: `output ${JSON.stringify(output.path)} is not a safe relative path` };
    let info;
    try {
      info = lstatSync(full);
    } catch {
      if (output.required) return { ok: false, error: `missing required output ${JSON.stringify(output.path)}` };
      continue;
    }
    if (info.isSymbolicLink()) return { ok: false, error: `output ${JSON.stringify(output.path)} is a link; a step writes plain files` };
    if (!info.isFile()) return { ok: false, error: `output ${JSON.stringify(output.path)} is not a file` };
    if (output.required && info.size === 0) return { ok: false, error: `output ${JSON.stringify(output.path)} is empty` };
    verified.push(output.path);
  }
  if (resultPath === undefined) return { ok: true, verified };
  if (!outputs.some((output) => output.path === resultPath)) {
    return { ok: false, error: `result ${JSON.stringify(resultPath)} must be one of the step's outputs` };
  }
  const full = safeWorkflowPath(outputDir, resultPath);
  if (!full) return { ok: false, error: `result ${JSON.stringify(resultPath)} is not a safe relative path` };
  let info;
  try {
    info = lstatSync(full);
  } catch {
    return { ok: false, error: `missing result ${JSON.stringify(resultPath)}` };
  }
  if (info.isSymbolicLink() || !info.isFile()) return { ok: false, error: `result ${JSON.stringify(resultPath)} is not a plain file` };
  if (info.size === 0) return { ok: false, error: `result ${JSON.stringify(resultPath)} is empty` };
  if (info.size > WORKFLOW_RESULT_MAX_BYTES) return { ok: false, error: `result ${JSON.stringify(resultPath)} is larger than ${WORKFLOW_RESULT_MAX_BYTES / 1024}KB` };
  let result: unknown;
  try {
    result = JSON.parse(readFileSync(full, "utf8"));
  } catch {
    return { ok: false, error: `result ${JSON.stringify(resultPath)} is not valid JSON` };
  }
  if (result === null || typeof result !== "object" || Array.isArray(result)) {
    return { ok: false, error: `result ${JSON.stringify(resultPath)} must be a JSON object` };
  }
  return { ok: true, verified, result };
}

export type StepInputsCopy = { ok: true; copied: string[] } | { ok: false; error: string };

/** D15: only declared inputs are copied, from files the engine already
 * verified. A link or a path outside the source output/ is refused. */
export function copyStepInputs(
  runDir: string,
  stepIndex: number,
  step: WorkflowStep,
  steps: readonly WorkflowStep[],
): StepInputsCopy {
  const targetDir = stepInputDir(runDir, stepIndex + 1);
  const copied: string[] = [];
  for (const input of step.inputs) {
    const sourceIndex = steps.findIndex((candidate) => candidate.id === input.from.step);
    if (sourceIndex < 0 || sourceIndex >= stepIndex) {
      return { ok: false, error: `input ${JSON.stringify(input.as)} must come from an earlier step` };
    }
    const sourceRoot = stepOutputDir(runDir, sourceIndex + 1);
    const source = safeWorkflowPath(sourceRoot, input.from.output);
    if (!source) return { ok: false, error: `source ${JSON.stringify(input.from.output)} is not a safe relative path` };
    let info;
    try {
      info = lstatSync(source);
    } catch {
      return { ok: false, error: `missing source ${JSON.stringify(input.from.output)} from step ${JSON.stringify(input.from.step)}` };
    }
    if (info.isSymbolicLink() || !info.isFile()) {
      return { ok: false, error: `source ${JSON.stringify(input.from.output)} from step ${JSON.stringify(input.from.step)} is not a plain file` };
    }
    const target = safeWorkflowPath(targetDir, input.as);
    if (!target) return { ok: false, error: `input ${JSON.stringify(input.as)} is not a safe relative path` };
    try {
      mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
      copyFileSync(source, target);
      chmodSync(target, 0o600);
    } catch (error) {
      return { ok: false, error: `could not copy ${JSON.stringify(input.from.output)} into ${JSON.stringify(input.as)}: ${error instanceof Error ? error.message : String(error)}` };
    }
    copied.push(input.as);
  }
  return { ok: true, copied };
}

/** Every step gets input/ and output/ before any bot runs, so a step never
 * creates its own folder or inherits a teammate's. */
export function prepareRunDirectories(runDir: string, stepCount: number): string[] {
  if (!Number.isInteger(stepCount) || stepCount < 1) throw new Error(`invalid step count ${String(stepCount)}`);
  return Array.from({ length: stepCount }, (_, index) => {
    const base = stepDir(runDir, index + 1);
    mkdirSync(join(base, "input"), { recursive: true, mode: 0o700 });
    mkdirSync(join(base, "output"), { recursive: true, mode: 0o700 });
    return base;
  });
}

/** A repeated step starts clean, so a file from the previous visit never passes the next verification. */
export function resetStepFolders(runDir: string, stepNumber: number): void {
  for (const dir of [stepInputDir(runDir, stepNumber), stepOutputDir(runDir, stepNumber)]) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}
