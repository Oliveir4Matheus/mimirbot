// @vitest-environment happy-dom
// The run's files panel: its list, keyboard, preview by type and the two downloads.
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  workflowDefinitionSchema,
  workflowRunSchema,
  type WorkflowArtifact,
  type WorkflowArtifactList,
  type WorkflowArtifactOrigin,
  type WorkflowRun,
} from "../../../shared/workflow";
import { setLocale, t } from "@/lib/i18n";
import { ArtifactsPanel } from "./ArtifactsPanel";

const RUN_ID = "20261117-094501-3f9c1a";

const definition = workflowDefinitionSchema.parse({
  id: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
  version: 1,
  name: "Resumo diário",
  department: "Financeiro",
  triggers: [{ id: "manual", kind: "manual", name: "Manual" }],
  steps: [{ id: "coletar", kind: "bot", name: "Coletar", botId: "bot-a", instructions: "Collect.", outputs: [{ path: "dados.csv" }] }],
  createdAt: 1,
  updatedAt: 1,
});

const run = (status: WorkflowRun["status"] = "succeeded"): WorkflowRun => workflowRunSchema.parse({
  id: RUN_ID,
  workflowId: definition.id,
  workflowVersion: 1,
  department: "Financeiro",
  status,
  currentStep: 1,
  createdAt: 1,
  updatedAt: 2,
  ...(status === "succeeded" ? { finishedAt: 2 } : {}),
  steps: [{ id: "coletar", status: status === "running" ? "running" : "succeeded", verified: ["dados.csv"] }],
});

const origin: WorkflowArtifactOrigin = { kind: "step", step: 1 };

const artifact = (path: string, preview: WorkflowArtifact["preview"], bytes = 128, overrides: Partial<WorkflowArtifact> = {}): WorkflowArtifact => ({
  origin,
  path,
  name: path,
  bytes,
  modifiedAt: 1,
  contentType: "text/plain; charset=utf-8",
  preview,
  verified: true,
  ...overrides,
});

const listOf = (files: WorkflowArtifact[], overrides: Partial<WorkflowArtifactList> = {}): WorkflowArtifactList => ({
  runId: RUN_ID,
  generatedAt: 1,
  expiresAt: 1_771_146_000_000,
  runStatus: "succeeded",
  sources: files.length === 0 ? [] : [{ origin: files[0]!.origin, stepId: "coletar", name: "Coletar", status: "succeeded", files, bytes: files.reduce((sum, file) => sum + file.bytes, 0) }],
  totals: { files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0), truncated: false },
  ...overrides,
});

let host: HTMLDivElement;
let root: Root;
let listAnswer: WorkflowArtifactList | (() => WorkflowArtifactList);
let previewAnswer: (url: string) => Response;
let listCalls = 0;

function response(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

beforeEach(() => {
  listCalls = 0;
  listAnswer = listOf([]);
  previewAnswer = () => response("arquivo", 200, { "content-type": "text/plain; charset=utf-8" });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/artifacts")) {
      listCalls += 1;
      return response(typeof listAnswer === "function" ? listAnswer() : listAnswer);
    }
    if (url.endsWith("/artifacts.zip")) return response({ error: "nope" }, 500);
    return previewAnswer(url);
  }));
  setLocale("en");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  flushSync(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  setLocale("en");
});

function draw(value: WorkflowRun = run(), workflow = definition): void {
  flushSync(() => root.render(<ArtifactsPanel run={value} workflow={workflow} />));
}

const rows = (): HTMLLIElement[] => [...host.querySelectorAll<HTMLLIElement>("[data-artifact-row]")];
const text = (): string => host.textContent ?? "";
const settle = async (check: () => void): Promise<void> => { await vi.waitFor(check); };

async function openFirst(): Promise<void> {
  const first = rows()[0]!;
  first.focus();
  flushSync(() => { first.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
  await settle(() => expect(host.querySelector('[role="dialog"]')).not.toBeNull());
}

describe("ArtifactsPanel states", () => {
  it("shows three ghost rows first and the empty hint after an empty answer", async () => {
    listAnswer = listOf([]);
    draw();
    expect(host.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    await settle(() => expect(text()).toContain(t("workflows.artifacts.empty")));
    expect(text()).toContain(t("workflows.artifacts.emptyHint"));
  });

  it("keeps the error visible with a retry that reloads the list", async () => {
    listAnswer = () => { throw new Error("boom"); };
    draw();
    await settle(() => expect(text()).toContain(t("workflows.artifacts.error")));
    listAnswer = listOf([artifact("dados.csv", "csv")]);
    const retry = [...host.querySelectorAll("button")].find((button) => button.textContent === t("workflows.artifacts.retry"))!;
    flushSync(() => { retry.click(); });
    await settle(() => expect(text()).toContain("dados.csv"));
    expect(text()).not.toContain(t("workflows.artifacts.error"));
    expect(listCalls).toBeGreaterThanOrEqual(2);
  });

  it("marks a running run as updating on its own", async () => {
    listAnswer = listOf([artifact("dados.csv", "csv")]);
    draw(run("running"));
    await settle(() => expect(text()).toContain(t("workflows.artifacts.live")));
  });

  it("reports a file removed between the list and the preview, and reloads the list", async () => {
    listAnswer = listOf([artifact("dados.csv", "csv")]);
    previewAnswer = () => response({ error: "no such file" }, 404);
    draw();
    await settle(() => expect(text()).toContain("dados.csv"));
    await openFirst();
    await settle(() => expect(text()).toContain(t("workflows.artifacts.removed")));
    expect(listCalls).toBeGreaterThanOrEqual(2);
  });
});

describe("ArtifactsPanel keyboard", () => {
  it("moves with the arrows, opens with Enter and closes on Escape back to its row", async () => {
    listAnswer = listOf([artifact("a.txt", "text"), artifact("b.txt", "text")]);
    draw();
    await settle(() => expect(rows()).toHaveLength(2));
    const [first, second] = rows();
    first!.focus();
    flushSync(() => { first!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); });
    expect(document.activeElement).toBe(second);
    flushSync(() => { second!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })); });
    expect(document.activeElement).toBe(first);

    await openFirst();
    expect(host.querySelector('[role="dialog"]')?.getAttribute("aria-modal")).toBe("true");
    flushSync(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    await settle(() => expect(host.querySelector('[role="dialog"]')).toBeNull());
    await settle(() => expect(document.activeElement).toBe(first));
  });
});

describe("ArtifactsPanel previews", () => {
  const cases: Array<{
    preview: WorkflowArtifact["preview"];
    path: string;
    body?: string;
    check: () => void;
  }> = [
    { preview: "text", path: "notas.txt", body: "linha um\nlinha dois", check: () => expect(host.querySelector("pre")?.textContent).toContain("linha um") },
    { preview: "markdown", path: "resumo.md", body: "# Título\n\nTexto", check: () => expect(host.querySelector("h1")?.textContent).toBe("Título") },
    { preview: "json", path: "doc.json", body: "{\"ok\":true}", check: () => expect(host.querySelector("pre")?.textContent).toContain("\"ok\": true") },
    { preview: "csv", path: "dados.csv", body: "nome,total\nana,10\n", check: () => expect(host.querySelector("th")?.textContent).toBe("nome") },
    { preview: "image", path: "grafico.png", check: () => expect(host.querySelector("img")?.getAttribute("src")).toContain("path=grafico.png") },
    { preview: "pdf", path: "relatorio.pdf", check: () => expect(host.querySelector("embed")?.getAttribute("type")).toBe("application/pdf") },
    { preview: "audio", path: "audio.mp3", check: () => expect(host.querySelector("audio")?.hasAttribute("controls")).toBe(true) },
    { preview: "video", path: "video.mp4", check: () => expect(host.querySelector("video")?.hasAttribute("controls")).toBe(true) },
  ];

  for (const testCase of cases) {
    it(`previews ${testCase.preview}`, async () => {
      listAnswer = listOf([artifact(testCase.path, testCase.preview)]);
      previewAnswer = () => response(testCase.body ?? "x", 200, { "content-type": "text/plain; charset=utf-8" });
      draw();
      await settle(() => expect(rows()).toHaveLength(1));
      await openFirst();
      if (testCase.body !== undefined) await settle(() => expect(host.querySelector("pre, h1, th")).not.toBeNull());
      testCase.check();
    });
  }

  it("refuses to fetch a binary preview above its limit", async () => {
    listAnswer = listOf([artifact("grande.png", "image", 100 * 1024 * 1024 + 1)]);
    draw();
    await settle(() => expect(rows()).toHaveLength(1));
    await openFirst();
    expect(text()).toContain(t("workflows.artifacts.tooLarge"));
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => !String(url).endsWith("/artifacts"))).toHaveLength(0);
  });

  it("shows the source when the server cut a long text preview", async () => {
    listAnswer = listOf([artifact("grande.txt", "text", 300 * 1024)]);
    previewAnswer = () => response("a".repeat(16), 200, { "content-type": "text/plain; charset=utf-8", "x-artifact-truncated": "1" });
    draw();
    await settle(() => expect(rows()).toHaveLength(1));
    await openFirst();
    await settle(() => expect(text()).toContain(t("workflows.artifacts.truncatedPreview", { size: "256 KB" })));
  });
});

describe("ArtifactsPanel downloads", () => {
  it("builds an encoded download link for a round's file", async () => {
    const iteration: WorkflowArtifactOrigin = { kind: "iteration", step: 3, iteration: 2, body: "preparar" };
    const file = artifact("resultado final.json", "json", 12, {
      origin: iteration,
      name: "resultado final.json",
      contentType: "application/json",
    });
    listAnswer = listOf([file], {
      sources: [{ origin: iteration, stepId: "laco", name: "Do While · volta 2 · Preparar", status: "succeeded", files: [file], bytes: 12 }],
    });
    draw();
    await settle(() => expect(rows()).toHaveLength(1));
    const href = host.querySelector("a[download]")?.getAttribute("href") ?? "";
    expect(href).toContain(`/api/workflows/runs/${RUN_ID}/artifact?`);
    expect(href).toContain("step=3");
    expect(href).toContain("iteration=2");
    expect(href).toContain("body=preparar");
    expect(href).toContain("path=resultado+final.json");
    expect(href).toContain("disposition=download");
    expect(text()).toContain(t("workflows.artifacts.sourceIteration", { index: 2, name: "preparar" }));
  });

  it("reports a refused zip in place", async () => {
    listAnswer = listOf([artifact("dados.csv", "csv")]);
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/artifacts")) return response(listAnswer);
      if (url.endsWith("/artifacts.zip")) return response({ error: "the zip has too many files", limit: 2_000 }, 413);
      return previewAnswer(url);
    });
    draw();
    await settle(() => expect(rows()).toHaveLength(1));
    const button = [...host.querySelectorAll("button")].find((candidate) => candidate.textContent === t("workflows.artifacts.downloadAll"))!;
    flushSync(() => { button.click(); });
    await settle(() => expect(text()).toContain(t("workflows.artifacts.zipTooLarge", { limit: "2 KB" })));
  });
});
