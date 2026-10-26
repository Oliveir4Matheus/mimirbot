import { useEffect, useRef, useState } from "react";
import { ArrowDownUp, ArrowLeft, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { activeLocale, documentLanguage, t } from "@/lib/i18n";
import { listenLiveFrames } from "@/lib/live-events";
import { fetchTraces, formatCost, formatDuration } from "@/lib/usage-trace";
import type { LocaleKey } from "@/locales";
import { useStore } from "@/state/store";
import { TRACE_SORTS, type TraceList, type TraceRootSummary, type TraceSort } from "../../shared/usage-trace";
import { BotAvatar } from "./Avatar";
import { TraceView } from "./usage/TraceView";
import { LiveBadge } from "./usage/TraceWaterfall";

export type UsageGroupBy = "bot" | "model" | "user" | "day" | "engine" | "routine";

export function usageGroupLabel(groupBy: UsageGroupBy, group: { key: string; label: string }): string {
  if (groupBy === "routine") return group.key === "manual" ? t("usage.history.notRoutine") : group.label;
  if (groupBy !== "user") return group.label;
  if (group.key === "owner") return t("usage.history.owner");
  if (group.key === "bot") return t("usage.history.botToBot");
  if (group.key.startsWith("routine:")) return t("usage.history.routine", { name: group.label.replace(/^Routine: /, "") });
  return group.label;
}

const LIVE_REFRESH_MS = 2_000;

function startedLabel(at: number): string {
  return new Date(at).toLocaleString(documentLanguage(activeLocale()), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function RunRow({ root, onOpen }: { root: TraceRootSummary; onOpen: () => void }) {
  const { state } = useStore();
  const title = root.title || t(`trace.source.${root.source}`, { bot: root.bots[0]?.name ?? "" });
  return (
    <li>
      <button type="button" onClick={onOpen} className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-raised/50" data-testid="usage-run">
        <span className="flex w-[38px] shrink-0 -space-x-1.5 sm:w-[74px]">
          {root.bots.slice(0, 4).map((entry, index) => {
            const bot = state.bots.find((item) => item.id === entry.id);
            return bot
              ? <span key={entry.id} className={cn("rounded-full ring-2 ring-card", index > 1 && "hidden sm:block")}><BotAvatar bot={bot} state="idle" size={22} animated={false} /></span>
              : <span key={entry.id} className={cn("flex size-[22px] items-center justify-center rounded-full bg-raised text-[10px] font-semibold text-ink-secondary ring-2 ring-card", index > 1 && "hidden sm:flex")}>{entry.name.slice(0, 1).toUpperCase()}</span>;
          })}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] text-ink">{title}</span>
          <span className="block truncate text-[12px] text-ink-tertiary">{startedLabel(root.startedAt)} · {root.bots.map((bot) => bot.name).join(", ")}</span>
        </span>
        <span className="flex items-center gap-3 text-[12.5px] tabular-nums text-ink-secondary">
          {root.running && <LiveBadge />}
          {root.errors > 0 && <span className="rounded-md bg-danger/12 px-1.5 py-0.5 text-[11.5px] font-medium text-danger">{t("trace.groupErrors", { count: String(root.errors) })}</span>}
          {root.timed ? <span className="hidden min-w-[3.5rem] text-right sm:inline">{formatDuration(root.durationMs)}</span>
            : <span className="hidden rounded bg-raised px-1.5 text-[11px] sm:inline">{t("trace.notTimed")}</span>}
          <span className="min-w-[3.5rem] text-right text-ink">{formatCost(root.costUsd)}</span>
          <ChevronRight size={14} className="text-ink-tertiary" />
        </span>
      </button>
    </li>
  );
}

const PAGE_SIZE = 10;
const whole = (value: number) => new Intl.NumberFormat(documentLanguage(activeLocale())).format(value);
const SORT_LABELS: Record<TraceSort, LocaleKey> = {
  recent: "usage.v.sort.recent", oldest: "usage.v.sort.oldest", cost: "usage.v.sort.cost", duration: "usage.v.sort.duration",
};

function SortMenu({ value, onChange }: { value: TraceSort; onChange(sort: TraceSort): void }) {
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
  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={t("usage.v.sortBy")}
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-1.5 rounded-lg border border-hairline/60 px-2.5 py-1.5 text-[12.5px] text-ink hover:bg-raised/60"
      >
        <ArrowDownUp size={13} className="text-ink-secondary" />
        <span className="max-sm:hidden">{t(SORT_LABELS[value])}</span>
      </button>
      {open && (
        <div role="menu" aria-label={t("usage.v.sortBy")} className="absolute right-0 top-[calc(100%+6px)] z-30 w-48 rounded-xl border border-hairline bg-menu p-1.5 shadow-xl">
          {TRACE_SORTS.map((option) => (
            <button
              key={option}
              type="button"
              role="menuitemradio"
              aria-checked={option === value}
              onClick={() => { onChange(option); setOpen(false); }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-ink hover:bg-raised/60"
            >
              <Check size={13} className={cn("shrink-0", option === value ? "opacity-100" : "opacity-0")} />
              {t(SORT_LABELS[option])}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The period's runs as traces, ten to a page; `bots` keeps only the runs that involved one of them. */
export function UsageRuns({ range, bots }: { range: { from: string; to: string }; bots?: readonly string[] }) {
  const [list, setList] = useState<TraceList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [open, setOpen] = useState<{ id: string; at: number } | null>(null);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<TraceSort>("recent");
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const botsKey = bots?.join(",");

  useEffect(() => {
    let current = true;
    void fetchTraces(range, { offset: page * PAGE_SIZE, limit: PAGE_SIZE, sort, ...(botsKey === undefined ? {} : { bots: botsKey.split(",").filter(Boolean) }) })
      .then((next) => {
        if (!current) return;
        const last = Math.max(0, Math.ceil(next.count / PAGE_SIZE) - 1);
        if (page > last) setPage(last); else { setList(next); setError(null); }
      })
      .catch((cause) => { if (current) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { current = false; };
  }, [range, botsKey, sort, page, version]);

  useEffect(() => { setPage(0); setOpen(null); }, [range, botsKey, sort]);

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

  const roots = list?.roots ?? [];
  const count = list?.count ?? 0;
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const untimed = roots.some((root) => !root.timed);

  if (open) {
    return (
      <TraceView id={open.id} at={open.at} actions={(
        <button type="button" onClick={() => setOpen(null)} className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[12.5px] text-ink-secondary hover:bg-raised hover:text-ink">
          <ArrowLeft size={13} />{t("trace.back")}
        </button>
      )} />
    );
  }
  const step = "flex size-8 items-center justify-center rounded-lg border border-hairline/60 text-ink hover:bg-raised/60 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <section className="rounded-2xl border border-hairline/50 bg-card p-2" aria-label={t("usage.page.runs")}>
      <div className="flex items-start gap-3 px-3 pb-1 pt-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-medium text-ink">{t("usage.page.runs")}</h3>
          <p className="mt-0.5 text-[13px] text-ink-secondary">{t("usage.page.runsHint")}</p>
        </div>
        <SortMenu value={sort} onChange={setSort} />
      </div>
      {error && <p role="alert" className="px-3 py-2 text-[12px] text-danger">{error}</p>}
      {list && !roots.length && <p className="px-3 py-3 text-[13px] text-ink-secondary">{t("usage.page.runsEmpty")}</p>}
      <ul className="mt-1 flex flex-col">
        {roots.map((root) => <RunRow key={root.id} root={root} onOpen={() => setOpen({ id: root.id, at: root.startedAt })} />)}
      </ul>
      {count > 0 && (
        <nav aria-label={t("usage.page.runs")} className="flex items-center justify-between gap-3 px-3 pb-2 pt-2">
          <span className="text-[12.5px] tabular-nums text-ink-secondary">
            {t("usage.v.range", { from: whole(page * PAGE_SIZE + 1), to: whole(Math.min(count, (page + 1) * PAGE_SIZE)), total: whole(count) })}
          </span>
          <span className="flex items-center gap-2">
            <span className="text-[12.5px] tabular-nums text-ink-secondary max-sm:hidden">{t("usage.v.pageOf", { page: whole(page + 1), pages: whole(pages) })}</span>
            <button type="button" className={step} disabled={page === 0} onClick={() => setPage(page - 1)} aria-label={t("usage.v.prevPage")} title={t("usage.v.prevPage")}>
              <ChevronLeft size={15} />
            </button>
            <button type="button" className={step} disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label={t("usage.v.nextPage")} title={t("usage.v.nextPage")}>
              <ChevronRight size={15} />
            </button>
          </span>
        </nav>
      )}
      {untimed && <p className="px-3 pb-3 pt-1 text-[12px] text-ink-tertiary">{t("usage.page.untimedNote")}</p>}
    </section>
  );
}
