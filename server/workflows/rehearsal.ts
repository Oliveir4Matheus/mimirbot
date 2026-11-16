// A rehearsal runs script steps in a disposable folder and compares only the
// bytes they produced. Bot steps are not judged by their reasoning: without an
// isolated engine they are "untested", never "passed".
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  WorkflowProposal,
  WorkflowProposalRehearsal,
  WorkflowProposalRehearsalStep,
} from "../../shared/workflow-proposal.ts";
import type { WorkflowStep } from "../../shared/workflow.ts";
import { verifyStepOutputs, writeStepParameters } from "./files.ts";
import { missingWorkflowModules } from "./preflight.ts";
import { runWorkflowScript } from "./script.ts";

export interface RehearsalExample {
  inputs?: Record<string, unknown>;
  /** Files placed in the first step's input folder, by file name. */
  files?: Array<{ name: string; content: string }>;
  /** Expected output path -> exact text; compare byte for byte. */
  expected?: Record<string, string>;
}

const sha = (value: string): string => createHash("sha256").update(value).digest("hex");

/** A rehearsal runs inside a chat turn, so one script may not hold it for the step's whole limit.
 * A script that would need longer is "untested", not diverged: nothing was proved either way. */
export const REHEARSAL_TIMEOUT_MS = 120_000;

function stepDir(root: string, id: string): string {
  return join(root, `step-${id}`);
}

/** Copies what an earlier script of this rehearsal produced. A file from a step a rehearsal
 * does not run is not an error: it means this script cannot be tested here. */
function copyDeclared(
  root: string,
  step: WorkflowStep & { kind: "bot" | "script" },
  index: number,
  steps: readonly WorkflowStep[],
): { missing?: string } {
  for (const input of step.inputs) {
    const sourceIndex = steps.findIndex((candidate) => candidate.id === input.from.step);
    if (sourceIndex < 0 || sourceIndex >= index) return { missing: `its input ${input.as} comes from a later step` };
    const source = join(stepDir(root, steps[sourceIndex]!.id), "output", input.from.output);
    try {
      mkdirSync(join(stepDir(root, step.id), "input"), { recursive: true });
      cpSync(source, join(stepDir(root, step.id), "input", input.as));
    } catch {
      return { missing: `its input ${input.from.output} comes from ${input.from.step}, which a rehearsal does not run; add an example file to test it` };
    }
  }
  return {};
}

export async function rehearseProposal(
  proposal: WorkflowProposal,
  example: RehearsalExample,
  checkModules: (definition: WorkflowProposal["definition"]) => readonly string[] = (definition) => missingWorkflowModules(definition),
): Promise<WorkflowProposalRehearsal> {
  const root = mkdtempSync(join(tmpdir(), "omb-workflow-rehearsal-"));
  const steps: WorkflowProposalRehearsalStep[] = [];
  const missingModules = new Set(checkModules(proposal.definition));
  try {
    mkdirSync(join(root, "example"), { recursive: true });
    for (const file of example.files ?? []) {
      const safe = !file.name.includes("\\") && !file.name.startsWith("/") && file.name.split("/").every((part) => part && part !== "." && part !== "..");
      if (!safe) {
        steps.push({ id: "example", name: "Example", label: "diverged", detail: `unsafe file name ${JSON.stringify(file.name)}` });
        return { at: Date.now(), status: "diverged", steps };
      }
      writeFileSync(join(root, "example", file.name), file.content, "utf8");
    }

    let firstScript = true;
    for (const [index, step] of proposal.definition.steps.entries()) {
      if (step.kind !== "script") {
        steps.push({ id: step.id, name: step.name, label: "untested", detail: step.kind === "bot" ? "needs the bot engine; not run in a rehearsal" : "branch step; not run in a rehearsal" });
        continue;
      }
      const script = proposal.scripts.find((entry) => entry.name === step.run);
      if (!script) {
        steps.push({ id: step.id, name: step.name, label: "diverged", detail: `script ${step.run} is missing` });
        continue;
      }
      const unavailable = step.modules.filter((module) => missingModules.has(module.name));
      if (unavailable.length > 0) {
        steps.push({ id: step.id, name: step.name, label: "diverged", detail: `not available on this machine: ${unavailable.map((module) => module.name).join(", ")}; install it before rehearsing` });
        continue;
      }
      const dir = stepDir(root, step.id);
      mkdirSync(join(dir, "input"), { recursive: true });
      mkdirSync(join(dir, "output"), { recursive: true });
      if (firstScript) {
        for (const file of example.files ?? []) {
          try {
            cpSync(join(root, "example", file.name), join(dir, "input", file.name));
          } catch {
            steps.push({ id: step.id, name: step.name, label: "diverged", detail: `could not place ${file.name}` });
          }
        }
        firstScript = false;
      }
      const copied = copyDeclared(root, step, index, proposal.definition.steps);
      if (copied.missing) {
        steps.push({ id: step.id, name: step.name, label: "untested", detail: copied.missing });
        continue;
      }
      const params = writeStepParameters(join(dir, "input"), step, example.inputs ?? {});
      if (!params.ok) {
        steps.push({ id: step.id, name: step.name, label: "diverged", detail: params.error });
        continue;
      }
      const scriptPath = join(root, "scripts", script.name);
      mkdirSync(join(root, "scripts"), { recursive: true });
      writeFileSync(scriptPath, script.content, { mode: 0o600 });
      const run = runWorkflowScript({
        scriptPath,
        stepDir: dir,
        inputDir: join(dir, "input"),
        outputDir: join(dir, "output"),
        timeoutMs: Math.min(step.timeoutMs, REHEARSAL_TIMEOUT_MS),
        runId: "rehearsal",
        stepId: step.id,
      });
      const outcome = await run.promise;
      if (!outcome.ok) {
        const tooLongForARehearsal = outcome.timedOut === true && step.timeoutMs > REHEARSAL_TIMEOUT_MS;
        steps.push({
          id: step.id,
          name: step.name,
          label: tooLongForARehearsal ? "untested" : "diverged",
          detail: tooLongForARehearsal
            ? `it ran longer than the ${REHEARSAL_TIMEOUT_MS / 1_000}s a rehearsal waits; run it once by hand`
            : outcome.error,
        });
        continue;
      }
      const verified = verifyStepOutputs(join(dir, "output"), step.outputs);
      if (!verified.ok) {
        steps.push({ id: step.id, name: step.name, label: "diverged", detail: verified.error });
        continue;
      }
      const expected = Object.entries(example.expected ?? {});
      const wrong = expected.filter(([path, text]) => {
        try {
          return sha(readFileSync(join(dir, "output", path), "utf8")) !== sha(text);
        } catch {
          return true;
        }
      });
      if (wrong.length > 0) {
        steps.push({ id: step.id, name: step.name, label: "diverged", detail: `output differs: ${wrong.map(([path]) => path).join(", ")}`, produced: verified.verified, expected: expected.map(([path]) => path) });
        continue;
      }
      steps.push({ id: step.id, name: step.name, label: "passed", produced: verified.verified, expected: expected.map(([path]) => path) });
    }

    const status = steps.some((step) => step.label === "diverged") ? "diverged" : steps.some((step) => step.label === "passed") ? "passed" : "untested";
    return { at: Date.now(), status, steps, ...(example.files?.length ? { example: example.files.map((file) => file.name) } : {}) };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
