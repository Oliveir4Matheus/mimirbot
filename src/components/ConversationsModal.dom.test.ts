// @vitest-environment happy-dom
// The chat header's conversation title opens every conversation with the bot in a modal, over the chat.
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bot, Task } from "@/state/store";

const fixture = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock("@/state/store", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/state/store")>();
  return {
    ...original,
    api: () => Promise.resolve({ messages: [], activeLeafId: null }),
    useStore: () => ({ state: original.initialState, dispatch: fixture.dispatch }),
  };
});

const { ChatHeadConversation } = await import("./ChatHeadConversation");

const now = Date.now();
const task = (threadId: string, title: string, order: number): Task =>
  ({ threadId, title, createdAt: now - 86_400_000, updatedAt: now - order * 60_000, lastThreadOrderAt: now - order * 60_000 });
const tasks = ["One", "Two", "Three", "Four", "Five", "Six"].map((title, index) => task(title.toLowerCase(), `Chat ${title}`, index + 1));
const bot: Bot = {
  id: "research", threadId: "one", name: "Research", title: "", description: "", notifications: true, color: "green",
  unread: false, modelSelection: { instanceId: "fake", model: "fake" }, tasks, messages: [],
};

let host: HTMLDivElement;
let root: Root;
const modal = () => document.querySelector("[data-conversations-modal]");
const open = () => flushSync(() => (host.querySelector("[data-chathead-conversation]") as HTMLElement).click());
const pressEscape = () => flushSync(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true })));

beforeEach(() => {
  fixture.dispatch.mockReset();
  document.documentElement.dataset.reducedMotion = "true";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  flushSync(() => root.render(createElement(ChatHeadConversation, { bot })));
});
afterEach(() => {
  flushSync(() => root.unmount());
  host.remove();
});

describe("the conversations modal", () => {
  it("stays shut until the title is clicked, then lists every conversation with the bot", () => {
    expect(modal()).toBeNull();
    open();
    expect(modal()!.getAttribute("aria-label")).toBe("Conversations with Research");
    expect(modal()!.querySelectorAll("[data-conversation]")).toHaveLength(6);
    expect(fixture.dispatch).not.toHaveBeenCalled();
  });

  it("does not open the bot panel any more", () => {
    open();
    expect(fixture.dispatch.mock.calls.some(([action]) => action.type === "toggleSettings" || action.type === "openBotSettings")).toBe(false);
  });

  it("closes on Escape, on the close button and on a click outside, not on a click inside", () => {
    open();
    pressEscape();
    expect(modal()).toBeNull();

    open();
    flushSync(() => (document.querySelector('[aria-label="Close"]') as HTMLElement).click());
    expect(modal()).toBeNull();

    open();
    flushSync(() => modal()!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    expect(modal()).not.toBeNull();
    flushSync(() => modal()!.parentElement!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    expect(modal()).toBeNull();
  });

  it("opens the picked conversation and closes", () => {
    open();
    flushSync(() => (modal()!.querySelector('[data-sidebar-thread-row="four"]') as HTMLElement).click());
    expect(fixture.dispatch.mock.calls).toEqual([[{ type: "switchTask", botId: "research", threadId: "four" }]]);
    expect(modal()).toBeNull();
  });
});
