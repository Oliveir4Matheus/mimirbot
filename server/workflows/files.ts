// The run folder's file rules: a step only writes inside its own output/,
// the engine verifies what it declared, and the engine alone copies one
// step's declared output into the next step's input/.
import { chmodSync, copyFileSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import {
  isWorkflowRelativePath,
  type LoopWorkflowStep,
  type StepOutput,
  type WorkflowBodyStep,
  type WorkflowStep,
} from "../../shared/workflow.ts";
import {
  iterationDir,
  iterationStepDir,
  iterationStepOutputDir,
  stepDir,
  stepInputDir,
  stepOutputDir,
} from "./paths.ts";

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

/** Writes the step's declared parameter subset to `input/params.json`; a step
 * with no declarations gets no file, so old Workflows read exactly as before. */
export function writeStepParameters(inputDir: string, step: WorkflowStep | WorkflowBodyStep, inputs: Record<string, unknown> = {}): { ok: true } | { ok: false; error: string } {
  if (step.kind === "condition" || step.kind === "loop") return { ok: true };
  const parameters = step.parameters ?? [];
  if (parameters.length === 0) return { ok: true };
  const values = Object.fromEntries(parameters.filter((parameter) => Object.hasOwn(inputs, parameter.name)).map((parameter) => [parameter.name, inputs[parameter.name]]));
  try {
    mkdirSync(inputDir, { recursive: true, mode: 0o700 });
    writeFileSync(join(inputDir, "params.json"), JSON.stringify(values, null, 2), { mode: 0o600 });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: `could not write input/params.json: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** D15: only declared inputs are copied, from files the engine already
 * verified. A link or a path outside the source output/ is refused. */
export function copyStepInputs(
  runDir: string,
  stepIndex: number,
  step: WorkflowStep,
  steps: readonly WorkflowStep[],
): StepInputsCopy {
  if (step.kind === "condition" || step.kind === "loop") return { ok: true, copied: [] };
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

/** A body step reads from an earlier body step of the same round, or from a
 * top-level step that ran before the Do While. Nothing is shared between rounds. */
export function copyBodyStepInputs(
  runDir: string,
  loopIndex: number,
  iterationNumber: number,
  bodyIndex: number,
  step: WorkflowBodyStep,
  body: readonly WorkflowBodyStep[],
  definitionSteps: readonly WorkflowStep[],
): StepInputsCopy {
  if (step.kind === "condition") return { ok: true, copied: [] };
  const targetDir = join(iterationDir(runDir, iterationNumber), `step-${step.id}`, "input");
  const copied: string[] = [];
  for (const input of step.inputs) {
    const bodySourceIndex = body.findIndex((candidate) => candidate.id === input.from.step);
    const topSourceIndex = definitionSteps.findIndex((candidate) => candidate.id === input.from.step);
    let sourceRoot: string | undefined;
    if (bodySourceIndex >= 0 && bodySourceIndex < bodyIndex) {
      sourceRoot = iterationStepOutputDir(runDir, iterationNumber, body[bodySourceIndex]!.id);
    } else if (bodySourceIndex < 0 && topSourceIndex >= 0 && topSourceIndex < loopIndex) {
      sourceRoot = stepOutputDir(runDir, topSourceIndex + 1);
    }
    if (!sourceRoot) return { ok: false, error: `input ${JSON.stringify(input.as)} must come from an earlier body step or an earlier top-level step` };
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

export type LoopProjection = { ok: true; verified: string[] } | { ok: false; error: string };

/** Copies each declared Do While output from the body step that owns it in the
 * last round into the loop's own output/, so a later step reads it as usual. */
export function projectLoopOutputs(
  runDir: string,
  loopIndex: number,
  iterationNumber: number,
  loop: LoopWorkflowStep,
): LoopProjection {
  const targetDir = stepOutputDir(runDir, loopIndex + 1);
  const verified: string[] = [];
  for (const output of loop.outputs) {
    const declaring = loop.body.filter((step): step is Exclude<WorkflowBodyStep, { kind: "condition" }> =>
      step.kind !== "condition" && step.outputs.some((declared) => declared.path === output.path));
    if (declaring.length !== 1) {
      return { ok: false, error: `output ${JSON.stringify(output.path)} must be declared by exactly one body step` };
    }
    const sourceRoot = iterationStepOutputDir(runDir, iterationNumber, declaring[0]!.id);
    const source = safeWorkflowPath(sourceRoot, output.path);
    if (!source) return { ok: false, error: `output ${JSON.stringify(output.path)} is not a safe relative path` };
    let info;
    try {
      info = lstatSync(source);
    } catch {
      if (!output.required) continue;
      return { ok: false, error: `missing required output ${JSON.stringify(output.path)} from the last round` };
    }
    if (info.isSymbolicLink()) return { ok: false, error: `output ${JSON.stringify(output.path)} is a link; a step writes plain files` };
    if (!info.isFile()) return { ok: false, error: `output ${JSON.stringify(output.path)} is not a file` };
    if (output.required && info.size === 0) return { ok: false, error: `output ${JSON.stringify(output.path)} is empty` };
    const target = safeWorkflowPath(targetDir, output.path);
    if (!target) return { ok: false, error: `output ${JSON.stringify(output.path)} is not a safe relative path` };
    try {
      mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
      copyFileSync(source, target);
      chmodSync(target, 0o600);
    } catch (error) {
      return { ok: false, error: `could not project ${JSON.stringify(output.path)}: ${error instanceof Error ? error.message : String(error)}` };
    }
    verified.push(output.path);
  }
  return { ok: true, verified };
}

/** Creates a round's folders before its first step: one input/output pair per body step. */
export function prepareIterationDirectories(runDir: string, iterationNumber: number, body: readonly WorkflowBodyStep[]): string[] {
  return body.map((step) => {
    const base = iterationStepDir(runDir, iterationNumber, step.id);
    mkdirSync(join(base, "input"), { recursive: true, mode: 0o700 });
    mkdirSync(join(base, "output"), { recursive: true, mode: 0o700 });
    return base;
  });
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
