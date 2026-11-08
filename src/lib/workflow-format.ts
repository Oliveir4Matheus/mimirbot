import type { WorkflowRunStatus, WorkflowStepStatus } from "../../shared/workflow";
import { activeLocale, t } from "@/lib/i18n";

export function isActiveStatus(status: WorkflowRunStatus): boolean {
  return status === "queued" || status === "running" || status === "waiting_approval";
}

export function runStatusLabel(status: WorkflowRunStatus): string {
  switch (status) {
    case "queued": return t("workflows.status.queued");
    case "running": return t("workflows.status.running");
    case "waiting_approval": return t("workflows.status.waitingApproval");
    case "succeeded": return t("workflows.status.succeeded");
    case "failed": return t("workflows.status.failed");
    case "cancelled": return t("workflows.status.cancelled");
  }
}

export function stepStatusLabel(status: WorkflowStepStatus): string {
  switch (status) {
    case "pending": return t("workflows.step.pending");
    case "running": return t("workflows.step.running");
    case "succeeded": return t("workflows.step.succeeded");
    case "failed": return t("workflows.step.failed");
    case "skipped": return t("workflows.step.skipped");
  }
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function startOfDay(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** "agora", "há 2 min", "há 3 h", "ontem", "há 3 dias", or a short date. */
export function relativeTime(ms: number, now = Date.now()): string {
  const diff = Math.max(0, now - ms);
  if (diff < MINUTE) return t("workflows.time.now");
  if (diff < HOUR) return t("workflows.time.minutesAgo", { count: Math.floor(diff / MINUTE) });
  const days = Math.round((startOfDay(now) - startOfDay(ms)) / DAY);
  if (days === 0) return t("workflows.time.hoursAgo", { count: Math.floor(diff / HOUR) });
  if (days === 1) return t("workflows.time.yesterday");
  if (days < 30) return t("workflows.time.daysAgo", { count: days });
  return formatDate(ms);
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, ms);
  if (total < MINUTE) return t("workflows.duration.seconds", { count: Math.max(0, Math.round(total / 1000)) });
  if (total < HOUR) {
    const minutes = Math.floor(total / MINUTE);
    const seconds = Math.floor((total % MINUTE) / 1000);
    return seconds > 0 && minutes < 10
      ? t("workflows.duration.minutesSeconds", { minutes, seconds })
      : t("workflows.duration.minutes", { count: minutes });
  }
  if (total < DAY) {
    const hours = Math.floor(total / HOUR);
    const minutes = Math.floor((total % HOUR) / MINUTE);
    return minutes > 0 ? t("workflows.duration.hoursMinutes", { hours, minutes }) : t("workflows.duration.hours", { count: hours });
  }
  return t("workflows.duration.days", { count: Math.floor(total / DAY) });
}

export function formatDate(ms: number): string {
  return new Intl.DateTimeFormat(activeLocale(), { dateStyle: "short" }).format(new Date(ms));
}

export function formatDateTime(ms: number): string {
  return new Intl.DateTimeFormat(activeLocale(), { dateStyle: "short", timeStyle: "short" }).format(new Date(ms));
}

/** How long a run took, or how long it has been going. */
export function runDuration(run: { startedAt?: number; finishedAt?: number; createdAt: number; updatedAt: number; status: WorkflowRunStatus }, now = Date.now()): number {
  const start = run.startedAt ?? run.createdAt;
  const end = run.finishedAt ?? (isActiveStatus(run.status) ? now : run.updatedAt);
  return Math.max(0, end - start);
}

export function runDurationLabel(run: { startedAt?: number; finishedAt?: number; createdAt: number; updatedAt: number; status: WorkflowRunStatus }, now = Date.now()): string {
  return formatDuration(runDuration(run, now));
}
