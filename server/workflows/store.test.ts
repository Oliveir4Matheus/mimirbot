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
    { id: "revisar", name: "Review", botId: "bot-b", instructions: "Review.", inputs: [{ as: "numbers.csv", from: { step: "coletar", output: "numbers.csv" } }], outputs: [{ path: "decision.json" }] },
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
  it("saves the trigger track and reads it back", () => {
    const store = makeStore();
    const workflow = saved(store, definition({
      triggers: [
        { id: "manual", kind: "manual", name: "Manual" },
        { id: "diaria", kind: "routine", name: "Diária", routineId: "rtn-1" },
      ],
    }));
    expect(store.workflow(workflow.id)?.triggers.map((trigger) => trigger.kind)).toEqual(["manual", "routine"]);
    const raw = JSON.parse(readFileSync(join(dataDir, "workflows.json"), "utf8"));
    expect(raw.workflows[0].triggers).toHaveLength(2);
  });

  it("reads a file written without triggers as one manual node and leaves the file alone", () => {
    const legacy = { ...definition() } as Record<string, unknown>;
    delete legacy.triggers;
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(join(dataDir, "workflows.json"), JSON.stringify({ version: 1, workflows: [legacy] }));
    const store = makeStore();
    expect(store.workflow(String(legacy.id))?.triggers).toEqual([{ id: "manual", kind: "manual", name: "Manual" }]);
    const raw = JSON.parse(readFileSync(join(dataDir, "workflows.json"), "utf8"));
    expect(raw.workflows[0].triggers).toBeUndefined();
  });

  it("refuses a save without triggers", () => {
    const store = makeStore();
    const legacy = { ...definition() } as Record<string, unknown>;
    delete legacy.triggers;
    const result = store.saveWorkflow(legacy);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("triggers");
  });

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

  it("keeps the version when only the canvas changed", () => {
    const store = makeStore();
    const first = saved(store);
    const moved = saved(store, {
      ...first,
      canvas: { nodes: { coletar: { x: 10, y: 20 } }, notes: [], containers: [] },
    });
    expect(moved.version).toBe(1);
    expect(store.workflow(first.id)?.canvas?.nodes.coletar).toEqual({ x: 10, y: 20 });
  });

  it("writes the scripts a save carries before checking the step that uses them", () => {
    const store = makeStore();
    const scripted = definition({
      steps: [{
        id: "validar", kind: "script", name: "Validate", run: "validar.mjs", timeoutMs: 60_000,
        outputs: [{ path: "result.json" }],
      }],
    });
    const result = store.saveWorkflow(scripted, { scripts: [{ name: "validar.mjs", content: "console.log('ok')\n" }] });
    if (!result.ok) throw new Error(result.error);
    expect(result.workflow.steps[0]!.kind).toBe("script");
    expect(store.readScript(scripted.id, "validar.mjs")?.content).toBe("console.log('ok')\n");
  });

  it("refuses a script step whose file the save did not carry", () => {
    const store = makeStore();
    const scripted = definition({
      steps: [{
        id: "validar", kind: "script", name: "Validate", run: "validar.mjs", timeoutMs: 60_000,
        outputs: [{ path: "result.json" }],
      }],
    });
    expect(store.saveWorkflow(scripted).ok).toBe(false);
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
    if (process.platform !== "win32") expect(statSync(join(dir, "run.json")).mode & 0o777).toBe(0o600);
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

describe("Do While persistence", () => {
  const loopDefinition = (overrides: Record<string, unknown> = {}): WorkflowDefinition => workflowDefinitionSchema.parse({
    ...definition(),
    steps: [{
      id: "laco",
      kind: "loop",
      name: "Loop",
      body: [{ id: "atualiza", kind: "bot", name: "Update", botId: "bot-a", instructions: "Update.", outputs: [{ path: "result.json", shape: { type: "object" } }] }],
      from: { step: "atualiza", output: "result.json" },
      conditions: [{ field: "restantes", op: "lte", value: 0 }],
      maxIterations: 3,
      outputs: [{ path: "result.json" }],
    }],
    ...overrides,
  });

  it("stores canvas.loops and does not create a version when only the body layout moves", () => {
    const store = makeStore();
    const first = saved(store, loopDefinition());
    const moved = saved(store, {
      ...first,
      canvas: {
        nodes: { laco: { x: 10, y: 20 } },
        notes: [],
        containers: [],
        loops: { laco: { nodes: { atualiza: { x: 50, y: 60 } }, notes: [], containers: [] } },
      },
    });
    expect(moved.version).toBe(1);
    expect(store.workflow(first.id)?.canvas?.loops.laco?.nodes.atualiza).toEqual({ x: 50, y: 60 });
  });

  it("creates a version when the body changes", () => {
    const store = makeStore();
    saved(store, loopDefinition());
    const changed = loopDefinition();
    const loop = changed.steps[0];
    if (loop?.kind !== "loop") throw new Error("not a loop");
    loop.conditions = [{ field: "restantes", op: "lte", value: 2 }];
    const second = saved(store, changed);
    expect(second.version).toBe(2);
  });

  it("writes and reads a run with iterations, snapshot body and hold path", () => {
    const store = makeStore();
    const workflow = saved(store, loopDefinition());
    const run = store.createRun(workflow);
    expect(run.steps[0]).toMatchObject({ id: "laco", kind: "loop", iterations: [] });
    expect(run.snapshot?.steps[0]?.body).toEqual([{ id: "atualiza", name: "Update" }]);
    store.writeRun({
      ...run,
      status: "waiting_manual",
      startedAt: 2,
      currentStep: 0,
      hold: { path: [0, 0, 0], since: 2 },
      steps: [{
        id: "laco",
        kind: "loop",
        status: "running",
        startedAt: 2,
        iterations: [{
          index: 1,
          status: "running",
          startedAt: 2,
          conditionMatched: false,
          steps: [{ id: "atualiza", status: "pending" }],
        }],
      }],
    });
    const read = store.readRun(run.id)!;
    expect(read.status).toBe("waiting_manual");
    expect(read.hold?.path).toEqual([0, 0, 0]);
    expect(read.steps[0]!.iterations![0]!.steps[0]!.id).toBe("atualiza");
  });

  it("still reads a run written before iterations and hold.path existed", () => {
    const store = makeStore();
    const workflow = saved(store);
    const run = store.createRun(workflow);
    store.writeRun({ ...run, status: "waiting_manual", startedAt: 2, hold: { step: 0, since: 2 } });
    const read = store.readRun(run.id)!;
    expect(read.hold).toEqual({ step: 0, since: 2 });
    expect(read.steps[0]!.iterations).toBeUndefined();
  });
});

describe("the authoring contract on load and on save", () => {
  const legacyDefinition = {
    id: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
    version: 1,
    name: "Contrato mensal",
    department: "Financeiro",
    createdAt: 1,
    updatedAt: 1,
    triggers: [{ id: "manual", kind: "manual", name: "Manual" }],
    steps: [
      { id: "coletar", name: "Collect", botId: "bot-a", instructions: "Collect.", outputs: [{ path: "numbers.csv" }] },
      {
        id: "revisar",
        name: "Review",
        botId: "bot-b",
        instructions: "Review.",
        outputs: [{ path: "decision.json" }],
        result: "decision.json",
        require: { ok: true },
        when: [{ field: "ok", equals: true, next: "fechar" }],
      },
      { id: "checar", kind: "condition", name: "Check", from: "revisar", conditions: [{ field: "ok", op: "equals", value: true }], whenTrue: "fechar" },
      { id: "fechar", name: "Close", botId: "bot-a", instructions: "Close.", outputs: [{ path: "done.txt" }] },
    ],
  };

  it("loads a Workflow written before result left the contract, keeping it in the list", () => {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(join(dataDir, "workflows.json"), JSON.stringify({ version: 1, workflows: [legacyDefinition] }));
    const store = makeStore();
    const loaded = store.workflow(legacyDefinition.id);
    expect(loaded?.steps).toHaveLength(4);
    expect(loaded?.steps[2]).toMatchObject({ kind: "condition", from: { step: "revisar", output: "decision.json" } });
  });

  it("refuses when and require on save, naming the condition step that replaces them", () => {
    const store = makeStore();
    const result = store.saveWorkflow(legacyDefinition);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("condition step");
    expect(result.error).toContain("when is gone");
    expect(result.error).toContain("require is gone");
  });

  it("saves a legacy result with a warning instead of a refusal", () => {
    const store = makeStore();
    const result = store.saveWorkflow({
      ...legacyDefinition,
      steps: [
        { id: "coletar", name: "Collect", botId: "bot-a", instructions: "Collect.", outputs: [{ path: "numbers.csv" }] },
        { id: "revisar", name: "Review", botId: "bot-b", instructions: "Review.", outputs: [{ path: "decision.json" }], result: "decision.json" },
        { id: "fechar", name: "Close", botId: "bot-a", instructions: "Close.", outputs: [{ path: "done.txt" }] },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.map((issue) => issue.message).join(" ")).toContain("result no longer declares");
  });

  it("refuses an output without an extension, a glob and a consumed .json without a shape", () => {
    const store = makeStore();
    const noExtension = store.saveWorkflow({ ...legacyDefinition, steps: [{ id: "coletar", name: "Collect", botId: "bot-a", instructions: "Collect.", outputs: [{ path: "link" }] }] });
    expect(noExtension.ok).toBe(false);
    const glob = store.saveWorkflow({ ...legacyDefinition, steps: [{ id: "coletar", name: "Collect", botId: "bot-a", instructions: "Collect.", outputs: [{ path: "clip1_*_9x16.mp4" }] }] });
    expect(glob.ok).toBe(false);
    const noShape = store.saveWorkflow({
      ...legacyDefinition,
      steps: [
        { id: "coletar", name: "Collect", botId: "bot-a", instructions: "Collect.", outputs: [{ path: "numbers.json" }] },
        { id: "checar", kind: "condition", name: "Check", from: { step: "coletar", output: "numbers.json" }, conditions: [{ field: "ok", op: "exists" }] },
      ],
    });
    expect(noShape.ok).toBe(false);
    if (noShape.ok) return;
    expect(noShape.error).toContain("needs a shape");
  });

  it("accepts only .mjs as a script name", () => {
    const store = makeStore();
    for (const run of ["validar.js", "validar.ts", "validar.py"]) {
      const result = store.saveWorkflow({
        ...legacyDefinition,
        steps: [{ id: "validar", kind: "script", name: "Validate", run, outputs: [{ path: "result.json" }] }],
      });
      expect(result.ok).toBe(false);
    }
    const accepted = store.saveWorkflow({
      ...legacyDefinition,
      steps: [{ id: "validar", kind: "script", name: "Validate", run: "validar.mjs", modules: ["ffmpeg", "gpu"], outputs: [{ path: "result.json" }] }],
    }, { scripts: [{ name: "validar.mjs", content: "console.log('ok')\n" }] });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.workflow.steps[0]).toMatchObject({
      kind: "script",
      modules: [{ name: "ffmpeg", runtime: "bin" }, { name: "gpu", runtime: "bin" }],
    });
  });
});
