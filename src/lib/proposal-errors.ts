import type { AuthoringIssue } from "../../shared/workflow-authoring";
import type { WorkflowProposalRehearsal } from "../../shared/workflow-proposal";
import { t } from "@/lib/i18n";

export interface ProposalIssue {
  path: string;
  message: string;
}

/** The authoring issues the band lists and sends, each with the path the validator used. */
export function authoringIssues(issues: readonly AuthoringIssue[]): ProposalIssue[] {
  return issues.map((issue) => ({ path: issue.path, message: issue.message }));
}

/** Only a diverged script is a rehearsal problem; an untested bot step is not. */
export function rehearsalIssues(rehearsal: WorkflowProposalRehearsal | undefined): ProposalIssue[] {
  if (rehearsal?.status !== "diverged") return [];
  return rehearsal.steps.flatMap((step, index) => step.label === "diverged"
    ? [{ path: `steps.${index}`, message: `${step.name}: ${step.detail ?? t("workflows.proposals.rehearsalNoDetail")}` }]
    : []);
}

/** What the bot receives on the conversation that created the proposal. */
export function proposalErrorMessage(kind: "authoring" | "rehearsal", name: string, issues: readonly ProposalIssue[]): string {
  const intro = kind === "authoring"
    ? t("workflows.proposals.sendAuthoringIntro", { name })
    : t("workflows.proposals.sendRehearsalIntro", { name });
  return [intro, "", ...issues.map((issue) => `- ${issue.path}: ${issue.message}`)].join("\n");
}
