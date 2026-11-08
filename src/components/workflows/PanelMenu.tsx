import { useRef } from "react";
import { MoreHorizontal, Terminal } from "lucide-react";

import { usePopoverDismiss } from "@/hooks/use-popover-dismiss";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";

export function PanelMenu({ open, onOpenChange, onOpenConsole }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenConsole: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  usePopoverDismiss(open, root, () => onOpenChange(false));

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label={t("workflows.more")}
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        className={cn("grid size-[25px] place-items-center rounded-[7px] text-ink-tertiary hover:bg-raised hover:text-ink", open && "bg-raised text-ink")}
      >
        <MoreHorizontal size={15} aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-[185px] rounded-xl border border-hairline bg-menu p-1.5 shadow-xl">
          <button
            type="button"
            onClick={() => { onOpenChange(false); onOpenConsole(); }}
            className="flex w-full items-center gap-2.5 rounded-[7px] px-2.5 py-2 text-left text-[11px] text-ink-secondary hover:bg-raised/60 hover:text-ink"
          >
            <Terminal size={13} aria-hidden="true" />
            {t("workflows.console")}
          </button>
        </div>
      )}
    </div>
  );
}
