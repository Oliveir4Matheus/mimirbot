import { Children, createElement, isValidElement, type EffectCallback, type ReactElement, type ReactNode, type KeyboardEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ effects: [] as EffectCallback[], dispatch: vi.fn(), api: vi.fn(), create: vi.fn(), setDraft: vi.fn(), setStep: vi.fn(),
  draft: null as unknown, patched: false, step: null as string | null, ready: false, hook: 0, admin: false,
  profile: {} as Record<string, unknown>, track: vi.fn(), advanced: true, appSettingsOpen: false, openBot: vi.fn() }));
vi.mock("@/state/thread-navigation", async importOriginal => ({
  ...await importOriginal<typeof import("@/state/thread-navigation")>(), openBot: fixture.openBot,
}));
vi.mock("@/lib/analytics", () => ({ track: fixture.track }));
vi.mock("@/lib/interface-mode", () => ({ useAdvancedMode: () => fixture.advanced }));
vi.mock("@/lib/use-owner-or-admin", () => ({ useOwnerOrAdmin: () => fixture.admin }));
vi.mock("./DesktopCapabilities", () => ({ useDesktopCapabilities: () => ({ capabilities: {} }) }));
// The dialog's hooks are, in order: render tick, draft, step, ready. A render builds a fresh draft, so the first one is kept
// to let a test choose a starting role on one render and create the bot from the next.
vi.mock("react", async importOriginal => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useEffect: (effect: EffectCallback) => { fixture.effects.push(effect); }, useState: (initial: unknown) => {
    const state = react.useState(initial);
    const index = fixture.hook++;
    if (index === 1) {
      fixture.draft ??= state[0];
      const draft = fixture.draft as { bot: { name: string }; patch: (patch: { name: string }) => void };
      if (fixture.ready && !fixture.patched) { fixture.patched = true; draft.patch({ name: "Fixture", ...fixture.profile }); }
      return [draft, fixture.setDraft];
    }
    if (index === 2) return [fixture.step ?? state[0], fixture.setStep];
    return fixture.ready && index === 3 ? [true, state[1]] : state;
  } };
});
vi.mock("@/lib/create-configured-bot", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/create-configured-bot")>(), createConfiguredBot: fixture.create,
}));
vi.mock("@/state/store", async importOriginal => {
  const store = await importOriginal<typeof import("@/state/store")>();
  return { ...store, api: fixture.api, BotEditorStore: () => null, useStore: () => ({ state: { ...store.initialState, appSettingsOpen: fixture.appSettingsOpen }, dispatch: fixture.dispatch }) };
});
import { LocalNewBotDialog as NewBotDialog, CompanionNewBotDialog, NewBotDialog as RoutedNewBotDialog } from "./NewBotDialog";
import { setTeamChats } from "@/state/team-chats";
import { Select } from "./Select";
import { NewBotFrame } from "./new-bot/NewBotFrame";
import type { BotCreationDraft } from "@/lib/bot-creation-draft";

type Node = ReactElement<{ children?: ReactNode; role?: string; "aria-label"?: string; onClick?: () => void; onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void; disabled?: boolean;
  "aria-current"?: string; visibility?: unknown; draft?: BotCreationDraft }>;
function nodes(value: ReactNode): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!isValidElement(value)) return [];
  const node = value as Node;
  const slots = ["actions", "banner", "who"].flatMap(key => nodes((node.props as Record<string, unknown>)[key] as ReactNode));
  return [node, ...slots, ...Children.toArray(node.props.children).flatMap(nodes)];
}
// One component's own output, without rendering the components inside it.
function output(element: Node): Node[] {
  let tree: ReactNode = null;
  function Capture() { tree = (element.type as (props: unknown) => ReactNode)(element.props); return null; }
  renderToStaticMarkup(createElement(Capture));
  return nodes(tree);
}
const named = (name: string) => (node: Node) => typeof node.type === "function" && node.type.name === name;
const text = (value: ReactNode): string => Children.toArray(value).map(child =>
  typeof child === "string" || typeof child === "number" ? String(child) : isValidElement(child) ? text((child as Node).props.children) : "").join("");
const buttons = (dialog: Node[]) => dialog.filter(node => node.type === "button");
const button = (dialog: Node[], label: string) => buttons(dialog).find(node => text(node.props.children) === label)!;
const tabs = (dialog: Node[]) => dialog.find(node => node.type === "nav")!.props.children as Node[];
const labels = (dialog: Node[]) => {
  const tabCount = nodes(tabs(dialog)).filter(node => node.type === "button").length;
  const afterNav = dialog.slice(dialog.findIndex(node => node.type === "nav") + 1);
  return buttons(afterNav).slice(tabCount).filter(node => !node.props["aria-label"]).map(node => text(node.props.children));
};
const tabLabels = (dialog: Node[]) => nodes(tabs(dialog)).filter(node => node.type === "button").map(node => text(node.props.children).replace(/\d+$/, ""));
const title = (dialog: Node[]) => text(dialog.find(node => node.type === "h2")!.props.children);
function chooseStartingRole(dialog: Node[], value: string) {
  const identity = output(dialog.find(named("StepContent"))!).find(named("IdentityStep"))!;
  const select = output(output(identity).find(named("StartingRole"))!).find(node => node.type === Select)!;
  (select.props as unknown as { onChange: (event: { target: { value: string } }) => void }).onChange({ target: { value } });
}
function render(defaultsMode = false, onCreated?: () => void | Promise<void>) {
  let tree!: ReturnType<typeof NewBotDialog>;
  function Capture() { fixture.hook = 0; tree = NewBotDialog({ defaultsMode, onCreated }); return tree; }
  const html = renderToStaticMarkup(createElement(Capture));
  return { html, nodes: output(tree as unknown as Node) };
}
const create = (dialog: Node[]) => button(dialog, "Create bot").props.onClick!();
beforeEach(() => {
  fixture.advanced = true;
  fixture.effects = []; fixture.dispatch.mockReset(); fixture.api.mockReset();
  fixture.ready = false; fixture.admin = false; fixture.create.mockReset(); fixture.setDraft.mockReset(); fixture.setStep.mockReset();
  fixture.draft = null; fixture.patched = false; fixture.step = null; fixture.profile = { title: "Analyst", soul: "Keep the books." };
  fixture.track.mockReset();
  fixture.appSettingsOpen = false;
  fixture.openBot.mockReset();
  fixture.api.mockReturnValue(new Promise(() => {}));
});
afterEach(() => { vi.unstubAllGlobals(); setTeamChats(null); });

describe("bot draft dialog", () => {
  it("offers the audience choice only to browser admins, on the identity step", () => {
    fixture.ready = true;
    const visibility = (defaultsMode = false) => render(defaultsMode).nodes.find(named("StepContent"))!.props.visibility;
    fixture.admin = true;
    vi.stubGlobal("window", {});
    expect(visibility()).toMatchObject({ audience: "everyone", people: "" });
    expect(visibility(true)).toBeUndefined();
    fixture.admin = false;
    expect(visibility()).toBeUndefined();
    fixture.admin = true;
    vi.stubGlobal("window", { ogb: {} });
    expect(visibility()).toBeUndefined();
  });
  it("keeps the new bot and shows it as ready after a creation whose caller fails, sync or async", async () => {
    for (const asyncFailure of [false, true]) {
      fixture.dispatch.mockReset(); fixture.create.mockReset(); fixture.draft = null; fixture.patched = false;
      fixture.ready = true; fixture.step = "summary";
      const bot = { id: "created", name: "Fixture" };
      fixture.create.mockResolvedValue({ bot, warnings: [] });
      const failed = () => { throw new Error("Caller failed"); };
      create(render(false, asyncFailure ? async () => failed() : failed).nodes);
      await vi.waitFor(() => expect(fixture.dispatch).toHaveBeenCalledWith({ type: "error", message: "Caller failed" }));
      expect(fixture.create).toHaveBeenCalledTimes(1);
      expect(fixture.dispatch).toHaveBeenCalledWith({ type: "botAdded", bot, preserveSelection: false });
      expect(fixture.dispatch).not.toHaveBeenCalledWith({ type: "toggleNewBot", open: false });
    }
  });
  it("creates a Full access bot at once, with no confirmation dialog", async () => {
    fixture.ready = true; fixture.step = "summary";
    fixture.profile = { ...fixture.profile, approvalMode: "full" };
    const bot = { id: "created", name: "Fixture", approvalMode: "full" };
    fixture.create.mockResolvedValue({ bot, warnings: [] });
    const result = render();
    expect(result.html).not.toContain('role="alertdialog"');
    create(result.nodes);
    await vi.waitFor(() => expect(fixture.create).toHaveBeenCalledTimes(1));
    expect(fixture.create.mock.calls[0][0].bot).toMatchObject({ name: "Fixture", approvalMode: "full" });
    expect(fixture.create.mock.calls[0][0].consent).toEqual({});
    await vi.waitFor(() => expect(fixture.dispatch).toHaveBeenCalledWith({ type: "botAdded", bot, preserveSelection: false }));
  });
  it("will not create a bot that still lacks a name", async () => {
    fixture.ready = true; fixture.step = "summary";
    fixture.profile = { name: "" };
    const result = render();
    expect(button(result.nodes, "Create bot").props.disabled).toBe(true);
    expect(button(result.nodes, "Continue to advanced settings").props.disabled).toBe(true);
    create(result.nodes);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fixture.create).not.toHaveBeenCalled();
    expect(result.html).toContain("Required fields missing: 1");
  });
  it("creates a blank bot with no title or instructions, to be shaped later with /setup", async () => {
    fixture.ready = true; fixture.step = "summary";
    fixture.profile = { title: "", soul: "" };
    fixture.create.mockResolvedValue({ bot: { id: "created", name: "Fixture" }, warnings: [] });
    const result = render();
    expect(button(result.nodes, "Create bot").props.disabled).toBeFalsy();
    create(result.nodes);
    await vi.waitFor(() => expect(fixture.create).toHaveBeenCalledTimes(1));
    expect(fixture.create.mock.calls[0][0].bot).toMatchObject({ name: "Fixture", title: "", soul: "" });
  });

  it("keeps initial backward keyboard navigation inside the companion dialog", () => {
    let tree!: ReturnType<typeof CompanionNewBotDialog>;
    function Capture() { tree = CompanionNewBotDialog(); return tree; }
    renderToStaticMarkup(createElement(Capture));
    const first = { focus: vi.fn() }, last = { focus: vi.fn() };
    const root = { querySelectorAll: () => [first, last] };
    vi.stubGlobal("document", { activeElement: root });
    const preventDefault = vi.fn();
    nodes(tree).find(node => node.props.role === "dialog")!.props.onKeyDown!({
      key: "Tab", shiftKey: true, currentTarget: root, preventDefault,
    } as unknown as KeyboardEvent<HTMLDivElement>);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(last.focus).toHaveBeenCalledOnce();
    expect(first.focus).not.toHaveBeenCalled();
  });
  it("keeps companion creation on its permitted single-request path", () => {
    vi.stubGlobal("window", { ogb: { remoteClient: { active: true } } });
    const routed = RoutedNewBotDialog();
    expect(routed.type).toBe(CompanionNewBotDialog);
    let tree!: ReturnType<typeof CompanionNewBotDialog>;
    function Capture() { tree = CompanionNewBotDialog(); return tree; }
    const html = renderToStaticMarkup(createElement(Capture));
    expect(html).toContain("Create bot");
    const create = nodes(tree).filter(node => node.type === "button").at(-1)!;
    create.props.onClick!();
    expect(fixture.dispatch).toHaveBeenCalledWith({ type: "newBot", onCreated: expect.any(Function) });
    expect(fixture.api).not.toHaveBeenCalled();
  });
  it("steps aside while App settings, opened from inside it, is on top", () => {
    expect(render().html).not.toMatch(/^<div[^>]* hidden/);
    fixture.appSettingsOpen = true;
    expect(render().html).toMatch(/^<div[^>]* hidden/);
    expect(render(true).html).not.toMatch(/^<div[^>]* hidden/);
  });
  it("opens immediately on the basic steps, with no creation request", () => {
    const result = render();
    expect(result.html).toContain('role="dialog"');
    expect(tabLabels(result.nodes)).toEqual(["Identity", "Permissions", "Soul", "Summary"]);
    expect(title(result.nodes)).toBe("New Bot");
    fixture.effects[0]();
    expect(fixture.api).toHaveBeenCalledExactlyOnceWith("/api/bot-defaults");
    expect(fixture.dispatch).not.toHaveBeenCalled();
    expect(button(result.nodes, "Next").props.disabled).toBe(true);
    expect(labels(result.nodes)).toEqual(["Cancel", "Next"]);
  });

  it.each([undefined, null, { instanceId: "", model: "" }])("fills an unselected saved default from the available model (%j)", async selection => {
    const available = { instanceId: "openrouter", model: "fixture-model" };
    fixture.api.mockResolvedValue({ defaults: { profile: { modelSelection: selection }, memory: {}, skills: [], routines: [] }, modelSelection: available, suggestedName: "Fixture" });
    render();
    fixture.effects[0]();
    await vi.waitFor(() => expect(fixture.setDraft).toHaveBeenCalledOnce());
    expect(fixture.setDraft.mock.calls[0]![0].bot.modelSelection).toEqual(available);
  });

  it.each([
    { instanceId: "claude", model: "chosen-model" },
    { instanceId: "claude", model: "" },
    { instanceId: "", model: "chosen-model" },
  ])("preserves an intentional saved model choice (%j)", async selection => {
    fixture.api.mockResolvedValue({ defaults: { profile: { modelSelection: selection }, memory: {}, skills: [], routines: [] }, modelSelection: { instanceId: "openrouter", model: "fixture-model" }, suggestedName: "Fixture" });
    render();
    fixture.effects[0]();
    await vi.waitFor(() => expect(fixture.setDraft).toHaveBeenCalledOnce());
    expect(fixture.setDraft.mock.calls[0]![0].bot.modelSelection).toEqual(selection);
  });

  it("can cancel a loading draft without creating or deleting a bot", () => {
    const result = render();
    result.nodes.find(node => node.type === "button" && node.props["aria-label"] === "Close")!.props.onClick!();
    expect(fixture.dispatch).toHaveBeenCalledExactlyOnceWith({ type: "toggleNewBot", open: false });
    expect(fixture.api).not.toHaveBeenCalled();
  });

  it.each([
    [["research"], { source: "template", template: "research" }],
    [["coder", ""], { source: "blank" }],
    [[], { source: "blank" }],
  ])("reports the starting role chosen in the dialog (%j) once the bot is created", async (choices, props) => {
    vi.stubGlobal("window", {});
    fixture.ready = true;
    fixture.create.mockResolvedValue({ bot: { id: "created", name: "Fixture" }, warnings: [] });
    const identity = render().nodes;
    for (const value of choices) chooseStartingRole(identity, value);
    fixture.step = "summary";
    create(render().nodes);
    await vi.waitFor(() => expect(fixture.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "botAdded" })));
    expect(fixture.track.mock.calls).toEqual([["bot_created", props]]);
  });

  it("on a team's Cloud, opens the creator's own private chat with the new bot, never the team's shared main chat", async () => {
    setTeamChats({ teamId: "acme", member: false, opened: [] });
    fixture.ready = true; fixture.step = "summary";
    const bot = { id: "created", name: "Fixture" };
    fixture.create.mockResolvedValue({ bot, warnings: [] });
    create(render().nodes);
    await vi.waitFor(() => expect(fixture.openBot).toHaveBeenCalledTimes(1));
    expect(fixture.openBot.mock.calls[0].slice(0, 2)).toEqual([fixture.dispatch, bot]);
    const added = fixture.dispatch.mock.calls.findIndex(([action]) => action.type === "botAdded");
    expect(added).toBeGreaterThanOrEqual(0);
    expect(fixture.openBot.mock.invocationCallOrder[0]).toBeGreaterThan(fixture.dispatch.mock.invocationCallOrder[added]);
  });

  it("anywhere but a team's Cloud, leaves the new bot selected as it always was", async () => {
    fixture.ready = true; fixture.step = "summary";
    fixture.create.mockResolvedValue({ bot: { id: "created", name: "Fixture" }, warnings: [] });
    create(render().nodes);
    await vi.waitFor(() => expect(fixture.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "botAdded" })));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fixture.openBot).not.toHaveBeenCalled();
  });

  it("reports a preset chosen after a starting role as the start, never naming the preset", async () => {
    vi.stubGlobal("window", {});
    fixture.ready = true;
    fixture.create.mockResolvedValue({ bot: { id: "created", name: "Fixture" }, warnings: [] });
    const identity = render().nodes;
    chooseStartingRole(identity, "coder");
    identity.find(named("StepContent"))!.props.draft!.choosePreset({ id: "My secret preset", skills: [], notes: [] });
    fixture.step = "summary";
    create(render().nodes);
    await vi.waitFor(() => expect(fixture.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "botAdded" })));
    expect(fixture.track.mock.calls).toEqual([["bot_created", { source: "preset" }]]);
  });

  it("reports nothing when saving the defaults for new bots, or when creating fails", async () => {
    fixture.ready = true;
    fixture.api.mockResolvedValue({});
    button(render(true).nodes, "Save defaults").props.onClick!();
    await vi.waitFor(() => expect(fixture.api).toHaveBeenCalledWith("/api/config", expect.objectContaining({ method: "PATCH" })));
    fixture.create.mockRejectedValue(new Error("no engine"));
    fixture.step = "summary";
    create(render().nodes);
    await vi.waitFor(() => expect(fixture.create).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fixture.track).not.toHaveBeenCalled();
  });

  it("reports a bot made from a paired companion as blank, once it exists", () => {
    vi.stubGlobal("window", { ogb: { remoteClient: { active: true } } });
    let tree!: ReturnType<typeof CompanionNewBotDialog>;
    function Capture() { tree = CompanionNewBotDialog(); return tree; }
    renderToStaticMarkup(createElement(Capture));
    nodes(tree).filter(node => node.type === "button").at(-1)!.props.onClick!();
    expect(fixture.track).not.toHaveBeenCalled();
    fixture.dispatch.mock.calls[0]![0].onCreated({ id: "created" });
    expect(fixture.track.mock.calls).toEqual([["bot_created", { source: "blank" }]]);
  });

  it("uses the same section editor for default templates", () => {
    const result = render(true);
    expect(title(result.nodes)).toBe("Defaults for new bots");
    expect(result.html).toContain("Defaults for new bots");
    expect(result.html).toContain("Save defaults");
    expect(result.html).not.toContain(">Create bot<");
    expect(tabLabels(result.nodes)).toEqual(["Identity", "Permissions", "Soul", "Skills", "Memory", "Routines", "Access", "Model", "Voice & alerts"]);
    expect(labels(result.nodes)).toEqual(["Cancel", "Continue", "Save defaults"]);
  });
});

describe("step navigation", () => {
  it("moves on from a complete step", () => {
    fixture.ready = true;
    const result = render();
    expect(button(result.nodes, "Next").props.disabled).toBeFalsy();
    button(result.nodes, "Next").props.onClick!();
    expect(fixture.setStep).toHaveBeenCalledWith("permissions");
  });

  it("stays put, with Next off, while the name is empty", () => {
    fixture.ready = true;
    fixture.profile = { name: "" };
    const result = render();
    expect(button(result.nodes, "Next").props.disabled).toBe(true);
    button(result.nodes, "Next").props.onClick!();
    expect(fixture.setStep).not.toHaveBeenCalled();
    expect(result.html).toContain("Required fields missing: 1");
  });

  it("sends a jump to a later tab back to the step that lacks a field", () => {
    fixture.ready = true;
    fixture.profile = { name: "" };
    const result = render();
    const summary = nodes(tabs(result.nodes)).find(node => node.type === "button" && text(node.props.children).startsWith("Summary"))!;
    summary.props.onClick!();
    expect(fixture.setStep).toHaveBeenCalledWith("identity");
    expect(fixture.setStep).not.toHaveBeenCalledWith("summary");
  });

  it("marks the current step and the finished ones", () => {
    fixture.ready = true;
    fixture.profile = { name: "" };
    const result = render();
    const current = nodes(tabs(result.nodes)).filter(node => node.type === "button" && node.props["aria-current"] === "page");
    expect(current.map(node => text(node.props.children))).toEqual(["Identity1"]);
    expect(tabLabels(result.nodes)).toEqual(["Identity", "Permissions", "Soul", "Summary"]);
  });

  it("offers create and the advanced settings from the summary, and Back to Soul", () => {
    fixture.ready = true; fixture.step = "summary";
    const result = render();
    expect(labels(result.nodes)).toEqual(["Cancel", "Back", "Continue to advanced settings", "Create bot"]);
    button(result.nodes, "Back").props.onClick!();
    expect(fixture.setStep).toHaveBeenCalledWith("essence");
    button(result.nodes, "Continue to advanced settings").props.onClick!();
    expect(fixture.setStep).toHaveBeenCalledWith("skills");
  });

  it("runs the advanced steps with Continue and Save and close, and no Cancel", async () => {
    fixture.ready = true; fixture.step = "skills";
    const result = render();
    expect(title(result.nodes)).toBe("Advanced settings");
    expect(tabLabels(result.nodes)).toEqual(["Skills", "Memory", "Routines", "Access", "Model", "Voice & alerts"]);
    expect(labels(result.nodes)).toEqual(["Back", "Continue", "Save and close"]);
    button(result.nodes, "Continue").props.onClick!();
    expect(fixture.setStep).toHaveBeenCalledWith("memory");
    button(result.nodes, "Back").props.onClick!();
    expect(fixture.setStep).toHaveBeenCalledWith("summary");
    fixture.create.mockResolvedValue({ bot: { id: "created", name: "Fixture" }, warnings: [] });
    button(result.nodes, "Save and close").props.onClick!();
    await vi.waitFor(() => expect(fixture.create).toHaveBeenCalledTimes(1));
  });

  it("leaves the model step out of simple mode and ends the advanced steps on Save and close", () => {
    fixture.ready = true; fixture.step = "voice"; fixture.advanced = false;
    const result = render();
    expect(tabLabels(result.nodes)).toEqual(["Skills", "Memory", "Routines", "Access", "Voice & alerts"]);
    expect(labels(result.nodes)).toEqual(["Back", "Save and close"]);
  });

  it("shows the bot being configured beside the advanced title", () => {
    fixture.ready = true; fixture.step = "memory";
    expect(render().html).toContain("Fixture");
  });
});

describe("editing the defaults for new bots", () => {
  it("moves on past an empty name, since a default can be left blank", () => {
    fixture.ready = true;
    fixture.profile = { name: "" };
    const result = render(true);
    expect(button(result.nodes, "Continue").props.disabled).toBeFalsy();
    expect(button(result.nodes, "Save defaults").props.disabled).toBeFalsy();
    button(result.nodes, "Continue").props.onClick!();
    expect(fixture.setStep).toHaveBeenCalledWith("permissions");
  });
});

describe("the finished dialog", () => {
  const frame = (done?: { bot: never; onAnother: () => void; onStart: () => void }) => renderToStaticMarkup(createElement(NewBotFrame, {
    dialogRef: null, title: "New Bot", onClose: () => {}, tabs: [], activeTab: "", onTab: () => {}, actions: null, done, children: "steps",
  }));

  it("replaces the steps with the bot's confirmation and the two ways on", () => {
    const bot = { id: "b", name: "Ada", section: "Finance" } as never;
    const html = frame({ bot, onAnother: () => {}, onStart: () => {} });
    expect(html).toContain("Ada is ready");
    expect(html).toContain("Ada is now available in Finance.");
    expect(html).toContain("Create another bot");
    expect(html).toContain("Start a conversation with the bot");
    expect(html).not.toContain("steps");
  });

  it("names General for a bot with no department", () => {
    expect(frame({ bot: { id: "b", name: "Ada" } as never, onAnother: () => {}, onStart: () => {} })).toContain("available in General.");
  });
});
