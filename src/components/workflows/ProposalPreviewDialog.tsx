// The preview is the create's gate: a proposal opens here first, the rehearsal
// runs here, and a Workflow is only created from this dialog. It is reachable
// from the chat card and from Propostas, so both paths see the same review.
import { useCallback, useEffect, useState } from "react";

import type { WorkflowProposal } from "../../../shared/workflow-proposal";
import { annotateProposal, bumpProposalRound, confirmProposal, createWorkflowFromProposal, readProposal, rehearseProposal } from "@/lib/workflows-api";
import { ApiError } from "@/state/api";
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

  const create = (acknowledge?: string) => act(async () => {
    try {
      const created = await createWorkflowFromProposal(proposalId, acknowledge === undefined ? undefined : { reason: acknowledge });
      onCreated(created.workflowId);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409 && cause.body?.needsAcknowledgement === true) {
        setError(errorText(cause));
        return;
      }
      throw cause;
    }
  });

  if (!proposal) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4" role="dialog" aria-modal="true">
        <p className="rounded-xl border border-hairline bg-panel px-4 py-3 text-[12px] text-ink-secondary">{error ?? t("workflows.proposals.loading")}</p>
      </div>
    );
  }

  return (
    <ProposalPreview
      proposal={proposal}
      busy={busy}
      error={error}
      onClose={onClose}
      onNote={(stepId, text) => void act(async () => {
        await annotateProposal(proposalId, { ...proposal.annotations, [stepId]: text });
        await refresh();
      })}
      onRehearse={() => void act(async () => {
        await rehearseProposal(proposalId, {});
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
      onCreate={(reason) => void create(reason)}
    />
  );
}
