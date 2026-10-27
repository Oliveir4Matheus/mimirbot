import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/state/store";
import type { BotCreationDraft } from "@/lib/bot-creation-draft";
import { BOT_ROLES, roleProfilePatch } from "@/lib/bot-roles";
import { readyBot } from "@/lib/ready-bots";
import { chosenPreset, presetDraftPatch, presetGroups, presetPictureFile, presetSummaryLines, type BotPreset } from "@/lib/bot-presets";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import type { Routine } from "@/lib/routines";
import { openServerMenu } from "../DesktopWorkspaceSwitcher";
import { inputCls } from "../bot-settings/field";
import { RoutineEditor } from "../RoutinesPage";
import { Select } from "../Select";

export function SharedInTeam({ team }: { team: string }) {
  const bridge = typeof window === "undefined" ? undefined : window.ogb?.workspaces;
  return <div data-new-bot-shared className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-hairline/40 bg-raised/30 px-5 py-2.5 text-[13px] text-ink-secondary">
    <span>{t("newBot.sharedWith", { team })}</span>
    {bridge
      ? <button type="button" onClick={() => void openServerMenu(bridge).catch(() => {})} className="font-medium text-accent hover:underline">{t("newBot.justForYou")}</button>
      : <span>{t("newBot.justForYou").replace(/\s*→$/, "")}</span>}
  </div>;
}


export function StartingRole({ draft, defaultsMode }: { draft: BotCreationDraft; defaultsMode: boolean }) {
  const [presets, setPresets] = useState<BotPreset[]>([]);
  const [loads, setLoads] = useState(0);
  const [error, setError] = useState("");
  const presetPicture = useRef(false);
  useEffect(() => {
    if (defaultsMode) return;
    let cancelled = false;
    void api<{ presets: BotPreset[] }>("/api/bot-presets")
      .then(result => { if (!cancelled) setPresets(result.presets); })
      .catch(() => { if (!cancelled) setPresets([]); });
    return () => { cancelled = true; };
  }, [defaultsMode, loads]);
  const chosen = draft.preset ? presets.find(preset => preset.id === draft.preset!.id) : undefined;
  const choose = async (value: string) => {
    setError("");
    const preset = value.startsWith("preset:") ? presets.find(candidate => candidate.id === value.slice("preset:".length)) : undefined;
    if (!preset) {
      draft.choosePreset(undefined);
      const role = BOT_ROLES.find(role => role.id === value);
      draft.chooseRole(role?.id);
      const look = role && readyBot(role.id)?.look;
      if (role) draft.patch({ ...roleProfilePatch(role), ...look });
      return;
    }
    draft.patch(presetDraftPatch(preset));
    draft.choosePreset(chosenPreset(preset));
    const picture = presetPictureFile(preset);
    try {
      if (picture) {
        draft.patch({ avatarUrl: await draft.uploadAvatar(picture), avatarCrop: preset.bot.appearance!.avatar!.crop });
        presetPicture.current = true;
      } else if (presetPicture.current) {
        draft.patch({ avatarUrl: "" });
        presetPicture.current = false;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  const remove = async (preset: BotPreset) => {
    setError("");
    try {
      await api(`/api/bot-presets/${encodeURIComponent(preset.id)}`, { method: "DELETE" });
      if (draft.preset?.id === preset.id) draft.choosePreset(undefined);
      setLoads(value => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  const roles = BOT_ROLES.map(role => <option key={role.id} value={role.id}>{role.title}</option>);
  return <div>
    <label className="block text-[13px] text-ink-secondary">{t("newBot.startingRole")}
      <Select size="lg" className="mt-1.5 w-full" value={draft.preset ? `preset:${draft.preset.id}` : ""} onChange={event => void choose(event.target.value)}>
        <option value="">{t("newBot.customSettings")}</option>
        {presetGroups(presets).map(group => <optgroup key={group.label} label={group.label}>
          {group.presets.map(preset => <option key={preset.id} value={`preset:${preset.id}`}>{preset.name}</option>)}
        </optgroup>)}
        {presets.length ? <optgroup label={t("newBot.builtInRoles")}>{roles}</optgroup> : roles}
      </Select>
    </label>
    {chosen && <div className="mt-2 space-y-1 rounded-lg bg-card px-3 py-2.5 text-[12.5px] text-ink-secondary" data-new-bot-preset>
      {presetSummaryLines(chosen).map((line, index) => <p key={index} className="break-words">{line}</p>)}
      {chosen.source === "file" && <button type="button" onClick={() => void remove(chosen)}
        className="mt-1 rounded-md px-2 py-1 text-[12px] text-ink-secondary hover:bg-control hover:text-ink">{t("newBot.presetRemove")}</button>}
    </div>}
    {error && <p role="alert" className="mt-2 text-[12.5px] text-danger">{error}</p>}
  </div>;
}

export function DraftMemory({ draft }: { draft: BotCreationDraft }) {
  const [path, setPath] = useState("MEMORY.md");
  const [name, setName] = useState("");
  return <div className="space-y-3">
    <Select size="lg" className="w-full" aria-label={t("memory.fileLabel", { path })} value={path} onChange={event => setPath(event.target.value)}>
      {[...new Set(["MEMORY.md", ...Object.keys(draft.template.memory)])].map(file => <option key={file}>{file}</option>)}
    </Select>
    <textarea className={cn(inputCls, "min-h-72 font-mono")} aria-label={t("memory.contents")} value={draft.template.memory[path] ?? ""} onChange={event => draft.setMemory(path, event.target.value)} />
    <div className="flex gap-2"><input className={inputCls} aria-label={t("memory.newTopicLabel")} placeholder={t("memory.newTopicLabel")} value={name} onChange={event => setName(event.target.value)} />
      <button type="button" aria-label={t("memory.addTopic")} disabled={!/^[a-zA-Z0-9_-]+$/.test(name)} className="rounded-lg bg-control px-3 disabled:opacity-40" onClick={() => { const next = `memory/${name}.md`; if (!(next in draft.template.memory)) draft.setMemory(next, ""); setPath(next); setName(""); }}><Plus size={16} /></button>
      {path !== "MEMORY.md" && <button type="button" aria-label={t("memory.removeTopic")} className="rounded-lg bg-control px-3" onClick={() => { draft.setMemory(path, null); setPath("MEMORY.md"); }}><Trash2 size={16} /></button>}
    </div>
  </div>;
}

export function DraftRoutines({ draft }: { draft: BotCreationDraft }) {
  const [editing, setEditing] = useState<Routine | "new" | null>(null);
  return <div className="space-y-3">
    <button type="button" className="rounded-lg bg-accent px-3 py-2 text-[13px] text-white" onClick={() => setEditing("new")}>{t("computer.routines.create")}</button>
    {draft.routines.map(routine => <div key={routine.id} className="flex items-center gap-2 rounded-lg bg-card p-3">
      <button type="button" className="min-w-0 flex-1 text-left text-[13px]" onClick={() => setEditing(routine)}>{routine.name}</button>
      <label className="flex items-center gap-1.5 text-[12px] text-ink-secondary"><input type="checkbox" checked={routine.enabled} onChange={event => draft.setRoutineEnabled(routine.id, event.target.checked)} />{t("newBot.enabled")}</label>
      <button type="button" aria-label={t("newBot.removeRoutine", { name: routine.name })} onClick={() => draft.removeRoutine(routine.id)} className="rounded p-1.5 hover:bg-control"><Trash2 size={15} /></button>
    </div>)}
    {editing && <RoutineEditor routine={editing === "new" ? undefined : editing} bots={[draft.bot]} lockedBotId={draft.id} onClose={() => setEditing(null)} />}
  </div>;
}

