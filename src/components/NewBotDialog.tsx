import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { api, BotEditorStore, useStore, type Bot, type ModelSelection } from "@/state/store";
import { BotCreationDraft, EMPTY_BOT_DEFAULTS } from "@/lib/bot-creation-draft";
import { createConfiguredBot, preparedBotTemplate } from "@/lib/create-configured-bot";
import { t } from "@/lib/i18n";
import { useOwnerOrAdmin } from "@/lib/use-owner-or-admin";
import { useAdvancedMode } from "@/lib/interface-mode";
import { botCreated } from "@/lib/product-events";
import { readyBot, readyBotTemplate } from "@/lib/ready-bots";
import { useShowThreads } from "@/lib/thread-preferences";
import { departmentOwner } from "./TeamOwner";
import { useTeamPeople, type TeamPeople } from "@/state/team-people";
import { teamChats } from "@/state/team-chats";
import { openBot } from "@/state/thread-navigation";
import { visibilityFromForm, type VisibilityMode } from "./bot-settings/VisibilitySection";
import type { NewBotDefaults } from "../../shared/new-bot-defaults";
import { BotEditorContext } from "./bot-settings/BotEditorContext";
import { LocalComputerAutoWarning } from "./LocalComputerAutoWarning";
import { SharePresetDialog } from "./SharePresetDialog";
import { SettingRow } from "./SettingsPrimitives";
import { BotAvatar } from "./Avatar";
import { SharedInTeam } from "./new-bot/DraftPieces";
import { BUTTON, NewBotFrame, type FrameTab } from "./new-bot/NewBotFrame";
import { StepContent, type OwnerControl, type VisibilityControl } from "./new-bot/StepContent";
import {
  STEP_LABEL, advancedSteps, blockingStep, flowOf, missingFields, missingIn, stepDone, stepOfField, stepsFor,
  type NewBotStep, type RequiredField,
} from "./new-bot/steps";

const FIELD_ID: Record<RequiredField, (draftId: string) => string> = {
  name: (id) => `bot-name-${id}`,
};

/** Companion pairing permits creation, but not reading host defaults or patching host settings. */
export function CompanionNewBotDialog() {
  const { state, dispatch } = useStore();
  const dialog = useRef<HTMLDivElement>(null);
  const close = () => dispatch({ type: "toggleNewBot", open: false });
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.focus();
    return () => { if (opener?.isConnected) opener.focus(); };
  }, []);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div ref={dialog} role="dialog" aria-modal="true" aria-label={t("newBot.create")} tabIndex={-1}
      className="w-full max-w-sm rounded-2xl border border-hairline/50 bg-panel p-5 text-ink shadow-2xl"
      onKeyDown={event => {
        if (event.key === "Escape") { event.stopPropagation(); close(); }
        if (event.key === "Tab") {
          const root = event.currentTarget;
          const buttons = [...root.querySelectorAll<HTMLButtonElement>("button:not([disabled])")];
          if (event.shiftKey && (document.activeElement === root || document.activeElement === buttons[0])) { event.preventDefault(); buttons.at(-1)?.focus(); }
          else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus(); }
        }
      }}>
      <h2 className="mb-4 text-[17px] font-semibold">{t("newBot.create")}</h2>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={close} className="rounded-lg px-3 py-2">{t("common.cancel")}</button>
        <button type="button" disabled={state.botCreationPending} onClick={() => dispatch({ type: "newBot", onCreated: () => { botCreated("blank"); close(); } })}
          className="rounded-lg bg-accent px-4 py-2 text-white disabled:opacity-40">{t("newBot.create")}</button>
      </div>
    </div>
  </div>;
}

export function NewBotDialog(props: Parameters<typeof LocalNewBotDialog>[0] = {}) {
  return typeof window !== "undefined" && window.ogb?.remoteClient?.active
    ? <CompanionNewBotDialog /> : <LocalNewBotDialog {...props} />;
}

export function LocalNewBotDialog({ defaultsMode = false, onClose, section, onCreated, preserveSelection = false, readyBotId }: {
  defaultsMode?: boolean; onClose?: () => void; section?: string; onCreated?: (bot: Bot) => void | Promise<void>; preserveSelection?: boolean;
  /** A ready-made bot from the Templates gallery, filled in over the person's New bot defaults. */
  readyBotId?: string;
} = {}) {
  const parent = useStore();
  const [, render] = useState(0);
  const [draft, setDraft] = useState(() => new BotCreationDraft(EMPTY_BOT_DEFAULTS, () => render(value => value + 1)));
  const [step, setStep] = useState<NewBotStep>("identity");
  const [ready, setReady] = useState(false);
  const [localSaving, setSaving] = useState(false);
  const [created, setCreated] = useState<Bot | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [visited, setVisited] = useState<ReadonlySet<NewBotStep>>(() => new Set());
  const [focusField, setFocusField] = useState<RequiredField | null>(null);
  const saving = localSaving || parent.state.botCreationPending;
  const savingRef = useRef(false);
  const alive = useRef(true);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState<"local" | null>(null);
  const [audience, setAudience] = useState<VisibilityMode>("everyone");
  const [people, setPeople] = useState("");
  const team = useTeamPeople();
  const teamName = parent.state.config?.team?.name;
  const [chosenOwner, setChosenOwner] = useState<string | null>(null);
  const ownerOrAdmin = useOwnerOrAdmin();
  const showThreads = useShowThreads();
  const advancedMode = useAdvancedMode();
  const choosesVisibility = !defaultsMode && typeof window !== "undefined" && !window.ogb && ownerOrAdmin === true;
  const dialog = useRef<HTMLDivElement>(null);
  const closeRef = useRef(() => {});
  closeRef.current = () => {
    if (onClose) onClose();
    else parent.dispatch({ type: "toggleNewBot", open: false });
  };
  useEffect(() => {
    let cancelled = false;
    void api<{ defaults: NewBotDefaults; modelSelection: ModelSelection; suggestedName: string }>("/api/bot-defaults")
      .then(result => {
        if (cancelled) return;
        const defaults = structuredClone(result.defaults);
        const selection = defaults.profile.modelSelection;
        if (!selection || (selection.instanceId === "" && selection.model === "")) {
          defaults.profile.modelSelection = result.modelSelection;
        }
        if (!defaultsMode) defaults.profile.name = defaults.profile.name?.trim() || result.suggestedName;
        if (section !== undefined) defaults.profile.section = section;
        const ready = defaultsMode || !readyBotId ? undefined : readyBot(readyBotId);
        const next = new BotCreationDraft(ready ? readyBotTemplate(defaults, ready) : defaults, () => render(value => value + 1));
        if (ready) next.role = ready.id;
        setDraft(next);
        setReady(true);
      }).catch(cause => { if (!cancelled) setError(String(cause)); });
    return () => { cancelled = true; };
  }, [defaultsMode, section, readyBotId, attempt]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => () => draft.dispose(), [draft]);
  // Disabling the focused Create button drops focus to the page in Chromium.
  useEffect(() => { if (saving) dialog.current?.focus(); }, [saving]);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      const root = dialog.current;
      if (!root || (event.target instanceof Node && !root.contains(event.target))) return;
      const nested = root.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]');
      if (nested && nested.getClientRects().length) return;
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const controls = [...root.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]')]
        .filter(control => control.getClientRects().length && !control.closest("[hidden],fieldset:disabled"));
      const first = controls[0]; const last = controls.at(-1);
      if (!first || !last) { event.preventDefault(); root.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root)) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    if (!focusField) return;
    dialog.current?.querySelector<HTMLElement>(`[id="${FIELD_ID[focusField](draft.id)}"]`)?.focus();
    setFocusField(null);
  }, [focusField, step, draft.id]);

  const bot = draft.bot;
  const missing = defaultsMode ? [] : missingFields(bot);
  const flow = defaultsMode ? "basic" : flowOf(step);
  const steps = stepsFor(flow, { withModel: advancedMode, defaultsMode });
  const basicSteps = stepsFor("basic", { withModel: advancedMode, defaultsMode });
  const index = steps.indexOf(step);
  const visit = (target: NewBotStep) => { setStep(target); setVisited(previous => new Set(previous).add(step).add(target)); };
  const go = (target: NewBotStep) => {
    if (!defaultsMode) {
      const blocker = flowOf(target) === "advanced"
        ? (missing.length ? stepOfField(missing[0]!) : null)
        : blockingStep(target, basicSteps, bot);
      if (blocker) { visit(blocker); setFocusField(missingIn(blocker, bot)[0] ?? null); return; }
    }
    visit(target);
  };
  const next = () => {
    const lacking = defaultsMode ? [] : missingIn(step, bot);
    if (lacking.length) { setFocusField(lacking[0]!); return; }
    const target = steps[index + 1];
    if (target) go(target);
  };
  const back = () => {
    const target = steps[index - 1];
    if (target) visit(target);
    else if (flow === "advanced") visit("summary");
  };
  const advance = () => go(advancedSteps(advancedMode)[0]!);

  const save = async () => {
    if (!ready || savingRef.current || parent.state.botCreationPending) return;
    if (!defaultsMode && missingFields(draft.bot).length) return;
    if (!defaultsMode && draft.bot.approvalMode === "auto" && draft.bot.computer === "local" && !draft.consent.acknowledgeLocalAuto) { setWarning("local"); return; }
    const visibility = choosesVisibility ? visibilityFromForm(audience, people) : null;
    if (visibility && !visibility.ok) { setError(t("botSettings.visibility.needPeople")); return; }
    savingRef.current = true; setSaving(true); setError("");
    parent.dispatch({ type: "botCreationPending", on: true });
    let finished: Bot | null = null;
    try {
      if (defaultsMode) await api("/api/config", { method: "PATCH", body: JSON.stringify({ newBotDefaults: await preparedBotTemplate(draft) }) });
      else {
        const { bot, warnings } = await createConfiguredBot(draft, undefined, undefined, undefined, visibility?.ok ? visibility.visibility : undefined,
          team ? reportsToFor(chosenOwner, draft.bot.section, parent.state.bots, team) ?? undefined : undefined);
        botCreated(draft.preset ? "preset" : draft.role ? "template" : "blank", draft.role);
        parent.dispatch({ type: "botAdded", bot, preserveSelection });
        if (!preserveSelection && teamChats()) openBot(parent.dispatch, bot, showThreads);
        if (warnings.length) parent.dispatch({ type: "error", message: warnings.join("\n") });
        finished = bot;
        try { await onCreated?.(bot); }
        catch (cause) { parent.dispatch({ type: "error", message: cause instanceof Error ? cause.message : String(cause) }); }
      }
      savingRef.current = false;
      if (alive.current) { if (finished) setCreated(finished); else closeRef.current(); }
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally {
      savingRef.current = false;
      parent.dispatch({ type: "botCreationPending", on: false });
      if (alive.current) setSaving(false);
    }
  };
  const createAnother = () => {
    setCreated(null); setReady(false); setStep("identity"); setVisited(new Set());
    setChosenOwner(null); setAudience("everyone"); setPeople(""); setError("");
    setAttempt(value => value + 1);
  };
  const startChatting = () => {
    if (created) openBot(parent.dispatch, created, showThreads);
    closeRef.current();
  };

  const scoped: ReturnType<typeof useStore> = {
    ...parent,
    state: { ...parent.state, bots: [bot, ...parent.state.bots], routines: draft.routines, routineRuns: [], routinesLoadState: "ready" },
    flushBotPatches: async () => bot,
    dispatch: action => {
      if (action.type === "updateBot" && action.botId === draft.id) draft.patch(action.patch);
      else if (action.type === "setModel" && action.botId === draft.id) {
        draft.setModel(action.selection);
        if (action.resetApprovalToAsk) draft.patch({ approvalMode: "ask" });
      } else if (action.type === "routinePatched") {}
      else if (action.type === "toggleSettings") {}
      else parent.dispatch(action);
    },
  };

  const showBadges = !defaultsMode && flow === "basic";
  const tabs: FrameTab[] = steps.map((id) => {
    const label = t(STEP_LABEL[id]);
    const lacking = id === "summary" ? missing.length : missingIn(id, bot).length;
    const seen = visited.has(id) && id !== step;
    const done = stepDone({ showBadges, defaultsMode, lacking, seen });
    const description = done ? t("newBot.progress.stepDone", { step: label }) : lacking && showBadges ? t("newBot.progress.stepPending", { step: label, count: lacking }) : label;
    return { id, label, missing: showBadges ? lacking : 0, done, description };
  });
  const lastStep = index === steps.length - 1;
  const creating = !defaultsMode && flow === "basic" && step === "summary";
  const stepLacks = !defaultsMode && missingIn(step, bot).length > 0;
  const saveDisabled = !ready || saving || (!defaultsMode && missing.length > 0);
  const saveLabel = t(defaultsMode ? "newBot.saveDefaults" : flow === "advanced" ? "newBot.nav.saveAndClose" : "newBot.create");
  const spinner = saving && <Loader2 size={15} className="animate-spin" />;
  const title = defaultsMode ? t("newBot.defaults") : flow === "advanced" && !created ? t("newBot.advancedTitle") : t("sidebar.newBot");
  const who = flow === "advanced" && !defaultsMode && !created && (
    <span className="flex min-w-0 items-center gap-2 border-s border-hairline/40 ps-3 text-[13px] text-ink-secondary">
      <BotAvatar bot={bot} size={24} /><span className="truncate">{bot.name}</span>
    </span>
  );
  let note: string | undefined;
  if (!defaultsMode && flow === "basic") note = missing.length ? t("newBot.progress.missing", { count: missing.length }) : creating ? undefined : t("newBot.progress.ready");
  else if (!defaultsMode && index === 0) note = t("newBot.progress.optional");

  const actions = <>
    {flow === "basic" && <button type="button" onClick={() => closeRef.current()} className={BUTTON.ghost}>{t("common.cancel")}</button>}
    {(index > 0 || flow === "advanced") && <button type="button" onClick={back} className={BUTTON.secondary}><ChevronLeft size={14} />{t("newBot.nav.back")}</button>}
    {!creating && !lastStep && <button type="button" disabled={stepLacks} onClick={next} className={flow === "basic" && !defaultsMode ? BUTTON.primary : BUTTON.secondary}>
      {t(flow === "basic" && !defaultsMode ? "newBot.nav.next" : "newBot.nav.continue")}<ChevronRight size={14} />
    </button>}
    {creating && <button type="button" disabled={missing.length > 0} onClick={advance} className={BUTTON.secondary}>{t("newBot.nav.advanced")}</button>}
    {(creating || flow === "advanced" || defaultsMode) && <button type="button" disabled={saveDisabled} onClick={() => void save()} className={BUTTON.primary}>{spinner}{saveLabel}</button>}
  </>;

  return <NewBotFrame
    dialogRef={dialog}
    title={title}
    who={who || undefined}
    hidden={!defaultsMode && parent.state.appSettingsOpen}
    busy={saving}
    onClose={() => closeRef.current()}
    banner={team && !defaultsMode && teamName ? <SharedInTeam team={teamName} /> : undefined}
    tabs={tabs}
    activeTab={step}
    onTab={(id) => go(id as NewBotStep)}
    error={error}
    note={note}
    noteDone={!defaultsMode && flow === "basic" && missing.length === 0}
    actions={actions}
    done={created ? { bot: created, onAnother: createAnother, onStart: startChatting } : undefined}
  >
    {!ready && !error && <div role="status" className="flex items-center gap-2 text-[13px] text-ink-secondary"><Loader2 size={16} className="animate-spin" />{t("newBot.loading")}</div>}
    {ready && <fieldset disabled={saving} className="min-w-0">
      <BotEditorStore value={scoped}><BotEditorContext.Provider value={{ request: draft.request, draft: true, uploadAvatar: draft.uploadAvatar }}>
        <StepContent step={step} draft={draft} defaultsMode={defaultsMode} onEdit={go}
          owner={team && !defaultsMode ? { value: reportsToFor(chosenOwner, bot.section, parent.state.bots, team), choose: setChosenOwner } satisfies OwnerControl : undefined}
          visibility={choosesVisibility ? { audience, people, disabled: saving, setAudience, setPeople } satisfies VisibilityControl : undefined} />
      </BotEditorContext.Provider></BotEditorStore>
    </fieldset>}
    <LocalComputerAutoWarning open={warning === "local"} onCancel={() => setWarning(null)} onConfirm={() => { draft.consent.acknowledgeLocalAuto = true; setWarning(null); void save(); }} />
  </NewBotFrame>;
}

/** Who a new team bot reports to: the person chosen, else whoever every bot of its department reports to, else this
 * person. */
function reportsToFor(chosen: string | null, section: string | undefined, bots: readonly Bot[], team: TeamPeople): string | null {
  if (chosen) return chosen;
  const department = bots.filter((bot) => !bot.hidden && (bot.section?.trim() || "") === (section?.trim() || ""));
  return departmentOwner(department, team)?.email ?? team.me?.email ?? null;
}

export function DefaultBotSettings() {
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(false);

    const content = <>
      <div className="flex shrink-0 gap-2">
        <button type="button" onClick={() => setSharing(true)} className="cursor-pointer rounded-lg px-3 py-1.5 text-[13px] text-ink-secondary hover:bg-control hover:text-ink">{t("newBot.sharePreset")}</button>
        <button type="button" onClick={() => setOpen(true)} className="cursor-pointer rounded-lg bg-control px-3 py-1.5 text-[13px] text-ink hover:bg-raised-hover">{t("newBot.edit")}</button>
      </div>
      {open && <NewBotDialog defaultsMode onClose={() => setOpen(false)} />}
      {sharing && <SharePresetDialog onClose={() => setSharing(false)} />}
    </>

  return <>
    <SettingRow title={t("newBot.defaults")} children={content} />

  </>;
}
