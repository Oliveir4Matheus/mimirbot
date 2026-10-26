import { RELEASE_NOTES, type ReleaseNotes } from "@/lib/release-notes";

export const WHATS_NEW_SEEN_KEY = "whats-new-seen-version";

export function parseVersion(version: string): number[] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left) ?? [0, 0, 0];
  const b = parseVersion(right) ?? [0, 0, 0];
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  }
  return 0;
}

/** Every version after `lastSeen` up to `current` merged, newest first; only `current` when nothing was seen before. */
export function notesSince(lastSeen: string | null, current: string, notes: Record<string, ReleaseNotes> = RELEASE_NOTES): ReleaseNotes | null {
  const versions = Object.keys(notes)
    .filter((version) => compareVersions(version, current) <= 0 && (lastSeen === null ? version === current : compareVersions(version, lastSeen) > 0))
    .sort((left, right) => compareVersions(right, left));
  const features = versions.flatMap((version) => notes[version]!.features);
  const fixes = versions.flatMap((version) => notes[version]!.fixes);
  return features.length || fixes.length ? { features, fixes } : null;
}

export type WhatsNewDecision = { kind: "none" } | { kind: "baseline" } | { kind: "show"; notes: ReleaseNotes };

/** A fresh install (not onboarded, nothing seen) and a downgrade only record the version; the screen is for people updating. */
export function whatsNewDecision(input: { lastSeen: string | null; current: string; onboarded: boolean }): WhatsNewDecision {
  const { lastSeen, current, onboarded } = input;
  if (!parseVersion(current) || lastSeen === current) return { kind: "none" };
  if (lastSeen === null && !onboarded) return { kind: "baseline" };
  if (lastSeen !== null && compareVersions(lastSeen, current) > 0) return { kind: "baseline" };
  const notes = notesSince(lastSeen, current);
  return notes ? { kind: "show", notes } : { kind: "baseline" };
}

export function readSeenVersion(): string | null {
  try { return localStorage.getItem(WHATS_NEW_SEEN_KEY); } catch { return null; }
}

export function writeSeenVersion(version: string): void {
  try { localStorage.setItem(WHATS_NEW_SEEN_KEY, version); } catch {}
}
