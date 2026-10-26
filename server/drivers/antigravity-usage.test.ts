import { chmodSync, copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AntigravityAcpClient, prepareAntigravityProfile } from "./antigravity-acp.ts";
import { clearAntigravityUsageCache, createAntigravityUsageReader, readAntigravityUsageAnswer } from "./antigravity-usage.ts";
import type { AntigravityRuntime } from "./antigravity-runtime.ts";

const FAKE_ACP = join(dirname(fileURLToPath(import.meta.url)), "..", "testing", "fake-acp-cli.ts");
const ANSWER = "### Quota Limits\n- **Gemini Models**\n  - **Weekly Limit Remaining:** 68% remaining (resets Oct 27, 2026, 21:12 UTC)";
const scratch: string[] = [];

function runtimeAt(version: string | null): AntigravityRuntime {
  const directory = mkdtempSync(join(tmpdir(), "omb-antigravity-usage-"));
  scratch.push(directory);
  const executablePath = join(directory, "fake-antigravity.ts");
  const harnessPath = join(directory, "localharness_external");
  copyFileSync(FAKE_ACP, executablePath);
  writeFileSync(harnessPath, "");
  chmodSync(executablePath, 0o755);
  return { executablePath, harnessPath, source: "managed", version };
}

async function profileFor(runtime: AntigravityRuntime) {
  const profileDirectory = mkdtempSync(join(tmpdir(), "omb-antigravity-usage-profile-"));
  scratch.push(profileDirectory);
  return prepareAntigravityProfile({ instanceId: "usage-test", runtime, profileDirectory });
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  while (scratch.length) await rm(scratch.pop()!, { recursive: true, force: true });
});

describe.skipIf(process.platform === "win32")("Antigravity usage read", () => {
  it("returns the text the runtime answers to /usage, and sends the command in its own session", async () => {
    vi.stubEnv("FAKE_ACP_AUTH_METHOD", "oauth-personal");
    vi.stubEnv("FAKE_ACP_TEXT_REPLY", ANSWER);
    const runtime = runtimeAt("1.4.3");
    const profile = await profileFor(runtime);
    const requests = vi.spyOn(AntigravityAcpClient.prototype, "request");
    expect(await readAntigravityUsageAnswer({ runtime, profile, timeoutMs: 30_000 })).toBe(ANSWER);
    const prompt = requests.mock.calls.find(([method]) => method === "session/prompt");
    expect(prompt?.[1]).toMatchObject({ prompt: [{ type: "text", text: "/usage" }] });
  }, 40_000);

  it("keeps one session for every later read instead of leaving a new conversation each time", async () => {
    vi.stubEnv("FAKE_ACP_AUTH_METHOD", "oauth-personal");
    vi.stubEnv("FAKE_ACP_TEXT_REPLY", ANSWER);
    const runtime = runtimeAt("1.4.3");
    const profile = await profileFor(runtime);
    const requests = vi.spyOn(AntigravityAcpClient.prototype, "request");
    await readAntigravityUsageAnswer({ runtime, profile, timeoutMs: 30_000 });
    const record = join(profile.directory, "usage-session.json");
    expect(existsSync(record)).toBe(true);
    const saved = readFileSync(record, "utf8");
    requests.mockClear();
    await readAntigravityUsageAnswer({ runtime, profile, timeoutMs: 30_000 });
    const methods = requests.mock.calls.map(([method]) => method);
    expect(methods).toContain("session/resume");
    expect(methods).not.toContain("session/new");
    expect(readFileSync(record, "utf8")).toBe(saved);
  }, 60_000);

  it("never sends /usage to a runtime older than 1.4.1, which would run it as a model turn", async () => {
    vi.stubEnv("FAKE_ACP_AUTH_METHOD", "oauth-personal");
    vi.stubEnv("FAKE_ACP_TEXT_REPLY", ANSWER);
    const runtime = runtimeAt("1.1.1");
    const profile = await profileFor(runtime);
    const requests = vi.spyOn(AntigravityAcpClient.prototype, "request");
    expect(await readAntigravityUsageAnswer({ runtime, profile, timeoutMs: 30_000 })).toBeNull();
    expect(requests).not.toHaveBeenCalled();
  }, 40_000);
});

describe("the cached Antigravity usage reader", () => {
  const account = { id: "usage-cache", name: "Antigravity", driver: "antigravity" as const, environment: {}, cli: "/nonexistent/agy_acp_server" };

  afterEach(() => {
    vi.useRealTimers();
    clearAntigravityUsageCache();
  });

  it("shares one reading between callers, and tries again after a minute when it failed", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-10-26T10:00:00Z") });
    const read = createAntigravityUsageReader({});
    const first = read(account);
    await expect(first).rejects.toThrow();
    expect(read(account)).toBe(first);
    vi.setSystemTime(Date.parse("2026-10-26T10:00:30Z"));
    expect(read(account)).toBe(first);
    vi.setSystemTime(Date.parse("2026-10-26T10:01:05Z"));
    const second = read(account);
    expect(second).not.toBe(first);
    await expect(second).rejects.toThrow();
  });
});
