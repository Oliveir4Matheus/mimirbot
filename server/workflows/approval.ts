// An approval is tied to the bytes the person saw: the definition, every
// script, and the parameter declarations. Notes and review rounds are not part
// of it, so annotating does not invalidate a review.
import { createHash } from "node:crypto";

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

export function workflowApprovalHash(definition: WorkflowDefinition, scripts: readonly ApprovalScript[] = []): string {
  const sortedScripts = [...scripts]
    .map((script) => ({ name: script.name, content: script.content }))
    .sort((left, right) => left.name.localeCompare(right.name));
  return createHash("sha256").update(stable({ definition, scripts: sortedScripts })).digest("hex");
}
