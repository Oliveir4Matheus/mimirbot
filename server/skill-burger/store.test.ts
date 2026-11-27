import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { readSkillLibraryIndex } from "../skill-library.ts";
import { WORKFLOW_FILE } from "../../shared/skill-burger/format.ts";
import { findWorkflowSkill, listWorkflowSkills, readWorkflowSkill, removeWorkflowSkill, saveWorkflowSkill, workflowSkillDirectory } from "./store.ts";

const cleanup: string[] = [];
afterEach(() => { for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function library(): string {
  const dir = mkdtempSync(join(tmpdir(), "omb-skill-burger-"));
  cleanup.push(dir);
  return join(dir, "skills-library");
}

const workflow = (summary = "Copy the report into the outbox") => ({
  version: 1,
  summary,
  args: { who: { default: "priya", label: "who" } },
  steps: [
    { id: "s1", kind: "shell", label: "Run cp report.txt outbox", run: 'cp report.txt "outbox/$OMB_ARG_WHO"' },
    { id: "s2", kind: "file", label: "Write index.txt", path: "outbox/index.txt", content: "sent to priya" },
  ],
});

describe("saved workflow skills", () => {
  it("writes SKILL.md and workflow.json into the library, tagged workflow, approved, for every bot", () => {
    const root = library();
    const saved = saveWorkflowSkill({ workflow: workflow(), root });
    expect("error" in saved).toBe(false);
    if ("error" in saved) return;
    expect(saved).toMatchObject({ name: "copy-the-report-into-the-outbox", summary: "Copy the report into the outbox", args: ["who"] });
    expect(saved.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(saved.layers.map((layer) => [layer.kind, layer.label])).toEqual([["shell", "Run cp report.txt outbox"], ["file", "Write index.txt"]]);
    const folder = workflowSkillDirectory(saved.name, root);
    expect(readFileSync(join(folder, "SKILL.md"), "utf8")).toContain("tags: workflow");
    expect(JSON.parse(readFileSync(join(folder, WORKFLOW_FILE), "utf8"))).toMatchObject({ summary: "Copy the report into the outbox" });
    expect(readSkillLibraryIndex(root)[saved.name]).toMatchObject({ reviewState: "approved", everyBot: true, tags: ["workflow"] });
    expect(listWorkflowSkills(root).map((skill) => skill.name)).toEqual([saved.name]);
    expect(findWorkflowSkill(saved.name, root)?.workflow.steps).toHaveLength(2);
    expect(readWorkflowSkill(saved.name, root)?.text).toContain("# Copy the report into the outbox");
  });

  it("refuses a taken name and gives back the same copy for the same steps", () => {
    const root = library();
    const first = saveWorkflowSkill({ workflow: workflow(), name: "copy-report", root });
    expect("error" in first).toBe(false);
    const other = saveWorkflowSkill({ workflow: workflow("Something else entirely"), name: "copy-report", root });
    expect(other).toEqual({ error: "That name is taken. Try another.", taken: true });
    const same = saveWorkflowSkill({ workflow: workflow(), name: "copy-report", root });
    expect(same).toEqual(first);
    // Saving the same run again without a name gives back the copy it made, never a second one.
    expect(saveWorkflowSkill({ workflow: workflow(), root })).toEqual(first);
    expect(listWorkflowSkills(root)).toHaveLength(1);
  });

  it("removes only the copy with the hash it was listed with", () => {
    const root = library();
    const saved = saveWorkflowSkill({ workflow: workflow(), root });
    if ("error" in saved) throw new Error(saved.error);
    expect(removeWorkflowSkill(saved.name, "0".repeat(64), root)).toEqual({ stale: true });
    expect(statSync(workflowSkillDirectory(saved.name, root)).isDirectory()).toBe(true);
    expect(removeWorkflowSkill(saved.name, saved.sha256, root)).toEqual({ removed: true });
    expect(listWorkflowSkills(root)).toEqual([]);
    expect(findWorkflowSkill(saved.name, root)).toBeNull();
  });

  it("refuses a workflow whose step list is not what a runner can repeat", () => {
    const root = library();
    expect(saveWorkflowSkill({ workflow: { ...workflow(), steps: [{ id: "s1", kind: "app", label: "Send", app: "gmail" }] }, root }))
      .toEqual({ error: "This run can't be saved as a skill." });
    expect(listWorkflowSkills(root)).toEqual([]);
  });
});
