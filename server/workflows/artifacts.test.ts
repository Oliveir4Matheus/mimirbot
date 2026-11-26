import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { workflowDefinitionSchema, workflowRunSchema, type WorkflowDefinition, type WorkflowRun } from "../../shared/workflow.ts";
import {
  WORKFLOW_ARTIFACT_FILES_PER_ORIGIN,
  listWorkflowArtifacts,
  openWorkflowArtifact,
  workflowArtifactKind,
} from "./artifacts.ts";
import { iterationStepOutputDir, stepDir, stepOutputDir } from "./paths.ts";

const NOW = new Date("2026-11-17T09:45:01.000Z").getTime();
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "omb-workflow-artifacts-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const definition = (overrides: Record<string, unknown> = {}): WorkflowDefinition => workflowDefinitionSchema.parse({
  id: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
  version: 1,
  name: "Resumo diário",
  department: "Financeiro",
  triggers: [{ id: "manual", kind: "manual", name: "Manual" }],
  retentionDays: 90,
  steps: [
    { id: "coletar", kind: "bot", name: "Coletar", botId: "bot-a", instructions: "Collect.", outputs: [{ path: "dados.csv", required: true }] },
    {
      id: "laco", kind: "loop", name: "Do While", maxIterations: 3,
      body: [{ id: "preparar", kind: "bot", name: "Preparar", botId: "bot-a", instructions: "Prepare.", outputs: [{ path: "result.json", required: true }] }],
      from: { step: "preparar", output: "result.json" },
      conditions: [{ field: "restantes", op: "lte", value: 0 }],
      outputs: [{ path: "result.json", required: true }],
    },
  ],
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

const run = (overrides: Partial<WorkflowRun> = {}): WorkflowRun => workflowRunSchema.parse({
  id: "20261117-094501-3f9c1a",
  workflowId: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
  workflowVersion: 1,
  department: "Financeiro",
  status: "succeeded",
  currentStep: 2,
  createdAt: NOW - 1_000,
  updatedAt: NOW,
  startedAt: NOW - 1_000,
  finishedAt: NOW,
  steps: [
    { id: "coletar", status: "succeeded", verified: ["dados.csv"] },
    {
      id: "laco", status: "succeeded", kind: "loop", verified: ["result.json"],
      iterations: [
        { index: 1, status: "succeeded", steps: [{ id: "preparar", status: "succeeded", verified: ["result.json"] }] },
        { index: 2, status: "succeeded", steps: [{ id: "preparar", status: "succeeded", verified: ["result.json"] }] },
      ],
    },
  ],
  ...overrides,
});

const write = (path: string, text = "x"): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};

const list = (value: WorkflowRun = run(), overrides: Partial<Parameters<typeof listWorkflowArtifacts>[0]> = {}) =>
  listWorkflowArtifacts({ run: value, runDir: join(root, value.id), definition: definition(), retentionDays: 90, now: NOW, ...overrides });

describe("listWorkflowArtifacts", () => {
  it("lists a step's output and each Do While round, ignoring input, the step root and caches", () => {
    const value = run();
    const runDir = join(root, value.id);
    write(join(stepOutputDir(runDir, 1), "dados.csv"), "nome,total\nana,10\n");
    write(join(stepOutputDir(runDir, 1), "resumo.md"), "# ok\n");
    write(join(stepOutputDir(runDir, 1), "nao-declarado.txt"), "!");
    write(join(stepDir(runDir, 1), "input", "params.json"), "{}");
    write(join(stepDir(runDir, 1), "rascunho.txt"), "rascunho");
    write(join(stepOutputDir(runDir, 1), ".env"), "SECRET=1");
    write(join(stepOutputDir(runDir, 1), "node_modules", "x", "a.js"), "x");
    write(join(stepOutputDir(runDir, 1), "__pycache__", "a.pyc"), "x");
    write(join(stepOutputDir(runDir, 1), ".git", "config"), "x");
    write(join(stepOutputDir(runDir, 1), ".venv", "bin", "python"), "x");
    write(join(stepOutputDir(runDir, 2), "result.json"), JSON.stringify({ restantes: 0 }));
    write(join(iterationStepOutputDir(runDir, 1, "preparar"), "result.json"), JSON.stringify({ restantes: 2 }));
    write(join(iterationStepOutputDir(runDir, 2, "preparar"), "result.json"), JSON.stringify({ restantes: 1 }));

    const artifacts = list(value);
    expect(artifacts.totals).toEqual({ files: 6, bytes: artifacts.totals.bytes, truncated: false });
    expect(artifacts.runStatus).toBe("succeeded");
    expect(artifacts.expiresAt).toBe(NOW + 90 * 86_400_000);
    expect(artifacts.sources.map((source) => source.origin)).toEqual([
      { kind: "step", step: 1 },
      { kind: "step", step: 2 },
      { kind: "iteration", step: 2, iteration: 1, body: "preparar" },
      { kind: "iteration", step: 2, iteration: 2, body: "preparar" },
    ]);

    const first = artifacts.sources[0]!;
    expect(first.files.map((file) => file.path)).toEqual(["dados.csv", "nao-declarado.txt", "resumo.md"]);
    expect(first.files.map((file) => file.verified)).toEqual([true, false, false]);
    expect(first.files[0]).toMatchObject({ contentType: "text/csv; charset=utf-8", preview: "csv", name: "dados.csv" });
    expect(first.files[2]).toMatchObject({ contentType: "text/markdown; charset=utf-8", preview: "markdown" });
    expect(first.status).toBe("succeeded");
    expect(first.name).toBe("Coletar");

    expect(artifacts.sources[2]).toMatchObject({
      name: "Do While · volta 1 · Preparar",
      stepId: "laco",
      status: "succeeded",
    });
    expect(artifacts.sources[2]!.files[0]).toMatchObject({ path: "result.json", verified: true, preview: "json" });
  });

  it("classifies by extension only, and never renders HTML or SVG inline", () => {
    expect(workflowArtifactKind("dados.CSV")).toMatchObject({ contentType: "text/csv; charset=utf-8", preview: "csv", attachment: false });
    expect(workflowArtifactKind("pagina.html")).toMatchObject({ contentType: "text/plain; charset=utf-8", preview: "text", attachment: true });
    expect(workflowArtifactKind("icone.svg")).toMatchObject({ contentType: "text/plain; charset=utf-8", preview: "text", attachment: true });
    expect(workflowArtifactKind("foto.avif")).toMatchObject({ contentType: "image/avif", preview: "image", attachment: false });
    expect(workflowArtifactKind("sem-extensao")).toMatchObject({ contentType: "application/octet-stream", preview: "none", attachment: true });
    expect(workflowArtifactKind(".env")).toMatchObject({ contentType: "application/octet-stream", preview: "none", attachment: true });
  });

  it("keeps Unicode and space names literal on disk and NFC in the list", () => {
    const value = run();
    const runDir = join(root, value.id);
    const decomposed = "relato\u0301rio final.pdf";
    write(join(stepOutputDir(runDir, 1), decomposed), "pdf");
    const [file] = list(value).sources[0]!.files;
    expect(file!.path).toBe(decomposed);
    expect(file!.name).toBe("relatório final.pdf");
    expect(file!.contentType).toBe("application/pdf");
    expect(file!.preview).toBe("pdf");
  });

  it("drops a file whose path is longer than 200 characters and marks the list truncated", () => {
    const value = run();
    const runDir = join(root, value.id);
    const long = `${"a".repeat(197)}.txt`;
    write(join(stepOutputDir(runDir, 1), long), "long");
    write(join(stepOutputDir(runDir, 1), `${"b".repeat(196)}.txt`), "ok");
    const source = list(value).sources[0]!;
    expect(source.files).toHaveLength(1);
    expect(list(value).totals.truncated).toBe(true);
  });

  it("stops at 2.000 files per origin and marks the list truncated", () => {
    const value = run();
    const dir = stepOutputDir(join(root, value.id), 1);
    mkdirSync(dir, { recursive: true });
    for (let index = 0; index < WORKFLOW_ARTIFACT_FILES_PER_ORIGIN + 1; index += 1) {
      writeFileSync(join(dir, `f-${String(index).padStart(4, "0")}.txt`), "x");
    }
    const artifacts = list(value);
    expect(artifacts.sources[0]!.files).toHaveLength(WORKFLOW_ARTIFACT_FILES_PER_ORIGIN);
    expect(artifacts.totals.files).toBe(WORKFLOW_ARTIFACT_FILES_PER_ORIGIN);
    expect(artifacts.totals.truncated).toBe(true);
  });

  it("does not list a round the run.json never recorded", () => {
    const value = run();
    const runDir = join(root, value.id);
    write(join(iterationStepOutputDir(runDir, 1, "preparar"), "result.json"), "{}");
    write(join(iterationStepOutputDir(runDir, 2, "preparar"), "result.json"), "{}");
    write(join(iterationStepOutputDir(runDir, 3, "preparar"), "result.json"), "{}");
    const artifacts = list(value);
    expect(artifacts.sources.filter((source) => source.origin.kind === "iteration")).toHaveLength(2);
  });

  it("moves expiresAt with the Workflow's retention", () => {
    expect(list(run(), { retentionDays: 1 }).expiresAt).toBe(NOW + 86_400_000);
    expect(list(run(), { retentionDays: 7 }).expiresAt).toBe(NOW + 7 * 86_400_000);
    expect(list(run(), { retentionDays: undefined }).expiresAt).toBeUndefined();
  });
});

describe("openWorkflowArtifact", () => {
  it("opens a plain file under output/", () => {
    const value = run();
    const runDir = join(root, value.id);
    write(join(stepOutputDir(runDir, 1), "dados.csv"), "a,b\n");
    const opened = openWorkflowArtifact({ run: value, runDir, origin: { kind: "step", step: 1 }, path: "dados.csv" });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.size).toBe(4);
    expect(opened.file.endsWith(join("step-1", "output", "dados.csv"))).toBe(true);
  });

  it("refuses a symbolic link, a traversal and an origin the run does not hold", () => {
    const value = run();
    const runDir = join(root, value.id);
    write(join(stepOutputDir(runDir, 1), "ok.txt"), "ok");
    symlinkSync("/etc/passwd", join(stepOutputDir(runDir, 1), "link.txt"));
    expect(openWorkflowArtifact({ run: value, runDir, origin: { kind: "step", step: 1 }, path: "link.txt" })).toEqual({ ok: false, reason: "link" });
    for (const path of ["../input/params.json", "../../run.json", "/etc/passwd", "a\\b"]) {
      expect(openWorkflowArtifact({ run: value, runDir, origin: { kind: "step", step: 1 }, path }), path)
        .toEqual({ ok: false, reason: "path" });
    }
    expect(openWorkflowArtifact({ run: value, runDir, origin: { kind: "step", step: 3 }, path: "ok.txt" })).toEqual({ ok: false, reason: "origin" });
    expect(openWorkflowArtifact({ run: value, runDir, origin: { kind: "iteration", step: 2, iteration: 9, body: "preparar" }, path: "result.json" })).toEqual({ ok: false, reason: "origin" });
  });

  it("refuses a folder inside output/ that links outside the run", () => {
    const value = run();
    const runDir = join(root, value.id);
    mkdirSync(join(root, "outside"), { recursive: true });
    write(join(root, "outside", "segredo.txt"), "segredo");
    mkdirSync(stepOutputDir(runDir, 1), { recursive: true });
    symlinkSync(join(root, "outside"), join(stepOutputDir(runDir, 1), "sub"));
    expect(list(value).sources).toEqual([]);
    expect(openWorkflowArtifact({ run: value, runDir, origin: { kind: "step", step: 1 }, path: "sub/segredo.txt" }))
      .toEqual({ ok: false, reason: "outside" });
  });
});
