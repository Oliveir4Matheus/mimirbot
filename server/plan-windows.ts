// Window shapes shared by the plan-usage readers.
import type { PlanExtra, PlanModelUsage, PlanWindow } from "./plan-usage.ts";

export function closedWindow(): PlanWindow {
  return { available: false, remainingPercent: null, usedPercent: null, resetsAt: null };
}

export function openWindow(usedPercent: number, resetsAt: string | null): PlanWindow {
  const used = clampPercent(usedPercent);
  return {
    available: true,
    usedPercent: used,
    remainingPercent: clampPercent(100 - used),
    resetsAt,
  };
}

export function extraLine(label: string, window: PlanWindow): PlanExtra {
  return {
    label,
    remainingPercent: window.remainingPercent ?? 0,
    usedPercent: window.usedPercent ?? 0,
    resetsAt: window.resetsAt,
  };
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function timeMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.abs(value) >= 1e12 ? value : value * 1000;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 80) return null;
  if (/^\d+(\.\d+)?$/.test(trimmed)) return timeMs(Number(trimmed));
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isoOrNull(value: unknown): string | null {
  const ms = timeMs(value);
  if (ms == null) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function addModelWindow(models: PlanModelUsage[], name: string, line: PlanExtra): void {
  const found = models.find((model) => model.name.toLowerCase() === name.toLowerCase());
  if (found) found.windows.push(line);
  else models.push({ name, windows: [line] });
}

export function sortModelWindows(models: PlanModelUsage[]): void {
  const rank = (label: string) => (label === "5-hour" ? 0 : label === "Weekly" ? 1 : 2);
  for (const model of models) model.windows.sort((a, b) => rank(a.label) - rank(b.label));
}
