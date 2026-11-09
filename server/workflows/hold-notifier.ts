import type { Notification } from "../../shared/notification.ts";
import type { WorkflowDefinition, WorkflowRun } from "../../shared/workflow.ts";
import { buildNotification, type NotifyBot } from "../notify.ts";

export interface WorkflowHoldNotifierDeps {
  bot(id: string): (NotifyBot & { threadId: string; avatarUrl?: string }) | undefined;
  workflow(id: string, version: number): WorkflowDefinition | undefined;
  send(notification: Notification, options: { adminOnly: true }): void;
}

export function createWorkflowHoldNotifier(deps: WorkflowHoldNotifierDeps): (run: WorkflowRun) => void {
  const notified = new Set<string>();
  return (run) => {
    if (run.status !== "waiting_manual" || !run.hold) return;
    const key = `${run.id}:${run.hold.step}`;
    if (notified.has(key)) return;
    const step = deps.workflow(run.workflowId, run.workflowVersion)?.steps[run.hold.step];
    if (!step || step.kind !== "bot") return;
    const bot = deps.bot(step.botId);
    if (!bot) return;
    const workflowName = run.snapshot?.name ?? run.workflowId;
    const stepName = run.snapshot?.steps[run.hold.step]?.name ?? run.steps[run.hold.step]?.id ?? step.id;
    const body = `Workflow "${workflowName}" · step "${stepName}" is waiting to continue.`;
    const notification = buildNotification("workflow-waiting", bot, bot.threadId, body, { avatarUrl: bot.avatarUrl });
    if (!notification) return;
    notification.body = body;
    notification.workflowRunId = run.id;
    notified.add(key);
    deps.send(notification, { adminOnly: true });
  };
}
