import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Download, Gauge } from "lucide-react";
import { cn } from "@/lib/cn";
import { activeLocale, documentLanguage, t } from "@/lib/i18n";
import { listenLiveFrames } from "@/lib/live-events";
import { formatTokens, formatUsd } from "@/lib/usage";
import { formatCost, usageExportHref } from "@/lib/usage-trace";
import {
  barTotals, fetchSeries, freshTokens, metricValue, parseDay, percentChange, previousCells, seatBots, seriesBars, seriesPlan, sumCells, totalsBy,
  SERIES_PERIODS, USAGE_METRICS,
  type SeriesBar, type SeriesCell, type SeriesPeriod, type SeriesPlan, type Totals, type UsageMetric,
} from "@/lib/usage-series";
import { api, useStore } from "@/state/store";
import type { LocaleKey } from "@/locales";
import { useCaptionChrome } from "./DesktopCapabilities";
import { UsageRuns } from "./UsageSection";
import { UsageBudgetCards, type BudgetState } from "./UsageBudget";
import { UsageChart } from "./usage/UsageChart";
import { UsagePlans } from "./usage/UsagePlans";
import { RankList, type RankItem } from "./usage/UsageRank";
import { UsageTable } from "./usage/UsageTable";
import { modelName } from "./usage/TraceWaterfall";

const PERIOD_LABELS: Record<SeriesPeriod, LocaleKey> = {
  today: "usage.page.today",
  week: "usage.page.week",
  days30: "usage.history.last30Days",
  month: "usage.history.thisMonth",
  lastMonth: "usage.history.lastMonth",
  days90: "usage.v.days90",
};
const METRIC_LABELS: Record<UsageMetric, LocaleKey> = {
  cost: "usage.v.metric.cost", tokens: "usage.v.metric.tokens", runs: "usage.v.metric.runs", errors: "usage.v.metric.errors",
};
const PREVIOUS_LABELS = {
  yesterday: "usage.v.prev.yesterday", days7: "usage.v.prev.days7", days30: "usage.v.prev.days30", days90: "usage.v.prev.days90",
  sameStretch: "usage.v.prev.sameStretch", monthBefore: "usage.v.prev.monthBefore",
} as const satisfies Record<SeriesPlan["previous"]["label"], LocaleKey>;

const LIVE_REFRESH_MS = 2_000;
const DEFAULT_PERIOD: SeriesPeriod = "days30";

const language = () => documentLanguage(activeLocale());
const integer = (value: number) => new Intl.NumberFormat(language(), { maximumFractionDigits: 0 }).format(value);
const decimal = (value: number) => new Intl.NumberFormat(language(), { maximumFractionDigits: 1 }).format(value);
const percent = (value: number) => new Intl.NumberFormat(language(), { style: "percent", maximumFractionDigits: 1 }).format(value);

function formatMetric(value: number, metric: UsageMetric): string {
  if (metric === "cost") return formatCost(value);
  return metric === "tokens" ? formatTokens(value) : integer(value);
}
/** A bot with no priced turn has no cost to show, which is not the same as costing nothing. */
function totalsText(totals: Totals | undefined, metric: UsageMetric): string {
  if (!totals) return "";
  return metric === "cost" && totals.cost === null ? "—" : formatMetric(metricValue(totals, metric), metric);
}
function axisMetric(value: number, metric: UsageMetric, fractional: boolean): string {
  if (metric === "cost") return fractional ? formatUsd(value) : `$${integer(value)}`;
  return metric === "tokens" ? formatTokens(value) : integer(value);
}
function dayText(day: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(language(), options).format(parseDay(day));
}
function barLabel(plan: SeriesPlan, bar: SeriesBar): string {
  if (plan.bucket === "hour") return `${Number(bar.slot.key.slice(11, 13))}h`;
  return dayText(bar.slot.from, { day: "numeric", month: "short" });
}
function barTitle(plan: SeriesPlan, bar: SeriesBar): string {
  if (plan.bucket === "hour") {
    const hour = Number(bar.slot.key.slice(11, 13));
    return `${dayText(bar.slot.from, { weekday: "short", day: "numeric", month: "short" })}, ${hour}h – ${hour + 1}h`;
  }
  if (bar.slot.from !== bar.slot.to) return `${dayText(bar.slot.from, { day: "numeric", month: "short" })} – ${dayText(bar.slot.to, { day: "numeric", month: "short" })}`;
  return dayText(bar.slot.from, { weekday: "short", day: "numeric", month: "short" });
}
function rangeText(from: string, to: string): string {
  const short: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return from === to ? dayText(from, short) : `${dayText(from, short)} – ${dayText(to, short)}`;
}

function Delta({ current, previous }: { current: number; previous: number }) {
  const change = percentChange(current, previous);
  if (change === null) return <span className="text-[12.5px] text-ink-tertiary">{t("usage.v.noBase")}</span>;
  if (Math.abs(change) < 0.5) return <span className="text-[12.5px] text-ink-secondary">= {t("usage.v.same")}</span>;
  const amount = integer(Math.abs(change));
  return (
    <span className="whitespace-nowrap text-[12.5px] font-semibold text-ink" aria-label={t(change > 0 ? "usage.v.up" : "usage.v.down", { percent: amount })}>
      <span aria-hidden>{change > 0 ? "▲" : "▼"} {amount}%</span>
    </span>
  );
}

function Spark({ values }: { values: number[] }) {
  const width = 86, height = 26, max = Math.max(...values, 1e-9);
  const points = values.map((value, index) => [values.length === 1 ? width / 2 : 4 + (index * (width - 8)) / (values.length - 1), height - 4 - (value / max) * (height - 8)] as const);
  const last = points[points.length - 1];
  if (!last) return null;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="shrink-0 max-sm:hidden">
      <polyline points={points.map((point) => point.join(",")).join(" ")} fill="none" className="stroke-ink-tertiary" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={4} className="fill-ink stroke-card" strokeWidth={2} />
    </svg>
  );
}

interface Loaded { plan: SeriesPlan; cells: SeriesCell[]; previous: SeriesCell[] }

/** Where the bots' time and money went: one filter row, four numbers, a stacked chart by bot, then rankings and every run. */
export function UsagePage() {
  const { state } = useStore();
  const { dragProps } = useCaptionChrome();
  const [period, setPeriod] = useState<SeriesPeriod>(DEFAULT_PERIOD);
  const [metric, setMetric] = useState<UsageMetric | null>(null);
  const [selection, setSelection] = useState<Set<string> | null>(null);
  const [view, setView] = useState<"chart" | "table">("chart");
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [budget, setBudget] = useState<BudgetState | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const plan = useMemo(() => seriesPlan(period), [period, version]);
  const range = useMemo(() => ({ from: plan.from, to: plan.to }), [plan.from, plan.to]);

  useEffect(() => {
    let current = true;
    void Promise.all([fetchSeries(range, plan.bucket), fetchSeries(plan.previous, plan.bucket)])
      .then(([now, before]) => { if (current) { setLoaded({ plan, cells: now.cells, previous: previousCells(plan, before.cells) }); setError(null); } })
      .catch(() => { if (current) setError(t("usage.v.loadFailed")); });
    void api(`/api/usage?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}&groupBy=bot`)
      .then((summary: { budget?: BudgetState | null }) => { if (current) setBudget(summary.budget ?? null); })
      .catch(() => { if (current) setBudget(null); });
    return () => { current = false; };
  }, [plan, range, version]);

  useEffect(() => listenLiveFrames({
    onFrame: (frame) => {
      if (frame.kind !== "runtime" || pending.current) return;
      const type = (frame.event as { type?: string } | undefined)?.type;
      if (type !== "turn.started" && type !== "turn.completed") return;
      pending.current = setTimeout(() => { pending.current = null; setVersion((value) => value + 1); }, LIVE_REFRESH_MS);
    },
    onMissedFrames: () => setVersion((value) => value + 1),
  }), []);
  useEffect(() => () => { if (pending.current) clearTimeout(pending.current); }, []);

  const cells = loaded?.cells ?? [];
  const before = loaded?.previous ?? [];
  const order = useMemo(() => state.bots.map((bot) => bot.id), [state.bots]);
  const { bots: seated, seat } = useMemo(() => seatBots([...cells, ...before], order, t("usage.v.others")), [cells, before, order]);
  const hasUse = useMemo(() => new Set(cells.map((cell) => seat(cell.botId))), [cells, seat]);
  const bots = useMemo(() => seated.filter((bot) => hasUse.has(bot.id)), [seated, hasUse]);
  const visibleSeat = (id: string) => selection === null || selection.has(id);
  const visibleCell = (cell: SeriesCell) => visibleSeat(seat(cell.botId));

  const visibleCells = cells.filter(visibleCell);
  const runBots = selection === null ? undefined : [...new Set([...cells, ...before].filter(visibleCell).map((cell) => cell.botId))].sort();
  const visibleBefore = before.filter(visibleCell);
  const bars = loaded ? seriesBars(loaded.plan, visibleCells, (cell) => seat(cell.botId)) : [];
  const total = sumCells(visibleCells);
  const previousTotal = sumCells(visibleBefore);

  const active: UsageMetric = metric ?? ((total.cost ?? 0) > 0 || before.some((cell) => (cell.costUsd ?? 0) > 0) ? "cost" : "tokens");
  const unitText = plan.bucket === "hour" ? t("usage.v.unit.hour") : plan.step === 1 ? t("usage.v.unit.day") : t("usage.v.unit.days", { count: String(plan.step) });
  const unpriced = visibleCells.reduce((sum, cell) => sum + (cell.costUsd === null ? cell.turns : 0), 0);

  const toggle = (id: string) => {
    const next = new Set(selection ?? bots.map((bot) => bot.id));
    if (next.has(id)) next.delete(id); else next.add(id);
    if (!next.size) return;
    setSelection(next.size === bots.length && bots.every((bot) => next.has(bot.id)) ? null : next);
  };
  const solo = (id: string) => setSelection(selection?.size === 1 && selection.has(id) ? null : new Set([id]));
  const filtered = selection !== null || period !== DEFAULT_PERIOD;
  const reset = () => { setSelection(null); setPeriod(DEFAULT_PERIOD); };

  const subs: Record<UsageMetric, string> = {
    cost: total.runs ? t("usage.v.perRun", { value: formatCost((total.cost ?? 0) / total.runs) }) : "—",
    tokens: total.runs ? t("usage.v.perRun", { value: formatTokens(freshTokens(total) / total.runs) }) : "—",
    runs: plan.bucket === "hour" ? t("usage.v.perHour", { value: decimal(total.runs / plan.slots.length) }) : t("usage.v.perDay", { value: decimal(total.runs / plan.days) }),
    errors: total.runs ? t("usage.v.errorShare", { percent: percent(total.errors / total.runs) }) : "—",
  };
  const previousRange = plan.previous.untilHour !== undefined ? dayText(plan.previous.from, { weekday: "short", day: "numeric", month: "short" }) : rangeText(plan.previous.from, plan.previous.to);

  const byBot: RankItem[] = bots.filter((bot) => visibleSeat(bot.id)).map((bot) => {
    const mine = visibleCells.filter((cell) => seat(cell.botId) === bot.id);
    return { id: bot.id, name: bot.name, color: bot.color, current: sumCells(mine), previous: sumCells(visibleBefore.filter((cell) => seat(cell.botId) === bot.id)) };
  }).filter((item) => item.current.runs > 0);
  const modelsNow = totalsBy(visibleCells, (cell) => cell.model);
  const modelsBefore = totalsBy(visibleBefore, (cell) => cell.model);
  const byModel: RankItem[] = [...modelsNow].map(([model, totals]) => ({
    id: model, name: modelName(model, state.instances), color: "var(--color-ink-tertiary)", current: totals, previous: modelsBefore.get(model) ?? sumCells([]),
    sub: [...new Set(visibleCells.filter((cell) => cell.model === model).map((cell) => cell.botName))].join(", "),
  }));

  const sparkValues = (key: UsageMetric) => bars.map((bar) => metricValue(barTotals(bar), key));

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-app text-ink" data-testid="usage-page">
      <header {...dragProps} className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline/40 px-6 py-3.5 max-md:pl-12">
        <Gauge size={18} className="text-ink-secondary" />
        <h1 className="text-[17px] font-semibold">{t("settings.section.usage")}</h1>
        <div role="group" aria-label={t("usage.history.period")} className="ml-1 flex max-w-full overflow-x-auto rounded-xl border border-hairline/60 bg-card p-0.5 max-md:order-last max-md:ml-0 max-md:w-full">
          {SERIES_PERIODS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={period === option}
              onClick={() => setPeriod(option)}
              className={cn("shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px]",
                period === option ? "bg-ink font-semibold text-app" : "text-ink-secondary hover:bg-raised/60 hover:text-ink")}
            >{t(PERIOD_LABELS[option])}</button>
          ))}
        </div>
        <a href={usageExportHref(range)} download className="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg border border-hairline/40 px-2.5 py-1 text-[12px] text-ink-secondary hover:bg-raised/50 hover:text-ink">
          <Download size={13} />{t("usage.history.export")}
        </a>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-20 border-b border-hairline/30 bg-app/95 backdrop-blur max-md:static">
          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-3 gap-y-2 px-6 py-3" role="group" aria-label={t("usage.v.bots")}>
            <span className="text-[12.5px] text-ink-secondary">{rangeText(plan.from, plan.to)}</span>
            {filtered && <button type="button" onClick={reset} className="rounded-lg px-2 py-1 text-[12.5px] text-ink-secondary underline underline-offset-4 hover:bg-raised/60 hover:text-ink">{t("usage.v.clear")}</button>}
            <span className="ml-auto" />
            <BotFilter bots={bots} selection={selection} onToggle={toggle} onAll={() => setSelection(null)} />
          </div>
        </div>

        <div className={cn("mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 pb-10 pt-4", loaded?.plan !== plan && "opacity-60 transition-opacity")}>
          {error && <p role="alert" className="text-[12.5px] text-danger">{error}</p>}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="group" aria-label={t("usage.v.display")}>
            {USAGE_METRICS.map((key) => {
              const current = metricValue(total, key), previous = metricValue(previousTotal, key);
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active === key}
                  onClick={() => setMetric(key)}
                  className={cn("flex min-w-0 flex-col gap-0.5 rounded-2xl border bg-card px-4 pb-3 pt-3.5 text-left",
                    active === key ? "border-ink ring-1 ring-ink" : "border-hairline/50 hover:border-ink-tertiary")}
                >
                  <span className="flex items-center justify-between gap-2 text-[12.5px] text-ink-secondary">
                    {t(METRIC_LABELS[key])}
                    {active === key && <em className="text-[11px] font-semibold not-italic text-ink">{t("usage.v.onChart")}</em>}
                  </span>
                  <span className="mt-0.5 truncate text-[26px] font-semibold leading-tight tracking-tight text-ink max-sm:text-[22px]">{formatMetric(current, key)}</span>
                  <span className="text-[12px] text-ink-secondary">{subs[key]}</span>
                  <span className="mt-2 flex items-end justify-between gap-2">
                    <Delta current={current} previous={previous} />
                    <Spark values={sparkValues(key)} />
                  </span>
                </button>
              );
            })}
          </div>
          <p className="-mt-1 px-0.5 text-[12px] text-ink-tertiary">{t("usage.v.compared", { period: t(PREVIOUS_LABELS[plan.previous.label]), range: previousRange })}</p>

          <section className="rounded-2xl border border-hairline/50 bg-card px-5 pb-4 pt-4" aria-labelledby="usage-chart-title">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="min-w-0">
                <h2 id="usage-chart-title" className="text-[15px] font-semibold">{t("usage.v.chartTitle", { metric: t(METRIC_LABELS[active]), unit: unitText })}</h2>
                <p className="mt-0.5 text-[12.5px] text-ink-secondary">
                  {selection === null ? t("usage.v.allBots") : bots.filter((bot) => selection.has(bot.id)).map((bot) => bot.name).join(", ")}
                </p>
              </div>
              <div className="ml-auto flex rounded-lg border border-hairline/60 p-0.5" role="group" aria-label={t("usage.v.display")}>
                {(["chart", "table"] as const).map((option) => (
                  <button key={option} type="button" aria-pressed={view === option} onClick={() => setView(option)}
                    className={cn("rounded-md px-2.5 py-1 text-[12px]", view === option ? "bg-ink font-semibold text-app" : "text-ink-secondary hover:text-ink")}>
                    {t(option === "chart" ? "usage.v.chart" : "usage.v.table")}
                  </button>
                ))}
              </div>
            </div>
            <ul className="mb-2 mt-3 flex flex-wrap gap-x-1 gap-y-0.5" aria-label={t("usage.v.bots")}>
              {bots.map((bot) => {
                const mine = sumCells(cells.filter((cell) => seat(cell.botId) === bot.id));
                return (
                  <li key={bot.id}>
                    <button type="button" aria-pressed={visibleSeat(bot.id)} onClick={() => toggle(bot.id)}
                      className={cn("flex items-center gap-2 rounded-lg px-2 py-1 text-[12.5px] hover:bg-raised/60", !visibleSeat(bot.id) && "opacity-45")}>
                      <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: bot.color }} />
                      <span className="max-w-[10rem] truncate text-ink">{bot.name}</span>
                      <span className="tabular-nums text-ink-secondary">{totalsText(mine, active)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {view === "chart" ? (
              <UsageChart
                bars={bars}
                bots={bots.filter((bot) => visibleSeat(bot.id))}
                metric={active}
                format={(value) => formatMetric(value, active)}
                axis={(value, fractional) => axisMetric(value, active, fractional)}
                barLabel={(bar) => barLabel(plan, bar)}
                barTitle={(bar) => barTitle(plan, bar)}
              />
            ) : (
              <UsageTable
                bars={bars}
                bots={bots.filter((bot) => visibleSeat(bot.id))}
                metric={active}
                format={(value) => formatMetric(value, active)}
                barTitle={(bar) => barTitle(plan, bar)}
                wholePeriod={total}
              />
            )}
            {active === "cost" && unpriced > 0 && <p className="mt-3 text-[12px] text-ink-tertiary">{t("usage.v.unpriced", { count: integer(unpriced) })}</p>}
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="min-w-0 rounded-2xl border border-hairline/50 bg-card px-5 pb-3 pt-4" aria-labelledby="usage-bot-title">
              <h2 id="usage-bot-title" className="text-[15px] font-semibold">{t("usage.v.byBot")}</h2>
              <p className="mt-0.5 text-[12.5px] text-ink-secondary">{t("usage.v.botHint")}</p>
              <RankList items={byBot} metric={active} format={(value) => formatMetric(value, active)} onPick={solo} pickLabel={(name) => t("usage.v.onlyBot", { name })} />
            </section>
            <section className="min-w-0 rounded-2xl border border-hairline/50 bg-card px-5 pb-3 pt-4" aria-labelledby="usage-model-title">
              <h2 id="usage-model-title" className="text-[15px] font-semibold">{t("usage.v.byModel")}</h2>
              <p className="mt-0.5 text-[12.5px] text-ink-secondary">{t("usage.v.modelHint")}</p>
              <RankList items={byModel} metric={active} format={(value) => formatMetric(value, active)} />
            </section>
          </div>

          <UsageRuns range={range} bots={runBots} />
          <UsagePlans />
          <UsageBudgetCards budget={budget} />
        </div>
      </div>
    </main>
  );
}

function BotFilter({ bots, selection, onToggle, onAll }: {
  bots: ReadonlyArray<{ id: string; name: string; color: string }>;
  selection: Set<string> | null;
  onToggle(id: string): void;
  onAll(): void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", escape); };
  }, [open]);
  const chosen = selection === null ? bots : bots.filter((bot) => selection.has(bot.id));
  const label = selection === null ? t("usage.v.allBots")
    : chosen.length === 1 ? chosen[0]!.name : t("usage.v.botsOf", { count: String(chosen.length), total: String(bots.length) });
  return (
    <div ref={root} className="relative">
      <button type="button" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-xl border border-hairline/60 bg-card px-3 py-1.5 text-[13px] text-ink hover:bg-raised/60">
        <span aria-hidden className="flex">
          {chosen.slice(0, 5).map((bot, index) => <span key={bot.id} className={cn("size-2.5 rounded-full ring-2 ring-card", index > 0 && "-ml-[3px]")} style={{ background: bot.color }} />)}
        </span>
        <span className="max-w-[12rem] truncate">{label}</span>
        <ChevronDown size={13} className="text-ink-secondary" />
      </button>
      {open && (
        <div role="group" aria-label={t("usage.v.bots")} className="absolute right-0 top-[calc(100%+6px)] z-30 w-64 rounded-xl border border-hairline bg-menu p-1.5 shadow-xl">
          <ul className="max-h-72 overflow-y-auto">
            {bots.map((bot) => {
              const on = selection === null || selection.has(bot.id);
              return (
                <li key={bot.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] hover:bg-raised/60">
                    <input type="checkbox" checked={on} onChange={() => onToggle(bot.id)} className="size-4 accent-[var(--color-ink)]" />
                    <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: bot.color }} />
                    <span className="min-w-0 truncate">{bot.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="mt-1 flex border-t border-hairline/60 pt-1">
            <button type="button" onClick={onAll} disabled={selection === null}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12.5px] text-ink-secondary hover:bg-raised/60 hover:text-ink disabled:opacity-50">
              <Check size={13} />{t("usage.v.selectAll")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
