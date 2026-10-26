// @vitest-environment happy-dom
// The bot panel's Conversations card in a real DOM: what it lists, how it searches, and what a click does.
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bot, Message, Task } from "@/state/store";

const fixture = vi.hoisted(() => ({
  dispatch: vi.fn(),
  wide: true,
  api: vi.fn(),
}));
vi.mock("@/state/store", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/state/store")>();
  return {
    ...original,
    api: (...args: unknown[]) => fixture.api(...args),
    useStore: () => ({ state: original.initialState, dispatch: fixture.dispatch }),
  };
});
vi.mock("@/lib/use-media-query", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/use-media-query")>(),
  useMediaQuery: () => fixture.wide,
}));

const { BotConversations, CONVERSATIONS_PER_PAGE, forgetConversationLines } = await import("./Conversations");

const now = Date.now();
const task = (threadId: string, title: string, order: number, extra: Partial<Task> = {}): Task =>
  ({ threadId, title, createdAt: now - 86_400_000, updatedAt: now - order * 60_000, lastThreadOrderAt: now - order * 60_000, ...extra });
const tasks: Task[] = [
  task("launch", "Translate the launch post", 1, { unread: true }),
  task("who", "Who am I?", 2),
  task("pricing", "Competitor pricing", 3, { busy: true, activity: "working", turnStartedAt: now - 72_000 }),
  task("deck", "Summarise the board deck", 4),
  task("podcasts", "Find three podcasts about agents", 5),
  task("hiring", "Draft the hiring post", 6, { pinned: true }),
  task("compare", "Compare two note apps", 7),
  task("run", "Morning brief run", 0, { routineRunId: "run-1" }),
];
const reply = (threadId: string, text: string): Message => ({ id: `${threadId}-reply`, role: "bot", kind: "text", text, at: now });
const lines: Record<string, string> = {
  launch: "Done. Want me to translate another post?",
  pricing: "Pricing compared, table attached",
  deck: "Five key points and two risks",
  podcasts: "Three shows with episode links",
  hiring: "Draft ready for review",
  compare: "One extracts, the other decides",
};
const research = (extra: Partial<Bot> = {}): Bot => ({
  id: "research", threadId: "who", name: "Research", title: "", description: "", notifications: true, color: "green",
  unread: true, modelSelection: { instanceId: "fake", model: "fake" }, tasks, messages: [reply("who", "You're the owner of this install")],
  ...extra,
});

let host: HTMLDivElement;
let root: Root;
const render = (bot: Bot) => flushSync(() => root.render(createElement(BotConversations, { bot })));
const settle = async () => {
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};
const listed = () => [...host.querySelectorAll("[data-conversation]")].map((row) => row.getAttribute("data-conversation"));
const row = (threadId: string) => host.querySelector(`[data-conversation="${threadId}"]`)!;
const click = (element: Element | null) => {
  if (!element) throw new Error("nothing to click");
  flushSync(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 })));
};
const type = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  flushSync(() => input.dispatchEvent(new Event("input", { bubbles: true })));
};

beforeEach(() => {
  fixture.dispatch.mockReset();
  fixture.wide = true;
  fixture.api.mockReset();
  forgetConversationLines();
  fixture.api.mockImplementation((path: string) => {
    const threadId = decodeURIComponent(path.split("/")[3]!);
    return Promise.resolve({ messages: lines[threadId] ? [reply(threadId, lines[threadId])] : [], activeLeafId: null });
  });
  document.documentElement.dataset.reducedMotion = "true";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  flushSync(() => root.unmount());
  host.remove();
});

describe("a bot's conversations in its panel", () => {
  it("lists every conversation, newest first, with the open one marked and no routine runs", () => {
    render(research());
    expect(listed()).toEqual(["hiring", "launch", "who", "pricing", "deck", "podcasts", "compare"]);
    expect(row("who").querySelector('[data-sidebar-thread-row="who"]')!.getAttribute("aria-current")).toBe("page");
    expect(row("launch").querySelector("[aria-current]")).toBeNull();
    expect(listed()).not.toContain("run");
    expect(host.querySelector("[data-conversations-more]")).toBeNull();
  });

  it("marks an unread reply with a dot, a pinned conversation with a pin, and a running one with how long it has worked", async () => {
    render(research());
    await settle();
    expect(row("launch").querySelector('[aria-label="Unread"]')).not.toBeNull();
    expect(row("who").querySelector('[aria-label="Unread"]')).toBeNull();
    expect(row("hiring").querySelector('svg[aria-label="Pin"]')).not.toBeNull();
    expect(row("launch").querySelector('svg[aria-label="Pin"]')).toBeNull();
    expect(row("pricing").querySelector("[data-thread-working]")!.textContent).toMatch(/^Working·1m 1[23]s$/);
    expect(host.querySelectorAll("[data-thread-working]")).toHaveLength(1);
  });

  it("shows each conversation's last line, fetching only the ones that are not open", async () => {
    render(research());
    await settle();
    expect(row("who").textContent).toContain("You're the owner of this install");
    expect(row("launch").textContent).toContain("Done. Want me to translate another post?");
    expect(row("hiring").textContent).toContain("Draft ready for review");
    expect(fixture.api.mock.calls.map(([path]) => path).sort()).toEqual([
      "/api/threads/compare/messages?limit=8",
      "/api/threads/deck/messages?limit=8",
      "/api/threads/hiring/messages?limit=8",
      "/api/threads/launch/messages?limit=8",
      "/api/threads/podcasts/messages?limit=8",
      "/api/threads/pricing/messages?limit=8",
    ]);
    expect(fixture.api.mock.calls[0]![1]).toEqual({ background: true });
  });

  it("searches titles and last lines, and says when nothing matches", async () => {
    render(research());
    expect(host.querySelector("[data-conversations-query]")).toBeNull();
    click(host.querySelector("[data-conversations-search]"));
    const input = host.querySelector<HTMLInputElement>("[data-conversations-query]")!;
    expect(input.getAttribute("placeholder")).toBe("Search Research's conversations");
    type(input, "post");
    expect(listed()).toEqual(["hiring", "launch"]);
    await settle();
    type(input, "episode");
    await settle();
    expect(listed()).toEqual(["podcasts"]);
    type(input, "zebra");
    expect(listed()).toEqual([]);
    expect(host.textContent).toContain("Nothing matches “zebra”");

    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    flushSync(() => input.dispatchEvent(escape));
    expect(escape.defaultPrevented).toBe(true);
    expect(host.querySelector("[data-conversations-query]")).toBeNull();
    expect(listed()).toHaveLength(7);
  });

  it("opens a conversation, and leaves the open one alone", () => {
    render(research());
    click(row("launch").querySelector('[data-sidebar-thread-row="launch"]'));
    expect(fixture.dispatch.mock.calls).toEqual([[{ type: "switchTask", botId: "research", threadId: "launch" }]]);
    fixture.dispatch.mockReset();
    click(row("who").querySelector('[data-sidebar-thread-row="who"]'));
    expect(fixture.dispatch).not.toHaveBeenCalled();
  });

  it("closes the panel after opening or starting a conversation at phone width", () => {
    fixture.wide = false;
    render(research());
    click(row("launch").querySelector('[data-sidebar-thread-row="launch"]'));
    expect(fixture.dispatch.mock.calls).toEqual([
      [{ type: "switchTask", botId: "research", threadId: "launch" }],
      [{ type: "toggleSettings", open: false }],
    ]);
    fixture.dispatch.mockReset();
    click(host.querySelector("[data-conversations-new]"));
    expect(fixture.dispatch.mock.calls).toEqual([[{ type: "newTask", botId: "research" }], [{ type: "toggleSettings", open: false }]]);
  });

  it("starts a new conversation from +, keeping the panel open on a wide window", () => {
    render(research());
    const add = host.querySelector("[data-conversations-new]")!;
    expect(add.getAttribute("aria-label")).toBe("New conversation");
    click(add);
    expect(fixture.dispatch.mock.calls).toEqual([[{ type: "newTask", botId: "research" }]]);
  });

  it("pins, renames and deletes through the thread menu the sidebar uses", () => {
    render(research());
    click(row("launch").querySelector('[aria-label="Actions for Translate the launch post"]'));
    const menu = document.querySelector('[data-thread-overlay][aria-label="Actions for Translate the launch post"]')!;
    const items = [...menu.querySelectorAll("button")].map((button) => button.textContent);
    expect(items).toEqual(expect.arrayContaining(["Copy link", "Rename thread", "Pin", "Delete thread"]));
    expect(items).not.toContain("Archive");
    click([...menu.querySelectorAll("button")].find((button) => button.textContent === "Pin")!);
    expect(fixture.dispatch.mock.calls).toEqual([[{ type: "updateTask", botId: "research", threadId: "launch", patch: { pinned: true } }]]);
  });

  describe("with more than one page", () => {
    const many = Array.from({ length: 23 }, (_, index) => task(`t${index}`, `Chat ${index}`, index + 1));
    const crowded = () => research({ threadId: "t0", tasks: many, messages: [] });
    const next = () => host.querySelector("[data-conversations-next]");
    const prev = () => host.querySelector("[data-conversations-prev]");
    const label = () => host.querySelector("[data-conversations-pages]")?.textContent;

    it("lists ten at a time, and pages forward and back", async () => {
      expect(CONVERSATIONS_PER_PAGE).toBe(10);
      render(crowded());
      await settle();
      expect(listed()).toEqual(many.slice(0, 10).map((item) => item.threadId));
      expect(label()).toContain("Page 1 of 3");
      expect(prev()!.hasAttribute("disabled")).toBe(true);
      click(next());
      expect(listed()).toEqual(many.slice(10, 20).map((item) => item.threadId));
      click(next());
      expect(listed()).toEqual(many.slice(20).map((item) => item.threadId));
      expect(label()).toContain("Page 3 of 3");
      expect(next()!.hasAttribute("disabled")).toBe(true);
      click(prev());
      expect(label()).toContain("Page 2 of 3");
    });

    it("fetches last lines only for the page in view", async () => {
      render(crowded());
      await settle();
      const asked = fixture.api.mock.calls.map(([path]) => path);
      expect(asked).toHaveLength(9);
      expect(asked).not.toContain("/api/threads/t12/messages?limit=8");
    });

    it("searches every page and goes back to the first", async () => {
      render(crowded());
      click(next());
      click(host.querySelector("[data-conversations-search]"));
      type(host.querySelector<HTMLInputElement>("[data-conversations-query]")!, "Chat 2");
      expect(listed()).toEqual(["t2", "t20", "t21", "t22"]);
      expect(host.querySelector("[data-conversations-pages]")).toBeNull();
    });

    it("keeps the list at the height of a full page, so the pager stays put on the last page", () => {
      render(crowded());
      const list = () => host.querySelector<HTMLElement>('[role="list"]')!;
      expect(list().style.minHeight).toContain("22.5rem");
      click(next());
      click(next());
      expect(listed()).toHaveLength(3);
      expect(list().style.minHeight).toContain("22.5rem");
    });

    it("shows no pager when everything fits on one page", () => {
      render(research());
      expect(host.querySelector("[data-conversations-pages]")).toBeNull();
      expect(host.querySelector<HTMLElement>('[role="list"]')!.style.minHeight).toBe("");
    });
  });
});
