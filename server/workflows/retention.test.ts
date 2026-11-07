import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { workflowDefinitionSchema, type WorkflowDefinition } from "../../shared/workflow.ts";
import { WORKFLOWS_ROOT_ENV } from "./paths.ts";
import { pruneWorkflowRuns } from "./retention.ts";
import { createWorkflowStore, type WorkflowStore } from "./store.ts";

let root: string;
let store: WorkflowStore;

const NOW = new Date("2026-11-07T12:00:00.000Z").getTime();
const DAY = 86_400_000;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "omb-workflow-retention-"));
  store = createWorkflowStore({
    dataDir: join(root, "data"),
    env: { [WORKFLOWS_ROOT_ENV]: join(root, "runs") },
    now: () => NOW,
    log: () => {},
  });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const definition = (overrides: Record<string, unknown> = {}): WorkflowDefinition => workflowDefinitionSchema.parse({
  id: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
  version: 1,
  name: "Contrato mensal",
  department: "Financeiro",
  steps: [{ id: "coletar", name: "Collect", botId: "bot-a", instructions: "Collect.", outputs: [{ path: "numbers.csv" }] }],
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

const makeRun = (workflow: WorkflowDefinition, status: "succeeded" | "running" | "queued" | "waiting_approval", finishedAgo?: number) => {
  const run = store.createRun(workflow);
  const finishedAt = finishedAgo === undefined ? undefined : NOW - finishedAgo;
  store.writeRun({
    ...run,
    status,
    ...(status === "running" ? { startedAt: NOW - DAY } : {}),
    ...(finishedAt === undefined ? {} : { finishedAt }),
  });
  return run.id;
};

describe("pruneWorkflowRuns", () => {
  it("removes a terminal run older than the Workflow retention and keeps a recent one", () => {
    const workflow = store.saveWorkflow(definition({ retentionDays: 30 }));
    if (!workflow.ok) throw new Error(workflow.error);
    const old = makeRun(workflow.workflow, "succeeded", 31 * DAY);
    const recent = makeRun(workflow.workflow, "succeeded", 29 * DAY);
    const result = pruneWorkflowRuns({ store, now: () => NOW });
    expect(result.removed).toEqual([old]);
    expect(result.kept).toBe(1);
    expect(store.readRun(old)).toBeUndefined();
    expect(store.readRun(recent)).toBeDefined();
  });

  it("never touches a running, queued or paused run, however old", () => {
    const workflow = store.saveWorkflow(definition({ retentionDays: 1 }));
    if (!workflow.ok) throw new Error(workflow.error);
    const running = makeRun(workflow.workflow, "running");
    const queued = makeRun(workflow.workflow, "queued");
    const paused = makeRun(workflow.workflow, "waiting_approval", 400 * DAY);
    const result = pruneWorkflowRuns({ store, now: () => NOW });
    expect(result.removed).toEqual([]);
    expect(result.kept).toBe(3);
    for (const id of [running, queued, paused]) expect(store.readRun(id)).toBeDefined();
  });

  it("uses the 90-day default for a Workflow whose definition is gone", () => {
    const workflow = store.saveWorkflow(definition());
    if (!workflow.ok) throw new Error(workflow.error);
    const old = makeRun(workflow.workflow, "succeeded", 91 * DAY);
    const recent = makeRun(workflow.workflow, "succeeded", 89 * DAY);
    store.removeWorkflow(workflow.workflow.id);
    const result = pruneWorkflowRuns({ store, now: () => NOW });
    expect(result.removed).toEqual([old]);
    expect(store.readRun(recent)).toBeDefined();
  });

  it("counts from createdAt when a terminal run has no finishedAt", () => {
    const workflow = store.saveWorkflow(definition({ retentionDays: 1 }));
    if (!workflow.ok) throw new Error(workflow.error);
    const run = store.createRun(workflow.workflow);
    store.writeRun({ ...run, status: "succeeded", createdAt: NOW - 2 * DAY, updatedAt: NOW - 2 * DAY });
    expect(pruneWorkflowRuns({ store, now: () => NOW }).removed).toEqual([run.id]);
  });
});
