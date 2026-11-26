import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Check, ChevronLeft, ChevronRight, Download, FolderOpen } from "lucide-react";

import {
  WORKFLOW_ARTIFACT_PREVIEW_MAX_BYTES,
  WORKFLOW_ARTIFACT_TEXT_PREVIEW_BYTES,
  type WorkflowArtifact,
  type WorkflowArtifactList,
  type WorkflowArtifactPreview,
  type WorkflowArtifactSource,
  type WorkflowDefinition,
  type WorkflowRun,
} from "../../../shared/workflow";
import type { PreviewFormat } from "@/lib/file-preview";
import { isActiveStatus } from "@/lib/workflow-format";
import { t } from "@/lib/i18n";
import { listenLiveFrames } from "@/lib/live-events";
import { artifactKey, artifactTypeLabel, formatArtifactBytes } from "@/lib/workflow-artifacts";
import { listRunArtifacts, runArtifactUrl, runArtifactsZipUrl } from "@/lib/workflows-api";
import { FilePreviewDialog, PreviewLoadError } from "../FilePreviewDialog";

const message = (error: unknown): string => error instanceof Error ? error.message : String(error);

const FILES_PER_PAGE = 5;
const BINARY_PREVIEWS = new Set<WorkflowArtifactPreview>(["image", "pdf", "audio", "video"]);
const PREVIEW_FORMAT: Record<WorkflowArtifactPreview, PreviewFormat | undefined> = {
  text: "text",
  markdown: "md",
  json: "json",
  csv: "csv",
  image: "image",
  pdf: "pdf",
  audio: "audio",
  video: "video",
  none: undefined,
};

function Skeleton() {
  return (
    <div className="space-y-2 px-4 py-3" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex items-center gap-3">
          <span className="h-4 w-10 animate-pulse rounded bg-raised" />
          <span className="h-3 flex-1 animate-pulse rounded bg-raised/70" />
          <span className="h-3 w-12 animate-pulse rounded bg-raised/70" />
        </div>
      ))}
    </div>
  );
}

export function ArtifactsPanel({ run, workflow }: { run: WorkflowRun; workflow?: WorkflowDefinition }) {
  const [list, setList] = useState<WorkflowArtifactList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [open, setOpen] = useState<WorkflowArtifact | null>(null);
  const [pages, setPages] = useState<Record<string, number>>({});
  const [preparing, setPreparing] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());
  const returnFocus = useRef<string | null>(null);
  const active = isActiveStatus(run.status);

  const refresh = useCallback((resetPages = false) => {
    if (resetPages) setPages({});
    setReload((value) => value + 1);
  }, []);

  useEffect(() => {
    setOpen(null);
    setZipError(null);
    setPages({});
    setList(null);
  }, [run.id]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    listRunArtifacts(run.id)
      .then((answer) => {
        if (!alive) return;
        setList(answer);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (alive) setError(message(cause));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [run.id, reload]);

  useEffect(() => {
    if (!active) return;
    return listenLiveFrames({
      onFrame: (frame) => {
        if (frame.kind === "workflow.run" && frame.run.id === run.id) refresh();
      },
    });
  }, [active, refresh, run.id]);

  useEffect(() => {
    if (open !== null) return;
    const key = returnFocus.current;
    if (!key) return;
    returnFocus.current = null;
    rows.current.get(key)?.focus();
  }, [open]);

  const stepName = (step: number): string =>
    workflow?.steps[step - 1]?.name ?? run.snapshot?.steps[step - 1]?.name ?? t("workflows.run.stepNumber", { number: step });
  const bodyName = (step: number, bodyId: string): string => {
    const loop = workflow?.steps[step - 1];
    const fromDefinition = loop?.kind === "loop" ? loop.body.find((candidate) => candidate.id === bodyId)?.name : undefined;
    return fromDefinition ?? run.snapshot?.steps[step - 1]?.body?.find((candidate) => candidate.id === bodyId)?.name ?? bodyId;
  };
  const sourceLabel = (source: WorkflowArtifactSource): string => source.origin.kind === "step"
    ? t("workflows.artifacts.sourceStep", { number: source.origin.step, name: stepName(source.origin.step) })
    : t("workflows.artifacts.sourceIteration", { index: source.origin.iteration, name: bodyName(source.origin.step, source.origin.body) });

  const openArtifact = (artifact: WorkflowArtifact): void => {
    returnFocus.current = artifactKey(artifact.origin, artifact.path);
    setOpen(artifact);
  };

  const closePreview = useCallback(() => setOpen(null), []);

  const loadArtifact = useCallback(async (artifact: WorkflowArtifact) => {
    if (BINARY_PREVIEWS.has(artifact.preview) && artifact.bytes > WORKFLOW_ARTIFACT_PREVIEW_MAX_BYTES) {
      throw new PreviewLoadError("tooLarge");
    }
    const response = await fetch(runArtifactUrl(run.id, artifact));
    if (response.status === 404) {
      refresh();
      throw new PreviewLoadError("removed");
    }
    if (!response.ok) throw new PreviewLoadError("failed");
    return {
      blob: await response.blob(),
      truncatedAt: response.headers.get("x-artifact-truncated") === "1" ? WORKFLOW_ARTIFACT_TEXT_PREVIEW_BYTES : undefined,
    };
  }, [refresh, run.id]);

  const onRowKeyDown = (event: ReactKeyboardEvent<HTMLLIElement>, artifact: WorkflowArtifact): void => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter") {
      event.preventDefault();
      openArtifact(artifact);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const found = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLLIElement>("[data-artifact-row]") ?? []);
    const index = found.indexOf(event.currentTarget);
    found[Math.min(found.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)))]?.focus();
  };

  const downloadZip = async (): Promise<void> => {
    setPreparing(true);
    setZipError(null);
    try {
      const response = await fetch(runArtifactsZipUrl(run.id));
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string; limit?: number };
        setZipError(response.status === 413
          ? t("workflows.artifacts.zipTooLarge", { limit: formatArtifactBytes(body.limit ?? 0) })
          : body.error ?? t("workflows.artifacts.zipError"));
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `run-${run.id}.zip`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (cause) {
      setZipError(cause instanceof Error ? cause.message : t("workflows.artifacts.zipError"));
    } finally {
      setPreparing(false);
    }
  };

  const total = list?.totals.files ?? 0;

  return (
    <section className="mt-8 overflow-hidden rounded-[10px] border border-hairline" aria-labelledby={`run-artifacts-${run.id}`}>
      <header className="flex flex-wrap items-center gap-2.5 bg-raised/25 px-4 py-3">
        <FolderOpen size={14} aria-hidden="true" className="text-ink-secondary" />
        <h2 id={`run-artifacts-${run.id}`} className="text-[11px] font-semibold text-ink">{t("workflows.artifacts.title")}</h2>
        {list && total > 0 && (
          <span className="text-[10.5px] text-ink-tertiary">
            {total === 1 ? t("workflows.artifacts.summaryOne") : t("workflows.artifacts.summaryOther", { count: total })}
            {" · "}
            {formatArtifactBytes(list.totals.bytes)}
          </span>
        )}
        {active && (
          <span className="rounded-md border border-[#D4E3FF] bg-[#EDF3FF] px-1.5 py-0.5 text-[9.5px] text-[#5B84D2]">{t("workflows.artifacts.live")}</span>
        )}
        <button
          type="button"
          onClick={() => void downloadZip()}
          disabled={preparing || total === 0}
          aria-busy={preparing}
          className="ms-auto flex h-8 items-center gap-1.5 rounded-[8px] border border-hairline bg-white/70 px-2.5 text-[10.5px] font-medium text-ink-secondary hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download size={12} aria-hidden="true" />
          {preparing ? t("workflows.artifacts.preparing") : t("workflows.artifacts.downloadAll")}
        </button>
      </header>

      {error && (
        <div role="alert" className="mx-4 my-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[11px] text-danger">
          <p>{t("workflows.artifacts.error")}</p>
          <p className="mt-0.5 text-[10.5px]">{error}</p>
          <button type="button" onClick={() => refresh(true)} className="mt-1.5 rounded-md border border-hairline bg-white px-2 py-0.5 text-[10.5px] font-medium text-ink-secondary hover:bg-raised">
            {t("workflows.artifacts.retry")}
          </button>
        </div>
      )}

      {loading && !list && <Skeleton />}

      {list && total === 0 && !loading && (
        <div className="px-4 py-5">
          <p className="text-[11.5px] font-medium text-ink">{t("workflows.artifacts.empty")}</p>
          <p className="mt-1 max-w-[62ch] text-[10.5px] leading-relaxed text-ink-secondary">{t("workflows.artifacts.emptyHint")}</p>
        </div>
      )}

      {list && total > 0 && (
        <div className="px-4 pb-3 pt-1">
          {list.sources.map((source) => {
            const sourceKey = artifactKey(source.origin, "");
            const pageCount = Math.max(1, Math.ceil(source.files.length / FILES_PER_PAGE));
            const page = Math.min(pages[sourceKey] ?? 0, pageCount - 1);
            const start = page * FILES_PER_PAGE;
            const visible = source.files.slice(start, start + FILES_PER_PAGE);
            return (
              <div key={sourceKey} className="pt-3">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-[10px] font-medium text-ink-tertiary">{sourceLabel(source)}</span>
                  {pageCount > 1 && (
                    <span className="ms-auto flex items-center gap-1.5">
                      <button
                        type="button"
                        aria-label={t("workflows.artifacts.previousPage")}
                        title={t("workflows.artifacts.previousPage")}
                        disabled={page === 0}
                        onClick={() => setPages((current) => ({ ...current, [sourceKey]: Math.max(0, page - 1) }))}
                        className="grid size-6 place-items-center rounded-md border border-hairline text-ink-secondary hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronLeft size={12} aria-hidden="true" />
                      </button>
                      <span aria-live="polite" className="min-w-[62px] text-center text-[10px] tabular-nums text-ink-tertiary">
                        {t("workflows.artifacts.pageRange", { from: start + 1, to: start + visible.length, count: source.files.length })}
                      </span>
                      <button
                        type="button"
                        aria-label={t("workflows.artifacts.nextPage")}
                        title={t("workflows.artifacts.nextPage")}
                        disabled={page >= pageCount - 1}
                        onClick={() => setPages((current) => ({ ...current, [sourceKey]: Math.min(pageCount - 1, page + 1) }))}
                        className="grid size-6 place-items-center rounded-md border border-hairline text-ink-secondary hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronRight size={12} aria-hidden="true" />
                      </button>
                    </span>
                  )}
                </div>
                <ul className="space-y-0.5">
                  {visible.map((artifact) => {
                    const key = artifactKey(artifact.origin, artifact.path);
                    return (
                      <li
                        key={key}
                        ref={(node) => {
                          if (node) rows.current.set(key, node);
                          else rows.current.delete(key);
                        }}
                        data-artifact-row={key}
                        tabIndex={0}
                        onClick={() => openArtifact(artifact)}
                        onKeyDown={(event) => onRowKeyDown(event, artifact)}
                        className="flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 py-1 outline-offset-[-2px] hover:bg-raised/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                      >
                        <span className="w-9 shrink-0 rounded bg-raised/70 px-1 py-0.5 text-center text-[8.5px] font-semibold uppercase tracking-wide text-ink-tertiary">{artifactTypeLabel(artifact.preview)}</span>
                        <span className="flex min-w-0 flex-1 items-center gap-1.5">
                          <span className="truncate text-[11px] text-ink" title={artifact.path}>{artifact.name}</span>
                          {artifact.verified && (
                            <span className="shrink-0 text-[#35A16E]" title={t("workflows.artifacts.verified")} aria-label={t("workflows.artifacts.verified")}>
                              <Check size={11} strokeWidth={2.6} aria-hidden="true" />
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-[10px] text-ink-tertiary">{formatArtifactBytes(artifact.bytes)}</span>
                        <button
                          type="button"
                          onClick={(event) => { event.stopPropagation(); openArtifact(artifact); }}
                          className="flex h-8 shrink-0 items-center rounded-md border border-hairline px-2 text-[10px] font-medium text-ink-secondary hover:bg-raised max-[620px]:hidden"
                        >
                          {t("workflows.artifacts.open")}
                        </button>
                        <a
                          href={runArtifactUrl(run.id, artifact, "download")}
                          download={artifact.name}
                          onClick={(event) => event.stopPropagation()}
                          className="flex h-8 shrink-0 items-center rounded-md border border-hairline px-2 text-[10px] font-medium text-accent-text hover:bg-raised"
                        >
                          {t("workflows.artifacts.download")}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
          {list.totals.truncated && <p className="mt-3 text-[10px] text-ink-tertiary">{t("workflows.artifacts.truncated")}</p>}
          <p className="mt-3 border-t border-hairline/60 pt-2 text-[10px] leading-relaxed text-ink-tertiary">{t("workflows.artifacts.verifiedHint")}</p>
          <p className="mt-1 text-[9.5px] text-ink-tertiary max-[620px]:hidden">{t("workflows.artifacts.keyboard")}</p>
        </div>
      )}

      {zipError && (
        <p role="alert" className="mx-4 mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[10.5px] text-danger">{zipError}</p>
      )}

      {open && (
        <FilePreviewDialog
          key={artifactKey(open.origin, open.path)}
          path={open.path}
          name={open.name}
          format={PREVIEW_FORMAT[open.preview]}
          load={() => loadArtifact(open)}
          downloadUrl={runArtifactUrl(run.id, open, "download")}
          downloadName={open.name}
          onClose={closePreview}
        />
      )}
    </section>
  );
}
