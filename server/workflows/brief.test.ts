import { describe, expect, it } from "vitest";

import type { BotWorkflowStep } from "../../shared/workflow.ts";
import { WORKFLOW_APPROVAL_RULE } from "../../shared/workflow-approval.ts";
import { WORKFLOW_STEP_PROMPT } from "../system-prompt.ts";
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
  outputs: [{ path: "decision.json", required: true }, { path: "notes.md", required: true }, { path: "clip.mp4", required: true }],
  ...overrides,
});

describe("stepBrief", () => {
  it("names the workflow, the position and the instruction", () => {
    const brief = stepBrief({ workflowName: "Contrato mensal", step: step(), index: 1, total: 3 });
    expect(brief).toContain('WORKFLOW "Contrato mensal" · STEP 2/3 "Review the numbers"');
    expect(brief).toContain("Check the numbers and answer with a decision.");
  });

  it("lists every input and every output with its format class", () => {
    const brief = stepBrief({ workflowName: "Contrato mensal", step: step(), index: 1, total: 3 });
    expect(brief).toContain("INPUT numbers.csv");
    expect(brief).toContain("OUTPUT decision.json (JSON), notes.md (texto), clip.mp4 (arquivo)");
    expect(brief).toContain(WORKFLOW_APPROVAL_RULE);
    expect(brief).toContain("show_widget does not pause");
  });

  it("states the approval rule in the same words as the step prompt", () => {
    const brief = stepBrief({ workflowName: "Contrato mensal", step: step(), index: 1, total: 3 });
    expect(WORKFLOW_STEP_PROMPT).toContain(WORKFLOW_APPROVAL_RULE);
    expect(brief).toContain(WORKFLOW_APPROVAL_RULE);
    expect(WORKFLOW_STEP_PROMPT).not.toContain("Do not ask the person anything");
  });

  it("keeps the contract compact and English", () => {
    const brief = stepBrief({ workflowName: "Contrato mensal", step: step(), index: 1, total: 3 });
    expect(brief.split("\n")).toHaveLength(9);
    expect(brief).toContain("CONTRACT v1");
    expect(brief).not.toContain("=result");
    expect(brief).not.toContain("Files to read from input/");
  });

  it("encodes an optional parameter with its rule and an enum's closed values", () => {
    const brief = stepBrief({
      workflowName: "Contrato mensal",
      step: step({
        parameters: [
          { name: "regime", type: "enum", values: ["escala", "mesa"], required: true, list: false },
          { name: "fim", type: "date", required: false, whenAbsent: "rule:periodo_padrao", list: false },
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

  it("asks for collected fields and says the run waits for that answer", () => {
    const brief = stepBrief({
      workflowName: "Contrato mensal",
      step: step({ mode: "manual", parameters: [{ name: "link", type: "string", required: true, list: false, collectedBy: "revisar" }] }),
      index: 0,
      total: 1,
    });
    expect(brief).toContain("COLLECT link:string");
    expect(brief).toContain("asks the person for the fields above");
    expect(brief).not.toContain("do not ask in the chat");
  });

  it("tells a manual step that collects nothing not to ask in the chat", () => {
    const brief = stepBrief({
      workflowName: "Contrato mensal",
      step: step({ mode: "manual" }),
      index: 0,
      total: 1,
    });
    expect(brief).not.toContain("COLLECT");
    expect(brief).toContain("this manual step receives no collected value");
    expect(brief).toContain("do not ask in the chat");
    expect(brief).toContain("write the outputs from input/ and params.json");
  });
});

describe("stepThreadTitle", () => {
  it("carries the workflow, the step and the run", () => {
    expect(stepThreadTitle("Contrato mensal", step(), "20261103-123456-abcdef")).toBe("Contrato mensal · Review the numbers · 20261103-123456-abcdef");
  });
});
