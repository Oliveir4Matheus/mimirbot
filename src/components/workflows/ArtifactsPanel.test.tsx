// @vitest-environment happy-dom
// The run's files panel: its pages, keyboard, the shared preview and the two downloads.
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  WORKFLOW_ARTIFACT_TEXT_PREVIEW_BYTES,
  workflowDefinitionSchema,
  workflowRunSchema,
  type WorkflowArtifact,
  type WorkflowArtifactList,
  type WorkflowArtifactOrigin,
  type WorkflowRun,
} from "../../../shared/workflow";
import { setLocale, t } from "@/lib/i18n";
import { previewFileSize } from "@/lib/file-preview";
import { parseTableFile } from "@/lib/table-data";
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

/** happy-dom has no Worker; the table preview only needs the parse it would have posted. */
class TableWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;

  postMessage({ text, delimiter }: { text: string; delimiter: "," | "\t" }): void {
    queueMicrotask(() => this.onmessage?.({ data: { table: parseTableFile(text, delimiter) } } as MessageEvent));
  }

  terminate(): void {}
}

beforeEach(() => {
  listCalls = 0;
  listAnswer = listOf([]);
  previewAnswer = () => response("arquivo", 200, { "content-type": "text/plain; charset=utf-8" });
  vi.stubGlobal("Worker", TableWorker);
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
const text = (): string => document.body.textContent ?? "";
const settle = async (check: () => void): Promise<void> => { await vi.waitFor(check); };
const dialog = (): HTMLElement | null => document.querySelector<HTMLElement>('[role="dialog"]');
const button = (label: string): HTMLButtonElement => [...document.querySelectorAll<HTMLButtonElement>("button")]
  .find((candidate) => candidate.getAttribute("aria-label") === label)!;

async function openFirst(): Promise<void> {
  const first = rows()[0]!;
  first.focus();
  flushSync(() => { first.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
  await settle(() => expect(dialog()).not.toBeNull());
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
    const retry = [...host.querySelectorAll("button")].find((candidate) => candidate.textContent === t("workflows.artifacts.retry"))!;
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
    await settle(() => expect(text()).toContain(t("preview.removed")));
    expect(listCalls).toBeGreaterThanOrEqual(2);
  });
});

describe("ArtifactsPanel pagination", () => {
  it("pages each source five files at a time and disables the ends", async () => {
    listAnswer = listOf(Array.from({ length: 12 }, (_, index) => artifact(`arquivo-${index + 1}.txt`, "text")));
    draw();
    await settle(() => expect(rows()).toHaveLength(5));
    expect(host.textContent).toContain(t("workflows.artifacts.pageRange", { from: 1, to: 5, count: 12 }));
    expect(button(t("workflows.artifacts.previousPage")).disabled).toBe(true);
    expect(button(t("workflows.artifacts.nextPage")).disabled).toBe(false);

    flushSync(() => button(t("workflows.artifacts.nextPage")).click());
    await settle(() => expect(rows()[0]?.textContent).toContain("arquivo-6"));
    expect(rows()).toHaveLength(5);
    expect(host.textContent).toContain(t("workflows.artifacts.pageRange", { from: 6, to: 10, count: 12 }));

    flushSync(() => button(t("workflows.artifacts.nextPage")).click());
    await settle(() => expect(rows()).toHaveLength(2));
    expect(rows()[0]?.textContent).toContain("arquivo-11");
    expect(host.textContent).toContain(t("workflows.artifacts.pageRange", { from: 11, to: 12, count: 12 }));
    expect(button(t("workflows.artifacts.nextPage")).disabled).toBe(true);
    expect(button(t("workflows.artifacts.previousPage")).disabled).toBe(false);

    flushSync(() => button(t("workflows.artifacts.previousPage")).click());
    await settle(() => expect(rows()[0]?.textContent).toContain("arquivo-6"));
    expect(rows()).toHaveLength(5);
  });

  it("leaves a source of five files without page controls", async () => {
    listAnswer = listOf(Array.from({ length: 5 }, (_, index) => artifact(`arquivo-${index + 1}.txt`, "text")));
    draw();
    await settle(() => expect(rows()).toHaveLength(5));
    expect(host.textContent).not.toContain(t("workflows.artifacts.pageRange", { from: 1, to: 5, count: 5 }));
    expect([...host.querySelectorAll("button")].some((candidate) => candidate.getAttribute("aria-label") === t("workflows.artifacts.nextPage"))).toBe(false);
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
    expect(dialog()?.getAttribute("aria-modal")).toBe("true");
    flushSync(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    await settle(() => expect(dialog()).toBeNull());
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
    { preview: "text", path: "notas.txt", body: "linha um\nlinha dois", check: () => expect(document.querySelector("pre")?.textContent).toContain("linha um") },
    { preview: "markdown", path: "resumo.md", body: "# Título\n\nTexto", check: () => expect(document.querySelector("h1")?.textContent).toBe("Título") },
    { preview: "json", path: "doc.json", body: "{\"ok\":true}", check: () => expect(document.querySelector("pre")?.textContent).toContain("\"ok\": true") },
    { preview: "csv", path: "dados.csv", body: "nome,total\nana,10\n", check: () => expect([...document.querySelectorAll("th")].some((cell) => cell.textContent === "nome")).toBe(true) },
    { preview: "image", path: "grafico.png", check: () => expect(document.querySelector("img")?.getAttribute("src")).toMatch(/^blob:/) },
    { preview: "pdf", path: "relatorio.pdf", check: () => expect(document.querySelector("iframe")?.getAttribute("title")).toBe(t("preview.pdf.frame", { name: "relatorio.pdf" })) },
    { preview: "audio", path: "audio.mp3", check: () => expect(document.querySelector("audio")?.hasAttribute("controls")).toBe(true) },
    { preview: "video", path: "video.mp4", check: () => expect(document.querySelector("video")?.hasAttribute("controls")).toBe(true) },
  ];

  for (const testCase of cases) {
    it(`previews ${testCase.preview}`, async () => {
      listAnswer = listOf([artifact(testCase.path, testCase.preview)]);
      previewAnswer = () => response(testCase.body ?? "x", 200, { "content-type": "text/plain; charset=utf-8" });
      draw();
      await settle(() => expect(rows()).toHaveLength(1));
      await openFirst();
      if (testCase.body !== undefined) await settle(() => expect(document.querySelector("pre, h1, th")).not.toBeNull());
      await settle(testCase.check);
    });
  }

  it("shows the unsupported state for an artifact without a preview, without fetching it", async () => {
    listAnswer = listOf([artifact("pacote.zip", "none")]);
    draw();
    await settle(() => expect(rows()).toHaveLength(1));
    await openFirst();
    await settle(() => expect(text()).toContain(t("preview.unsupported")));
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => !String(url).endsWith("/artifacts"))).toHaveLength(0);
  });

  it("opens the shared preview without the conversation-only annotation", async () => {
    listAnswer = listOf([artifact("dados.csv", "csv")]);
    previewAnswer = () => response("nome,total\nana,10\n", 200, { "content-type": "text/csv; charset=utf-8" });
    draw();
    await settle(() => expect(rows()).toHaveLength(1));
    await openFirst();
    expect(dialog()?.getAttribute("aria-label")).toBe(t("preview.aria", { name: "dados.csv" }));
    expect([...document.querySelectorAll("button")].some((candidate) => candidate.getAttribute("aria-label") === t("preview.annotate"))).toBe(false);
    flushSync(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    await settle(() => expect(dialog()).toBeNull());
  });

  it("refuses to fetch a binary preview above its limit", async () => {
    listAnswer = listOf([artifact("grande.png", "image", 100 * 1024 * 1024 + 1)]);
    draw();
    await settle(() => expect(rows()).toHaveLength(1));
    await openFirst();
    await settle(() => expect(text()).toContain(t("preview.tooLarge")));
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => !String(url).endsWith("/artifacts"))).toHaveLength(0);
  });

  it("shows the source when the server cut a long text preview", async () => {
    listAnswer = listOf([artifact("grande.txt", "text", 300 * 1024)]);
    previewAnswer = () => response("a".repeat(16), 200, { "content-type": "text/plain; charset=utf-8", "x-artifact-truncated": "1" });
    draw();
    await settle(() => expect(rows()).toHaveLength(1));
    await openFirst();
    await settle(() => expect(text()).toContain(t("preview.truncated", { size: previewFileSize(WORKFLOW_ARTIFACT_TEXT_PREVIEW_BYTES) })));
  });
});

describe("ArtifactsPanel downloads", () => {
  it("builds an encoded link for a round's file, in the row and in the preview", async () => {
    const iteration: WorkflowArtifactOrigin = { kind: "iteration", step: 3, iteration: 2, body: "preparar" };
    const file = artifact("resultado final.json", "json", 12, {
      origin: iteration,
      name: "resultado final.json",
      contentType: "application/json",
    });
    listAnswer = listOf([file], {
      sources: [{ origin: iteration, stepId: "laco", name: "Do While · volta 2 · Preparar", status: "succeeded", files: [file], bytes: 12 }],
    });
    previewAnswer = () => response("{\"ok\":true}", 200, { "content-type": "application/json" });
    draw();
    await settle(() => expect(rows()).toHaveLength(1));
    const rowHref = host.querySelector("a[download]")?.getAttribute("href") ?? "";
    expect(rowHref).toContain(`/api/workflows/runs/${RUN_ID}/artifact?`);
    expect(rowHref).toContain("step=3");
    expect(rowHref).toContain("iteration=2");
    expect(rowHref).toContain("body=preparar");
    expect(rowHref).toContain("path=resultado+final.json");
    expect(rowHref).toContain("disposition=download");
    expect(text()).toContain(t("workflows.artifacts.sourceIteration", { index: 2, name: "preparar" }));

    await openFirst();
    const href = dialog()?.querySelector("a[download]")?.getAttribute("href") ?? "";
    expect(href).toBe(rowHref);
    expect(dialog()?.querySelector("a[download]")?.getAttribute("download")).toBe("resultado final.json");
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
    const downloadAll = [...host.querySelectorAll("button")].find((candidate) => candidate.textContent === t("workflows.artifacts.downloadAll"))!;
    flushSync(() => { downloadAll.click(); });
    await settle(() => expect(text()).toContain(t("workflows.artifacts.zipTooLarge", { limit: "2 KB" })));
  });
});
