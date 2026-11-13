import { Ban, Check, Clock, Hourglass, Pause, Play, Workflow, X } from "lucide-react";

import type { WorkflowRunStatus } from "../../../shared/workflow";
import { runStatusLabel } from "@/lib/workflow-format";

interface Tone {
  accent: string;
  soft: string;
}

const TONE: Record<WorkflowRunStatus, Tone> = {
  queued: { accent: "#8795AC", soft: "#F0F3F8" },
  running: { accent: "#397EE7", soft: "#EAF2FF" },
  waiting_manual: { accent: "#C5923A", soft: "#FFF7E5" },
  waiting_approval: { accent: "#C5923A", soft: "#FFF7E5" },
  succeeded: { accent: "#2EA574", soft: "#EAF8EF" },
  failed: { accent: "#D35E68", soft: "#FFF0F1" },
  cancelled: { accent: "#8E9199", soft: "#F2F3F5" },
};

function BadgeIcon({ status }: { status: WorkflowRunStatus }) {
  switch (status) {
    case "queued": return <Clock size={9} strokeWidth={2.7} aria-hidden="true" />;
    case "running": return <Play size={9} strokeWidth={2.7} aria-hidden="true" />;
    case "waiting_manual": return <Pause size={9} strokeWidth={3} aria-hidden="true" />;
    case "waiting_approval": return <Hourglass size={9} strokeWidth={2.7} aria-hidden="true" />;
    case "succeeded": return <Check size={9} strokeWidth={3} aria-hidden="true" />;
    case "failed": return <X size={9} strokeWidth={3} aria-hidden="true" />;
    case "cancelled": return <Ban size={9} strokeWidth={2.7} aria-hidden="true" />;
  }
}

export function RunGlyph({ status, size = 34 }: { status: WorkflowRunStatus; size?: number }) {
  const tone = TONE[status];
  const label = runStatusLabel(status);
  return (
    <span
      className="wf-run-glyph relative grid shrink-0 place-items-center rounded-full"
      style={{ width: size, height: size, background: tone.soft, color: tone.accent }}
      role="img"
      aria-label={label}
      title={label}
    >
      {status === "running" ? (
        <span
          aria-hidden="true"
          className="wf-ring-spin absolute inset-0 rounded-full border-[2.5px] border-[#BBD5FF] border-r-[#397EE7] border-t-[#397EE7] animate-[wf-ring-spin_1s_linear_infinite]"
        />
      ) : (
        <span aria-hidden="true" className="absolute inset-0 rounded-full border-[2.5px]" style={{ borderColor: tone.accent }} />
      )}
      <Workflow size={size >= 34 ? 16 : 14} strokeWidth={2} aria-hidden="true" />
      <span
        aria-hidden="true"
        className="wf-run-badge absolute -bottom-[3px] -right-[3px] grid place-items-center rounded-full border-2"
        style={{ width: 15, height: 15, background: tone.accent, color: "#ffffff" }}
      >
        <BadgeIcon status={status} />
      </span>
    </span>
  );
}
