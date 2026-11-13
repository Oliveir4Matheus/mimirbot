import { useEffect, useRef, useState } from "react";
import { ChevronDown, Filter } from "lucide-react";

import type { WorkflowDefinition, WorkflowRunStatus } from "../../../shared/workflow";
import { usePopoverDismiss } from "@/hooks/use-popover-dismiss";
import { cn } from "@/lib/cn";
import { Select } from "@/components/Select";
import { t } from "@/lib/i18n";
import type { RunFilters, RunPeriod, Tab, WorkflowFilters, WorkflowSituation, WorkflowSort } from "./types";

const RUN_STATUSES: WorkflowRunStatus[] = ["queued", "running", "waiting_manual", "waiting_approval", "succeeded", "failed", "cancelled"];

const statusText = {
  queued: "workflows.status.queued",
  running: "workflows.status.running",
  waiting_manual: "workflows.status.waitingManual",
  waiting_approval: "workflows.status.waitingApproval",
  succeeded: "workflows.status.succeeded",
  failed: "workflows.status.failed",
  cancelled: "workflows.status.cancelled",
} as const;

const LABEL = "mb-1.5 block text-[10px] text-ink-tertiary";

export function defaultWorkflowFilters(): WorkflowFilters {
  return { department: "", situation: "all", sort: "name" };
}

export function defaultRunFilters(): RunFilters {
  return { workflowId: "", statuses: [], department: "", period: "all" };
}

export function FilterPopover({ tab, open, onOpenChange, workflows, filters, onApply }: {
  tab: Tab;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflows: WorkflowDefinition[];
  filters: WorkflowFilters | RunFilters;
  onApply: (filters: WorkflowFilters | RunFilters) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  usePopoverDismiss(open, root, () => onOpenChange(false));
  const [workflowDraft, setWorkflowDraft] = useState<WorkflowFilters>(() => tab === "workflows" ? filters as WorkflowFilters : defaultWorkflowFilters());
  const [runDraft, setRunDraft] = useState<RunFilters>(() => tab === "runs" ? filters as RunFilters : defaultRunFilters());

  useEffect(() => {
    if (!open) return;
    if (tab === "workflows") setWorkflowDraft(filters as WorkflowFilters);
    else setRunDraft(filters as RunFilters);
  }, [open, tab, filters]);

  const departments = [...new Set(workflows.map((workflow) => workflow.department))].sort((left, right) => left.localeCompare(right, "pt-BR"));
  const ordered = [...workflows].sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        className={cn(
          "flex h-[30px] items-center gap-1.5 rounded-lg border border-hairline bg-app px-2.5 text-[11px] text-ink-secondary hover:bg-raised/60",
          open && "bg-raised/60",
        )}
      >
        <Filter size={13} aria-hidden="true" />
        {t("workflows.filters")}
        <ChevronDown size={13} aria-hidden="true" className={cn("text-ink-tertiary transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-1.5 w-[270px] rounded-xl border border-hairline bg-menu p-4 text-ink shadow-xl">
          <div className="mb-3 text-[12px] font-semibold">{t("workflows.filters.title")}</div>

          {tab === "workflows" ? (
            <>
              <label className="mb-3 block">
                <span className={LABEL}>{t("workflows.filters.department")}</span>
                <Select className="w-full" size="sm" value={workflowDraft.department} onChange={(event) => setWorkflowDraft({ ...workflowDraft, department: event.target.value })}>
                  <option value="">{t("workflows.filters.all")}</option>
                  {departments.map((department) => <option key={department} value={department}>{department}</option>)}
                </Select>
              </label>
              <label className="mb-3 block">
                <span className={LABEL}>{t("workflows.filters.situation")}</span>
                <Select className="w-full" size="sm" value={workflowDraft.situation} onChange={(event) => setWorkflowDraft({ ...workflowDraft, situation: event.target.value as WorkflowSituation })}>
                  <option value="all">{t("workflows.filters.anySituation")}</option>
                  <option value="active">{t("workflows.filters.withActiveRun")}</option>
                  <option value="inactive">{t("workflows.filters.withoutActiveRun")}</option>
                </Select>
              </label>
              <label className="mb-3 block">
                <span className={LABEL}>{t("workflows.filters.sort")}</span>
                <Select className="w-full" size="sm" value={workflowDraft.sort} onChange={(event) => setWorkflowDraft({ ...workflowDraft, sort: event.target.value as WorkflowSort })}>
                  <option value="name">{t("workflows.filters.sortName")}</option>
                  <option value="activity">{t("workflows.filters.sortActivity")}</option>
                </Select>
              </label>
            </>
          ) : (
            <>
              <label className="mb-3 block">
                <span className={LABEL}>{t("workflows.filters.workflow")}</span>
                <Select className="w-full" size="sm" value={runDraft.workflowId} onChange={(event) => setRunDraft({ ...runDraft, workflowId: event.target.value })}>
                  <option value="">{t("workflows.filters.all")}</option>
                  {ordered.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}
                </Select>
              </label>
              <div className="mb-3">
                <span className={LABEL}>{t("workflows.filters.situation")}</span>
                <div className="grid grid-cols-2 gap-x-1.5 gap-y-1.5">
                  {RUN_STATUSES.map((status) => (
                    <label key={status} className="flex items-center gap-1.5 text-[10.5px] text-ink-secondary">
                      <input
                        type="checkbox"
                        className="accent-accent"
                        checked={runDraft.statuses.includes(status)}
                        onChange={(event) => setRunDraft({
                          ...runDraft,
                          statuses: event.target.checked
                            ? [...runDraft.statuses, status]
                            : runDraft.statuses.filter((candidate) => candidate !== status),
                        })}
                      />
                      {t(statusText[status])}
                    </label>
                  ))}
                </div>
              </div>
              <label className="mb-3 block">
                <span className={LABEL}>{t("workflows.filters.department")}</span>
                <Select className="w-full" size="sm" value={runDraft.department} onChange={(event) => setRunDraft({ ...runDraft, department: event.target.value })}>
                  <option value="">{t("workflows.filters.all")}</option>
                  {departments.map((department) => <option key={department} value={department}>{department}</option>)}
                </Select>
              </label>
              <label className="mb-3 block">
                <span className={LABEL}>{t("workflows.filters.period")}</span>
                <Select className="w-full" size="sm" value={runDraft.period} onChange={(event) => setRunDraft({ ...runDraft, period: event.target.value as RunPeriod })}>
                  <option value="today">{t("workflows.filters.periodToday")}</option>
                  <option value="7">{t("workflows.filters.period7")}</option>
                  <option value="30">{t("workflows.filters.period30")}</option>
                  <option value="all">{t("workflows.filters.periodAll")}</option>
                </Select>
              </label>
            </>
          )}

          <div className="mt-1 flex justify-end gap-2 border-t border-hairline pt-3">
            <button
              type="button"
              className="rounded-lg border border-hairline bg-app px-2.5 py-1.5 text-[10.5px] font-medium text-ink-secondary hover:bg-raised/60"
              onClick={() => {
                onApply(tab === "workflows" ? defaultWorkflowFilters() : defaultRunFilters());
                onOpenChange(false);
              }}
            >
              {t("workflows.filters.clear")}
            </button>
            <button
              type="button"
              className="rounded-lg bg-ink px-2.5 py-1.5 text-[10.5px] font-medium text-app hover:opacity-90"
              onClick={() => {
                onApply(tab === "workflows" ? workflowDraft : runDraft);
                onOpenChange(false);
              }}
            >
              {t("workflows.filters.apply")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
