import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";

import { betaFeedNames, copyBetaFeed } from "./beta-channel-feed.mjs";

const made = [];
afterEach(() => {
  for (const directory of made.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function release(files) {
  const directory = mkdtempSync(join(tmpdir(), "beta-feed-"));
  made.push(directory);
  for (const [name, body] of Object.entries(files)) writeFileSync(join(directory, name), body);
  return directory;
}

it("maps each platform's latest feed to the beta name electron-updater asks for", () => {
  expect(betaFeedNames(["latest.yml", "latest-linux.yml", "latest-mac.yml", "MimirBot-1.0.0.deb"])).toEqual([
    ["latest.yml", "beta.yml"],
    ["latest-linux.yml", "beta-linux.yml"],
    ["latest-mac.yml", "beta-mac.yml"],
  ]);
  expect(betaFeedNames(["beta-linux.yml", "latest-linux-arm64.yml"])).toEqual([
    ["latest-linux-arm64.yml", "beta-linux-arm64.yml"],
  ]);
});

it("copies the metadata byte for byte and leaves the latest feed in place", () => {
  const directory = release({ "latest-linux.yml": "version: 1.0.0-beta.1\n", "MimirBot.deb": "binary" });
  expect(copyBetaFeed(directory)).toEqual([join(directory, "beta-linux.yml")]);
  expect(readFileSync(join(directory, "beta-linux.yml"), "utf8")).toBe("version: 1.0.0-beta.1\n");
  expect(readFileSync(join(directory, "latest-linux.yml"), "utf8")).toBe("version: 1.0.0-beta.1\n");
});

it("refuses a directory that has no update metadata to copy", () => {
  expect(() => copyBetaFeed(release({ "MimirBot.deb": "binary" }))).toThrow(/no latest\*\.yml/);
});
