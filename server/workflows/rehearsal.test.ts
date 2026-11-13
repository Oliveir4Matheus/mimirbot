import { describe, expect, it } from "vitest";

import { workflowDefinitionSchema } from "../../shared/workflow.ts";
import { workflowProposalSchema } from "../../shared/workflow-proposal.ts";
import { rehearseProposal } from "./rehearsal.ts";

const proposal = (script: string, expected?: string) => workflowProposalSchema.parse({
  id: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
  department: "Financeiro",
  status: "draft",
  createdAt: 1,
  updatedAt: 1,
  interview: { recurring: true, changes: "Datas", confirmer: "Eu" },
  annotations: {},
  rounds: 0,
  definition: workflowDefinitionSchema.parse({
    id: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
    version: 1,
    name: "Cálculo",
    department: "Financeiro",
    createdAt: 1,
    updatedAt: 1,
    steps: [{
      id: "calcular", kind: "script", name: "Calcular", run: "calcular.mjs",
      outputs: [{ path: "result.json" }], result: "result.json",
      parameters: [{ name: "total", type: "integer", required: true }],
    }],
  }),
  scripts: [{ name: "calcular.mjs", content: script }],
  ...(expected ? { rehearsal: { at: 1, status: "passed" as const, steps: [] } } : {}),
});

const script = `import { readFileSync, writeFileSync } from "node:fs";
const params = JSON.parse(readFileSync("input/params.json", "utf8"));
writeFileSync("output/result.json", JSON.stringify({ total: params.total * 2 }));
`;

describe("proposal rehearsal", () => {
  it("runs the script in a disposable folder and compares the output", async () => {
    const result = await rehearseProposal(proposal(script), {
      inputs: { total: 21 },
      expected: { "result.json": JSON.stringify({ total: 42 }) },
    });
    expect(result.status).toBe("passed");
    expect(result.steps[0]).toMatchObject({ id: "calcular", label: "passed", produced: ["result.json"] });
  });

  it("marks a different output as diverged and does not leave a run folder", async () => {
    const result = await rehearseProposal(proposal(script), {
      inputs: { total: 21 },
      expected: { "result.json": JSON.stringify({ total: 41 }) },
    });
    expect(result.status).toBe("diverged");
    expect(result.steps[0]).toMatchObject({ label: "diverged" });
  });

  it("marks a bot step untested instead of pretending it ran", async () => {
    const built = proposal(script);
    built.definition.steps.push({
      id: "revisar", kind: "bot", name: "Revisar", botId: "bot-a", instructions: "Reveja.",
      inputs: [], parameters: [], outputs: [{ path: "result.json", required: true }], result: "result.json", timeoutMs: 0, mode: "manual",
    });
    const result = await rehearseProposal(built, { inputs: { total: 1 } });
    expect(result.steps.find((step) => step.id === "revisar")).toMatchObject({ label: "untested" });
  });
});
