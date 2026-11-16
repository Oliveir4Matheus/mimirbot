import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { t } from "@/lib/i18n";
import { workflowDefinitionSchema } from "../../../shared/workflow";
import { workflowProposalSchema } from "../../../shared/workflow-proposal";
import { ProposalPreview } from "./ProposalPreview";

const definition = workflowDefinitionSchema.parse({
  id: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
  version: 1,
  name: "Cobrança mensal",
  department: "Financeiro",
  createdAt: 1,
  updatedAt: 1,
  steps: [{
    id: "coletar", kind: "script", name: "Coletar", run: "coletar.mjs", mode: "manual",
    parameters: [{ name: "link", type: "string", collectedBy: "coletar" }],
    outputs: [{ path: "dados.json" }],
  }],
});

const proposal = (interview: Record<string, unknown>) => workflowProposalSchema.parse({
  id: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
  department: "Financeiro",
  status: "draft",
  createdAt: 1,
  updatedAt: 1,
  interview: { recurring: true, changes: "Só as datas", confirmer: "Eu confirmo", ...interview },
  assumptions: [],
  definition,
  scripts: [{ name: "coletar.mjs", content: "console.log('ok')\n" }],
  rehearsal: { at: 1, status: "passed", steps: [{ id: "coletar", name: "Coletar", label: "passed" }] },
});

const render = (proposalId: ReturnType<typeof proposal>) => renderToStaticMarkup(createElement(ProposalPreview, {
  proposal: proposalId,
  busy: false,
  onClose: () => {},
  onNote: () => {},
  onRehearse: () => {},
  onRound: () => {},
  onConfirm: () => {},
  onCreate: () => {},
}));

/** The opening tag of the button that carries this label. */
function buttonTag(markup: string, label: string): string {
  const labelAt = markup.indexOf(label);
  expect(labelAt, `no button labelled ${label}`).toBeGreaterThan(-1);
  const start = markup.lastIndexOf("<button", labelAt);
  return markup.slice(start, labelAt);
}

describe("ProposalPreview interview gate", () => {
  it("shows the three questions with the bot's answers", () => {
    const markup = render(proposal({}));
    expect(markup).toContain(t("workflows.proposals.interviewTitle"));
    expect(markup).toContain(t("workflows.proposals.recurring"));
    expect(markup).toContain(t("workflows.proposals.changes"));
    expect(markup).toContain(t("workflows.proposals.confirmer"));
    expect(markup).toContain("Só as datas");
    expect(markup).toContain("Eu confirmo");
    expect(markup).toContain(t("workflows.proposals.interviewPending"));
  });

  it("disables Criar Workflow until the person confirms", () => {
    const markup = render(proposal({}));
    expect(buttonTag(markup, t("workflows.proposals.create"))).toContain('disabled=""');
    expect(markup).toContain(t("workflows.proposals.interviewCreateBlocked"));
  });

  it("enables Criar Workflow once the answers are confirmed", () => {
    const markup = render(proposal({ confirmedAt: 1_794_715_726_827, confirmedBy: "user" }));
    expect(buttonTag(markup, t("workflows.proposals.create"))).not.toContain('disabled=""');
    expect(markup).toContain(t("workflows.proposals.interviewConfirmed", { when: new Date(1_794_715_726_827).toLocaleString() }));
  });
});
