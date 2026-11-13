// @vitest-environment happy-dom
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WhatsNewScreen, type ShownRelease } from "./WhatsNewDialog";

let root: Root | null = null;

afterEach(() => {
  flushSync(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

const shown: ShownRelease = {
  version: "0.1.168",
  date: "2026-11-13",
  notes: {
    lead: "One release at a time.",
    features: [
      { title: "A screen for what just changed", body: "It opens once.", shot: { src: "data:image/png;base64,AAAA", caption: "The screen." } },
      { title: "Only the release you updated to", body: "No merging." },
    ],
    fixes: ["It does not come back for the same version."],
  },
};

function mount(onClose = vi.fn()) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  flushSync(() => root!.render(createElement(WhatsNewScreen, { shown, onClose })));
  return onClose;
}

function text(selector: string): string {
  return document.querySelector(selector)?.textContent ?? "";
}

describe("WhatsNewScreen", () => {
  it("shows the release it was given, with the version, date and every note", () => {
    mount();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(text("#whats-new-title")).toContain("MimirBot");
    expect(text("#whats-new-version")).toContain("0.1.168");
    expect(document.body.textContent).toContain("One release at a time.");
    expect(document.body.textContent).toContain("A screen for what just changed");
    expect(document.body.textContent).toContain("Only the release you updated to");
    expect(document.body.textContent).toContain("It does not come back for the same version.");
  });

  it("shows the screenshot a feature ships with, and none when it has no screenshot", () => {
    mount();
    const shots = [...document.querySelectorAll("figure img")];
    expect(shots).toHaveLength(1);
    expect(shots[0]!.getAttribute("src")).toBe("data:image/png;base64,AAAA");
  });

  it("closes from Got it and from Escape", () => {
    const onClose = mount();
    const done = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Got it")!;
    flushSync(() => done.click());
    expect(onClose).toHaveBeenCalledTimes(1);

    document.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("links the whole release notes and closes from the title bar button", () => {
    const onClose = mount();
    expect([...document.querySelectorAll("button")].some((button) => button.textContent === "All release notes")).toBe(true);
    const close = document.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!;
    flushSync(() => close.click());
    expect(onClose).toHaveBeenCalled();
  });
});
