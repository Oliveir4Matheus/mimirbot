import { describe, expect, it } from "vitest";

import type { BotWorkflowStep } from "../../shared/workflow.ts";
import { stepBrief, stepThreadTitle } from "./brief.ts";

const step = (overrides: Partial<BotWorkflowStep> = {}): BotWorkflowStep => ({
  id: "revisar",
  kind: "bot",
  name: "Review the numbers",
  botId: "bot-reviewer",
  instructions: "Check the numbers and answer with a decision.",
  timeoutMs: 0,
  mode: "auto",
  inputs: [{ as: "numbers.csv", from: { step: "coletar", output: "numbers.csv" } }],
  parameters: [],
  outputs: [{ path: "decision.json", required: true }, { path: "notes.md", required: true }],
  result: "decision.json",
  ...overrides,
});

describe("stepBrief", () => {
  it("names the workflow, the position and the instruction", () => {
    const brief = stepBrief({ workflowName: "Contrato mensal", step: step(), index: 1, total: 3 });
    expect(brief).toContain('WORKFLOW "Contrato mensal" · STEP 2/3 "Review the numbers"');
    expect(brief).toContain("Check the numbers and answer with a decision.");
  });

  it("lists every input and every output, and marks the declared result", () => {
    const brief = stepBrief({ workflowName: "Contrato mensal", step: step(), index: 1, total: 3 });
    expect(brief).toContain("INPUT numbers.csv");
    expect(brief).toContain("OUTPUT decision.json=result(JSON), notes.md");
    expect(brief).toContain("approval=request card(request_credential)");
    expect(brief).toContain("show_widget does not pause");
  });

  it("keeps the contract compact and English", () => {
    const brief = stepBrief({ workflowName: "Contrato mensal", step: step(), index: 1, total: 3 });
    expect(brief.split("\n")).toHaveLength(9);
    expect(brief).toContain("CONTRACT v1");
    expect(brief).not.toContain("Files to read from input/");
  });

  it("encodes an optional parameter with its rule and an enum's closed values", () => {
    const brief = stepBrief({
      workflowName: "Contrato mensal",
      step: step({
        parameters: [
          { name: "regime", type: "enum", values: ["escala", "mesa"], required: true },
          { name: "fim", type: "date", required: false, whenAbsent: "rule:periodo_padrao" },
        ],
      }),
      index: 0,
      total: 1,
    });
    expect(brief).toContain("PARAMS regime:enum[escala|mesa]!, fim:date?whenAbsent=rule:periodo_padrao");
  });

  it("says so when the first step has no input files", () => {
    const brief = stepBrief({ workflowName: "Contrato mensal", step: step({ inputs: [] }), index: 0, total: 1 });
    expect(brief).toContain("INPUT none");
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
