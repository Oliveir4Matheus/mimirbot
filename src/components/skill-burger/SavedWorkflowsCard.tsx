import { ChevronDown, ChevronRight, CirclePlay } from "lucide-react";
import { useState } from "react";

import { t } from "@/lib/i18n";
import { readBurger, removeBurger, restoreBurger, useSavedBurgers, type SavedWorkflow } from "@/lib/skill-burger";
import { Card, NoteRow, TrashButton } from "../bot-panel/rows";
import { RunBurger } from "./RunBurger";
import { LayerIcon, MiniBurger } from "./SkillBurger";

/** Takes a burger away, keeping what it takes to put it back. */
export function useBurgerRemoval() {
  const [removed, setRemoved] = useState<{ skill: SavedWorkflow; workflow: unknown } | null>(null);
  const [problem, setProblem] = useState("");
  const remove = async (skill: SavedWorkflow) => {
    setProblem("");
    try {
      const found = await readBurger(skill.name);
      if (!found) throw new Error(t("skillBurger.run.missing"));
      await removeBurger(skill);
      setRemoved({ skill, workflow: found.workflow });
    } catch (cause) {
      setProblem(cause instanceof Error && cause.message ? cause.message : t("skillBurger.list.removeFailed"));
    }
  };
  const undo = async () => {
    if (!removed) return;
    try {
      await restoreBurger(removed.skill, removed.workflow);
      setRemoved(null);
    } catch (cause) {
      setProblem(cause instanceof Error && cause.message ? cause.message : t("skillBurger.undoFailed"));
    }
  };
  return { removed, problem, remove, undo };
}

/** The bot panel's Skill Burgers: every saved one, its steps, Run, and a removal with an Undo. */
export function SavedWorkflowsCard({ botId, threadId }: { botId: string; threadId: string }) {
  const { skills, error } = useSavedBurgers();
  const [open, setOpen] = useState<string | null>(null);
  const [running, setRunning] = useState<SavedWorkflow | null>(null);
  const { removed, problem, remove, undo } = useBurgerRemoval();

  return (
    <Card label={t("skillBurger.list.title")} anchor="skill-burgers">
      {skills === null ? (
        <NoteRow>{error ? t("skillBurger.list.loadFailed") : t("skills.loading")}</NoteRow>
      ) : skills.length === 0 && !removed ? (
        <NoteRow>{t("skillBurger.list.empty")}</NoteRow>
      ) : skills.map((skill) => {
        const expanded = open === skill.name;
        const listId = `skill-burger-${skill.name}`;
        return (
          <div key={skill.name} data-panel-row={`skill-burger:${skill.name}`}>
            <div className="flex min-h-[46px] items-start gap-3 px-3.5 py-[10px]">
              <MiniBurger label={skill.summary} />
              <div className="flex min-w-0 flex-1 flex-col">
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={listId}
                  onClick={() => setOpen(expanded ? null : skill.name)}
                  className="flex min-w-0 items-start gap-1 rounded-md text-start outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                  {expanded ? <ChevronDown size={13} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-tertiary" /> : <ChevronRight size={13} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-tertiary" />}
                  <span dir="auto" className="line-clamp-2 text-[14px] font-medium leading-[18px] text-ink">{skill.summary}</span>
                </button>
                <span className="mt-px truncate font-mono text-[11px] text-ink-tertiary">{skill.name}</span>
              </div>
              <button
                type="button"
                data-panel-action={`run-skill-burger:${skill.name}`}
                onClick={() => setRunning(skill)}
                aria-label={t("skillBurger.runName", { name: skill.summary })}
                title={t("skillBurger.run.button")}
                className="flex size-7 shrink-0 items-center justify-center rounded-lg text-ink-secondary hover:bg-ink/[0.05] hover:text-ink"
              >
                <CirclePlay size={14} aria-hidden="true" />
              </button>
              <TrashButton data-panel-action={`remove-skill-burger:${skill.name}`} label={t("skillBurger.list.remove", { name: skill.name })} onClick={() => void remove(skill)} />
            </div>
            <ol id={listId} hidden={!expanded} aria-label={t("skillBurger.layers")} className="flex flex-col gap-1 px-3.5 pb-3">
              {skill.layers.map((layer) => (
                <li key={layer.id} className="flex min-w-0 items-center gap-2 text-[13px] text-ink-secondary">
                  <LayerIcon kind={layer.kind} />
                  <span className="min-w-0 flex-1 truncate">{layer.label}</span>
                </li>
              ))}
            </ol>
          </div>
        );
      })}
      {removed && (
        <div role="status" className="flex min-h-[40px] items-center gap-2 px-3.5 text-[13px] text-ink-secondary">
          <span className="min-w-0 flex-1 truncate">{t("skillBurger.list.removed", { name: removed.skill.name })}</span>
          <button type="button" onClick={() => void undo()} className="shrink-0 rounded-md px-1.5 py-0.5 font-medium text-accent-text hover:bg-ink/[0.06]">{t("common.undo")}</button>
        </div>
      )}
      {problem && <NoteRow tone="warn">{problem}</NoteRow>}
      {running && <RunBurger skill={running} botId={botId} threadId={threadId} onClose={() => setRunning(null)} />}
    </Card>
  );
}
