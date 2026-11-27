import { describe, expect, it } from "vitest";

import { askOf, burgerLayers, layersOf, replayableLayers, type RunMessage } from "./layers.ts";

const activity = (id: string, name: string, input: Record<string, unknown>, extra: Partial<RunMessage["tool"]> = {}): RunMessage => ({
  id, role: "bot", kind: "activity", tool: { name, input: JSON.stringify(input), ok: true, ...extra },
});
const ask = (id: string, text: string): RunMessage => ({ id, role: "user", kind: "text", text });
const answer = (id: string, text: string): RunMessage => ({ id, role: "bot", kind: "text", text });

describe("layersOf", () => {
  it("counts a command that changes something and skips a read", () => {
    expect(layersOf(activity("a", "Bash", { command: "ls -la" }))).toEqual([]);
    expect(layersOf(activity("b", "mcp__agents__vm_exec", { command: "git status" }))).toEqual([]);
    expect(layersOf(activity("c", "Bash", { command: "git push origin main" }))).toEqual([
      expect.objectContaining({ kind: "shell", words: "git push origin main", replay: "exact", status: "done" }),
    ]);
  });

  it("reads a file write exactly and an edit as a step this version can't repeat", () => {
    const write = layersOf(activity("w", "Write", { file_path: "notes/today.md", content: "hello" }));
    expect(write).toEqual([expect.objectContaining({ kind: "file", words: "today.md", replay: "exact", args: { path: "notes/today.md", content: "hello" } })]);
    expect(layersOf(activity("e", "Edit", { file_path: "notes/today.md", old_string: "a", new_string: "b" }))).toEqual([
      expect.objectContaining({ kind: "file", words: "today.md", replay: "no", args: { path: "notes/today.md" } }),
    ]);
  });

  it("keeps a mutating app call and drops a read", () => {
    expect(layersOf(activity("s", "mcp__composio__GMAIL_SEND_EMAIL", { to: "ada@example.com" }))).toEqual([
      expect.objectContaining({ kind: "app", app: "gmail", words: "send email", replay: "no" }),
    ]);
    expect(layersOf(activity("r", "mcp__composio__GMAIL_FETCH_EMAILS", { query: "is:unread" }))).toEqual([]);
    expect(layersOf(activity("p", "gmail.search_emails", { query: "invoice" }))).toEqual([]);
    expect(layersOf(activity("q", "gmail.send_email", { to: "ada@example.com" }))).toEqual([
      expect.objectContaining({ kind: "app", app: "gmail", words: "send email" }),
    ]);
  });

  it("keeps a browser page or a desktop action as a step this version can't repeat", () => {
    expect(layersOf(activity("b", "browser_navigate", { url: "https://example.com/inbox" }))).toEqual([
      expect.objectContaining({ kind: "browser", words: "example.com", replay: "no" }),
    ]);
    expect(layersOf(activity("c", "mcp__computer__click", { x: 10, y: 20 }))).toEqual([
      expect.objectContaining({ kind: "computer", replay: "no" }),
    ]);
    expect(layersOf(activity("d", "browser_snapshot", {}))).toEqual([]);
  });

  it("treats a command's summary without its input as unrepeatable, never guessing the text", () => {
    const [layer] = layersOf({ id: "s", role: "bot", kind: "activity", tool: { name: "Bash", ok: true, summary: "git push" } });
    expect(layer).toMatchObject({ kind: "shell", replay: "no", args: { command: "git push" } });
  });

  it("marks a clipped input as unrepeatable", () => {
    const [layer] = layersOf({ id: "c", role: "bot", kind: "activity", tool: { name: "Write", ok: true, input: JSON.stringify({ file_path: "a.txt", content: "[large content omitted]" }) } });
    expect(layer).toMatchObject({ kind: "file", replay: "no" });
  });
});

describe("burgerLayers", () => {
  it("reads only the run since the person's last ask and folds a retried failure away", () => {
    const messages: RunMessage[] = [
      ask("u1", "ship it"),
      activity("a1", "Bash", { command: "git push" }, { ok: false }),
      activity("a2", "Bash", { command: "git push --force" }),
      activity("a3", "Bash", { command: "touch sent.txt" }),
      answer("b1", "done"),
    ];
    expect(burgerLayers(messages).map((layer) => layer.id)).toEqual(["a2", "a3"]);
    expect(askOf(messages)).toBe("ship it");
    expect(burgerLayers([...messages, ask("u2", "now list"), activity("a4", "Bash", { command: "ls" })])).toEqual([]);
  });

  it("replayableLayers keeps only finished exact shell and file steps", () => {
    expect(replayableLayers([
      { id: "1", messageId: "a", kind: "shell", tool: "shell", words: "x", status: "done", read: false, replay: "exact", args: { command: "x" } },
      { id: "2", messageId: "b", kind: "file", tool: "Edit", words: "y", status: "done", read: false, replay: "no", args: { path: "y" } },
      { id: "3", messageId: "c", kind: "shell", tool: "shell", words: "z", status: "running", read: false, replay: "exact", args: { command: "z" } },
      { id: "4", messageId: "d", kind: "app", tool: "GMAIL_SEND_EMAIL", words: "send", status: "done", read: false, replay: "no" },
    ]).map((layer) => layer.id)).toEqual(["1"]);
  });
});
