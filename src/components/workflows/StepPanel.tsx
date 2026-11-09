import { useState } from "react";
import { Code, GitBranch, X } from "lucide-react";

import type { WorkflowDefinition, WorkflowStep } from "../../../shared/workflow";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { BotAvatar } from "./BotAvatar";

const LABEL = "mb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-ink-tertiary";
const CELL = "border-b border-hairline/60 px-2 py-1.5 text-left text-[10.5px] text-ink-secondary";
const HEAD = "border-b border-hairline bg-raised/40 px-2 py-1.5 text-left text-[9.5px] font-semibold uppercase tracking-[0.08em] text-ink-tertiary";

function None() {
  return <span className="text-[10.5px] text-ink-tertiary">{t("workflows.step.none")}</span>;
}

function Table({ head, rows }: { head: string[]; rows: Array<Array<string | boolean>> }) {
  return (
    <div className="overflow-hidden rounded-lg border border-hairline">
      <table className="w-full border-collapse">
        <thead>
          <tr>{head.map((title) => <th key={title} className={HEAD}>{title}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className={cn(index % 2 === 1 && "bg-raised/25")}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className={CELL}>
                  {typeof cell === "boolean" ? (cell ? t("workflows.step.requiredYes") : t("workflows.step.requiredNo")) : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StepPanel({ workflow, step, index, botName, onClose }: {
  workflow: WorkflowDefinition;
  step: WorkflowStep;
  index: number;
  botName: (botId: string) => string;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const name = step.kind === "bot" ? botName(step.botId) : undefined;
  const sourceName = (id: string) => workflow.steps.find((candidate) => candidate.id === id)?.name ?? id;
  const condition = step.kind === "condition" ? step : undefined;
  const fileStep = step.kind === "condition" ? undefined : step;
  const successTarget = fileStep === undefined
    ? undefined
    : typeof fileStep.onSuccess === "string" ? fileStep.onSuccess
      : fileStep.onSuccess === null ? undefined
        : workflow.steps[index + 1]?.id;
  const conditions = Object.entries(fileStep?.require ?? {});

  return (
    <aside aria-label={t("workflows.step.panel")} className="flex max-h-[620px] w-[360px] shrink-0 flex-col overflow-hidden rounded-[13px] border border-hairline bg-app shadow-sm max-[1100px]:w-[300px] max-[900px]:w-full">
      <div className="flex items-start justify-between gap-3 px-[18px] pb-3 pt-[17px]">
        <div className="min-w-0">
          <div className="truncate text-[9.5px] uppercase tracking-[0.1em] text-ink-tertiary">
            {t("workflows.detail.stepNumber", { number: index + 1, id: step.id })}
          </div>
          <div className="mt-0.5 truncate text-[14px] font-semibold text-ink">{step.name}</div>
        </div>
        <button type="button" aria-label={t("workflows.step.close")} onClick={onClose} className="grid size-6 shrink-0 place-items-center rounded-md text-ink-tertiary hover:bg-raised hover:text-ink">
          <X size={14} aria-hidden="true" />
        </button>
      </div>

      <div className="wf-thin-scroll min-h-0 flex-1 overflow-auto px-[18px] pb-5">
        <section className="mb-4">
          {step.kind === "bot" ? (
            <>
              <div className={LABEL}>{t("workflows.step.bot")}</div>
              <div className="flex items-center gap-2 text-[11.5px] font-medium text-ink">
                <BotAvatar name={name!} size={20} />
                {name}
              </div>
              {step.timeoutMs > 0 && (
                <div className="mt-1.5 text-[10px] text-ink-tertiary">
                  {t("workflows.step.botRuntime", { seconds: Math.round(step.timeoutMs / 1000) })}
                </div>
              )}
              <div className="mt-1.5 text-[10px] text-ink-tertiary">
                {t("workflows.step.mode")}: {step.mode === "manual" ? t("workflows.step.modeManual") : t("workflows.step.modeAuto")}
              </div>
            </>
          ) : step.kind === "script" ? (
            <>
              <div className={LABEL}>{t("workflows.step.script")}</div>
              <div className="flex items-center gap-2 text-[11.5px] font-medium text-ink">
                <Code size={14} aria-hidden="true" />
                <span className="font-mono">{step.run}</span>
              </div>
              <div className="mt-1.5 text-[10px] text-ink-tertiary">
                {t("workflows.step.scriptRuntime", {
                  runtime: step.run.endsWith(".py") ? "Python" : step.run.endsWith(".ts") ? "TypeScript" : "Node",
                  seconds: Math.round(step.timeoutMs / 1000),
                })}
              </div>
              <div className="mt-1.5 text-[10px] text-ink-tertiary">
                {t("workflows.step.mode")}: {step.mode === "manual" ? t("workflows.step.modeManual") : t("workflows.step.modeAuto")}
              </div>
            </>
          ) : (
            <>
              <div className={LABEL}>{t("workflows.step.condition")}</div>
              <div className="flex items-center gap-2 text-[11.5px] font-medium text-ink">
                <GitBranch size={14} aria-hidden="true" />
                {t("workflows.step.conditionFrom", { name: sourceName(step.from) })}
              </div>
            </>
          )}
        </section>

        {step.kind === "bot" && (
          <section className="mb-4">
            <div className={LABEL}>{t("workflows.step.instructions")}</div>
            <p className={cn("whitespace-pre-wrap text-[10.5px] leading-[1.55] text-ink-secondary", !expanded && "line-clamp-4")}>{step.instructions}</p>
            <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-1 text-[10px] font-medium text-accent-text hover:underline">
              {expanded ? t("workflows.step.showLess") : t("workflows.step.showMore")}
            </button>
          </section>
        )}

        {condition && (
          <section className="mb-4">
            <div className={LABEL}>{t("workflows.step.condition")}</div>
            <div className="mb-2 text-[10.5px] text-ink-secondary">
              {t("workflows.step.conditionMatch")}: <span className="text-ink">{condition.match === "any" ? t("workflows.step.matchAny") : t("workflows.step.matchAll")}</span>
            </div>
            <Table
              head={[t("workflows.step.conditionField"), t("workflows.step.conditionOperator"), t("workflows.step.conditionValue")]}
              rows={condition.conditions.map((line) => [line.field, line.op, line.value === undefined ? "—" : JSON.stringify(line.value)])}
            />
          </section>
        )}

        {fileStep && (
          <section className="mb-4">
            <div className={LABEL}>{t("workflows.step.inputs")}</div>
            {fileStep.inputs.length === 0 ? <None /> : (
              <Table
                head={[t("workflows.step.inputFile"), t("workflows.step.inputFrom"), t("workflows.step.inputSource")]}
                rows={fileStep.inputs.map((input) => [input.as, sourceName(input.from.step), input.from.output])}
              />
            )}
          </section>
        )}

        {fileStep && (
          <section className="mb-4">
            <div className={LABEL}>{t("workflows.step.outputs")}</div>
            <Table
              head={[t("workflows.step.outputFile"), t("workflows.step.outputRequired")]}
              rows={fileStep.outputs.map((output) => [output.path, output.required])}
            />
          </section>
        )}

        {fileStep && (
          <section className="mb-4">
            <div className={LABEL}>{t("workflows.step.result")}</div>
            {fileStep.result ? <span className="font-mono text-[10.5px] text-ink-secondary">{fileStep.result}</span> : <None />}
          </section>
        )}

        {fileStep && (
          <section className="mb-4">
            <div className={LABEL}>{t("workflows.step.conditions")}</div>
            {conditions.length === 0 ? <None /> : (
              <Table
                head={[t("workflows.step.conditionField"), t("workflows.step.conditionValue")]}
                rows={conditions.map(([field, value]) => [field, JSON.stringify(value)])}
              />
            )}
          </section>
        )}

        <section>
          <div className={LABEL}>{t("workflows.step.flow")}</div>
          {condition ? (
            <div className="space-y-2">
              <div className="text-[10.5px] text-ink-secondary">
                {t("workflows.step.true")}: <span className="text-ink">{condition.whenTrue ? sourceName(condition.whenTrue) : t("workflows.step.none")}</span>
              </div>
              <div className="text-[10.5px] text-ink-secondary">
                {t("workflows.step.false")}: <span className="text-ink">{condition.whenFalse ? sourceName(condition.whenFalse) : t("workflows.step.none")}</span>
              </div>
              {condition.onFailure && (
                <div className="text-[10.5px] text-ink-secondary">
                  {t("workflows.step.onFailure")}: <span className="text-ink">{sourceName(condition.onFailure)}</span>
                </div>
              )}
            </div>
          ) : !fileStep || (!successTarget && !fileStep.onFailure && !fileStep.onTimeout && !fileStep.when?.length) ? <None /> : (
            <div className="space-y-2">
              <div className="text-[10.5px] text-ink-secondary">
                {t("workflows.step.onSuccess")}: <span className="text-ink">{successTarget ? sourceName(successTarget) : t("workflows.step.timeoutEnd")}</span>
              </div>
              {fileStep.onFailure && (
                <div className="text-[10.5px] text-ink-secondary">
                  {t("workflows.step.onFailure")}: <span className="text-ink">{sourceName(fileStep.onFailure)}</span>
                </div>
              )}
              {fileStep.onTimeout && (
                <div className="text-[10.5px] text-ink-secondary">
                  {t("workflows.step.onTimeout")}: <span className="text-ink">{sourceName(fileStep.onTimeout)}</span>
                </div>
              )}
              {fileStep?.when?.length ? (
                <Table
                  head={[t("workflows.step.conditionField"), t("workflows.step.conditionValue"), t("workflows.step.next")]}
                  rows={fileStep.when.map((branch) => [branch.field, JSON.stringify(branch.equals), sourceName(branch.next)])}
                />
              ) : null}
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}
