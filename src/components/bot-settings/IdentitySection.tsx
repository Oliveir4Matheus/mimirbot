import { useState, type ReactNode } from "react";
import { DefaultBotHideRow } from "../DefaultBotControls";
import { BookOpen, Shuffle } from "lucide-react";

import { useStore, type Bot } from "@/state/store";
import type { MausMotion, MausState } from "@/lib/mascot";
import { cn } from "@/lib/cn";
import { BOT_PROFILE_LIMITS } from "../../../shared/bot-profile";
import { BotProfileAvatarCard } from "../BotProfileAvatarCard";
import { BotInstructionsDialog } from "../BotInstructionsDialog";
import { Field, inputCls } from "./field";
import type { BotPatch } from "./useBotSettingsDerived";
import { useBotEditor } from "./BotEditorContext";
import { PackageProvenance } from "./PackageProvenance";
import { ProposalStatus } from "./ProposalStatus";
import { randomBotName } from "@/lib/random-bot-name";
import { t } from "@/lib/i18n";

export type IdentityPart = "avatar" | "provenance" | "name" | "title" | "blurb";

export function IdentitySection({
  bot,
  patch,
  activeState,
  mascotMotion,
  namePlaceholder,
  parts,
  compact = false,
}: {
  bot: Bot;
  patch: (patch: BotPatch) => void;
  activeState: MausState;
  mascotMotion: { kind: Exclude<MausMotion, "none">; nonce: number } | null;
  namePlaceholder?: string;
  parts?: readonly IdentityPart[];
  compact?: boolean;
}) {
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const { draft } = useBotEditor();
  const { state } = useStore();
  const shows = (part: IdentityPart) => !parts || parts.includes(part);

  return (
    <div className={compact && !shows("avatar") && shows("name") ? "divide-y divide-hairline/40" : "flex flex-col gap-4"}>
      {shows("avatar") && <BotProfileAvatarCard bot={bot} activeState={activeState} mascotMotion={mascotMotion} onPatch={patch} compact={compact} />}
      {shows("provenance") && <PackageProvenance bot={bot} />}

      {shows("name") && (compact ? <CompactRow
        htmlFor={`bot-name-${bot.id}`}
        label={t("botSettings.identity.name")}
        count={`${bot.name.length}/${BOT_PROFILE_LIMITS.name}`}
      >
        <ProposalStatus bot={bot} kind="chief" />
        <div className="flex items-center gap-2">
          <input
            id={`bot-name-${bot.id}`}
            className={inputCls}
            maxLength={BOT_PROFILE_LIMITS.name}
            value={bot.name}
            placeholder={namePlaceholder}
            onChange={(e) => patch({ name: e.target.value })}
          />
          {draft && <button
            type="button"
            aria-label={t("newBot.randomName")}
            title={t("newBot.randomName")}
            className="flex size-10 shrink-0 items-center justify-center rounded-lg text-ink-secondary hover:bg-control hover:text-ink"
            onClick={() => patch({ name: randomBotName(Math.random() < 0.5 ? "female" : "male", bot.name, state.bots.map(existing => existing.name)) })}
          ><Shuffle size={16} aria-hidden /></button>}
        </div>
      </CompactRow> : <div>
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <label htmlFor={`bot-name-${bot.id}`} className="text-[13px] text-ink-secondary">{t("botSettings.identity.name")}</label>
          {draft && <div className="flex flex-wrap gap-1">
            {(["female", "male"] as const).map(kind => <button
              key={kind}
              type="button"
              className="rounded-md px-2 py-1 text-xs text-ink-secondary hover:bg-control hover:text-ink"
              onClick={() => patch({ name: randomBotName(kind, bot.name, state.bots.map(existing => existing.name)) })}
            >{t(kind === "female" ? "newBot.randomFemaleName" : "newBot.randomMaleName")}</button>)}
          </div>}
        </div>
        <ProposalStatus bot={bot} kind="chief" />
        <input
          id={`bot-name-${bot.id}`}
          className={inputCls}
          maxLength={BOT_PROFILE_LIMITS.name}
          value={bot.name}
          placeholder={namePlaceholder}
          onChange={(e) => patch({ name: e.target.value })}
        />
      </div>)}
      {shows("title") && (compact ? <CompactRow
        htmlFor={`bot-title-${bot.id}`}
        label={t("botSettings.identity.title")}
        count={`${bot.title.length}/${BOT_PROFILE_LIMITS.title}`}
      >
        <ProposalStatus bot={bot} kind="chief" />
        <input
          id={`bot-title-${bot.id}`}
          className={inputCls}
          maxLength={BOT_PROFILE_LIMITS.title}
          placeholder={t("botSettings.identity.titlePlaceholder")}
          value={bot.title}
          onChange={(e) => patch({ title: e.target.value })}
        />
      </CompactRow> : <Field label={t("botSettings.identity.title")}>
        <ProposalStatus bot={bot} kind="chief" />
        <input
          id={`bot-title-${bot.id}`}
          className={inputCls}
          maxLength={BOT_PROFILE_LIMITS.title}
          placeholder={t("botSettings.identity.titlePlaceholder")}
          value={bot.title}
          onChange={(e) => patch({ title: e.target.value })}
        />
      </Field>)}
      {shows("blurb") && <div className="block">
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <label htmlFor={`bot-instructions-${bot.id}`} className="text-[13px] text-ink-secondary">
            {t("botSettings.identity.blurb")}
          </label>
          <button
            type="button"
            onClick={() => setInstructionsOpen(true)}
            className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11.5px] font-medium text-accent-text hover:bg-accent/10"
          >
            <BookOpen size={12} /> {t("botSettings.identity.viewFull")}
          </button>
        </div>
        <ProposalStatus bot={bot} kind="chief" />
        <textarea
          id={`bot-instructions-${bot.id}`}
          className={cn(inputCls, "min-h-[72px] resize-y leading-relaxed")}
          maxLength={BOT_PROFILE_LIMITS.description}
          placeholder={t("botSettings.identity.blurbPlaceholder")}
          aria-label={t("botSettings.identity.blurb")}
          value={bot.description}
          onChange={(e) => patch({ description: e.target.value })}
        />
        <div className="mt-1.5 flex items-start justify-between gap-3 text-[11px] text-ink-secondary">
          <span>{t("botSettings.identity.blurbHelp")}</span>
          {bot.description.length > 3_000 && (
            <span className="shrink-0 tabular-nums">
              {bot.description.length.toLocaleString()} / {BOT_PROFILE_LIMITS.description.toLocaleString()}
            </span>
          )}
        </div>
      </div>}

      <DefaultBotHideRow bot={bot} />
      {instructionsOpen && <BotInstructionsDialog bot={bot} inline={draft} onClose={() => setInstructionsOpen(false)} />}
    </div>
  );
}

export function CompactRow({ htmlFor, label, count, children }: { htmlFor?: string; label: string; count?: string; children: ReactNode }) {
  return (
    <div className="px-4 py-3">
      <div className="mb-1.5 flex items-center justify-between gap-3 text-[13px] text-ink-secondary">
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span>{label}</span>}
        {count && <span className="tabular-nums text-[12px] text-ink-tertiary">{count}</span>}
      </div>
      {children}
    </div>
  );
}
