// Saved burgers are ordinary skill folders (SKILL.md + workflow.json) in the shared skills library, tagged "workflow"
// and approved for every bot. Listing reads only copies whose SKILL.md still matches what was saved and whose
// workflow.json parses; removing acts on the exact copy the person saw, through its sha256.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isSkillName } from "../../shared/skill-md.ts";
import { WORKFLOW_FILE, WORKFLOW_MAX_BYTES, WORKFLOW_TAG, renderWorkflowSkillMd, workflowSchema, workflowSkillName, type Workflow } from "../../shared/skill-burger/format.ts";
import type { SavedWorkflow } from "../../shared/skill-burger/saved.ts";
import {
  installLibrarySkill, librarySkillDirectory, librarySkillFile, listLibrarySkills, readSkillLibraryIndex, retireLibrarySkill,
  setLibrarySkillEveryBot, skillsLibraryRoot,
} from "../skill-library.ts";

export type { SavedWorkflow };

export type Failure = { error: string; taken?: true };

function parsed(name: string, root: string): Workflow | null {
  const body = librarySkillFile(name, WORKFLOW_FILE, root);
  if (!body) return null;
  try {
    const checked = workflowSchema.safeParse(JSON.parse(body));
    return checked.success ? checked.data : null;
  } catch {
    return null;
  }
}

const listed = (name: string, workflow: Workflow, sha256: string, savedAt: string): SavedWorkflow => ({
  name, summary: workflow.summary, sha256, savedAt,
  layers: workflow.steps.map((step) => ({ id: step.id, kind: step.kind, label: step.label })),
  args: Object.keys(workflow.args),
});

/** Every saved burger whose files are as saved: the library's workflow-tagged skills, newest first. */
export function listWorkflowSkills(root: string = skillsLibraryRoot()): SavedWorkflow[] {
  const index = readSkillLibraryIndex(root);
  return listLibrarySkills(root)
    .filter((skill) => skill.enabled && skill.tags.includes(WORKFLOW_TAG))
    .flatMap((skill) => {
      const workflow = parsed(skill.name, root);
      const entry = index[skill.name];
      return workflow && entry ? [listed(skill.name, workflow, entry.sha256, entry.importedAt)] : [];
    })
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/** The saved burger `name` as its runner reads it, or why it isn't one. */
export function findWorkflowSkill(name: string, root: string = skillsLibraryRoot()): { workflow: Workflow; sha256: string } | null {
  const found = listWorkflowSkills(root).find((skill) => skill.name === name);
  const workflow = found ? parsed(name, root) : null;
  return found && workflow ? { workflow, sha256: found.sha256 } : null;
}

/** Saves a workflow to the library under `name`, or one made from its summary; the caller's name must be free. */
export function saveWorkflowSkill(input: { workflow: unknown; name?: string; root?: string }): SavedWorkflow | Failure {
  const root = input.root ?? skillsLibraryRoot();
  const checked = workflowSchema.safeParse(input.workflow);
  if (!checked.success) return { error: "This run can't be saved as a skill." };
  const body = `${JSON.stringify(checked.data, null, 2)}\n`;
  if (Buffer.byteLength(body, "utf8") > WORKFLOW_MAX_BYTES) return { error: "This run is too large to save as a skill." };
  const names = new Set(Object.keys(readSkillLibraryIndex(root)));
  const asked = input.name?.trim();
  if (asked) {
    if (!isSkillName(asked)) return { error: "Use lowercase letters, numbers and hyphens for the name." };
    if (names.has(asked)) {
      const existing = findWorkflowSkill(asked, root);
      if (existing && JSON.stringify(existing.workflow) === JSON.stringify(checked.data)) {
        return listWorkflowSkills(root).find((skill) => skill.name === asked)!;
      }
      return { error: "That name is taken. Try another.", taken: true };
    }
  } else {
    // Saving the same run again, after a reload or a dismissal, gives back the copy it made, never a second one.
    const same = listWorkflowSkills(root).find((skill) => JSON.stringify(findWorkflowSkill(skill.name, root)?.workflow) === JSON.stringify(checked.data));
    if (same) return same;
  }
  const name = asked || workflowSkillName(checked.data.summary, names);
  const installed = installLibrarySkill({
    name,
    instructions: renderWorkflowSkillMd(name, checked.data),
    source: "skill-burger",
    tags: [WORKFLOW_TAG],
    reviewState: "approved",
    files: [{ path: WORKFLOW_FILE, content: body }],
    root,
  });
  if ("error" in installed) return { error: installed.error };
  const everyBot = setLibrarySkillEveryBot(name, true, root);
  if ("error" in everyBot) return { error: everyBot.error };
  const stored = listWorkflowSkills(root).find((skill) => skill.name === name);
  if (stored) return stored;
  // The files are there but the listing refused them: take the unusable copy back out rather than leave a half skill.
  retireLibrarySkill(name, installed.sha256, root);
  return { error: "The skill was saved but can't be read back." };
}

/** Undo or remove: takes away the copy with this hash, so it never removes one someone changed since. */
export function removeWorkflowSkill(name: string, sha256: string | undefined, root: string = skillsLibraryRoot()): { removed: true } | { stale: true } | { error: string } {
  const found = findWorkflowSkill(name, root);
  if (!found || (sha256 && found.sha256 !== sha256)) return { stale: true };
  const result = retireLibrarySkill(name, found.sha256, root);
  return "retired" in result ? { removed: true } : result;
}

/** The folder a saved burger's files live in, for tests and diagnostics. */
export const workflowSkillDirectory = (name: string, root: string = skillsLibraryRoot()): string => librarySkillDirectory(root, name);

/** The saved workflow's SKILL.md and workflow.json, in words and in exact steps. */
export function readWorkflowSkill(name: string, root: string = skillsLibraryRoot()): { text: string; workflow: Workflow } | null {
  const workflow = parsed(name, root);
  if (!workflow) return null;
  try {
    return { text: readFileSync(join(librarySkillDirectory(root, name), "SKILL.md"), "utf8"), workflow };
  } catch {
    return null;
  }
}
