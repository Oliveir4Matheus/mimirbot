import { describe, expect, it, vi } from "vitest";

import type { WorkflowRun } from "../../shared/workflow";
import { resolveWorkflowFocus } from "@/lib/workflow-focus";
import { initialState, openNotificationTarget, reducer } from "./store";

const run = (overrides: Partial<WorkflowRun> = {}): WorkflowRun => ({
  id: "run-1",
  workflowId: "workflow-1",
  workflowVersion: 1,
  department: "Finance",
  status: "waiting_manual",
  currentStep: 0,
  steps: [{ id: "review", status: "pending" }],
  createdAt: 1,
  updatedAt: 1,
  hold: { step: 0, since: 1 },
  ...overrides,
});

describe("Workflow notification navigation", () => {
  it("opens the Workflow screen instead of a thread when the notification names a run", () => {
    const dispatch = vi.fn();

    openNotificationTarget(dispatch, { botId: "bot-1", threadId: "main-thread", workflowRunId: "run-1" }, { bots: [], groups: [] }, true);

    expect(dispatch.mock.calls.map(([action]) => action)).toEqual([{ type: "showWorkflowRun", runId: "run-1" }]);
  });

  it("keeps opening the thread when there is no Workflow run", () => {
    const dispatch = vi.fn();
    const bots = [{ id: "bot-1", threadId: "main-thread", tasks: [{ threadId: "detached-thread" }] }];

    openNotificationTarget(dispatch, { botId: "bot-1", threadId: "detached-thread" }, { bots, groups: [] }, true);

    expect(dispatch.mock.calls.map(([action]) => action)).toEqual([
      { type: "select", id: "bot-1" },
      { type: "switchTask", botId: "bot-1", threadId: "detached-thread" },
    ]);
  });

  it("focuses the run and closes the panels when the view action lands", () => {
    const focused = reducer(
      { ...initialState, activeView: "chat", settingsOpen: true, notificationsOpen: true, computerOpen: true },
      { type: "showWorkflowRun", runId: "run-1", workflowId: "workflow-1" },
    );

    expect(focused).toMatchObject({
      activeView: "workflow-console",
      workflowFocusRunId: "run-1",
      workflowFocusWorkflowId: "workflow-1",
      settingsOpen: false,
      notificationsOpen: false,
      computerOpen: false,
    });

    expect(reducer(focused, { type: "workflowFocusConsumed" })).toMatchObject({
      activeView: "workflow-console",
      workflowFocusRunId: undefined,
      workflowFocusWorkflowId: undefined,
    });
  });
});

describe("resolveWorkflowFocus", () => {
  it("selects the run's Workflow once the feed has it", () => {
    expect(resolveWorkflowFocus({ runId: "run-1" }, [run()], false)).toEqual({
      kind: "open",
      runId: "run-1",
      workflowId: "workflow-1",
    });
  });

  it("waits while the feed is still loading", () => {
    expect(resolveWorkflowFocus({ runId: "run-1" }, [], true)).toEqual({ kind: "wait" });
  });

  it("reports a run that was deleted or aged out, so the page clears the focus", () => {
    expect(resolveWorkflowFocus({ runId: "gone" }, [run()], false)).toEqual({ kind: "missing" });
  });

  it("does nothing without a focused run", () => {
    expect(resolveWorkflowFocus({}, [run()], false)).toBeNull();
  });
});
