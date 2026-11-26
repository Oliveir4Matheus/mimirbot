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
const interview = { recurring: true, changes: "Só as datas", confirmer: "Eu confirmo" };

describe("workflow approval hash", () => {
  it("is stable for the same definition and script order", () => {
    expect(workflowApprovalHash(definition, scripts, interview)).toBe(workflowApprovalHash(definition, [{ ...scripts[0]! }], interview));
  });

  it("changes with one byte of the definition or the script", () => {
    const base = workflowApprovalHash(definition, scripts, interview);
    const renamed = workflowApprovalHash({ ...definition, name: "Cobrança 2" }, scripts, interview);
    const changed = workflowApprovalHash(definition, [{ name: "a.mjs", content: "console.log('ok')\n " }], interview);
    expect(renamed).not.toBe(base);
    expect(changed).not.toBe(base);
  });

  it("changes with one byte of an interview answer", () => {
    const base = workflowApprovalHash(definition, scripts, interview);
    expect(workflowApprovalHash(definition, scripts, { ...interview, changes: "Só o cliente" })).not.toBe(base);
    expect(workflowApprovalHash(definition, scripts, { ...interview, confirmer: "A Ana" })).not.toBe(base);
    expect(workflowApprovalHash(definition, scripts, { ...interview, recurring: false })).not.toBe(base);
  });

  it("does not carry the moment of confirmation", () => {
    const base = workflowApprovalHash(definition, scripts, interview);
    const stamped = { ...interview, confirmedAt: 1_794_715_726_827, confirmedBy: "user" };
    expect(workflowApprovalHash(definition, scripts, stamped)).toBe(base);
  });
});
