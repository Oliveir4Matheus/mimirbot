import { describe, expect, it, vi } from "vitest";

import { workflowDefinitionSchema, type WorkflowRun } from "../../shared/workflow.ts";
import { createWorkflowHoldNotifier, type WorkflowHoldNotifierDeps } from "./hold-notifier.ts";

const definition = workflowDefinitionSchema.parse({
  id: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
  version: 1,
  name: "Monthly review",
  department: "Finance",
  steps: [
    {
      id: "review",
      name: "Review the numbers",
      botId: "bot-a",
      instructions: "Review.",
      mode: "manual",
      outputs: [{ path: "result.json" }],
    },
  ],
  createdAt: 1,
  updatedAt: 1,
});

const run = (overrides: Partial<WorkflowRun> = {}): WorkflowRun => ({
  id: "run-1",
  workflowId: definition.id,
  workflowVersion: definition.version,
  department: definition.department,
  status: "waiting_manual",
  currentStep: 0,
  steps: [{ id: "review", status: "pending" }],
  createdAt: 1,
  updatedAt: 1,
  hold: { step: 0, since: 1 },
  snapshot: { name: definition.name, steps: [{ id: "review", name: "Review the numbers" }] },
  ...overrides,
});

const bot = {
  id: "bot-a",
  name: "Scout",
  threadId: "main-thread",
  notifications: true,
  avatarUrl: "/api/attachments/avatar.png",
};

function setup(overrides: Partial<WorkflowHoldNotifierDeps> = {}) {
  const send = vi.fn();
  const note = createWorkflowHoldNotifier({
    bot: (id) => (id === bot.id ? bot : undefined),
    workflow: (id, version) => (id === definition.id && version === definition.version ? definition : undefined),
    send,
    ...overrides,
  });
  return { note, send };
}

describe("workflow hold notifier", () => {
  it("notifies once when a run starts waiting for a manual step", () => {
    const { note, send } = setup();

    note(run());

    expect(send).toHaveBeenCalledExactlyOnceWith({
      kind: "workflow-waiting",
      botId: "bot-a",
      botName: "Scout",
      threadId: "main-thread",
      title: "Scout is waiting for you",
      body: 'Workflow "Monthly review" · step "Review the numbers" is waiting to continue.',
      avatarUrl: "/api/attachments/avatar.png",
      workflowRunId: "run-1",
    }, { adminOnly: true });
  });

  it("does not duplicate the same run and step", () => {
    const { note, send } = setup();

    note(run());
    note(run());
    note(run({ updatedAt: 2 }));

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("notifies a later hold of the same run as its own wait", () => {
    const twoSteps = {
      ...definition,
      steps: [
        definition.steps[0]!,
        { ...definition.steps[0]!, id: "publish", name: "Publish" },
      ],
    };
    const { note, send } = setup({ workflow: () => twoSteps });

    note(run());
    note(run({ currentStep: 1, hold: { step: 1, since: 2 }, snapshot: { name: definition.name, steps: [{ id: "review", name: "Review the numbers" }, { id: "publish", name: "Publish" }] } }));

    expect(send).toHaveBeenCalledTimes(2);
  });

  it.each(["queued", "running", "waiting_approval", "succeeded", "failed", "cancelled"] as const)(
    "does not notify a %s run",
    (status) => {
      const { note, send } = setup();

      note(run({ id: `run-${status}`, status }));

      expect(send).not.toHaveBeenCalled();
    },
  );

  it("does not notify a waiting_manual run without a hold", () => {
    const { note, send } = setup();

    note(run({ hold: undefined }));

    expect(send).not.toHaveBeenCalled();
  });

  it("does not notify when the step's bot is gone", () => {
    const { note, send } = setup({ bot: () => undefined });

    note(run());

    expect(send).not.toHaveBeenCalled();
  });

  it("does not notify when the Workflow definition is gone", () => {
    const { note, send } = setup({ workflow: () => undefined });

    note(run());

    expect(send).not.toHaveBeenCalled();
  });

  it("falls back to the run and step ids when the snapshot is gone", () => {
    const { note, send } = setup();

    note(run({ snapshot: undefined }));

    expect(send.mock.calls[0]![0]).toMatchObject({
      body: `Workflow "${definition.id}" · step "review" is waiting to continue.`,
    });
  });
});
