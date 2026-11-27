import { describe, expect, it } from "vitest";

import { draftWorkflow } from "./draft.ts";
import type { RunMessage } from "./layers.ts";

const ask = (text: string): RunMessage => ({ id: "u1", role: "user", kind: "text", text });
const tool = (id: string, name: string, input: Record<string, unknown>, extra: { ok?: boolean; output?: string } = {}): RunMessage => ({
  id, role: "bot", kind: "activity", tool: { name, input: JSON.stringify(input), ok: extra.ok ?? true, ...(extra.output ? { output: extra.output } : {}) },
});

describe("draftWorkflow", () => {
  it("saves a command and a file write, with the ask's words as args", () => {
    const draft = draftWorkflow([
      ask("write priya into the greeting file and make the folder"),
      tool("a1", "Bash", { command: "mkdir -p out" }),
      tool("a2", "Write", { file_path: "out/greeting.txt", content: "hello priya" }),
      tool("a3", "Bash", { command: "cp notes.txt priya" }),
    ]);
    expect("reason" in draft).toBe(false);
    if ("reason" in draft) return;
    expect(draft.workflow.steps).toHaveLength(3);
    expect(draft.workflow.steps[0]).toMatchObject({ id: "s1", kind: "shell", run: "mkdir -p out" });
    expect(draft.workflow.steps[1]).toMatchObject({ id: "s2", kind: "file", path: "out/greeting.txt", content: "hello priya" });
    expect(draft.workflow.steps[2]).toMatchObject({ kind: "shell" });
    expect((draft.workflow.steps[2] as { run: string }).run).toContain('"$OMB_ARG_VALUE"');
    expect(draft.workflow.args.value).toEqual({ default: "priya" });
    expect(draft.workflow.summary).toBe("write priya into the greeting file and make the folder");
  });

  it("pipes a value an earlier step printed into a later file", () => {
    const draft = draftWorkflow([
      ask("write the id"),
      tool("a1", "Bash", { command: "mkid" }, { output: "abc123" }),
      tool("a2", "Write", { file_path: "copy.txt", content: "abc123" }),
    ]);
    expect("reason" in draft).toBe(false);
    if ("reason" in draft) return;
    expect(draft.workflow.steps[1]).toMatchObject({ kind: "file", content: { $step: "s1" } });
  });

  it("refuses a run that changed an app or a screen", () => {
    const draft = draftWorkflow([
      ask("email the report"),
      tool("a1", "Bash", { command: "cp report.txt out/report.txt" }),
      tool("a2", "mcp__composio__GMAIL_SEND_EMAIL", { to: "ada@example.com", body: "here" }),
    ]);
    expect(draft).toEqual({ reason: expect.stringContaining("changed an app, a page or a computer screen") });
  });

  it("refuses a run with fewer than two repeatable steps", () => {
    expect(draftWorkflow([ask("look around"), tool("a1", "Bash", { command: "ls" })])).toEqual({ reason: expect.stringContaining("fewer than two") });
  });

  it("refuses a step whose recorded call carried a secret", () => {
    const draft = draftWorkflow([
      ask("deploy"),
      tool("a1", "Write", { file_path: "a.txt", content: "sk-ant-aaaaaaaaaaaaaaaaaaaaaaaa" }),
      tool("a2", "Bash", { command: "cp state.txt backup.txt" }),
    ]);
    expect(draft).toEqual({ reason: expect.stringContaining("used a secret") });
  });
});
