import { describe, expect, it } from "vitest";

import { workflowDefinitionSchema } from "./workflow.ts";
import { workflowProposalSchema } from "./workflow-proposal.ts";
import { proposalPreview } from "./workflow-proposal-preview.ts";

const proposal = workflowProposalSchema.parse({
  id: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
  department: "Financeiro",
  status: "draft",
  createdAt: 1,
  updatedAt: 1,
  interview: { recurring: true, changes: "Datas", confirmer: "Eu" },
  assumptions: ["O tom é cordial"],
  annotations: { coletar: "conferir a planilha" },
  rounds: 0,
  definition: workflowDefinitionSchema.parse({
    id: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
    version: 2,
    name: "Cobrança",
    department: "Financeiro",
    createdAt: 1,
    updatedAt: 1,
    steps: [
      {
        id: "coletar", kind: "script", name: "Coletar", run: "coletar.mjs",
        outputs: [{ path: "dados.json" }], result: "dados.json",
        parameters: [{ name: "inicio", type: "date", required: true }],
      },
      {
        id: "mensagem", kind: "bot", name: "Escrever", botId: "bot-a", instructions: "Uma mensagem por cliente.",
        inputs: [{ as: "dados.json", from: { step: "coletar", output: "dados.json" } }],
        outputs: [{ path: "mensagens.json" }], result: "mensagens.json", mode: "manual", timeoutMs: 0,
      },
    ],
  }),
  scripts: [{ name: "coletar.mjs", content: "import { readFileSync } from 'node:fs';\nfetch('https://x.test');\n" }],
});

describe("proposal preview", () => {
  it("derives Input, Process, Output and Proof for every step", () => {
    const preview = proposalPreview(proposal);
    expect(preview).toMatchObject({ title: "Cobrança", version: 2, department: "Financeiro" });
    expect(preview.steps[0]).toMatchObject({
      id: "coletar",
      input: ["params.json · inicio (date)"],
      process: "Executa coletar.mjs",
      output: ["dados.json"],
      proof: ["dados.json", "resultado JSON: dados.json"],
      note: "conferir a planilha",
    });
    expect(preview.steps[1]).toMatchObject({
      input: ["dados.json"],
      process: "Uma mensagem por cliente.",
      output: ["mensagens.json"],
      tags: ["bot", "manual"],
    });
  });

  it("shows assumptions, the script's code and non-blocking warnings", () => {
    const preview = proposalPreview(proposal);
    expect(preview.assumptions).toEqual(["O tom é cordial"]);
    expect(preview.steps[0]!.code?.content).toContain("fetch");
    expect(preview.scriptWarnings).toEqual([{ step: "Coletar", warning: "usa a rede" }]);
  });
});
