import { isTableNumber, type TableSort } from "./table-data";

export interface ColumnFilter {
  column: number;
  values: ReadonlySet<string>;
}

export interface TableViewOptions {
  query: string;
  sort: TableSort;
  filters: readonly ColumnFilter[];
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const INTEGER = /^[+-]?\d+$/;

export function nextTableSort(sort: TableSort, column: number): TableSort {
  if (sort?.column !== column) return { column, descending: false };
  return sort.descending ? null : { column, descending: true };
}

export function distinctColumnValues(rows: readonly (readonly string[])[], column: number): string[] {
  const values = new Set<string>();
  for (const row of rows) values.add(row[column] ?? "");
  return [...values].sort((left, right) => collator.compare(left, right));
}

function compareCells(left: string, right: string): number {
  const leftText = left.trim();
  const rightText = right.trim();
  if (!leftText || !rightText) return Number(!leftText) - Number(!rightText);
  const numeric = isTableNumber(leftText) && isTableNumber(rightText);
  if (numeric && INTEGER.test(leftText) && INTEGER.test(rightText)) {
    const leftNumber = BigInt(leftText);
    const rightNumber = BigInt(rightText);
    return leftNumber < rightNumber ? -1 : leftNumber > rightNumber ? 1 : 0;
  }
  if (numeric) return Number(leftText) - Number(rightText);
  return collator.compare(leftText, rightText);
}

export function filterTableRows(
  rows: readonly (readonly string[])[],
  { query, sort, filters }: TableViewOptions,
): number[] {
  const needle = query.trim().toLocaleLowerCase();
  const order = rows.flatMap((row, index) => {
    if (needle && !row.some((cell) => cell.toLocaleLowerCase().includes(needle))) return [];
    for (const filter of filters) {
      if (filter.values.size > 0 && !filter.values.has(row[filter.column] ?? "")) return [];
    }
    return [index];
  });
  if (!sort) return order;
  return order.sort((left, right) => {
    const difference = compareCells(
      rows[left]?.[sort.column] ?? "",
      rows[right]?.[sort.column] ?? "",
    );
    return (Number.isFinite(difference) ? difference : 0) * (sort.descending ? -1 : 1) || left - right;
  });
}

export function activeFilterCount(filters: readonly ColumnFilter[]): number {
  return filters.filter((filter) => filter.values.size > 0).length;
}

export interface MenuAnchor {
  left: number;
  top: number;
  maxHeight: number;
}

export function filterMenuPosition(
  anchor: { left: number; right: number; top: number; bottom: number },
  viewport: { width: number; height: number },
  menuWidth = 245,
  margin = 8,
): MenuAnchor {
  const left = Math.min(Math.max(margin, anchor.right - menuWidth), Math.max(margin, viewport.width - menuWidth - margin));
  const top = Math.min(anchor.bottom + 4, Math.max(margin, viewport.height - 240));
  return {
    left,
    top,
    maxHeight: Math.max(120, viewport.height - top - margin),
  };
}
