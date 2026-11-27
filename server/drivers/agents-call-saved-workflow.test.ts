import { describe, expect, it } from "vitest";

import { callTool, type ToolCallContext } from "./agents-call.ts";

type Reply = { ok: boolean; status: number; body: Record<string, unknown> };

function context(reply: Reply | ((path: string, init?: RequestInit) => Reply)): ToolCallContext {
  return {
    botId: "bot-a",
    threadId: "t-1",
    depth: 0,
    externalRuntime: false,
    sharedComputers: false,
    client: {
      api: async (path, init) => (typeof reply === "function" ? reply(path, init) : reply).body,
      apiResponse: async (path, init) => typeof reply === "function" ? reply(path, init) : reply,
    },
  };
}

const ran = {
  ok: true,
  steps: [
    { id: "s1", label: "Run mkdir -p out", state: "done", output: "" },
    { id: "s2", label: "Write hello.txt", state: "done", output: "out/hello.txt" },
  ],
  output: "out/hello.txt",
};

describe("run_saved_workflow", () => {
  it("posts the saved skill's name and args to the internal runner and reports each step", async () => {
    const calls: Array<{ path: string; init?: RequestInit }> = [];
    const result = await callTool("run_saved_workflow", { name: "copy-report", args: { who: "ada" } }, context((path, init) => {
      calls.push({ path, init });
      return { ok: true, status: 200, body: ran };
    }));
    expect(calls[0]?.path).toBe("/api/internal/skill-burgers/run");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ name: "copy-report", args: { who: "ada" } });
    expect(result.isError).toBeFalsy();
    expect(result.text).toContain('Ran "copy-report" without AI (2 steps)');
    expect(result.text).toContain("✓ Run mkdir -p out");
    expect(result.text).toContain("✓ Write hello.txt");
  });

  it("reports a failed step and marks the call as an error", async () => {
    const result = await callTool("run_saved_workflow", { name: "copy-report" }, context({
      ok: true, status: 200,
      body: { ok: false, steps: [{ id: "s1", label: "Run cp", state: "failed", error: "no such file" }], error: { type: "step_failed", message: '"Run cp" failed: no such file', step: "s1" } },
    }));
    expect(result.isError).toBe(true);
    expect(result.text).toContain("stopped at a failed step");
    expect(result.text).toContain("✕ Run cp: no such file");
  });

  it("tells the model to read the skills index when the name is unknown", async () => {
    const result = await callTool("run_saved_workflow", { name: "missing" }, context({ ok: false, status: 404, body: { error: "No saved skill has that name." } }));
    expect(result.isError).toBe(true);
    expect(result.text).toContain("skills index");
  });

  it("needs a name", async () => {
    const result = await callTool("run_saved_workflow", {}, context({ ok: true, status: 200, body: ran }));
    expect(result.isError).toBe(true);
    expect(result.text).toContain("name");
  });
});
