import type { ReactNode } from "react";

import { useStore } from "@/state/store";
import type { BotCreationDraft } from "@/lib/bot-creation-draft";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import type { LocaleKey } from "@/locales";
import { useTeamPeople } from "@/state/team-people";
import { approvalModeFor } from "../../../shared/approval-mode";
import { BotAvatar } from "../Avatar";
import { Select } from "../Select";
import { SearchableSelect } from "../SearchableSelect";
import { AccessSection } from "../bot-settings/AccessSection";
import { IdentitySection } from "../bot-settings/IdentitySection";
import { ModelSection } from "../bot-settings/ModelSection";
import { PermissionsSection } from "../bot-settings/PermissionsSection";
import { SkillsSection } from "../bot-settings/SkillsSection";
import { SoulSection } from "../bot-settings/SoulSection";
import { VoiceSection } from "../bot-settings/VoiceSection";
import { useBotSettingsDerived } from "../bot-settings/useBotSettingsDerived";
import type { VisibilityMode } from "../bot-settings/VisibilitySection";
import { DraftMemory, DraftRoutines, StartingRole } from "./DraftPieces";
import { StepHeading } from "./NewBotFrame";
import { STEP_LABEL, STEP_SUBTITLE, departmentsOf, type NewBotStep } from "./steps";

export interface VisibilityControl {
  audience: VisibilityMode;
  people: string;
  disabled: boolean;
  setAudience(value: VisibilityMode): void;
  setPeople(value: string): void;
}

export interface OwnerControl {
  value: string | null;
  choose(email: string): void;
}

export function StepContent({
  step,
  draft,
  defaultsMode,
  owner,
  visibility,
  onEdit,
}: {
  step: NewBotStep;
  draft: BotCreationDraft;
  defaultsMode: boolean;
  owner?: OwnerControl;
  visibility?: VisibilityControl;
  onEdit: (step: NewBotStep) => void;
}) {
  const bot = draft.bot;
  const derived = useBotSettingsDerived(bot);
  const body = (() => {
    switch (step) {
      case "identity": return <IdentityStep draft={draft} defaultsMode={defaultsMode} owner={owner} visibility={visibility} derived={derived} />;
      case "permissions": return <PermissionsSection bot={bot} derived={derived} />;
      case "essence": return <SoulSection bot={bot} patch={derived.patch} />;
      case "summary": return <SummaryStep draft={draft} onEdit={onEdit} />;
      case "skills": return <SkillsSection bot={bot} />;
      case "memory": return <DraftMemory draft={draft} />;
      case "routines": return <DraftRoutines draft={draft} />;
      case "access": return <AccessSection bot={bot} derived={derived} />;
      case "model": return <ModelSection bot={bot} />;
      case "voice": return <VoiceSection bot={bot} derived={derived} />;
    }
  })();
  return (
    <div data-new-bot-step={step}>
      <StepHeading title={t(STEP_LABEL[step])} subtitle={t(STEP_SUBTITLE[step])} />
      {body}
    </div>
  );
}

function IdentityStep({ draft, defaultsMode, owner, visibility, derived }: {
  draft: BotCreationDraft;
  defaultsMode: boolean;
  owner?: OwnerControl;
  visibility?: VisibilityControl;
  derived: ReturnType<typeof useBotSettingsDerived>;
}) {
  const bot = draft.bot;
  const { state } = useStore();
  const team = useTeamPeople();
  const departments = departmentsOf(state.sections, state.bots);
  const current = bot.section ?? "";
  if (current && !departments.includes(current)) departments.push(current);
  const options = [{ value: "", label: t("teamSettings.general") }, ...departments.map((name) => ({ value: name, label: name }))];
  return (
    <div className="space-y-4">
      <StartingRole draft={draft} defaultsMode={defaultsMode} />
      <IdentitySection bot={bot} patch={derived.patch} activeState={derived.activeState} mascotMotion={null}
        namePlaceholder={defaultsMode ? t("newBot.randomName") : undefined} parts={["avatar", "provenance", "name", "title"]} />
      <div className="block text-[13px] text-ink-secondary">
        <div className="mb-1.5">{t("newBot.team")}</div>
        <SearchableSelect value={current} options={options} ariaLabel={t("newBot.team")} searchLabel={t("newBot.department.search")}
          emptyLabel={t("newBot.department.none")} onChange={(section) => draft.patch({ section })} />
      </div>
      {owner && team && <label className="block text-[13px] text-ink-secondary" data-new-bot-reports-to>{t("newBot.reportsTo")}
        <Select size="lg" className="mt-1.5 w-full" value={owner.value ?? ""} onChange={(event) => owner.choose(event.target.value)}>
          {team.people.map((person) => <option key={person.email} value={person.email}>{person.you ? t("owner.you", { name: person.name }) : person.name}</option>)}
        </Select>
        <span className="mt-1 block text-[12px]">{t("owner.pickHint")}</span>
      </label>}
      {visibility && (
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-secondary" data-new-bot-visibility>
          <label className="flex items-center gap-2">
            {t("botSettings.visibility.title")}
            <Select size="sm" value={visibility.audience} disabled={visibility.disabled}
              onChange={(event) => visibility.setAudience(event.target.value as VisibilityMode)}>
              <option value="everyone">{t("botSettings.visibility.everyone")}</option>
              <option value="admins">{t("botSettings.visibility.admins")}</option>
              <option value="people">{t("botSettings.visibility.people")}</option>
            </Select>
          </label>
          {visibility.audience === "people" && (
            <input
              value={visibility.people}
              disabled={visibility.disabled}
              onChange={(event) => visibility.setPeople(event.target.value)}
              placeholder={t("botSettings.visibility.peoplePlaceholder")}
              aria-label={t("botSettings.visibility.peopleLabel")}
              className="min-w-[16rem] flex-1 rounded-lg border border-hairline/40 bg-inset px-3 py-1.5 text-[13px] text-ink placeholder:text-ink-secondary focus:outline-none"
            />
          )}
        </div>
      )}
      <IdentitySection bot={bot} patch={derived.patch} activeState={derived.activeState} mascotMotion={null} parts={["blurb"]} />
    </div>
  );
}

function SummaryGroup({ title, step, onEdit, children }: { title: string; step: NewBotStep; onEdit: (step: NewBotStep) => void; children: ReactNode }) {
  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <h4 className="text-[13px] text-ink-secondary">{title}</h4>
        <button type="button" onClick={() => onEdit(step)}
          className="rounded-md px-1.5 py-0.5 text-[12px] font-medium text-accent-text hover:bg-accent/10">{t("newBot.summary.edit")}</button>
      </div>
      <div className="divide-y divide-hairline/40 rounded-xl bg-card">{children}</div>
    </section>
  );
}

function SummaryRow({ label, value, clamp }: { label: string; value: ReactNode; clamp?: boolean }) {
  const empty = value === "" || value === null || value === undefined;
  return (
    <div className="flex gap-4 px-4 py-3 text-[13px]">
      <span className="w-28 shrink-0 text-ink-secondary">{label}</span>
      <span className={cn("min-w-0 flex-1 whitespace-pre-wrap break-words", empty ? "text-ink-tertiary" : "text-ink", clamp && "line-clamp-4")}>{empty ? "—" : value}</span>
    </div>
  );
}

function SummaryStep({ draft, onEdit }: { draft: BotCreationDraft; onEdit: (step: NewBotStep) => void }) {
  const bot = draft.bot;
  const mode = approvalModeFor(bot);
  const skillsOn = draft.template.skills.filter((skill) => skill.enabled !== false).length;
  const label = (key: LocaleKey) => t(key);
  return (
    <div className="space-y-4" data-new-bot-summary>
      <SummaryGroup title={label("botSettings.sections.identity")} step="identity" onEdit={onEdit}>
        <div className="flex items-center gap-3 px-4 py-4">
          <BotAvatar bot={bot} size={56} />
          <div className="min-w-0">
            <div className="truncate text-[15px] font-medium text-ink">{bot.name || "—"}</div>
            <div className="truncate text-[13px] text-ink-secondary">{bot.title || "—"}</div>
          </div>
        </div>
        <SummaryRow label={t("newBot.team")} value={bot.section?.trim() || t("teamSettings.general")} />
        <SummaryRow label={t("botSettings.identity.blurb")} value={bot.description.trim()} />
      </SummaryGroup>
      <SummaryGroup title={label("botSettings.sections.permissions")} step="permissions" onEdit={onEdit}>
        <SummaryRow label={t("permissions.approval.title")} value={t(`approvalMode.${mode}.label`)} />
      </SummaryGroup>
      <SummaryGroup title={label("botSettings.sections.soul")} step="essence" onEdit={onEdit}>
        <SummaryRow label={t("newBot.summary.instructions")} value={(bot.soul ?? "").trim()} clamp />
        <SummaryRow label={t("botSettings.replyStyle.title")} value={t(bot.replyStyle === "conversational" ? "botSettings.replyStyle.conversational" : "botSettings.replyStyle.default")} />
      </SummaryGroup>
      <SummaryGroup title={t("newBot.advancedTitle")} step="skills" onEdit={onEdit}>
        <SummaryRow label={label("botSettings.sections.skills")} value={String(skillsOn)} />
        <SummaryRow label={label("botSettings.sections.memory")} value={String(Object.keys(draft.template.memory).length)} />
        <SummaryRow label={label("botSettings.sections.routines")} value={String(draft.routines.length)} />
      </SummaryGroup>
    </div>
  );
}
