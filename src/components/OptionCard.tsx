import { useEffect, useState } from "react";
import { FlaskConical, MessageCircleQuestion, X } from "lucide-react";
import { useStore, visibleMessages, type Message } from "@/state/store";
import { readProposal } from "@/lib/workflows-api";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { isPersistentQuestionCard, parseChoices } from "../../shared/ask-question";
import { ASK_FIELD, ASK_QUIET_BUTTON, AskCard, AskSettledLine, moveChoiceFocus, returnFocusToComposer } from "./AskCard";
import { ExpandableText } from "./ExpandableText";
import { ProposalPreviewDialog } from "./workflows/ProposalPreviewDialog";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

export function isOnboardingCard(message: Message): boolean {
  return message.kind === "options" && !!message.card && !message.card.requestId;
}

export function shouldHideOnboardingCard(message: Message, transcript: Message[]): boolean {
  if (!isOnboardingCard(message) || !message.card) return false;
  // A Workflow proposal outlives later turns: the person may answer it days later.
  if (message.card.workflowProposal) return false;
  if (message.card.dismissed || message.card.answered) return true;
  const index = transcript.findIndex((entry) => entry.id === message.id);
  if (index < 0) return false;
  return transcript.slice(index + 1).some((later) => later.role === "user" && later.kind === "text");
}

export function canDismissOptionCard(card: NonNullable<Message["card"]>): boolean {
  if (card.requestId && isPersistentQuestionCard(card)) return card.answered === "answer" && !card.dismissed;
  return true;
}

export function OptionCard({
  botId,
  threadId,
  message,
  groupId,
}: {
  botId: string;
  threadId?: string;
  message: Message;
  groupId?: string;
}) {
  const { state, dispatch } = useStore();
  const [custom, setCustom] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const proposalId = message.card?.workflowProposal?.id;
  const [proposalConfirmed, setProposalConfirmed] = useState<boolean>();
  useEffect(() => {
    if (proposalId === undefined) return;
    let cancelled = false;
    readProposal(proposalId)
      .then((proposal) => { if (!cancelled) setProposalConfirmed(proposal.interview.confirmedAt !== undefined); })
      .catch(() => { if (!cancelled) setProposalConfirmed(undefined); });
    return () => { cancelled = true; };
  }, [proposalId, previewOpen]);
  const card = message.card;
  const bot = state.bots.find((candidate) => candidate.id === botId);
  const transcript = bot ? visibleMessages(bot) : [];
  // Full thread, not the mounted window: a search-focus slice can omit the later message that hides this quiz.
  if (!card || shouldHideOnboardingCard(message, transcript) || (card.requestId && card.dismissed && card.answered)) return null;

  const title = card.title;
  const subtitle = card.subtitle;
  const options = parseChoices(card.options, LETTERS.length) ?? [];

  const answer = (text: string) => {
    if (!text.trim()) return;
    dispatch({ type: "answerCard", botId, threadId, messageId: message.id, answer: text.trim(), groupId });
    if (card.requestId) returnFocusToComposer();
  };

  const dismiss = canDismissOptionCard(card)
    ? () => dispatch({ type: "dismissCard", botId, threadId, messageId: message.id, groupId })
    : undefined;

  if (card.requestId && card.answered) {
    const closed = !card.answeredText && (card.answered === "deny" || card.answered === "unavailable");
    const picked = closed
      ? undefined
      : card.answeredText ?? (card.answered === "answer" || card.answered === "allow" ? "" : card.answered);
    return (
      <AskSettledLine
        ariaLabel={title}
        icon={picked === undefined ? <X size={13} /> : undefined}
        action={dismiss && (
          <button type="button" onClick={dismiss} aria-label={t("onboarding.card.dismiss")} title={t("onboarding.card.dismiss")} className={cn(ASK_QUIET_BUTTON, "w-7 px-0")}>
            <X size={14} />
          </button>
        )}
      >
        <span>{title}</span>
        <span className="text-ink-secondary"> · {closed ? t("question.status.closed") : picked || t("question.status.answered")}</span>
      </AskSettledLine>
    );
  }

  return (
    <AskCard
      ariaLabel={title}
      icon={<MessageCircleQuestion size={15} />}
      title={title}
      explanation={subtitle ? <ExpandableText text={subtitle} className="text-[13px] text-ink-secondary" /> : undefined}
      onDismiss={dismiss}
      dismissLabel={t("onboarding.card.dismiss")}
    >
      {card.workflowProposal && (
        <div className="rounded-xl border border-hairline/50 bg-inset/60 px-3 py-2 text-[12px] text-ink-secondary">
          <p className="font-medium text-ink">{t("workflows.proposals.cardTitle", { name: card.workflowProposal.name })}</p>
          <p className="mt-0.5">
            {card.workflowProposal.department} · {t("workflows.proposals.stepCount", { count: card.workflowProposal.steps })}
            {card.workflowProposal.assumptions > 0 ? ` · ${t("workflows.proposals.assumptionCount", { count: card.workflowProposal.assumptions })}` : ""}
          </p>
          <p className="mt-1 text-[11px] text-ink-tertiary">{t("workflows.proposals.cardHint")}</p>
          {proposalConfirmed !== true && (
            <p className="mt-1 text-[11px] text-warning">{t("workflows.proposals.interviewCreateBlocked")}</p>
          )}
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1 text-[11.5px] font-medium text-ink-secondary hover:bg-raised/60"
          >
            <FlaskConical size={13} /> {t("workflows.proposals.previewOpen")}
          </button>
        </div>
      )}
      {options.length > 0 && (
        <div onKeyDown={moveChoiceFocus} className="overflow-hidden rounded-2xl border border-hairline/40">
          {options.map((opt, i) => (
            <button
              key={opt}
              type="button"
              data-ask-choice=""
              disabled={!!card.answered || (card.workflowProposal !== undefined && i === 0 && proposalConfirmed !== true)}
              onClick={() => card.workflowProposal && i === 0 ? setPreviewOpen(true) : answer(opt)}
              className={cn(
                "flex w-full items-center gap-2.5 px-3 py-2 text-start text-[13px] font-medium leading-5 text-ink",
                i > 0 && "border-t border-hairline/40",
                (card.answeredText ?? card.answered) === opt
                  ? "bg-raised-hover"
                  : "hover:bg-raised-hover/60 disabled:hover:bg-transparent",
              )}
            >
              <span className="flex size-5 shrink-0 items-center justify-center rounded-md border border-hairline/50 bg-control text-[11px] font-medium text-ink-secondary">
                {LETTERS[i]}
              </span>
              <span dir="auto" className="min-w-0 break-words">{opt}</span>
            </button>
          ))}
        </div>
      )}

      {previewOpen && card.workflowProposal && (
        <ProposalPreviewDialog
          proposalId={card.workflowProposal.id}
          onClose={() => setPreviewOpen(false)}
          onCreated={() => {
            setPreviewOpen(false);
            answer(options[0] ?? t("workflows.proposals.create"));
          }}
        />
      )}

      {!card.answered && !card.tool && !card.fixedOptions && (
        <input
          dir="auto"
          value={custom}
          aria-label={t("onboarding.card.custom")}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && answer(custom)}
          placeholder={t("onboarding.card.custom")}
          className={cn(
            ASK_FIELD,
            "block w-full",
            options.length > 0 && "mt-2",
          )}
        />
      )}
    </AskCard>
  );
}
