import { useEffect, useState } from "react";
import { AlertTriangle, Check, Code, Code2, Copy, FlaskConical, GitBranch, Pencil, Plus, Repeat, Send, X } from "lucide-react";

import type { WorkflowProposal, WorkflowProposalAnswers } from "../../../shared/workflow-proposal";
import { proposalPreview, type ProposalPreviewStep } from "../../../shared/workflow-proposal-preview";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { useCopyFeedback } from "@/lib/copy-text";
import { Select } from "@/components/Select";
import { authoringIssues, proposalErrorMessage, rehearsalIssues, type ProposalIssue } from "@/lib/proposal-errors";
import { BotAvatar } from "./BotAvatar";

const CHIP = "inline-flex items-center gap-1.5 rounded-[7px] border px-2 py-[3px] text-[10px] font-semibold";
const CONTROL = "w-full rounded-lg border border-hairline bg-inset px-2 py-1.5 text-[11.5px] text-ink";
const BTN = "inline-flex h-[34px] items-center gap-1.5 rounded-[9px] border border-hairline px-3 text-[11.5px] font-medium text-ink-secondary hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40";
const BTN_PRIMARY = "inline-flex h-[34px] items-center gap-1.5 rounded-[9px] bg-ink px-3 text-[11.5px] font-semibold text-app hover:opacity-90 disabled:cursor-not-allowed disabled:border disabled:border-hairline disabled:bg-raised disabled:text-ink-tertiary disabled:opacity-100";
const LABEL = "text-[9.5px] font-semibold uppercase tracking-[0.12em] text-ink-tertiary";

function Seal({ blocked, passed }: { blocked: boolean; passed: boolean }) {
  return (
    <span className={cn(
      CHIP,
      blocked ? "border-danger/40 bg-danger/10 text-danger" : passed ? "border-success/40 bg-success/10 text-success" : "border-warning/40 bg-warning/10 text-warning",
    )}>
      <span className="size-1.5 rounded-full bg-current" />
      {blocked ? t("workflows.proposals.sealBlocked") : passed ? t("workflows.proposals.sealPassed") : t("workflows.proposals.sealUntested")}
    </span>
  );
}

function IssueBand({ kind, proposal, issues, canSend, onSend }: {
  kind: "authoring" | "rehearsal";
  proposal: WorkflowProposal;
  issues: readonly ProposalIssue[];
  canSend: boolean;
  onSend?: (message: string) => void;
}) {
  const message = proposalErrorMessage(kind, proposal.definition.name, issues);
  const { state, copy } = useCopyFeedback(message);
  const [sent, setSent] = useState(false);
  const sendTitle = proposal.createdBy?.threadId
    ? undefined
    : t("workflows.proposals.sendNoThread");

  return (
    <div className="rounded-[10px] border border-danger/30 bg-danger/10 px-3.5 py-3">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold text-danger">
        <AlertTriangle size={13} />
        {kind === "authoring" ? t("workflows.proposals.authoringErrors") : t("workflows.proposals.rehearsalDivergedTitle")}
      </h3>
      <p className="mt-0.5 text-[10.5px] text-ink-secondary">
        {kind === "authoring" ? t("workflows.proposals.authoringLead") : t("workflows.proposals.rehearsalDivergedLead")}
      </p>
      <ul className="mt-2.5 space-y-2">
        {issues.map((issue) => (
          <li key={`${issue.path}:${issue.message}`} className="border-t border-danger/20 pt-2 first:border-0 first:pt-0">
            <p className="break-all font-mono text-[9.5px] text-ink-tertiary">{issue.path}</p>
            <p className="mt-0.5 text-[10.5px] leading-relaxed text-ink-secondary">{issue.message}</p>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!canSend || sent}
          title={sendTitle}
          onClick={() => {
            if (!canSend || sent) return;
            onSend?.(message);
            setSent(true);
          }}
          className={cn(BTN_PRIMARY, "disabled:bg-raised")}
        >
          <Send size={12} /> {sent ? t("workflows.proposals.sentToBot") : t("workflows.proposals.sendToBot")}
        </button>
        <button type="button" onClick={copy} className={BTN}>
          <Copy size={12} /> {state === "copied" ? t("workflows.proposals.copied") : state === "failed" ? t("workflows.proposals.copyFailed") : t("workflows.proposals.copy")}
        </button>
      </div>
    </div>
  );
}

function stepBotName(step: ProposalPreviewStep, proposal: WorkflowProposal, index: number, botNames: Record<string, string> | undefined): string | undefined {
  if (!step.tags.includes("bot")) return undefined;
  const definitionStep = proposal.definition.steps[index];
  const botId = definitionStep?.kind === "bot" ? definitionStep.botId : undefined;
  return botId === undefined ? undefined : botNames?.[botId] ?? botId;
}

function StepGlyph({ step, botName }: { step: ProposalPreviewStep; botName?: string }) {
  if (step.tags.includes("bot")) return botName ? <BotAvatar name={botName} size={14} /> : <Code size={12} />;
  if (step.tags.includes("script")) return <Code size={12} className="shrink-0" aria-hidden="true" />;
  if (step.tags.includes("condition")) return <GitBranch size={12} className="shrink-0" aria-hidden="true" />;
  return <Repeat size={12} className="shrink-0" aria-hidden="true" />;
}

function stepDetail(step: ProposalPreviewStep, botName: string | undefined): string {
  if (step.tags.includes("bot")) return botName ? t("workflows.proposals.botStepNamed", { name: botName }) : t("workflows.proposals.botStep");
  if (step.tags.includes("script")) return step.code ? t("workflows.proposals.scriptStepNamed", { file: step.code.name }) : t("workflows.proposals.scriptStep");
  if (step.tags.includes("condition")) return t("workflows.proposals.conditionStep");
  return t("workflows.proposals.loopStep");
}

export function ProposalPreview({
  proposal,
  onClose,
  onNote,
  onRehearse,
  onRound,
  onConfirm,
  onOpenStudio,
  onCreate,
  onSendError,
  botNames,
  busy,
  error,
}: {
  proposal: WorkflowProposal;
  onClose: () => void;
  onNote: (stepId: string, text: string) => void;
  onRehearse: (example: { files?: Array<{ name: string; content: string }> }) => void;
  onRound: () => void;
  onConfirm?: (answers: WorkflowProposalAnswers) => void;
  onOpenStudio?: () => void;
  onCreate?: () => void;
  /** Sends the same text the Copy button copies to the conversation that created the proposal. */
  onSendError?: (message: string) => void;
  botNames?: Record<string, string>;
  busy: boolean;
  error?: string | null;
}) {
  const preview = proposalPreview(proposal);
  const [noteFor, setNoteFor] = useState<string>();
  const [note, setNote] = useState("");
  const storedRecurring = proposal.interview.recurring;
  const storedChanges = proposal.interview.changes;
  const storedConfirmer = proposal.interview.confirmer;
  const confirmedAt = proposal.interview.confirmedAt;
  const [answers, setAnswers] = useState<WorkflowProposalAnswers>({ recurring: storedRecurring, changes: storedChanges, confirmer: storedConfirmer });
  const [exampleFiles, setExampleFiles] = useState<Array<{ name: string; content: string }>>([]);
  const [showExamples, setShowExamples] = useState(false);
  const usableExamples = exampleFiles.filter((file) => file.name.trim());
  useEffect(() => {
    setAnswers({ recurring: storedRecurring, changes: storedChanges, confirmer: storedConfirmer });
  }, [storedRecurring, storedChanges, storedConfirmer]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rehearsal = proposal.rehearsal;
  const authoringErrors = authoringIssues(preview.authoring.errors);
  const blocked = authoringErrors.length > 0;
  const passed = !blocked && rehearsal?.status === "passed";
  const diverged = rehearsalIssues(rehearsal);
  const showDivergence = !blocked && rehearsal?.status === "diverged";
  const edited = answers.recurring !== storedRecurring || answers.changes !== storedChanges || answers.confirmer !== storedConfirmer;
  const unconfirmed = confirmedAt === undefined || edited;
  const createdByBot = proposal.createdBy?.botId ? botNames?.[proposal.createdBy.botId] ?? proposal.createdBy.botId : t("workflows.proposals.botStep");
  const canSend = proposal.createdBy?.threadId !== undefined && onSendError !== undefined;

  const createTitle = unconfirmed
    ? t("workflows.proposals.interviewCreateBlocked")
    : blocked
      ? t("workflows.proposals.createBlocked")
      : !passed
        ? t("workflows.proposals.createNeedsRehearsal")
        : undefined;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-hidden bg-black/55 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={t("workflows.proposals.previewTitle")}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div data-proposal-preview="" className="flex h-[86vh] max-h-[86vh] w-full max-w-[780px] flex-col overflow-hidden rounded-[15px] border border-hairline bg-panel shadow-2xl">
        <header className="flex flex-none items-start gap-3 border-b border-hairline px-5 pb-4 pt-[18px]">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <Seal blocked={blocked} passed={passed} />
              <h2 className="m-0 min-w-0 truncate text-[21px] font-[650] leading-[1.3] tracking-[-0.5px] text-ink">{preview.title}</h2>
            </div>
            <p className="mt-[7px] text-[11px] text-ink-secondary">
              {preview.department} · {t("workflows.proposals.stepCount", { count: preview.steps.length })} · {t("workflows.proposals.version", { version: preview.version })}
            </p>
            <p className="mt-1 text-[10.5px] text-ink-tertiary">
              {t("workflows.proposals.previewMeta", { id: proposal.id.slice(0, 8), author: createdByBot, when: new Date(proposal.createdAt).toLocaleString() })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("workflows.proposals.close")}
            title={t("workflows.proposals.close")}
            className="-me-2 -mt-1.5 grid size-10 flex-none place-items-center rounded-[10px] text-ink-secondary hover:bg-raised hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-success"
          >
            <X size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
          {onConfirm !== undefined && (
            <section aria-label={t("workflows.proposals.interviewTitle")} className="border-b border-hairline/60 px-5 py-[15px]">
              <p className={LABEL}>{t("workflows.proposals.interviewTitle")}</p>
              <div className="grid gap-2.5 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-[9.5px] uppercase tracking-[0.06em] text-ink-tertiary">{t("workflows.proposals.recurring")}</span>
                  <Select
                    value={answers.recurring ? "yes" : "no"}
                    onChange={(event) => setAnswers({ ...answers, recurring: event.target.value === "yes" })}
                    className="mt-1 w-full"
                    size="sm"
                  >
                    <option value="yes">{t("workflows.proposals.recurringYes")}</option>
                    <option value="no">{t("workflows.proposals.recurringNo")}</option>
                  </Select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[9.5px] uppercase tracking-[0.06em] text-ink-tertiary">{t("workflows.proposals.changes")}</span>
                  <textarea
                    rows={2}
                    value={answers.changes}
                    placeholder={t("workflows.proposals.interviewUnknownPlaceholder")}
                    onChange={(event) => setAnswers({ ...answers, changes: event.target.value })}
                    className={cn(CONTROL, "h-[46px] resize-none text-[11.5px]")}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[9.5px] uppercase tracking-[0.06em] text-ink-tertiary">{t("workflows.proposals.confirmer")}</span>
                  <textarea
                    rows={2}
                    value={answers.confirmer}
                    placeholder={t("workflows.proposals.interviewUnknownPlaceholder")}
                    onChange={(event) => setAnswers({ ...answers, confirmer: event.target.value })}
                    className={cn(CONTROL, "h-[46px] resize-none text-[11.5px]")}
                  />
                </label>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {unconfirmed && (
                  <button type="button" disabled={busy} onClick={() => onConfirm(answers)} className={BTN}>
                    <Check size={13} /> {t("workflows.proposals.interviewConfirm")}
                  </button>
                )}
                <span className={cn("text-[10px]", unconfirmed ? "text-warning" : "text-success")}>
                  {confirmedAt === undefined
                    ? t("workflows.proposals.interviewPending")
                    : edited
                      ? t("workflows.proposals.interviewChanged")
                      : (
                        <span className="inline-flex items-center gap-1">
                          <Check size={11} /> {t("workflows.proposals.interviewConfirmed", { when: new Date(confirmedAt).toLocaleString() })}
                        </span>
                      )}
                </span>
              </div>
              <p className="mt-1 text-[10px] leading-[1.45] text-ink-tertiary">{t("workflows.proposals.interviewHint")}</p>
            </section>
          )}

          <section className="border-b border-hairline/60 px-5 py-[15px]">
            <p className={LABEL}>{t("workflows.proposals.stepsTitle")}</p>
            <ol className="grid gap-1.5">
              {preview.steps.map((step, index) => {
                const outputs = step.output;
                const chip = outputs.length > 1 ? `${outputs[0]} +${outputs.length - 1}` : outputs[0];
                const botName = stepBotName(step, proposal, index, botNames);
                const outputCount = step.tags.includes("bot") && outputs.length > 0
                  ? ` · ${outputs.length === 1 ? t("workflows.proposals.outputOne") : t("workflows.proposals.outputCount", { count: outputs.length })}`
                  : "";
                return (
                  <li key={step.id} className="rounded-[11px] border border-[#E5E5E8] bg-white px-3 py-2.5 text-[#202124]">
                    <div className="flex items-center gap-2.5">
                      <span className="grid size-[31px] flex-none place-items-center rounded-[9px] border border-[#E5E5E8] bg-[#F0F0F1] text-[10px] font-semibold text-[#808287]">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-[620] leading-[1.25] text-[#202124]">{step.name}</p>
                        <p className="mt-px flex items-center gap-1 text-[10.5px] text-[#808287]">
                          <StepGlyph step={step} botName={botName} />
                          <span className="truncate">{stepDetail(step, botName)}{outputCount}</span>
                        </p>
                      </div>
                      {chip && (
                        <span className="max-w-[38%] flex-none truncate rounded-md border border-[#E5E5E8] bg-[#F0F0F1] px-1.5 py-0.5 font-mono text-[9.5px] text-[#808287]">{chip}</span>
                      )}
                    </div>
                    <details className="mt-1.5">
                      <summary className="cursor-pointer text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[#A0A2A7] hover:text-[#5B5C63]">{t("workflows.proposals.stepDetails")}</summary>
                      <dl className="mt-1.5 grid grid-cols-[62px_1fr] gap-x-2 gap-y-1 text-[10.5px] text-[#808287]">
                        <dt className="font-semibold uppercase tracking-wide text-[#A0A2A7]">{t("workflows.proposals.input")}</dt>
                        <dd>{step.input.length ? step.input.join(", ") : t("workflows.proposals.none")}</dd>
                        <dt className="font-semibold uppercase tracking-wide text-[#A0A2A7]">{t("workflows.proposals.process")}</dt>
                        <dd className="whitespace-pre-wrap">{step.process}</dd>
                        <dt className="font-semibold uppercase tracking-wide text-[#A0A2A7]">{t("workflows.proposals.output")}</dt>
                        <dd>{outputs.length ? outputs.join(", ") : t("workflows.proposals.none")}</dd>
                        <dt className="font-semibold uppercase tracking-wide text-[#A0A2A7]">{t("workflows.proposals.proof")}</dt>
                        <dd>{step.proof.join(" · ")}</dd>
                      </dl>
                    </details>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {step.note && <span className="text-[10.5px] text-[#7A5A1F]">{step.note}</span>}
                      {step.code && (
                        <details className="w-full">
                          <summary className="flex cursor-pointer items-center gap-1 text-[10.5px] text-[#247B8A]"><Code2 size={12} />{t("workflows.proposals.viewCode")}</summary>
                          <pre className="mt-1.5 max-h-48 overflow-auto rounded-lg bg-[#F8F8F8] px-3 py-2 font-mono text-[11px] leading-relaxed text-[#202124]">{step.code.content}</pre>
                        </details>
                      )}
                      <button
                        type="button"
                        onClick={() => { setNoteFor(step.id); setNote(step.note ?? ""); }}
                        className="ms-auto flex items-center gap-1 text-[10.5px] text-[#A0A2A7] hover:text-[#5B5C63]"
                      >
                        <Pencil size={11} /> {step.note ? t("workflows.proposals.editNote") : t("workflows.proposals.note")}
                      </button>
                    </div>
                    {noteFor === step.id && (
                      <div className="mt-2 flex gap-2">
                        <input
                          value={note}
                          onChange={(event) => setNote(event.target.value)}
                          aria-label={t("workflows.proposals.note")}
                          className="min-w-0 flex-1 rounded-lg border border-[#E5E5E8] bg-white px-2 py-1 text-[11.5px] text-[#202124]"
                        />
                        <button type="button" onClick={() => { onNote(step.id, note); setNoteFor(undefined); }} className="rounded-lg bg-[#202124] px-2.5 py-1 text-[11px] font-medium text-white">{t("workflows.proposals.saveNote")}</button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>

          {blocked && (
            <section className="border-b border-hairline/60 px-5 py-[15px]">
              <IssueBand kind="authoring" proposal={proposal} issues={authoringErrors} canSend={canSend} onSend={onSendError} />
            </section>
          )}

          <section className="border-b border-hairline/60 px-5 py-[15px]">
            <p className={LABEL}>{t("workflows.proposals.rehearsal")}</p>
            <p className="text-[11px] text-ink-secondary">
              {passed
                ? <span className="font-semibold text-success">{t("workflows.proposals.rehearsalPassedLine")}</span>
                : <span className="font-semibold text-ink">{t("workflows.proposals.rehearsalNone")}</span>}
            </p>
            <p className="mt-[3px] text-[10px] leading-[1.45] text-ink-tertiary">
              {passed ? t("workflows.proposals.rehearsalPassedDetail") : t("workflows.proposals.rehearsalHint")}
            </p>
            {showDivergence && diverged.length > 0 && (
              <div className="mt-3">
                <IssueBand kind="rehearsal" proposal={proposal} issues={diverged} canSend={canSend} onSend={onSendError} />
              </div>
            )}
            {!passed && (
              <div className="mt-3 rounded-[10px] border border-hairline bg-inset/50 px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => setShowExamples((open) => !open)}
                  aria-expanded={showExamples}
                  className="flex w-full items-center gap-1.5 text-left text-[11px] font-semibold text-ink"
                >
                  <Plus size={12} className={showExamples ? "rotate-45 transition-transform" : "transition-transform"} />
                  {t("workflows.proposals.exampleFiles")}
                  {usableExamples.length > 0 ? ` (${usableExamples.length})` : ""}
                </button>
                {showExamples && (
                  <div className="mt-2 space-y-2">
                    <p className="text-[10px] leading-[1.45] text-ink-tertiary">{t("workflows.proposals.exampleFilesHint")}</p>
                    {exampleFiles.map((file, index) => (
                      <div key={index} className="rounded-lg border border-hairline bg-white p-2">
                        <div className="flex items-center gap-2">
                          <input
                            value={file.name}
                            onChange={(event) => setExampleFiles((files) => files.map((entry, at) => at === index ? { ...entry, name: event.target.value } : entry))}
                            placeholder={t("workflows.proposals.exampleFileName")}
                            aria-label={t("workflows.proposals.exampleFileName")}
                            className={cn(CONTROL, "flex-1")}
                          />
                          <button
                            type="button"
                            onClick={() => setExampleFiles((files) => files.filter((_, at) => at !== index))}
                            aria-label={t("workflows.proposals.removeExampleFile")}
                            title={t("workflows.proposals.removeExampleFile")}
                            className="grid size-7 flex-none place-items-center rounded-lg text-ink-secondary hover:bg-raised"
                          >
                            <X size={12} />
                          </button>
                        </div>
                        <textarea
                          value={file.content}
                          onChange={(event) => setExampleFiles((files) => files.map((entry, at) => at === index ? { ...entry, content: event.target.value } : entry))}
                          placeholder={t("workflows.proposals.exampleFileContent")}
                          aria-label={t("workflows.proposals.exampleFileContent")}
                          rows={3}
                          className={cn(CONTROL, "mt-1.5 font-mono")}
                        />
                      </div>
                    ))}
                    <button type="button" onClick={() => setExampleFiles((files) => [...files, { name: "", content: "" }])} className={BTN}>
                      <Plus size={12} /> {t("workflows.proposals.addExampleFile")}
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => onRehearse(usableExamples.length > 0 ? { files: usableExamples } : {})}
                disabled={busy || blocked || passed}
                title={blocked ? t("workflows.proposals.rehearsalBlocked") : undefined}
                className={passed ? BTN : BTN_PRIMARY}
              >
                <FlaskConical size={13} /> {passed ? t("workflows.proposals.rehearsalDone") : t("workflows.proposals.runRehearsal")}
              </button>
              <span className="text-[10px] text-ink-tertiary">
                {blocked ? t("workflows.proposals.rehearsalBlocked") : passed ? "" : t("workflows.proposals.rehearsalRequired")}
              </span>
            </div>
          </section>

          {preview.assumptions.length > 0 && (
            <section className="border-b border-hairline/60 px-5 py-[15px]">
              <p className={LABEL}>{t("workflows.proposals.assumptions")}</p>
              <ul className="list-disc space-y-0.5 ps-4 text-[10.5px] leading-[1.45] text-ink-secondary">
                {preview.assumptions.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </section>
          )}

          {(preview.scriptWarnings.length > 0 || preview.authoring.warnings.length > 0) && (
            <section className="border-b border-hairline/60 px-5 py-[15px]">
              <p className={LABEL}>{t("workflows.proposals.warningsTitle")}</p>
              <ul className="space-y-0.5 text-[10.5px] leading-[1.45] text-ink-secondary">
                {preview.authoring.warnings.map((issue) => <li key={`${issue.path}:${issue.message}`}>{issue.path}: {issue.message}</li>)}
                {preview.scriptWarnings.map((entry) => <li key={`${entry.step}:${entry.warning}`}>{entry.step}: {entry.warning}</li>)}
              </ul>
            </section>
          )}

          {error && (
            <section className="border-b border-danger/30 bg-danger/10 px-5 py-2.5 text-[11px] text-danger">{error}</section>
          )}

          {proposal.rounds >= 3 && (
            <section className="border-b border-hairline/60 bg-warning/10 px-5 py-[15px]">
              <p className="text-[11px] font-semibold text-warning">{t("workflows.proposals.ladder")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={onRound} disabled={busy} className={BTN}>{t("workflows.proposals.restart")}</button>
                <button type="button" onClick={onOpenStudio} disabled={busy} className={BTN}>{t("workflows.proposals.openStudio")}</button>
              </div>
            </section>
          )}
        </div>

        <footer className="flex flex-none items-center gap-2 border-t border-hairline bg-panel px-4 py-3">
          <button type="button" onClick={onClose} className={cn(BTN, "border-transparent")}>{t("workflows.proposals.cancel")}</button>
          <span className="flex-1" />
          {onCreate !== undefined && (
            <button
              type="button"
              disabled={busy || blocked || unconfirmed || !passed}
              title={createTitle}
              onClick={() => onCreate()}
              className={BTN_PRIMARY}
            >
              <Check size={13} /> {t("workflows.proposals.create")}
            </button>
          )}
          {onCreate === undefined && (
            <span className="flex items-center gap-1 text-[10.5px] text-ink-tertiary">
              <Check size={12} /> {t("workflows.proposals.footerHint")}
            </span>
          )}
        </footer>
      </div>
    </div>
  );
}
