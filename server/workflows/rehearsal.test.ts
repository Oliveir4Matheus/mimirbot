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

  it("counts a proposal with no script as passed, since there is nothing to test", async () => {
    const built = proposal(script);
    built.definition.steps = [{
      id: "revisar", kind: "bot", name: "Revisar", botId: "bot-a", instructions: "Reveja.",
      inputs: [], parameters: [], outputs: [{ path: "result.json", required: true }], result: "result.json", timeoutMs: 0, mode: "manual",
    }];
    built.scripts = [];
    const result = await rehearseProposal(built, {});
    expect(result.status).toBe("passed");
    expect(result.steps[0]).toMatchObject({ label: "untested" });
  });

  it("refuses a Windows-style or absolute example file name", async () => {
    const result = await rehearseProposal(proposal(script), { files: [{ name: "..\\secret.txt", content: "x" }] });
    expect(result.status).toBe("diverged");
    expect(result.steps[0]).toMatchObject({ id: "example", label: "diverged" });
  });

  const manualFirst = (body: string) => workflowProposalSchema.parse({
    id: "9b6c2d3e-4f5a-4b6c-8d9e-0f1a2b3c4d5e",
    department: "Financeiro",
    status: "draft",
    createdAt: 1,
    updatedAt: 1,
    interview: { recurring: true, changes: "Datas", confirmer: "Eu" },
    annotations: {},
    rounds: 0,
    definition: workflowDefinitionSchema.parse({
      id: "9b6c2d3e-4f5a-4b6c-8d9e-0f1a2b3c4d5e",
      version: 1,
      name: "Corte por pessoa",
      department: "Financeiro",
      createdAt: 1,
      updatedAt: 1,
      steps: [
        {
          id: "definir-corte", kind: "bot", name: "Definir o corte", botId: "bot-a", mode: "manual",
          instructions: "Pergunte o corte e escreva output/corte.json.",
          parameters: [{ name: "dias", type: "integer", collectedBy: "definir-corte" }],
          outputs: [{ path: "corte.json", required: true }],
        },
        {
          id: "calcular", kind: "script", name: "Calcular", run: "calcular.mjs",
          inputs: [{ as: "corte.json", from: { step: "definir-corte", output: "corte.json" } }],
          outputs: [{ path: "result.json" }], result: "result.json",
        },
      ],
    }),
    scripts: [{ name: "calcular.mjs", content: body }],
  });

  const readsCutoff = `import { readFileSync, writeFileSync } from "node:fs";
const corte = JSON.parse(readFileSync("input/corte.json", "utf8"));
writeFileSync("output/result.json", JSON.stringify({ dias: corte.dias }));
`;

  it("tests a script fed by a bot step when the person supplies the example file", async () => {
    const result = await rehearseProposal(manualFirst(readsCutoff), {
      files: [{ name: "corte.json", content: JSON.stringify({ dias: 3 }) }],
    });
    expect(result.status).toBe("passed");
    expect(result.steps.find((step) => step.id === "definir-corte")).toMatchObject({ label: "untested" });
    expect(result.steps.find((step) => step.id === "calcular")).toMatchObject({ label: "passed", produced: ["result.json"] });
    expect(result.example).toEqual(["corte.json"]);
  });

  it("keeps that script untested when no example file is supplied", async () => {
    const result = await rehearseProposal(manualFirst(readsCutoff), {});
    expect(result.status).toBe("untested");
    expect(result.steps.find((step) => step.id === "calcular")).toMatchObject({
      label: "untested",
      detail: "its input corte.json comes from definir-corte, which a rehearsal does not run; add an example file to test it",
    });
  });
});
