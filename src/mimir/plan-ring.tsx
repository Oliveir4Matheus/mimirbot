import { useEffect, useState } from "react";

import { ProviderMark } from "@/components/ProviderIcons";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { api } from "@/state/store";

export interface PlanWindow { available: boolean; remainingPercent: number | null; resetsAt?: string | null }
export interface PlanProvider {
  id?: string;
  name: string;
  driver: string;
  plan?: string | null;
  ok: boolean;
  error?: string | null;
  connected: boolean;
  fiveHour: PlanWindow;
  weekly: PlanWindow;
}

const PLAN_POLL_MS = 5 * 60_000;
export const PLAN_DRIVER_MARK: Record<string, string> = { claude: "claudeAgent", antigravity: "antigravityAgent" };

/** The plan providers worth a ring: connected ones, or any that reported a window; one per engine. */
export function useOnePlanPerEngine(): PlanProvider[] {
  const [providers, setProviders] = useState<PlanProvider[]>([]);
  useEffect(() => {
    let live = true;
    const load = () => api<{ providers: PlanProvider[] }>("/api/plan-usage")
      .then((report) => {
        if (!live) return;
        const seen = new Set<string>();
        setProviders(report.providers.filter((p) => {
          if (!(p.connected || (p.ok && (p.fiveHour.available || p.weekly.available))) || seen.has(p.driver)) return false;
          seen.add(p.driver);
          return true;
        }));
      })
      .catch(() => {});
    void load();
    const timer = window.setInterval(load, PLAN_POLL_MS);
    return () => { live = false; window.clearInterval(timer); };
  }, []);
  return providers;
}

export function remainingOf(win: PlanWindow): number | null {
  return win.available && win.remainingPercent !== null ? Math.max(0, Math.min(100, win.remainingPercent)) : null;
}

export function ringTone(remaining: number): string {
  return remaining > 50 ? "stroke-success" : remaining > 20 ? "stroke-warning" : "stroke-danger";
}

function RemainingRing({ radius, width, window: win }: { radius: number; width: number; window: PlanWindow }) {
  const circumference = 2 * Math.PI * radius;
  const remaining = remainingOf(win);
  return (
    <>
      <circle cx="20" cy="20" r={radius} fill="none" strokeWidth={width} className="stroke-raised" />
      {remaining !== null && remaining > 0 && (
        <circle
          cx="20" cy="20" r={radius} fill="none" strokeWidth={width} strokeLinecap="round"
          strokeDasharray={`${(remaining / 100) * circumference} ${circumference}`}
          transform="rotate(-90 20 20)"
          className={ringTone(remaining)}
        />
      )}
    </>
  );
}

export function windowLabel(name: string, win: PlanWindow): string | null {
  return win.available && win.remainingPercent !== null ? `${name}: ${t("planUsage.left", { remaining: win.remainingPercent })}` : null;
}

export function planLabel(provider: PlanProvider): string {
  const windows = [windowLabel(t("planUsage.fiveHour"), provider.fiveHour), windowLabel(t("planUsage.weekly"), provider.weekly)].filter(Boolean);
  return [provider.name, ...(windows.length ? windows : [t("planUsage.notShared")])].filter(Boolean).join(" · ");
}

/** Two rings, the weekly allowance outside and the 5-hour one inside, around the provider's mark. The rail draws it at 40px. */
export function PlanRingGraphic({ provider, size, className }: { provider: PlanProvider; size: number; className?: string }) {
  return (
    <span className={cn("relative flex shrink-0 items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg viewBox="0 0 40 40" aria-hidden="true" className="absolute inset-0 size-full">
        <RemainingRing radius={17} width={2.7} window={provider.weekly} />
        <RemainingRing radius={12.5} width={2.2} window={provider.fiveHour} />
      </svg>
      <ProviderMark driverKind={PLAN_DRIVER_MARK[provider.driver] ?? provider.driver} size={Math.round(size * 0.35)} className="relative text-ink" />
    </span>
  );
}
