// The preview is the create's gate: a proposal opens here first, the rehearsal
// runs here, and a Workflow is only created from this dialog. It is reachable
// from the chat card and from Propostas, so both paths see the same review.
import { useCallback, useEffect, useState } from "react";

import type { WorkflowProposal } from "../../../shared/workflow-proposal";
import { annotateProposal, bumpProposalRound, confirmProposal, createWorkflowFromProposal, readProposal, rehearseProposal } from "@/lib/workflows-api";
import { useStore } from "@/state/store";
import { t } from "@/lib/i18n";
import { ProposalPreview } from "./ProposalPreview";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ProposalPreviewDialog({ proposalId, onClose, onCreated }: {
  proposalId: string;
  onClose: () => void;
  onCreated: (workflowId: string) => void;
}) {
  const { state, dispatch } = useStore();
  const [proposal, setProposal] = useState<WorkflowProposal>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setProposal(await readProposal(proposalId));
  }, [proposalId]);

  useEffect(() => {
    refresh().catch((cause) => setError(errorText(cause)));
  }, [refresh]);

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

  if (!proposal) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <p className="rounded-xl border border-hairline bg-panel px-4 py-3 text-[12px] text-ink-secondary">{error ?? t("workflows.proposals.loading")}</p>
      </div>
    );
  }

  const createdBy = proposal.createdBy;
  const botNames = Object.fromEntries(state.bots.map((bot) => [bot.id, bot.name]));

  return (
    <ProposalPreview
      proposal={proposal}
      busy={busy}
      error={error}
      botNames={botNames}
      onClose={onClose}
      onNote={(stepId, text) => void act(async () => {
        await annotateProposal(proposalId, { ...proposal.annotations, [stepId]: text });
        await refresh();
      })}
      onRehearse={(example) => void act(async () => {
        await rehearseProposal(proposalId, example);
        await refresh();
      })}
      onRound={() => void act(async () => {
        await bumpProposalRound(proposalId);
        await refresh();
      })}
      onConfirm={(answers) => void act(async () => {
        await confirmProposal(proposalId, answers);
        await refresh();
      })}
      onSendError={createdBy === undefined ? undefined : (text) => {
        dispatch({ type: "send", botId: createdBy.botId, threadId: createdBy.threadId, text });
      }}
      onCreate={() => void act(async () => {
        const created = await createWorkflowFromProposal(proposalId);
        onCreated(created.workflowId);
      })}
    />
  );
}
