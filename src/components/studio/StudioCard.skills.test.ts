// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioCard } from "./StudioCard";
import { createStep, newDraft } from "./studio-model";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const draft = createStep(newDraft("Financeiro"), "agent", { x: 200, y: 200 }, "bot-a").draft;
const step = draft.steps[0]!;
let roots: Root[] = [];

function draw(stepValue = step) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const onBranch = vi.fn();
  act(() => {
    root.render(createElement(StudioCard, {
      draft,
      step: stepValue,
      index: 0,
      selected: false,
      botName: () => "A",
      onSelect: () => {},
      onDragStart: () => {},
      onEntry: () => {},
      onBranch,
      onPort: () => {},
      onRename: () => {},
      onDuplicate: () => {},
      onDelete: () => {},
    }));
  });
  return { container, onBranch };
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

describe("StudioCard skills", () => {
  it("shows an agent step with no skills", () => {
    const { container } = draw();
    expect(container.querySelector('[data-studio-branch="skills"]')?.textContent).toContain("No skills");
  });

  it("counts the selected skills and opens the skills branch", () => {
    const selected = { ...step, skills: { bot: ["own"], bundled: ["create-bot"] } } as typeof step;
    const { container, onBranch } = draw(selected);
    const branch = container.querySelector('[data-studio-branch="skills"]')!;
    expect(branch.textContent).toContain("2 skills");
    click(branch);
    expect(onBranch).toHaveBeenCalledWith("skills", expect.anything());
  });
});
