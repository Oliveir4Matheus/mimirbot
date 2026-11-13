import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import type { UpdaterState } from "@/lib/updater";

const fixture = vi.hoisted(() => ({ state: null as UpdaterState | null }));
vi.mock("@/lib/updater", () => ({ useUpdaterState: () => fixture.state }));
import { UpdateChannelRow, UpdatesRow } from "./SettingsModal";

afterEach(() => vi.unstubAllGlobals());
function render(state: UpdaterState | null) {
  fixture.state = state;
  vi.stubGlobal("window", { ogb: { updater: { check: vi.fn(), install: vi.fn(), onState: vi.fn() } } });
  return renderToStaticMarkup(createElement(UpdatesRow));
}
function renderChannel(state: UpdaterState | null, bridge: object = { setChannel: vi.fn(), onState: vi.fn() }) {
  fixture.state = state;
  vi.stubGlobal("window", { ogb: { updater: bridge } });
  return renderToStaticMarkup(createElement(UpdateChannelRow));
}

it("says nothing about updates on a page the desktop app doesn't answer, such as another server's", () => {
  expect(render(null)).toBe("");
});

it("shows this app's update where the desktop app answers, with no Download step", () => {
  expect(render({ status: "idle" })).toContain("Check for updates");
  const downloading = render({ status: "downloading", version: "0.2.0", percent: 40 });
  expect(downloading).toContain("Downloading 40%");
  expect(downloading).toContain("disabled");
  const ready = render({ status: "downloaded", version: "0.2.0" });
  expect(ready).toContain("MimirBot 0.2.0 is ready — restart the app to apply");
  expect(ready).toContain("Restart and install");
  expect(render({ status: "downloaded", version: "0.2.0", installMode: "handoff" })).toContain("MimirBot 0.2.0 is ready — install it in a terminal");
});

it("lets a person pick the official feed or the beta branch", () => {
  const main = renderChannel({ status: "idle", channel: "main" });
  expect(main).toContain("Update channel");
  expect(main).toContain("Main (official)");
  expect(main).toContain("Beta");
  expect(main).toContain('value="main" selected=""');
  expect(renderChannel({ status: "idle", channel: "beta" })).toContain('value="beta" selected=""');
});

it("keeps the channel picker off a page without the update bridge, and still while an update is being applied", () => {
  expect(renderChannel({ status: "idle" }, { onState: vi.fn() })).toBe("");
  for (const status of ["downloading", "preparing", "installing"] as const) {
    expect(renderChannel({ status, channel: "beta" }), status).toContain('disabled=""');
  }
  expect(renderChannel({ status: "idle", channel: "beta" })).not.toContain('disabled=""');
});
