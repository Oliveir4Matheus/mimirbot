import { describe, expect, it } from "vitest";
import { RELEASE_NOTES, type LocalizedReleaseNotes } from "./release-notes";
import { compareVersions, notesSince, whatsNewDecision } from "./whats-new";

const notes: Record<string, LocalizedReleaseNotes> = {
  "0.1.129": { en: { features: ["B"], fixes: ["b"] }, "pt-br": { features: ["B pt"], fixes: ["b pt"] } },
  "0.1.128": { en: { features: ["A"], fixes: [] } },
  "0.1.127": { en: { features: ["Z"], fixes: ["z"] }, "pt-br": { features: ["Z pt"], fixes: ["z pt"] } },
};

describe("compareVersions", () => {
  it("orders by number, not by text", () => {
    expect(compareVersions("0.1.10", "0.1.9")).toBeGreaterThan(0);
    expect(compareVersions("0.1.128", "0.1.128")).toBe(0);
  });
});

describe("notesSince", () => {
  it("merges every version after the last seen one, newest first", () => {
    expect(notesSince("0.1.127", "0.1.129", notes)).toEqual({ features: ["B", "A"], fixes: ["b"] });
  });

  it("uses only the current version when nothing was seen before", () => {
    expect(notesSince(null, "0.1.129", notes)).toEqual({ features: ["B"], fixes: ["b"] });
  });

  it("has nothing for a version without notes", () => {
    expect(notesSince("0.1.129", "0.1.130", notes)).toBeNull();
  });

  it("reads each version in the person's language", () => {
    expect(notesSince("0.1.127", "0.1.129", notes, "pt-br")).toEqual({ features: ["B pt", "A"], fixes: ["b pt"] });
  });

  it("falls back to English for a language a version does not have, or one it never had", () => {
    expect(notesSince("0.1.127", "0.1.129", notes, "es")).toEqual({ features: ["B", "A"], fixes: ["b"] });
  });
});

describe("RELEASE_NOTES", () => {
  it("says the same in English and Portuguese for every version", () => {
    for (const [version, entry] of Object.entries(RELEASE_NOTES)) {
      expect(entry["pt-br"]?.features.length, version).toBe(entry.en.features.length);
      expect(entry["pt-br"]?.fixes.length, version).toBe(entry.en.fixes.length);
    }
  });
});

describe("whatsNewDecision", () => {
  const base = { lastSeen: "0.1.128", current: "0.1.129", onboarded: true };

  it("shows the notes after an update", () => {
    expect(whatsNewDecision(base)).toMatchObject({ kind: "show" });
  });

  it("shows the current version's notes in the active language", () => {
    const current = Object.keys(RELEASE_NOTES)[0]!;
    const previous = Object.keys(RELEASE_NOTES)[1]!;
    const decision = whatsNewDecision({ lastSeen: previous, current, onboarded: true, locale: "pt-br" });
    expect(decision).toMatchObject({ kind: "show", notes: RELEASE_NOTES[current]!["pt-br"] });
  });

  it("stays quiet when the version was already seen", () => {
    expect(whatsNewDecision({ ...base, lastSeen: "0.1.129" })).toEqual({ kind: "none" });
  });

  it("only records the version on a fresh install", () => {
    expect(whatsNewDecision({ ...base, lastSeen: null, onboarded: false })).toEqual({ kind: "baseline" });
  });

  it("shows an existing user the notes the first time the screen exists", () => {
    expect(whatsNewDecision({ ...base, lastSeen: null })).toMatchObject({ kind: "show" });
  });

  it("only records the version on a downgrade", () => {
    expect(whatsNewDecision({ ...base, lastSeen: "0.1.130" })).toEqual({ kind: "baseline" });
  });

  it("does nothing in a dev build", () => {
    expect(whatsNewDecision({ ...base, current: "dev" })).toEqual({ kind: "none" });
  });
});
