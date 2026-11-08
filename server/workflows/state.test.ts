import { describe, expect, it } from "vitest";

import { workflowDefinitionSchema, type WorkflowDefinition } from "../../shared/workflow.ts";
import {
  beginRun,
  beginStep,
  cancelRun,
  completeStep,
  createRun,
  failRun,
  failStep,
  isTerminalRun,
  pauseRun,
  resumeRun,
} from "./state.ts";

const definition = (): WorkflowDefinition => workflowDefinitionSchema.parse({
  id: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
  version: 1,
  name: "Contrato mensal",
  department: "Financeiro",
  steps: [
    { id: "coletar", name: "Collect", botId: "bot-a", instructions: "Collect.", outputs: [{ path: "numbers.csv" }] },
    { id: "revisar", name: "Review", botId: "bot-b", instructions: "Review.", inputs: [{ as: "numbers.csv", from: { step: "coletar", output: "numbers.csv" } }], outputs: [{ path: "decision.json" }], result: "decision.json" },
  ],
  createdAt: 1,
  updatedAt: 1,
});

const queued = () => createRun({ definition: definition(), runId: "20261103-123456-abcdef", now: 10 });

const running = () => {
  const begun = beginRun(queued(), 20);
  if (!begun.ok) throw new Error(begun.error);
  return begun.run;
};

describe("createRun", () => {
  it("starts queued with one pending step per definition step", () => {
    const run = queued();
    expect(run.status).toBe("queued");
    expect(run.currentStep).toBe(0);
    expect(run.steps).toEqual([
      { id: "coletar", status: "pending", attempts: 0 },
      { id: "revisar", status: "pending", attempts: 0 },
    ]);
    expect(run.department).toBe("Financeiro");
    expect(run.workflowVersion).toBe(1);
    expect(run.snapshot).toEqual({
      name: "Contrato mensal",
      steps: [{ id: "coletar", name: "Collect" }, { id: "revisar", name: "Review" }],
    });
  });

  it("keeps who asked for a bot-started run", () => {
    const run = createRun({ definition: definition(), runId: "20261103-123456-abcdef", now: 10, requestedBy: { botId: "bot-a", threadId: "t-1" } });
    expect(run.requestedBy).toEqual({ botId: "bot-a", threadId: "t-1" });
  });

  it("keeps the routine that triggered the run", () => {
    const run = createRun({ definition: definition(), runId: "20261103-123456-abcdef", now: 10, triggeredBy: { routineId: "r-1", routineName: "Nightly" } });
    expect(run.triggeredBy).toEqual({ routineId: "r-1", routineName: "Nightly" });
  });
});

describe("beginRun", () => {
  it("moves a queued run to running once", () => {
    const begun = beginRun(queued(), 20);
    expect(begun.ok && begun.run.status).toBe("running");
    expect(begun.ok && begun.run.startedAt).toBe(20);
    const again = beginRun(running(), 30);
    expect(again.ok).toBe(false);
  });
});

describe("beginStep", () => {
  it("records the thread, counts the attempt and only moves the current step", () => {
    const started = beginStep(running(), 0, { threadId: "t-1" }, 30);
    if (!started.ok) throw new Error(started.error);
    expect(started.run.steps[0]).toMatchObject({ status: "running", attempts: 1, threadId: "t-1", startedAt: 30 });
    expect(beginStep(started.run, 1, { threadId: "t-2" }, 31).ok).toBe(false);
    expect(beginStep(started.run, 0, { threadId: "t-2" }, 31).ok).toBe(false);
  });
});

describe("completeStep", () => {
  it("advances to the next step and keeps the verified outputs", () => {
    const started = beginStep(running(), 0, { threadId: "t-1" }, 30);
    if (!started.ok) throw new Error(started.error);
    const done = completeStep(started.run, 0, { verified: ["numbers.csv"] }, 40);
    if (!done.ok) throw new Error(done.error);
    expect(done.run.currentStep).toBe(1);
    expect(done.run.status).toBe("running");
    expect(done.run.steps[0]).toMatchObject({ status: "succeeded", verified: ["numbers.csv"], finishedAt: 40 });
  });

  it("finishes the run on the last step and keeps its result", () => {
    const first = beginStep(running(), 0, { threadId: "t-1" }, 30);
    if (!first.ok) throw new Error(first.error);
    const second = completeStep(first.run, 0, { verified: ["numbers.csv"] }, 40);
    if (!second.ok) throw new Error(second.error);
    const third = beginStep(second.run, 1, { threadId: "t-2" }, 50);
    if (!third.ok) throw new Error(third.error);
    const last = completeStep(third.run, 1, { verified: ["decision.json"], result: { ok: true } }, 60);
    if (!last.ok) throw new Error(last.error);
    expect(last.run.status).toBe("succeeded");
    expect(last.run.currentStep).toBe(2);
    expect(last.run.result).toEqual({ ok: true });
    expect(last.run.finishedAt).toBe(60);
    expect(isTerminalRun(last.run.status)).toBe(true);
  });
});

describe("failures and cancellation", () => {
  it("fails the step and the run with the verified reason", () => {
    const started = beginStep(running(), 0, { threadId: "t-1" }, 30);
    if (!started.ok) throw new Error(started.error);
    const failed = failStep(started.run, 0, "missing required output \"numbers.csv\"", 40);
    if (!failed.ok) throw new Error(failed.error);
    expect(failed.run.status).toBe("failed");
    expect(failed.run.error).toContain("missing required output");
    expect(failed.run.steps[0]).toMatchObject({ status: "failed", error: "missing required output \"numbers.csv\"" });
    expect(failStep(failed.run, 0, "again", 50).ok).toBe(false);
  });

  it("fails a run outside a step and marks a running step", () => {
    const started = beginStep(running(), 0, { threadId: "t-1" }, 30);
    if (!started.ok) throw new Error(started.error);
    const failed = failRun(started.run, "definition is gone", 40);
    if (!failed.ok) throw new Error(failed.error);
    expect(failed.run.status).toBe("failed");
    expect(failed.run.steps[0]).toMatchObject({ status: "failed", error: "definition is gone" });
  });

  it("cancels a running run, skips the running step and keeps the files untouched", () => {
    const started = beginStep(running(), 0, { threadId: "t-1" }, 30);
    if (!started.ok) throw new Error(started.error);
    const cancelled = cancelRun(started.run, "person stopped it", 40);
    if (!cancelled.ok) throw new Error(cancelled.error);
    expect(cancelled.run.status).toBe("cancelled");
    expect(cancelled.run.error).toBe("person stopped it");
    expect(cancelled.run.steps[0]).toMatchObject({ status: "skipped", error: "person stopped it" });
    expect(cancelled.run.steps[1]).toMatchObject({ status: "pending" });
    expect(cancelRun(cancelled.run, "again", 50).ok).toBe(false);
  });
});

describe("approval pauses", () => {
  it("waits and resumes without losing the step", () => {
    const started = beginStep(running(), 0, { threadId: "t-1" }, 30);
    if (!started.ok) throw new Error(started.error);
    const paused = pauseRun(started.run, { stepId: "coletar", question: "ok?", cardIds: ["c-1"], askedAt: 40 }, 40);
    if (!paused.ok) throw new Error(paused.error);
    expect(paused.run.status).toBe("waiting_approval");
    expect(paused.run.pause?.question).toBe("ok?");
    const resumed = resumeRun(paused.run, 50);
    if (!resumed.ok) throw new Error(resumed.error);
    expect(resumed.run.status).toBe("running");
    expect(resumed.run.pause).toBeUndefined();
  });
});
