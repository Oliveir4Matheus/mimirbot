import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { Workflow } from "../../shared/skill-burger/format.ts";
import { createExecutors, writeInside } from "./executors.ts";
import { runWorkflow, type ExecResult, type StepExecutors } from "./runner.ts";

const cleanup: string[] = [];
afterEach(() => { for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true }); });

const workflow: Workflow = {
  version: 1,
  summary: "Copy the report",
  args: { who: { default: "priya" }, note: { default: "hello" } },
  steps: [
    { id: "s1", kind: "shell", label: "Run mkdir", run: "mkdir -p out" },
    { id: "s2", kind: "file", label: "Write who.txt", path: "out/who.txt", content: { $arg: "who" } },
    { id: "s3", kind: "file", label: "Write last.txt", path: "out/last.txt", content: { $step: "s2" } },
  ],
};
const output = (value: unknown): ExecResult => ({ ok: true, output: value });

function fake(exec: Partial<StepExecutors> = {}): { exec: StepExecutors; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    exec: {
      shell: async (input) => { calls.push(`shell:${input.command}`); return output(input.env); },
      file: async (input) => { calls.push(`file:${input.path}`); return output(input.content); },
      ...exec,
    },
  };
}

describe("runWorkflow", () => {
  it("runs the steps in order, filling args and earlier outputs", async () => {
    const { exec, calls } = fake();
    const result = await runWorkflow({ workflow, args: { who: "ada" } }, { exec });
    expect(result.ok).toBe(true);
    expect(result.steps.map((step) => step.state)).toEqual(["done", "done", "done"]);
    expect(calls).toEqual(["shell:mkdir -p out", "file:out/who.txt", "file:out/last.txt"]);
    expect(result.steps[1]?.output).toBe("ada");
    expect(result.steps[2]?.output).toBe("ada");
    expect(result.output).toBe("ada");
  });

  it("uses the saved defaults when the caller supplies none", async () => {
    const { exec } = fake();
    const result = await runWorkflow({ workflow }, { exec });
    expect(result.steps[1]?.output).toBe("priya");
  });

  it("skips a step whose when does not hold, and keeps going", async () => {
    const { exec, calls } = fake();
    const gated: Workflow = { ...workflow, steps: [{ ...workflow.steps[0]!, when: { $step: "s0", op: "exists" } }, workflow.steps[1]!] };
    const result = await runWorkflow({ workflow: gated }, { exec });
    expect(result.steps.map((step) => step.state)).toEqual(["skipped", "done"]);
    expect(calls).toEqual(["file:out/who.txt"]);
  });

  it("stops at the first failure and never runs what follows", async () => {
    const { exec } = fake({ shell: async () => ({ ok: false, error: "the command failed" }) });
    const result = await runWorkflow({ workflow }, { exec });
    expect(result.ok).toBe(false);
    expect(result.steps).toEqual([{ id: "s1", label: "Run mkdir", state: "failed", error: "the command failed" }]);
    expect(result.error).toMatchObject({ type: "step_failed", step: "s1" });
  });

  it("gives a clear failure for a step kind this version doesn't run", async () => {
    const { exec, calls } = fake();
    const unsupported = { ...workflow, steps: [{ id: "s1", kind: "app", label: "Send the email", app: "gmail" }] } as unknown as Workflow;
    const result = await runWorkflow({ workflow: unsupported }, { exec });
    expect(result.ok).toBe(false);
    expect(result.steps[0]).toMatchObject({ state: "failed", error: "this step's kind can't run here" });
    expect(calls).toEqual([]);
  });
});

describe("step executors", () => {
  it("writes files only inside the conversation's folder", () => {
    const root = mkdtempSync(join(tmpdir(), "omb-burger-write-"));
    cleanup.push(root);
    expect(writeInside(root, "notes/today.txt", "hi")).toEqual({ ok: true, output: "notes/today.txt" });
    expect(readFileSync(join(root, "notes/today.txt"), "utf8")).toBe("hi");
    for (const path of ["../escape.txt", "/etc/passwd", "."]) {
      expect(writeInside(root, path, "no"), path).toMatchObject({ ok: false });
    }
  });

  it("runs a command as the bot in the conversation's folder, reading args from OMB_ARG_*", async () => {
    const root = mkdtempSync(join(tmpdir(), "omb-burger-shell-"));
    cleanup.push(root);
    const script: Workflow = {
      version: 1,
      summary: "Write the name",
      args: { who: { default: "priya" } },
      steps: [{ id: "s1", kind: "shell", label: "Run printf", run: 'printf "%s" "$OMB_ARG_WHO" > who.txt' }],
    };
    const result = await runWorkflow({ workflow: script }, { exec: createExecutors({ botId: "bot-1", cwd: root }) });
    expect(result).toMatchObject({ ok: true, steps: [{ state: "done" }] });
    expect(readFileSync(join(root, "who.txt"), "utf8")).toBe("priya");
  });
});
