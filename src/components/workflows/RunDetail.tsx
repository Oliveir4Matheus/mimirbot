import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, ChevronDown, Copy, FileText, Hourglass, Pause, Play, Repeat, RotateCcw, Trash2, X } from "lucide-react";

import type { WorkflowDefinition, WorkflowRun, WorkflowRunStep, WorkflowStepStatus } from "../../../shared/workflow";
import { copyText } from "@/lib/copy-text";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { formatDateTime, formatDuration, isActiveStatus, relativeTime, runDurationLabel, stepStatusLabel } from "@/lib/workflow-format";
import { StatusChip } from "./StatusChip";

type DisplayStatus = WorkflowStepStatus | "waiting_manual" | "waiting_approval";

function StepIcon({ status }: { status: DisplayStatus }) {
  if (status === "succeeded") return <Check size={13} strokeWidth={2.4} aria-hidden="true" />;
  if (status === "failed") return <X size={13} strokeWidth={2.4} aria-hidden="true" />;
  if (status === "skipped") return <span className="text-[13px] leading-none">/</span>;
  if (status === "waiting_manual") return <Pause size={12} strokeWidth={2.6} aria-hidden="true" />;
  if (status === "waiting_approval") return <Hourglass size={12} aria-hidden="true" />;
  if (status === "running") return <span className="size-2 animate-pulse rounded-full bg-current" aria-hidden="true" />;
  return <span className="size-[7px] rounded-full border border-current" aria-hidden="true" />;
}

const STEP_TONE: Record<DisplayStatus, string> = {
  pending: "border-hairline bg-raised/40 text-ink-tertiary",
  running: "border-[#D4E3FF] bg-[#EDF3FF] text-[#5B84D2]",
  succeeded: "border-[#D0ECD9] bg-[#EAF8F0] text-[#35A16E]",
  failed: "border-[#F5D6D9] bg-[#FFF0F0] text-[#CB5C63]",
  skipped: "border-hairline bg-raised/30 text-ink-tertiary",
  waiting_manual: "border-[#F2E4C6] bg-[#FFF7DE] text-[#AA8D47]",
  waiting_approval: "border-[#F2E4C6] bg-[#FFF7DE] text-[#AA8D47]",
};

function stepTiming(step: WorkflowRunStep, now: number): string {
  if (step.startedAt !== undefined && step.finishedAt !== undefined) return formatDuration(step.finishedAt - step.startedAt);
  if (step.status === "running" && step.startedAt !== undefined) return formatDuration(now - step.startedAt);
  return "";
}

function stepMeta(step: WorkflowRunStep, status: DisplayStatus, timing: string): string {
  if (status === "waiting_manual") return t("workflows.run.manualWaitingStart");
  if (status === "waiting_approval") return t("workflows.status.waitingApproval");
  if (status === "running") return `${t("workflows.step.running")}${timing ? ` · ${timing}` : ""}`;
  if (status === "pending" || status === "skipped") return stepStatusLabel(status);
  const outcome = step.failureKind === "timeout" ? t("workflows.run.timedOut") : "";
  if (outcome) return timing ? `${outcome} · ${timing}` : outcome;
  return timing;
}

export function RunDetail({ run, workflow, now, botName, onCancel, onContinue, onDelete, onRerun, onOpenConversation, onBack }: {
  run: WorkflowRun;
  workflow?: WorkflowDefinition;
  now: number;
  botName: (botId: string) => string;
  onCancel: () => void;
  onContinue: () => void;
  onDelete: () => void;
  onRerun: () => void;
  onOpenConversation: (botId: string, threadId: string) => void;
  onBack: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [resultOpen, setResultOpen] = useState<boolean | null>(null);
  const [filesOpen, setFilesOpen] = useState(false);
  const [expandedRounds, setExpandedRounds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCopied(false);
    setResultOpen(null);
    setFilesOpen(false);
    setExpandedRounds(new Set());
  }, [run.id]);

  const active = isActiveStatus(run.status);
  const definitionStep = (id: string) => workflow?.steps.find((step) => step.id === id);
  const snapshotStep = (id: string) => run.snapshot?.steps.find((step) => step.id === id);
  const nameOf = (step: WorkflowRunStep, index: number) => definitionStep(step.id)?.name ?? snapshotStep(step.id)?.name ?? t("workflows.run.stepNumber", { number: index + 1 });
  const bodyName = (loopId: string, bodyId: string) => {
    const loop = definitionStep(loopId);
    const fromDefinition = loop?.kind === "loop" ? loop.body.find((step) => step.id === bodyId)?.name : undefined;
    return fromDefinition ?? snapshotStep(loopId)?.body?.find((step) => step.id === bodyId)?.name ?? bodyId;
  };
  const pathState = (path: number[] | undefined) => {
    if (!path || path.length === 0) return undefined;
    const top = run.steps[path[0]!];
    if (!top) return undefined;
    if (path.length === 1) {
      const topDefinition = definitionStep(top.id);
      return { step: top, name: nameOf(top, path[0]!), botId: topDefinition?.kind === "bot" ? topDefinition.botId : undefined };
    }
    const body = top.iterations?.[path[1]!]?.steps[path[2]!];
    if (!body) return undefined;
    const loop = definitionStep(top.id);
    const bodyStep = loop?.kind === "loop" ? loop.body[path[2]!] : undefined;
    return {
      step: body,
      name: bodyName(top.id, body.id),
      botId: bodyStep?.kind === "bot" ? bodyStep.botId : undefined,
    };
  };
  const holdPath = run.hold?.path ?? (run.hold?.step === undefined ? undefined : [run.hold.step]);
  const pausePath = run.pause?.path;
  const requester = run.requestedBy ? botName(run.requestedBy.botId) : undefined;
  const trigger = run.triggeredBy?.routineName;
  const resultText = run.result === undefined ? "" : JSON.stringify(run.result, null, 2);
  const resultLines = resultText ? resultText.split("\n").length : 0;
  const showResult = run.result !== undefined && (resultOpen ?? resultLines <= 12);
  const verified = run.steps.filter((step) => (step.verified?.length ?? 0) > 0);
  const failedStep = run.steps[run.currentStep];
  const lastResultFile = useMemo(() => {
    if (!workflow) return "result.json";
    for (let index = workflow.steps.length - 1; index >= 0; index -= 1) {
      const step = workflow.steps[index];
      const declared = step && step.kind !== "condition" ? step.result : undefined;
      if (declared) return declared;
    }
    return "result.json";
  }, [workflow]);

  const copyId = async () => {
    if ((await copyText(run.id)) !== "copied") return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1_500);
  };

  const conversationFor = (step: WorkflowRunStep, path?: number[]) => {
    if (!step.threadId) return null;
    const definition = definitionStep(step.id);
    const atPath = pathState(path);
    const botId = atPath?.botId
      ?? (definition?.kind === "bot" ? definition.botId : undefined)
      ?? run.requestedBy?.botId;
    return botId ? { botId, threadId: step.threadId } : null;
  };

  const holdIndex = holdPath?.[0] ?? run.currentStep;
  const holdStep = run.steps[holdIndex];
  const holdTarget = pathState(holdPath) ?? (holdStep ? { step: holdStep, name: nameOf(holdStep, holdIndex), botId: undefined } : undefined);
  const pausedPath = pausePath ?? (run.pause ? (() => {
    const index = run.steps.findIndex((step) => step.id === run.pause!.stepId);
    return index >= 0 ? [index] : undefined;
  })() : undefined);
  const pausedTarget = run.pause ? pathState(pausedPath) : undefined;
  const approvalConversation = (pausedTarget ? conversationFor(pausedTarget.step, pausedPath) : null)
    ?? (run.requestedBy ? { botId: run.requestedBy.botId, threadId: run.requestedBy.threadId } : null);

  return (
    <div className="min-h-full bg-app">
      <header className="border-b border-hairline/50 px-6 pb-6 pt-7 min-[901px]:px-7 min-[1101px]:px-[46px] min-[1101px]:pb-[27px] min-[1101px]:pt-[31px]">
        <button type="button" onClick={onBack} className="mb-3 flex items-center gap-1.5 text-[11px] font-medium text-ink-secondary hover:text-ink min-[901px]:hidden">
          <ArrowLeft size={14} aria-hidden="true" />
          {t("workflows.detail.backToList")}
        </button>

        <div className="flex flex-col gap-3 min-[720px]:flex-row min-[720px]:items-start min-[720px]:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <StatusChip status={run.status} />
              <h1 className="text-[21px] font-[650] leading-[1.3] tracking-[-0.5px] text-ink">
                {workflow?.name ?? run.snapshot?.name ?? t("workflows.run.unknownWorkflow")} v{run.workflowVersion}
              </h1>
            </div>
            <div className="mt-2.5 flex items-center gap-1.5 text-[10.5px] text-ink-tertiary">
              <span className="font-mono">{run.id}</span>
              <button type="button" onClick={() => void copyId()} title={t("workflows.run.copyId")} aria-label={t("workflows.run.copyId")} className="grid size-5 place-items-center rounded text-ink-tertiary hover:bg-raised hover:text-ink">
                {copied ? <Check size={12} className="text-success" aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
              </button>
            </div>
            <div className="mt-2.5 text-[11px] text-ink-secondary">
              {trigger
                ? t("workflows.run.triggeredBy", { name: trigger })
                : requester ? t("workflows.run.requestedBy", { name: requester }) : t("workflows.run.requestedByYou")}
              {" · "}
              {formatDateTime(run.startedAt ?? run.createdAt)}
              {" → "}
              {run.finishedAt !== undefined ? formatDateTime(run.finishedAt) : t("workflows.run.ongoing")}
              {" · "}
              {runDurationLabel(run, now)}
            </div>
          </div>

          <div className="flex flex-wrap shrink-0 items-center gap-2 max-[620px]:w-full">
            <button
              type="button"
              onClick={onCancel}
              disabled={!active}
              title={!active ? t("workflows.run.cancelDisabled") : undefined}
              className="flex h-[34px] items-center gap-1.5 rounded-[9px] border border-hairline px-3 text-[11.5px] font-medium text-ink-secondary hover:bg-raised/60 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <X size={13} aria-hidden="true" />
              {t("workflows.run.cancel")}
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={active}
              title={active ? t("workflows.run.deleteDisabled") : undefined}
              className="flex h-[34px] items-center gap-1.5 rounded-[9px] border border-hairline px-3 text-[11.5px] font-medium text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 size={13} aria-hidden="true" />
              {t("workflows.run.delete")}
            </button>
            <button
              type="button"
              onClick={onRerun}
              className="flex h-[34px] items-center gap-1.5 rounded-[9px] bg-[#28282D] px-3.5 text-[11.5px] font-medium text-white hover:bg-[#414148]"
            >
              <RotateCcw size={13} aria-hidden="true" />
              {t("workflows.run.rerun")}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[930px] px-6 pb-[90px] pt-[35px] min-[1101px]:px-12 max-[620px]:px-4">
        {run.status === "waiting_manual" && (
          <section className="mb-[30px] rounded-[11px] border border-[#F2E4C6] bg-[#FFFAF0] px-[18px] py-[17px]">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-[#8A6524]">
              <Pause size={13} aria-hidden="true" />
              {t("workflows.run.manualTitle")}
            </div>
            <div className="mt-1.5 text-[10.5px] text-[#7A6633]">
              {t("workflows.run.manualStep", {
                number: holdIndex + 1,
                name: holdPath && holdPath.length === 3 && holdStep
                  ? `${nameOf(holdStep, holdIndex)} · ${holdTarget?.name ?? ""}`
                  : holdTarget?.name ?? t("workflows.run.stepNumber", { number: holdIndex + 1 }),
              })}
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-[#6E5C34]">{t("workflows.run.manualHelp")}</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <span className="text-[10.5px] text-[#7A6633]">
                {t("workflows.run.manualSince", { time: relativeTime(run.hold?.since ?? run.updatedAt, now) })}
              </span>
              <button
                type="button"
                onClick={onContinue}
                className="flex h-8 items-center gap-1.5 rounded-[8px] bg-[#8A6524] px-3 text-[11px] font-semibold text-white hover:bg-[#74551D]"
              >
                <Play size={12} aria-hidden="true" />
                {t("workflows.run.continue")}
              </button>
            </div>
          </section>
        )}

        {run.status === "waiting_approval" && run.pause && (
          <section className="mb-[30px] rounded-[11px] border border-[#F2E4C6] bg-[#FFFAF0] px-[18px] py-[17px]">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-[#8A6524]">
              <Hourglass size={13} aria-hidden="true" />
              {t("workflows.run.approvalTitle")}
            </div>
            <div className="mt-1.5 text-[10.5px] text-[#7A6633]">
              {t("workflows.run.approvalStep", {
                number: (pausedPath?.[0] ?? run.currentStep) + 1,
                name: pausedTarget?.name ?? t("workflows.run.stepNumber", { number: (pausedPath?.[0] ?? run.currentStep) + 1 }),
              })}
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-[#6E5C34]">“{run.pause.question || t("workflows.run.approvalQuestionFallback")}”</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <span className="text-[10.5px] text-[#7A6633]">
                {t("workflows.run.approvalAsked", { time: relativeTime(run.pause.askedAt, now) })}
                {" · "}
                {run.pause.cardIds.length === 1 ? t("workflows.run.approvalCardsOne") : t("workflows.run.approvalCardsOther", { count: run.pause.cardIds.length })}
              </span>
              {approvalConversation && (
                <button
                  type="button"
                  onClick={() => onOpenConversation(approvalConversation.botId, approvalConversation.threadId)}
                  className="flex h-7 items-center gap-1.5 rounded-[7px] border border-[#E4D3A8] bg-white px-2.5 text-[10.5px] font-medium text-[#6F5A2E] hover:bg-[#FFF8E7]"
                >
                  {t("workflows.run.openConversation")}
                  <ArrowRight size={12} aria-hidden="true" />
                </button>
              )}
            </div>
          </section>
        )}

        {run.error && (
          <section className="mb-6 rounded-[10px] border border-[#F4D7D8] bg-[#FFF5F5] px-4 py-3">
            <div className="flex items-center gap-2 text-[11.5px] font-semibold text-[#A95257]">
              <AlertTriangle size={13} aria-hidden="true" />
              {failedStep
                ? t("workflows.run.errorStep", { number: run.currentStep + 1, name: nameOf(failedStep, run.currentStep) })
                : t("workflows.run.failed")}
            </div>
            <div className="mt-1 text-[11px] leading-relaxed text-[#A96A6E]">{run.error}</div>
          </section>
        )}

        <div className="mb-3 text-[10px] font-medium uppercase tracking-[0.14em] text-ink-tertiary">{t("workflows.run.timeline")}</div>
        <div className="relative ml-1">
          {run.steps.map((step, index) => {
            const name = nameOf(step, index);
            const timing = stepTiming(step, now);
            const conversation = conversationFor(step);
            const status: DisplayStatus = run.status === "waiting_manual" && index === holdIndex
              ? "waiting_manual"
              : run.status === "waiting_approval" && run.pause?.stepId === step.id ? "waiting_approval" : step.status;
            const iterations = step.iterations ?? [];
            const roundsOpen = expandedRounds.has(step.id);
            return (
              <div key={`${step.id}-${index}`} className="relative grid grid-cols-[32px_1fr] gap-3 pb-[22px] last:pb-0">
                {index < run.steps.length - 1 && <span aria-hidden="true" className="absolute bottom-[2px] left-[12px] top-[26px] border-l border-hairline" />}
                <span className={cn("z-10 grid size-[25px] place-items-center rounded-full border", STEP_TONE[status])}>
                  <StepIcon status={status} />
                </span>
                <div className="min-w-0 pt-0.5">
                  <div className="flex items-start justify-between gap-4">
                    <span className={cn("flex items-center gap-1.5 text-[12px] font-semibold text-ink", status === "skipped" && "text-ink-tertiary line-through")}>
                      {iterations.length > 0 && <Repeat size={12} className="shrink-0 text-[#B97818]" aria-hidden="true" />}
                      {index + 1} &nbsp;{name}
                    </span>
                    <span className="shrink-0 text-right text-[10px] text-ink-tertiary">
                      {stepMeta(step, status, timing)}
                    </span>
                  </div>
                  {step.error && <div className="mt-1 text-[10.5px] leading-relaxed text-danger">{step.error}</div>}
                  {(step.verified?.length ?? 0) > 0 && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] text-ink-tertiary">{t("workflows.run.files")}</span>
                      {step.verified!.map((file) => (
                        <span key={file} className="flex items-center gap-1 rounded-md border border-hairline bg-raised/40 px-1.5 py-0.5 text-[9.5px] text-ink-secondary">
                          <FileText size={10} aria-hidden="true" />
                          {file}
                        </span>
                      ))}
                    </div>
                  )}
                  {conversation && (
                    <button
                      type="button"
                      onClick={() => onOpenConversation(conversation.botId, conversation.threadId)}
                      className="mt-1.5 flex items-center gap-1 text-[10.5px] font-medium text-accent-text hover:underline"
                    >
                      {t("workflows.run.openConversation")}
                      <ArrowRight size={11} aria-hidden="true" />
                    </button>
                  )}
                  {iterations.length > 0 && (
                    <div className="mt-2">
                      <button
                        type="button"
                        aria-expanded={roundsOpen}
                        onClick={() => setExpandedRounds((current) => {
                          const next = new Set(current);
                          if (next.has(step.id)) next.delete(step.id);
                          else next.add(step.id);
                          return next;
                        })}
                        className="flex items-center gap-1.5 text-[10.5px] font-medium text-ink-secondary hover:text-ink"
                      >
                        <ChevronDown size={12} aria-hidden="true" className={cn("transition-transform", roundsOpen && "rotate-180")} />
                        {roundsOpen ? t("workflows.run.closeIterations") : t("workflows.run.openIterations")}
                        {" · "}
                        {iterations.length === 1 ? t("workflows.run.iterationsOne") : t("workflows.run.iterationsOther", { count: iterations.length })}
                      </button>
                      {roundsOpen && (
                        <ol className="mt-2 space-y-2">
                          {iterations.map((iteration, iterationIndex) => {
                            const condition = iteration.condition
                              ? `${iteration.condition.field} ${iteration.condition.op}${iteration.condition.value === undefined ? "" : ` ${JSON.stringify(iteration.condition.value)}`}`
                              : undefined;
                            const loopDefinition = definitionStep(step.id);
                            const limit = loopDefinition?.kind === "loop" ? loopDefinition.maxIterations : undefined;
                            return (
                              <li key={`${iteration.index}-${iterationIndex}`} className="rounded-lg border border-hairline bg-raised/20 px-3 py-2">
                                <div className="flex flex-wrap items-center justify-between gap-2 text-[10.5px]">
                                  <span className="font-semibold text-ink">{t("workflows.run.iteration", { index: iteration.index })}</span>
                                  <span className={cn(
                                    "rounded-md px-1.5 py-0.5 text-[9.5px]",
                                    iteration.status === "succeeded" && "bg-[#EAF8F0] text-[#35A16E]",
                                    iteration.status === "failed" && "bg-[#FFF0F0] text-[#CB5C63]",
                                    iteration.status === "running" && "bg-[#EDF3FF] text-[#5B84D2]",
                                    iteration.status === "skipped" && "bg-raised/40 text-ink-tertiary",
                                  )}>
                                    {stepStatusLabel(iteration.status)}
                                  </span>
                                </div>
                                <div className="mt-1 text-[10px] text-ink-tertiary">
                                  {iteration.failureKind === "limit"
                                    ? t("workflows.run.iterationLimit", { count: limit ?? "?" })
                                    : iteration.conditionMatched && condition
                                      ? t("workflows.run.iterationStopped", { condition })
                                      : iteration.conditionMatched === false
                                        ? t("workflows.run.iterationCondition")
                                        : ""}
                                </div>
                                {iteration.error && <div className="mt-1 text-[10px] leading-relaxed text-danger">{iteration.error}</div>}
                                <div className="mt-1.5 space-y-1">
                                  {iteration.steps.map((body, bodyIndex) => {
                                    const bodyTiming = stepTiming(body, now);
                                    const bodyConversation = conversationFor(body, [index, iterationIndex, bodyIndex]);
                                    return (
                                      <div key={`${body.id}-${bodyIndex}`} className="text-[10px] text-ink-secondary">
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="flex min-w-0 items-center gap-1.5">
                                            <span className={cn(
                                              "inline-block size-1.5 shrink-0 rounded-full",
                                              body.status === "succeeded" && "bg-[#35A16E]",
                                              body.status === "failed" && "bg-[#CB5C63]",
                                              body.status === "running" && "bg-[#5B84D2]",
                                              body.status === "skipped" && "bg-[#C7CCD0]",
                                              body.status === "pending" && "bg-[#C7CCD0]",
                                            )} />
                                            <span className="truncate">{bodyName(step.id, body.id)}</span>
                                          </span>
                                          <span className="shrink-0 text-ink-tertiary">{bodyTiming}</span>
                                        </div>
                                        {body.error && <div className="mt-0.5 text-danger">{body.error}</div>}
                                        {(body.verified?.length ?? 0) > 0 && (
                                          <div className="mt-0.5 flex flex-wrap gap-1">
                                            {body.verified!.map((file) => (
                                              <span key={file} className="flex items-center gap-1 rounded border border-hairline bg-white px-1 py-0.5 text-[9px]">
                                                <FileText size={9} aria-hidden="true" />
                                                {file}
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                        {bodyConversation && (
                                          <button
                                            type="button"
                                            onClick={() => onOpenConversation(bodyConversation.botId, bodyConversation.threadId)}
                                            className="mt-0.5 text-[9.5px] font-medium text-accent-text hover:underline"
                                          >
                                            {t("workflows.run.openConversation")}
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </li>
                            );
                          })}
                        </ol>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {run.result !== undefined && (
          <section className="mt-8 overflow-hidden rounded-[10px] border border-hairline">
            <button type="button" onClick={() => setResultOpen(!showResult)} aria-expanded={showResult} className="flex w-full items-center justify-between gap-3 bg-raised/25 px-4 py-3 text-left">
              <span className="text-[11px] font-semibold text-ink">{t("workflows.run.result")}</span>
              <ChevronDown size={14} aria-hidden="true" className={cn("text-ink-tertiary transition-transform", showResult && "rotate-180")} />
            </button>
            {showResult && (
              <div className="p-4">
                <div className="mb-2.5 flex items-center justify-between gap-3 text-[10px] text-ink-tertiary">
                  <span className="flex items-center gap-1.5"><FileText size={11} aria-hidden="true" />{lastResultFile}</span>
                  <button
                    type="button"
                    onClick={() => void copyText(resultText)}
                    className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium text-ink-secondary hover:bg-raised"
                  >
                    <Copy size={11} aria-hidden="true" />
                    {t("workflows.run.copy")}
                  </button>
                </div>
                <pre className="max-h-[420px] overflow-auto rounded-lg bg-[#24262D] p-4 font-mono text-[11px] leading-relaxed text-[#E6E7E9]">{resultText}</pre>
              </div>
            )}
          </section>
        )}

        {verified.length > 0 && (
          <section className="mt-4 overflow-hidden rounded-[10px] border border-hairline">
            <button type="button" onClick={() => setFilesOpen((value) => !value)} aria-expanded={filesOpen} className="flex w-full items-center justify-between gap-3 bg-raised/25 px-4 py-3 text-left">
              <span className="text-[11px] font-semibold text-ink">{t("workflows.run.filesBlock")}</span>
              <ChevronDown size={14} aria-hidden="true" className={cn("text-ink-tertiary transition-transform", filesOpen && "rotate-180")} />
            </button>
            {filesOpen && (
              <div className="space-y-3 p-4">
                {verified.map((step, index) => (
                  <div key={`${step.id}-${index}`} className="flex items-start gap-3 text-[11px] text-ink-secondary">
                    <span className="min-w-[100px] shrink-0 text-ink-tertiary">{nameOf(step, run.steps.indexOf(step))}</span>
                    <span className="flex flex-wrap gap-1.5">
                      {step.verified!.map((file) => (
                        <span key={file} className="flex items-center gap-1 rounded-md border border-hairline bg-raised/40 px-1.5 py-0.5 text-[9.5px]">
                          <FileText size={10} aria-hidden="true" />
                          {file}
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {!workflow && !run.snapshot && (
          <p className="mt-8 rounded-lg border border-dashed border-hairline p-4 text-[11px] leading-relaxed text-ink-tertiary">
            {t("workflows.run.definitionMissing")}
          </p>
        )}
      </div>
    </div>
  );
}
