import { RELEASES, type LocalizedReleaseNotes, type Release, type ReleaseNotes } from "@/lib/release-notes";

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

/** The notes for `version` alone, never merged with other releases; in `locale` when that file has it and in English otherwise. Null when the version shipped no file or an empty one. */
export function notesFor(version: string, locale = "en", releases: Record<string, Release> = RELEASES): ReleaseNotes | null {
  const release = releases[version];
  if (!release) return null;
  const notes = localized(release.notes, locale);
  return notes.features.length || notes.fixes.length ? notes : null;
}

/** The release's own text for `locale`, a lone regional variant of it (pt → pt-br), or English. */
function localized(notes: LocalizedReleaseNotes, locale: string): ReleaseNotes {
  const exact = notes[locale];
  if (exact) return exact;
  const base = locale.split("-")[0]!;
  const regional = Object.keys(notes).filter((key) => key.split("-")[0] === base);
  return (regional.length === 1 ? notes[regional[0]!] : undefined) ?? notes.en;
}

export type WhatsNewDecision =
  | { kind: "none" }
  | { kind: "baseline" }
  | { kind: "show"; version: string; date: string; notes: ReleaseNotes };

/** A fresh install (not onboarded, nothing seen) and a downgrade only record the version; the screen is for people updating. */
export function whatsNewDecision(input: {
  lastSeen: string | null;
  current: string;
  onboarded: boolean;
  locale?: string;
  releases?: Record<string, Release>;
}): WhatsNewDecision {
  const { lastSeen, current, onboarded, locale = "en", releases = RELEASES } = input;
  if (!parseVersion(current) || lastSeen === current) return { kind: "none" };
  if (lastSeen === null && !onboarded) return { kind: "baseline" };
  if (lastSeen !== null && compareVersions(lastSeen, current) > 0) return { kind: "baseline" };
  const release = releases[current];
  const notes = notesFor(current, locale, releases);
  return release && notes ? { kind: "show", version: current, date: release.date, notes } : { kind: "baseline" };
}

export function readSeenVersion(): string | null {
  try { return localStorage.getItem(WHATS_NEW_SEEN_KEY); } catch { return null; }
}

export function writeSeenVersion(version: string): void {
  try { localStorage.setItem(WHATS_NEW_SEEN_KEY, version); } catch {}
}
