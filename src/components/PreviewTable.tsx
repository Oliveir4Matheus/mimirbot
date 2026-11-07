import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, Filter, Search } from "lucide-react";

import {
  activeFilterCount,
  distinctColumnValues,
  filterMenuPosition,
  filterTableRows,
  nextTableSort,
  type ColumnFilter,
  type MenuAnchor,
} from "@/lib/table-filter";
import type { TableSort } from "@/lib/table-data";
import { t } from "@/lib/i18n";

export interface PreviewTableProps {
  columns: readonly string[];
  rows: readonly (readonly string[])[];
  query: string;
  ariaLabel: string;
}

interface FilterMenuState {
  column: number;
  anchor: MenuAnchor;
  values: Set<string>;
  search: string;
  allValues: string[];
  loadingValues: boolean;
}

const PreviewTableHeader = memo(function PreviewTableHeader({
  columns,
  sort,
  filters,
  onSort,
  onOpenFilter,
  headingRef,
}: {
  columns: readonly string[];
  sort: TableSort;
  filters: readonly ColumnFilter[];
  onSort: (column: number) => void;
  onOpenFilter: (column: number, trigger: HTMLElement) => void;
  headingRef: RefObject<HTMLTableSectionElement | null>;
}) {
  return (
    <thead ref={headingRef} className="sticky top-0 z-10 bg-raised">
      <tr>
        <th scope="col" className="h-[37px] border-b border-hairline px-2 text-start font-medium text-ink-tertiary">#</th>
        {columns.map((column, index) => {
          const sorted = sort?.column === index;
          const filter = filters.find((candidate) => candidate.column === index);
          return (
            <th
              key={index}
              scope="col"
              aria-sort={sorted ? sort.descending ? "descending" : "ascending" : "none"}
              className="h-[37px] border-b border-hairline px-3 font-medium"
            >
              <div className="flex min-w-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => onSort(index)}
                  className="flex min-w-0 flex-1 items-center gap-1 text-start hover:text-ink"
                >
                  <span className="min-w-0 truncate">{column || t("preview.table.column", { number: index + 1 })}</span>
                  {sorted && (sort.descending
                    ? <ArrowDown size={13} className="shrink-0 text-accent" />
                    : <ArrowUp size={13} className="shrink-0 text-accent" />)}
                </button>
                <button
                  type="button"
                  data-filter-trigger
                  aria-label={t("preview.table.filterColumn", { column: column || index + 1 })}
                  title={t("preview.table.filterColumn", { column: column || index + 1 })}
                  onClick={(event) => onOpenFilter(index, event.currentTarget)}
                  className="relative flex size-7 shrink-0 items-center justify-center rounded-[7px] hover:bg-raised-hover"
                >
                  <Filter size={13} className={filter ? "text-accent" : "text-ink-secondary"} />
                  {filter && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-accent" />}
                </button>
              </div>
            </th>
          );
        })}
      </tr>
    </thead>
  );
});
const PreviewTableRow = memo(function PreviewTableRow({
  displayIndex,
  row,
  columns,
}: {
  displayIndex: number;
  row: readonly string[];
  columns: number;
}) {
  return (
    <tr
      data-index={displayIndex}
      aria-rowindex={displayIndex + 2}
      className={displayIndex % 2 ? "bg-inset/40 hover:bg-raised/60" : "hover:bg-raised/60"}
    >
      <td className="border-b border-hairline px-2 py-2 text-ink-tertiary tabular-nums">{displayIndex + 1}</td>
      {Array.from({ length: columns }, (_, index) => {
        const value = row[index] ?? "";
        return (
          <td key={index} className="border-b border-hairline px-3 py-[10px] align-top">
            <div title={value} className="truncate">{value}</div>
          </td>
        );
      })}
    </tr>
  );
});

const FilterValueList = memo(function FilterValueList({
  values,
  selected,
  onToggle,
}: {
  values: readonly string[];
  selected: ReadonlySet<string>;
  onToggle: (value: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: values.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 28,
    overscan: 6,
    initialRect: { width: 245, height: 165 },
  });
  const items = virtualizer.getVirtualItems();
  return (
    <div ref={listRef} className="max-h-[165px] overflow-y-auto rounded-[7px] border border-hairline">
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {items.map((item) => {
          const value = values[item.index] ?? "";
          return (
            <label
              key={item.key}
              style={{ position: "absolute", top: item.start, left: 0, right: 0, height: item.size }}
              className="flex cursor-pointer items-center gap-2 px-2 py-1.5 hover:bg-raised-hover"
            >
              <input
                type="checkbox"
                checked={selected.has(value)}
                onChange={() => onToggle(value)}
                className="size-3 accent-accent"
              />
              <span className="min-w-0 truncate">{value || t("preview.table.emptyValue")}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
});

function useHeadingHeight(ref: RefObject<HTMLTableSectionElement | null>): number {
  const [height, setHeight] = useState(37);
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setHeight(entry.target.getBoundingClientRect().height);
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);
  return height;
}

export function PreviewTable({ columns, rows, query, ariaLabel }: PreviewTableProps) {
  const [sort, setSort] = useState<TableSort>(null);
  const [filters, setFilters] = useState<ColumnFilter[]>([]);
  const [menu, setMenu] = useState<FilterMenuState | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLTableSectionElement>(null);
  const headingHeight = useHeadingHeight(heading);
  const menuId = useId();

  const order = useMemo(
    () => filterTableRows(rows, { query, sort, filters }),
    [rows, query, sort, filters],
  );
  const widths = useMemo(() => columns.map((column, index) => Math.min(260, Math.max(140,
    Math.max(column.length, ...rows.slice(0, 100).map((row) => Math.min(40, row[index]?.length ?? 0))) * 7 + 52,
  ))), [columns, rows]);

  const virtual = order.length > 80;
  const virtualizer = useVirtualizer({
    count: order.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => 38,
    getItemKey: (index) => order[index]!,
    overscan: 4,
    enabled: virtual,
    initialRect: { width: 800, height: 400 },
    scrollMargin: headingHeight,
  });
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 0;
  }, [order]);
  const items = virtual
    ? virtualizer.getVirtualItems()
    : order.map((id, index) => ({ key: id, index, start: 0, end: 0 }));
  const before = virtual && items.length ? Math.max(0, items[0]!.start - headingHeight) : 0;
  const after = virtual && items.length
    ? Math.max(0, virtualizer.getTotalSize() - items.at(-1)!.end + headingHeight)
    : 0;

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(`[data-filter-menu="${menuId}"]`)) return;
      if (target instanceof Element && target.closest("[data-filter-trigger]")) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    const onScroll = () => close();
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [menu, menuId]);

  const distinctCache = useRef(new Map<number, string[]>());

  const openMenu = useCallback((column: number, trigger: HTMLElement) => {
    const cached = distinctCache.current.get(column);
    const existing = filters.find((filter) => filter.column === column);
    setMenu({
      column,
      anchor: filterMenuPosition(trigger.getBoundingClientRect(), {
        width: window.innerWidth,
        height: window.innerHeight,
      }),
      values: existing ? new Set(existing.values) : new Set(cached ?? []),
      search: "",
      allValues: cached ?? [],
      loadingValues: !cached,
    });
    if (cached) return;
    requestAnimationFrame(() => {
      setTimeout(() => {
        const allValues = distinctColumnValues(rows, column);
        distinctCache.current.set(column, allValues);
        setMenu((current) => {
          if (!current || current.column !== column) return current;
          return {
            ...current,
            allValues,
            values: current.values.size > 0 ? current.values : new Set(allValues),
            loadingValues: false,
          };
        });
      }, 0);
    });
  }, [rows, filters]);

  const sortColumn = useCallback((column: number) => {
    setSort((current) => nextTableSort(current, column));
  }, []);

  const toggleValue = (value: string) => {
    setMenu((current) => {
      if (!current) return current;
      const values = new Set(current.values);
      if (values.has(value)) values.delete(value);
      else values.add(value);
      return { ...current, values };
    });
  };

  const applyFilter = () => {
    if (!menu) return;
    setFilters((current) => {
      const rest = current.filter((filter) => filter.column !== menu.column);
      if (menu.values.size === 0 || menu.values.size === menu.allValues.length) return rest;
      return [...rest, { column: menu.column, values: new Set(menu.values) }];
    });
    setMenu(null);
  };

  const clearColumn = () => {
    if (!menu) return;
    const column = menu.column;
    setFilters((current) => current.filter((filter) => filter.column !== column));
    setSort((current) => current?.column === column ? null : current);
    setMenu({ ...menu, values: new Set(), search: "" });
  };

  const sortFromMenu = (descending: boolean) => {
    if (!menu) return;
    setSort({ column: menu.column, descending });
    setMenu(null);
  };

  const active = activeFilterCount(filters);
  const menuValues = menu
    ? menu.allValues.filter((value) => value.toLocaleLowerCase().includes(menu.search.trim().toLocaleLowerCase()))
    : [];

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-app text-ink" dir="ltr">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline bg-card px-4 py-[9px] text-[11px] text-ink-secondary">
        <span role="status">
          {t("preview.table.count", {
            shown: order.length.toLocaleString(),
            total: rows.length.toLocaleString(),
            columns: columns.length,
          })}
        </span>
        {active > 0 && <span className="text-accent">{t("preview.table.activeFilters", { count: active })}</span>}
      </div>
      <div
        ref={scroll}
        tabIndex={0}
        role="region"
        aria-label={ariaLabel}
        className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-x-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
      >
        <table
          aria-label={ariaLabel}
          aria-rowcount={order.length + 1}
          className="w-full table-fixed border-separate border-spacing-0 text-[11.5px]"
          style={{ minWidth: 47 + widths.reduce((total, width) => total + width, 0) }}
        >
          <colgroup>
            <col style={{ width: 47 }} />
            {widths.map((width, index) => <col key={index} style={{ width }} />)}
          </colgroup>
          <PreviewTableHeader
            columns={columns}
            sort={sort}
            filters={filters}
            onSort={sortColumn}
            onOpenFilter={openMenu}
            headingRef={heading}
          />
          <tbody>
            {before > 0 && <tr aria-hidden="true"><td colSpan={columns.length + 1} style={{ height: before, padding: 0 }} /></tr>}
            {items.map((item) => (
              <PreviewTableRow
                key={item.key}
                displayIndex={item.index}
                row={rows[order[item.index]!] ?? []}
                columns={columns.length}
              />
            ))}
            {after > 0 && <tr aria-hidden="true"><td colSpan={columns.length + 1} style={{ height: after, padding: 0 }} /></tr>}
          </tbody>
        </table>
        {order.length === 0 && (
          <p className="p-8 text-center text-[13px] text-ink-secondary">
            {rows.length ? t("preview.table.noMatches") : t("preview.table.empty")}
          </p>
        )}
      </div>
      {menu && createPortal(
        <div
          data-filter-menu={menuId}
          role="dialog"
          aria-label={t("preview.table.filterColumn", { column: columns[menu.column] || menu.column + 1 })}
          className="fixed z-[95] flex w-[245px] flex-col gap-2 overflow-y-auto rounded-[11px] border border-hairline bg-menu p-[9px] text-[11px] text-ink shadow-2xl"
          style={{ left: menu.anchor.left, top: menu.anchor.top, maxHeight: menu.anchor.maxHeight }}
        >
          <div className="truncate text-[12px] font-medium">{columns[menu.column] || t("preview.table.column", { number: menu.column + 1 })}</div>
          <div className="flex flex-col gap-1">
            <button type="button" onClick={() => sortFromMenu(false)} className="flex items-center gap-2 rounded-[7px] px-2 py-1.5 text-start hover:bg-raised-hover">
              <ArrowUp size={13} /> {t("preview.table.sortAscending")}
            </button>
            <button type="button" onClick={() => sortFromMenu(true)} className="flex items-center gap-2 rounded-[7px] px-2 py-1.5 text-start hover:bg-raised-hover">
              <ArrowDown size={13} /> {t("preview.table.sortDescending")}
            </button>
          </div>
          <div className="text-ink-secondary">{t("preview.table.filterValues")}</div>
          <label className="flex h-[31px] items-center gap-2 rounded-[7px] border border-hairline bg-inset px-2">
            <Search size={12} className="shrink-0 text-ink-secondary" />
            <input
              value={menu.search}
              onChange={(event) => setMenu({ ...menu, search: event.target.value })}
              aria-label={t("preview.table.searchValues")}
              placeholder={t("preview.table.searchValues")}
              className="min-w-0 flex-1 bg-transparent text-[11px] text-ink outline-none placeholder:text-ink-tertiary"
            />
          </label>
          {menu.loadingValues
            ? <p className="px-2 py-3 text-ink-secondary">{t("preview.table.loadingValues")}</p>
            : menuValues.length > 0
              ? <FilterValueList values={menuValues} selected={menu.values} onToggle={toggleValue} />
              : <p className="px-2 py-3 text-ink-secondary">{t("preview.table.noValues")}</p>}
          <div className="flex items-center justify-between gap-2 pt-1">
            <button type="button" onClick={clearColumn} className="rounded-[7px] px-2 py-1.5 text-accent hover:bg-raised-hover">{t("preview.table.clear")}</button>
            <button type="button" onClick={applyFilter} className="rounded-[7px] bg-accent px-3 py-1.5 font-medium text-accent-ink hover:bg-accent/80">{t("preview.table.apply")}</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
