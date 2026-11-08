import type { KeyboardEvent } from "react";

import type { WorkflowDefinition, WorkflowRun } from "../../../shared/workflow";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { isActiveStatus, relativeTime, runStatusLabel } from "@/lib/workflow-format";

const DOT: Record<string, string> = {
  queued: "#5283D9",
  running: "#5283D9",
  waiting_approval: "#C99B45",
  succeeded: "#49AA78",
  failed: "#D86E74",
  cancelled: "#9C9DA2",
};

function latestRun(runs: WorkflowRun[], workflowId: string): WorkflowRun | undefined {
  return runs.find((run) => run.workflowId === workflowId);
}

export function WorkflowList({ workflows, runs, selectedId, now, onSelect, onRun, onOpen }: {
  workflows: WorkflowDefinition[];
  runs: WorkflowRun[];
  selectedId?: string;
  now: number;
  onSelect: (id: string) => void;
  onRun: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, id: string) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter") {
      event.preventDefault();
      onSelect(id);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const rows = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLElement>("[data-workflow-row]") ?? []);
    const index = rows.indexOf(event.currentTarget);
    rows[Math.min(rows.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)))]?.focus();
  };

  return (
    <>
      {workflows.map((workflow) => {
        const run = latestRun(runs, workflow.id);
        const active = runs.some((candidate) => candidate.workflowId === workflow.id && isActiveStatus(candidate.status));
        const selected = selectedId === workflow.id;
        return (
          <div
            key={workflow.id}
            data-workflow-row={workflow.id}
            data-selected={selected}
            role="option"
            aria-selected={selected}
            tabIndex={0}
            onClick={() => onSelect(workflow.id)}
            onKeyDown={(event) => onKeyDown(event, workflow.id)}
            className={cn(
              "group relative mb-0.5 cursor-pointer rounded-[9px] px-3 py-[7px] outline-offset-[-2px] hover:bg-raised/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus",
              selected && "bg-raised-hover",
              selected && "before:absolute before:bottom-[9px] before:left-0 before:top-[9px] before:w-[3px] before:rounded-r before:bg-ink-secondary",
            )}
          >
            <div className="flex min-h-4 items-center justify-between gap-2">
              <span className="truncate text-[12px] font-semibold tracking-[-0.1px] text-ink" title={workflow.name}>{workflow.name}</span>
              <span className="shrink-0 rounded-[5px] border border-hairline bg-app px-1.5 py-0.5 font-mono text-[10px] text-ink-secondary">v{workflow.version}</span>
            </div>
            <div className="mt-[3px] truncate text-[10.5px] leading-[1.2] text-ink-tertiary">
              {workflow.department} · {workflow.steps.length === 1 ? t("workflows.item.stepsOne") : t("workflows.item.stepsOther", { count: workflow.steps.length })}
            </div>
            <div className="mt-1 flex items-center justify-between gap-2 text-[10px] leading-[1.25] text-ink-tertiary">
              <span className="flex min-w-0 items-center gap-1.5 truncate">
                <span
                  aria-hidden="true"
                  className={cn("size-1.5 shrink-0 rounded-full", active && "animate-[status-pulse_1.6s_steps(2,jump-none)_infinite]")}
                  style={{ background: run ? DOT[run.status] ?? "#A4A5AC" : "#A4A5AC" }}
                />
                <span className="truncate">
                  {run ? `${runStatusLabel(run.status)} · ${relativeTime(run.updatedAt, now)}` : t("workflows.item.never")}
                </span>
              </span>
              <span className="pointer-events-none absolute bottom-[5px] right-[7px] flex items-center gap-0.5 rounded-md bg-raised/90 px-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 touch:pointer-events-auto touch:opacity-100">
                <button
                  type="button"
                  className="rounded-md px-1.5 py-1 text-[9.5px] font-medium text-ink-secondary hover:bg-app hover:text-ink"
                  onClick={(event) => { event.stopPropagation(); onRun(workflow.id); }}
                >
                  {t("workflows.item.run")}
                </button>
                <button
                  type="button"
                  className="rounded-md px-1.5 py-1 text-[9.5px] font-medium text-ink-secondary hover:bg-app hover:text-ink"
                  onClick={(event) => { event.stopPropagation(); onOpen(workflow.id); }}
                >
                  {t("workflows.item.open")}
                </button>
              </span>
            </div>
          </div>
        );
      })}
    </>
  );
}
