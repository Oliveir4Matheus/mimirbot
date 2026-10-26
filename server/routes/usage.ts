import { redactSecretsInText } from "../../shared/redact.ts";
import type { PriceList } from "../prices.ts";
import type { RequestAuth } from "../request-auth.ts";
import type { SpendState } from "../spend.ts";
import {
  flushUsageLedger,
  parseUsageRange,
  readUsage,
  summarizeUsage,
  usageCsv,
  usageSeries,
  USAGE_GROUPINGS,
  type UsageGroupBy,
} from "../usage-ledger.ts";
import { TRACE_SORTS, type TraceSort } from "../../shared/usage-trace.ts";
import { DETAIL_MAX, ERROR_MAX } from "../usage-trace/detail.ts";
import type { ToolReceipt, TraceRecorder } from "../usage-trace/recorder.ts";
import { createTraceService, PAGE_MAX, type TraceServiceDeps } from "../usage-trace/service.ts";
import { PASS, type RouteHandler } from "./table.ts";

export interface UsageRouteDeps {
  dataDir: string;
  prices(): PriceList | null;
  budget(): SpendState | null;
  currency(): string;
  recorder: TraceServiceDeps["recorder"];
  messages: TraceServiceDeps["messages"];
  liveBot: TraceServiceDeps["liveBot"];
  /** Which threads this viewer may read today; a trace shows only those. */
  canSee(auth: RequestAuth): (threadId: string) => boolean;
}

const DAY_MS = 24 * 60 * 60_000;
const MAX_BOT_FILTER = 200;
const TRACE = /^\/api\/usage\/traces\/([^/]{1,600})$/;

const whole = (raw: string | null, fallback: number, max: number): number | null => {
  if (raw === null) return fallback;
  return /^\d{1,7}$/.test(raw) && Number(raw) <= max ? Number(raw) : null;
};

export function createUsageRoutes(deps: UsageRouteDeps): RouteHandler {
  const traces = createTraceService({ dataDir: deps.dataDir, recorder: deps.recorder, messages: deps.messages, liveBot: deps.liveBot });
  return async ({ res, url, path, method, auth, json }) => {
    if (method === "GET" && path === "/api/usage/traces") {
      const range = parseUsageRange(url.searchParams.get("from"), url.searchParams.get("to"));
      if (!range) return json(res, 400, { error: "from and to must be YYYY-MM-DD, from no later than to, at most a year apart" });
      const offset = whole(url.searchParams.get("offset"), 0, 10_000_000);
      const limit = whole(url.searchParams.get("limit"), 50, PAGE_MAX);
      if (offset === null || !limit) return json(res, 400, { error: `offset must be a whole number and limit 1 to ${PAGE_MAX}` });
      await flushUsageLedger(deps.dataDir);
      res.setHeader("cache-control", "no-store");
      const sort = url.searchParams.get("sort") ?? "recent";
      if (!(TRACE_SORTS as readonly string[]).includes(sort)) return json(res, 400, { error: `sort must be one of ${TRACE_SORTS.join(", ")}` });
      const botsRaw = url.searchParams.get("bots");
      const bots = botsRaw === null ? undefined : new Set(botsRaw.split(",").filter(Boolean));
      if (bots && (bots.size > MAX_BOT_FILTER || [...bots].some((id) => id.length > 200))) return json(res, 400, { error: `bots takes at most ${MAX_BOT_FILTER} ids of 200 characters` });
      return json(res, 200, await traces.list(range, { offset, limit, sort: sort as TraceSort, ...(bots ? { bots } : {}) }, deps.canSee(auth)));
    }
    const trace = method === "GET" ? TRACE.exec(path) : null;
    if (trace) {
      let id: string;
      try { id = decodeURIComponent(trace[1]!); } catch { return json(res, 400, { error: "not a trace id" }); }
      const around = url.searchParams.get("at");
      if (around !== null && !/^\d{10,14}$/.test(around)) return json(res, 400, { error: "at must be a time in milliseconds" });
      await flushUsageLedger(deps.dataDir);
      const found = await traces.detail(id, around === null ? null : Number(around), deps.canSee(auth));
      res.setHeader("cache-control", "no-store");
      return found ? json(res, 200, found) : json(res, 404, { error: "no such trace" });
    }
    if (method === "GET" && path === "/api/usage/series") {
      const from = url.searchParams.get("from"), to = url.searchParams.get("to");
      const range = parseUsageRange(from, to);
      const bucket = url.searchParams.get("bucket") ?? "day";
      const tzRaw = url.searchParams.get("tz") ?? "0";
      const tz = /^-?\d{1,4}$/.test(tzRaw) ? Number(tzRaw) : NaN;
      if (!range || !from || !to) return json(res, 400, { error: "from and to must be YYYY-MM-DD, from no later than to, at most a year apart" });
      if (bucket !== "day" && bucket !== "hour") return json(res, 400, { error: "bucket must be day or hour" });
      if (!Number.isInteger(tz) || Math.abs(tz) > 840) return json(res, 400, { error: "tz must be the viewer's offset in minutes, as Date.getTimezoneOffset() returns it" });
      await flushUsageLedger(deps.dataDir);
      const widened = { from: new Date(range.from.getTime() - DAY_MS), to: new Date(range.to.getTime() + DAY_MS) };
      res.setHeader("cache-control", "no-store");
      return json(res, 200, {
        bucket,
        cells: usageSeries(readUsage(deps.dataDir, widened), { bucket, tzOffsetMinutes: tz, from, to }),
        billing: deps.prices() ? { currency: deps.currency() } : null,
      });
    }
    if (!(method === "GET" && (path === "/api/usage" || path === "/api/usage.csv"))) return PASS;
    const range = parseUsageRange(url.searchParams.get("from"), url.searchParams.get("to"));
    if (!range) return json(res, 400, { error: "from and to must be YYYY-MM-DD, from no later than to, at most a year apart" });
    await flushUsageLedger(deps.dataDir);
    const rows = readUsage(deps.dataDir, range);
    const prices = deps.prices();
    if (path === "/api/usage.csv") {
      const stamp = (date: Date) => date.toISOString().slice(0, 10);
      res.writeHead(200, {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="usage-${stamp(range.from)}-${stamp(range.to)}.csv"`,
        "cache-control": "no-store",
      });
      res.end(usageCsv(rows, prices));
      return;
    }
    const requested = url.searchParams.get("groupBy") ?? "bot";
    if (!USAGE_GROUPINGS.includes(requested as UsageGroupBy)) {
      return json(res, 400, { error: `groupBy must be one of ${USAGE_GROUPINGS.join(", ")}` });
    }
    const groupBy = requested as UsageGroupBy;
    res.setHeader("cache-control", "no-store");
    return json(res, 200, {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      groupBy,
      ...summarizeUsage(rows, groupBy, prices),
      budget: deps.budget(),
      billing: prices ? { currency: deps.currency() } : null,
    });
  };
}

const MAX_TOOL_NAME = 128;
const MAX_TOOL_MS = 24 * 60 * 60_000;
const MAX_SKEW_MS = 24 * 60 * 60_000;

/** A receipt from the agents tools for one call this turn's capability made: OMB's own timing of the tools it serves. */
export function createToolTimingRoute(recorder: Pick<TraceRecorder, "receipt">, threadId: string): RouteHandler {
  return async ({ req, res, path, method, json, readBody }) => {
    if (!(method === "POST" && path === "/api/internal/tool-timing")) return PASS;
    let body: unknown;
    try { body = await readBody(req, 8_192); } catch { return json(res, 400, { error: "expected a small JSON body" }); }
    const value = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const { name, startedAt, endedAt, ok } = value;
    const near = (time: unknown): time is number => typeof time === "number" && Number.isFinite(time) && Math.abs(time - Date.now()) <= MAX_SKEW_MS;
    if (typeof name !== "string" || !name || name.length > MAX_TOOL_NAME || typeof ok !== "boolean" ||
        !near(startedAt) || !near(endedAt) || !(endedAt >= startedAt) || endedAt - startedAt > MAX_TOOL_MS) {
      return json(res, 400, { error: "name, startedAt, endedAt and ok are required" });
    }
    const text = (field: unknown, max: number) => typeof field === "string" && field.trim() ? redactSecretsInText(field.slice(0, max)) : undefined;
    const receipt: ToolReceipt = { name, startedAt, endedAt, ok };
    const detail = text(value.detail, DETAIL_MAX);
    const error = text(value.error, ERROR_MAX);
    if (detail) receipt.detail = detail;
    if (error) receipt.error = error;
    recorder.receipt(threadId, receipt);
    return json(res, 200, { ok: true });
  };
}
