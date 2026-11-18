import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Papa from "papaparse";
import { Download, X } from "lucide-react";

import { WORKFLOW_ARTIFACT_PREVIEW_MAX_BYTES, type WorkflowArtifact } from "../../../shared/workflow";
import { t } from "@/lib/i18n";
import { artifactTypeLabel } from "@/lib/workflow-artifacts";
import { runArtifactUrl } from "@/lib/workflows-api";

const TEXTUAL = new Set(["text", "markdown", "json", "csv"]);
const BINARY = new Set(["image", "pdf", "audio", "video"]);
const JSON_LINES = 500;
const CSV_ROWS = 200;

type Body =
  | { status: "loading" }
  | { status: "ready"; text: string; truncated: boolean }
  | { status: "removed" }
  | { status: "error"; message: string };

const message = (error: unknown): string => error instanceof Error ? error.message : String(error);

interface CsvTable {
  headers: string[];
  rows: string[][];
  truncated: boolean;
}

function parseCsv(text: string): CsvTable {
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), { skipEmptyLines: true, preview: CSV_ROWS + 2 });
  const [headers = [], ...rows] = parsed.data;
  return { headers, rows: rows.slice(0, CSV_ROWS), truncated: rows.length > CSV_ROWS || parsed.meta.truncated === true };
}

function PreviewBody({ artifact, runId, body, onRetry, onPdfFocus }: {
  artifact: WorkflowArtifact;
  runId: string;
  body: Body;
  onRetry: () => void;
  onPdfFocus: () => void;
}) {
  const url = runArtifactUrl(runId, artifact);
  const embedRef = useRef<HTMLEmbedElement | null>(null);
  const tooLarge = BINARY.has(artifact.preview) && artifact.bytes > WORKFLOW_ARTIFACT_PREVIEW_MAX_BYTES;

  useEffect(() => {
    if (artifact.preview !== "pdf") return;
    // Chromium's PDF viewer focuses the <embed> without a pointer event; keep the
    // dialog's close button focused so Escape reaches the page.
    const guard = (): void => {
      if (document.activeElement === embedRef.current) onPdfFocus();
    };
    document.addEventListener("focusin", guard);
    const timer = window.setTimeout(guard, 500);
    const interval = window.setInterval(guard, 1000);
    return () => {
      document.removeEventListener("focusin", guard);
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [artifact.preview, onPdfFocus]);

  if (tooLarge) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-[12px] font-medium text-ink">{t("workflows.artifacts.tooLarge")}</p>
        <p className="text-[11px] text-ink-secondary">{t("workflows.artifacts.tooLargeHint")}</p>
      </div>
    );
  }

  if (artifact.preview === "image") {
    return (
      <div className="flex flex-1 items-center justify-center overflow-auto bg-inset/40 p-4">
        <img src={url} alt={artifact.name} className="max-h-full max-w-full object-contain" />
      </div>
    );
  }
  if (artifact.preview === "pdf") {
    return (
      <div className="relative flex min-h-[60vh] flex-1 items-center justify-center bg-inset/40">
        <embed ref={embedRef} src={url} type="application/pdf" title={artifact.name} tabIndex={-1} className="pointer-events-none h-full min-h-[60vh] w-full" />
        <a href={url} target="_blank" rel="noreferrer" className="absolute bottom-3 rounded-md border border-hairline bg-white px-2.5 py-1 text-[10.5px] font-medium text-accent-text shadow-sm hover:bg-raised">
          {t("workflows.artifacts.openNewTab")}
        </a>
      </div>
    );
  }
  if (artifact.preview === "audio") {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <audio src={url} controls className="w-full max-w-[420px]" />
      </div>
    );
  }
  if (artifact.preview === "video") {
    return (
      <div className="flex flex-1 items-center justify-center overflow-auto bg-black/80 p-2">
        <video src={url} controls className="max-h-full max-w-full" />
      </div>
    );
  }
  if (artifact.preview === "none") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-[12px] font-medium text-ink">{t("workflows.artifacts.noPreview")}</p>
        <p className="text-[11px] text-ink-secondary">{t("workflows.artifacts.noPreviewHint")}</p>
      </div>
    );
  }

  if (body.status === "loading") {
    return <p className="p-4 text-[11.5px] text-ink-secondary">{t("workflows.artifacts.loadingPreview")}</p>;
  }
  if (body.status === "removed") {
    return <p role="alert" className="m-4 rounded-lg border border-[#F2E4C6] bg-[#FFFAF0] px-3 py-2 text-[11.5px] text-[#7A6633]">{t("workflows.artifacts.removed")}</p>;
  }
  if (body.status === "error") {
    return (
      <div role="alert" className="m-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[11.5px] text-danger">
        <p>{t("workflows.artifacts.previewError")}</p>
        <p className="mt-0.5 break-words text-[10.5px]">{body.message}</p>
        <button type="button" onClick={onRetry} className="mt-1.5 rounded-md border border-hairline bg-white px-2 py-0.5 text-[10.5px] font-medium text-ink-secondary hover:bg-raised">{t("workflows.artifacts.retry")}</button>
      </div>
    );
  }

  const truncated = body.truncated ? (
    <p className="border-t border-hairline px-4 py-2 text-[10px] text-ink-tertiary">{t("workflows.artifacts.truncatedPreview", { size: "256 KB" })}</p>
  ) : null;

  if (artifact.preview === "markdown") {
    return (
      <>
        <div className="chat-md min-w-0 flex-1 overflow-auto p-4 [&_h1]:text-[17px] [&_h1]:font-semibold [&_h2]:text-[15px] [&_h2]:font-semibold [&_h3]:text-[13.5px] [&_h3]:font-semibold [&_p]:my-1.5 [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:bg-inset [&_pre]:p-3 [&_ul]:list-disc [&_ul]:ps-5">
          <Markdown remarkPlugins={[remarkGfm]} components={{
            a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="text-accent-text underline">{children}</a>,
            img: ({ src, alt }) => <img src={src} alt={alt ?? ""} className="max-w-full rounded" />,
          }}>{body.text}</Markdown>
        </div>
        {truncated}
      </>
    );
  }

  if (artifact.preview === "json") {
    let pretty = body.text;
    try {
      pretty = JSON.stringify(JSON.parse(body.text), null, 2);
    } catch {
      // Not valid JSON: show the bytes as they came.
    }
    const lines = pretty.split("\n");
    return (
      <>
        <pre className="flex-1 overflow-auto p-4 font-mono text-[11px] leading-relaxed text-ink">{lines.slice(0, JSON_LINES).join("\n")}</pre>
        {lines.length > JSON_LINES
          ? <p className="border-t border-hairline px-4 py-2 text-[10px] text-ink-tertiary">{t("workflows.artifacts.jsonFirst", { count: JSON_LINES })}</p>
          : truncated}
      </>
    );
  }

  if (artifact.preview === "csv") {
    const table = parseCsv(body.text);
    return (
      <>
        <div className="flex-1 overflow-auto p-2">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr>{table.headers.map((header, index) => <th key={index} className="sticky top-0 border-b border-hairline bg-raised/80 px-2 py-1.5 text-left font-semibold text-ink">{header}</th>)}</tr>
            </thead>
            <tbody>
              {table.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className={rowIndex % 2 === 1 ? "bg-raised/25" : undefined}>
                  {table.headers.map((_, cellIndex) => <td key={cellIndex} className="border-b border-hairline/40 px-2 py-1 text-ink-secondary">{row[cellIndex] ?? ""}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(table.truncated || body.truncated) && (
          <p className="border-t border-hairline px-4 py-2 text-[10px] text-ink-tertiary">{t("workflows.artifacts.csvFirst", { count: CSV_ROWS })}</p>
        )}
      </>
    );
  }

  return (
    <>
      <pre className="flex-1 overflow-auto p-4 font-mono text-[11px] leading-relaxed text-ink">{body.text}</pre>
      {truncated}
    </>
  );
}

export function ArtifactPreview({ runId, artifact, onClose, onRemoved }: {
  runId: string;
  artifact: WorkflowArtifact;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const [body, setBody] = useState<Body>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const titleId = `artifact-preview-${artifact.origin.step}-${artifact.path.replace(/[^\w-]/g, "-")}`;

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!TEXTUAL.has(artifact.preview)) return;
    let alive = true;
    setBody({ status: "loading" });
    fetch(runArtifactUrl(runId, artifact))
      .then(async (response) => {
        if (response.status === 404) {
          if (!alive) return;
          setBody({ status: "removed" });
          onRemoved();
          return;
        }
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        const text = await response.text();
        if (alive) setBody({ status: "ready", text, truncated: response.headers.get("x-artifact-truncated") === "1" });
      })
      .catch((error: unknown) => {
        if (alive) setBody({ status: "error", message: message(error) });
      });
    return () => { alive = false; };
  }, [runId, artifact, attempt, onRemoved]);

  const download = runArtifactUrl(runId, artifact, "download");

  return (
    <div
      className="fixed inset-0 z-50 flex bg-black/40"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="ms-auto flex h-full w-full flex-col border-hairline bg-app shadow-2xl min-[1101px]:my-0 min-[1101px]:w-[min(760px,72vw)] min-[1101px]:border-l"
      >
        <header className="flex shrink-0 items-center gap-2.5 border-b border-hairline/60 px-4 py-3">
          <span className="rounded bg-raised px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-tertiary">{artifactTypeLabel(artifact.preview)}</span>
          <h2 id={titleId} className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink" title={artifact.path}>{artifact.name}</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={t("workflows.artifacts.close")} className="grid size-8 place-items-center rounded-md text-ink-tertiary hover:bg-raised hover:text-ink">
            <X size={15} aria-hidden="true" />
          </button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col">
          <PreviewBody artifact={artifact} runId={runId} body={body} onRetry={() => setAttempt((value) => value + 1)} onPdfFocus={() => closeRef.current?.focus()} />
        </div>
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-hairline/60 px-4 py-3">
          <a
            href={download}
            download={artifact.name}
            className="flex h-8 items-center gap-1.5 rounded-[8px] bg-[#2F7DE1] px-3 text-[11px] font-semibold text-white hover:bg-[#2A6FC9]"
          >
            <Download size={12} aria-hidden="true" />
            {t("workflows.artifacts.download")}
          </a>
          <span className="text-[10px] text-ink-tertiary">{artifact.path}</span>
        </footer>
      </div>
    </div>
  );
}
