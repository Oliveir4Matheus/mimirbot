import type { CSSProperties } from "react";
import { t } from "@/lib/i18n";
import { metricValue, percentChange, type Totals, type UsageMetric } from "@/lib/usage-series";

export interface RankItem {
  id: string;
  name: string;
  sub?: string;
  color: string;
  current: Totals;
  previous: Totals;
}

const BAR_SHARE = 0.7;

function Change({ current, previous }: { current: number; previous: number }) {
  const change = percentChange(current, previous);
  if (change === null || Math.abs(change) < 0.5) return <span aria-hidden className="text-ink-tertiary">–</span>;
  const amount = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Math.abs(change));
  return <span className="font-semibold text-ink" aria-label={t(change > 0 ? "usage.v.up" : "usage.v.down", { percent: amount })}><span aria-hidden>{change > 0 ? "▲" : "▼"} {amount}%</span></span>;
}

/** Horizontal bars, longest first, each with its value at the tip and its change against the previous stretch. */
export function RankList({ items, metric, format, onPick, pickLabel }: {
  items: readonly RankItem[];
  metric: UsageMetric;
  format(value: number): string;
  onPick?(id: string): void;
  pickLabel?(name: string): string;
}) {
  const rows = items.map((item) => ({ item, value: metricValue(item.current, metric), before: metricValue(item.previous, metric) }))
    .filter((row) => row.value > 0).sort((a, b) => b.value - a.value);
  const max = Math.max(1e-9, ...rows.map((row) => row.value));
  const sum = rows.reduce((total, row) => total + row.value, 0);
  if (!rows.length) return <p className="py-6 text-[13px] text-ink-secondary">{t("usage.page.whereEmpty")}</p>;
  return (
    <ul className="mt-3 flex flex-col gap-0.5">
      {rows.map(({ item, value, before }) => {
        const content = (
          <>
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: item.color }} />
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] text-ink">{item.name}</span>
                {item.sub && <span className="block truncate text-[11.5px] text-ink-tertiary">{item.sub}</span>}
              </span>
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden
                className="h-2.5 w-[var(--bar)] shrink-0 rounded-r-[4px] max-sm:w-[var(--bar-narrow)]"
                style={{ "--bar": `${Math.max(1, (value / max) * BAR_SHARE * 100)}%`, "--bar-narrow": `${Math.max(1, (value / max) * 42)}%`, minWidth: 2, background: item.color } as CSSProperties}
              />
              <span className="whitespace-nowrap text-[13px] tabular-nums text-ink">{format(value)}<small className="ml-1.5 text-[12px] text-ink-secondary">{Math.round((value / sum) * 100)}%</small></span>
            </span>
            <span className="text-right text-[12.5px] tabular-nums max-sm:hidden"><Change current={value} previous={before} /></span>
          </>
        );
        const detail = `${item.name}: ${format(value)} · ${t("usage.v.runsFailed", { runs: String(item.current.runs), failed: String(item.current.errors) })} · ${t("usage.v.share", { percent: String(Math.round((value / sum) * 100)) })}`;
        const grid = "grid w-full grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_3.6rem] items-center gap-3 rounded-lg px-2 py-2 text-left max-sm:grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)]";
        return (
          <li key={item.id}>
            {onPick
              ? <button type="button" onClick={() => onPick(item.id)} title={pickLabel ? `${pickLabel(item.name)} — ${detail}` : detail} className={`${grid} hover:bg-raised/60`}>{content}</button>
              : <div title={detail} className={grid}>{content}</div>}
          </li>
        );
      })}
    </ul>
  );
}
