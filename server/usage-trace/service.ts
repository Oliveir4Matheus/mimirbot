// Answers the trace routes: the period's roots with totals, and one root's span tree, limited to the threads a viewer may see.
import type { TraceDetail, TraceList, TraceRootSummary, TraceSort } from "../../shared/usage-trace.ts";
import type { WireMessage } from "../../shared/wire.ts";
import { ledgerRows } from "./ledger.ts";
import { addTotals, emptyTotals, linkTurns, summarizeRoot, subtree, traceTurn, type LiveBot, type TurnNode } from "./build.ts";
import type { TraceRecorder } from "./recorder.ts";
import { daysBetween, readSpans } from "./spans.ts";

export interface TraceServiceDeps {
  dataDir: string;
  recorder: Pick<TraceRecorder, "liveTurns">;
  liveBot(threadId: string): LiveBot | null;
  messages(threadId: string): readonly Pick<WireMessage, "id" | "role" | "kind" | "text" | "turnId" | "requestMessageId" | "at">[];
  now?: () => number;
}

const DAY_MS = 24 * 60 * 60_000;
const TITLE_MAX = 140;
/** A child or a resumed turn can land days after the turn it belongs to. */
const LINK_SLACK_MS = 3 * DAY_MS;
export const PAGE_MAX = 100;

const clip = (text: string) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > TITLE_MAX ? `${flat.slice(0, TITLE_MAX - 1)}…` : flat;
};

export function createTraceService(deps: TraceServiceDeps) {
  const now = deps.now ?? Date.now;

  function titleOf(root: TurnNode): string {
    if (root.trigger?.kind === "routine") return root.trigger.label ?? root.trigger.routineId ?? "";
    const messages = deps.messages(root.threadId);
    const request = root.turnId ? messages.find((message) => message.turnId === root.turnId && message.requestMessageId)?.requestMessageId : undefined;
    const asked = request ? messages.find((message) => message.id === request)
      : messages.findLast((message) => message.role === "user" && message.kind === "text" && message.at <= root.startedAt + 1_000);
    return asked?.text ? clip(asked.text) : "";
  }

  /** Visible roots, newest first, each limited to the turns in threads the viewer may see. */
  async function roots(from: number, to: number, visible: (threadId: string) => boolean): Promise<TurnNode[]> {
    const rows = await ledgerRows(deps.dataDir, from - LINK_SLACK_MS, to + LINK_SLACK_MS);
    const prune = (node: TurnNode) => { node.children = node.children.filter((child) => visible(child.threadId)); node.children.forEach(prune); };
    return linkTurns(rows, deps.recorder.liveTurns(), deps.liveBot)
      .filter((root) => root.startedAt >= from && root.startedAt <= to && visible(root.threadId))
      .map((root) => { prune(root); return root; })
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  /** Money and time sort high to low, with the newest first among equals; a run with no price sorts last. */
  const ORDER: Record<TraceSort, (a: TraceRootSummary, b: TraceRootSummary) => number> = {
    recent: (a, b) => b.startedAt - a.startedAt,
    oldest: (a, b) => a.startedAt - b.startedAt,
    cost: (a, b) => (b.costUsd ?? -1) - (a.costUsd ?? -1) || b.startedAt - a.startedAt,
    duration: (a, b) => b.durationMs - a.durationMs || b.startedAt - a.startedAt,
  };

  /** `bots` keeps the runs that involved at least one of those bots; `sort` orders the whole match before the page is cut. */
  async function list(
    range: { from: Date; to: Date },
    page: { offset: number; limit: number; sort?: TraceSort; bots?: ReadonlySet<string> },
    visible: (threadId: string) => boolean,
  ): Promise<TraceList> {
    const found = await roots(range.from.getTime(), range.to.getTime(), visible);
    const totals = emptyTotals();
    const at = now();
    const matched = found
      .map((root) => ({ root, summary: summarizeRoot(root, "", at) }))
      .filter(({ summary }) => !page.bots || summary.bots.some((bot) => page.bots!.has(bot.id)));
    for (const { summary } of matched) addTotals(totals, summary);
    matched.sort((a, b) => ORDER[page.sort ?? "recent"](a.summary, b.summary));
    const summaries = matched.slice(page.offset, page.offset + page.limit).map(({ root, summary }) => ({ ...summary, title: titleOf(root) }));
    const next = page.offset + page.limit;
    return { from: range.from.toISOString(), to: range.to.toISOString(), totals, roots: summaries, count: matched.length, ...(next < matched.length ? { next } : {}) };
  }

  /** The tree of the root holding `id`, which names a root or any turn under one; `around` is when it ran. */
  async function detail(id: string, around: number | null, visible: (threadId: string) => boolean): Promise<TraceDetail | null> {
    const at = now();
    const center = around ?? at;
    const found = await roots(center - LINK_SLACK_MS, Math.min(at, center + DAY_MS), visible);
    const key = id.startsWith("row~") ? `row:${decodeURIComponent(id.slice(4))}` : id.split("~").map(decodeURIComponent).join(":");
    const root = found.find((candidate) => subtree(candidate).some((node) => node.key === key));
    if (!root) return null;
    const nodes = subtree(root);
    const end = Math.max(...nodes.map((node) => node.running ? at : node.endedAt ?? node.startedAt));
    const spans = await readSpans(deps.dataDir, daysBetween(Math.min(...nodes.map((node) => node.startedAt)), end),
      new Set(nodes.filter((node) => node.turnId && !node.liveSpans).map((node) => node.key)));
    return { root: summarizeRoot(root, titleOf(root), at), turns: [traceTurn(root, spans)] };
  }

  return { list, detail };
}

export type TraceService = ReturnType<typeof createTraceService>;
