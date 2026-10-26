import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { t } from "@/lib/i18n";
import { barTotals, metricValue, niceTicks, type SeriesBar, type SeriesBot, type UsageMetric } from "@/lib/usage-series";

const MAX_BAR = 24;
const GAP = 2;
const TOP = 26;
const BOTTOM = 26;

interface Props {
  bars: readonly SeriesBar[];
  /** Bots in stacking order, bottom first. */
  bots: readonly SeriesBot[];
  metric: UsageMetric;
  format(value: number): string;
  axis(value: number, fractional: boolean): string;
  barLabel(bar: SeriesBar): string;
  barTitle(bar: SeriesBar): string;
}

function useWidth(ref: { current: HTMLElement | null }): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const read = () => setWidth(Math.round(node.clientWidth));
    read();
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

function roundedTop(x: number, y: number, width: number, height: number, radius: number): string {
  const r = Math.min(radius, width / 2, height);
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

/** Stacked columns, one segment per bot, with a crosshair and a readout that lists every bot at the bar under the pointer. */
export function UsageChart({ bars, bots, metric, format, axis, barLabel, barTitle }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const width = useWidth(host);
  const [active, setActive] = useState<number | null>(null);

  const totals = bars.map((bar) => metricValue(barTotals(bar), metric));
  const max = Math.max(0, ...totals);
  const whole = metric === "runs" || metric === "errors";
  const ticks = niceTicks(max, whole);
  const top = ticks[ticks.length - 1] ?? 1;
  const narrow = width < 520;
  const height = narrow ? 230 : 300;
  const fractional = ticks.some((tick) => !Number.isInteger(tick));
  const left = Math.max(40, 12 + 7 * Math.max(...ticks.map((tick) => axis(tick, fractional).length)));
  const right = 6;
  const plotWidth = Math.max(1, width - left - right);
  const plotHeight = height - TOP - BOTTOM;
  const slot = plotWidth / Math.max(1, bars.length);
  const barWidth = Math.max(2, Math.min(MAX_BAR, Math.floor(slot * 0.7)));
  const y = (value: number) => TOP + plotHeight - (value / top) * plotHeight;
  const center = (index: number) => left + slot * index + slot / 2;
  const peak = totals.indexOf(max);
  const every = Math.max(1, Math.ceil(bars.length / Math.max(2, Math.floor(plotWidth / 58))));

  const pick = (clientX: number) => {
    const box = host.current?.getBoundingClientRect();
    if (!box || !bars.length) return;
    setActive(Math.max(0, Math.min(bars.length - 1, Math.floor((clientX - box.left - left) / slot))));
  };
  const onKey = (event: KeyboardEvent) => {
    const last = bars.length - 1;
    const next = event.key === "ArrowRight" ? (active === null ? 0 : Math.min(last, active + 1))
      : event.key === "ArrowLeft" ? (active === null ? last : Math.max(0, active - 1))
      : event.key === "Home" ? 0 : event.key === "End" ? last : null;
    if (event.key === "Escape") { setActive(null); return; }
    if (next === null) return;
    event.preventDefault();
    setActive(next);
  };

  const shown = active !== null && active < bars.length ? bars[active] : null;
  const readout = shown && bots
    .map((bot) => ({ bot, value: metricValue(shown.byBot.get(bot.id) ?? { cost: null, input: 0, output: 0, cachedInput: 0, runs: 0, errors: 0 }, metric) }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);
  const shownTotals = shown ? barTotals(shown) : null;
  const flip = active !== null && center(active) > width * 0.6;

  return (
    <div
      ref={host}
      tabIndex={0}
      role="group"
      aria-label={t("usage.v.chartAria")}
      onKeyDown={onKey}
      onBlur={() => setActive(null)}
      className="relative rounded-lg outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
      data-testid="usage-chart"
    >
      {max <= 0 ? (
        <p className="px-1 py-10 text-[13px] text-ink-secondary">{t("usage.v.noUsage")}</p>
      ) : width > 0 && (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block overflow-visible" aria-hidden="true">
          {ticks.map((tick, index) => (
            <g key={tick}>
              <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className={index === 0 ? "stroke-ink-tertiary/50" : "stroke-hairline/60"} strokeWidth={1} />
              <text x={left - 8} y={y(tick) + 4} textAnchor="end" fontSize={11} className="fill-ink-secondary">{axis(tick, fractional)}</text>
            </g>
          ))}
          {active !== null && shown && (
            <>
              <rect x={left + slot * active} y={TOP} width={slot} height={plotHeight} className="fill-ink/5" />
              <line x1={center(active)} x2={center(active)} y1={TOP} y2={TOP + plotHeight} className="stroke-ink-tertiary" strokeWidth={1} />
            </>
          )}
          {bars.map((bar, index) => {
            let floor = y(0);
            const segments: Array<{ bot: SeriesBot; top: number; height: number }> = [];
            for (const bot of bots) {
              const value = metricValue(bar.byBot.get(bot.id) ?? { cost: null, input: 0, output: 0, cachedInput: 0, runs: 0, errors: 0 }, metric);
              if (value <= 0) continue;
              const full = (value / top) * plotHeight;
              const topEdge = floor - full;
              segments.push({ bot, top: topEdge, height: Math.max(1, segments.length ? full - GAP : full) });
              floor = topEdge;
            }
            const x = center(index) - barWidth / 2;
            return (
              <g key={bar.slot.key}>
                {segments.map((segment, at) => at === segments.length - 1 && segment.height >= 3
                  ? <path key={segment.bot.id} d={roundedTop(x, segment.top, barWidth, segment.height, 4)} fill={segment.bot.color} />
                  : <rect key={segment.bot.id} x={x} y={segment.top} width={barWidth} height={segment.height} fill={segment.bot.color} />)}
              </g>
            );
          })}
          {bars.length > 1 && (
            <text
              x={center(peak) + (center(peak) < left + 40 ? -6 : center(peak) > width - right - 40 ? 6 : 0)}
              y={y(max) - 7}
              textAnchor={center(peak) < left + 40 ? "start" : center(peak) > width - right - 40 ? "end" : "middle"}
              fontSize={11.5}
              fontWeight={600}
              className="fill-ink"
            >{format(max)}</text>
          )}
          {bars.map((bar, index) => index % every === 0 && (
            <text key={bar.slot.key} x={center(index)} y={height - 8} textAnchor="middle" fontSize={11} className="fill-ink-secondary">{barLabel(bar)}</text>
          ))}
          <rect
            x={left} y={0} width={plotWidth} height={height} fill="transparent" style={{ touchAction: "pan-y" }}
            onPointerMove={(event) => pick(event.clientX)}
            onPointerDown={(event) => pick(event.clientX)}
            onPointerLeave={() => setActive(null)}
          />
        </svg>
      )}
      {shown && readout && shownTotals && (
        <div
          role="status"
          className="pointer-events-none absolute z-20 w-max min-w-[11.5rem] max-w-[17rem] rounded-xl border border-hairline bg-menu px-3 py-2.5 text-[12.5px] shadow-xl"
          style={{ top: 4, ...(flip ? { right: width - center(active!) + 14 } : { left: center(active!) + 14 }) }}
        >
          <div className="text-[12px] text-ink-secondary">{barTitle(shown)}</div>
          <div className="mb-1.5 mt-0.5 flex items-baseline justify-between gap-4 border-b border-hairline/60 pb-1.5">
            <span className="text-ink-secondary">{t("usage.v.total")}</span>
            <strong className="text-[15px] tabular-nums text-ink">{format(metricValue(shownTotals, metric))}</strong>
          </div>
          {readout.map(({ bot, value }) => (
            <div key={bot.id} className="flex items-center gap-2 py-px">
              <span aria-hidden className="h-[3px] w-3 shrink-0 rounded-full" style={{ background: bot.color }} />
              <span className="min-w-0 truncate text-ink-secondary">{bot.name}</span>
              <strong className="ml-auto pl-3 font-semibold tabular-nums text-ink">{format(value)}</strong>
            </div>
          ))}
          <div className="mt-1.5 border-t border-hairline/60 pt-1.5 text-[11.5px] text-ink-tertiary">
            {t("usage.v.runsFailed", { runs: String(shownTotals.runs), failed: String(shownTotals.errors) })}
          </div>
        </div>
      )}
    </div>
  );
}
