// @vitest-environment happy-dom
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioCard } from "./StudioCard";
import { StudioLoopModal } from "./StudioLoopModal";
import { bodyDraft, createStep, newDraft, withBodyDraft, type StudioDraft } from "./studio-model";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let roots: Root[] = [];

function loopDraft(): { draft: StudioDraft; loopId: string; bodyId: string } {
  let draft = { ...newDraft("Financeiro"), name: "Lote" };
  const created = createStep(draft, "loop", { x: 300, y: 300 });
  draft = created.draft;
  const loopId = created.stepId;
  let body = bodyDraft(draft, loopId)!;
  const bodyStep = createStep(body, "script", { x: 120, y: 120 });
  body = bodyStep.draft;
  const bodyId = bodyStep.stepId;
  draft = withBodyDraft(draft, loopId, body);
  draft = {
    ...draft,
    steps: draft.steps.map((step) => step.id === loopId && step.kind === "loop"
      ? { ...step, from: bodyId, outputs: [{ path: "result.json", required: true }], result: "result.json" }
      : step),
  };
  return { draft, loopId, bodyId };
}

function draw(node: ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => { root.render(node); });
  return container;
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

describe("Do While card", () => {
  it("shows the body count, the condition summary and the expand button", () => {
    const { draft, loopId } = loopDraft();
    const step = draft.steps[0]!;
    const onExpand = vi.fn();
    const onBranch = vi.fn();
    const container = draw(createElement(StudioCard, {
      draft,
      step,
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
      onExpand,
    }));
    expect(container.textContent).toContain("body · 1 steps");
    expect(container.querySelector('[data-studio-branch="condition"]')?.textContent).toContain("Stop when");
    const expand = container.querySelector('[aria-label="Edit Do While body"]');
    expect(expand).not.toBeNull();
    click(expand!);
    expect(onExpand).toHaveBeenCalledOnce();
    click(container.querySelector('[data-studio-branch="condition"]')!);
    expect(onBranch).toHaveBeenCalledWith("condition", expect.anything());
    expect(container.querySelector('[data-studio-branch="run"]')).not.toBeNull();
    expect(container.querySelector('[data-studio-branch="failure"]')).not.toBeNull();
    expect(draft.steps[0]!.id).toBe(loopId);
  });
});

describe("Do While substudio", () => {
  it("renders the body, the two markers and a palette without Do While", () => {
    const { draft, loopId } = loopDraft();
    const container = draw(createElement(StudioLoopModal, {
      draft,
      loopId,
      bots: [{ id: "bot-a", name: "A" }],
      scripts: {},
      skillOptions: {},
      skillOptionsLoading: {},
      skillOptionsError: {},
      onEdit: () => {},
      onScript: () => {},
      onRenameScript: () => {},
      onToast: () => {},
      onClose: () => {},
    }));
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.textContent).toContain("Do While · Do While 1");
    expect(container.textContent).toContain("Do While entry");
    expect(container.textContent).toContain("End of round");
    expect(container.querySelector('[data-studio-palette="loop"]')).toBeNull();
    expect(container.querySelector('[data-studio-palette="agent"]')).not.toBeNull();
    expect(container.querySelector('[data-studio-step]')).not.toBeNull();
  });

  it("closes with Done and with Escape", () => {
    const { draft, loopId } = loopDraft();
    const onClose = vi.fn();
    const container = draw(createElement(StudioLoopModal, {
      draft,
      loopId,
      bots: [{ id: "bot-a", name: "A" }],
      scripts: {},
      skillOptions: {},
      skillOptionsLoading: {},
      skillOptionsError: {},
      onEdit: () => {},
      onScript: () => {},
      onRenameScript: () => {},
      onToast: () => {},
      onClose,
    }));
    const done = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Done"));
    click(done!);
    expect(onClose).toHaveBeenCalledOnce();
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
