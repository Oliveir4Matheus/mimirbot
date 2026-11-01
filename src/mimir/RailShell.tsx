import { ChevronRight } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";

export const RAIL_CONTENT_ID = "mimir-rail-content";

const SLIDE = "transition-[transform,opacity] duration-300 ease-[cubic-bezier(.20,.84,.23,1)] motion-reduce:transition-none";

/**
 * The left rail's retracting shell. The content slides out of the window and
 * the handle it was opened with stays in reach; hidden content is `inert`.
 */
export function RailShell({ label, open, onOpenChange, children }: {
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) return;
    const focused = document.activeElement;
    if (focused && contentRef.current?.contains(focused)) handleRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // `click`, not `pointerdown`: retracting narrows the rail, and a reflow
    // between the press and the release would move the control out from under
    // the pointer before its click lands.
    const away = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      onOpenChange(false);
      handleRef.current?.focus();
    };
    document.addEventListener("click", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("click", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open, onOpenChange]);

  const handleLabel = t(open ? "sidebar.section.collapse" : "sidebar.section.expand", { name: label });

  return (
    <div
      ref={rootRef}
      data-mimir-rail=""
      data-mimir-rail-open={open ? "true" : "false"}
      className={cn(
        "relative z-30 flex h-full shrink-0 max-md:hidden transition-[width] duration-300 ease-[cubic-bezier(.20,.84,.23,1)] motion-reduce:transition-none",
        open ? "w-[66px]" : "w-0",
      )}
    >
      <div
        ref={contentRef}
        id={RAIL_CONTENT_ID}
        aria-hidden={!open}
        inert={!open}
        className={cn("flex h-full w-[66px] shrink-0 flex-col items-center border-r border-hairline/40 bg-panel", SLIDE,
          open ? "translate-x-0 opacity-100" : "-translate-x-full opacity-0")}
      >
        <nav aria-label={label} className="flex h-full w-full flex-col items-center pb-[9px] pt-2.5">
          {children}
        </nav>
      </div>
      <button
        ref={handleRef}
        type="button"
        data-mimir-rail-handle=""
        aria-controls={RAIL_CONTENT_ID}
        aria-expanded={open}
        aria-label={handleLabel}
        title={handleLabel}
        onClick={() => onOpenChange(!open)}
        className={cn(
          "absolute left-full top-1/2 z-40 hidden h-[72px] w-[14px] -translate-y-1/2 items-center justify-center rounded-r-[10px] border border-l-0 shadow-[2px_2px_10px_rgb(0_0_0/0.06)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus md:flex",
          open
            ? "border-hairline/60 bg-panel text-ink-tertiary hover:bg-raised hover:text-ink"
            : "border-hairline bg-accent/10 text-ink-secondary hover:bg-accent/20 hover:text-ink",
        )}
      >
        <ChevronRight
          size={12}
          strokeWidth={2.25}
          aria-hidden="true"
          className={cn("transition-transform duration-300 motion-reduce:transition-none", open && "rotate-180")}
        />
      </button>
    </div>
  );
}
