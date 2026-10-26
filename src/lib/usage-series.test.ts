import { describe, expect, it, vi } from "vitest";

vi.mock("@/state/store", () => ({ api: vi.fn() }));

const lib = await import("./usage-series");

const cell = (overrides: Partial<import("./usage-series").SeriesCell> = {}): import("./usage-series").SeriesCell => ({
  key: "2026-10-20", botId: "a", botName: "Alpha", model: "m", turns: 1, input: 1000, output: 200, cachedInput: 400, costUsd: 0.5, errors: 0, ...overrides,
});

describe("usage series periods", () => {
  const now = new Date(2026, 9, 26, 15, 12);

  it("reads today by the hour up to this one, and compares it with yesterday until now", () => {
    const plan = lib.seriesPlan("today", now);
    expect(plan.bucket).toBe("hour");
    expect(plan.slots).toHaveLength(16);
    expect(plan.slots[15]!.key).toBe("2026-10-26T15");
    expect(plan.previous).toMatchObject({ from: "2026-10-25", to: "2026-10-25", untilHour: 15, label: "yesterday" });
  });

  it("covers the last 7 and 30 days ending today and compares them with the stretch before", () => {
    const week = lib.seriesPlan("week", now);
    expect([week.from, week.to, week.slots.length]).toEqual(["2026-10-20", "2026-10-26", 7]);
    expect([week.previous.from, week.previous.to]).toEqual(["2026-10-13", "2026-10-19"]);
    const month = lib.seriesPlan("days30", now);
    expect([month.from, month.slots.length, month.previous.from, month.previous.to]).toEqual(["2026-09-27", 30, "2026-08-28", "2026-09-26"]);
  });

  it("groups 90 days three to a bar and keeps every day in some bar", () => {
    const plan = lib.seriesPlan("days90", now);
    expect(plan.slots).toHaveLength(30);
    expect(plan.slots[0]).toMatchObject({ from: "2026-07-29", to: "2026-07-31" });
    expect(plan.slots[29]!.to).toBe("2026-10-26");
  });

  it("compares this month with the same stretch of the last one, and last month with the month before", () => {
    const month = lib.seriesPlan("month", now);
    expect([month.from, month.slots.length, month.previous.from, month.previous.to]).toEqual(["2026-10-01", 26, "2026-09-01", "2026-09-26"]);
    const last = lib.seriesPlan("lastMonth", now);
    expect([last.from, last.to, last.slots.length, last.previous.from, last.previous.to]).toEqual(["2026-09-01", "2026-09-30", 30, "2026-08-01", "2026-08-31"]);
    const early = lib.seriesPlan("month", new Date(2026, 2, 31, 9));
    expect(early.previous.to).toBe("2026-02-28");
  });
});

describe("usage series totals", () => {
  const now = new Date(2026, 9, 26, 15, 12);

  it("puts each cell in the bar that holds its day or hour", () => {
    const week = lib.seriesPlan("week", now);
    const bars = lib.seriesBars(week, [cell({ key: "2026-10-20" }), cell({ key: "2026-10-26", botId: "b" }), cell({ key: "2026-10-26", botId: "b", costUsd: null })]);
    expect(bars[0]!.byBot.get("a")?.runs).toBe(1);
    expect(bars[6]!.byBot.get("b")).toMatchObject({ runs: 2, cost: 0.5 });
    const today = lib.seriesPlan("today", now);
    expect(lib.seriesBars(today, [cell({ key: "2026-10-26T09" })])[9]!.byBot.get("a")?.runs).toBe(1);
  });

  it("leaves the cost empty until a priced turn arrives and counts new tokens without the cached ones", () => {
    const totals = lib.addCell(lib.emptyTotals(), cell({ costUsd: null }));
    expect(totals.cost).toBeNull();
    expect(lib.metricValue(totals, "cost")).toBe(0);
    expect(lib.metricValue(totals, "tokens")).toBe(800);
    expect(lib.metricValue(lib.addCell(totals, cell({ costUsd: 0.25 })), "cost")).toBe(0.25);
  });

  it("cuts yesterday at the hour it is now", () => {
    const plan = lib.seriesPlan("today", now);
    const kept = lib.previousCells(plan, [cell({ key: "2026-10-25T14" }), cell({ key: "2026-10-25T16" })]);
    expect(kept.map((c) => c.key)).toEqual(["2026-10-25T14"]);
  });

  it("rounds axis ticks to clean numbers", () => {
    expect(lib.niceTicks(72.62, false)).toEqual([0, 20, 40, 60, 80]);
    expect(lib.niceTicks(3, true)).toEqual([0, 1, 2, 3]);
    expect(lib.niceTicks(0, true)).toEqual([0, 1]);
  });

  it("measures the change against a base and refuses to invent one", () => {
    expect(lib.percentChange(110, 100)).toBeCloseTo(10);
    expect(lib.percentChange(5, 0)).toBeNull();
  });
});

describe("usage series colors", () => {
  it("seats bots by sidebar order and folds the ninth onward into one neutral series", () => {
    const ids = Array.from({ length: 10 }, (_, i) => `b${i}`);
    const cells = ids.map((id) => cell({ botId: id, botName: id.toUpperCase() }));
    const { bots, seat } = lib.seatBots(cells, [...ids].reverse(), "Others");
    expect(bots).toHaveLength(9);
    expect(bots[0]).toMatchObject({ id: "b9", color: "var(--identity-blue)" });
    expect(bots[8]).toMatchObject({ id: lib.OTHERS_ID, name: "Others" });
    expect(seat("b9")).toBe("b9");
    expect(seat("b0")).toBe(lib.OTHERS_ID);
  });
});
