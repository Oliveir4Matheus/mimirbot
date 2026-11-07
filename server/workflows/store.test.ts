import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { workflowDefinitionSchema, type WorkflowDefinition } from "../../shared/workflow.ts";
import { WORKFLOWS_ROOT_ENV } from "./paths.ts";
import { createWorkflowStore } from "./store.ts";

let root: string;
let dataDir: string;
let runsRoot: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "omb-workflow-store-"));
  dataDir = join(root, "data");
  runsRoot = join(root, "runs");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const definition = (overrides: Record<string, unknown> = {}): WorkflowDefinition => workflowDefinitionSchema.parse({
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
  ...overrides,
});

const makeStore = (now: () => number = () => 1_000) => createWorkflowStore({
  dataDir,
  env: { [WORKFLOWS_ROOT_ENV]: runsRoot },
  now,
  log: () => {},
});

const saved = (store: ReturnType<typeof makeStore>, input: unknown = definition()) => {
  const result = store.saveWorkflow(input);
  if (!result.ok) throw new Error(result.error);
  return result.workflow;
};

describe("definitions", () => {
  it("saves a new definition and lists its latest version", () => {
    const store = makeStore();
    const workflow = saved(store);
    expect(workflow.version).toBe(1);
    expect(store.workflows().map((entry) => entry.id)).toEqual([workflow.id]);
    expect(store.workflow(workflow.id)?.name).toBe("Contrato mensal");
    expect(existsSync(join(dataDir, "workflows.json"))).toBe(true);
    expect(JSON.parse(readFileSync(join(dataDir, "workflows.json"), "utf8")).workflows).toHaveLength(1);
  });

  it("keeps the version when nothing changed and bumps it on a real change", () => {
    const store = makeStore();
    const first = saved(store);
    expect(saved(store).version).toBe(1);
    const changed = saved(store, { ...first, name: "Contrato trimestral" });
    expect(changed.version).toBe(2);
    expect(store.versions(first.id).map((entry) => entry.version)).toEqual([1, 2]);
    expect(store.workflow(first.id)?.name).toBe("Contrato trimestral");
    expect(store.workflow(first.id, 1)?.name).toBe("Contrato mensal");
  });

  it("normalizes an uppercase uuid to one folder and one history", () => {
    const store = makeStore();
    const first = saved(store);
    const upper = saved(store, { ...first, id: first.id.toUpperCase(), name: "Outro nome" });
    expect(upper.id).toBe(first.id);
    expect(store.versions(first.id)).toHaveLength(2);
  });

  it("refuses an invalid definition", () => {
    const store = makeStore();
    const result = store.saveWorkflow({ ...definition(), id: "contrato-mensal" });
    expect(result.ok).toBe(false);
    expect(store.workflows()).toEqual([]);
  });

  it("never overwrites an unreadable workflows.json", () => {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(join(dataDir, "workflows.json"), "{ not json");
    const store = makeStore();
    expect(store.workflows()).toEqual([]);
    expect(store.saveWorkflow(definition()).ok).toBe(false);
    expect(readFileSync(join(dataDir, "workflows.json"), "utf8")).toBe("{ not json");
  });

  it("removes every version of a definition", () => {
    const store = makeStore();
    const workflow = saved(store);
    saved(store, { ...workflow, name: "Outro" });
    expect(store.removeWorkflow(workflow.id)).toBe(true);
    expect(store.workflows()).toEqual([]);
    expect(store.removeWorkflow(workflow.id)).toBe(false);
  });
});

describe("runs", () => {
  it("creates the run folder, every step folder and run.json", () => {
    const store = makeStore();
    const workflow = saved(store);
    const run = store.createRun(workflow);
    const dir = store.runDir(run);
    expect(existsSync(join(dir, "run.json"))).toBe(true);
    for (const index of [0, 1]) {
      expect(statSync(join(store.stepFolder(run, index), "input")).isDirectory()).toBe(true);
      expect(statSync(join(store.stepFolder(run, index), "output")).isDirectory()).toBe(true);
    }
    expect(statSync(join(dir, "run.json")).mode & 0o777).toBe(0o600);
    expect(store.readRun(run.id)).toEqual(run);
    expect(store.listRuns().map((entry) => entry.id)).toEqual([run.id]);
  });

  it("keeps the department and the requester in the run", () => {
    const store = makeStore();
    const workflow = saved(store);
    const run = store.createRun(workflow, { requestedBy: { botId: "bot-a", threadId: "t-1" } });
    expect(run.department).toBe("Financeiro");
    expect(store.readRun(run.id)?.requestedBy).toEqual({ botId: "bot-a", threadId: "t-1" });
  });

  it("filters runs by workflow, department and limit", () => {
    const store = makeStore();
    const first = saved(store);
    const second = saved(store, { ...definition(), id: "11111111-2222-4333-8444-555555555555", name: "Outro", department: "Operações" });
    const one = store.createRun(first);
    const two = store.createRun(second);
    expect(store.listRuns({ workflowId: first.id }).map((run) => run.id)).toEqual([one.id]);
    expect(store.listRuns({ department: "Operações" }).map((run) => run.id)).toEqual([two.id]);
    expect(store.listRuns({ limit: 1 })).toHaveLength(1);
  });

  it("removes only the run folder", () => {
    const store = makeStore();
    const workflow = saved(store);
    const run = store.createRun(workflow);
    const other = store.createRun(workflow);
    expect(store.deleteRun(run.id)).toBe(true);
    expect(store.readRun(run.id)).toBeUndefined();
    expect(store.readRun(other.id)).toEqual(other);
    expect(store.deleteRun(run.id)).toBe(false);
  });

  it("ignores a hand-edited run.json", () => {
    const store = makeStore();
    const workflow = saved(store);
    const run = store.createRun(workflow);
    writeFileSync(join(store.runDir(run), "run.json"), JSON.stringify({ id: run.id, status: "running" }));
    expect(store.readRun(run.id)).toBeUndefined();
    expect(store.listRuns()).toEqual([]);
  });

  it("falls back to the default retention when the definition is gone", () => {
    const store = makeStore();
    const workflow = saved(store);
    expect(store.retentionDays(workflow.id)).toBe(90);
    expect(store.retentionDays("11111111-2222-4333-8444-555555555555")).toBe(90);
    const custom = saved(store, { ...workflow, retentionDays: 7 });
    expect(store.retentionDays(custom.id)).toBe(7);
  });
});
