// The step brief is a compact, English contract generated from the definition.
// Same step, same words. It tells the bot only what the engine cannot infer:
// the task, the files, the parameters, the proof and the approval rule.
import type { BotWorkflowStep } from "../../shared/workflow.ts";

function parameterLine(step: BotWorkflowStep): string | undefined {
  if (step.parameters.length === 0) return undefined;
  return step.parameters.map((parameter) => {
    const values = parameter.type === "enum" ? `[${(parameter.values ?? []).join("|")}]` : "";
    const optional = parameter.required ? "!" : `?whenAbsent=${parameter.whenAbsent}`;
    return `${parameter.name}:${parameter.type}${values}${optional}`;
  }).join(", ");
}

function outputLine(step: BotWorkflowStep): string {
  return step.outputs.map((output) => {
    const optional = output.required ? "" : "?";
    const result = output.path === step.result ? "=result(JSON)" : "";
    return `${output.path}${optional}${result}`;
  }).join(", ");
}

export function stepBrief(input: {
  workflowName: string;
  step: BotWorkflowStep;
  index: number;
  total: number;
}): string {
  const { workflowName, step, index, total } = input;
  const lines = [
    `WORKFLOW "${workflowName}" · STEP ${index + 1}/${total} "${step.name}"`,
    "",
    "TASK",
    step.instructions,
    "",
    "CONTRACT v1",
    `INPUT ${step.inputs.length > 0 ? step.inputs.map((entry) => entry.as).join(", ") : "none"}`,
  ];
  const parameters = parameterLine(step);
  if (parameters) lines.push(`PARAMS ${parameters}`);
  lines.push(`OUTPUT ${outputLine(step)}`);
  lines.push("RULES read input/, write only output/, end turn; approval=request card(request_credential), show_widget does not pause; engine verifies outputs.");
  return lines.join("\n");
}

export function stepThreadTitle(workflowName: string, step: BotWorkflowStep, runId: string): string {
  return `${workflowName} · ${step.name} · ${runId}`;
}
