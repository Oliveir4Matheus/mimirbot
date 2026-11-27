import { Check, FileText, Globe, Monitor, Plus, Sandwich, Terminal, X, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

import type { BurgerLayer } from "../../../shared/skill-burger/layers";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { rememberSavedRun, removeBurger, saveBurger, savedRun, type SavedWorkflow } from "@/lib/skill-burger";

/** One layer's icon: a plain icon for a command, a file, a page, a computer or an app. */
export function LayerIcon({ kind }: { kind: BurgerLayer["kind"] }) {
  const Icon = kind === "shell" ? Terminal : kind === "file" ? FileText : kind === "browser" ? Globe : kind === "computer" ? Monitor : Sandwich;
  return <Icon size={16} aria-hidden="true" className="shrink-0 text-ink-secondary" />;
}

const capital = (words: string) => (words ? words[0]!.toUpperCase() + words.slice(1) : words);

/** The line a layer reads as, in the person's language where the words are ours. */
export function layerLine(layer: Pick<BurgerLayer, "kind" | "words">): string {
  switch (layer.kind) {
    case "shell": return t("skillBurger.layer.run", { what: layer.words });
    case "file": return t("skillBurger.layer.write", { name: layer.words });
    case "browser": return t("skillBurger.layer.open", { site: layer.words });
    default: return capital(layer.words);
  }
}

const ICON_BUTTON =
  "flex size-7 shrink-0 items-center justify-center rounded-lg text-ink-secondary outline-none transition-colors hover:bg-ink/[0.06] hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none";

type Saving = { state: "idle" } | { state: "saving" } | { state: "saved"; skill: SavedWorkflow } | { state: "undone" } | { state: "error"; message: string };

/** The chat's finished run as a small burger: what it did, its steps, and one button to save them as a skill. */
export function SkillBurger({ run, layers, summary, canSave, botId, threadId, onDismiss }: {
  /** The run this card is for, so a save is remembered when the card comes back. */
  run: string;
  layers: BurgerLayer[];
  summary: string;
  canSave: boolean;
  botId: string;
  threadId: string;
  onDismiss: () => void;
}) {
  const [saving, setSaving] = useState<Saving>(() => { const skill = savedRun(run); return skill ? { state: "saved", skill } : { state: "idle" }; });
  useEffect(() => { rememberSavedRun(run, saving.state === "saved" ? saving.skill : null); }, [run, saving]);
  const saved = saving.state === "saved" ? saving.skill : null;

  const save = async () => {
    if (saving.state === "saving") return;
    setSaving({ state: "saving" });
    try {
      const skill = await saveBurger({ botId, threadId, summary });
      setSaving({ state: "saved", skill });
    } catch (cause) {
      setSaving({ state: "error", message: cause instanceof Error && cause.message ? cause.message : t("skillBurger.saveFailed") });
    }
  };
  const undo = async () => {
    if (!saved) return;
    try {
      await removeBurger(saved);
      setSaving({ state: "undone" });
    } catch (cause) {
      setSaving({ state: "error", message: cause instanceof Error && cause.message ? cause.message : t("skillBurger.undoFailed") });
    }
  };

  const count = layers.length === 1 ? t("skillBurger.layersOne") : t("skillBurger.layersMany", { count: layers.length });
  return (
    <section
      aria-label={t("skillBurger.aria")}
      data-skill-burger={saved ? "saved" : "done"}
      className="skill-burger pointer-events-auto flex w-[21rem] max-w-full flex-col gap-[3px] text-ink"
    >
      <div className="relative flex items-start gap-1.5 rounded-b-[8px] rounded-t-[18px] border border-hairline/40 bg-raised px-3 pb-2 pt-3 shadow-sm">
        <div className="flex min-w-0 flex-1 flex-col">
          <span dir="auto" className="min-w-0 truncate text-[13px] font-medium" title={summary}>{summary}</span>
          <span role="status" aria-live="polite" aria-atomic="true" className="truncate text-[12px] text-ink-secondary">{count}</span>
        </div>
        <button type="button" onClick={onDismiss} aria-label={t("skillBurger.dismiss")} title={t("skillBurger.dismiss")} className={ICON_BUTTON}>
          <X size={14} aria-hidden="true" />
        </button>
      </div>

      <ol aria-label={t("skillBurger.layers")} className="flex max-h-60 min-h-0 flex-col gap-[3px] overflow-y-auto">
        {layers.map((layer) => {
          const line = layerLine(layer);
          return (
            <li
              key={layer.id}
              data-burger-layer={layer.kind}
              data-status={layer.status}
              className={cn("flex min-h-9 min-w-0 items-center gap-2.5 rounded-[8px] border border-hairline/30 bg-card px-3 text-[13px] shadow-sm", layer.status === "failed" && "text-danger")}
            >
              <LayerIcon kind={layer.kind} />
              <span className="min-w-0 flex-1 truncate" title={line}>{line}</span>
              {layer.status === "failed" && <XCircle size={14} aria-label={t("skillBurger.failed")} className="ms-auto shrink-0" />}
            </li>
          );
        })}
      </ol>

      <div className="flex min-h-10 items-center rounded-b-[18px] rounded-t-[8px] border border-hairline/40 bg-raised shadow-sm">
        {saved ? (
          <div className="flex w-full items-center gap-2 px-3 text-[13px]">
            <Check size={14} aria-hidden="true" className="shrink-0 text-success" />
            <span className="min-w-0 flex-1 truncate">{t("skillBurger.saved")}</span>
            <button type="button" onClick={() => void undo()} className="shrink-0 rounded-md px-1.5 py-0.5 font-medium text-accent-text outline-none hover:bg-ink/[0.06] focus-visible:ring-2 focus-visible:ring-accent/60">
              {t("common.undo")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            data-skill-burger-save
            onClick={() => void save()}
            disabled={!canSave || saving.state === "saving"}
            title={canSave ? undefined : t("skillBurger.saveableOnly")}
            className="flex h-10 w-full items-center justify-center gap-1.5 rounded-b-[18px] rounded-t-[8px] text-[13px] font-medium text-accent-text outline-none transition-colors hover:bg-ink/[0.05] focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-default disabled:text-ink-tertiary disabled:hover:bg-transparent motion-reduce:transition-none"
          >
            {saving.state === "saving" ? t("skillBurger.saving") : <><Plus size={14} aria-hidden="true" />{t("skillBurger.add")}</>}
          </button>
        )}
      </div>
      {(saving.state === "error" || saving.state === "undone") && (
        <p role={saving.state === "error" ? "alert" : "status"} className={cn("px-3 text-[12px]", saving.state === "error" ? "text-danger" : "text-ink-secondary")}>
          {saving.state === "error" ? saving.message : t("skillBurger.undone")}
        </p>
      )}
    </section>
  );
}

/** The small mark the bot panel uses beside a saved burger. */
export function MiniBurger({ label }: { label: string }) {
  return (
    <span title={label} className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-ink/[0.05] text-ink-secondary">
      <Sandwich size={15} aria-hidden="true" />
    </span>
  );
}
