import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { launchVerificationServer, type VerificationServer } from "../../scripts/control-omb.ts";

describe("skill burger through an isolated fixture", () => {
  let fixture: VerificationServer;
  let scratch: string;
  let botId: string;
  let threadId: string;
  const api = async (method: string, path: string, body?: unknown) => {
    const response = await fetch(`${fixture.info.url}${path}`, {
      method,
      headers: { "content-type": "application/json", origin: fixture.info.url },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() as any };
  };

  beforeAll(async () => {
    scratch = mkdtempSync(join(tmpdir(), "omb-burger-fixture-"));
    const calls = join(scratch, "calls.json");
    writeFileSync(calls, JSON.stringify([
      { name: "Bash", input: { command: "mkdir -p burger-demo" } },
      { name: "Write", input: { file_path: "burger-demo/hello.txt", content: "hello from the burger" } },
    ]));
    fixture = await launchVerificationServer({
      ...process.env,
      FAKE_CLAUDE_TOOL_CALLS_FILE: calls,
      FAKE_CLAUDE_REPLIES: JSON.stringify(["Made the demo folder and wrote the file."]),
    });
    const created = await api("POST", "/api/bots", { name: "Burger fixture" });
    botId = created.body.bot.id;
    threadId = created.body.bot.threadId;
  }, 120_000);

  afterAll(async () => {
    await fixture?.close();
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  });

  it("saves the finished run and repeats its steps without the AI", async () => {
    expect((await api("POST", `/api/bots/${botId}/messages`, { text: "make a hello file in a demo folder", threadId })).status).toBe(202);
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const page = await api("GET", `/api/threads/${threadId}/messages?limit=50`);
      if (page.body.messages.some((message: { role: string; kind: string; tool?: { ok?: boolean } }) => message.role === "bot" && message.kind === "activity" && message.tool?.ok === true)
        && page.body.messages.some((message: { role: string; kind: string }) => message.role === "bot" && message.kind === "text")) break;
      await new Promise((done) => setTimeout(done, 250));
    }

    const saved = await api("POST", "/api/skill-burgers", { botId, threadId });
    expect(saved.status).toBe(201);
    expect(saved.body.skill.layers).toHaveLength(2);
    const name = saved.body.skill.name as string;
    const folder = join(fixture.info.dataDir, "skills-library", "skills", name);
    expect(readFileSync(join(folder, "SKILL.md"), "utf8")).toContain("tags: workflow");
    const index = JSON.parse(readFileSync(join(fixture.info.dataDir, "skills-library", "index.json"), "utf8"));
    expect(index[name]).toMatchObject({ reviewState: "approved", everyBot: true, tags: ["workflow"] });

    const listed = await api("GET", "/api/skill-burgers");
    expect(listed.body.skills.map((skill: { name: string }) => skill.name)).toEqual([name]);

    const ran = await api("POST", `/api/skill-burgers/${name}/run`, { botId, threadId });
    expect(ran.body).toMatchObject({ ok: true, steps: [{ state: "done" }, { state: "done" }] });
    expect(readFileSync(join(fixture.info.dataDir, "task-workspaces", botId, threadId, "burger-demo", "hello.txt"), "utf8")).toBe("hello from the burger");

    expect((await api("DELETE", `/api/skill-burgers/${name}?sha256=${saved.body.skill.sha256}`)).status).toBe(200);
    expect((await api("GET", "/api/skill-burgers")).body.skills).toEqual([]);
  }, 60_000);
});
