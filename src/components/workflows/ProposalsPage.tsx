import { useCallback, useEffect, useState } from "react";
import { Archive, ArrowLeft, Check, FlaskConical, RefreshCw, Trash2, Workflow as WorkflowIcon } from "lucide-react";

import type { WorkflowProposal } from "../../../shared/workflow-proposal";
import { annotateProposal, archiveProposal, bumpProposalRound, createWorkflowFromProposal, deleteProposal, listProposals, rehearseProposal } from "@/lib/workflows-api";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { ProposalPreview } from "./ProposalPreview";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function when(value: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(value);
}

export function ProposalsPage({ onBack, onCreated, onOpenStudio }: { onBack: () => void; onCreated: (workflowId: string) => void; onOpenStudio?: (workflowId: string) => void }) {
  const [proposals, setProposals] = useState<WorkflowProposal[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listProposals("archived");
      setProposals(list);
      setSelectedId((current) => current && list.some((proposal) => proposal.id === current) ? current : list[0]?.id);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const selected = proposals.find((proposal) => proposal.id === selectedId);

  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-app">
      <header className="flex shrink-0 items-center gap-3 border-b border-hairline/60 px-4 py-3">
        <button type="button" onClick={onBack} aria-label={t("workflows.proposals.back")} className="grid size-8 place-items-center rounded-lg text-ink-secondary hover:bg-raised/60 hover:text-ink">
          <ArrowLeft size={16} />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-semibold text-ink">{t("workflows.proposals.title")}</h1>
          <p className="truncate text-[11.5px] text-ink-tertiary">{t("workflows.proposals.subtitle")}</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="ms-auto flex items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1.5 text-[11px] font-medium text-ink-secondary hover:bg-raised/60 disabled:opacity-50">
          <RefreshCw size={12} className={cn(loading && "animate-spin")} />
          {t("workflows.proposals.refresh")}
        </button>
      </header>

      {notice && <div className="border-b border-hairline/60 bg-accent/10 px-4 py-2 text-[12px] text-ink">{notice}</div>}
      {error && <div className="border-b border-danger/30 bg-danger/10 px-4 py-2 text-[12px] text-danger">{error}</div>}

      <div className="flex min-h-0 flex-1">
        <aside className="w-[320px] shrink-0 overflow-y-auto border-e border-hairline/60">
          {loading && proposals.length === 0 ? (
            <p className="p-4 text-[12px] text-ink-tertiary">{t("workflows.proposals.loading")}</p>
          ) : proposals.length === 0 ? (
            <div className="p-5 text-center">
              <p className="text-[12.5px] text-ink-secondary">{t("workflows.proposals.empty")}</p>
              <p className="mt-1 text-[11.5px] text-ink-tertiary">{t("workflows.proposals.emptyHint")}</p>
            </div>
          ) : proposals.map((proposal) => (
            <button
              key={proposal.id}
              type="button"
              onClick={() => setSelectedId(proposal.id)}
              aria-current={proposal.id === selectedId}
              className={cn(
                "block w-full border-b border-hairline/40 px-4 py-3 text-left",
                proposal.id === selectedId ? "bg-raised/60" : "hover:bg-raised/30",
              )}
            >
              <span className="flex items-center gap-2">
                <WorkflowIcon size={13} className="shrink-0 text-ink-tertiary" />
                <span className="truncate text-[12.5px] font-medium text-ink">{proposal.definition.name}</span>
              </span>
              <span className="mt-1 block truncate text-[11px] text-ink-tertiary">
                {proposal.department} · {t("workflows.proposals.stepCount", { count: proposal.definition.steps.length })} · {when(proposal.updatedAt)}
              </span>
            </button>
          ))}
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          {!selected ? (
            <p className="text-[12.5px] text-ink-tertiary">{t("workflows.proposals.selectOne")}</p>
          ) : (
            <div className="mx-auto max-w-[720px]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-tertiary">{t("workflows.proposals.kicker")}</p>
                  <h2 className="mt-1 text-[22px] font-semibold leading-tight text-ink">{selected.definition.name}</h2>
                  <p className="mt-1 text-[12px] text-ink-tertiary">
                    {selected.department} · {t("workflows.proposals.stepCount", { count: selected.definition.steps.length })} · {t("workflows.proposals.notCreated")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewOpen(true)}
                    className="flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-1.5 text-[11.5px] font-medium text-ink-secondary hover:bg-raised/60"
                  >
                    <FlaskConical size={13} /> {t("workflows.proposals.previewTitle")}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void act(async () => {
                      const created = await createWorkflowFromProposal(selected.id);
                      setNotice(t("workflows.proposals.created"));
                      onCreated(created.workflowId);
                    })}
                    className="flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-[11.5px] font-semibold text-app hover:opacity-90 disabled:opacity-50"
                  >
                    <Check size={13} /> {t("workflows.proposals.create")}
                  </button>
                  <button
                    type="button"
                    disabled={busy || selected.status === "created"}
                    onClick={() => void act(async () => {
                      await archiveProposal(selected.id);
                      setNotice(t("workflows.proposals.archived"));
                      await refresh();
                    })}
                    className="flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-1.5 text-[11.5px] font-medium text-ink-secondary hover:bg-raised/60 disabled:opacity-50"
                  >
                    <Archive size={13} /> {t("workflows.proposals.archive")}
                  </button>
                  <button
                    type="button"
                    disabled={busy || selected.status === "created"}
                    onClick={() => void act(async () => {
                      await deleteProposal(selected.id);
                      setSelectedId(undefined);
                      await refresh();
                    })}
                    className="flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-1.5 text-[11.5px] font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
                  >
                    <Trash2 size={13} /> {t("workflows.proposals.delete")}
                  </button>
                </div>
              </div>

              {selected.summary && <p className="mt-5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-secondary">{selected.summary}</p>}

              <dl className="mt-5 grid grid-cols-3 gap-3 rounded-xl border border-hairline/60 bg-panel p-4 text-[11.5px]">
                <div>
                  <dt className="text-ink-tertiary">{t("workflows.proposals.recurring")}</dt>
                  <dd className="mt-0.5 font-medium text-ink">{selected.interview.recurring ? t("workflows.proposals.recurringYes") : t("workflows.proposals.recurringNo")}</dd>
                </div>
                <div>
                  <dt className="text-ink-tertiary">{t("workflows.proposals.changes")}</dt>
                  <dd className="mt-0.5 text-ink">{selected.interview.changes || t("workflows.proposals.unknown")}</dd>
                </div>
                <div>
                  <dt className="text-ink-tertiary">{t("workflows.proposals.confirmer")}</dt>
                  <dd className="mt-0.5 text-ink">{selected.interview.confirmer || t("workflows.proposals.unknown")}</dd>
                </div>
              </dl>

              {selected.assumptions.length > 0 && (
                <section className="mt-4 rounded-xl border border-warning/30 bg-warning/10 p-4">
                  <h3 className="text-[12px] font-semibold text-warning">{t("workflows.proposals.assumptions")}</h3>
                  <ul className="mt-2 list-disc space-y-1 ps-4 text-[12px] leading-relaxed text-ink-secondary">
                    {selected.assumptions.map((line) => <li key={line}>{line}</li>)}
                  </ul>
                </section>
              )}

              <ol className="mt-5 space-y-2">
                {selected.definition.steps.map((step, index) => (
                  <li key={step.id} className="rounded-xl border border-hairline/60 bg-panel p-3">
                    <div className="flex items-center gap-2">
                      <span className="grid size-6 place-items-center rounded-full bg-ink text-[11px] font-semibold text-app">{index + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{step.name}</span>
                      <span className="rounded-full border border-hairline px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-tertiary">
                        {step.kind === "bot" ? t("workflows.proposals.botStep") : step.kind === "script" ? t("workflows.proposals.scriptStep") : step.kind === "loop" ? t("workflows.proposals.loopStep") : t("workflows.proposals.conditionStep")}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[11.5px] text-ink-tertiary">
                      {step.kind === "condition" || step.kind === "loop"
                        ? t("workflows.proposals.noFiles")
                        : `${t("workflows.proposals.outputs")}: ${step.outputs.map((output) => output.path).join(", ")}`}
                    </p>
                  </li>
                ))}
              </ol>

              {selected.status === "created" && selected.createdWorkflowId && (
                <p className="mt-4 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-[12px] text-success">
                  {t("workflows.proposals.alreadyCreated")}
                </p>
              )}
            </div>
          )}
        </main>
      </div>

      {previewOpen && selected && (
        <ProposalPreview
          proposal={selected}
          busy={busy}
          onClose={() => setPreviewOpen(false)}
          onNote={(stepId, text) => void act(async () => {
            await annotateProposal(selected.id, { ...selected.annotations, [stepId]: text });
            await refresh();
          })}
          onRehearse={() => void act(async () => {
            const result = await rehearseProposal(selected.id, {});
            setNotice(`${t("workflows.proposals.rehearsalResult")}: ${result.rehearsal?.status ?? "untested"}`);
            await refresh();
          })}
          onRound={() => void act(async () => {
            await bumpProposalRound(selected.id);
            await refresh();
          })}
          onOpenStudio={() => void act(async () => {
            const created = await createWorkflowFromProposal(selected.id);
            if (onOpenStudio) onOpenStudio(created.workflowId);
            else onCreated(created.workflowId);
          })}
        />
      )}
    </div>
  );
}
