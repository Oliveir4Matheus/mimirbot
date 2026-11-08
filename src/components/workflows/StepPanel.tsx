import { useState } from "react";
import { Code, X } from "lucide-react";

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
  const conditions = Object.entries(step.require ?? {});

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
            </>
          ) : (
            <>
              <div className={LABEL}>{t("workflows.step.script")}</div>
              <div className="flex items-center gap-2 text-[11.5px] font-medium text-ink">
                <Code size={14} aria-hidden="true" />
                <span className="font-mono">{step.run}</span>
              </div>
              <div className="mt-1.5 text-[10px] text-ink-tertiary">
                {t("workflows.step.scriptRuntime", { seconds: Math.round(step.timeoutMs / 1000) })}
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

        <section className="mb-4">
          <div className={LABEL}>{t("workflows.step.inputs")}</div>
          {step.inputs.length === 0 ? <None /> : (
            <Table
              head={[t("workflows.step.inputFile"), t("workflows.step.inputFrom"), t("workflows.step.inputSource")]}
              rows={step.inputs.map((input) => [input.as, sourceName(input.from.step), input.from.output])}
            />
          )}
        </section>

        <section className="mb-4">
          <div className={LABEL}>{t("workflows.step.outputs")}</div>
          <Table
            head={[t("workflows.step.outputFile"), t("workflows.step.outputRequired")]}
            rows={step.outputs.map((output) => [output.path, output.required])}
          />
        </section>

        <section className="mb-4">
          <div className={LABEL}>{t("workflows.step.result")}</div>
          {step.result ? <span className="font-mono text-[10.5px] text-ink-secondary">{step.result}</span> : <None />}
        </section>

        <section className="mb-4">
          <div className={LABEL}>{t("workflows.step.conditions")}</div>
          {conditions.length === 0 ? <None /> : (
            <Table
              head={[t("workflows.step.conditionField"), t("workflows.step.conditionValue")]}
              rows={conditions.map(([field, value]) => [field, JSON.stringify(value)])}
            />
          )}
        </section>

        <section>
          <div className={LABEL}>{t("workflows.step.flow")}</div>
          {!step.next && !step.onFailure && !step.when?.length ? <None /> : (
            <div className="space-y-2">
              {step.next && (
                <div className="text-[10.5px] text-ink-secondary">
                  {t("workflows.step.next")}: <span className="text-ink">{sourceName(step.next)}</span>
                </div>
              )}
              {step.onFailure && (
                <div className="text-[10.5px] text-ink-secondary">
                  {t("workflows.step.onFailure")}: <span className="text-ink">{sourceName(step.onFailure)}</span>
                </div>
              )}
              {step.when?.length ? (
                <Table
                  head={[t("workflows.step.conditionField"), t("workflows.step.conditionValue"), t("workflows.step.next")]}
                  rows={step.when.map((branch) => [branch.field, JSON.stringify(branch.equals), sourceName(branch.next)])}
                />
              ) : null}
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}
