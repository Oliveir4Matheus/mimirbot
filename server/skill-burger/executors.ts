// Where a saved Skill Burger's steps really run. Security invariant: a shell step goes through the same bot box a bot's
// own command goes through (spawnCli as "bot"), starting in the conversation's folder; a file is written only inside
// that folder, after resolving the folder itself so a symlinked parent cannot escape it.
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve as resolvePath } from "node:path";

import { spawnCli } from "../procs.ts";
import type { ExecResult, StepExecutors } from "./runner.ts";

const tooLarge = (maxBytes: number): ExecResult => ({ ok: false, error: `the output went over ${Math.round(maxBytes / 1024)} KB`, tooLarge: true });

/** The server's PATH with the system's own folders after it: a server started with a short PATH still finds sleep or cp. */
function commandPath(): string {
  const own = process.env.PATH ?? "";
  if (process.platform === "win32") return own;
  const parts = own.split(":").filter(Boolean);
  for (const dir of ["/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"]) if (!parts.includes(dir)) parts.push(dir);
  return parts.join(":");
}

function defaultShell(): { command: string; args: (script: string) => string[] } {
  return process.platform === "win32"
    ? { command: process.env.ComSpec || "cmd.exe", args: (script) => ["/d", "/s", "/c", script] }
    : { command: "/bin/sh", args: (script) => ["-c", script] };
}

/** Runs `script` as the bot, in its box where the box is on, and collects up to `maxBytes` of each stream. */
function runInBox(input: { botId: string; cwd: string; command: string; cwdOfStep?: string; env: Record<string, string>; stdin?: string; signal: AbortSignal; maxBytes: number }): Promise<ExecResult> {
  const shell = defaultShell();
  return new Promise((done) => {
    let child: ReturnType<typeof spawnCli>;
    try {
      child = spawnCli(shell.command, shell.args(input.command), {
        cwd: input.cwdOfStep && isAbsolute(input.cwdOfStep) ? input.cwdOfStep : input.cwd,
        env: { PATH: commandPath(), HOME: process.env.HOME, LANG: process.env.LANG, ...input.env },
        stdio: ["pipe", "pipe", "pipe"],
        box: { botId: input.botId },
      }, "bot");
    } catch (error) {
      done({ ok: false, error: error instanceof Error ? error.message : String(error) });
      return;
    }
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let size = 0;
    let over = false;
    const take = (into: Buffer[]) => (chunk: Buffer) => {
      size += chunk.length;
      if (size > input.maxBytes) {
        if (!over) { over = true; child.kill("SIGKILL"); }
        return;
      }
      into.push(chunk);
    };
    child.stdout.on("data", take(out));
    child.stderr.on("data", take(err));
    const stop = () => child.kill("SIGKILL");
    input.signal.addEventListener("abort", stop, { once: true });
    child.on("error", (error) => done({ ok: false, error: error.message }));
    child.on("close", (code) => {
      input.signal.removeEventListener("abort", stop);
      if (over) return done(tooLarge(input.maxBytes));
      const stdout = Buffer.concat(out).toString("utf8");
      const stderr = Buffer.concat(err).toString("utf8");
      done(code === 0 ? { ok: true, output: stdout } : { ok: false, error: (stderr.trim() || stdout.trim() || `exit code ${code}`).slice(-2_000) });
    });
    child.stdin.end(input.stdin ?? "");
  });
}

const OUTSIDE = "a saved step writes files only inside this conversation's folder";

/** Writes one file under `root`, refusing any path that resolves outside it. */
export function writeInside(root: string, path: string, content: string): ExecResult {
  let base: string;
  try {
    base = realpathSync(root);
  } catch {
    return { ok: false, error: OUTSIDE };
  }
  const target = resolvePath(base, path);
  const inside = relative(base, target);
  if (!inside || inside.startsWith("..") || isAbsolute(inside)) return { ok: false, error: OUTSIDE };
  mkdirSync(dirname(target), { recursive: true });
  try {
    if (relative(base, realpathSync(dirname(target))).startsWith("..")) return { ok: false, error: OUTSIDE };
  } catch {
    return { ok: false, error: OUTSIDE };
  }
  writeFileSync(target, content);
  return { ok: true, output: inside };
}

export function createExecutors(input: { botId: string; cwd: string }): StepExecutors {
  return {
    shell: (step) => runInBox({
      botId: input.botId,
      cwd: input.cwd,
      command: step.command,
      ...(step.cwd ? { cwdOfStep: step.cwd } : {}),
      env: step.env,
      ...(step.stdin !== undefined ? { stdin: step.stdin } : {}),
      signal: step.signal,
      maxBytes: step.maxBytes,
    }),
    async file(step) {
      return writeInside(input.cwd, step.path, step.content);
    },
  };
}
