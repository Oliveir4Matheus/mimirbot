import { describe, expect, it } from "vitest";

import { workflowDefinitionSchema } from "../../shared/workflow.ts";
import { workflowApprovalHash } from "./approval.ts";

const definition = workflowDefinitionSchema.parse({
  id: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
  version: 1,
  name: "Cobrança",
  department: "Financeiro",
  createdAt: 1,
  updatedAt: 1,
  steps: [{ id: "a", kind: "script", name: "A", run: "a.mjs", outputs: [{ path: "result.json" }], result: "result.json" }],
});

const scripts = [{ name: "a.mjs", content: "console.log('ok')\n" }];

describe("workflow approval hash", () => {
  it("is stable for the same definition and script order", () => {
    expect(workflowApprovalHash(definition, scripts)).toBe(workflowApprovalHash(definition, [{ ...scripts[0]! }]));
  });

  it("changes with one byte of the definition or the script", () => {
    const base = workflowApprovalHash(definition, scripts);
    const renamed = workflowApprovalHash({ ...definition, name: "Cobrança 2" }, scripts);
    const changed = workflowApprovalHash(definition, [{ name: "a.mjs", content: "console.log('ok')\n " }]);
    expect(renamed).not.toBe(base);
    expect(changed).not.toBe(base);
  });
});
