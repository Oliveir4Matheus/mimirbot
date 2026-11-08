import { ArrowLeft, ChevronDown, Play, Trash2 } from "lucide-react";

import type { WorkflowDefinition, WorkflowRun } from "../../../shared/workflow";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { formatDateTime } from "@/lib/workflow-format";
import { StepPanel } from "./StepPanel";
import { WorkflowSteps } from "./WorkflowSteps";

export function WorkflowDetail({ workflow, latest, versions, selectedVersion, activeRun, selectedStep, botName, loading, onVersion, onRun, onDelete, onSelectStep, onCloseStep, onBack }: {
  workflow: WorkflowDefinition;
  latest: WorkflowDefinition;
  versions: WorkflowDefinition[];
  selectedVersion: number;
  activeRun?: WorkflowRun;
  selectedStep: number | null;
  botName: (botId: string) => string;
  loading: boolean;
  onVersion: (version: number) => void;
  onRun: (version: number) => void;
  onDelete: () => void;
  onSelectStep: (index: number) => void;
  onCloseStep: () => void;
  onBack: () => void;
}) {
  const outdated = selectedVersion !== latest.version;
  const active = activeRun !== undefined;
  const step = selectedStep === null ? undefined : workflow.steps[selectedStep];

  return (
    <div className="min-h-full bg-app">
      <header className="border-b border-hairline/50 px-6 pb-6 pt-7 min-[901px]:px-7 min-[1101px]:px-[46px] min-[1101px]:pb-[27px] min-[1101px]:pt-[31px]">
        <button type="button" onClick={onBack} className="mb-3 flex items-center gap-1.5 text-[11px] font-medium text-ink-secondary hover:text-ink min-[901px]:hidden">
          <ArrowLeft size={14} aria-hidden="true" />
          {t("workflows.detail.backToList")}
        </button>

        <div className="flex flex-col gap-3 min-[620px]:flex-row min-[620px]:items-start min-[620px]:justify-between">
          <div className="min-w-0">
            <h1 className="text-[23px] font-[650] leading-[1.3] tracking-[-0.65px] text-ink max-[620px]:text-[20px]">{latest.name}</h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-ink-secondary">
              <span>{latest.department}</span>
              <span className="text-ink-tertiary">·</span>
              <span>{t("workflows.detail.versionOf", { version: selectedVersion, total: latest.version })}</span>
              <span className="text-ink-tertiary">·</span>
              <span>{t("workflows.detail.retention", { count: latest.retentionDays })}</span>
            </div>
            <div className="mt-2.5 text-[10.5px] text-ink-tertiary">{t("workflows.detail.updated", { date: formatDateTime(latest.updatedAt) })}</div>
            <div className="mt-4 flex items-center gap-2.5">
              <span className="text-[10.5px] text-ink-tertiary">{t("workflows.detail.version")}</span>
              <span className="relative inline-flex items-center">
                <select
                  aria-label={t("workflows.detail.version")}
                  value={selectedVersion}
                  disabled={loading || versions.length === 0}
                  onChange={(event) => onVersion(Number(event.target.value))}
                  className="h-[29px] appearance-none rounded-[7px] border border-hairline bg-app pl-2.5 pr-7 text-[10.5px] text-ink outline-none focus:border-accent disabled:opacity-50"
                >
                  {[...versions].reverse().map((version) => (
                    <option key={version.version} value={version.version}>
                      {version.version === latest.version
                        ? t("workflows.detail.versionCurrent", { version: version.version })
                        : t("workflows.detail.versionEntry", { version: version.version, date: formatDateTime(version.updatedAt) })}
                    </option>
                  ))}
                </select>
                <ChevronDown size={13} aria-hidden="true" className="pointer-events-none absolute right-2 text-ink-tertiary" />
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 max-[620px]:w-full">
            <button
              type="button"
              onClick={() => onRun(selectedVersion)}
              className="flex h-[34px] flex-1 items-center justify-center gap-1.5 rounded-[9px] bg-[#28282D] px-3.5 text-[11.5px] font-medium text-white hover:bg-[#414148] max-[620px]:flex-1"
            >
              <Play size={13} aria-hidden="true" />
              {outdated ? t("workflows.detail.runVersion", { version: selectedVersion }) : t("workflows.detail.run")}
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={active}
              title={active ? t("workflows.detail.deleteBlocked") : undefined}
              className="flex h-[34px] items-center justify-center gap-1.5 rounded-[9px] border border-hairline px-3.5 text-[11.5px] font-medium text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 size={13} aria-hidden="true" />
              {t("workflows.detail.delete")}
            </button>
          </div>
        </div>
      </header>

      {outdated && (
        <div className="mx-6 mt-4 flex flex-wrap items-center gap-2 rounded-[10px] border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-[11px] text-warning min-[1101px]:mx-10">
          <span>{t("workflows.detail.versionWarning", { version: selectedVersion, current: latest.version })}</span>
          <button type="button" onClick={() => onVersion(latest.version)} className="font-medium underline underline-offset-2">
            {t("workflows.detail.backToCurrent")}
          </button>
        </div>
      )}

      <div className={cn("flex gap-4 px-6 pb-10 pt-6 min-[1101px]:px-8", step && "min-[901px]:items-start")}>
        <div className="min-w-0 flex-1">
          <WorkflowSteps
            workflow={workflow}
            botName={botName}
            activeStep={activeRun && activeRun.workflowVersion === workflow.version ? activeRun.currentStep : undefined}
            selectedStep={selectedStep}
            onSelect={onSelectStep}
          />
        </div>
        {step && (
          <div className="max-[900px]:fixed max-[900px]:inset-x-0 max-[900px]:bottom-0 max-[900px]:z-30 max-[900px]:max-h-[70vh] max-[900px]:overflow-auto max-[900px]:rounded-t-[14px] max-[900px]:bg-app max-[900px]:p-3 max-[900px]:shadow-[0_-15px_40px_rgba(0,0,0,0.18)]">
            <StepPanel key={step.id} workflow={workflow} step={step} index={selectedStep!} botName={botName} onClose={onCloseStep} />
          </div>
        )}
      </div>
    </div>
  );
}
