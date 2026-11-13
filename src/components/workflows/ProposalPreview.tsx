import { useState } from "react";
import { AlertTriangle, Check, Code2, FlaskConical, Pencil, X } from "lucide-react";

import type { WorkflowProposal } from "../../../shared/workflow-proposal";
import { proposalPreview } from "../../../shared/workflow-proposal-preview";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/cn";

function label(value: "passed" | "diverged" | "untested"): string {
  return value === "passed" ? t("workflows.proposals.tested") : value === "diverged" ? t("workflows.proposals.diverged") : t("workflows.proposals.untested");
}

export function ProposalPreview({
  proposal,
  onClose,
  onNote,
  onRehearse,
  onRound,
  onOpenStudio,
  busy,
}: {
  proposal: WorkflowProposal;
  onClose: () => void;
  onNote: (stepId: string, text: string) => void;
  onRehearse: () => void;
  onRound: () => void;
  onOpenStudio: () => void;
  busy: boolean;
}) {
  const preview = proposalPreview(proposal);
  const [noteFor, setNoteFor] = useState<string>();
  const [note, setNote] = useState("");
  const rehearsal = proposal.rehearsal;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/55 p-4 sm:p-8" role="dialog" aria-modal="true" aria-label={t("workflows.proposals.previewTitle")}>
      <div className="w-full max-w-[900px] rounded-2xl border border-hairline bg-panel shadow-2xl">
        <header className="flex items-start gap-3 border-b border-hairline/60 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-tertiary">{t("workflows.proposals.kicker")}</p>
            <h2 className="mt-1 truncate text-[19px] font-semibold text-ink">{preview.title}</h2>
            <p className="mt-0.5 text-[11.5px] text-ink-tertiary">
              {preview.department} · {t("workflows.proposals.version", { version: preview.version })} · {t("workflows.proposals.stepCount", { count: preview.steps.length })} · {t("workflows.proposals.notCreated")}
            </p>
          </div>
          <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-1 text-[10px] font-semibold text-warning">{t("workflows.proposals.seal")}</span>
          <button type="button" onClick={onClose} aria-label={t("workflows.proposals.close")} className="grid size-7 place-items-center rounded-lg text-ink-tertiary hover:bg-raised/60 hover:text-ink">
            <X size={15} />
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-1.5 border-b border-hairline/60 px-5 py-2.5">
          {preview.steps.map((step, index) => (
            <span key={step.id} className="inline-flex items-center gap-1 rounded-full border border-hairline bg-inset px-2 py-0.5 text-[10.5px] text-ink-secondary">
              <b className={cn("grid size-4 place-items-center rounded-full text-[9px] text-app", step.tags.includes("bot") ? "bg-accent" : "bg-success")}>{index + 1}</b>
              {step.name}
            </span>
          ))}
          <span className="ms-auto text-[10.5px] text-ink-tertiary">{t("workflows.proposals.mapHint")}</span>
        </div>

        <ol className="max-h-[58vh] overflow-y-auto px-2 py-2">
          {preview.steps.map((step, index) => {
            const result = rehearsal?.steps.find((entry) => entry.id === step.id);
            return (
              <li key={step.id} className={cn("rounded-xl px-3 py-3", result?.label === "diverged" && "bg-danger/5", step.note && "bg-warning/5")}>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-semibold text-app">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold text-ink">{step.name}</p>
                    <p className="mt-0.5 text-[10.5px] text-ink-tertiary">
                      {[
                        step.tags.includes("manual") ? t("workflows.proposals.manual") : undefined,
                        step.tags.includes("bot") ? t("workflows.proposals.judgement") : t("workflows.proposals.mechanical"),
                        step.tags.includes("condition") ? t("workflows.proposals.conditionStep") : undefined,
                        step.tags.includes("loop") ? t("workflows.proposals.loopStep") : undefined,
                      ].filter(Boolean).join(" · ")}
                    </p>
                    <dl className="mt-2 grid grid-cols-[68px_1fr] gap-x-2 gap-y-1 text-[11.5px]">
                      <dt className="font-semibold uppercase tracking-wide text-ink-tertiary">{t("workflows.proposals.input")}</dt>
                      <dd className="text-ink-secondary">{step.input.length ? step.input.join(", ") : t("workflows.proposals.none")}</dd>
                      <dt className="font-semibold uppercase tracking-wide text-ink-tertiary">{t("workflows.proposals.process")}</dt>
                      <dd className="whitespace-pre-wrap text-ink-secondary">{step.process}</dd>
                      <dt className="font-semibold uppercase tracking-wide text-ink-tertiary">{t("workflows.proposals.output")}</dt>
                      <dd className="text-ink-secondary">{step.output.length ? step.output.join(", ") : t("workflows.proposals.none")}</dd>
                      <dt className="font-semibold uppercase tracking-wide text-ink-tertiary">{t("workflows.proposals.proof")}</dt>
                      <dd className="text-ink-secondary">{step.proof.join(" · ")}</dd>
                    </dl>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", result?.label === "passed" ? "border-success/40 bg-success/10 text-success" : result?.label === "diverged" ? "border-danger/40 bg-danger/10 text-danger" : "border-warning/40 bg-warning/10 text-warning")}>
                        {label(result?.label ?? "untested")}
                      </span>
                      {step.note && <span className="text-[11px] text-warning">{step.note}</span>}
                      {step.code && (
                        <details className="w-full">
                          <summary className="flex cursor-pointer items-center gap-1 text-[11px] text-accent"><Code2 size={12} />{t("workflows.proposals.viewCode")}</summary>
                          <pre className="mt-1.5 max-h-48 overflow-auto rounded-lg bg-inset px-3 py-2 font-mono text-[11px] leading-relaxed text-ink">{step.code.content}</pre>
                        </details>
                      )}
                      <button
                        type="button"
                        onClick={() => { setNoteFor(step.id); setNote(step.note ?? ""); }}
                        className="ms-auto flex items-center gap-1 text-[11px] text-ink-tertiary hover:text-ink"
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
                          className="min-w-0 flex-1 rounded-lg border border-hairline bg-control px-2 py-1 text-[12px] text-ink"
                        />
                        <button type="button" onClick={() => { onNote(step.id, note); setNoteFor(undefined); }} className="rounded-lg bg-ink px-2.5 py-1 text-[11px] font-medium text-app">{t("workflows.proposals.saveNote")}</button>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        {preview.assumptions.length > 0 && (
          <div className="border-t border-hairline/60 px-5 py-3">
            <p className="text-[11.5px] font-semibold text-warning">{t("workflows.proposals.assumptions")}</p>
            <ul className="mt-1 list-disc space-y-0.5 ps-4 text-[11.5px] text-ink-secondary">
              {preview.assumptions.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
        )}

        {preview.scriptWarnings.length > 0 && (
          <div className="border-t border-hairline/60 bg-warning/5 px-5 py-3">
            <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-warning"><AlertTriangle size={13} />{t("workflows.proposals.scriptWarnings")}</p>
            <ul className="mt-1 space-y-0.5 text-[11.5px] text-ink-secondary">
              {preview.scriptWarnings.map((entry) => <li key={`${entry.step}:${entry.warning}`}>{entry.step}: {entry.warning}</li>)}
            </ul>
          </div>
        )}

        {rehearsal && (
          <div className="border-t border-hairline/60 px-5 py-3 text-[11.5px] text-ink-secondary">
            <p className="font-semibold text-ink">{t("workflows.proposals.rehearsalResult")}</p>
            <p className="mt-0.5">{label(rehearsal.status)} · {new Date(rehearsal.at).toLocaleString()}</p>
            <ul className="mt-1 space-y-0.5">
              {rehearsal.steps.map((entry) => <li key={entry.id}>{entry.name}: {label(entry.label)}{entry.detail ? ` — ${entry.detail}` : ""}</li>)}
            </ul>
          </div>
        )}

        {proposal.rounds >= 3 && (
          <div className="border-t border-hairline/60 bg-warning/10 px-5 py-3">
            <p className="text-[11.5px] font-semibold text-warning">{t("workflows.proposals.ladder")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={onRound} disabled={busy} className="rounded-lg border border-hairline px-2.5 py-1 text-[11px] font-medium text-ink-secondary hover:bg-raised/60">{t("workflows.proposals.restart")}</button>
              <button type="button" onClick={onOpenStudio} disabled={busy} className="rounded-lg border border-hairline px-2.5 py-1 text-[11px] font-medium text-ink-secondary hover:bg-raised/60">{t("workflows.proposals.openStudio")}</button>
            </div>
          </div>
        )}

        <footer className="flex flex-wrap items-center gap-2 border-t border-hairline/60 px-5 py-3">
          <button type="button" onClick={onRehearse} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-1.5 text-[11.5px] font-medium text-ink-secondary hover:bg-raised/60 disabled:opacity-50">
            <FlaskConical size={13} /> {t("workflows.proposals.rehearse")}
          </button>
          <button type="button" onClick={onRound} disabled={busy} className="rounded-lg border border-hairline px-3 py-1.5 text-[11.5px] font-medium text-ink-secondary hover:bg-raised/60 disabled:opacity-50">
            {t("workflows.proposals.newRound")}
          </button>
          <span className="ms-auto flex items-center gap-1 text-[10.5px] text-ink-tertiary">
            <Check size={12} /> {t("workflows.proposals.footerHint")}
          </span>
        </footer>
      </div>
    </div>
  );
}
