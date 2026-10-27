import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";

import { cn } from "@/lib/cn";
import { usePopoverDismiss } from "@/hooks/use-popover-dismiss";
import { useMenuMotion } from "./MenuMotion";
import { voiceListPlace, type VoiceListPlace } from "./VoicePicker";

export interface SelectOption {
  value: string;
  label: string;
}

const ROW_PX = 36;
const LIST_PADDING_PX = 6;

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();

/** Case and accent blind, so "juri" finds "Jurídico". */
export function filterOptions(options: readonly SelectOption[], query: string): SelectOption[] {
  const needle = fold(query.trim());
  return needle ? options.filter((option) => fold(option.label).includes(needle)) : [...options];
}

export function SearchableSelect({
  value,
  options,
  onChange,
  ariaLabel,
  searchLabel,
  emptyLabel,
  visibleRows = 3,
}: {
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  searchLabel: string;
  emptyLabel: string;
  /** Rows shown before the list scrolls. */
  visibleRows?: number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [place, setPlace] = useState<VoiceListPlace | null>(null);
  const [activeValue, setActiveValue] = useState<string | null>(null);
  const motion = useMenuMotion(open);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const rows = filterOptions(options, query);
  const selected = options.find((option) => option.value === value);
  const held = activeValue === null ? -1 : rows.findIndex((row) => row.value === activeValue);
  const active = held >= 0 ? held : query.trim() ? 0 : Math.max(0, rows.findIndex((row) => row.value === value));

  const close = (refocus = false) => {
    setOpen(false);
    setQuery("");
    if (refocus) triggerRef.current?.focus();
  };
  const pick = (option: SelectOption | undefined) => {
    if (!option) return;
    onChange(option.value);
    close(true);
  };

  const inside = useRef({
    contains: (target: unknown) => [rootRef.current, sheetRef.current].some((node) => node?.contains(target as Node)),
  });
  usePopoverDismiss(open, inside, () => close());

  useLayoutEffect(() => {
    if (!open) return;
    const measure = (event?: Event) => {
      if (event?.target instanceof Node && sheetRef.current?.contains(event.target)) return;
      const trigger = triggerRef.current;
      if (!trigger) return;
      setPlace(voiceListPlace(trigger.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, getComputedStyle(trigger).direction === "rtl"));
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open]);

  const placed = place !== null;
  useEffect(() => {
    if (open && placed) inputRef.current?.focus({ preventScroll: true });
  }, [open, placed]);

  useLayoutEffect(() => {
    if (!open || !placed) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, placed, active]);

  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!rows.length) return;
      setActiveValue(rows[Math.min(rows.length - 1, Math.max(0, active + (event.key === "ArrowDown" ? 1 : -1)))]!.value);
    } else if (event.key === "Enter") {
      event.preventDefault();
      pick(rows[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (query) setQuery("");
      else close(true);
    } else if (event.key === "Tab") {
      event.preventDefault();
      close(true);
    }
  };

  const sheet = motion.shown && (
    <div
      ref={sheetRef}
      data-searchable-select-list
      {...motion.exitProps}
      style={{ position: "fixed", ...place, maxHeight: undefined, visibility: place ? undefined : "hidden" }}
      className={cn(
        "z-[80] flex flex-col overflow-hidden rounded-xl border border-hairline/50 bg-menu shadow-2xl shadow-black/50",
        motion.className,
      )}
    >
      <div className="shrink-0 p-1.5">
        <div className="flex items-center gap-2 rounded-lg border border-hairline/40 bg-inset px-2.5 py-1.5 focus-within:border-focus">
          <Search size={13} aria-hidden className="shrink-0 text-ink-secondary" />
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={rows[active] ? `${listId}-${active}` : undefined}
            value={query}
            onChange={(event) => {
              setActiveValue(null);
              setQuery(event.target.value);
            }}
            onKeyDown={onSearchKey}
            placeholder={searchLabel}
            aria-label={searchLabel}
            autoComplete="off"
            spellCheck={false}
            className="w-full bg-transparent text-[12.5px] text-ink placeholder:text-ink-secondary focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
        </div>
      </div>
      <div
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label={ariaLabel}
        // Keep the focus in the search box when a row is clicked.
        onMouseDown={(event) => event.preventDefault()}
        style={{ maxHeight: visibleRows * ROW_PX + LIST_PADDING_PX }}
        className="min-h-0 overflow-y-auto overscroll-contain px-1.5 pb-1.5"
      >
        {rows.length === 0 ? (
          <div role="status" className="px-3 py-4 text-center text-[13px] text-ink-secondary">{emptyLabel}</div>
        ) : rows.map((option, index) => {
          const current = option.value === value;
          return (
            <div
              key={option.value || "none"}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={current}
              data-index={index}
              data-active={index === active || undefined}
              onMouseMove={() => index !== active && setActiveValue(option.value)}
              onClick={() => pick(option)}
              className={cn("flex h-9 cursor-pointer items-center gap-2 rounded-lg px-2.5", index === active && "bg-raised")}
            >
              <span className={cn("min-w-0 flex-1 truncate text-[13px] text-ink", current && "font-medium")}>{option.label}</span>
              {current && <Check size={14} aria-hidden className="shrink-0 text-accent" />}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : (setActiveValue(null), setOpen(true)))}
        onKeyDown={(event) => {
          if (open || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
          event.preventDefault();
          setActiveValue(null);
          setOpen(true);
        }}
        className={cn(
          "w-full rounded-lg border bg-inset py-2.5 pl-3 pr-9 text-start text-[15px] text-ink",
          open ? "border-focus" : "border-hairline/40",
        )}
      >
        <span className="block truncate">{selected?.label ?? ""}</span>
      </button>
      <ChevronDown size={14} aria-hidden className={cn("pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-secondary transition-transform", open && "rotate-180")} />
      {sheet && typeof document !== "undefined" ? createPortal(sheet, document.body) : null}
    </div>
  );
}
