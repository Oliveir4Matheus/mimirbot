import { describe, expect, it } from "vitest";
import type { ReleaseNotes } from "./release-notes";
import { compareVersions, notesSince, whatsNewDecision } from "./whats-new";

const notes: Record<string, ReleaseNotes> = {
  "0.1.129": { features: ["B"], fixes: ["b"] },
  "0.1.128": { features: ["A"], fixes: [] },
  "0.1.127": { features: ["Z"], fixes: ["z"] },
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
});

describe("whatsNewDecision", () => {
  const base = { lastSeen: "0.1.128", current: "0.1.129", onboarded: true };

  it("shows the notes after an update", () => {
    expect(whatsNewDecision(base)).toMatchObject({ kind: "show" });
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
