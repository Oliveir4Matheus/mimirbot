// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioCard } from "./StudioCard";
import { StudioProblemsPanel } from "./StudioProblemsPanel";
import { createStep, newDraft, type StudioDraft } from "./studio-model";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let roots: Root[] = [];

function draw(node: ReturnType<typeof createElement>) {
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

describe("the manual step card", () => {
  it("says it waits for the person with an amber dot and a person icon, keeping the card's geometry", () => {
    const draft: StudioDraft = { ...newDraft("Financeiro"), name: "Fluxo" };
    const created = createStep(draft, "agent", { x: 200, y: 200 }, "bot-a");
    const manual = {
      ...(created.draft.steps[0]! as Extract<typeof created.draft.steps[number], { kind: "bot" }>),
      mode: "manual" as const,
    };
    const withStep = { ...created.draft, steps: [manual] };
    const container = draw(createElement(StudioCard, {
      draft: withStep,
      step: withStep.steps[0]!,
      index: 0,
      selected: false,
      botName: () => "A",
      onSelect: () => {},
      onDragStart: () => {},
      onEntry: () => {},
      onBranch: () => {},
      onPort: () => {},
      onRename: () => {},
      onDuplicate: () => {},
      onDelete: () => {},
    }));

    expect(container.textContent).toContain("Waiting for the person");
    expect(container.querySelector(".studio-card-person")).not.toBeNull();
    expect(container.querySelector(".studio-status-manual")).not.toBeNull();
    const card = container.querySelector<HTMLElement>(".studio-card")!;
    expect(card.style.width).toBe("240px");
    expect(card.style.height).toBe("112px");
  });
});

describe("the problems panel", () => {
  const errors = [
    { path: "steps.0.mode", message: "Manual step without a collected parameter" },
    { path: "steps.0.outputs.0.path", message: "Output “link” needs a file extension" },
    { path: "steps.0.modules.0.name", message: "Module needs a name" },
  ];
  const warnings = [{ path: "steps.0.outputs.0.path", message: "This file is read later and still declares no shape" }];

  it("lists every error, focuses the first item and opens the right one", () => {
    const onOpen = vi.fn();
    const container = draw(createElement(StudioProblemsPanel, {
      problems: { errors, warnings },
      onOpen,
      onClose: () => {},
    }));

    const panel = container.querySelector<HTMLElement>(".studio-problems")!;
    expect(panel.getAttribute("role")).toBe("alert");
    expect(panel.getAttribute("aria-live")).toBe("polite");
    expect(container.textContent).toContain("3 problems prevent saving");
    for (const error of errors) expect(container.textContent).toContain(error.path);
    expect(container.textContent).toContain("1 authoring warning");

    const rows = container.querySelectorAll<HTMLElement>(".studio-problem");
    expect(rows).toHaveLength(4);
    expect(document.activeElement).toBe(rows[0]);
    expect(rows[0]!.textContent).toContain("steps.0.mode");

    click(rows[1]!.querySelector(".studio-problem-open")!);
    expect(onOpen).toHaveBeenCalledWith(errors[1]);
  });

  it("shows warnings under an amber header when nothing blocks the save", () => {
    const container = draw(createElement(StudioProblemsPanel, {
      problems: { errors: [], warnings },
      onOpen: () => {},
      onClose: () => {},
    }));
    const panel = container.querySelector(".studio-problems")!;
    expect(panel.classList.contains("studio-problems-warning")).toBe(true);
    expect(container.textContent).toContain("1 authoring warning");
    expect(container.textContent).not.toContain("prevent saving");
  });

  it("closes from its own button", () => {
    const onClose = vi.fn();
    const container = draw(createElement(StudioProblemsPanel, {
      problems: { errors, warnings: [] },
      onOpen: () => {},
      onClose,
    }));
    click(container.querySelector(".studio-problems-close")!);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
