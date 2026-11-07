import { Children, createElement, isValidElement, type KeyboardEvent, type MemoExoticComponent, type MouseEvent, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialState, type AppState, type Bot, type Group, type InstanceInfo } from "@/state/store";
import type { SidebarDensity } from "@/lib/sidebar-preferences";

const fixture = vi.hoisted(() => ({ advanced: false, showThreads: true, state: {} as Partial<AppState>, dispatch: vi.fn() }));
vi.mock("@/lib/interface-mode", async (original) => ({
  ...await original<typeof import("@/lib/interface-mode")>(),
  useAdvancedMode: () => fixture.advanced,
}));
vi.mock("@/lib/thread-preferences", () => ({ useShowThreads: () => fixture.showThreads }));
vi.mock("./DesktopCapabilities", () => ({ useDesktopCapabilities: () => ({}) }));
vi.mock("react-dom", () => ({ createPortal: (node: ReactNode) => node }));
vi.mock("@/state/store", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/state/store")>();
  return { ...original, useStore: () => ({ state: { ...original.initialState, ...fixture.state }, dispatch: fixture.dispatch }) };
});

import { BotContextMenu, BotListItem, BotThreadList, botRowProps, GroupListItem, PinnedBotCircle, type BotRowProps } from "./Sidebar";
import { SidebarBotActivity, sidebarBotActivityTasks } from "./SidebarBotActivity";
import { forgetSearchDisclosuresForTests } from "@/lib/search-disclosure";

const bot: Bot = {
  id: "atlas", threadId: "last-selected", name: "Atlas", title: "", description: "",
  notifications: true, color: "green", unread: true,
  modelSelection: { instanceId: "fake", model: "test" }, messages: [],
  projects: [{ id: "private-folder", name: "Quiet folder" }],
  tasks: [
    { threadId: "last-selected", title: "Last selected conversation", createdAt: 1 },
    { threadId: "idle-history", title: "Idle history", createdAt: 2, projectId: "private-folder" },
    { threadId: "approval", title: "Review permission", createdAt: 3, busy: false, activity: "waiting-on-you", projectId: "private-folder" },
    { threadId: "working", title: "Running job", createdAt: 4, busy: true, activity: "working" },
    { threadId: "queued", title: "Next job", createdAt: 5 },
    { threadId: "unread", title: "Finished reply", createdAt: 6, unread: true },
  ],
};
const densities: SidebarDensity[] = ["comfortable", "compact", "icons"];
const botRow = (BotListItem as MemoExoticComponent<(props: BotRowProps) => ReactNode>).type;
const pinnedCircle = (PinnedBotCircle as MemoExoticComponent<(props: BotRowProps) => ReactNode>).type;
const rowProps = (density: SidebarDensity, candidate: Bot = bot, query = "") =>
  botRowProps({ ...initialState, ...fixture.state }, fixture.dispatch, candidate, { density, quiet: false, query, onMenu: vi.fn() });

type ElementProps = { children?: ReactNode; onClick?: (event: MouseEvent) => void; onKeyDown?: (event: KeyboardEvent) => void; [key: string]: unknown };
function findElement(tree: ReactNode, attribute: string, value: string): ReactElement<ElementProps> | undefined {
  for (const child of Children.toArray(tree)) {
    if (!isValidElement<ElementProps>(child)) continue;
    if (child.props[attribute] === value) return child;
    const found = findElement(child.props.children, attribute, value);
    if (found) return found;
  }
}

beforeEach(() => {
  fixture.advanced = false;
  fixture.showThreads = true;
  fixture.state = { bots: [bot], selectedId: "other-bot", activeView: "chat", pendingQueued: { queued: [{ queueId: "q", text: "next" }] } };
  fixture.dispatch.mockClear();
  vi.stubGlobal("window", { innerWidth: 1024, innerHeight: 768 });
  vi.stubGlobal("document", { body: {} });
  vi.stubGlobal("HTMLInputElement", class {});
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("bot-first sidebar", () => {
  it.each([false, true])("keeps the conversation out of the row: no preview, role or description (advanced: %s)", (advanced) => {
    fixture.advanced = advanced;
    fixture.showThreads = false;
    const messages: Bot["messages"] = [{ id: "step", role: "bot", kind: "activity", at: 1, tool: { name: "mcp__omb__computer_batch", ok: true } }];
    const candidate = { ...bot, title: "Research", messages, tasks: [], projects: [] };
    const group: Group = { id: "room", threadId: "room-thread", name: "Team", memberIds: [bot.id], messages, defaultResponder: { kind: "mentions" }, bulletin: "", unread: false, createdAt: 1 };
    for (const markup of [
      renderToStaticMarkup(createElement(BotListItem, rowProps("comfortable", candidate))),
      renderToStaticMarkup(createElement(GroupListItem, { group, density: "comfortable", onMenu: vi.fn() })),
    ]) {
      expect(markup).not.toContain("Use the screen");
      expect(markup).not.toContain("mcp__omb__computer_batch");
      expect(markup).not.toContain('data-testid="bot-role"');
      expect(markup).not.toContain(">Research<");
    }
  });

  it.each([
    { advanced: true, enabled: true, density: "comfortable", size: 27, spacing: ["h-[43px]", "gap-[10px]", "pl-6", "pr-[30px]"] },
    { advanced: true, enabled: true, density: "compact", size: 27, spacing: ["h-[43px]", "gap-[10px]", "pl-6", "pr-[30px]"] },
    { advanced: true, enabled: true, density: "icons", size: 44, spacing: ["justify-center", "px-1", "py-1.5"] },
    { advanced: true, enabled: false, density: "comfortable", size: 27, spacing: ["h-[43px]", "gap-[10px]", "pl-[9px]", "pr-[30px]"] },
    { advanced: false, enabled: false, density: "comfortable", size: 27, spacing: ["h-[43px]", "gap-[10px]", "pl-[9px]", "pr-[30px]"] },
    { advanced: false, enabled: false, density: "compact", size: 27, spacing: ["h-[43px]", "gap-[10px]", "pl-[9px]", "pr-[30px]"] },
    { advanced: false, enabled: false, density: "icons", size: 36, spacing: ["h-[43px]", "justify-center"] },
  ] as const)("sizes bot portraits and row spacing in $density density with threads $enabled (advanced $advanced)", ({ advanced, enabled, density, size, spacing }) => {
    fixture.advanced = advanced;
    fixture.showThreads = enabled;
    for (const avatar of [{}, { avatarUrl: "/api/attachments/portrait.png", avatarCrop: "circle" as const }]) {
      let tree: ReactNode;
      function Capture() { tree = botRow(rowProps(density, { ...bot, ...avatar })); return tree; }
      const markup = renderToStaticMarkup(createElement(Capture));
      const row = findElement(tree, "data-sidebar-bot-row", bot.id)!;
      expect(String(row.props.className).split(" ")).toEqual(expect.arrayContaining([...spacing]));
      expect(markup).toContain(avatar.avatarUrl
        ? `width="${size}" height="${size}"`
        : `width="${size}px" height="${size}px"`);
    }
  });

  for (const enabled of [true, false]) {
    it.each(densities)(`opens the last selected conversation on mouse or keyboard, %s density, threads ${enabled ? "on" : "off"}`, (density) => {
      fixture.showThreads = enabled;
      let tree: ReactNode;
      function Capture() { tree = botRow(rowProps(density)); return tree; }
      renderToStaticMarkup(createElement(Capture));
      const row = findElement(tree, "data-sidebar-bot-row", bot.id)!;
      row.props.onClick!({ type: "click", target: {} } as MouseEvent);
      expect(fixture.dispatch).toHaveBeenCalledExactlyOnceWith({ type: "select", id: bot.id });
      expect(bot.threadId).toBe("last-selected");
      for (const key of ["Enter", " "]) {
        fixture.dispatch.mockClear();
        const preventDefault = vi.fn();
        row.props.onKeyDown!({ key, preventDefault } as unknown as KeyboardEvent);
        expect(preventDefault).toHaveBeenCalledOnce();
        expect(fixture.dispatch).toHaveBeenCalledExactlyOnceWith({ type: "select", id: bot.id });
      }
    });
  }

  it.each([false, true])("draws one 12px line with the 10px time (advanced %s)", (advanced) => {
    fixture.advanced = advanced;
    fixture.showThreads = false;
    const markup = renderToStaticMarkup(createElement(BotListItem, rowProps("comfortable", {
      ...bot, tasks: [], projects: [], messages: [{ id: "said", role: "bot", kind: "text", text: "Done.", at: 2 }],
    })));
    expect(markup).toContain("min-w-0 flex-1 truncate text-[12px] font-medium leading-none");
    expect(markup).toMatch(/text-\[10px\] leading-none tabular-nums text-ink-secondary/);
    expect(markup).not.toContain("text-[13px]");
    expect(markup).not.toContain("text-[15px]");
  });

  it.each([
    { advanced: false, density: "comfortable" },
    { advanced: false, density: "compact" },
    { advanced: true, density: "comfortable" },
    { advanced: true, density: "compact" },
  ] as const)("leaves the bot's role out of its row in $density density (advanced $advanced)", ({ advanced, density }) => {
    fixture.advanced = advanced;
    const markup = renderToStaticMarkup(createElement(BotListItem, rowProps(density, { ...bot, title: "Research" })));
    expect(markup).toContain(">Atlas<");
    expect(markup).not.toContain('data-testid="bot-role"');
    expect(markup).not.toContain(">Research<");
  });

  it.each([
    { advanced: false, density: "comfortable", face: 27, spacing: ["h-[43px]", "gap-[10px]", "pr-[30px]"] },
    { advanced: false, density: "compact", face: 27, spacing: ["h-[43px]", "gap-[10px]", "pr-[30px]"] },
    { advanced: true, density: "comfortable", face: 27, spacing: ["h-[43px]", "gap-[10px]", "pr-[30px]"] },
    { advanced: false, density: "icons", face: 44, spacing: ["h-[52px]", "justify-center"] },
    { advanced: true, density: "icons", face: 30, spacing: ["justify-center", "px-1", "py-1.5"] },
  ] as const)("sizes group chat rows like a bot row in $density density (advanced $advanced)", ({ advanced, density, face, spacing }) => {
    fixture.advanced = advanced;
    const group: Group = { id: "room", threadId: "room-thread", name: "Launch", memberIds: [bot.id], messages: [], defaultResponder: { kind: "mentions" }, bulletin: "", unread: false, createdAt: 1 };
    let tree: ReactNode;
    function Capture() { tree = GroupListItem({ group, density, onMenu: vi.fn() }); return tree; }
    const markup = renderToStaticMarkup(createElement(Capture));
    const row = findElement(tree, "data-sidebar-group-row", group.id)!;
    expect(String(row.props.className).split(" ")).toEqual(expect.arrayContaining([...spacing]));
    expect(markup).toContain(`width="${face}px" height="${face}px"`);
    expect(markup).toContain("min-w-0 flex-1 truncate text-[12px] font-medium leading-none text-ink");
    expect(markup).not.toContain("text-[11px]");
  });

  it("shows a room's member count beside its name", () => {
    const group: Group = { id: "room", threadId: "room-thread", name: "Launch", memberIds: ["atlas", "bruno", "carla"], messages: [], defaultResponder: { kind: "mentions" }, bulletin: "", unread: false, createdAt: 1 };
    fixture.state = { ...fixture.state, bots: [bot, { ...bot, id: "bruno", name: "Bruno" }, { ...bot, id: "carla", name: "Carla" }] };
    const markup = renderToStaticMarkup(createElement(GroupListItem, { group, density: "comfortable", onMenu: vi.fn() }));
    expect(markup).toContain('data-testid="group-member-count"');
    expect(markup).toContain(">3</span>");
  });

  it("draws the queued marker as the 7px dot", () => {
    const queuedBot: Bot = {
      ...bot,
      unread: false,
      projects: [],
      tasks: [{ threadId: "queued", title: "Next job", createdAt: 5 }],
    };
    const markup = renderToStaticMarkup(createElement(BotListItem, rowProps("comfortable", queuedBot)));
    const queuedDot = markup.match(/<span[^>]*data-testid="queued-dot"[^>]*>/)?.[0] ?? "";
    expect(queuedDot).toContain("size-[7px]");
    expect(queuedDot).toContain("bg-ink-secondary");
    expect(queuedDot).not.toContain("size-2.5");
    expect(markup).not.toContain("Queued</span>");
    expect(markup).not.toContain("waiting-dot");
  });

  it.each(densities)("opens the thread the person last wrote in when threads are hidden, %s density", (density) => {
    const used = { ...bot, mainThreadId: "idle-history" };
    for (const enabled of [false, true]) {
      fixture.showThreads = enabled;
      const opened = enabled ? { type: "select", id: bot.id } : { type: "switchTask", botId: bot.id, threadId: "idle-history" };
      const trees: ReactNode[] = [];
      function Capture() { const tree = [botRow(rowProps(density, used)), pinnedCircle(rowProps(density, used))]; trees.push(...tree); return tree; }
      renderToStaticMarkup(createElement(Capture));
      for (const tree of trees) {
        const row = findElement(tree, "data-sidebar-bot-row", bot.id)!;
        fixture.dispatch.mockClear();
        row.props.onClick!({ type: "click", target: {} } as MouseEvent);
        expect(fixture.dispatch).toHaveBeenCalledExactlyOnceWith(opened);
        if (!row.props.onKeyDown) continue;
        fixture.dispatch.mockClear();
        row.props.onKeyDown({ key: "Enter", preventDefault: vi.fn() } as unknown as KeyboardEvent);
        expect(fixture.dispatch).toHaveBeenCalledExactlyOnceWith(opened);
      }
    }
  });

  it.each(densities)("keeps selection separate from expansion in %s density", (density) => {
    fixture.state.selectedId = bot.id;
    const markup = renderToStaticMarkup(createElement(BotListItem, rowProps(density)));
    expect(markup).not.toContain("data-sidebar-thread-row");
    if (density !== "icons") expect(markup).toContain('aria-label="Expand Atlas threads" aria-expanded="false"');
  });

  it.each(densities)("with Advanced threads off, hides thread browsing and creation but keeps attention accessible in %s density", (density) => {
    fixture.advanced = true;
    fixture.showThreads = false;
    const markup = renderToStaticMarkup(createElement(BotListItem, rowProps(density)));
    expect(markup).not.toContain("data-sidebar-thread-row");
    expect(markup).not.toContain("data-sidebar-folder-row");
    expect(markup).not.toContain("Idle history");
    expect(markup).not.toContain("Quiet folder");
    expect(markup).not.toContain("New thread");
    expect(markup).not.toContain("New folder");
    expect(markup).not.toContain("Expand Atlas threads");
    expect(markup).toContain('data-testid="waiting-dot"');
    for (const id of ["approval", "working", "queued", "unread"]) expect(markup).toContain(`data-sidebar-activity-row="${id}"`);
    expect(markup).toContain('aria-label="Atlas: Review permission · Waiting for you…"');
    expect(markup).toContain('aria-label="Atlas: Next job · Queued"');
    expect(markup).toContain('aria-label="Atlas: Finished reply · Unread"');
  });

  it("removes child controls and portals from a retained hidden folder list", () => {
    const markup = renderToStaticMarkup(createElement(BotThreadList, { ...rowProps("comfortable"), selected: true, hidden: true }));
    expect(markup).toContain('hidden=""');
    expect(markup).not.toContain("<button");
    expect(markup).not.toContain("data-sidebar-thread-row");
    const shown = renderToStaticMarkup(createElement(BotThreadList, { ...rowProps("comfortable"), selected: true }));
    expect(shown).toContain('data-sidebar-folder-row="private-folder"');
    expect(shown).toContain('data-sidebar-thread-row="idle-history"');
  });

  it("only hides thread/folder creation in the bot context menu", () => {
    const render = () => renderToStaticMarkup(createElement(BotContextMenu, {
      menu: { botId: bot.id, x: 0, y: 0 }, onClose: vi.fn(), onArchive: vi.fn(), onDelete: vi.fn(), onMoveToSection: vi.fn(), onNewFolder: vi.fn(), onNewTaskFolder: vi.fn(),
    }));
    const enabled = render();
    expect(enabled).toContain("New thread");
    expect(enabled).toContain("New folder");
    expect(enabled).toContain("Delete all threads…");
    fixture.showThreads = false;
    const disabled = render();
    expect(disabled).not.toContain("New thread");
    expect(disabled).not.toContain("New folder");
    expect(disabled).toContain("Delete all threads…");
    expect(disabled).toContain("Edit Profile");
    expect(disabled).toContain("Move to department");
  });

  it("Edit profile opens the panel without naming a section", () => {
    let tree: ReactNode;
    // Called inside a render so its hooks run and the returned tree carries the items' handlers.
    function Capture() {
      tree = BotContextMenu({
        menu: { botId: bot.id, x: 0, y: 0 }, onClose: vi.fn(), onArchive: vi.fn(), onDelete: vi.fn(), onMoveToSection: vi.fn(), onNewFolder: vi.fn(), onNewTaskFolder: vi.fn(),
      });
      return tree;
    }
    const editProfile = () => {
      const items: ReactElement<ElementProps>[] = [];
      const walk = (node: ReactNode) => {
        for (const child of Children.toArray(node)) {
          if (!isValidElement<ElementProps>(child)) continue;
          if (child.props.role === "menuitem") items.push(child);
          walk(child.props.children);
        }
      };
      walk(tree);
      return items.find((item) => Children.toArray(item.props.children).includes("Edit Profile"))!;
    };
    const render = () => renderToStaticMarkup(createElement(Capture));

    render();
    editProfile().props.onClick!({} as MouseEvent);
    expect(fixture.dispatch.mock.calls).toEqual([
      [{ type: "select", id: bot.id }],
      [{ type: "toggleSettings", open: true }],
    ]);

    fixture.dispatch.mockClear();
    fixture.state.settingsOpen = true;
    render();
    editProfile().props.onClick!({} as MouseEvent);
    expect(fixture.dispatch.mock.calls).toEqual([[{ type: "select", id: bot.id }]]);

    vi.stubGlobal("window", { innerWidth: 1024, innerHeight: 768, ogb: { remoteClient: { active: true } } });
    fixture.dispatch.mockClear();
    fixture.state.settingsOpen = false;
    render();
    editProfile().props.onClick!({} as MouseEvent);
    expect(fixture.dispatch.mock.calls).toEqual([
      [{ type: "select", id: bot.id }],
      [{ type: "toggleSettings", open: true }],
    ]);
  });

  it.each(densities)("lists the bot with no thread tree in Simple mode, only a row for each thread that waits on the person, keeping its dots, in %s density", (density) => {
    // Its threads were left expanded in Advanced mode.
    fixture.advanced = true;
    let tree: ReactNode;
    function Capture() { tree = botRow(rowProps(density)); return tree; }
    renderToStaticMarkup(createElement(Capture));
    findElement(tree, "aria-label", "Expand Atlas threads")?.props.onClick!({} as MouseEvent);
    if (density !== "icons") expect(renderToStaticMarkup(createElement(BotListItem, rowProps(density)))).toContain('aria-label="Atlas threads"');
    fixture.advanced = false;
    fixture.showThreads = false;
    for (const query of ["", "history"]) {
      const markup = renderToStaticMarkup(createElement(BotListItem, rowProps(density, bot, query)));
      expect(markup).toContain(`data-sidebar-bot-row="${bot.id}"`);
      expect(markup).not.toContain("data-sidebar-thread-row");
      expect(markup).not.toContain("data-sidebar-folder-row");
      expect(markup).not.toContain('aria-label="Atlas threads"');
      if (density === "icons") expect(markup).not.toContain("data-sidebar-bot-activity");
      else {
        // It asks the person something, or has a reply they have not read; running, queued and idle threads stay out.
        expect([...markup.matchAll(/data-sidebar-activity-row="([^"]+)"/g)].map((match) => match[1]).sort()).toEqual(["approval", "unread"]);
      }
      expect(markup).toContain('data-testid="waiting-dot"');
    }
    const unread = renderToStaticMarkup(createElement(BotListItem, rowProps(density, { ...bot, tasks: [bot.tasks![0]!, bot.tasks![5]!] })));
    expect(unread.includes('data-sidebar-activity-row="unread"')).toBe(density !== "icons");
    const read = renderToStaticMarkup(createElement(BotListItem, rowProps(density, { ...bot, unread: false, tasks: [bot.tasks![0]!, bot.tasks![1]!, bot.tasks![3]!] })));
    expect(read).not.toContain("data-sidebar-activity-row");
    expect(unread).toContain(density === "icons" ? "rounded-full border border-panel bg-accent" : 'data-testid="unread-dot"');
    forgetSearchDisclosuresForTests();
  });

  it("reveals a matching sole thread when searching a bot", () => {
    fixture.advanced = true;
    const single = { ...bot, projects: [], tasks: [bot.tasks![0]], unread: false };
    const markup = renderToStaticMarkup(createElement(BotListItem, rowProps("comfortable", single, "last selected")));
    expect(markup).toContain('data-sidebar-thread-row="last-selected"');
  });

  it("does not change group collaboration histories or creation", () => {
    fixture.showThreads = false;
    const group: Group = {
      id: "group", name: "Planning", threadId: "group-thread", memberIds: [], defaultResponder: { kind: "mentions" }, bulletin: "", unread: false, createdAt: 0, messages: [],
      tasks: [{ threadId: "group-thread", title: "Group conversation", createdAt: 1 }, { threadId: "group-earlier", title: "Earlier planning", createdAt: 0 }],
    };
    fixture.state.selectedId = group.id;
    const markup = renderToStaticMarkup(createElement(GroupListItem, { group, density: "comfortable", onMenu: vi.fn() }));
    expect(markup).toContain('data-sidebar-thread-row="group-thread"');
    expect(markup).toContain('aria-label="New thread"');
    expect(markup).toContain('aria-label="Collapse Planning threads"');
    const working = renderToStaticMarkup(createElement(GroupListItem, { group: { ...group, working: true }, density: "comfortable", onMenu: vi.fn() }));
    expect(working).toMatch(/<button type="button" disabled="" aria-label="New thread"/);
    const single = renderToStaticMarkup(createElement(GroupListItem, { group: { ...group, tasks: [group.tasks![0]] }, density: "comfortable", onMenu: vi.fn() }));
    expect(single).not.toContain("Planning threads");
    expect(single).not.toContain('data-sidebar-thread-row=');
    const searched = renderToStaticMarkup(createElement(GroupListItem, {
      group: { ...group, tasks: [group.tasks![0]] }, density: "comfortable", query: "conversation", onMenu: vi.fn(),
    }));
    expect(searched).toContain('data-sidebar-thread-row="group-thread"');
  });
});

describe("group row", () => {
  it("shows the room's time without quoting its last reply", () => {
    const group: Group = {
      id: "group", name: "Planning", threadId: "group-thread", memberIds: [], defaultResponder: { kind: "mentions" }, bulletin: "", unread: false, createdAt: 0,
      messages: [
        { id: "b1", role: "bot", kind: "text", text: "Plan drafted.", at: 2, from: { botId: "atlas", name: "Atlas", color: "green" } },
        { id: "d1", role: "bot", kind: "digest", text: "[digest] · tools: Write ×1", at: 3, digest: { turnId: "t1", tools: [{ name: "Write", count: 1 }], hookCoverage: "full" } },
      ] as Group["messages"],
      tasks: [{ threadId: "group-thread", title: "Group conversation", createdAt: 1 }],
    };
    const markup = renderToStaticMarkup(createElement(GroupListItem, { group, density: "comfortable", onMenu: vi.fn() }));
    expect(markup).not.toContain("Atlas: Plan drafted.");
    expect(markup).not.toContain("[digest]");
    expect(markup).toMatch(/text-\[10px\] leading-none tabular-nums/);
  });
});

describe("activity-only escape hatch", () => {
  it("includes waiting approvals even with busy false and never treats aggregate activity as every sibling's status", () => {
    const tasks = sidebarBotActivityTasks({ ...bot, busy: true, activity: "waiting-on-you" }, fixture.state.pendingQueued!);
    expect(tasks.map((task) => task.threadId)).toEqual(["approval", "working", "queued", "unread"]);
  });

  it("switches directly to the requested work and offers no thread-management actions", () => {
    let tree: ReactNode;
    function Capture() { tree = SidebarBotActivity({ bot, rowThreadId: bot.threadId, density: "comfortable", pendingQueued: fixture.state.pendingQueued!, dispatch: fixture.dispatch }); return tree; }
    const markup = renderToStaticMarkup(createElement(Capture));
    findElement(tree, "data-sidebar-activity-row", "approval")!.props.onClick!({} as MouseEvent);
    expect(fixture.dispatch).toHaveBeenCalledExactlyOnceWith({ type: "switchTask", botId: bot.id, threadId: "approval" });
    expect(markup).not.toContain("Actions for");
    expect(markup).not.toContain("New thread");
    expect(markup).not.toContain("Delete");
  });

  it("removes selected and settled activity but keeps unread completed replies", () => {
    const selected = { ...bot, threadId: "approval", tasks: bot.tasks!.map((task) => task.threadId === "working" ? { ...task, busy: false, activity: "idle" as const } : task) };
    const markup = renderToStaticMarkup(createElement(SidebarBotActivity, { bot: selected, rowThreadId: selected.threadId, density: "compact", pendingQueued: fixture.state.pendingQueued!, dispatch: fixture.dispatch }));
    expect(markup).not.toContain('data-sidebar-activity-row="approval"');
    expect(markup).not.toContain('data-sidebar-activity-row="working"');
    expect(markup).toContain('data-sidebar-activity-row="unread"');
  });

  it("lists a reply in the thread a bot was left on, since its row opens the main thread", () => {
    const left: Bot = { ...bot, threadId: "left-behind", mainThreadId: "main-chat", tasks: [
      { threadId: "left-behind", title: "Routine report", createdAt: 1, unread: true },
      { threadId: "main-chat", title: "Main chat", createdAt: 2, unread: true },
    ] };
    const rows = () => {
      const markup = renderToStaticMarkup(createElement(BotListItem, rowProps("comfortable", left)));
      return ["left-behind", "main-chat"].filter((threadId) => markup.includes(`data-sidebar-activity-row="${threadId}"`));
    };
    fixture.advanced = true;
    fixture.showThreads = false;
    expect(rows()).toEqual(["left-behind"]);
    fixture.state.selectedId = left.id;
    expect(rows()).toEqual(["main-chat"]);
    fixture.showThreads = true;
    fixture.state.selectedId = "other-bot";
    expect(rows()).toEqual(["main-chat"]);
  });
});

describe("the agent container's five states", () => {
  const instance = {
    instanceId: "fake", driverKind: "claudeAgent", displayName: "Fake engine",
    snapshot: { state: "available" },
    models: { default: "test", options: [{ id: "test", label: "Test model" }] },
  } as InstanceInfo;
  const draw = (overrides: Partial<Bot>, selected = false) => {
    fixture.advanced = false;
    fixture.showThreads = false;
    fixture.state = {
      ...fixture.state,
      bots: [bot],
      instances: [instance],
      selectedId: selected ? bot.id : "other-bot",
      activeView: "chat",
    };
    return renderToStaticMarkup(createElement(BotListItem, rowProps("comfortable", {
      ...bot, unread: false, busy: false, tasks: [], projects: [], messages: [], ...overrides,
    })));
  };

  it("draws a read bot as a quiet row with no marker", () => {
    const markup = draw({});
    expect(markup).not.toContain('data-testid="unread-dot"');
    expect(markup).not.toContain("agent-provider-ring");
    expect(markup).not.toContain('data-testid="working-dots"');
  });

  it("marks an unread bot with the 7px dot", () => {
    const markup = draw({ unread: true });
    expect(markup).toContain('data-testid="unread-dot"');
    expect(markup).toContain("size-[7px] shrink-0 rounded-full bg-accent");
    expect(markup).not.toContain("font-[570] text-ink");
  });

  it("marks a working bot with three 3px dots and the ring around its provider", () => {
    const markup = draw({ busy: true });
    expect(markup).toContain("agent-provider-ring");
    expect(markup).toContain('data-provider-working="true"');
    expect(markup).toContain('data-testid="working-dots"');
    expect(markup.match(/size-\[3px\] animate-pulse rounded-full bg-success/g)).toHaveLength(3);
    expect(markup).not.toContain('data-testid="working-dot"');
  });

  it("draws a selected bot on the raised surface", () => {
    const markup = draw({}, true);
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain("bg-raised shadow-");
  });

  it("keeps selection and work independent: selected and working shows the surface and the dots", () => {
    const markup = draw({ busy: true }, true);
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain("bg-raised shadow-");
    expect(markup).toContain('data-testid="working-dots"');
    expect(markup).toContain("agent-provider-ring");
  });
});
