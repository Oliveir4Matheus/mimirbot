// The step brief is built from the definition alone: same step, same words.
// It lists the files the step receives and the files it must leave, so the
// bot never has to infer the contract from the previous conversation.
import type { BotWorkflowStep } from "../../shared/workflow.ts";

export function stepBrief(input: {
  workflowName: string;
  step: BotWorkflowStep;
  index: number;
  total: number;
}): string {
  const { workflowName, step, index, total } = input;
  const lines = [
    `Workflow: ${workflowName}`,
    `Step ${index + 1} of ${total}: ${step.name}`,
    "",
    step.instructions,
    "",
  ];
  if (step.inputs.length > 0) {
    lines.push("Files to read from input/:", ...step.inputs.map((entry) => `- input/${entry.as}`), "");
  } else {
    lines.push("This step has no input files.", "");
  }
  lines.push("Files to write in output/:");
  for (const output of step.outputs) {
    const result = output.path === step.result ? " (this step's result: a JSON object)" : "";
    lines.push(`- output/${output.path}${result}`);
  }
  lines.push("", "Write the files inside output/ and end your turn. The engine verifies them before the next step starts.");
  return lines.join("\n");
}

export function stepThreadTitle(workflowName: string, step: BotWorkflowStep, runId: string): string {
  return `${workflowName} · ${step.name} · ${runId}`;
}
