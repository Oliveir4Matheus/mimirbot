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
    const path = run.hold.path ?? (run.hold.step === undefined ? undefined : [run.hold.step]);
    if (!path) return;
    const key = `${run.id}:${path.join(".")}`;
    if (notified.has(key)) return;
    const definition = deps.workflow(run.workflowId, run.workflowVersion);
    const top = definition?.steps[path[0]!];
    const step = path.length === 1 ? top : top?.kind === "loop" ? top.body[path[2]!] : undefined;
    if (!step || step.kind !== "bot") return;
    const bot = deps.bot(step.botId);
    if (!bot) return;
    const workflowName = run.snapshot?.name ?? run.workflowId;
    const snapshotTop = run.snapshot?.steps[path[0]!];
    const stepName = path.length === 1
      ? snapshotTop?.name ?? run.steps[path[0]!]?.id ?? step.id
      : snapshotTop?.body?.[path[2]!]?.name ?? step.id;
    const body = `Workflow "${workflowName}" · step "${stepName}" is waiting to continue.`;
    const notification = buildNotification("workflow-waiting", bot, bot.threadId, body, { avatarUrl: bot.avatarUrl });
    if (!notification) return;
    notification.body = body;
    notification.workflowRunId = run.id;
    notified.add(key);
    deps.send(notification, { adminOnly: true });
  };
}
