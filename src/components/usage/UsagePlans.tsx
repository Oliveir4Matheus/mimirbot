import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { PlanRingGraphic, remainingOf, useOnePlanPerEngine, type PlanProvider, type PlanWindow } from "@/mimir/plan-ring";
import { formatResetDistance, providerError, providerLabel } from "../PlanUsage";

const RING_SIZE = 124;

function toneDot(remaining: number): string {
  return remaining > 50 ? "bg-success" : remaining > 20 ? "bg-warning" : "bg-danger";
}

function WindowLine({ label, window: win, now }: { label: string; window: PlanWindow; now: number }) {
  const remaining = remainingOf(win);
  const when = win.available ? formatResetDistance(win.resetsAt ?? null, now) : null;
  return (
    <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-baseline gap-x-3">
      <span className="flex items-center gap-2 text-[12.5px] text-ink-secondary">
        <span aria-hidden className={cn("size-2 shrink-0 rounded-full", remaining === null ? "bg-raised" : toneDot(remaining))} />
        {label}
      </span>
      {remaining === null ? (
        <span className="text-[12.5px] text-ink-secondary">{t("planUsage.notReported")}</span>
      ) : (
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[17px] font-semibold tabular-nums text-ink">{t("planUsage.left", { remaining: String(Math.round(remaining)) })}</span>
          {when && <span className="text-[12px] text-ink-secondary">{t("planUsage.resetsIn", { when })}</span>}
        </span>
      )}
    </div>
  );
}

function PlanCard({ provider, now }: { provider: PlanProvider; now: number }) {
  const error = provider.ok ? null : providerError({ error: provider.error ?? null });
  return (
    <li className="flex min-w-0 items-center gap-5 rounded-2xl border border-hairline/50 bg-card p-5">
      <PlanRingGraphic provider={provider} size={RING_SIZE} />
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold text-ink">{providerLabel(provider)}</div>
          {provider.plan && <div className="truncate text-[12.5px] text-ink-secondary">{provider.plan}</div>}
        </div>
        {error ? <p className="text-[13px] text-danger">{error}</p> : (
          <>
            <WindowLine label={t("planUsage.fiveHour")} window={provider.fiveHour} now={now} />
            <WindowLine label={t("planUsage.weekly")} window={provider.weekly} now={now} />
          </>
        )}
      </div>
    </li>
  );
}

/** The rail's plan rings, drawn large, with what each ring means beside it. */
export function UsagePlans() {
  const providers = useOnePlanPerEngine();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  if (!providers.length) return null;
  return (
    <section aria-labelledby="usage-plans-title" data-testid="usage-plans">
      <h2 id="usage-plans-title" className="text-[15px] font-semibold text-ink">{t("usage.v.plansTitle")}</h2>
      <p className="mb-3 mt-0.5 text-[12.5px] text-ink-secondary">{t("usage.v.plansHint")}</p>
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))] gap-3">
        {providers.map((provider) => <PlanCard key={provider.driver} provider={provider} now={now} />)}
      </ul>
    </section>
  );
}
