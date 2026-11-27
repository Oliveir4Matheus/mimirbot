// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublishedApp } from "../../../shared/published-apps";
import type { Bot } from "@/state/store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fixture = vi.hoisted(() => {
  class FakeApiError extends Error {
    status: number;
    body?: Record<string, unknown>;
    constructor(message: string, status: number, body?: Record<string, unknown>) { super(message); this.status = status; this.body = body; }
  }
  return { api: vi.fn(), dispatch: vi.fn(), opened: [] as string[], FakeApiError };
});
vi.mock("@/state/store", () => ({ useStore: () => ({ dispatch: fixture.dispatch }) }));
vi.mock("@/state/api", () => ({ api: fixture.api, ApiError: fixture.FakeApiError }));
vi.mock("@/lib/app-links", () => ({ openExternalLink: async (url: string) => { fixture.opened.push(url); } }));
vi.mock("./SiteFrame", async () => {
  const { createElement } = await import("react");
  return { SiteFrame: ({ url, title, attempt }: { url: string; title: string; attempt?: number }) => createElement("div", { "data-app-preview-frame": "", "data-src": url, "data-title": title, "data-attempt": String(attempt ?? 0) }) };
});

const { PublishedAppsPanel } = await import("./PublishedAppsPanel");
const { showPublishedAppsList } = await import("@/lib/app-preview");

const NOW = Date.parse("2026-11-11T12:00:00Z");
const FIRST: PublishedApp = {
  id: "a".repeat(24), title: "Sales report", url: `https://${"a".repeat(24)}.mimirbot.invalid/`, bot: { id: "bot-1", name: "Mira" },
  threadId: "thread-1", publishedAt: NOW - 2 * 3_600_000,
};
const SECOND: PublishedApp = {
  id: "b".repeat(24), title: "Bakery order page", url: `https://${"b".repeat(24)}.mimirbot.invalid/`, bot: { id: "gone", name: "" },
  publishedAt: NOW - 3 * 86_400_000,
};
const bot = { id: "bot-1", name: "Mira", threadId: "thread-1" } as unknown as Bot;

let root: Root;
let host: HTMLElement;
let apps: PublishedApp[];
let deleteAnswer: () => Promise<unknown>;

const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0)); };
const card = (id: string) => host.querySelector<HTMLElement>(`[data-published-app="${id}"]`);
const button = (name: string, scope: ParentNode = host) => [...scope.querySelectorAll("button")]
  .find((one) => (one.getAttribute("aria-label") ?? one.textContent) === name)!;

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  showPublishedAppsList();
  fixture.api.mockReset();
  fixture.dispatch.mockReset();
  fixture.opened.length = 0;
  apps = [FIRST, SECOND];
  deleteAnswer = async () => ({ ok: true });
  fixture.api.mockImplementation(async (path: string, init?: { method?: string }) => {
    if (path === "/api/published-apps") return { apps };
    if (init?.method === "DELETE" && path.startsWith("/api/published-apps/")) {
      const answer = await deleteAnswer();
      const id = decodeURIComponent(path.slice("/api/published-apps/".length));
      apps = apps.filter((app) => app.id !== id);
      return answer;
    }
    throw new Error(`unexpected ${path}`);
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

async function show() {
  await act(async () => { root.render(createElement(PublishedAppsPanel, { bot })); await settle(); });
}

describe("the Published apps panel", () => {
  it("shows a loading state, then says nothing is published", async () => {
    let resolve!: (value: unknown) => void;
    fixture.api.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    await act(async () => { root.render(createElement(PublishedAppsPanel, { bot })); await settle(); });
    expect(host.textContent).toContain("Loading published apps…");
    await act(async () => { resolve({ apps: [] }); await settle(); });
    expect(host.textContent).toContain("Nothing published yet");
    expect(host.textContent).toContain("Ask a bot to build a page or app, then publish it from its card.");
    expect(host.querySelector("[data-published-app]")).toBeNull();
  });

  it("shows a failed load with Try again, and recovers", async () => {
    fixture.api.mockRejectedValueOnce(new fixture.FakeApiError("The server is offline.", 503));
    await show();
    expect(host.textContent).toContain("Couldn't load published apps.");
    fixture.api.mockResolvedValueOnce({ apps: [] });
    await act(async () => { button("Try again").click(); await settle(); });
    expect(host.textContent).toContain("Nothing published yet");
  });

  it("draws one card per page with its title, link, bot, date and actions", async () => {
    await show();
    expect([...host.querySelectorAll("[data-published-app]")].map((one) => one.getAttribute("data-published-app"))).toEqual([FIRST.id, SECOND.id]);
    expect(card(FIRST.id)?.textContent).toContain("Sales report");
    expect(card(FIRST.id)?.textContent).toContain(FIRST.url);
    expect(card(FIRST.id)?.textContent).toContain("Mira · 2 hr ago");
    expect(card(SECOND.id)?.textContent).toContain("3 days ago");
    const labels = (id: string) => [...card(id)!.querySelectorAll("button")].map((one) => one.getAttribute("aria-label") ?? one.textContent);
    expect(labels(FIRST.id)).toEqual(["Preview Sales report", "Open", "Copy link", "Delete Sales report"]);
  });

  it("opens a page outside the app and copies its link", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    await show();
    await act(async () => { button("Open", card(FIRST.id)!).click(); });
    expect(fixture.opened).toEqual([FIRST.url]);
    await act(async () => { button("Copy link", card(FIRST.id)!).click(); await settle(); });
    expect(writeText).toHaveBeenCalledWith(FIRST.url);
    vi.unstubAllGlobals();
  });

  it("previews a page in the sandboxed frame inside the panel, and goes back to the cards", async () => {
    await show();
    await act(async () => { button("Preview Sales report").click(); await settle(); });
    const frame = host.querySelector<HTMLElement>("[data-app-preview-frame]")!;
    expect(frame.getAttribute("data-src")).toBe(FIRST.url);
    expect(frame.getAttribute("data-title")).toBe("Sales report");
    expect(frame.getAttribute("data-attempt")).toBe("0");
    expect(host.textContent).toContain("Sales report");
    expect(host.textContent).toContain("a".repeat(24) + ".mimirbot.invalid");
    await act(async () => { button("Reload").click(); await settle(); });
    expect(host.querySelector("[data-app-preview-frame]")?.getAttribute("data-attempt")).toBe("1");
    await act(async () => { button("Back to published apps").click(); await settle(); });
    expect(host.querySelector("[data-published-app]")).not.toBeNull();
    expect(host.querySelector("[data-app-preview-frame]")).toBeNull();
  });

  it("asks before deleting and removes the row only once the server answered 200", async () => {
    await show();
    await act(async () => { button("Delete Sales report").click(); });
    const dialog = document.body.querySelector<HTMLElement>('[role="alertdialog"]')!;
    expect(dialog.textContent).toContain("This takes its published link down.");
    expect(fixture.api).not.toHaveBeenCalledWith(expect.stringContaining(FIRST.id), expect.anything());
    await act(async () => { button("Delete", dialog).click(); await settle(); });
    expect(fixture.api).toHaveBeenCalledWith(`/api/published-apps/${FIRST.id}`, { method: "DELETE" });
    expect(card(FIRST.id)).toBeNull();
    expect(card(SECOND.id)).not.toBeNull();
  });

  it("keeps the row and shows the server's message when deleting is refused", async () => {
    deleteAnswer = async () => { throw new fixture.FakeApiError("This app isn't yours to delete.", 403, { error: "This app isn't yours to delete." }); };
    await show();
    await act(async () => { button("Delete Sales report").click(); });
    const dialog = document.body.querySelector<HTMLElement>('[role="alertdialog"]')!;
    await act(async () => { button("Delete", dialog).click(); await settle(); });
    expect(card(FIRST.id)).not.toBeNull();
    expect(card(FIRST.id)?.textContent).toContain("This app isn't yours to delete.");
  });
});
