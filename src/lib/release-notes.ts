/** A screenshot that ships with the release, already imported for its URL. */
export interface ReleaseShot {
  src: string;
  caption: string;
}

/** One change with its own heading. `shot` shows the screen it changed, when the release has one. */
export interface FeatureNote {
  title: string;
  body: string;
  shot?: ReleaseShot;
}

/** One release's notes: the line under the version, the features, and the smaller fixes. */
export interface ReleaseNotes {
  lead?: string;
  features: FeatureNote[];
  fixes: string[];
}

export type LocalizedReleaseNotes = { en: ReleaseNotes } & Partial<Record<string, ReleaseNotes>>;

/** The default export of one `src/releases/<version>.ts`: the day it shipped and its notes in every language it has. */
export interface Release {
  version: string;
  date: string;
  notes: LocalizedReleaseNotes;
}

const files = import.meta.glob<Release>("../releases/*.ts", { eager: true, import: "default" });

/** One entry per release file in `src/releases`, keyed by the version in its file name. */
export const RELEASES: Record<string, Release> = Object.fromEntries(
  Object.entries(files).map(([path, release]) => [path.slice(path.lastIndexOf("/") + 1, -".ts".length), release]),
);
