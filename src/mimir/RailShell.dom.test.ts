// @vitest-environment happy-dom
import { createElement, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setLocale } from "@/lib/i18n";

import { RailShell } from "./RailShell";

function Harness() {
  const [open, setOpen] = useState(true);
  return createElement(RailShell, {
    label: "Bots and navigation",
    open,
    onOpenChange: setOpen,
    children: [
      createElement("button", { key: "place", type: "button", "data-place": "bots", onClick: () => setOpen(false) }, "Bots"),
      createElement("span", { key: "label", "data-inside": "true" }, "Settings"),
    ],
  });
}

let root: Root | null = null;

beforeEach(() => { setLocale("en"); });

afterEach(() => {
  flushSync(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

const mount = () => {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  flushSync(() => root!.render(createElement(Harness)));
  const rail = host.querySelector<HTMLElement>("[data-mimir-rail]")!;
  return {
    rail,
    content: host.querySelector<HTMLElement>("#mimir-rail-content")!,
    handle: host.querySelector<HTMLButtonElement>("[data-mimir-rail-handle]")!,
    place: host.querySelector<HTMLButtonElement>("[data-place=bots]")!,
    inside: host.querySelector<HTMLElement>("[data-inside]")!,
  };
};

const press = (target: EventTarget, init: KeyboardEventInit) => {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  flushSync(() => target.dispatchEvent(event));
  return event;
};

describe("the retracting rail", () => {
  it("starts expanded, with its content reachable and the handle offering to collapse it", () => {
    const { rail, content, handle } = mount();
    expect(rail.dataset.mimirRailOpen).toBe("true");
    expect(content.getAttribute("aria-hidden")).toBe("false");
    expect(content.hasAttribute("inert")).toBe(false);
    expect(handle.getAttribute("aria-expanded")).toBe("true");
    expect(handle.getAttribute("aria-controls")).toBe("mimir-rail-content");
    expect(handle.getAttribute("aria-label")).toBe("Collapse Bots and navigation");
  });

  it("collapses and expands from the same handle", () => {
    const { rail, content, handle } = mount();
    flushSync(() => handle.click());
    expect(rail.dataset.mimirRailOpen).toBe("false");
    expect(rail.className).toContain("w-0");
    expect(content.getAttribute("aria-hidden")).toBe("true");
    expect(content.hasAttribute("inert")).toBe(true);
    expect(handle.getAttribute("aria-expanded")).toBe("false");
    expect(handle.getAttribute("aria-label")).toBe("Expand Bots and navigation");

    flushSync(() => handle.click());
    expect(rail.dataset.mimirRailOpen).toBe("true");
    expect(rail.className).toContain("w-[66px]");
    expect(content.hasAttribute("inert")).toBe(false);
    expect(handle.getAttribute("aria-expanded")).toBe("true");
  });

  it("closes on Escape and gives the handle the focus the hidden content had", () => {
    const { content, handle, place } = mount();
    place.focus();
    expect(document.activeElement).toBe(place);

    const event = press(document, { key: "Escape" });
    expect(event.defaultPrevented).toBe(false);
    expect(content.hasAttribute("inert")).toBe(true);
    expect(document.activeElement).toBe(handle);
  });

  it("closes on a click elsewhere but not on one inside it", () => {
    const { content, handle, inside } = mount();
    flushSync(() => inside.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(content.hasAttribute("inert")).toBe(false);

    flushSync(() => handle.click());
    expect(content.hasAttribute("inert")).toBe(true);
    flushSync(() => handle.click());

    flushSync(() => document.body.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(content.hasAttribute("inert")).toBe(true);
  });

  it("hands focus to the handle when a place inside it retracts the rail", () => {
    const { content, handle, place } = mount();
    place.focus();
    flushSync(() => place.click());
    expect(content.hasAttribute("inert")).toBe(true);
    expect(document.activeElement).toBe(handle);
  });

  it("keeps the content off the tab order while it is hidden", () => {
    const { content, handle } = mount();
    flushSync(() => handle.click());
    const place = content.querySelector<HTMLButtonElement>("[data-place=bots]")!;
    expect(place.closest("[inert]")).toBe(content);
  });
});
