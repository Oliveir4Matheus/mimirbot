import { t } from "@/lib/i18n";
import { barTotals, metricValue, type SeriesBar, type SeriesBot, type Totals, type UsageMetric } from "@/lib/usage-series";

const NONE: Totals = { cost: null, input: 0, output: 0, cachedInput: 0, runs: 0, errors: 0 };

/** The chart's numbers as a table: every value the chart or its readout shows is here. */
export function UsageTable({ bars, bots, metric, format, barTitle, wholePeriod }: {
  bars: readonly SeriesBar[];
  bots: readonly SeriesBot[];
  metric: UsageMetric;
  format(value: number): string;
  barTitle(bar: SeriesBar): string;
  wholePeriod: Totals;
}) {
  const cell = "whitespace-nowrap border-b border-hairline/40 px-3 py-2 text-right tabular-nums first:text-left";
  const sums = (bot: SeriesBot) => {
    const mine: Totals = { ...NONE };
    for (const bar of bars) {
      const totals = bar.byBot.get(bot.id);
      if (!totals) continue;
      mine.input += totals.input; mine.output += totals.output; mine.cachedInput += totals.cachedInput; mine.runs += totals.runs; mine.errors += totals.errors;
      if (totals.cost !== null) mine.cost = (mine.cost ?? 0) + totals.cost;
    }
    return mine;
  };
  return (
    <div className="mt-2 max-h-[22rem] overflow-auto rounded-xl border border-hairline/50" data-testid="usage-table">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="text-[12px] text-ink-secondary">
            <th scope="col" className={`${cell} sticky top-0 bg-card font-medium`}>{t("usage.v.periodColumn")}</th>
            {bots.map((bot) => (
              <th key={bot.id} scope="col" className={`${cell} sticky top-0 bg-card font-medium`}>
                <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-[2px]" style={{ background: bot.color }} />{bot.name}</span>
              </th>
            ))}
            <th scope="col" className={`${cell} sticky top-0 bg-card font-semibold text-ink`}>{t("usage.v.total")}</th>
          </tr>
        </thead>
        <tbody>
          {[...bars].reverse().map((bar) => (
            <tr key={bar.slot.key}>
              <th scope="row" className={`${cell} text-left font-normal text-ink-secondary`}>{barTitle(bar)}</th>
              {bots.map((bot) => {
                const value = metricValue(bar.byBot.get(bot.id) ?? NONE, metric);
                return <td key={bot.id} className={cell}>{value > 0 ? format(value) : "–"}</td>;
              })}
              <td className={`${cell} font-medium text-ink`}>{format(metricValue(barTotals(bar), metric))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold text-ink">
            <th scope="row" className={`${cell} text-left`}>{t("usage.v.wholePeriod")}</th>
            {bots.map((bot) => <td key={bot.id} className={cell}>{format(metricValue(sums(bot), metric))}</td>)}
            <td className={cell}>{format(metricValue(wholePeriod, metric))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
