import type { KeyboardEvent } from "react";

import type { WorkflowDefinition, WorkflowRun } from "../../../shared/workflow";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { isActiveStatus, relativeTime, runDurationLabel } from "@/lib/workflow-format";
import { RunGlyph } from "./RunGlyph";

function stepName(workflow: WorkflowDefinition | undefined, run: WorkflowRun, index: number): string {
  return workflow?.steps[index]?.name ?? run.snapshot?.steps[index]?.name ?? t("workflows.run.stepNumber", { number: index + 1 });
}

export function RunList({ runs, workflows, selectedId, now, onSelect }: {
  runs: WorkflowRun[];
  workflows: WorkflowDefinition[];
  selectedId?: string;
  now: number;
  onSelect: (id: string) => void;
}) {
  const byId = new Map(workflows.map((workflow) => [workflow.id, workflow]));

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, id: string) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter") {
      event.preventDefault();
      onSelect(id);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const rows = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLElement>("[data-run-row]") ?? []);
    const index = rows.indexOf(event.currentTarget);
    rows[Math.min(rows.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)))]?.focus();
  };

  return (
    <>
      {runs.map((run) => {
        const workflow = byId.get(run.workflowId);
        const selected = selectedId === run.id;
        const active = isActiveStatus(run.status);
        return (
          <div
            key={run.id}
            data-run-row={run.id}
            data-selected={selected}
            role="option"
            aria-selected={selected}
            tabIndex={0}
            onClick={() => onSelect(run.id)}
            onKeyDown={(event) => onKeyDown(event, run.id)}
            className={cn(
              "wf-run-row group relative mb-0.5 cursor-pointer rounded-[9px] px-3 py-2.5 outline-offset-[-2px] hover:bg-raised/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus",
              selected && "bg-raised-hover",
              selected && "before:absolute before:bottom-[9px] before:left-0 before:top-[9px] before:w-[3px] before:rounded-r before:bg-ink-secondary",
            )}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <RunGlyph status={run.status} />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5 leading-[1.25]">
                  <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-ink" title={workflow?.name ?? run.snapshot?.name ?? run.workflowId}>
                    {workflow?.name ?? run.snapshot?.name ?? t("workflows.run.unknownWorkflow")}
                  </span>
                  <span className="shrink-0 font-mono text-[9.5px] text-ink-tertiary">v{run.workflowVersion}</span>
                </div>
                <div className="mt-1 truncate font-mono text-[9px] tracking-[-0.15px] text-ink-tertiary" title={run.id}>{run.id}</div>
                <div className="mt-[5px] flex min-w-0 items-center justify-between gap-2 text-[10px] leading-[1.3] text-ink-secondary">
                  <span className="min-w-0 truncate">{run.department} · {runDurationLabel(run, now)}</span>
                  <span className="shrink-0 text-ink-tertiary">{relativeTime(run.updatedAt, now)}</span>
                </div>
                {active && (
                  <div className="mt-[5px] flex min-w-0 items-center gap-1.5 text-[9.5px] leading-[1.3] text-ink-tertiary">
                    <span
                      aria-hidden="true"
                      className="size-[5px] shrink-0 rounded-full"
                      style={{ background: run.status === "waiting_approval" || run.status === "waiting_manual" ? "#C5923A" : "#397EE7" }}
                    />
                    <span className="truncate">
                      {t("workflows.run.stepOf", { current: Math.min(run.currentStep + 1, run.steps.length), total: run.steps.length, name: stepName(workflow, run, run.currentStep) })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
