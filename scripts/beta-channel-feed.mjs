// electron-builder names a build's update metadata `latest.yml` (Windows), `latest-linux.yml` and
// `latest-mac.yml`. electron-updater's beta channel asks GitHub for the same files named `beta.yml`,
// `beta-linux.yml` and `beta-mac.yml`, so a beta release uploads both names from one build.
import { copyFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

export const LATEST_FEED = /^latest(-[a-z0-9]+)*\.yml$/;

export function betaFeedNames(files) {
  return files.filter((name) => LATEST_FEED.test(name)).map((name) => [name, name.replace(/^latest/, "beta")]);
}

/** Returns the beta copies written, so a caller can upload exactly them. */
export function copyBetaFeed(directory) {
  const copied = [];
  for (const [from, to] of betaFeedNames(readdirSync(directory))) {
    copyFileSync(join(directory, from), join(directory, to));
    copied.push(join(directory, to));
  }
  if (copied.length === 0) throw new Error(`no latest*.yml in ${directory}`);
  return copied;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const file of copyBetaFeed(process.argv[2] ?? "release")) console.log(`beta feed: ${file}`);
}
