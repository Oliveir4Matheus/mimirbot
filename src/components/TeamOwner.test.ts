import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { initialState, StoreContext, type AppState, type Bot } from "@/state/store";
import { setTeamPeople, type TeamPeople } from "@/state/team-people";

vi.mock("./DesktopCapabilities", () => ({ useDesktopCapabilities: () => ({}) }));

import { BotListItem, botRowProps, TeamMenuItems } from "./Sidebar";
import { SidebarSectionHeader } from "./SidebarSectionHeader";
import { AskingLine, departmentOwner, NeedsYouButton } from "./TeamOwner";

const ADA = { email: "ada@acme.test", name: "Ada", role: "admin" };
const BOB = { email: "bob@acme.test", name: "Bob", role: "member", you: true as const };
const asBob = (needsYou: TeamPeople["needsYou"] = []): TeamPeople => ({ people: [ADA, BOB], me: BOB, admin: false, needsYou });

const bot = (overrides: Partial<Bot> = {}): Bot => ({
  id: "fox", threadId: "fox-main", name: "Fox", title: "", description: "", notifications: true, color: "green", unread: false,
  modelSelection: { instanceId: "claude", model: "test" }, messages: [], ...overrides,
});
const withStore = (state: AppState, child: ReturnType<typeof createElement>) =>
  createElement(StoreContext.Provider, { value: { state, dispatch: vi.fn(), flushBotPatches: vi.fn(), refreshInstances: vi.fn(), refreshModels: vi.fn() } as never }, child);
const row = (candidate: Bot, selected = false) => {
  const state = { ...initialState, bots: [candidate], selectedId: selected ? candidate.id : null, activeView: "chat" } as AppState;
  return renderToStaticMarkup(createElement(BotListItem, botRowProps(state, vi.fn(), candidate, { density: "comfortable", quiet: false, query: "", onMenu: vi.fn() })));
};

afterEach(() => setTeamPeople(null));

describe("who a team bot reports to, in the sidebar", () => {
  it("keeps every bot's ⋯ menu in view, whatever the selection", () => {
    const actions = (markup: string) => markup.match(/<button[^>]*data-bot-actions="fox"[^>]*>/)?.[0] ?? "";
    expect(actions(row(bot(), true))).not.toContain("opacity-0");
    expect(actions(row(bot(), false))).not.toContain("opacity-0");
    expect(actions(row(bot(), false))).toContain("data-bot-actions=\"fox\"");
  });

  it("names a department's owner beside it when every bot there reports to one person", () => {
    const team = asBob();
    expect(departmentOwner([bot({ reportsTo: BOB.email }), bot({ id: "owl", createdBy: BOB.email })], team)?.name).toBe("Bob");
    expect(departmentOwner([bot({ reportsTo: BOB.email }), bot({ id: "lead", reportsTo: ADA.email })], team)).toBeNull();
    const header = renderToStaticMarkup(createElement(SidebarSectionHeader, { name: "Product A", lead: "Bob", collapsed: false, reorderable: false, dragging: false, line: true }));
    expect(header).toContain(">→ Bob<");
    expect(header).toContain("Every bot in Product A reports to Bob");
  });

  it("offers Set owner for all bots in a department's menu only when the caller passes it", () => {
    const items = (onSetOwner?: () => void) => renderToStaticMarkup(createElement(TeamMenuItems, { onAddBots: vi.fn(), onRename: vi.fn(), onShare: vi.fn(), onDelete: vi.fn(), onSetOwner }));
    expect(items(vi.fn())).toContain("Set owner for all bots…");
    expect(items()).not.toContain("Set owner for all bots…");
  });
});

describe("a card waiting on someone", () => {
  const fox = bot({ reportsTo: ADA.email, tasks: [{ threadId: "fox-main", title: "Fox" }, { threadId: "fox-bob", title: "Mine", private: true }] as Bot["tasks"] });
  const asking = (threadId: string) => renderToStaticMarkup(withStore({ ...initialState, bots: [fox] } as AppState, createElement(AskingLine, { botId: "fox", threadId })));

  it("says whose answer it waits for in a shared chat, and nothing in a private one", () => {
    setTeamPeople(asBob());
    expect(asking("fox-main")).toContain("Asking Ada");
    expect(asking("fox-bob")).toBe("");
    setTeamPeople({ ...asBob(), people: [ADA, BOB] });
    const mine = renderToStaticMarkup(withStore({ ...initialState, bots: [{ ...fox, reportsTo: BOB.email }] } as AppState, createElement(AskingLine, { botId: "fox", threadId: "fox-main" })));
    expect(mine).toContain("Asking you");
  });

  it("says nothing off a team", () => {
    expect(asking("fox-main")).toBe("");
  });
});

describe("Needs you", () => {
  it("counts what bots ask of this person, and hides when nothing does", () => {
    const render = () => renderToStaticMarkup(withStore({ ...initialState, bots: [bot()] } as AppState, createElement(NeedsYouButton)));
    setTeamPeople(asBob([{ kind: "question", id: "q1", at: 1, botId: "fox", threadId: "fox-main", text: "Which landing page?" }]));
    expect(render()).toContain('aria-label="Needs you, 1"');
    setTeamPeople(asBob());
    expect(render()).toBe("");
  });
});
