// @vitest-environment happy-dom
// The right panel's drawer in a real DOM: one handle opens and closes it, the
// content unmounts after the slide, and focus lands on the handle.
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bot } from "@/state/store";

const fixture = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    settingsOpen: true,
    computerOpen: false,
    dispatch: vi.fn(),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setOpen: (open: boolean) => {
      fixture.settingsOpen = open;
      for (const listener of listeners) listener();
    },
    reset: () => {
      listeners.clear();
      fixture.settingsOpen = true;
      fixture.computerOpen = false;
      fixture.dispatch.mockReset();
    },
  };
});

vi.mock("@/state/store", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/state/store")>();
  const { useSyncExternalStore } = await import("react");
  return {
    ...original,
    useStore: () => {
      const settingsOpen = useSyncExternalStore(fixture.subscribe, () => fixture.settingsOpen);
      return { state: { ...original.initialState, settingsOpen, computerOpen: fixture.computerOpen }, dispatch: fixture.dispatch, flushBotPatches: () => Promise.resolve(null) };
    },
  };
});
vi.mock("./lazy-screens", () => ({
  BotSettingsDialog: ({ open }: { open: boolean }) =>
    createElement("aside", { role: "dialog", "data-stub-dialog": open ? "open" : "closed" },
      createElement("button", { type: "button", "data-inside": "true" }, "Inside")),
}));

const { BotSettingsPanel, BOT_PANEL_ID } = await import("./BotSettingsPanel");
const { setLocale } = await import("@/lib/i18n");

const bot: Bot = {
  id: "scout", threadId: "thread-scout", name: "Scout", title: "Researcher", description: "", soul: "",
  notifications: true, color: "green", unread: false, messages: [],
  modelSelection: { instanceId: "claude", model: "claude-opus-5-5" },
};

let host: HTMLDivElement;
let root: Root;

const mount = (overlay = false) => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  flushSync(() => root.render(createElement(BotSettingsPanel, { bot, overlay })));
  return {
    shell: host.querySelector<HTMLElement>("[data-bot-settings-shell]")!,
    drawer: host.querySelector<HTMLElement>("[data-bot-settings-drawer]")!,
    handle: host.querySelector<HTMLButtonElement>("[data-bot-settings-handle]")!,
    dialog: () => host.querySelector<HTMLElement>("[data-stub-dialog]"),
  };
};

beforeEach(() => {
  setLocale("en");
  fixture.reset();
});

afterEach(() => {
  flushSync(() => root?.unmount());
  host?.remove();
});

describe("the retracting right panel", () => {
  it("starts expanded, with the panel content mounted and the handle offering to collapse it", () => {
    const { shell, drawer, handle, dialog } = mount();
    expect(shell.dataset.botSettingsOpen).toBe("true");
    expect(drawer.className).toContain("translate-x-0");
    expect(drawer.id).toBe(BOT_PANEL_ID);
    expect(dialog()!.dataset.stubDialog).toBe("open");
    expect(handle.getAttribute("aria-expanded")).toBe("true");
    expect(handle.getAttribute("aria-controls")).toBe(BOT_PANEL_ID);
    expect(handle.getAttribute("aria-label")).toBe("Collapse the bot panel");
    expect(handle.title).toBe("Collapse the bot panel");
    // The chevron points the way the panel goes: right, out of the window.
    expect(handle.querySelector("svg")!.getAttribute("class")).toContain("rotate-180");
  });

  it("closes from the handle and opens from the same handle", () => {
    const { shell, drawer, handle, dialog } = mount();
    flushSync(() => handle.click());
    expect(fixture.dispatch).toHaveBeenLastCalledWith({ type: "toggleSettings", open: false });
    fixture.setOpen(false);
    flushSync(() => root.render(createElement(BotSettingsPanel, { bot, overlay: false })));

    expect(shell.dataset.botSettingsOpen).toBe("false");
    expect(drawer.className).toContain("translate-x-full");
    expect(drawer.className).toContain("pointer-events-none");
    expect(handle.getAttribute("aria-expanded")).toBe("false");
    expect(handle.getAttribute("aria-label")).toBe("Expand the bot panel");
    expect(handle.querySelector("svg")!.getAttribute("class")).not.toContain("rotate-180");
    // Still mounted while it slides out, so the collapse animates the panel, not an empty frame.
    expect(dialog()).not.toBeNull();

    flushSync(() => handle.click());
    expect(fixture.dispatch).toHaveBeenLastCalledWith({ type: "toggleSettings", open: true });
  });

  it("stops painting the parked drawer, so the panel beside it is not covered, and keeps the handle in reach", () => {
    const { drawer, handle } = mount();
    expect(drawer.className).not.toContain("invisible");

    fixture.setOpen(false);
    flushSync(() => root.render(createElement(BotSettingsPanel, { bot, overlay: false })));

    // Parked, the drawer lands over the panel beside it; hidden, it cannot be painted over it.
    expect(drawer.className).toContain("invisible");
    // The handle is the way back in, so it opts back into being painted inside the hidden drawer.
    expect(handle.className).toContain("visible");
  });

  it("leaves without the slide when a panel beside it is open, so the menu never sweeps across it", () => {
    const { drawer } = mount();
    expect(drawer.className).toContain("transition-[translate,visibility]");

    fixture.computerOpen = true;
    fixture.setOpen(false);
    flushSync(() => root.render(createElement(BotSettingsPanel, { bot, overlay: false })));

    expect(drawer.className).toContain("invisible");
    expect(drawer.className).toContain("transition-none");
    expect(drawer.className).not.toContain("transition-[translate,visibility]");
  });

  it("keeps the panel's content mounted while it is away, so reopening lands where it was left", () => {
    const { drawer, dialog } = mount();
    fixture.setOpen(false);
    flushSync(() => root.render(createElement(BotSettingsPanel, { bot, overlay: false })));
    expect(drawer.className).toContain("translate-x-full");
    expect(dialog()!.dataset.stubDialog).toBe("closed");
    expect(host.querySelector("[data-inside]")).not.toBeNull();

    fixture.setOpen(true);
    flushSync(() => root.render(createElement(BotSettingsPanel, { bot, overlay: false })));
    expect(drawer.className).toContain("translate-x-0");
    expect(dialog()!.dataset.stubDialog).toBe("open");
    expect(host.querySelector("[data-inside]")).not.toBeNull();
  });

  it("mounts no panel content before the panel is opened for the first time", () => {
    fixture.settingsOpen = false;
    const { dialog, handle } = mount();
    expect(dialog()).toBeNull();
    expect(handle.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps the handle visible and reachable while the panel is open, and hands it the focus the panel had", () => {
    const { handle, drawer } = mount();
    const inside = host.querySelector<HTMLButtonElement>("[data-inside]")!;
    inside.focus();
    expect(document.activeElement).toBe(inside);

    fixture.setOpen(false);
    flushSync(() => root.render(createElement(BotSettingsPanel, { bot, overlay: false })));

    expect(document.activeElement).toBe(handle);
    // The handle sits outside the sliding content, so it never leaves the window with it.
    expect(drawer.contains(handle)).toBe(true);
    expect(host.querySelector("[data-stub-dialog]")!.contains(handle)).toBe(false);
  });

  it("stays out of the layout on the phone, where the panel is the full-screen sheet", () => {
    const { shell } = mount();
    expect(shell.className).toContain("max-md:contents");
    expect(shell.className).toContain("md:w-[min(420px,42vw)]");
  });

  it("takes no layout space over another panel, and floats the handle at the window edge once collapsed", () => {
    const { shell, handle } = mount(true);
    expect(shell.className).toContain("md:absolute");
    expect(shell.className).toContain("md:right-0");
    expect(handle.className).toContain("right-full");
    expect(handle.className).toContain("pointer-events-auto");
  });
});
