import { useRef } from "react";
import { Archive, MoreHorizontal, Package, Terminal } from "lucide-react";

import { usePopoverDismiss } from "@/hooks/use-popover-dismiss";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { formatDateTime } from "@/lib/workflow-format";
import type { WorkflowEnvironmentStatus } from "@/lib/workflows-api";

export function PanelMenu({ open, onOpenChange, onOpenConsole, onOpenProposals, environment, preparing, onPrepareEnvironment }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenConsole: () => void;
  onOpenProposals: () => void;
  environment: WorkflowEnvironmentStatus | null;
  preparing: boolean;
  onPrepareEnvironment: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  usePopoverDismiss(open, root, () => onOpenChange(false));

  const status = environment === null
    ? undefined
    : !environment.prepared
      ? t("workflows.environment.never")
      : environment.stale
        ? t(environment.changed === 1 ? "workflows.environment.staleOne" : "workflows.environment.staleOther", { count: environment.changed })
        : t("workflows.environment.preparedAt", { date: formatDateTime(environment.preparedAt ?? 0) });

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
        <div className="absolute right-0 top-full z-40 mt-1 w-[245px] rounded-xl border border-hairline bg-menu p-1.5 shadow-xl">
          <button
            type="button"
            onClick={() => { onOpenChange(false); onOpenProposals(); }}
            className="flex w-full items-center gap-2.5 rounded-[7px] px-2.5 py-2 text-left text-[11px] text-ink-secondary hover:bg-raised/60 hover:text-ink"
          >
            <Archive size={13} aria-hidden="true" />
            {t("workflows.proposals.menu")}
          </button>
          <button
            type="button"
            disabled={preparing}
            onClick={() => { onOpenChange(false); onPrepareEnvironment(); }}
            className="flex w-full items-start gap-2.5 rounded-[7px] px-2.5 py-2 text-left text-[11px] text-ink-secondary hover:bg-raised/60 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Package size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block">{preparing ? t("workflows.environment.preparing") : t("workflows.environment.prepare")}</span>
              {status !== undefined && <span className="mt-0.5 block text-[10px] leading-snug text-ink-tertiary">{status}</span>}
            </span>
          </button>
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
