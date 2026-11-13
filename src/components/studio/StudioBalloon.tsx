import { useMemo, useRef, type ReactNode } from "react";
import { Check, Upload, X } from "lucide-react";

import {
  WORKFLOW_CONDITION_ROWS_MAX,
  type ConditionLine,
  type ConditionMatch,
  type ConditionOp,
  type StepOutput,
  type WorkflowSkillOptions,
  type WorkflowStep,
} from "../../../shared/workflow";
import type { LocaleKey } from "@/locales";
import { Select } from "@/components/Select";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import type { BranchKey } from "./StudioCard";
import {
  conditionOpLabel, nextConditionValue, outputsOf, scriptLanguageOf, scriptNameForLanguage, skillSelection, skillsWithGroup,
  type StudioBranch, type StudioDraft, type StudioSkillGroup,
} from "./studio-model";

const MAX_PREVIEW = 512_000;

const READ = { instructions: [".txt", ".md", ".json"], context: [".txt", ".md", ".json", ".csv"], script: [".js", ".mjs", ".ts", ".py", ".txt"] };

const BRANCH_TITLE: Record<BranchKey, LocaleKey> = {
  instructions: "studio.branch.instructions",
  context: "studio.branch.context",
  tools: "studio.branch.tools",
  skills: "studio.branch.skills",
  return: "studio.branch.return",
  run: "studio.branch.run",
  input: "studio.branch.input",
  output: "studio.branch.output",
  script: "studio.branch.script",
  condition: "studio.branch.condition",
  true: "studio.branch.true",
  false: "studio.branch.false",
  failure: "studio.branch.failure",
  timeout: "studio.branch.timeout",
};

export interface BalloonBot { id: string; name: string; section?: string }

export function StudioBalloon({ draft, step, branch, anchor, bots, scripts, skillOptions, skillOptionsLoading, skillOptionsError, onChange, onScript, onRenameScript, onToast, onDisconnect, onClose }: {
  draft: StudioDraft;
  step: WorkflowStep;
  branch: BranchKey;
  anchor: DOMRect;
  bots: readonly BalloonBot[];
  scripts: Record<string, string>;
  skillOptions?: WorkflowSkillOptions;
  skillOptionsLoading?: boolean;
  skillOptionsError?: string;
  onChange: (patch: Partial<WorkflowStep>) => void;
  onScript: (name: string, content: string) => void;
  onRenameScript: (from: string, to: string) => void;
  onToast: (key: LocaleKey) => void;
  onDisconnect: (branch: StudioBranch) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const index = draft.steps.findIndex((candidate) => candidate.id === step.id);
  const nameOf = (id: string) => draft.steps.find((candidate) => candidate.id === id)?.name ?? id;
  const outputs = outputsOf(step);
  const width = 338;
  const left = Math.min(Math.max(12, anchor.left + anchor.width / 2 - width / 2), window.innerWidth - width - 12);
  const above = anchor.top > 430;
  const title = t(BRANCH_TITLE[branch]);
  const subtitle = t("studio.balloon.subtitle", { name: step.name, branch: title });

  const earlier = useMemo(() => draft.steps.slice(0, index).filter((candidate) => candidate.kind !== "condition"), [draft.steps, index]);

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

  const addOutput = (path: string) => {
    const clean = path.trim();
    if (!clean || outputs.some((output) => output.path === clean)) return;
    onChange({ outputs: [...outputs, { path: clean, required: true }] } as Partial<WorkflowStep>);
  };

  const removeOutput = (path: string) => {
    if (outputs.length <= 1) return;
    const next = outputs.filter((output) => output.path !== path);
    const result = step.kind !== "condition" && step.result === path ? next[0]?.path : undefined;
    onChange({ outputs: next, ...(result ? { result } : {}) } as Partial<WorkflowStep>);
  };

  return (
    <div
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
              <Select className="w-full" size="sm" value={step.botId} onChange={(event) => onChange({ botId: event.target.value })}>
                <option value="">{t("studio.agent.pickBot")}</option>
                {bots.map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}
              </Select>
            </Field>
            <Field label={t("studio.agent.instructions")} help={t("studio.agent.instructionsHelp")}>
              <textarea
                className="studio-input studio-textarea"
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
          <FileLinks step={step} earlier={earlier} onChange={onChange} help={t("studio.agent.contextHelp")} label={t("studio.agent.context")} />
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
            <OutputList outputs={outputs} onAdd={addOutput} onRemove={removeOutput} />
            <Field label={t("studio.agent.return")} help={t("studio.agent.returnHelp")}>
              <Select
                className="w-full"
                size="sm"
                value={step.result ?? ""}
                onChange={(event) => onChange({ result: event.target.value || undefined } as Partial<WorkflowStep>)}
              >
                <option value="">{t("studio.agent.resultNone")}</option>
                {outputs.map((output) => <option key={output.path} value={output.path}>{output.path}</option>)}
              </Select>
            </Field>
          </>
        )}

        {step.kind === "script" && branch === "input" && (
          <FileLinks step={step} earlier={earlier} onChange={onChange} help={t("studio.script.inputHelp")} label={t("studio.script.input")} />
        )}

        {step.kind === "script" && branch === "output" && (
          <>
            <OutputList outputs={outputs} onAdd={addOutput} onRemove={removeOutput} />
            <Field label={t("studio.script.output")} help={t("studio.script.outputHelp")}>
              <Select
                className="w-full"
                size="sm"
                value={step.result ?? ""}
                onChange={(event) => onChange({ result: event.target.value || undefined } as Partial<WorkflowStep>)}
              >
                <option value="">{t("studio.agent.resultNone")}</option>
                {outputs.map((output) => <option key={output.path} value={output.path}>{output.path}</option>)}
              </Select>
            </Field>
          </>
        )}

        {step.kind === "script" && branch === "script" && (
          <>
            <Field label={t("studio.script.language")}>
              <Select
                className="w-full"
                size="sm"
                value={scriptLanguageOf(step.run)}
                onChange={(event) => {
                  const next = scriptNameForLanguage(step.run, event.target.value as "javascript" | "typescript" | "python");
                  if (next === step.run) return;
                  onRenameScript(step.run, next);
                  onChange({ run: next } as Partial<WorkflowStep>);
                }}
              >
                <option value="javascript">JavaScript</option>
                <option value="typescript">TypeScript</option>
                <option value="python">Python</option>
              </Select>
            </Field>
            <Field label={t("studio.script.code")} help={t("studio.script.codeHelp")}>
              <textarea
                className="studio-input studio-code"
                value={scripts[step.run] ?? ""}
                onChange={(event) => onScript(step.run, event.target.value)}
                spellCheck={false}
              />
              <UploadRow label={t("studio.script.load")} onClick={() => inputRef.current?.click()} />
              <input ref={inputRef} type="file" accept=".js,.mjs,.ts,.py,.txt" className="hidden" onChange={() => void readFile(READ.script, (text) => onScript(step.run, text))} />
            </Field>
            <Field label={t("studio.script.timeout")}>
              <input
                type="number"
                min={1}
                max={300}
                className="studio-input"
                value={Math.round(step.timeoutMs / 1000)}
                onChange={(event) => onChange({ timeoutMs: Math.max(1, Math.min(300, Number(event.target.value) || 1)) * 1000 } as Partial<WorkflowStep>)}
              />
            </Field>
          </>
        )}

        {step.kind === "condition" && branch === "condition" && (
          <ConditionFields
            match={step.match}
            conditions={step.conditions}
            onChange={(patch) => onChange(patch as Partial<WorkflowStep>)}
          />
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
            {(step.kind === "bot" || step.kind === "script") && (
              <Field label={t("studio.step.mode")} help={t("studio.step.modeHelp")}>
                <Select
                  className="w-full"
                  size="sm"
                  value={step.mode}
                  onChange={(event) => onChange({ mode: event.target.value as "auto" | "manual" } as Partial<WorkflowStep>)}
                >
                  <option value="auto">{t("studio.step.modeAuto")}</option>
                  <option value="manual">{t("studio.step.modeManual")}</option>
                </Select>
              </Field>
            )}
            {step.kind === "bot" && (
              <Field label={t("studio.agent.timeout")} help={t("studio.agent.timeoutHelp")}>
                <input
                  type="number"
                  min={0}
                  max={3_600}
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

function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <div className="studio-field">
      <div className="studio-label">{label}</div>
      {children}
      {help && <div className="studio-help">{help}</div>}
    </div>
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

function OutputList({ outputs, onAdd, onRemove }: {
  outputs: Array<{ path: string; required: boolean }>;
  onAdd: (path: string) => void;
  onRemove: (path: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <Field label={t("studio.script.outputFiles")} help={t("studio.script.outputHelp")}>
      <div className="studio-chips">
        {outputs.map((output) => (
          <span key={output.path} className="studio-chip">
            <span className="font-mono">{output.path}</span>
            <button type="button" aria-label={t("studio.script.removeOutput", { name: output.path })} disabled={outputs.length <= 1} onClick={() => onRemove(output.path)}>
              <X size={11} aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>
      <div className="studio-add-row">
        <input ref={inputRef} className="studio-input" placeholder={t("studio.script.addOutput")} onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          onAdd(event.currentTarget.value);
          event.currentTarget.value = "";
        }} />
        <button type="button" className="studio-add" onClick={() => {
          if (!inputRef.current) return;
          onAdd(inputRef.current.value);
          inputRef.current.value = "";
        }}>+</button>
      </div>
    </Field>
  );
}

function FileLinks({ step, earlier, onChange, help, label }: {
  step: Extract<WorkflowStep, { kind: "bot" | "script" }>;
  earlier: WorkflowStep[];
  onChange: (patch: Partial<WorkflowStep>) => void;
  help: string;
  label: string;
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
  return (
    <Field label={label} help={help}>
      {rows.length === 0 ? <div className="studio-info">{t("studio.agent.noInputs")}</div> : (
        <div className="studio-check-list">
          {rows.map(({ source, output }) => (
            <label key={`${source.id}:${output.path}`} className="studio-check">
              <input type="checkbox" checked={linked(source.id, output.path)} onChange={() => toggle(source.id, output.path)} />
              <span className="min-w-0">
                <span className="block truncate font-mono text-[11px]">{output.path}</span>
                <span className="block truncate text-[10px] text-ink-tertiary">{source.name}</span>
              </span>
            </label>
          ))}
        </div>
      )}
    </Field>
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
      <div className="studio-condition-lines">
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
    candidate.kind !== "condition" && candidate.result !== undefined);
  const declared = step.body.flatMap((bodyStep): Array<StepOutput & { stepName: string }> =>
    bodyStep.kind === "condition" ? [] : bodyStep.outputs.map((output) => ({ ...output, stepName: bodyStep.name })));
  const toggleOutput = (output: StepOutput) => {
    const exists = step.outputs.some((candidate) => candidate.path === output.path);
    const outputs = exists
      ? step.outputs.filter((candidate) => candidate.path !== output.path)
      : [...step.outputs, { path: output.path, required: output.required }];
    onChange({
      outputs,
      ...(step.result !== undefined && !outputs.some((candidate) => candidate.path === step.result) ? { result: undefined } : {}),
    } as Partial<WorkflowStep>);
  };
  return (
    <>
      <Field label={t("studio.loop.from")} help={t("studio.loop.fromHelp")}>
        <Select className="w-full" size="sm" value={step.from} onChange={(event) => onChange({ from: event.target.value } as Partial<WorkflowStep>)}>
          <option value="">{t("studio.loop.pickFrom")}</option>
          {sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
        </Select>
        {sources.length === 0 && <div className="studio-help">{t("studio.loop.noFrom")}</div>}
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
      <Field label={t("studio.loop.result")} help={t("studio.loop.resultHelp")}>
        <Select
          className="w-full"
          size="sm"
          value={step.result ?? ""}
          onChange={(event) => onChange({ result: event.target.value || undefined } as Partial<WorkflowStep>)}
        >
          <option value="">{t("studio.agent.resultNone")}</option>
          {step.outputs.map((output) => <option key={output.path} value={output.path}>{output.path}</option>)}
        </Select>
      </Field>
    </>
  );
}

