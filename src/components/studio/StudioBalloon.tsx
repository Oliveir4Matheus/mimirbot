import { useMemo, useRef, type ReactNode } from "react";
import { Check, Upload, X } from "lucide-react";

import type { ConditionOp, WorkflowStep } from "../../../shared/workflow";
import type { LocaleKey } from "@/locales";
import { Select } from "@/components/Select";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import type { BranchKey } from "./StudioCard";
import { conditionOpLabel, nextConditionValue, outputsOf, type StudioDraft } from "./studio-model";

const MAX_PREVIEW = 512_000;

const READ = { instructions: [".txt", ".md", ".json"], context: [".txt", ".md", ".json", ".csv"], script: [".js", ".mjs", ".txt"] };

const BRANCH_TITLE: Record<BranchKey, LocaleKey> = {
  instructions: "studio.branch.instructions",
  context: "studio.branch.context",
  tools: "studio.branch.tools",
  return: "studio.branch.return",
  run: "studio.branch.run",
  input: "studio.branch.input",
  output: "studio.branch.output",
  script: "studio.branch.script",
  condition: "studio.branch.condition",
  true: "studio.branch.true",
  false: "studio.branch.false",
};

export interface BalloonBot { id: string; name: string; section?: string }

export function StudioBalloon({ draft, step, branch, anchor, bots, scripts, onChange, onScript, onToast, onClose }: {
  draft: StudioDraft;
  step: WorkflowStep;
  branch: BranchKey;
  anchor: DOMRect;
  bots: readonly BalloonBot[];
  scripts: Record<string, string>;
  onChange: (patch: Partial<WorkflowStep>) => void;
  onScript: (name: string, content: string) => void;
  onToast: (key: LocaleKey) => void;
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
              <Select className="w-full" size="sm" value="javascript" disabled>
                <option value="javascript">JavaScript</option>
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
          <ConditionFields step={step} onChange={onChange} />
        )}

        {step.kind === "condition" && (branch === "true" || branch === "false") && (
          <Field label={t("studio.condition.connected")} help={t("studio.condition.connectHelp")}>
            <div className="studio-info">
              {branch === "true"
                ? (step.whenTrue ? nameOf(step.whenTrue) : t("studio.condition.none"))
                : (step.whenFalse ? nameOf(step.whenFalse) : t("studio.condition.none"))}
            </div>
            <div className="studio-help">{branch === "true" ? t("studio.condition.trueHelp") : t("studio.condition.falseHelp")}</div>
          </Field>
        )}

        {branch === "run" && (
          <Field label={t("studio.condition.connected")} help={step.kind === "condition" ? t("studio.condition.runHelp") : t("studio.agent.runHelp")}>
            <div className="studio-info">
              {step.kind === "condition"
                ? t("studio.condition.twoRoutes")
                : step.next ? nameOf(step.next) : t("studio.condition.none")}
            </div>
          </Field>
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

function UploadRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="studio-upload" onClick={onClick}>
      <Upload size={16} aria-hidden="true" />
      <span>{label}</span>
      <span aria-hidden="true">+</span>
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

function ConditionFields({ step, onChange }: {
  step: Extract<WorkflowStep, { kind: "condition" }>;
  onChange: (patch: Partial<WorkflowStep>) => void;
}) {
  const family = step.op === "exists" ? "exists" : step.op === "contains" ? "contains" : step.op === "equals" || step.op === "not_equals" ? "equals" : "compare";
  const familyOps: ConditionOp[] = family === "compare" ? ["gt", "gte", "lt", "lte"] : family === "equals" ? ["equals", "not_equals"] : family === "contains" ? ["contains"] : ["exists"];
  const setFamily = (next: string) => {
    const op: ConditionOp = next === "compare" ? "gt" : next === "equals" ? "equals" : next === "contains" ? "contains" : "exists";
    onChange({ op, value: nextConditionValue(op) } as Partial<WorkflowStep>);
  };
  const valueText = step.value === undefined ? "" : typeof step.value === "string" ? step.value : JSON.stringify(step.value);
  const setValue = (text: string) => {
    if (step.op === "gt" || step.op === "gte" || step.op === "lt" || step.op === "lte") {
      onChange({ value: Number(text) } as Partial<WorkflowStep>);
      return;
    }
    if (step.op === "contains") {
      onChange({ value: text } as Partial<WorkflowStep>);
      return;
    }
    try {
      onChange({ value: JSON.parse(text) } as Partial<WorkflowStep>);
    } catch {
      onChange({ value: text } as Partial<WorkflowStep>);
    }
  };
  return (
    <>
      <Field label={t("studio.condition.type")}>
        <Select className="w-full" size="sm" value={family} onChange={(event) => setFamily(event.target.value)}>
          <option value="compare">{t("studio.condition.compare")}</option>
          <option value="equals">{t("studio.condition.equals")}</option>
          <option value="exists">{t("studio.condition.exists")}</option>
          <option value="contains">{t("studio.condition.contains")}</option>
        </Select>
      </Field>
      <Field label={t("studio.condition.field")} help={t("studio.condition.fieldHelp")}>
        <input className="studio-input" value={step.field} onChange={(event) => onChange({ field: event.target.value } as Partial<WorkflowStep>)} />
      </Field>
      {family !== "exists" && family !== "contains" && (
        <Field label={t("studio.condition.operator")}>
          <Select className="w-full" size="sm" value={step.op} onChange={(event) => onChange({ op: event.target.value as ConditionOp } as Partial<WorkflowStep>)}>
            {familyOps.map((op) => <option key={op} value={op}>{t(conditionOpLabel[op])}</option>)}
          </Select>
        </Field>
      )}
      {step.op !== "exists" && (
        <Field label={t("studio.condition.value")} help={t("studio.condition.valueHelp")}>
          <input className={cn("studio-input", step.op === "contains" && "font-mono")} value={valueText} onChange={(event) => setValue(event.target.value)} />
        </Field>
      )}
    </>
  );
}

