import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  distinctColumnValues,
  filterMenuPosition,
  filterTableRows,
  nextTableSort,
} from "./table-filter";

const rows = [
  ["Alpha", "10", "open"],
  ["beta", "2", "closed"],
  ["Gamma", "30", "open"],
  ["delta", "20", "closed"],
];

describe("table sorting", () => {
  it("cycles ascending, descending and unsorted", () => {
    const ascending = nextTableSort(null, 0);
    expect(ascending).toEqual({ column: 0, descending: false });
    const descending = nextTableSort(ascending, 0);
    expect(descending).toEqual({ column: 0, descending: true });
    expect(nextTableSort(descending, 0)).toBeNull();
    expect(nextTableSort(descending, 1)).toEqual({ column: 1, descending: false });
  });

  it("sorts numbers numerically and text case-insensitively", () => {
    expect(filterTableRows(rows, { query: "", sort: { column: 1, descending: false }, filters: [] })).toEqual([1, 0, 3, 2]);
    expect(filterTableRows(rows, { query: "", sort: { column: 0, descending: false }, filters: [] })).toEqual([0, 1, 3, 2]);
    expect(filterTableRows(rows, { query: "", sort: { column: 0, descending: true }, filters: [] })).toEqual([2, 3, 1, 0]);
  });
});

describe("table filtering", () => {
  it("combines global search with per-column filters", () => {
    expect(filterTableRows(rows, { query: "a", sort: null, filters: [] })).toEqual([0, 1, 2, 3]);
    expect(filterTableRows(rows, { query: "a", sort: null, filters: [{ column: 2, values: new Set(["closed"]) }] })).toEqual([1, 3]);
    expect(filterTableRows(rows, { query: "beta", sort: null, filters: [{ column: 2, values: new Set(["open"]) }] })).toEqual([]);
  });

  it("lists distinct values in a stable order", () => {
    expect(distinctColumnValues(rows, 2)).toEqual(["closed", "open"]);
  });

  it("counts only filters that exclude something", () => {
    expect(activeFilterCount([])).toBe(0);
    expect(activeFilterCount([{ column: 0, values: new Set() }])).toBe(0);
    expect(activeFilterCount([
      { column: 0, values: new Set(["Alpha"]) },
      { column: 1, values: new Set() },
      { column: 2, values: new Set(["open"]) },
    ])).toBe(2);
  });
});

describe("filter menu placement", () => {
  it("keeps the menu inside the viewport", () => {
    expect(filterMenuPosition({ left: 900, right: 940, top: 100, bottom: 130 }, { width: 1000, height: 800 }))
      .toEqual({ left: 695, top: 134, maxHeight: 658 });
    expect(filterMenuPosition({ left: 4, right: 30, top: 10, bottom: 40 }, { width: 1000, height: 800 }))
      .toEqual({ left: 8, top: 44, maxHeight: 748 });
  });
});
