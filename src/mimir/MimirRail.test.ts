import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initialDesktopCapabilities } from "@/lib/desktop";
import { setLocale } from "@/lib/i18n";
import type { SidebarDensity } from "@/lib/sidebar-preferences";
import { StoreProvider } from "@/state/store";

const fixture = vi.hoisted(() => ({
  density: "comfortable" as SidebarDensity,
  advanced: false,
  windowChrome: undefined as "mac-inset" | "win-caption" | "native" | undefined,
}));

vi.mock("@/lib/sidebar-preferences", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/sidebar-preferences")>(),
  useSidebarDensity: () => fixture.density,
}));
vi.mock("@/lib/interface-mode", () => ({ useAdvancedMode: () => fixture.advanced, setAdvancedMode: () => {} }));
vi.mock("@/components/DesktopCapabilities", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/components/DesktopCapabilities")>(),
  useDesktopCapabilities: () => ({ capabilities: { ...initialDesktopCapabilities(), windowChrome: fixture.windowChrome }, ready: true }),
}));

import { Sidebar } from "@/components/Sidebar";
import { MimirRail } from "./MimirRail";
import { MimirChatNav, MimirPanelToggle } from "./MimirTopBar";

const render = (component: typeof MimirRail | typeof Sidebar) => renderToStaticMarkup(
  createElement(StoreProvider, null, createElement(component as typeof Sidebar, { open: true, onClose: () => {} })),
);
const renderTop = (element: ReactElement) => renderToStaticMarkup(createElement(StoreProvider, null, element));

beforeEach(() => {
  fixture.density = "comfortable";
  fixture.advanced = false;
  fixture.windowChrome = undefined;
  vi.stubGlobal("window", { innerWidth: 1280, location: { protocol: "http:", search: "" } });
  setLocale("en");
});

afterEach(() => {
  vi.unstubAllGlobals();
  setLocale("en");
});

describe("the icon rail", () => {
  it("lists the places in the reference order, then usage, Apps, Help, Settings and the profile at the foot", () => {
    const html = render(MimirRail);
    const labels = ["Bots", "Automations", "Schedule", "Run logs", "Team map", "Usage", "Apps", "Help Center", "Settings"];
    const positions = labels.map((label) => {
      const index = html.indexOf(`aria-label="${label}"`);
      expect(index, label).toBeGreaterThan(-1);
      return index;
    });
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(html.indexOf("mt-auto")).toBeGreaterThan(html.indexOf('aria-label="Usage"'));
    expect(html.indexOf("mt-auto")).toBeLessThan(html.indexOf('aria-label="Apps"'));
    expect(html).toContain('src="/app-icon.svg"');
  });

  it("marks Bots as the current place while a chat is open", () => {
    expect(render(MimirRail)).toMatch(/aria-label="Bots" aria-current="page"/);
  });

  it("starts below the macOS traffic lights and leaves other windows flush", () => {
    expect(render(MimirRail)).not.toContain("-webkit-app-region");
    fixture.windowChrome = "mac-inset";
    expect(render(MimirRail)).toContain("-webkit-app-region:drag");
  });

  it("hides on the phone layout, where the sidebar is the full-screen bot list", () => {
    expect(render(MimirRail)).toMatch(/data-mimir-rail=""[^>]*max-md:hidden/);
  });
});

describe("the sidebar beside the rail", () => {
  it.each([
    ["comfortable", false], ["compact", false], ["icons", false], ["comfortable", true], ["icons", true],
  ] as const)("leaves the places and the profile to the rail (%s, advanced %s)", (density, advanced) => {
    fixture.density = density;
    fixture.advanced = advanced;
    const html = render(Sidebar);
    for (const place of ["automations", "team-map", "apps", "files"]) expect(html).not.toContain(`data-sidebar-nav="${place}"`);
    expect(html).not.toContain("data-sidebar-bottom-buttons");
    expect(html).toContain('aria-label="Search bots and messages"');
  });
});

describe("the top bar", () => {
  it("titles the sidebar's top row with the workspace, ahead of search and +", () => {
    const html = render(Sidebar);
    const title = html.indexOf('data-workspace-switcher="title"');
    expect(title).toBeGreaterThan(-1);
    expect(title).toBeLessThan(html.indexOf("data-sidebar-top-buttons"));
    expect(html).toMatch(/data-sidebar-top-row[^>]*class="[^"]*h-11/);
  });

  it("starts the chat header with Back and Forward, disabled until there is somewhere to go, then New thread", () => {
    const html = renderTop(createElement(MimirChatNav, { bot: { id: "b1", threadId: "t1" } }));
    const labels = [...html.matchAll(/aria-label="([^"]+)"/g)].map((match) => match[1]);
    expect(labels).toEqual(["Bots and navigation", "Back", "Forward", "New thread"]);
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });

  it("ends the chat header with the bot panel toggle", () => {
    expect(renderTop(createElement(MimirPanelToggle))).toMatch(/aria-label="Open agent profile"[^>]*aria-expanded="false"/);
  });
});
