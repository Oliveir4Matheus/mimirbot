import { addModelWindow, closedWindow, extraLine, isoOrNull, openWindow, sortModelWindows } from "./plan-windows.ts";
import type { PlanExtra, PlanModelUsage, PlanWindows } from "./plan-usage.ts";

const QUOTA_HEADING = /^#{1,6}\s*Quota Limits\s*$/i;
const QUOTA_GROUP = /^[-*]\s+\*\*([^*]+)\*\*\s*$/;
const QUOTA_BUCKET = /^\s+[-*]\s+\*\*([^*]+?):?\*\*:?\s*(\d+(?:\.\d+)?)%\s+remaining(?:\s+\(resets\s+([^)]+)\))?/i;

interface QuotaGroup {
  name: string;
  buckets: Array<{ label: string; usedPercent: number; resetsAt: string | null }>;
}

/** Reads the "Quota Limits" section of the runtime's `/usage` answer; null when it lists no bucket (an API key sign-in has none). */
export function parseAntigravityUsage(answer: string): PlanWindows | null {
  const groups: QuotaGroup[] = [];
  let inSection = false;
  for (const line of answer.split(/\r?\n/)) {
    if (line.startsWith("#")) {
      inSection = QUOTA_HEADING.test(line);
      continue;
    }
    if (!inSection) continue;
    const name = QUOTA_GROUP.exec(line)?.[1]?.trim();
    if (name) {
      groups.push({ name, buckets: [] });
      continue;
    }
    const bucket = QUOTA_BUCKET.exec(line);
    const group = groups.at(-1);
    if (!bucket || !group) continue;
    group.buckets.push({ label: bucket[1]!.trim(), usedPercent: 100 - Number(bucket[2]), resetsAt: isoOrNull(bucket[3]?.trim()) });
  }
  const filled = groups.filter((group) => group.buckets.length > 0);
  if (filled.length === 0) return null;
  const gemini = filled.find((group) => /^gemini\b/i.test(group.name)) ?? filled[0]!;
  let fiveHour = closedWindow();
  let weekly = closedWindow();
  const extra: PlanExtra[] = [];
  for (const bucket of gemini.buckets) {
    const window = openWindow(bucket.usedPercent, bucket.resetsAt);
    if (/\b5\s*-?\s*h|five/i.test(bucket.label) && !fiveHour.available) fiveHour = window;
    else if (/week/i.test(bucket.label) && !weekly.available) weekly = window;
    else extra.push(extraLine(bucket.label, window));
  }
  const models: PlanModelUsage[] = [];
  for (const group of filled) {
    for (const bucket of group.buckets) addModelWindow(models, group.name, extraLine(quotaBucketLabel(bucket.label), openWindow(bucket.usedPercent, bucket.resetsAt)));
  }
  sortModelWindows(models);
  return { plan: null, fiveHour, weekly, extra, models };
}

function quotaBucketLabel(label: string): string {
  if (/week/i.test(label)) return "Weekly";
  return /\b5\s*-?\s*h|five/i.test(label) ? "5-hour" : label;
}
