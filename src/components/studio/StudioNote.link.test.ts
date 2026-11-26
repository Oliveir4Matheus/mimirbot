// @vitest-environment happy-dom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { openExternalLink } from "@/lib/app-links";
import { newDraft } from "./studio-model";
import { StudioNote } from "./StudioNote";

vi.mock("@/lib/app-links", () => ({ openExternalLink: vi.fn(async () => {}) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const draft = newDraft("Financeiro");

let roots: Root[] = [];

function NoteHarness({ markdown, onEdit }: { markdown: string; onEdit?: (editing: boolean) => void }) {
  const [selected, setSelected] = useState(false);
  return createElement(StudioNote, {
    draft,
    note: { id: "note-1", x: 0, y: 0, width: 255, height: 180, markdown },
    selected,
    editing: false,
    linkMenu: false,
    onSelect: () => setSelected(true),
    onDragStart: () => {},
    onResizeStart: () => {},
    onEdit: onEdit ?? (() => {}),
    onMarkdown: () => {},
    onDelete: () => {},
    onAnchor: () => {},
    onLinkMenu: () => {},
    onLink: () => {},
    onUnlink: () => {},
  });
}

function draw(markdown: string, onEdit?: (editing: boolean) => void): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => { root.render(createElement(NoteHarness, { markdown, onEdit })); });
  return container;
}

function fire(node: Element, type: string, button = 0) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button });
  act(() => { node.dispatchEvent(event); });
  return event;
}

const link = (container: HTMLElement) => container.querySelector<HTMLAnchorElement>(".studio-note-md a");

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  roots = [];
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("StudioNote markdown links", () => {
  it("keeps the same anchor node when selecting the note re-renders it", () => {
    const container = draw("[link QA](https://example.com/qa-link)");
    const anchor = link(container);
    expect(anchor).not.toBeNull();

    fire(anchor!, "pointerdown");

    expect(container.querySelector(".studio-note-selected")).not.toBeNull();
    expect(link(container)).toBe(anchor);
  });

  it("does not open the link on a single click", () => {
    const container = draw("[link QA](https://example.com/qa-link)");
    const anchor = link(container)!;

    const event = fire(anchor, "click");

    expect(event.defaultPrevented).toBe(true);
    expect(openExternalLink).not.toHaveBeenCalled();
  });

  it("blocks the middle click", () => {
    const container = draw("[link QA](https://example.com/qa-link)");
    const anchor = link(container)!;

    const event = fire(anchor, "auxclick", 1);

    expect(event.defaultPrevented).toBe(true);
    expect(openExternalLink).not.toHaveBeenCalled();
  });

  it("opens exactly once on a double click", () => {
    const container = draw("[link QA](https://example.com/qa-link)");
    const anchor = link(container)!;

    fire(anchor, "click");
    fire(anchor, "click");
    fire(anchor, "dblclick");

    expect(openExternalLink).toHaveBeenCalledTimes(1);
    expect(openExternalLink).toHaveBeenCalledWith("https://example.com/qa-link");
  });

  it("does not edit the note on a double click over the link", () => {
    const onEdit = vi.fn();
    const container = draw("[link QA](https://example.com/qa-link)", onEdit);

    fire(link(container)!, "dblclick");

    expect(onEdit).not.toHaveBeenCalled();
    expect(openExternalLink).toHaveBeenCalledTimes(1);
  });

  it("still edits the note on a double click outside the link", () => {
    const onEdit = vi.fn();
    const container = draw("texto [link QA](https://example.com/qa-link)", onEdit);

    fire(container.querySelector(".studio-note-body")!, "dblclick");

    expect(onEdit).toHaveBeenCalledWith(true);
  });

  it("opens once with Enter without bubbling", () => {
    const container = draw("[link QA](https://example.com/qa-link)");
    const anchor = link(container)!;
    let bubbled = false;
    const onBubble = () => { bubbled = true; };
    document.addEventListener("keydown", onBubble);

    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    act(() => { anchor.dispatchEvent(event); });
    document.removeEventListener("keydown", onBubble);

    expect(event.defaultPrevented).toBe(true);
    expect(openExternalLink).toHaveBeenCalledTimes(1);
    expect(bubbled).toBe(false);
  });

  it("renders http and https as links", () => {
    for (const href of ["https://example.com/a", "http://example.com/a"]) {
      const container = draw(`[link QA](${href})`);
      expect(link(container)?.getAttribute("href")).toBe(new URL(href).href);
    }
  });

  it("renders any other scheme or a relative URL as text with no anchor", () => {
    for (const href of ["mailto:qa@example.com", "javascript:alert(1)", "./relative", "/absolute"]) {
      const container = draw(`[link QA](${href})`);
      expect(link(container)).toBeNull();
      expect(container.querySelector(".studio-note-md")?.textContent).toContain("link QA");
    }
  });
});
