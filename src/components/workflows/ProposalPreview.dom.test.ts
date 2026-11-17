// @vitest-environment happy-dom
// The preview's own interactions: the two error bands send to the conversation
// that created the proposal, and the dialog closes by Escape or a click outside.
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    outputs: [{ path: "dados" }],
  }],
});

const proposal = (overrides: Record<string, unknown> = {}) => workflowProposalSchema.parse({
  id: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
  department: "Financeiro",
  status: "draft",
  createdAt: 1,
  updatedAt: 1,
  interview: { recurring: true, changes: "Só as datas", confirmer: "Eu confirmo", confirmedAt: 1, confirmedBy: "user" },
  assumptions: [],
  definition,
  scripts: [{ name: "coletar.mjs", content: "console.log('ok')\n" }],
  ...overrides,
});

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  flushSync(() => root.unmount());
  host.remove();
});

const render = (value: ReturnType<typeof proposal>, extra: Record<string, unknown> = {}) => {
  flushSync(() => root.render(createElement(ProposalPreview, {
    proposal: value,
    busy: false,
    onClose: () => {},
    onNote: () => {},
    onRehearse: () => {},
    onRound: () => {},
    onConfirm: () => {},
    onCreate: () => {},
    ...extra,
  })));
};

const button = (label: string): HTMLButtonElement => {
  const found = [...host.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes(label));
  if (!found) throw new Error(`no button labelled ${label}`);
  return found as HTMLButtonElement;
};

const click = (element: Element) => flushSync(() => {
  element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});

const mouseDown = (element: Element) => flushSync(() => {
  element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
});

describe("ProposalPreview error bands", () => {
  it("sends the real authoring list to the conversation that created the proposal", () => {
    const send = vi.fn();
    render(proposal({ createdBy: { botId: "bot-a", threadId: "thread-1" } }), { onSendError: send });
    click(button(t("workflows.proposals.sendToBot")));
    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0]![0] as string;
    expect(message).toContain("steps.0.outputs.0.path");
    expect(message).toContain("needs a file extension");
    expect(message).toContain("Cobrança mensal");
    expect(button(t("workflows.proposals.sentToBot")).disabled).toBe(true);
  });

  it("sends the real divergence detail from the rehearsal band", () => {
    const send = vi.fn();
    render(proposal({
      createdBy: { botId: "bot-a", threadId: "thread-1" },
      definition: workflowDefinitionSchema.parse({ ...definition, steps: [{ ...definition.steps[0], outputs: [{ path: "dados.json" }] }] }),
      rehearsal: { at: 1, status: "diverged", steps: [{ id: "coletar", name: "Coletar", label: "diverged", detail: "exit 1 · TypeError: boom" }] },
    }), { onSendError: send });
    click(button(t("workflows.proposals.sendToBot")));
    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0]![0] as string;
    expect(message).toContain("steps.0: Coletar: exit 1 · TypeError: boom");
    expect(message).not.toContain("example");
  });

  it("disables send with a tooltip when the proposal has no conversation", () => {
    const send = vi.fn();
    render(proposal(), { onSendError: send });
    const sendButton = button(t("workflows.proposals.sendToBot"));
    expect(sendButton.disabled).toBe(true);
    expect(sendButton.title).toBe(t("workflows.proposals.sendNoThread"));
    click(sendButton);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("ProposalPreview closing", () => {
  it("closes on Escape", () => {
    const close = vi.fn();
    render(proposal(), { onClose: close });
    flushSync(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("closes on a click outside and not on one inside", () => {
    const close = vi.fn();
    render(proposal(), { onClose: close });
    const panel = host.querySelector("[data-proposal-preview]")!;
    mouseDown(panel);
    expect(close).not.toHaveBeenCalled();
    mouseDown(host.querySelector('[role="dialog"]')!);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
