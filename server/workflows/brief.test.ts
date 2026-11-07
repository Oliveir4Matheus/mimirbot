import { describe, expect, it } from "vitest";

import type { WorkflowStep } from "../../shared/workflow.ts";
import { stepBrief, stepThreadTitle } from "./brief.ts";

const step = (overrides: Partial<WorkflowStep> = {}): WorkflowStep => ({
  id: "revisar",
  name: "Review the numbers",
  botId: "bot-reviewer",
  instructions: "Check the numbers and answer with a decision.",
  inputs: [{ as: "numbers.csv", from: { step: "coletar", output: "numbers.csv" } }],
  outputs: [{ path: "decision.json", required: true }, { path: "notes.md", required: true }],
  result: "decision.json",
  ...overrides,
});

describe("stepBrief", () => {
  it("names the workflow, the position and the instruction", () => {
    const brief = stepBrief({ workflowName: "Contrato mensal", step: step(), index: 1, total: 3 });
    expect(brief).toContain("Workflow: Contrato mensal");
    expect(brief).toContain("Step 2 of 3: Review the numbers");
    expect(brief).toContain("Check the numbers and answer with a decision.");
  });

  it("lists every input and every output, and marks the declared result", () => {
    const brief = stepBrief({ workflowName: "Contrato mensal", step: step(), index: 1, total: 3 });
    expect(brief).toContain("- input/numbers.csv");
    expect(brief).toContain("- output/decision.json (this step's result: a JSON object)");
    expect(brief).toContain("- output/notes.md");
    expect(brief).toContain("Write the files inside output/");
  });

  it("says so when the first step has no input files", () => {
    const brief = stepBrief({ workflowName: "Contrato mensal", step: step({ inputs: [] }), index: 0, total: 1 });
    expect(brief).toContain("This step has no input files.");
    expect(brief).not.toContain("Files to read from input/");
  });

  it("is the same text for the same step, every time", () => {
    const first = stepBrief({ workflowName: "Contrato mensal", step: step(), index: 0, total: 1 });
    const second = stepBrief({ workflowName: "Contrato mensal", step: step(), index: 0, total: 1 });
    expect(second).toBe(first);
  });
});

describe("stepThreadTitle", () => {
  it("carries the workflow, the step and the run", () => {
    expect(stepThreadTitle("Contrato mensal", step(), "20261103-123456-abcdef")).toBe("Contrato mensal · Review the numbers · 20261103-123456-abcdef");
  });
});
