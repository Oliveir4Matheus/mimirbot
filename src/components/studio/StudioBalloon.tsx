import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Ban, Check, ChevronRight, Upload, X } from "lucide-react";

import {
  WORKFLOW_CONDITION_ROWS_MAX,
  type ConditionLine,
  type ConditionMatch,
  type ConditionOp,
  type StepOutput,
  type WorkflowModule,
  type WorkflowModuleRuntime,
  type WorkflowParameter,
  type WorkflowParameterType,
  type WorkflowSkillOptions,
  type WorkflowStep,
  workflowModuleRuntimes,
  workflowParameterTypes,
} from "../../../shared/workflow";
import type { LocaleKey } from "@/locales";
import { Select } from "@/components/Select";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import type { BranchKey } from "./StudioCard";
import {
  addModule, addParameter as addStepParameter, conditionOpLabel, consumedOutputs, moduleProblems,
  nextConditionValue, outputsOf, parameterChannels, parameterOrigin, parameterProblems, removeModule, removeParameter,
  setParameterOrigin, skillSelection, skillsWithGroup, suggestOutputPath, updateModule, updateParameter,
  type ParameterOrigin, type StudioBranch, type StudioDraft, type StudioSkillGroup,
} from "./studio-model";

const MAX_PREVIEW = 512_000;

const READ = { instructions: [".txt", ".md", ".json"], context: [".txt", ".md", ".json", ".csv"], script: [".mjs", ".txt"] };

const BRANCH_TITLE: Record<BranchKey, LocaleKey> = {
  instructions: "studio.branch.instructions",
  context: "studio.branch.inputs",
  tools: "studio.branch.tools",
  skills: "studio.branch.skills",
  return: "studio.branch.return",
  run: "studio.branch.run",
  input: "studio.branch.inputs",
  output: "studio.branch.output",
  script: "studio.branch.script",
  condition: "studio.branch.condition",
  true: "studio.branch.true",
  false: "studio.branch.false",
  failure: "studio.branch.failure",
  timeout: "studio.branch.timeout",
};

const PARAMETER_TYPES: Record<WorkflowParameterType, LocaleKey> = {
  string: "studio.inputs.type.string",
  number: "studio.inputs.type.number",
  integer: "studio.inputs.type.integer",
  boolean: "studio.inputs.type.boolean",
  date: "studio.inputs.type.date",
  enum: "studio.inputs.type.enum",
};

const MODULE_RUNTIMES: Record<WorkflowModuleRuntime, LocaleKey> = {
  bin: "studio.modules.bin",
  python: "studio.modules.python",
  node: "studio.modules.node",
};

const ORIGINS: Array<{ origin: ParameterOrigin; label: LocaleKey }> = [
  { origin: "none", label: "studio.inputs.originNone" },
  { origin: "collected", label: "studio.inputs.originCollected" },
  { origin: "from", label: "studio.inputs.originFrom" },
];

export interface BalloonBot { id: string; name: string; section?: string }

/** What the installation's script environment answers; the Studio only reads it. */
export interface BalloonEnvironment {
  prepared: boolean;
  stale: boolean;
  preparedAt?: number;
  changed: number;
  declared: number;
}

export interface BalloonFocus { field: string; token: number }

/** `DD/MM · HH:MM` in the computer's time zone. */
export function formatPreparedAt(preparedAt: number): string {
  const date = new Date(preparedAt);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} · ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function StudioBalloon({ draft, step, branch, anchor, bots, scripts, skillOptions, skillOptionsLoading, skillOptionsError, environment, preparingEnvironment, onPrepareEnvironment, consumed, focus, onChange, onScript, onRenameScript, onToast, onDisconnect, onOpenInputs, onClose }: {
  draft: StudioDraft;
  step: WorkflowStep;
  branch: BranchKey;
  anchor: DOMRect;
  bots: readonly BalloonBot[];
  scripts: Record<string, string>;
  skillOptions?: WorkflowSkillOptions;
  skillOptionsLoading?: boolean;
  skillOptionsError?: string;
  environment?: BalloonEnvironment;
  preparingEnvironment?: boolean;
  onPrepareEnvironment?: () => void;
  consumed?: ReadonlySet<string>;
  focus?: BalloonFocus;
  onChange: (patch: Partial<WorkflowStep>) => void;
  onScript: (name: string, content: string) => void;
  onRenameScript: (from: string, to: string) => void;
  onToast: (key: LocaleKey) => void;
  onDisconnect: (branch: StudioBranch) => void;
  onOpenInputs: (field: string) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [focusRequest, setFocusRequest] = useState<BalloonFocus | undefined>(focus);
  const index = draft.steps.findIndex((candidate) => candidate.id === step.id);
  const nameOf = (id: string) => draft.steps.find((candidate) => candidate.id === id)?.name ?? id;
  const outputs = outputsOf(step);
  const width = 338;
  const left = Math.min(Math.max(12, anchor.left + anchor.width / 2 - width / 2), window.innerWidth - width - 12);
  const above = anchor.top > 430;
  const title = t(BRANCH_TITLE[branch]);
  const subtitle = t("studio.balloon.subtitle", { name: step.name, branch: title });

  const earlier = useMemo(() => draft.steps.slice(0, index).filter((candidate) => candidate.kind !== "condition"), [draft.steps, index]);

  useEffect(() => {
    if (focus === undefined) return;
    setFocusRequest({ field: focus.field, token: focus.token });
  }, [focus?.field, focus?.token]);

  useEffect(() => {
    if (focusRequest === undefined) return;
    const root = rootRef.current;
    if (!root) return;
    const base = focusRequest.field.split(".").slice(0, 2).join(".");
    const exact = root.querySelector<HTMLElement>(`[data-studio-field="${focusRequest.field}"]`);
    const nearby = root.querySelector<HTMLElement>(`[data-studio-field^="${base}."]`);
    const target = exact ?? nearby ?? root.querySelector<HTMLElement>("input,select,textarea,button");
    if (!target) return;
    target.scrollIntoView?.({ block: "center" });
    target.focus();
    target.classList.add("studio-field-focus");
    const clear = () => {
      target.classList.remove("studio-field-focus");
      target.removeEventListener("blur", clear);
    };
    target.addEventListener("blur", clear);
    return clear;
  }, [focusRequest, branch, step.id]);

  const readFile = async (accept: readonly string[], apply: (text: string) => void) => {
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    if (!accept.some((extension) => file.name.toLowerCase().endsWith(extension))) {
      onToast("studio.toast.fileType");
      return;
    }
    if (file.size > MAX_PREVIEW) {
      onToast("studio.toast.fileTooBig");
      return;
    }
    apply(await file.text());
    onToast("studio.toast.fileLoaded");
    if (inputRef.current) inputRef.current.value = "";
  };

  const setOutputs = (next: StepOutput[]) => onChange({ outputs: next } as Partial<WorkflowStep>);

  const addParameter = () => {
    if (step.kind === "condition" || step.kind === "loop") return;
    const next = addStepParameter(draft, step.id);
    const updated = next.draft.steps.find((candidate) => candidate.id === step.id);
    if (updated && updated.kind !== "condition" && updated.kind !== "loop") onChange({ parameters: updated.parameters } as Partial<WorkflowStep>);
    setFocusRequest({ field: `parameters.${next.index}.name`, token: Date.now() });
  };

  const addCollectedParameter = () => {
    if (step.kind === "condition" || step.kind === "loop") return;
    const next = addStepParameter(draft, step.id, { collectedBy: step.id });
    const updated = next.draft.steps.find((candidate) => candidate.id === step.id);
    if (updated && updated.kind !== "condition" && updated.kind !== "loop") onChange({ parameters: updated.parameters } as Partial<WorkflowStep>);
    onOpenInputs(`parameters.${next.index}.name`);
  };

  const manualMissing = (step.kind === "bot" || step.kind === "script")
    && step.mode === "manual"
    && !step.parameters.some((parameter) => parameter.collectedBy === step.id);

  const conditionSources = step.kind === "condition"
    ? earlier.filter((candidate) => outputsOf(candidate).some((output) => output.path.toLowerCase().endsWith(".json")))
    : [];
  const conditionSource = step.kind === "condition" ? earlier.find((candidate) => candidate.id === step.from.step) : undefined;
  const conditionOutputs = conditionSource
    ? outputsOf(conditionSource).filter((output) => output.path.toLowerCase().endsWith(".json"))
    : [];

  return (
    <div
      ref={rootRef}
      className="studio-balloon"
      role="dialog"
      aria-label={title}
      style={{ left, width, maxHeight: "min(440px, 58vh)", ...(above ? { top: anchor.top - 14, transform: "translateY(-100%)" } : { top: anchor.bottom + 14 }) }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="studio-balloon-head">
        <div className="min-w-0">
          <div className="studio-balloon-title">{title}</div>
          <div className="studio-balloon-subtitle">{subtitle}</div>
        </div>
        <button type="button" className="studio-balloon-close" aria-label={t("studio.balloon.close")} onClick={onClose}>
          <X size={15} aria-hidden="true" />
        </button>
      </div>

      <div className="studio-balloon-body">
        {step.kind === "bot" && branch === "instructions" && (
          <>
            <Field label={t("studio.agent.bot")}>
              <Select className="w-full" size="sm" value={step.botId} data-studio-field="bot" onChange={(event) => onChange({ botId: event.target.value })}>
                <option value="">{t("studio.agent.pickBot")}</option>
                {bots.map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}
              </Select>
            </Field>
            <Field label={t("studio.agent.instructions")} help={t("studio.agent.instructionsHelp")}>
              <textarea
                className="studio-input studio-textarea"
                data-studio-field="instructions"
                value={step.instructions}
                placeholder={t("studio.agent.instructionsPlaceholder")}
                onChange={(event) => onChange({ instructions: event.target.value })}
              />
              <UploadRow label={t("studio.agent.loadInstructions")} onClick={() => inputRef.current?.click()} />
              <input ref={inputRef} type="file" accept=".txt,.md,.json" className="hidden" onChange={() => void readFile(READ.instructions, (text) => onChange({ instructions: text }))} />
            </Field>
          </>
        )}

        {step.kind === "bot" && branch === "context" && (
          <InputsFields
            draft={draft}
            step={step}
            earlier={earlier}
            consumed={consumed ?? consumedOutputs(draft)}
            onChange={onChange}
            onAdd={addParameter}
          />
        )}

        {step.kind === "bot" && branch === "tools" && (
          <Field label={t("studio.agent.tools")} help={t("studio.agent.toolsHelp")}>
            <div className="studio-info">{bots.find((bot) => bot.id === step.botId)?.name ?? t("studio.card.noBot")}</div>
          </Field>
        )}

        {step.kind === "bot" && branch === "skills" && (
          <SkillsFields
            step={step}
            options={skillOptions}
            loading={skillOptionsLoading}
            error={skillOptionsError}
            onChange={onChange}
          />
        )}

        {step.kind === "bot" && branch === "return" && (
          <>
            <OutputList outputs={outputs} consumed={consumed ?? consumedOutputs(draft)} stepId={step.id} onChange={setOutputs} />
            {step.result !== undefined && <LegacyResultRow onRemove={() => onChange({ result: undefined } as Partial<WorkflowStep>)} />}
          </>
        )}

        {step.kind === "script" && branch === "input" && (
          <InputsFields
            draft={draft}
            step={step}
            earlier={earlier}
            consumed={consumed ?? consumedOutputs(draft)}
            onChange={onChange}
            onAdd={addParameter}
          />
        )}

        {step.kind === "script" && branch === "output" && (
          <>
            <OutputList outputs={outputs} consumed={consumed ?? consumedOutputs(draft)} stepId={step.id} onChange={setOutputs} />
            {step.result !== undefined && <LegacyResultRow onRemove={() => onChange({ result: undefined } as Partial<WorkflowStep>)} />}
          </>
        )}

        {step.kind === "script" && branch === "script" && (
          <>
            <Field label={t("studio.script.name")} help={t("studio.script.nameHelp")}>
              <input
                className={cn("studio-input font-mono", !isScriptFieldValid(step.run) && "studio-input-invalid")}
                data-studio-field="run"
                aria-invalid={!isScriptFieldValid(step.run)}
                value={step.run}
                onChange={(event) => {
                  const raw = event.target.value.trim();
                  const next = raw.endsWith(".mjs") ? raw : `${raw.replace(/\.(mjs|js|ts|py)$/, "")}.mjs`;
                  if (next === step.run) return;
                  onRenameScript(step.run, next);
                  onChange({ run: next } as Partial<WorkflowStep>);
                }}
              />
              {!isScriptFieldValid(step.run) && <div className="studio-field-error">{t("studio.needScriptName", { name: step.name })}</div>}
            </Field>
            <Field label={t("studio.script.code")} help={t("studio.script.codeHelp")}>
              <textarea
                className="studio-input studio-code"
                value={scripts[step.run] ?? ""}
                onChange={(event) => onScript(step.run, event.target.value)}
                spellCheck={false}
              />
              <UploadRow label={t("studio.script.load")} onClick={() => inputRef.current?.click()} />
              <input ref={inputRef} type="file" accept=".mjs,.txt" className="hidden" onChange={() => void readFile(READ.script, (text) => onScript(step.run, text))} />
            </Field>
            <ModulesFields
              draft={draft}
              step={step}
              environment={environment}
              preparing={preparingEnvironment}
              onPrepare={onPrepareEnvironment}
              onChange={(modules) => onChange({ modules } as Partial<WorkflowStep>)}
            />
            <Field label={t("studio.script.timeout")} help={t("studio.script.timeoutHelp")}>
              <input
                type="number"
                min={1}
                max={3600}
                data-studio-field="timeout"
                className="studio-input"
                value={Math.round(step.timeoutMs / 1000)}
                onChange={(event) => onChange({ timeoutMs: Math.max(1, Math.min(3600, Number(event.target.value) || 1)) * 1000 } as Partial<WorkflowStep>)}
              />
            </Field>
          </>
        )}

        {step.kind === "condition" && branch === "condition" && (
          <>
            <Field label={t("studio.condition.from")} help={t("studio.condition.fromHelp")}>
              <Select
                className="w-full"
                size="sm"
                value={step.from.step}
                data-studio-field="from"
                onChange={(event) => {
                  const source = earlier.find((candidate) => candidate.id === event.target.value);
                  const outputs = source ? outputsOf(source).filter((output) => output.path.toLowerCase().endsWith(".json")) : [];
                  const output = outputs.find((candidate) => candidate.shape !== undefined) ?? outputs[0];
                  onChange({ from: { step: event.target.value, output: output?.path ?? "" } } as Partial<WorkflowStep>);
                }}
              >
                <option value="">{t("studio.condition.pickFrom")}</option>
                {conditionSources.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
              </Select>
              {conditionSources.length === 0 && <div className="studio-help">{t("studio.condition.noFrom")}</div>}
            </Field>
            <Field label={t("studio.condition.fromOutput")}>
              <Select
                className="w-full"
                size="sm"
                value={step.from.output}
                disabled={conditionOutputs.length === 0}
                data-studio-field="from.output"
                onChange={(event) => onChange({ from: { ...step.from, output: event.target.value } } as Partial<WorkflowStep>)}
              >
                <option value="">{t("studio.condition.pickOutput")}</option>
                {conditionOutputs.map((output) => <option key={output.path} value={output.path}>{output.path}</option>)}
              </Select>
            </Field>
            <ConditionFields
              match={step.match}
              conditions={step.conditions}
              onChange={(patch) => onChange(patch as Partial<WorkflowStep>)}
            />
          </>
        )}

        {step.kind === "loop" && branch === "condition" && (
          <LoopConditionFields
            step={step}
            onChange={onChange}
          />
        )}

        {step.kind === "condition" && (branch === "true" || branch === "false") && (
          <Field label={t("studio.condition.connected")} help={branch === "true" ? t("studio.condition.trueHelp") : t("studio.condition.falseHelp")}>
            <div className="studio-info">
              {branch === "true"
                ? (step.whenTrue ? nameOf(step.whenTrue) : t("studio.condition.none"))
                : (step.whenFalse ? nameOf(step.whenFalse) : t("studio.condition.none"))}
            </div>
            {(branch === "true" ? step.whenTrue : step.whenFalse) && (
              <DisconnectRow label={t("studio.disconnect")} onClick={() => onDisconnect(branch)} />
            )}
          </Field>
        )}

        {(branch === "failure" || branch === "timeout") && (
          <Field label={t("studio.condition.connected")} help={t("studio.condition.connectHelp")}>
            <div className="studio-info">
              {branch === "failure"
                ? (step.onFailure ? nameOf(step.onFailure) : t("studio.condition.none"))
                : ((step.kind === "bot" || step.kind === "script") && step.onTimeout ? nameOf(step.onTimeout) : t("studio.condition.none"))}
            </div>
            {((branch === "failure" && step.onFailure !== undefined)
              || (branch === "timeout" && (step.kind === "bot" || step.kind === "script") && step.onTimeout !== undefined)) && (
              <DisconnectRow label={t("studio.disconnect")} onClick={() => onDisconnect(branch)} />
            )}
          </Field>
        )}

        {branch === "run" && (
          <>
            <Field label={t("studio.condition.connected")} help={step.kind === "condition" ? t("studio.condition.runHelp") : t("studio.agent.runHelp")}>
              <div className="studio-info">
                {step.kind === "condition"
                  ? t("studio.condition.twoRoutes")
                  : typeof step.onSuccess === "string" ? nameOf(step.onSuccess) : t("studio.card.end")}
              </div>
              {step.kind !== "condition" && typeof step.onSuccess === "string" && (
                <DisconnectRow label={t("studio.disconnect")} onClick={() => onDisconnect("run")} />
              )}
            </Field>
            {(step.kind === "bot" || step.kind === "script") && step.when !== undefined && (
              <LegacyBranchRow onRemove={() => onChange({ when: undefined } as Partial<WorkflowStep>)} />
            )}
            {(step.kind === "bot" || step.kind === "script") && step.require !== undefined && (
              <LegacyRequireRow onRemove={() => onChange({ require: undefined } as Partial<WorkflowStep>)} />
            )}
            {(step.kind === "bot" || step.kind === "script") && (
              <Field label={t("studio.step.mode")} help={t("studio.step.modeHelp")}>
                <Select
                  className={cn("w-full", manualMissing && "studio-select-invalid")}
                  size="sm"
                  value={step.mode}
                  data-studio-field="mode"
                  aria-invalid={manualMissing}
                  aria-describedby={manualMissing ? "studio-manual-warning" : undefined}
                  onChange={(event) => onChange({ mode: event.target.value as "auto" | "manual" } as Partial<WorkflowStep>)}
                >
                  <option value="auto">{t("studio.step.modeAuto")}</option>
                  <option value="manual">{t("studio.step.modeManual")}</option>
                </Select>
              </Field>
            )}
            {(step.kind === "bot" || step.kind === "script") && manualMissing && (
              <div className="studio-callout" id="studio-manual-warning" role="status">
                <div className="studio-callout-head">
                  <AlertTriangle size={13} aria-hidden="true" />
                  <strong>{t("studio.manual.title")}</strong>
                </div>
                <div className="studio-callout-help">{t("studio.manual.help")}</div>
                <button type="button" className="studio-callout-action" onClick={addCollectedParameter}>
                  {t("studio.manual.add")}
                </button>
              </div>
            )}
            {step.kind === "bot" && (
              <Field label={t("studio.agent.timeout")} help={t("studio.agent.timeoutHelp")}>
                <input
                  type="number"
                  min={0}
                  max={3_600}
                  data-studio-field="timeout"
                  className="studio-input"
                  placeholder={t("studio.agent.timeoutNone")}
                  value={step.timeoutMs > 0 ? Math.round(step.timeoutMs / 1000) : ""}
                  onChange={(event) => onChange({ timeoutMs: Math.max(0, Math.min(3_600, Number(event.target.value) || 0)) * 1000 } as Partial<WorkflowStep>)}
                />
              </Field>
            )}
          </>
        )}
      </div>

      <div className="studio-balloon-foot">
        <span className="studio-saved"><Check size={12} aria-hidden="true" /> {t("studio.balloon.draft")}</span>
        <span className="studio-local"><Check size={11} aria-hidden="true" /> {t("studio.balloon.local")}</span>
      </div>
    </div>
  );
}

function isScriptFieldValid(run: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*\.mjs$/.test(run);
}

function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <div className="studio-field">
      <div className="studio-label">{label}</div>
      {children}
      {help && <div className="studio-help">{help}</div>}
    </div>
  );
}

function Section({ label, action, children }: { label: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="studio-balloon-section">
      <div className="studio-section-head">
        <span className="studio-section-label">{label}</span>
        {action}
      </div>
      {children}
    </section>
  );
}

const SKILL_GROUPS: Record<StudioSkillGroup, { label: LocaleKey; help: LocaleKey }> = {
  bot: { label: "studio.agent.skillsBot", help: "studio.agent.skillsBotHelp" },
  bundled: { label: "studio.agent.skillsBundled", help: "studio.agent.skillsBundledHelp" },
  imported: { label: "studio.agent.skillsImported", help: "studio.agent.skillsImportedHelp" },
};

function SkillsFields({ step, options, loading, error, onChange }: {
  step: Extract<WorkflowStep, { kind: "bot" }>;
  options?: WorkflowSkillOptions;
  loading?: boolean;
  error?: string;
  onChange: (patch: Partial<WorkflowStep>) => void;
}) {
  const selection = skillSelection(step);
  const setGroup = (group: StudioSkillGroup, values: readonly string[]) => {
    onChange({ skills: skillsWithGroup(step, group, values) } as Partial<WorkflowStep>);
  };
  return (
    <>
      <Field label={t("studio.agent.skills")} help={t("studio.agent.skillsHelp")}>
        {!step.botId && <div className="studio-info">{t("studio.agent.skillsNoBot")}</div>}
        {step.botId && loading && <div className="studio-help">{t("studio.agent.skillsLoading")}</div>}
        {step.botId && error && <div className="studio-help text-danger">{error}</div>}
      </Field>
      {step.botId && !options && !loading && !error && (
        <div className="studio-info">{t("studio.agent.skillsNoOptions")}</div>
      )}
      {step.botId && options && (Object.keys(SKILL_GROUPS) as StudioSkillGroup[]).map((group) => {
        const entries = options[group];
        const available = entries.filter((option) => option.available).map((option) => option.name);
        const selected = selection[group];
        const on = selected.length > 0;
        return (
          <div key={group} className="studio-field">
            <label className="studio-check">
              <input
                type="checkbox"
                checked={on}
                disabled={!on && available.length === 0}
                onChange={() => setGroup(group, on ? [] : available)}
              />
              <span className="min-w-0">
                <span className="block text-[11px] font-medium">{t(SKILL_GROUPS[group].label)}</span>
                <span className="block text-[10px] text-ink-tertiary">{t(SKILL_GROUPS[group].help)}</span>
              </span>
            </label>
            {on && available.length > 0 && (
              <>
                <label className="studio-check">
                  <input
                    type="checkbox"
                    checked={selected.length === available.length && available.every((name) => selected.includes(name))}
                    onChange={(event) => setGroup(group, event.target.checked ? available : [])}
                  />
                  <span className="text-[11px]">{t("studio.agent.skillsAll")}</span>
                </label>
                <div className="studio-check-list">
                  {entries.map((option) => (
                    <label key={option.name} className="studio-check">
                      <input
                        type="checkbox"
                        disabled={!option.available}
                        checked={selected.includes(option.name)}
                        onChange={() => setGroup(group, selected.includes(option.name)
                          ? selected.filter((name) => name !== option.name)
                          : [...selected, option.name])}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-[11px]">{option.label}</span>
                        <span className="block truncate text-[10px] text-ink-tertiary">
                          {option.available ? option.description : `${option.description} · ${t("studio.agent.skillsUnavailable")}`}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </>
            )}
            {group === "imported" && on && (
              <div className="studio-help">{t("studio.agent.skillsImportedWarning")}</div>
            )}
          </div>
        );
      })}
    </>
  );
}

function UploadRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="studio-upload" onClick={onClick}>
      <Upload size={16} aria-hidden="true" />
      <span>{label}</span>
      <span aria-hidden="true">+</span>
    </button>
  );
}

function DisconnectRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="studio-upload" onClick={onClick}>
      <X size={15} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

function InputsFields({ draft, step, earlier, consumed, onChange, onAdd }: {
  draft: StudioDraft;
  step: Extract<WorkflowStep, { kind: "bot" | "script" }>;
  earlier: WorkflowStep[];
  consumed: ReadonlySet<string>;
  onChange: (patch: Partial<WorkflowStep>) => void;
  onAdd: () => void;
}) {
  const channels = parameterChannels(step);
  const setParameter = (index: number, patch: Partial<WorkflowParameter>) => {
    const next = updateParameter(draft, step.id, index, patch);
    const updated = next.steps.find((candidate) => candidate.id === step.id);
    if (updated && updated.kind !== "condition" && updated.kind !== "loop") onChange({ parameters: updated.parameters } as Partial<WorkflowStep>);
  };
  const setOrigin = (index: number, origin: ParameterOrigin) => {
    const next = setParameterOrigin(draft, step.id, index, origin);
    const updated = next.steps.find((candidate) => candidate.id === step.id);
    if (updated && updated.kind !== "condition" && updated.kind !== "loop") onChange({ parameters: updated.parameters } as Partial<WorkflowStep>);
  };
  const problems = parameterProblems(step, earlier);

  return (
    <>
      <Section label={t("studio.inputs.documents")}>
        <FileLinks
          step={step}
          earlier={earlier}
          consumed={consumed}
          channels={channels}
          onChange={onChange}
        />
      </Section>
      <Section
        label={t("studio.inputs.parameters")}
        action={(
          <button type="button" className="studio-section-add" data-studio-field="parameters.add" onClick={onAdd}>
            + {t("studio.inputs.add")}
          </button>
        )}
      >
        {step.parameters.length === 0 ? (
          <div className="studio-empty-box">{t("studio.inputs.empty")}</div>
        ) : (
          <div className="studio-param-list">
            {step.parameters.map((parameter, index) => (
              <ParameterCard
                key={index}
                parameter={parameter}
                index={index}
                earlier={earlier}
                problems={problems.filter((problem) => problem.index === index)}
                onChange={(patch) => setParameter(index, patch)}
                onOrigin={(origin) => setOrigin(index, origin)}
                onRemove={() => {
                  const next = removeParameter(draft, step.id, index);
                  const updated = next.steps.find((candidate) => candidate.id === step.id);
                  if (updated && updated.kind !== "condition" && updated.kind !== "loop") onChange({ parameters: updated.parameters } as Partial<WorkflowStep>);
                }}
              />
            ))}
          </div>
        )}
        {step.parameters.some((parameter) => parameter.collectedBy === step.id) && (
          <div className="studio-help studio-param-note">{t("studio.manual.collected")}</div>
        )}
      </Section>
    </>
  );
}

function ParameterCard({ parameter, index, earlier, problems, onChange, onOrigin, onRemove }: {
  parameter: WorkflowParameter;
  index: number;
  earlier: WorkflowStep[];
  problems: ReturnType<typeof parameterProblems>;
  onChange: (patch: Partial<WorkflowParameter>) => void;
  onOrigin: (origin: ParameterOrigin) => void;
  onRemove: () => void;
}) {
  const origin = parameterOrigin(parameter);
  const nameProblem = problems.find((problem) => problem.field === "name");
  const valuesProblem = problems.find((problem) => problem.field === "values");
  const whenAbsentProblem = problems.find((problem) => problem.field === "whenAbsent");
  const fromProblem = problems.find((problem) => problem.field === "from");
  const sources = earlier.filter((candidate): candidate is Extract<WorkflowStep, { kind: "bot" | "script" }> => candidate.kind !== "condition" && candidate.kind !== "loop");
  const source = parameter.from === undefined ? undefined : sources.find((candidate) => candidate.id === parameter.from!.step);
  const sourceOutputs = source?.outputs.filter((output) => output.path.toLowerCase().endsWith(".json")) ?? [];
  const nameErrorId = `parameter-${index}-name-error`;

  return (
    <div className={cn("studio-param", nameProblem && "studio-param-invalid")}>
      <div className="studio-param-head">
        <input
          className={cn("studio-input font-mono", nameProblem && "studio-input-invalid")}
          data-studio-field={`parameters.${index}.name`}
          aria-label={t("studio.inputs.name")}
          aria-invalid={Boolean(nameProblem)}
          aria-describedby={nameProblem ? nameErrorId : undefined}
          value={parameter.name}
          placeholder="total"
          onChange={(event) => onChange({ name: event.target.value })}
        />
        <button type="button" className="studio-param-remove" aria-label={t("studio.inputs.remove", { name: parameter.name })} onClick={onRemove}>
          <X size={12} aria-hidden="true" />
        </button>
      </div>
      {nameProblem && <div className="studio-field-error" id={nameErrorId} role="alert">{t(nameProblem.key as LocaleKey)}</div>}

      <div className="studio-param-types">
        <Select
          className="w-full"
          size="sm"
          value={parameter.type}
          data-studio-field={`parameters.${index}.type`}
          aria-label={t("studio.inputs.type")}
          onChange={(event) => onChange({ type: event.target.value as WorkflowParameterType })}
        >
          {workflowParameterTypes.map((type) => <option key={type} value={type}>{t(PARAMETER_TYPES[type])}</option>)}
        </Select>
        <label className="studio-check studio-param-list">
          <input
            type="checkbox"
            checked={parameter.list}
            data-studio-field={`parameters.${index}.list`}
            onChange={(event) => onChange({ list: event.target.checked })}
          />
          <span className="text-[11px]">{t("studio.inputs.list")}</span>
        </label>
      </div>

      {parameter.type === "enum" && (
        <div className="studio-field">
          <div className="studio-label">{t("studio.inputs.values")}</div>
          <input
            className={cn("studio-input", valuesProblem && "studio-input-invalid")}
            data-studio-field={`parameters.${index}.values`}
            aria-invalid={Boolean(valuesProblem)}
            value={(parameter.values ?? []).join(", ")}
            placeholder="azul, verde"
            onChange={(event) => onChange({ values: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })}
          />
          <div className={cn("studio-help", valuesProblem && "studio-field-error")}>
            {valuesProblem ? t(valuesProblem.key as LocaleKey) : t("studio.inputs.valuesHelp")}
          </div>
        </div>
      )}

      <div className="studio-label">{t("studio.inputs.origin")}</div>
      <div className="studio-origin" role="group" aria-label={t("studio.inputs.origin")}>
        {ORIGINS.map((entry) => (
          <button
            key={entry.origin}
            type="button"
            className={cn("studio-origin-button", origin === entry.origin && "studio-origin-active")}
            aria-pressed={origin === entry.origin}
            data-studio-field={origin === entry.origin ? `parameters.${index}.origin` : undefined}
            onClick={() => onOrigin(entry.origin)}
          >
            {t(entry.label)}
          </button>
        ))}
      </div>
      {origin === "none" && <div className="studio-help">{t("studio.inputs.originNoneHelp")}</div>}
      {origin === "collected" && <div className="studio-help">{t("studio.inputs.originCollectedHelp")}</div>}

      {origin === "none" && (
        <>
          <label className="studio-check studio-param-required">
            <input
              type="checkbox"
              checked={parameter.required}
              data-studio-field={`parameters.${index}.required`}
              onChange={(event) => onChange({ required: event.target.checked })}
            />
            <span className="text-[11px]">{t("studio.inputs.required")}</span>
          </label>
          {!parameter.required && (
            <div className="studio-field">
              <div className="studio-label">{t("studio.inputs.whenAbsent")}</div>
              <input
                className={cn("studio-input font-mono", whenAbsentProblem && "studio-input-invalid")}
                data-studio-field={`parameters.${index}.whenAbsent`}
                aria-invalid={Boolean(whenAbsentProblem)}
                value={parameter.whenAbsent ?? ""}
                placeholder={t("studio.inputs.whenAbsentPlaceholder")}
                onChange={(event) => onChange({ whenAbsent: event.target.value })}
              />
              <div className={cn("studio-help", whenAbsentProblem && "studio-field-error")}>
                {whenAbsentProblem ? t(whenAbsentProblem.key as LocaleKey) : t("studio.inputs.whenAbsentHelp")}
              </div>
            </div>
          )}
        </>
      )}

      {origin === "from" && (
        <>
          <div className="studio-field">
            <div className="studio-label">{t("studio.inputs.fromStep")}</div>
            <Select
              className="w-full"
              size="sm"
              value={parameter.from?.step ?? ""}
              data-studio-field={`parameters.${index}.from.step`}
              onChange={(event) => {
                const next = sources.find((candidate) => candidate.id === event.target.value);
                const output = next?.outputs.find((candidate) => candidate.path.toLowerCase().endsWith(".json"));
                onChange({ from: { step: event.target.value, output: output?.path ?? "", field: parameter.from?.field ?? "" } });
              }}
            >
              <option value="">{t("studio.inputs.pickStep")}</option>
              {sources.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
            </Select>
            {sources.length === 0 && <div className="studio-help">{t("studio.inputs.noEarlierStep")}</div>}
          </div>
          <div className="studio-field">
            <div className="studio-label">{t("studio.inputs.fromOutput")}</div>
            <Select
              className="w-full"
              size="sm"
              value={parameter.from?.output ?? ""}
              disabled={sourceOutputs.length === 0}
              data-studio-field={`parameters.${index}.from.output`}
              onChange={(event) => onChange({ from: { step: parameter.from?.step ?? "", output: event.target.value, field: parameter.from?.field ?? "" } })}
            >
              <option value="">{t("studio.inputs.pickOutput")}</option>
              {sourceOutputs.map((output) => <option key={output.path} value={output.path}>{output.path}</option>)}
            </Select>
            {source !== undefined && sourceOutputs.length === 0 && <div className="studio-help">{t("studio.inputs.noJsonOutputs")}</div>}
          </div>
          <div className="studio-field">
            <div className="studio-label">{t("studio.inputs.fromField")}</div>
            <input
              className={cn("studio-input font-mono", fromProblem && "studio-input-invalid")}
              data-studio-field={`parameters.${index}.from.field`}
              aria-invalid={Boolean(fromProblem)}
              value={parameter.from?.field ?? ""}
              placeholder={t("studio.inputs.fromFieldPlaceholder")}
              onChange={(event) => onChange({ from: { step: parameter.from?.step ?? "", output: parameter.from?.output ?? "", field: event.target.value } })}
            />
          </div>
          {fromProblem && <div className="studio-field-error" role="alert">{t(fromProblem.key as LocaleKey)}</div>}
        </>
      )}
    </div>
  );
}

function ModulesFields({ draft, step, environment, preparing, onPrepare, onChange }: {
  draft: StudioDraft;
  step: Extract<WorkflowStep, { kind: "script" }>;
  environment?: BalloonEnvironment;
  preparing?: boolean;
  onPrepare?: () => void;
  onChange: (modules: WorkflowModule[]) => void;
}) {
  const problems = moduleProblems(step.modules);
  const add = () => {
    const next = addModule(draft, step.id);
    const updated = next.draft.steps.find((candidate) => candidate.id === step.id);
    if (updated && updated.kind === "script") onChange(updated.modules);
  };
  const edit = (index: number, patch: Partial<WorkflowModule>) => {
    const next = updateModule(draft, step.id, index, patch);
    const updated = next.steps.find((candidate) => candidate.id === step.id);
    if (updated && updated.kind === "script") onChange(updated.modules);
  };
  const remove = (index: number) => {
    const next = removeModule(draft, step.id, index);
    const updated = next.steps.find((candidate) => candidate.id === step.id);
    if (updated && updated.kind === "script") onChange(updated.modules);
  };
  const declaresPackage = step.modules.some((module) => module.runtime !== "bin");

  return (
    <Field label={t("studio.script.modules")} help={t("studio.script.modulesHelp")}>
      <div className="studio-modules" data-studio-field="modules">
        {step.modules.map((module, index) => {
          const nameProblem = problems.find((problem) => problem.index === index && problem.field === "name");
          const versionProblem = problems.find((problem) => problem.index === index && problem.field === "version");
          return (
            <div key={index} className="studio-module">
              <div className="studio-module-row">
                <input
                  className={cn("studio-input font-mono", nameProblem && "studio-input-invalid")}
                  data-studio-field={`modules.${index}.name`}
                  aria-label={t("studio.modules.name")}
                  aria-invalid={Boolean(nameProblem)}
                  value={module.name}
                  placeholder="yt-dlp"
                  onChange={(event) => edit(index, { name: event.target.value })}
                />
                <Select
                  className="w-full"
                  size="sm"
                  value={module.runtime}
                  data-studio-field={`modules.${index}.runtime`}
                  aria-label={t("studio.modules.runtime")}
                  onChange={(event) => edit(index, { runtime: event.target.value as WorkflowModuleRuntime })}
                >
                  {workflowModuleRuntimes.map((runtime) => (
                    <option key={runtime} value={runtime}>{t(MODULE_RUNTIMES[runtime])}</option>
                  ))}
                </Select>
                <input
                  className={cn("studio-input font-mono", versionProblem && "studio-input-invalid")}
                  data-studio-field={`modules.${index}.version`}
                  aria-label={t("studio.modules.version")}
                  aria-invalid={Boolean(versionProblem)}
                  value={module.version ?? ""}
                  placeholder={t("studio.modules.versionPlaceholder")}
                  disabled={module.runtime === "bin"}
                  onChange={(event) => edit(index, { version: event.target.value.trim() === "" ? undefined : event.target.value })}
                />
                <button type="button" className="studio-param-remove" aria-label={t("studio.modules.remove", { name: module.name })} onClick={() => remove(index)}>
                  <X size={12} aria-hidden="true" />
                </button>
              </div>
              {(nameProblem || versionProblem) && (
                <div className="studio-field-error" role="alert">
                  {t((nameProblem ?? versionProblem)!.key as LocaleKey)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button type="button" className="studio-section-add studio-module-add" data-studio-field="modules.add" onClick={add}>
        + {t("studio.modules.add")}
      </button>
      {declaresPackage && (
        <EnvironmentBadge environment={environment} preparing={preparing} onPrepare={onPrepare} />
      )}
    </Field>
  );
}

function EnvironmentBadge({ environment, preparing, onPrepare }: {
  environment?: BalloonEnvironment;
  preparing?: boolean;
  onPrepare?: () => void;
}) {
  if (preparing) {
    return (
      <div className="studio-env studio-env-amber studio-env-pulse" role="status">
        <span className="studio-env-dot" aria-hidden="true" />
        <span>{t("studio.env.preparing")}</span>
      </div>
    );
  }
  if (environment === undefined) return null;
  const ready = environment.prepared && !environment.stale;
  return (
    <div className={cn("studio-env", ready ? "studio-env-green" : "studio-env-amber")} role="status">
      <span className="studio-env-dot" aria-hidden="true" />
      <span>
        {environment.prepared
          ? environment.stale
            ? (environment.changed === 1 ? t("studio.env.changedOne") : t("studio.env.changed", { count: environment.changed }))
            : t("studio.env.preparedAt", { date: formatPreparedAt(environment.preparedAt ?? Date.now()) })
          : t("studio.env.notPrepared")}
      </span>
      {!ready && onPrepare && (
        <button type="button" className="studio-env-action" onClick={onPrepare}>
          {t("studio.env.prepare")}
        </button>
      )}
    </div>
  );
}

function OutputList({ outputs, consumed, stepId, onChange }: {
  outputs: StepOutput[];
  consumed: ReadonlySet<string>;
  stepId: string;
  onChange: (next: StepOutput[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const add = (path: string) => {
    const clean = path.trim();
    if (!clean || outputs.some((output) => output.path === clean)) return;
    onChange([...outputs, { path: clean, required: true }]);
  };
  const patch = (index: number, next: Partial<StepOutput>) => {
    onChange(outputs.map((output, position) => position === index ? { ...output, ...next } : output));
  };
  const remove = (index: number) => {
    if (outputs.length <= 1) return;
    onChange(outputs.filter((_output, position) => position !== index));
  };
  return (
    <Field label={t("studio.script.outputFiles")} help={t("studio.script.outputHelp")}>
      <div className="studio-output-list">
        {outputs.map((output, index) => (
          <OutputRow
            key={index}
            output={output}
            index={index}
            canRemove={outputs.length > 1}
            consumed={consumed.has(`${stepId}\u0000${output.path}`)}
            onPatch={(next) => patch(index, next)}
            onRemove={() => remove(index)}
          />
        ))}
      </div>
      <div className="studio-add-row">
        <input ref={inputRef} className="studio-input" placeholder={t("studio.script.addOutput")} onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          add(event.currentTarget.value);
          event.currentTarget.value = "";
        }} />
        <button type="button" className="studio-add" onClick={() => {
          if (!inputRef.current) return;
          add(inputRef.current.value);
          inputRef.current.value = "";
        }}>+</button>
      </div>
    </Field>
  );
}

function OutputRow({ output, index, canRemove, consumed, onPatch, onRemove }: {
  output: StepOutput;
  index: number;
  canRemove: boolean;
  consumed: boolean;
  onPatch: (patch: Partial<StepOutput>) => void;
  onRemove: () => void;
}) {
  const suggestion = suggestOutputPath(output.path);
  const isJson = output.path.toLowerCase().endsWith(".json");
  const [shapeOpen, setShapeOpen] = useState(isJson);
  useEffect(() => {
    if (isJson) setShapeOpen(true);
  }, [isJson]);
  const errorId = `output-${index}-error`;

  return (
    <div className={cn("studio-output", suggestion && "studio-output-warning")}>
      <div className="studio-output-row">
        <input
          className={cn("studio-input font-mono", suggestion && "studio-input-warning")}
          data-studio-field={`outputs.${index}.path`}
          aria-label={t("studio.script.outputFiles")}
          aria-invalid={Boolean(suggestion)}
          aria-describedby={suggestion ? errorId : undefined}
          value={output.path}
          onChange={(event) => onPatch({ path: event.target.value })}
        />
        <label className="studio-check studio-output-required">
          <input
            type="checkbox"
            checked={output.required}
            data-studio-field={`outputs.${index}.required`}
            onChange={(event) => onPatch({ required: event.target.checked })}
          />
          <span className="text-[11px]">{t("studio.outputs.required")}</span>
        </label>
        <button type="button" className="studio-param-remove" aria-label={t("studio.script.removeOutput", { name: output.path })} disabled={!canRemove} onClick={onRemove}>
          <X size={12} aria-hidden="true" />
        </button>
      </div>
      {suggestion && (
        <div className="studio-field-error" id={errorId}>
          {t("studio.outputs.needExtension", { name: output.path })}{" "}
          <button type="button" className="studio-suggestion" onClick={() => onPatch({ path: suggestion })}>
            {suggestion}
          </button>
        </div>
      )}
      {isJson && consumed && output.shape === undefined && (
        <div className="studio-field-warning">
          <AlertTriangle size={11} aria-hidden="true" /> {t("studio.outputs.shapeMissing")}
        </div>
      )}
      {isJson && (
        <details className="studio-shape" open={shapeOpen} onToggle={(event) => setShapeOpen(event.currentTarget.open)}>
          <summary className="studio-shape-summary">
            <ChevronRight size={12} aria-hidden="true" />
            {t("studio.script.shape", { name: output.path })}
          </summary>
          <ShapeEditor
            shape={output.shape}
            onChange={(shape) => onPatch(shape === undefined ? { shape: undefined } : { shape })}
          />
        </details>
      )}
    </div>
  );
}

/** A `.json` output's shape: JSON Schema, kept as text until it parses. */
function ShapeEditor({ shape, onChange }: {
  shape: Record<string, unknown> | undefined;
  onChange: (shape: Record<string, unknown> | undefined) => void;
}) {
  const [text, setText] = useState(shape === undefined ? "" : JSON.stringify(shape, null, 2));
  const [invalid, setInvalid] = useState(false);
  return (
    <>
      <textarea
        className="studio-input studio-code"
        value={text}
        placeholder={t("studio.script.shapePlaceholder")}
        spellCheck={false}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          if (!next.trim()) {
            setInvalid(false);
            onChange(undefined);
            return;
          }
          try {
            const parsed: unknown = JSON.parse(next);
            if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
              setInvalid(true);
              return;
            }
            setInvalid(false);
            onChange(parsed as Record<string, unknown>);
          } catch {
            setInvalid(true);
          }
        }}
      />
      <div className="studio-help">{invalid ? t("studio.script.shapeInvalid") : t("studio.script.shapeHelp")}</div>
    </>
  );
}

function LegacyResultRow({ onRemove }: { onRemove: () => void }) {
  return (
    <div className="studio-field" data-studio-field="legacy">
      <div className="studio-help">{t("studio.legacy.result")}</div>
      <DisconnectRow label={t("studio.legacy.remove")} onClick={onRemove} />
    </div>
  );
}

function LegacyBranchRow({ onRemove }: { onRemove: () => void }) {
  return (
    <div className="studio-field" data-studio-field="legacy">
      <div className="studio-help">{t("studio.legacy.when")}</div>
      <DisconnectRow label={t("studio.legacy.remove")} onClick={onRemove} />
    </div>
  );
}

function LegacyRequireRow({ onRemove }: { onRemove: () => void }) {
  return (
    <div className="studio-field" data-studio-field="legacy">
      <div className="studio-help">{t("studio.legacy.require")}</div>
      <DisconnectRow label={t("studio.legacy.remove")} onClick={onRemove} />
    </div>
  );
}

function FileLinks({ step, earlier, consumed, channels, onChange }: {
  step: Extract<WorkflowStep, { kind: "bot" | "script" }>;
  earlier: WorkflowStep[];
  consumed: ReadonlySet<string>;
  channels: Map<string, string>;
  onChange: (patch: Partial<WorkflowStep>) => void;
}) {
  const rows = earlier.flatMap((source) => outputsOf(source).map((output) => ({ source, output })));
  const linked = (sourceId: string, path: string) => step.inputs.some((input) => input.from.step === sourceId && input.from.output === path && input.as === path);
  const toggle = (sourceId: string, path: string) => {
    const exists = linked(sourceId, path);
    const inputs = exists
      ? step.inputs.filter((input) => !(input.from.step === sourceId && input.from.output === path))
      : [...step.inputs.filter((input) => input.as !== path), { as: path, from: { step: sourceId, output: path } }];
    onChange({ inputs } as Partial<WorkflowStep>);
  };
  if (rows.length === 0) {
    return <div className="studio-info">{t("studio.agent.noInputs")}</div>;
  }
  return (
    <div className="studio-check-list studio-doc-list">
      {rows.map(({ source, output }) => {
        const channel = channels.get(`${source.id}\u0000${output.path}`);
        const shapeWarning = consumed.has(`${source.id}\u0000${output.path}`)
          && output.path.toLowerCase().endsWith(".json")
          && output.shape === undefined;
        return (
          <label
            key={`${source.id}:${output.path}`}
            className={cn("studio-check", channel !== undefined && "studio-check-disabled")}
            title={channel !== undefined ? t("studio.inputs.channelConflictTooltip") : undefined}
          >
            <input type="checkbox" disabled={channel !== undefined} checked={linked(source.id, output.path)} onChange={() => toggle(source.id, output.path)} />
            {channel !== undefined && <Ban size={12} className="studio-check-ban" aria-hidden="true" />}
            <span className="min-w-0">
              <span className="block truncate font-mono text-[11px]">{output.path}</span>
              <span className="block truncate text-[10px] text-ink-tertiary">
                {t("studio.inputs.fromStepLabel", { index: earlier.indexOf(source) + 1, name: source.name })}
              </span>
              {channel !== undefined && (
                <span className="studio-check-reason">{t("studio.inputs.channelConflict", { name: channel })}</span>
              )}
              {channel === undefined && shapeWarning && (
                <span className="studio-check-warning">{t("studio.outputs.shapeMissing")}</span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}

const conditionFamily = (op: ConditionOp) =>
  op === "exists" ? "exists" : op === "contains" ? "contains" : op === "equals" || op === "not_equals" ? "equals" : "compare";

const conditionFamilyOps = (family: string): ConditionOp[] =>
  family === "compare" ? ["gt", "gte", "lt", "lte"] : family === "equals" ? ["equals", "not_equals"] : family === "contains" ? ["contains"] : ["exists"];

function ConditionFields({ match, conditions, onChange }: {
  match: ConditionMatch;
  conditions: readonly ConditionLine[];
  onChange: (patch: { conditions?: ConditionLine[]; match?: ConditionMatch }) => void;
}) {
  const setLine = (index: number, patch: Partial<ConditionLine>) => {
    onChange({ conditions: conditions.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line) });
  };
  const setFamily = (index: number, next: string) => {
    const op: ConditionOp = next === "compare" ? "gt" : next === "equals" ? "equals" : next === "contains" ? "contains" : "exists";
    setLine(index, { op, value: nextConditionValue(op) });
  };
  const setValue = (index: number, op: ConditionOp, text: string) => {
    if (op === "gt" || op === "gte" || op === "lt" || op === "lte") {
      setLine(index, { value: Number(text) });
      return;
    }
    if (op === "contains") {
      setLine(index, { value: text });
      return;
    }
    try {
      setLine(index, { value: JSON.parse(text) });
    } catch {
      setLine(index, { value: text });
    }
  };
  const add = () => {
    if (conditions.length >= WORKFLOW_CONDITION_ROWS_MAX) return;
    onChange({ conditions: [...conditions, { field: "ok", op: "equals", value: true }] });
  };
  const remove = (index: number) => {
    onChange({ conditions: conditions.filter((_line, lineIndex) => lineIndex !== index) });
  };
  return (
    <>
      <Field label={t("studio.condition.match")} help={t("studio.condition.matchHelp")}>
        <Select className="w-full" size="sm" value={match} onChange={(event) => onChange({ match: event.target.value as ConditionMatch })}>
          <option value="all">{t("studio.condition.all")}</option>
          <option value="any">{t("studio.condition.any")}</option>
        </Select>
      </Field>
      <div className="studio-condition-lines" data-studio-field="conditions">
        {conditions.map((line, index) => {
          const family = conditionFamily(line.op);
          const valueText = line.value === undefined ? "" : typeof line.value === "string" ? line.value : JSON.stringify(line.value);
          return (
            <div key={index} className="studio-condition-line">
              <div className="studio-condition-head">
                <span className="studio-condition-label">{t("studio.condition.line", { index: index + 1 })}</span>
                <button
                  type="button"
                  className="studio-condition-remove"
                  aria-label={t("studio.condition.remove", { index: index + 1 })}
                  disabled={conditions.length <= 1}
                  onClick={() => remove(index)}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </div>
              <Field label={t("studio.condition.field")} help={t("studio.condition.fieldHelp")}>
                <input className="studio-input" value={line.field} onChange={(event) => setLine(index, { field: event.target.value })} />
              </Field>
              <Field label={t("studio.condition.type")}>
                <Select className="w-full" size="sm" value={family} onChange={(event) => setFamily(index, event.target.value)}>
                  <option value="compare">{t("studio.condition.compare")}</option>
                  <option value="equals">{t("studio.condition.equals")}</option>
                  <option value="exists">{t("studio.condition.exists")}</option>
                  <option value="contains">{t("studio.condition.contains")}</option>
                </Select>
              </Field>
              {family !== "exists" && family !== "contains" && (
                <Field label={t("studio.condition.operator")}>
                  <Select className="w-full" size="sm" value={line.op} onChange={(event) => setLine(index, { op: event.target.value as ConditionOp })}>
                    {conditionFamilyOps(family).map((op) => <option key={op} value={op}>{t(conditionOpLabel[op])}</option>)}
                  </Select>
                </Field>
              )}
              {line.op !== "exists" && (
                <Field label={t("studio.condition.value")} help={t("studio.condition.valueHelp")}>
                  <input className={cn("studio-input", line.op === "contains" && "font-mono")} value={valueText} onChange={(event) => setValue(index, line.op, event.target.value)} />
                </Field>
              )}
            </div>
          );
        })}
      </div>
      <button type="button" className="studio-condition-add" disabled={conditions.length >= WORKFLOW_CONDITION_ROWS_MAX} onClick={add}>
        {t("studio.condition.add")}
      </button>
    </>
  );
}

function LoopConditionFields({ step, onChange }: {
  step: Extract<WorkflowStep, { kind: "loop" }>;
  onChange: (patch: Partial<WorkflowStep>) => void;
}) {
  const sources = step.body.filter((candidate): candidate is Exclude<WorkflowStep, { kind: "condition" | "loop" }> =>
    candidate.kind !== "condition");
  const source = sources.find((candidate) => candidate.id === step.from.step);
  const sourceOutputs = source ? source.outputs : [];
  const declared = step.body.flatMap((bodyStep): Array<StepOutput & { stepName: string }> =>
    bodyStep.kind === "condition" ? [] : bodyStep.outputs.map((output) => ({ ...output, stepName: bodyStep.name })));
  const toggleOutput = (output: StepOutput) => {
    const exists = step.outputs.some((candidate) => candidate.path === output.path);
    const outputs = exists
      ? step.outputs.filter((candidate) => candidate.path !== output.path)
      : [...step.outputs, { path: output.path, required: output.required }];
    onChange({ outputs } as Partial<WorkflowStep>);
  };
  return (
    <>
      <Field label={t("studio.loop.from")} help={t("studio.loop.fromHelp")}>
        <Select
          className="w-full"
          size="sm"
          value={step.from.step}
          onChange={(event) => {
            const next = sources.find((candidate) => candidate.id === event.target.value);
            const output = next?.outputs.find((candidate) => candidate.shape !== undefined)
              ?? next?.outputs.find((candidate) => candidate.path.toLowerCase().endsWith(".json"));
            onChange({ from: { step: event.target.value, output: output?.path ?? "" } } as Partial<WorkflowStep>);
          }}
        >
          <option value="">{t("studio.loop.pickFrom")}</option>
          {sources.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
        </Select>
        {sources.length === 0 && <div className="studio-help">{t("studio.loop.noFrom")}</div>}
      </Field>
      <Field label={t("studio.loop.fromOutput")} help={t("studio.loop.fromOutputHelp")}>
        <Select
          className="w-full"
          size="sm"
          value={step.from.output}
          disabled={sourceOutputs.length === 0}
          onChange={(event) => onChange({ from: { ...step.from, output: event.target.value } } as Partial<WorkflowStep>)}
        >
          <option value="">{t("studio.loop.pickOutput")}</option>
          {sourceOutputs.map((output) => <option key={output.path} value={output.path}>{output.path}</option>)}
        </Select>
      </Field>
      <ConditionFields
        match={step.match}
        conditions={step.conditions}
        onChange={(patch) => onChange(patch as Partial<WorkflowStep>)}
      />
      <Field label={t("studio.loop.maxIterations")} help={t("studio.loop.maxHelp")}>
        <input
          type="number"
          min={1}
          step={1}
          className="studio-input"
          value={step.maxIterations}
          onChange={(event) => onChange({ maxIterations: Math.max(1, Math.trunc(Number(event.target.value) || 1)) } as Partial<WorkflowStep>)}
        />
      </Field>
      <Field label={t("studio.loop.outputs")} help={t("studio.loop.outputsHelp")}>
        {declared.length === 0 ? <div className="studio-info">{t("studio.loop.noOutputs")}</div> : (
          <div className="studio-check-list">
            {declared.map((output) => (
              <label key={`${output.stepName}:${output.path}`} className="studio-check">
                <input
                  type="checkbox"
                  checked={step.outputs.some((candidate) => candidate.path === output.path)}
                  onChange={() => toggleOutput(output)}
                />
                <span className="min-w-0">
                  <span className="block truncate font-mono text-[11px]">{output.path}</span>
                  <span className="block truncate text-[10px] text-ink-tertiary">{output.stepName}</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </Field>

    </>
  );
}
