import { describe, expect, it } from "vitest";

import {
  evaluateProposal,
  isUnknownProposalAnswer,
  proposalDefinition,
  startManualDefinition,
  workflowProposalInputSchema,
  workflowProposalSchema,
} from "../shared/workflow-proposal.ts";

const id = "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d";

const input = {
  name: "Cobrança mensal",
  department: "Financeiro",
  createdAt: 10,
  interview: { recurring: true, changes: "Só as datas", confirmer: "Eu confirmo" },
  steps: [{
    id: "coletar",
    kind: "script",
    name: "Coletar",
    run: "coletar.mjs",
    outputs: [{ path: "dados.json" }],
    result: "dados.json",
  }],
};

describe("proposal interview", () => {
  it("refuses a one-time task", () => {
    expect(evaluateProposal({ recurring: false, changes: "", confirmer: "" })).toEqual({
      ok: false,
      error: "a one-time task is not a Workflow; finish the task instead of proposing one",
    });
  });

  it("turns an unanswered change or confirmer into an assumption instead of a block", () => {
    const evaluated = evaluateProposal({ recurring: true, changes: "não sei", confirmer: "" });
    expect(evaluated.ok).toBe(true);
    if (!evaluated.ok) return;
    expect(evaluated.assumptions).toHaveLength(2);
    expect(evaluated.assumptions[0]).toContain("O que muda");
    expect(evaluated.assumptions[1]).toContain("Quem confirma");
  });

  it("keeps a real answer and de-duplicates assumptions", () => {
    const evaluated = evaluateProposal(
      { recurring: true, changes: "Datas", confirmer: "Eu" },
      ["A planilha mantém o nome", "A planilha mantém o nome"],
    );
    expect(evaluated).toEqual({ ok: true, assumptions: ["A planilha mantém o nome"] });
    expect(isUnknownProposalAnswer("  Não sei ")).toBe(true);
    expect(isUnknownProposalAnswer("Só as datas")).toBe(false);
  });
});

describe("proposal definition", () => {
  it("builds a version-1 definition from the bot's flat input", () => {
    const parsed = workflowProposalInputSchema.parse(input);
    const built = proposalDefinition(parsed, id);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.definition).toMatchObject({ id, version: 1, name: "Cobrança mensal", department: "Financeiro", createdAt: 10 });
    expect(built.definition.steps[0]).toMatchObject({ id: "coletar", mode: "auto" });
  });

  it("refuses a condition as the first step instead of inventing an entry step", () => {
    const parsed = workflowProposalInputSchema.parse(input);
    const built = proposalDefinition(parsed, id);
    if (!built.ok) throw new Error(built.error);
    const conditionFirst = {
      ...built.definition,
      steps: [{ id: "escolher", kind: "condition", name: "Escolher", from: "x", conditions: [{ field: "ok", op: "equals", value: true }] }],
    } as typeof built.definition;
    expect(() => startManualDefinition(conditionFirst)).toThrow("must start with a bot or script step");
  });

  it("writes the execution gate on create and does not mutate the approved definition", () => {
    const parsed = workflowProposalInputSchema.parse(input);
    const built = proposalDefinition(parsed, id);
    if (!built.ok) throw new Error(built.error);
    const gated = startManualDefinition(built.definition);
    expect(gated.steps[0]).toMatchObject({ mode: "manual" });
    expect(built.definition.steps[0]).toMatchObject({ mode: "auto" });
    expect(startManualDefinition(gated)).toBe(gated);
  });

  it("keeps the proposal definition pointing at the proposal id", () => {
    const parsed = workflowProposalInputSchema.parse(input);
    const built = proposalDefinition(parsed, id);
    if (!built.ok) throw new Error(built.error);
    const proposal = workflowProposalSchema.parse({
      id,
      department: "Financeiro",
      status: "draft",
      createdAt: 10,
      updatedAt: 10,
      interview: parsed.interview,
      definition: built.definition,
      scripts: [],
    });
    expect(proposal.definition.id).toBe(proposal.id);
    expect(proposal.status).toBe("draft");
  });
});
