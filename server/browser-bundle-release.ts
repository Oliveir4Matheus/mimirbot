// Reviewed vendor assets hashed on 2026-11-25: update all pins together and run each platform's packaged offline browser
// smoke test. Chromium's headless shell, not full Chrome (which includes Widevine).
import { join } from "node:path";
import {
  agentBrowserReleaseUrl,
  agentBrowserReleaseVersion,
  resolveAgentBrowserReleaseAsset,
} from "./browser-engine-release.ts";

export const CHROME_VERSION = "158.0.8127.88";
export const SUPPORTED_BROWSER_TARGETS = ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "win32-x64"] as const;
export type BrowserBundleTarget = typeof SUPPORTED_BROWSER_TARGETS[number];

const CHROME_ASSETS = {
  "darwin-arm64": { platform: "mac-arm64", bytes: 105_060_087, sha256: "69320f6869c4defbbdac8b8fa83aef65dc63975e83bbd06899b75dbea5c464b3", executableSha256: "94aa2ddc006b462298814c4f4ed86f13bd834223c28e3f3d60218773a8960ccc" },
  "darwin-x64": { platform: "mac-x64", bytes: 112_314_759, sha256: "dc1ac31965cb2ec7794aed8c66127aceea304ae15353cd56fc4b8bde44091548", executableSha256: "408f411de4c6d9757e047c1be0812c622b360620497e271fce173db07ff4cf27" },
  "linux-arm64": { platform: "linux-arm64", bytes: 129_942_265, sha256: "9f89b7ef6574e4bbf6ddda9f17f1fab5626e93d6f7d852653232d0d3554df975", executableSha256: "925d36e1339084c4166270767757f3df1f90fe70b09372511979b7aa75b4d833" },
  "linux-x64": { platform: "linux64", bytes: 132_091_593, sha256: "63401333cc587645bfaeea7f0c90958b327d249251e23954a47f30112ca23d5b", executableSha256: "ff725c1ed878243206416340acd981e9f60bb8265557f927967c782cfa480db4" },
  "win32-x64": { platform: "win64", bytes: 127_879_225, sha256: "e935ea2d4633495b5e9ab7bc66bcd982806329c0ee9ecbafc1ac9596a3b34cdb", executableSha256: "d91b470cb8433104e63b6678793d481f8385a52bf32c3f0e6a60cb583b9d6c06" },
} as const;

export function browserBundleSpec(target: string) {
  if (!Object.hasOwn(CHROME_ASSETS, target)) throw new Error(`Unsupported desktop browser target: ${target}`);
  const pinned = CHROME_ASSETS[target as BrowserBundleTarget];
  const [platform, arch] = target.split("-");
  const engine = resolveAgentBrowserReleaseAsset(platform as NodeJS.Platform, arch)!;
  const suffix = platform === "win32" ? ".exe" : "";
  const directory = `chrome-headless-shell-${pinned.platform}`;
  return {
    schemaVersion: 1,
    target,
    engine: {
      version: agentBrowserReleaseVersion(engine),
      asset: engine.asset,
      url: agentBrowserReleaseUrl(engine),
      bytes: engine.bytes,
      sha256: engine.sha256,
      executable: `agent-browser${suffix}`,
    },
    chrome: {
      version: CHROME_VERSION,
      asset: `${directory}.zip`,
      url: `https://storage.googleapis.com/chrome-for-testing-public/${CHROME_VERSION}/${pinned.platform}/${directory}.zip`,
      bytes: pinned.bytes,
      sha256: pinned.sha256,
      executableSha256: pinned.executableSha256,
      executable: `chrome/${directory}/chrome-headless-shell${suffix}`,
      license: `chrome/${directory}/LICENSE.headless_shell`,
      about: `chrome/${directory}/ABOUT`,
    },
  };
}

export function browserBundlePaths(bundleDirectory: string, target: string) {
  const spec = browserBundleSpec(target);
  return {
    directory: bundleDirectory,
    manifest: join(bundleDirectory, "manifest.json"),
    engine: join(bundleDirectory, spec.engine.executable),
    chrome: join(bundleDirectory, spec.chrome.executable),
    licenses: join(bundleDirectory, "licenses"),
  };
}
