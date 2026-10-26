// The Gemini plan quota, asked of the official Antigravity runtime: from CLI 1.4.1 it answers a prompt that starts with
// `/usage` itself, with no model turn, as one Markdown message. Google's quota API refuses a client that is not the runtime.
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeFileAtomic } from "../atomic.ts";
import type { PlanAccount } from "../plan-usage.ts";
import { augmentedPath } from "../env-path.ts";
import { AntigravityAcpClient, prepareAntigravityProfile, type AntigravityProfile } from "./antigravity-acp.ts";
import { resolveAntigravityRuntime, type AntigravityRuntime } from "./antigravity-runtime.ts";

const USAGE_PROMPT = "/usage";
const USAGE_SESSION_FILE = "usage-session.json";
const MIN_CLI_VERSION = [1, 4, 1];
const READ_TIMEOUT_MS = 45_000;
const VERSION_TIMEOUT_MS = 10_000;
const CACHE_MS = 10 * 60_000;

export type AntigravityUsageReader = (account: PlanAccount) => Promise<string | null>;

function versionAtLeast(text: string, minimum: readonly number[]): boolean {
  const found = /(\d+)\.(\d+)\.(\d+)/.exec(text);
  if (!found) return false;
  const parts = [Number(found[1]), Number(found[2]), Number(found[3])];
  for (const [index, required] of minimum.entries()) {
    if (parts[index]! !== required) return parts[index]! > required;
  }
  return true;
}

/** A managed runtime has the version this app pinned; any other prints its own on `--version`. */
function answersUsageCommand(runtime: AntigravityRuntime, profile: AntigravityProfile): Promise<boolean> {
  if (runtime.version) return Promise.resolve(versionAtLeast(runtime.version, MIN_CLI_VERSION));
  return new Promise((resolve) => {
    execFile(runtime.executablePath, ["--version"], { env: profile.environment, timeout: VERSION_TIMEOUT_MS }, (error, stdout) => {
      resolve(!error && versionAtLeast(String(stdout), MIN_CLI_VERSION));
    });
  });
}

/** One session serves every read: each new Antigravity session leaves a conversation database on disk. */
async function openUsageSession(client: AntigravityAcpClient, profile: AntigravityProfile, timeoutMs: () => number): Promise<string> {
  const record = join(profile.directory, USAGE_SESSION_FILE);
  const request = { cwd: profile.directory, mcpServers: [] };
  let saved: unknown;
  try {
    saved = (JSON.parse(await readFile(record, "utf8")) as { sessionId?: unknown }).sessionId;
  } catch {
    saved = undefined;
  }
  if (typeof saved === "string" && saved) {
    try {
      await client.request("session/resume", { sessionId: saved, ...request }, timeoutMs());
      return saved;
    } catch {
      // The session is gone: fall through to a new one.
    }
  }
  const created = await client.request("session/new", request, timeoutMs());
  if (typeof created?.sessionId !== "string" || !created.sessionId) throw new Error("Antigravity did not open a session.");
  writeFileAtomic(record, `${JSON.stringify({ sessionId: created.sessionId })}\n`, { mode: 0o600 });
  return created.sessionId;
}

export async function readAntigravityUsageAnswer(input: {
  runtime: AntigravityRuntime;
  profile: AntigravityProfile;
  timeoutMs?: number;
}): Promise<string | null> {
  const { runtime, profile } = input;
  if (!(await answersUsageCommand(runtime, profile))) return null;
  const deadline = Date.now() + (input.timeoutMs ?? READ_TIMEOUT_MS);
  const remaining = () => {
    const milliseconds = deadline - Date.now();
    if (milliseconds <= 0) throw new Error("Antigravity usage read timed out.");
    return milliseconds;
  };
  const answer: string[] = [];
  let sessionId: string | null = null;
  const client = new AntigravityAcpClient(runtime, profile, profile.directory);
  client.onNotification = (message) => {
    const params = message.params as { sessionId?: unknown; update?: { sessionUpdate?: unknown; content?: { type?: unknown; text?: unknown } } } | undefined;
    if (message.method !== "session/update" || !sessionId || params?.sessionId !== sessionId) return;
    const update = params.update;
    if (update?.sessionUpdate === "agent_message_chunk" && update.content?.type === "text" && typeof update.content.text === "string") {
      answer.push(update.content.text);
    }
  };
  try {
    await client.initialize(remaining());
    await client.request("authenticate", { methodId: "oauth-personal" }, remaining());
    sessionId = await openUsageSession(client, profile, remaining);
    answer.length = 0;
    await client.request("session/prompt", { sessionId, prompt: [{ type: "text", text: USAGE_PROMPT }] }, remaining());
    return answer.join("");
  } finally {
    client.close();
  }
}

const readings = new Map<string, { at: number; result: Promise<string | null> }>();

export function clearAntigravityUsageCache(): void {
  readings.clear();
}

/** A reading opens the runtime, so it is kept for ten minutes, failures included, and shared by concurrent callers. */
export function createAntigravityUsageReader(env: NodeJS.ProcessEnv = process.env): AntigravityUsageReader {
  return (account) => {
    const kept = readings.get(account.id);
    if (kept && Date.now() - kept.at < CACHE_MS) return kept.result;
    const environment = { ...env, ...account.environment, PATH: augmentedPath() };
    const result = (async () => {
      const runtime = await resolveAntigravityRuntime(account.cli, environment);
      const profile = await prepareAntigravityProfile({ instanceId: account.id, runtime, baseEnv: environment });
      return readAntigravityUsageAnswer({ runtime, profile });
    })();
    readings.set(account.id, { at: Date.now(), result });
    return result;
  };
}
