import { Fragment } from "react";
import { ChevronRight, Code, FileText, GitBranch } from "lucide-react";

import type { WorkflowDefinition } from "../../../shared/workflow";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { BotAvatar } from "./BotAvatar";

function connectorLabels(workflow: WorkflowDefinition, index: number): string[] {
  const step = workflow.steps[index];
  if (!step || step.kind === "condition") return [];
  if (step.inputs.length > 0) return step.inputs.map((input) => input.as);
  const previous = workflow.steps[index - 1];
  return previous && previous.kind !== "condition" && previous.outputs[0] ? [previous.outputs[0].path] : [];
}

function Connector({ labels }: { labels: string[] }) {
  return (
    <div aria-hidden="true" className="relative h-[51px] w-full shrink-0">
      <span className="absolute left-1/2 top-0 h-9 w-px -translate-x-1/2 bg-[#C7C7CC]" />
      <span className="absolute left-1/2 top-[33px] size-0 -translate-x-1/2 border-x-4 border-t-[7px] border-x-transparent border-t-[#C7C7CC]" />
      <span className="absolute left-[calc(50%+12px)] top-[19px] flex max-w-[170px] flex-col gap-1">
        {labels.map((label) => (
          <span key={label} className="flex items-center gap-1 truncate bg-white px-1 text-[9.5px] text-[#808287]">
            <FileText size={11} className="shrink-0" />
            <span className="truncate">{label}</span>
          </span>
        ))}
      </span>
    </div>
  );
}

export function WorkflowSteps({ workflow, botName, activeStep, selectedStep, onSelect }: {
  workflow: WorkflowDefinition;
  botName: (botId: string) => string;
  activeStep?: number;
  selectedStep: number | null;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="wf-canvas min-h-[560px] rounded-[12px] px-7 pb-[66px] pt-[22px] max-[620px]:min-h-[470px] max-[620px]:px-3.5 max-[620px]:pb-12 max-[620px]:pt-5">
      <div className="mb-5 text-[10px] font-medium uppercase tracking-[0.14em] text-[#A0A2A7]">
        {t("workflows.detail.steps")}
        <span className="ml-2 tracking-normal">
          {workflow.steps.length === 1 ? t("workflows.detail.stepsOne") : t("workflows.detail.stepsOther", { count: workflow.steps.length })}
        </span>
      </div>
      <div className="mx-auto flex w-full max-w-[375px] flex-col items-center">
        {workflow.steps.map((step, index) => {
          const name = step.kind === "bot" ? botName(step.botId) : undefined;
          const running = activeStep === index;
          const selected = selectedStep === index;
          const outputs = step.kind === "condition"
            ? t("workflows.detail.conditionRoutes")
            : step.outputs.length === 1
              ? t("workflows.detail.outputsOne")
              : t("workflows.detail.outputsOther", { count: step.outputs.length });
          return (
            <Fragment key={step.id}>
              {index > 0 && <Connector labels={connectorLabels(workflow, index)} />}
              <button
                type="button"
                data-step-card={index}
                onClick={() => onSelect(index)}
                className={cn(
                  "relative flex min-h-[76px] w-full items-center gap-[13px] rounded-[12px] border bg-white px-[17px] py-3.5 text-left shadow-[0_1px_2px_rgba(20,20,30,0.04)] transition-[border-color,box-shadow]",
                  "border-[#E5E5E8] hover:border-[#BFBFC6] hover:shadow-[0_4px_12px_rgba(20,20,30,0.07)]",
                  selected && "border-[#888C9E] ring-2 ring-[#888C9E]/15",
                  running && "border-[#77A3E7] bg-[#FBFDFF] ring-2 ring-[#EAF2FF]",
                )}
              >
                <span className="grid size-[31px] shrink-0 place-items-center rounded-[9px] bg-[#F4F4F5] text-[12px] font-semibold text-[#5B5C63]">{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-semibold text-[#202124]">{step.name}</span>
                  <span className="mt-1 flex items-center gap-1.5 text-[10.5px] text-[#808287]">
                    {step.kind === "bot"
                      ? <BotAvatar name={name!} />
                      : step.kind === "script"
                        ? <Code size={12} className="shrink-0" aria-hidden="true" />
                        : <GitBranch size={12} className="shrink-0" aria-hidden="true" />}
                    <span className="truncate">
                      {step.kind === "bot"
                        ? t("workflows.detail.bot", { name: name! })
                        : step.kind === "script"
                          ? t("workflows.detail.script", { file: step.run })
                          : t("workflows.detail.condition")}
                      {" · "}{outputs}
                    </span>
                  </span>
                </span>
                {running && (
                  <span className="shrink-0 rounded-md bg-[#EAF2FF] px-1.5 py-0.5 text-[9.5px] font-semibold text-[#397EE7]">
                    {t("workflows.detail.active")}
                  </span>
                )}
                <ChevronRight size={14} className="shrink-0 text-[#A0A2A7]" aria-hidden="true" />
              </button>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
