// An approval is tied to the bytes the person saw: the definition, every
// script, and the interview answers. The confirmation stamp is not part of it,
// so re-confirming the same answers keeps the same hash.
import { createHash } from "node:crypto";

import type { WorkflowProposalAnswers } from "../../shared/workflow-proposal.ts";
import type { WorkflowDefinition } from "../../shared/workflow.ts";

export interface ApprovalScript {
  name: string;
  content: string;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
}

export function workflowApprovalHash(
  definition: WorkflowDefinition,
  scripts: readonly ApprovalScript[],
  interview: WorkflowProposalAnswers,
): string {
  const sortedScripts = [...scripts]
    .map((script) => ({ name: script.name, content: script.content }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const answers = { recurring: interview.recurring, changes: interview.changes, confirmer: interview.confirmer };
  return createHash("sha256").update(stable({ definition, scripts: sortedScripts, interview: answers })).digest("hex");
}
