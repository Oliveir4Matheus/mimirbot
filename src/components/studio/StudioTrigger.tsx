import { Activity, CalendarClock, Hand, Webhook, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { WorkflowParameter, WorkflowTriggerKind, WorkflowTriggerNode } from "../../../shared/workflow";
import type { WorkflowTrigger } from "../../../shared/workflow-trigger";
import type { LocaleKey } from "@/locales";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { StudioWebhookTrigger } from "./StudioWebhookTrigger";
import { TRIGGER_HEIGHT, TRIGGER_WIDTH } from "./studio-model";

const KIND_LABEL: Record<WorkflowTriggerKind, LocaleKey> = {
  manual: "studio.trigger.kind.manual",
  webhook: "studio.trigger.kind.webhook",
  routine: "studio.trigger.kind.routine",
};

const KIND_HINT: Record<WorkflowTriggerKind, LocaleKey> = {
  manual: "studio.trigger.manualHint",
  webhook: "studio.trigger.webhookHint",
  routine: "studio.trigger.routineHint",
};

const KIND_CONFIG: Record<WorkflowTriggerKind, LocaleKey> = {
  manual: "studio.trigger.manualConfig",
  webhook: "studio.trigger.webhookConfig",
  routine: "studio.trigger.routineConfig",
};

const KIND_ICON = { manual: Hand, webhook: Webhook, routine: CalendarClock } as const;

const TRIGGER_KINDS: WorkflowTriggerKind[] = ["manual", "webhook", "routine"];

/** The link a node carries once its runtime entity exists; manual never has one. */
function triggerConfigured(trigger: WorkflowTriggerNode, runtime?: WorkflowTrigger): boolean {
  return runtime !== undefined || trigger.triggerId !== undefined || trigger.routineId !== undefined;
}

export function StudioTriggerCard({ trigger, point, selected, invalid, runtime, currentVersion, onOpen }: {
  trigger: WorkflowTriggerNode;
  point: { x: number; y: number };
  selected: boolean;
  invalid: boolean;
  runtime?: WorkflowTrigger;
  currentVersion?: number;
  onOpen: () => void;
}) {
  const Icon = KIND_ICON[trigger.kind];
  return (
    <div
      className={cn("studio-trigger-node", selected && "studio-trigger-node-selected", invalid && "studio-trigger-node-invalid")}
      style={{ left: point.x, top: point.y, width: TRIGGER_WIDTH, height: TRIGGER_HEIGHT }}
      data-studio-trigger={trigger.id}
    >
      <button
        type="button"
        className="studio-trigger-card"
        aria-label={t("studio.trigger.open", { name: trigger.name, kind: t(KIND_LABEL[trigger.kind]) })}
        aria-invalid={invalid || undefined}
        onClick={onOpen}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <span className="studio-trigger-icon" aria-hidden="true">
          <Icon size={18} strokeWidth={1.8} />
        </span>
        <span className="studio-trigger-text">
          <span className="studio-trigger-name" title={trigger.name}>{trigger.name}</span>
          <span className="studio-trigger-kind">
            {t(KIND_LABEL[trigger.kind])}
            {runtime && currentVersion !== undefined && runtime.workflowVersion !== currentVersion
              ? ` · ${t("studio.trigger.wfw.staleShort", { version: runtime.workflowVersion, current: currentVersion })}`
              : ""}
          </span>
        </span>
        {trigger.kind !== "manual" && (
          <span className={cn("studio-trigger-chip", triggerConfigured(trigger) && "studio-trigger-chip-set")}>
            {triggerConfigured(trigger, runtime) ? t("studio.trigger.configured") : t("studio.trigger.configure")}
          </span>
        )}
      </button>
    </div>
  );
}

export function StudioTriggerInspector({ trigger, count, workflowId, workflowVersion, parameters = [], runtime, onChange, onRuntime = () => {}, onDelete, onClose }: {
  trigger: WorkflowTriggerNode;
  count: number;
  workflowId?: string;
  workflowVersion?: number;
  parameters?: WorkflowParameter[];
  runtime?: WorkflowTrigger;
  onChange: (patch: { name?: string; kind?: WorkflowTriggerKind }) => void;
  onRuntime?: (trigger: WorkflowTrigger | null) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const last = count <= 1;
  const lastNoteId = `studio-trigger-last-${trigger.id}`;

  useEffect(() => { closeRef.current?.focus(); }, [trigger.id]);
  useEffect(() => { setConfigOpen(false); }, [trigger.id, trigger.kind]);

  return (
    <div className="studio-trigger-inspector" role="dialog" aria-label={t("studio.trigger.inspector")}>
      <div className="studio-trigger-inspector-head">
        <div>
          <div className="studio-trigger-inspector-title">{t("studio.trigger.inspector")}</div>
          <div className="studio-trigger-inspector-subtitle">{t("studio.trigger.subtitle", { kind: t(KIND_LABEL[trigger.kind]) })}</div>
        </div>
        <button ref={closeRef} type="button" className="studio-balloon-close" aria-label={t("studio.balloon.close")} onClick={onClose}>
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="studio-trigger-inspector-body">
        <label className="studio-field">
          <span className="studio-label">{t("studio.trigger.name")}</span>
          <input
            className="studio-input"
            value={trigger.name}
            maxLength={80}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </label>
        <div className="studio-field">
          <span className="studio-label" id={`studio-trigger-kind-${trigger.id}`}>{t("studio.trigger.type")}</span>
          <div className="studio-trigger-segment" role="group" aria-labelledby={`studio-trigger-kind-${trigger.id}`}>
            {TRIGGER_KINDS.map((kind) => {
              const Icon = KIND_ICON[kind];
              return (
                <button
                  key={kind}
                  type="button"
                  className={cn("studio-trigger-segment-item", trigger.kind === kind && "studio-trigger-segment-on")}
                  aria-pressed={trigger.kind === kind}
                  onClick={() => onChange({ kind })}
                >
                  <Icon size={14} strokeWidth={1.8} aria-hidden="true" />
                  {t(KIND_LABEL[kind])}
                </button>
              );
            })}
          </div>
          <p className="studio-trigger-hint">{t(KIND_HINT[trigger.kind])}</p>
        </div>
        <div className="studio-trigger-config">
          <span className="studio-label">
            <Activity size={12} strokeWidth={1.8} aria-hidden="true" />
            {t(KIND_CONFIG[trigger.kind])}
          </span>
          {trigger.kind === "webhook" ? (
            <>
              <button
                type="button"
                className="studio-trigger-config-button studio-trigger-config-ready"
                aria-expanded={configOpen}
                aria-describedby={`studio-trigger-config-${trigger.id}`}
                onClick={() => setConfigOpen((open) => !open)}
              >
                {runtime ? t("studio.trigger.configured") : t("studio.trigger.configure")}
              </button>
              <p className="studio-trigger-hint" id={`studio-trigger-config-${trigger.id}`}>
                {runtime ? t("studio.trigger.wfw.linked", { version: runtime.workflowVersion }) : t("studio.trigger.wfw.notLinked")}
              </p>
              {configOpen && (
                <StudioWebhookTrigger
                  workflowId={workflowId}
                  workflowVersion={workflowVersion}
                  nodeId={trigger.id}
                  nodeName={trigger.name}
                  triggerId={trigger.triggerId}
                  parameters={parameters}
                  onRuntime={onRuntime}
                  onClose={() => setConfigOpen(false)}
                />
              )}
            </>
          ) : (
            <>
              <button type="button" className="studio-trigger-config-button" disabled aria-describedby={`studio-trigger-config-${trigger.id}`}>
                {t("studio.trigger.configure")}
              </button>
              <p className="studio-trigger-hint" id={`studio-trigger-config-${trigger.id}`}>{t("studio.trigger.configLater")}</p>
            </>
          )}
        </div>
      </div>
      <div className="studio-trigger-inspector-foot">
        <span className="studio-trigger-hint" id={lastNoteId}>{last ? t("studio.trigger.lastOne") : ""}</span>
        <button
          type="button"
          className="studio-trigger-delete"
          disabled={last}
          aria-describedby={last ? lastNoteId : undefined}
          onClick={onDelete}
        >
          {t("studio.trigger.delete")}
        </button>
      </div>
    </div>
  );
}
