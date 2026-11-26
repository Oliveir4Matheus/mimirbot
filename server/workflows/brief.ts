// The step brief is a compact, English contract generated from the definition.
// Same step, same words. It tells the bot only what the engine cannot infer:
// the task, the files with their format, the parameters and the approval rule.
import { isWorkflowJsonPath, type BotWorkflowStep, type StepOutput } from "../../shared/workflow.ts";
import { WORKFLOW_APPROVAL_RULE } from "../../shared/workflow-approval.ts";

function parameterLine(step: BotWorkflowStep): string | undefined {
  if (step.parameters.length === 0) return undefined;
  return step.parameters.map((parameter) => {
    const values = parameter.type === "enum" ? `[${(parameter.values ?? []).join("|")}]` : "";
    const optional = parameter.required ? "!" : `?whenAbsent=${parameter.whenAbsent}`;
    const type = parameter.list ? `list[${parameter.type}]` : parameter.type;
    return `${parameter.name}:${type}${values}${optional}`;
  }).join(", ");
}

/** The fields this step asks the person for; every other step stays silent. */
function collectLine(step: BotWorkflowStep): string | undefined {
  const collected = step.parameters.filter((parameter) => parameter.collectedBy === step.id);
  if (collected.length === 0) return undefined;
  return collected.map((parameter) => `${parameter.name}:${parameter.list ? `list[${parameter.type}]` : parameter.type}`).join(", ");
}

/** How the brief names a file's format: the extension decides, never a second field. */
function formatLabel(output: StepOutput): string {
  if (isWorkflowJsonPath(output.path)) return "JSON";
  const extension = output.path.slice(output.path.lastIndexOf(".") + 1).toLowerCase();
  return extension === "txt" || extension === "md" || extension === "csv" ? "texto" : "arquivo";
}

function outputLine(step: BotWorkflowStep): string {
  return step.outputs.map((output) => {
    const optional = output.required ? "" : " (optional)";
    return `${output.path} (${formatLabel(output)})${optional}`;
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
  const collected = collectLine(step);
  if (collected) lines.push(`COLLECT ${collected}`);
  lines.push(`OUTPUT ${outputLine(step)}`);
  lines.push(collected
    ? `RULES read input/, write only output/, end turn; this step asks the person for the fields above, and the run waits for that answer before it starts; ${WORKFLOW_APPROVAL_RULE}; show_widget does not pause; engine verifies outputs.`
    : step.mode === "manual"
      ? `RULES read input/, write only output/, end turn; this manual step receives no collected value, so the person only releases it: do not ask in the chat, write the outputs from input/ and params.json; ${WORKFLOW_APPROVAL_RULE}; show_widget does not pause; engine verifies outputs.`
      : `RULES read input/, write only output/, end turn; ${WORKFLOW_APPROVAL_RULE}; show_widget does not pause; engine verifies outputs.`);
  return lines.join("\n");
}

export function stepThreadTitle(workflowName: string, step: BotWorkflowStep, runId: string): string {
  return `${workflowName} · ${step.name} · ${runId}`;
}
