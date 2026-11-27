// The client side of saved Skill Burgers: save a run, list saved ones, read one before a run, remove it, and run it in a
// conversation. Every list on screen listens for one window event, so a save in the chat shows in the bot panel at once.
import { useCallback, useEffect, useState } from "react";

import { api } from "@/state/api";
import type { Workflow } from "../../shared/skill-burger/format";
import type { SavedWorkflow } from "../../shared/skill-burger/saved";

export type { SavedWorkflow };

const CHANGED = "omb:skill-burgers-changed";

function changed(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGED));
}

export async function saveBurger(input: { botId: string; threadId: string; summary?: string; name?: string }): Promise<SavedWorkflow> {
  const { skill } = await api<{ skill: SavedWorkflow }>("/api/skill-burgers", { method: "POST", body: JSON.stringify(input) });
  changed();
  return skill;
}

/** Undo or remove: takes away the copy with this hash; one that changed since is refused. */
export async function removeBurger(skill: Pick<SavedWorkflow, "name" | "sha256">): Promise<void> {
  await api(`/api/skill-burgers/${encodeURIComponent(skill.name)}?sha256=${encodeURIComponent(skill.sha256)}`, { method: "DELETE" });
  changed();
}

export function useSavedBurgers(): { skills: SavedWorkflow[] | null; error: boolean; refresh: () => void } {
  const [skills, setSkills] = useState<SavedWorkflow[] | null>(null);
  const [error, setError] = useState(false);
  const refresh = useCallback(() => {
    api<{ skills: SavedWorkflow[] }>("/api/skill-burgers")
      .then((result) => { setSkills(result.skills); setError(false); })
      .catch(() => setError(true));
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener(CHANGED, refresh);
    return () => window.removeEventListener(CHANGED, refresh);
  }, [refresh]);
  return { skills, error, refresh };
}

/** A saved burger's exact steps, read before its Run dialog fills in the defaults. */
export async function readBurger(name: string): Promise<{ skill: SavedWorkflow; workflow: Workflow } | null> {
  try {
    return await api<{ skill: SavedWorkflow; workflow: Workflow }>(`/api/skill-burgers/${encodeURIComponent(name)}`);
  } catch {
    return null;
  }
}

/** Puts a removed burger back under its name in the library. */
export async function restoreBurger(skill: Pick<SavedWorkflow, "name">, workflow: unknown): Promise<SavedWorkflow> {
  const { skill: restored } = await api<{ skill: SavedWorkflow }>("/api/skill-burgers", {
    method: "POST", body: JSON.stringify({ name: skill.name, workflow }),
  });
  changed();
  return restored;
}

export interface BurgerRunStep { id: string; label: string; state: "done" | "failed" | "skipped"; output?: unknown; error?: string }
export interface BurgerRunResult { ok: boolean; steps: BurgerRunStep[]; output?: unknown; error?: { type: string; message: string; step?: string } }

/** Runs a saved burger's shell and file steps in a conversation's folder, without the AI. */
export async function runBurger(name: string, input: { botId: string; threadId: string; args: Record<string, unknown> }): Promise<BurgerRunResult> {
  return api<BurgerRunResult>(`/api/skill-burgers/${encodeURIComponent(name)}/run`, { method: "POST", body: JSON.stringify(input) });
}

/** Runs saved in this window, by run: a card that comes back shows the save it made. */
const savedRuns = new Map<string, SavedWorkflow>();
export const savedRun = (run: string) => savedRuns.get(run);
export function rememberSavedRun(run: string, skill: SavedWorkflow | null): void {
  if (skill) savedRuns.set(run, skill);
  else savedRuns.delete(run);
}
