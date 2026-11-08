import { Ban, Check, Clock, Hourglass, Loader2, X } from "lucide-react";

import type { WorkflowRunStatus } from "../../../shared/workflow";
import { cn } from "@/lib/cn";
import { runStatusLabel } from "@/lib/workflow-format";

const TONE: Record<WorkflowRunStatus, string> = {
  queued: "bg-[#EDF3FF] text-[#3A63A8]",
  running: "bg-[#EDF3FF] text-[#3A63A8]",
  waiting_approval: "bg-[#FFF5DC] text-[#7A5A1F]",
  succeeded: "bg-[#EAF7EF] text-[#226B45]",
  failed: "bg-[#FFF0F0] text-[#9B3F44]",
  cancelled: "bg-[#F1F1F2] text-[#5F6065]",
};

export function StatusIcon({ status, size = 13 }: { status: WorkflowRunStatus; size?: number }) {
  switch (status) {
    case "queued": return <Clock size={size} aria-hidden="true" />;
    case "running": return <Loader2 size={size} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />;
    case "waiting_approval": return <Hourglass size={size} aria-hidden="true" />;
    case "succeeded": return <Check size={size} strokeWidth={2.4} aria-hidden="true" />;
    case "failed": return <X size={size} strokeWidth={2.4} aria-hidden="true" />;
    case "cancelled": return <Ban size={size} aria-hidden="true" />;
  }
}

export function StatusChip({ status, className }: { status: WorkflowRunStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-[7px] px-2 py-1 text-[10px] font-semibold", TONE[status], className)}>
      <StatusIcon status={status} size={11} />
      {runStatusLabel(status)}
    </span>
  );
}
