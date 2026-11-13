// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WorkflowSkillOptions } from "../../../shared/workflow";
import { StudioBalloon } from "./StudioBalloon";
import { createStep, newDraft } from "./studio-model";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const options: WorkflowSkillOptions = {
  bot: [
    { name: "own", label: "own", description: "Own skill", available: true },
    { name: "disabled", label: "disabled", description: "Disabled skill", available: false },
  ],
  bundled: [{ name: "create-bot", label: "Create a Bot", description: "Bundled skill", available: true }],
  imported: [{ name: "from-claude", label: "from-claude", description: "Imported skill", available: true }],
};

const draft = createStep(newDraft("Financeiro"), "agent", { x: 200, y: 200 }, "bot-a").draft;
const step = draft.steps[0]!;

let roots: Root[] = [];

function draw(optionsValue: WorkflowSkillOptions = options, stepValue = step) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const onChange = vi.fn();
  act(() => {
    root.render(createElement(StudioBalloon, {
      draft,
      step: stepValue,
      branch: "skills",
      anchor: { left: 100, top: 100, width: 240, height: 112, right: 340, bottom: 212 } as DOMRect,
      bots: [{ id: "bot-a", name: "A" }],
      scripts: {},
      skillOptions: optionsValue,
      onChange,
      onScript: () => {},
      onRenameScript: () => {},
      onToast: () => {},
      onDisconnect: () => {},
      onClose: () => {},
    }));
  });
  return { container, onChange };
}

const click = (node: Element) => {
  act(() => { node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); });
};

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  roots = [];
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("StudioBalloon skills", () => {
  it("shows the three groups, each starting off", () => {
    const { container } = draw();
    expect(container.textContent).toContain("Bot skills");
    expect(container.textContent).toContain("App skills");
    expect(container.textContent).toContain("From this computer");
    const groups = container.querySelectorAll(".studio-field > .studio-check > input");
    expect(groups).toHaveLength(3);
    for (const input of groups) expect((input as HTMLInputElement).checked).toBe(false);
  });

  it("turning a group on pre-selects every available option", () => {
    const { container, onChange } = draw();
    const botToggle = container.querySelectorAll<HTMLInputElement>(".studio-field > .studio-check > input")[0]!;
    click(botToggle);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0]).toEqual({ skills: { bot: ["own"] } });
  });

  it("marks an unavailable option as disabled and keeps it out of select-all", () => {
    const selected = { ...step, skills: { bot: ["own"] } } as typeof step;
    const { container } = draw(options, selected);
    expect(container.textContent).toContain("Select all available");
    const unavailable = [...container.querySelectorAll<HTMLLabelElement>(".studio-check-list label")]
      .find((label) => label.textContent?.includes("disabled"));
    expect(unavailable).toBeDefined();
    expect(unavailable!.querySelector<HTMLInputElement>("input")!.disabled).toBe(true);
  });
});
