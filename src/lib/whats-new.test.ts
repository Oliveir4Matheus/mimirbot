import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RELEASES, type Release } from "./release-notes";
import { compareVersions, notesFor, whatsNewDecision } from "./whats-new";

const notes: Record<string, Release> = {
  "0.1.169": {
    version: "0.1.169",
    date: "2026-11-14",
    notes: {
      en: { features: [{ title: "B", body: "b" }], fixes: ["b"] },
      "pt-br": { features: [{ title: "B pt", body: "b pt" }], fixes: ["b pt"] },
    },
  },
  "0.1.168": {
    version: "0.1.168",
    date: "2026-11-13",
    notes: { en: { features: [{ title: "A", body: "a" }], fixes: [] } },
  },
  "0.1.167": {
    version: "0.1.167",
    date: "2026-11-12",
    notes: {
      en: { features: [{ title: "Z", body: "z" }], fixes: ["z"] },
      "pt-br": { features: [{ title: "Z pt", body: "z pt" }], fixes: ["z pt"] },
    },
  },
  "0.1.170": { version: "0.1.170", date: "2026-11-15", notes: { en: { features: [], fixes: [] } } },
};

const runningVersion = (JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string }).version;

describe("compareVersions", () => {
  it("orders by number, not by text", () => {
    expect(compareVersions("0.1.10", "0.1.9")).toBeGreaterThan(0);
    expect(compareVersions("0.1.128", "0.1.128")).toBe(0);
  });
});

describe("notesFor", () => {
  it("reads one release, never the versions before it", () => {
    expect(notesFor("0.1.169", "en", notes)).toEqual({ features: [{ title: "B", body: "b" }], fixes: ["b"] });
  });

  it("reads the release in the person's language", () => {
    expect(notesFor("0.1.169", "pt-br", notes)).toEqual({ features: [{ title: "B pt", body: "b pt" }], fixes: ["b pt"] });
  });

  it("falls back to English for a language a release does not have, or one it never had", () => {
    expect(notesFor("0.1.168", "es", notes)).toEqual({ features: [{ title: "A", body: "a" }], fixes: [] });
  });

  it("uses a lone regional variant when the language has no variant of its own", () => {
    expect(notesFor("0.1.169", "pt", notes)).toEqual({ features: [{ title: "B pt", body: "b pt" }], fixes: ["b pt"] });
  });

  it("has nothing for a version without a file", () => {
    expect(notesFor("0.1.171", "en", notes)).toBeNull();
  });

  it("has nothing for a release with no notes", () => {
    expect(notesFor("0.1.170", "en", notes)).toBeNull();
  });
});

describe("RELEASES", () => {
  const files = readdirSync(new URL("../../src/releases", import.meta.url))
    .filter((file) => file.endsWith(".ts"))
    .map((file) => file.slice(0, -".ts".length))
    .sort();

  it("has one file per release, each named after the version it exports", () => {
    expect(Object.keys(RELEASES).sort()).toEqual(files);
    for (const [name, release] of Object.entries(RELEASES)) {
      expect(release.version, name).toBe(name);
      expect(Array.isArray(release.notes.en.features), name).toBe(true);
      expect(Array.isArray(release.notes.en.fixes), name).toBe(true);
    }
  });

  it("ships a notes file for the version the app is on", () => {
    expect(RELEASES[runningVersion], `src/releases/${runningVersion}.ts`).toBeDefined();
  });
});

describe("whatsNewDecision", () => {
  const base = { lastSeen: "0.1.168", current: "0.1.169", onboarded: true, releases: notes };

  it("shows the notes after an update", () => {
    expect(whatsNewDecision(base)).toMatchObject({ kind: "show" });
  });

  it("shows only the current release's notes, with its date", () => {
    expect(whatsNewDecision(base)).toEqual({
      kind: "show",
      version: "0.1.169",
      date: "2026-11-14",
      notes: notes["0.1.169"]!.notes.en,
    });
  });

  it("shows the current release in the active language", () => {
    expect(whatsNewDecision({ ...base, locale: "pt-br" })).toMatchObject({
      kind: "show",
      notes: notes["0.1.169"]!.notes["pt-br"],
    });
  });

  it("stays quiet when the version was already seen", () => {
    expect(whatsNewDecision({ ...base, lastSeen: "0.1.169" })).toEqual({ kind: "none" });
  });

  it("only records the version on a fresh install", () => {
    expect(whatsNewDecision({ ...base, lastSeen: null, onboarded: false })).toEqual({ kind: "baseline" });
  });

  it("shows an existing user the notes the first time the screen exists", () => {
    expect(whatsNewDecision({ ...base, lastSeen: null })).toMatchObject({ kind: "show" });
  });

  it("only records the version on a downgrade", () => {
    expect(whatsNewDecision({ ...base, lastSeen: "0.1.170" })).toEqual({ kind: "baseline" });
  });

  it("only records the version when the release has no notes", () => {
    expect(whatsNewDecision({ ...base, lastSeen: "0.1.169", current: "0.1.170" })).toEqual({ kind: "baseline" });
  });

  it("does nothing in a dev build", () => {
    expect(whatsNewDecision({ ...base, current: "dev" })).toEqual({ kind: "none" });
  });
});
