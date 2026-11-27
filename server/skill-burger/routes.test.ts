import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { json, readBody } from "../harness/http.ts";
import type { RequestAuth } from "../request-auth.ts";
import { PASS, dispatchRoutes } from "../routes/table.ts";
import { createSkillBurgerInternalRoutes, createSkillBurgerRoutes, SKILL_BURGER_RUN_INTERNAL } from "./routes.ts";
import type { RunMessage } from "../../shared/skill-burger/layers.ts";

const cleanup: Array<() => Promise<unknown> | void> = [];
afterEach(async () => { for (const step of cleanup.splice(0)) await step(); });

const ask = (text: string): RunMessage => ({ id: "u1", role: "user", kind: "text", text });
const tool = (id: string, name: string, input: Record<string, unknown>, ok = true): RunMessage => ({ id, role: "bot", kind: "activity", tool: { name, input: JSON.stringify(input), ok } });

async function serve(messages: RunMessage[]) {
  const dir = mkdtempSync(join(tmpdir(), "omb-burger-routes-"));
  const root = join(dir, "skills-library");
  const folders = new Map<string, string>();
  const deps = {
    messages: () => messages,
    owns: (botId: string, threadId: string) => botId === "bot-1" && threadId === "thread-1",
    folder: (botId: string, threadId: string) => {
      const key = `${botId}:${threadId}`;
      const folder = folders.get(key) ?? join(dir, "workspaces", botId, threadId);
      folders.set(key, folder);
      mkdirSync(folder, { recursive: true });
      return folder;
    },
    root,
  };
  const routes = [createSkillBurgerRoutes(deps)];
  const internal = createSkillBurgerInternalRoutes(deps);
  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const auth = { kind: "loopback", scopes: ["admin"] } as unknown as RequestAuth;
    const ctx = { req, res, url, path: url.pathname, method: req.method ?? "GET", auth, json, readBody };
    if (await internal({ method: ctx.method, path: ctx.path, res, json, readBody: () => readBody(req), botId: "bot-1", threadId: "thread-1" }) !== PASS) return;
    if (!await dispatchRoutes(routes, ctx)) json(res, 404, { from: "inline routes" });
  });
  cleanup.push(() => new Promise((done) => server.close(done)));
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const call = async (method: string, path: string, body?: unknown) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { "content-type": "application/json", origin: base },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() as Record<string, any> };
  };
  return { call, folder: join(dir, "workspaces", "bot-1", "thread-1"), root };
}

const saveable = [
  ask("copy the report for priya"),
  tool("a1", "Bash", { command: "mkdir -p out" }),
  tool("a2", "Bash", { command: "touch out/report.txt" }),
  tool("a3", "Write", { file_path: "out/readme.txt", content: "copied" }),
];

describe("skill burger routes", () => {
  it("drafts the run from stored messages and lists it with its steps and args", async () => {
    const { call } = await serve(saveable);
    const empty = await call("GET", "/api/skill-burgers");
    expect(empty).toEqual({ status: 200, body: { skills: [] } });

    const saved = await call("POST", "/api/skill-burgers", { botId: "bot-1", threadId: "thread-1" });
    expect(saved.status).toBe(201);
    expect(saved.body.skill).toMatchObject({ summary: "copy the report for priya", args: [] });
    expect(saved.body.skill.layers).toHaveLength(3);
    expect(saved.body.skill.name).toBe("copy-the-report-for-priya");

    expect((await call("GET", "/api/skill-burgers")).body.skills).toEqual([saved.body.skill]);
    const one = await call("GET", `/api/skill-burgers/${saved.body.skill.name}`);
    expect(one.body.skill.sha256).toBe(saved.body.skill.sha256);
    expect(one.body.workflow.steps).toHaveLength(3);
    expect((await call("GET", "/api/skill-burgers/not-here")).status).toBe(404);
  });

  it("refuses a run with fewer than two repeatable steps or a step in an app, page or screen", async () => {
    const short = await serve([ask("look"), tool("a1", "Bash", { command: "ls" }), tool("a2", "Write", { file_path: "x.txt", content: "x" })]);
    expect((await short.call("POST", "/api/skill-burgers", { botId: "bot-1", threadId: "thread-1" })).status).toBe(422);

    const mixed = await serve([
      ask("email it"),
      tool("a1", "Bash", { command: "mkdir -p out" }),
      tool("a2", "Write", { file_path: "out/a.txt", content: "a" }),
      tool("a3", "mcp__composio__GMAIL_SEND_EMAIL", { to: "ada@example.com" }),
    ]);
    const refused = await mixed.call("POST", "/api/skill-burgers", { botId: "bot-1", threadId: "thread-1" });
    expect(refused.status).toBe(422);
    expect(refused.body.error).toContain("changed an app, a page or a computer screen");
  });

  it("refuses a conversation that isn't the bot's", async () => {
    const { call } = await serve(saveable);
    expect((await call("POST", "/api/skill-burgers", { botId: "bot-1", threadId: "someone-else" })).status).toBe(404);
    expect((await call("POST", "/api/skill-burgers", { botId: "bot-2", threadId: "thread-1" })).status).toBe(404);
  });

  it("runs a saved burger's shell and file steps in the conversation's folder and stops on a failure", async () => {
    const { call, folder } = await serve([
      ask("write who into the name file"),
      tool("a1", "Bash", { command: "mkdir who" }),
      tool("a2", "Write", { file_path: "out/note.txt", content: "{{who}}" }),
    ]);
    const saved = await call("POST", "/api/skill-burgers", { botId: "bot-1", threadId: "thread-1", name: "write-who" });
    expect(saved.status).toBe(201);
    expect(saved.body.skill.args).toEqual(["value"]);

    const ran = await call("POST", "/api/skill-burgers/write-who/run", { botId: "bot-1", threadId: "thread-1", args: { value: "ada" } });
    expect(ran.body).toMatchObject({ ok: true, steps: [{ state: "done" }, { state: "done" }] });
    expect(existsSync(join(folder, "ada"))).toBe(true);

    const failing = await serve([ask("break"), tool("a1", "Bash", { command: "mkdir -p out" }), tool("a2", "Bash", { command: "cp missing.txt out/copy.txt" })]);
    await failing.call("POST", "/api/skill-burgers", { botId: "bot-1", threadId: "thread-1" });
    const stopped = await failing.call("POST", "/api/skill-burgers/break/run", { botId: "bot-1", threadId: "thread-1" });
    expect(stopped.body.ok).toBe(false);
    expect((stopped.body.steps as Array<{ state: string }>).map((step) => step.state)).toEqual(["done", "failed"]);
  });

  it("runs the same burger from the bot's internal route", async () => {
    const { call } = await serve(saveable);
    await call("POST", "/api/skill-burgers", { botId: "bot-1", threadId: "thread-1", name: "copy-it" });
    const ran = await call("POST", SKILL_BURGER_RUN_INTERNAL, { name: "copy-it" });
    expect(ran.body).toMatchObject({ ok: true });
    expect((await call("POST", SKILL_BURGER_RUN_INTERNAL, { name: "missing" })).status).toBe(404);
  });

  it("removes only the copy the list showed, and puts it back through the same save", async () => {
    const { call } = await serve(saveable);
    const saved = await call("POST", "/api/skill-burgers", { botId: "bot-1", threadId: "thread-1", name: "copy-it" });
    const before = await call("GET", "/api/skill-burgers/copy-it");
    expect((await call("DELETE", `/api/skill-burgers/copy-it?sha256=${"0".repeat(64)}`)).status).toBe(409);
    expect((await call("DELETE", `/api/skill-burgers/copy-it?sha256=${saved.body.skill.sha256}`)).status).toBe(200);
    expect((await call("GET", "/api/skill-burgers")).body.skills).toEqual([]);
    expect((await call("GET", "/api/skill-burgers/copy-it")).status).toBe(404);
    const restored = await call("POST", "/api/skill-burgers", { name: "copy-it", workflow: before.body.workflow });
    expect(restored.status).toBe(201);
    expect(restored.body.skill.name).toBe("copy-it");
    expect((await call("GET", "/api/skill-burgers")).body.skills).toHaveLength(1);
  });
});
