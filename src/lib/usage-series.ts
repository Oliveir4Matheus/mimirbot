import { api } from "@/state/store";

export type UsageMetric = "cost" | "tokens" | "runs" | "errors";
export const USAGE_METRICS: readonly UsageMetric[] = ["cost", "tokens", "runs", "errors"];

export type SeriesPeriod = "today" | "week" | "days30" | "month" | "lastMonth" | "days90";
export const SERIES_PERIODS: readonly SeriesPeriod[] = ["today", "week", "days30", "month", "lastMonth", "days90"];

export interface SeriesCell {
  key: string;
  botId: string;
  botName: string;
  model: string;
  turns: number;
  input: number;
  output: number;
  cachedInput: number;
  costUsd: number | null;
  errors: number;
}

export interface Totals {
  cost: number | null;
  input: number;
  output: number;
  cachedInput: number;
  runs: number;
  errors: number;
}

export interface SeriesSlot {
  /** The day (`YYYY-MM-DD`) a bar starts on, or `YYYY-MM-DDTHH` for an hour. */
  key: string;
  from: string;
  to: string;
}

export interface SeriesPlan {
  period: SeriesPeriod;
  from: string;
  to: string;
  bucket: "day" | "hour";
  step: number;
  slots: SeriesSlot[];
  /** The stretch the numbers are compared with. `untilHour` cuts a whole day at the hour it is now. */
  previous: { from: string; to: string; untilHour?: number; label: PreviousLabel };
  days: number;
}

export type PreviousLabel = "yesterday" | "days7" | "days30" | "days90" | "sameStretch" | "monthBefore";

const pad = (value: number) => String(value).padStart(2, "0");

export function localDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Noon, so a daylight-saving change never moves the date. */
export function parseDay(day: string): Date {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return new Date(year, month - 1, date, 12);
}

export function addDays(day: string, days: number): string {
  const date = parseDay(day);
  date.setDate(date.getDate() + days);
  return localDay(date);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000);
}

const monthStart = (year: number, month: number) => localDay(new Date(year, month, 1, 12));
const monthEnd = (year: number, month: number) => localDay(new Date(year, month + 1, 0, 12));

export function seriesPlan(period: SeriesPeriod, now = new Date()): SeriesPlan {
  const today = localDay(now);
  const slotsOf = (from: string, to: string, step: number): SeriesSlot[] => {
    const slots: SeriesSlot[] = [];
    for (let day = from; day <= to; day = addDays(day, step)) {
      const end = addDays(day, step - 1);
      slots.push({ key: day, from: day, to: end < to ? end : to });
    }
    return slots;
  };
  if (period === "today") {
    const slots = Array.from({ length: now.getHours() + 1 }, (_, hour) => ({ key: `${today}T${pad(hour)}`, from: today, to: today }));
    const yesterday = addDays(today, -1);
    return { period, from: today, to: today, bucket: "hour", step: 1, slots, days: 1, previous: { from: yesterday, to: yesterday, untilHour: now.getHours(), label: "yesterday" } };
  }
  const span = (length: number, step: number, label: PreviousLabel): SeriesPlan => {
    const from = addDays(today, -(length - 1));
    return { period, from, to: today, bucket: "day", step, slots: slotsOf(from, today, step), days: length, previous: { from: addDays(from, -length), to: addDays(from, -1), label } };
  };
  if (period === "week") return span(7, 1, "days7");
  if (period === "days30") return span(30, 1, "days30");
  if (period === "days90") return span(90, 3, "days90");
  const year = now.getFullYear(), month = now.getMonth();
  if (period === "month") {
    const from = monthStart(year, month);
    const previousFrom = monthStart(year, month - 1), previousLast = monthEnd(year, month - 1);
    const sameDay = addDays(previousFrom, now.getDate() - 1);
    return { period, from, to: today, bucket: "day", step: 1, slots: slotsOf(from, today, 1), days: now.getDate(), previous: { from: previousFrom, to: sameDay < previousLast ? sameDay : previousLast, label: "sameStretch" } };
  }
  const from = monthStart(year, month - 1), to = monthEnd(year, month - 1);
  return { period, from, to, bucket: "day", step: 1, slots: slotsOf(from, to, 1), days: daysBetween(from, to) + 1, previous: { from: monthStart(year, month - 2), to: monthEnd(year, month - 2), label: "monthBefore" } };
}

export interface SeriesResponse {
  bucket: "day" | "hour";
  cells: SeriesCell[];
  billing: { currency: string } | null;
}

export function fetchSeries(range: { from: string; to: string }, bucket: "day" | "hour"): Promise<SeriesResponse> {
  const tz = new Date().getTimezoneOffset();
  return api(`/api/usage/series?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}&bucket=${bucket}&tz=${tz}`);
}

export function emptyTotals(): Totals {
  return { cost: null, input: 0, output: 0, cachedInput: 0, runs: 0, errors: 0 };
}

export function addCell(totals: Totals, cell: SeriesCell): Totals {
  totals.input += cell.input;
  totals.output += cell.output;
  totals.cachedInput += cell.cachedInput;
  totals.runs += cell.turns;
  totals.errors += cell.errors;
  if (cell.costUsd !== null) totals.cost = (totals.cost ?? 0) + cell.costUsd;
  return totals;
}

export function sumCells(cells: readonly SeriesCell[]): Totals {
  const totals = emptyTotals();
  for (const cell of cells) addCell(totals, cell);
  return totals;
}

export function freshTokens(totals: Pick<Totals, "input" | "output" | "cachedInput">): number {
  return Math.max(0, totals.input - Math.min(totals.cachedInput, totals.input)) + totals.output;
}

export function metricValue(totals: Totals, metric: UsageMetric): number {
  if (metric === "cost") return totals.cost ?? 0;
  if (metric === "tokens") return freshTokens(totals);
  return metric === "runs" ? totals.runs : totals.errors;
}

export interface SeriesBar {
  slot: SeriesSlot;
  byBot: Map<string, Totals>;
}

/** Which bar a cell belongs to: the hour for an hourly plan, the step that holds its day otherwise. */
function slotIndex(plan: SeriesPlan, key: string): number {
  if (plan.bucket === "hour") return Number(key.slice(11, 13));
  return Math.floor(daysBetween(plan.from, key.slice(0, 10)) / plan.step);
}

export function seriesBars(plan: SeriesPlan, cells: readonly SeriesCell[], botOf: (cell: SeriesCell) => string = (cell) => cell.botId): SeriesBar[] {
  const bars: SeriesBar[] = plan.slots.map((slot) => ({ slot, byBot: new Map() }));
  for (const cell of cells) {
    const bar = bars[slotIndex(plan, cell.key)];
    if (!bar) continue;
    const id = botOf(cell);
    let totals = bar.byBot.get(id);
    if (!totals) bar.byBot.set(id, totals = emptyTotals());
    addCell(totals, cell);
  }
  return bars;
}

export function barTotals(bar: SeriesBar, only?: (botId: string) => boolean): Totals {
  const total = emptyTotals();
  for (const [botId, totals] of bar.byBot) {
    if (only && !only(botId)) continue;
    total.input += totals.input; total.output += totals.output; total.cachedInput += totals.cachedInput;
    total.runs += totals.runs; total.errors += totals.errors;
    if (totals.cost !== null) total.cost = (total.cost ?? 0) + totals.cost;
  }
  return total;
}

/** The previous stretch's cells, cut at the hour it is now when today is compared with yesterday. */
export function previousCells(plan: SeriesPlan, cells: readonly SeriesCell[]): SeriesCell[] {
  const until = plan.previous.untilHour;
  return until === undefined ? [...cells] : cells.filter((cell) => Number(cell.key.slice(11, 13)) <= until);
}

export function totalsBy<K extends string>(cells: readonly SeriesCell[], keyOf: (cell: SeriesCell) => K): Map<K, Totals> {
  const map = new Map<K, Totals>();
  for (const cell of cells) {
    const key = keyOf(cell);
    let totals = map.get(key);
    if (!totals) map.set(key, totals = emptyTotals());
    addCell(totals, cell);
  }
  return map;
}

/** Three to five round ticks, from zero past `max`; whole numbers only for counts. */
export function niceTicks(max: number, whole: boolean): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normal = raw / magnitude;
  let step = (normal <= 1 ? 1 : normal <= 2 ? 2 : normal <= 5 ? 5 : 10) * magnitude;
  if (whole && step < 1) step = 1;
  const ticks: number[] = [];
  for (let value = 0; value < max - step * 1e-9; value += step) ticks.push(Number(value.toPrecision(12)));
  ticks.push(Number((ticks.length * step).toPrecision(12)));
  return ticks;
}

export function percentChange(current: number, previous: number): number | null {
  if (!(previous > 0)) return null;
  return ((current - previous) / previous) * 100;
}

/** The identity colors a bot can wear, in the order the chart seats them. They are theme tokens, so every skin brings its own. */
export const SERIES_COLORS = ["blue", "orange", "teal", "yellow", "pink", "green", "purple", "red"] as const;
export const OTHERS_ID = "__others";

export interface SeriesBot { id: string; name: string; color: string }

/** One color per bot, fixed by the order of the sidebar; bots past the eighth share "Others" so no color is ever generated. */
export function seatBots(cells: readonly SeriesCell[], order: readonly string[], others: string): { bots: SeriesBot[]; seat: (botId: string) => string } {
  const names = new Map<string, string>();
  for (const cell of cells) names.set(cell.botId, cell.botName);
  const position = (id: string) => { const at = order.indexOf(id); return at < 0 ? order.length : at; };
  const ids = [...names.keys()].sort((a, b) => position(a) - position(b) || (names.get(a) ?? "").localeCompare(names.get(b) ?? ""));
  const seated = ids.slice(0, SERIES_COLORS.length);
  const bots: SeriesBot[] = seated.map((id, index) => ({ id, name: names.get(id) ?? id, color: `var(--identity-${SERIES_COLORS[index]})` }));
  if (ids.length > seated.length) bots.push({ id: OTHERS_ID, name: others, color: "var(--color-ink-tertiary)" });
  const set = new Set(seated);
  return { bots, seat: (botId) => (set.has(botId) ? botId : OTHERS_ID) };
}
