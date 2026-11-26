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

const proposal = (overrides: Record<string, unknown> = {}) => workflowProposalSchema.parse({
  id: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
  department: "Financeiro",
  status: "draft",
  createdAt: 1,
  updatedAt: 1,
  interview: { recurring: true, changes: "Só as datas", confirmer: "Eu confirmo", confirmedAt: 1_794_715_726_827, confirmedBy: "user" },
  assumptions: [],
  definition,
  scripts: [{ name: "coletar.mjs", content: "console.log('ok')\n" }],
  rehearsal: { at: 1, status: "passed", steps: [{ id: "coletar", name: "Coletar", label: "passed" }] },
  ...overrides,
});

const blockedDefinition = workflowDefinitionSchema.parse({
  ...definition,
  steps: [{ ...definition.steps[0], outputs: [{ path: "dados" }] }],
});

const render = (proposalId: ReturnType<typeof proposal>, extra: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(ProposalPreview, {
  proposal: proposalId,
  busy: false,
  onClose: () => {},
  onNote: () => {},
  onRehearse: () => {},
  onRound: () => {},
  onConfirm: () => {},
  onCreate: () => {},
  ...extra,
}));

/** The opening tag of the button that carries this label. */
function buttonTag(markup: string, label: string): string {
  const labelAt = markup.indexOf(label);
  expect(labelAt, `no button labelled ${label}`).toBeGreaterThan(-1);
  const start = markup.lastIndexOf("<button", labelAt);
  return markup.slice(start, markup.indexOf(">", labelAt) + 1);
}

describe("ProposalPreview interview gate", () => {
  it("shows the three questions with the bot's answers", () => {
    const markup = render(proposal());
    expect(markup).toContain(t("workflows.proposals.interviewTitle"));
    expect(markup).toContain(t("workflows.proposals.recurring"));
    expect(markup).toContain(t("workflows.proposals.changes"));
    expect(markup).toContain(t("workflows.proposals.confirmer"));
    expect(markup).toContain("Só as datas");
    expect(markup).toContain("Eu confirmo");
    expect(markup).toContain(t("workflows.proposals.interviewConfirmed", { when: new Date(1_794_715_726_827).toLocaleString() }));
  });

  it("disables Criar Workflow until the person confirms", () => {
    const markup = render(proposal({ interview: { recurring: true, changes: "Só as datas", confirmer: "Eu confirmo" } }));
    expect(buttonTag(markup, t("workflows.proposals.create"))).toContain('disabled=""');
    expect(markup).toContain(t("workflows.proposals.interviewCreateBlocked"));
  });

  it("enables Criar Workflow once the answers are confirmed and the rehearsal passed", () => {
    const markup = render(proposal());
    expect(buttonTag(markup, t("workflows.proposals.create"))).not.toContain('disabled=""');
  });
});

describe("ProposalPreview shell", () => {
  it("has a fixed 86vh body that scrolls, with the header and footer outside it", () => {
    const markup = render(proposal());
    expect(markup).toContain("h-[86vh]");
    expect(markup).toContain("max-w-[780px]");
    expect(markup).toContain("flex-col");
    expect(markup).toContain("overflow-y-auto");
    expect(markup).toContain("flex-none");
    expect(buttonTag(markup, t("workflows.proposals.close"))).toContain("size-10");
  });

  it("has no justification field in any state", () => {
    for (const state of [proposal(), proposal({ rehearsal: undefined }), proposal({ definition: blockedDefinition })]) {
      const markup = render(state, { onSendError: () => {} });
      expect(markup).not.toContain("proposal-acknowledge");
      expect(markup).not.toContain("Why create it without a passing rehearsal?");
      expect(markup).not.toContain("Create anyway");
      expect(markup).toContain(t("workflows.proposals.create"));
    }
  });
});

describe("ProposalPreview rehearsal states", () => {
  it("shows no rehearsal in amber and blocks the create", () => {
    const markup = render(proposal({ rehearsal: undefined }));
    expect(markup).toContain(t("workflows.proposals.sealUntested"));
    expect(markup).toContain(t("workflows.proposals.rehearsalNone"));
    expect(buttonTag(markup, t("workflows.proposals.runRehearsal"))).not.toContain('disabled=""');
    expect(buttonTag(markup, t("workflows.proposals.create"))).toContain('disabled=""');
  });

  it("shows passed in green and blocks a second rehearsal", () => {
    const markup = render(proposal());
    expect(markup).toContain(t("workflows.proposals.sealPassed"));
    expect(markup).toContain(t("workflows.proposals.rehearsalPassedLine"));
    expect(buttonTag(markup, t("workflows.proposals.rehearsalDone"))).toContain('disabled=""');
    expect(buttonTag(markup, t("workflows.proposals.create"))).not.toContain('disabled=""');
  });

  it("lists a diverged script as a real error and returns the seal to no rehearsal", () => {
    const markup = render(proposal({
      rehearsal: {
        at: 1,
        status: "diverged",
        steps: [
          { id: "coletar", name: "Coletar", label: "diverged", detail: "exit 1 · TypeError: boom" },
          { id: "revisar", name: "Revisar", label: "untested", detail: "needs the bot engine" },
        ],
      },
    }));
    expect(markup).toContain(t("workflows.proposals.sealUntested"));
    expect(markup).not.toContain(t("workflows.proposals.sealPassed"));
    expect(markup).toContain(t("workflows.proposals.rehearsalDivergedTitle"));
    expect(markup).toContain("steps.0");
    expect(markup).toContain("Coletar: exit 1 · TypeError: boom");
    expect(markup).not.toContain("Revisar: needs the bot engine");
    expect(buttonTag(markup, t("workflows.proposals.create"))).toContain('disabled=""');
  });

  it("blocks the rehearsal while authoring is broken, and hides an old divergence", () => {
    const markup = render(proposal({
      definition: blockedDefinition,
      rehearsal: { at: 1, status: "diverged", steps: [{ id: "coletar", name: "Coletar", label: "diverged", detail: "old run" }] },
    }));
    expect(markup).toContain(t("workflows.proposals.sealBlocked"));
    expect(markup).toContain(t("workflows.proposals.authoringErrors"));
    expect(markup).toContain("steps.0.outputs.0.path");
    expect(markup).not.toContain("old run");
    expect(buttonTag(markup, t("workflows.proposals.runRehearsal"))).toContain('disabled=""');
    expect(buttonTag(markup, t("workflows.proposals.runRehearsal"))).toContain(t("workflows.proposals.rehearsalBlocked"));
    expect(buttonTag(markup, t("workflows.proposals.create"))).toContain('disabled=""');
  });
});
