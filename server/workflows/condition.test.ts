import { describe, expect, it } from "vitest";

import { evaluateCondition } from "./condition.ts";

describe("evaluateCondition", () => {
  it("reads a dotted path and compares numbers", () => {
    expect(evaluateCondition({ check: { total: 12 } }, "gte", "check.total", 10)).toEqual({ ok: true, match: true });
    expect(evaluateCondition({ check: { total: 12 } }, "lt", "check.total", 10)).toEqual({ ok: true, match: false });
  });

  it("compares booleans, strings and objects by value", () => {
    expect(evaluateCondition({ ok: true }, "equals", "ok", true)).toEqual({ ok: true, match: true });
    expect(evaluateCondition({ ok: false }, "equals", "ok", true)).toEqual({ ok: true, match: false });
    expect(evaluateCondition({ state: "done" }, "not_equals", "state", "open")).toEqual({ ok: true, match: true });
    expect(evaluateCondition({ row: { id: 1 } }, "equals", "row", { id: 1 })).toEqual({ ok: true, match: true });
  });

  it("answers exists for a present, non-null field", () => {
    expect(evaluateCondition({ ok: true }, "exists", "ok", undefined)).toEqual({ ok: true, match: true });
    expect(evaluateCondition({ ok: null }, "exists", "ok", undefined)).toEqual({ ok: true, match: false });
    expect(evaluateCondition({}, "exists", "ok", undefined)).toEqual({ ok: true, match: false });
  });

  it("answers contains for text and lists", () => {
    expect(evaluateCondition({ note: "approved by Ana" }, "contains", "note", "Ana")).toEqual({ ok: true, match: true });
    expect(evaluateCondition({ tags: ["a", "b"] }, "contains", "tags", "b")).toEqual({ ok: true, match: true });
    expect(evaluateCondition({ tags: ["a", "b"] }, "contains", "tags", "c")).toEqual({ ok: true, match: false });
  });

  it("answers false when the field is missing, and refuses a comparison on text", () => {
    expect(evaluateCondition({}, "equals", "ok", true)).toEqual({ ok: true, match: false });
    expect(evaluateCondition({}, "gt", "total", 1)).toEqual({ ok: true, match: false });
    expect(evaluateCondition({ total: "12" }, "gt", "total", 1)).toEqual({
      ok: false,
      error: "the gt operator needs two numbers; \"total\" is \"12\"",
    });
  });

  it("refuses contains on a value that is neither text nor a list", () => {
    expect(evaluateCondition({ total: 12 }, "contains", "total", "1")).toEqual({
      ok: false,
      error: "the field \"total\" is neither text nor a list",
    });
  });
});
