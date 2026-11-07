import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  FileVideo,
  LoaderCircle,
  Maximize2,
  Minus,
  PanelRight,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Table2,
  X,
} from "lucide-react";

import {
  annotationPrompt,
  countPdfPages,
  isTextPreviewFormat,
  previewFileExtension,
  previewFileSize,
  previewFormat,
  previewFormatLabel,
  textPreviewLimit,
  type PreviewFormat,
} from "@/lib/file-preview";
import { composeMessage, imageAttachmentFromFile } from "@/lib/composer-attachments";
import { copyText } from "@/lib/copy-text";
import { t } from "@/lib/i18n";
import { capturePreviewRegion, isUsableSelection, normalizeSelection, type SelectionRect } from "@/lib/preview-capture";
import { tableDelimiter, type TextTable } from "@/lib/table-data";
import { parseTableInWorker, parseWorkbookInWorker } from "@/lib/preview-workers";
import type { XlsxWorkbook } from "@/lib/xlsx";
import { useStore } from "@/state/store";
import { canonicalDownloadFilename, requestMessageFile, type MessageAttachmentContext } from "./AttachmentPreview";
import { PreviewTable } from "./PreviewTable";

export type PreviewPosition = "center" | "right";

const FORMAT_STYLE: Record<PreviewFormat, { background: string; color: string; border: string; icon: typeof FileText }> = {
  md: { background: "#2B2935", color: "#C2A1FF", border: "#3B344A", icon: FileText },
  html: { background: "#302923", color: "#E7A473", border: "#44352D", icon: Code2 },
  csv: { background: "#1D302A", color: "#83CBA8", border: "#30473E", icon: Table2 },
  tsv: { background: "#1D302A", color: "#83CBA8", border: "#30473E", icon: Table2 },
  xlsx: { background: "#193329", color: "#70C59A", border: "#284636", icon: FileSpreadsheet },
  mp4: { background: "#222D3A", color: "#96BFF0", border: "#2E3B4E", icon: FileVideo },
  pdf: { background: "#372825", color: "#F39C91", border: "#563934", icon: FileText },
};

interface LoadedPreview {
  blob: Blob;
  text: string | null;
  table: TextTable | null;
  workbook: XlsxWorkbook | null;
  mediaUrl: string | null;
  pdfPages: number;
}

interface AnnotationDraft {
  comment: string;
  blob: Blob;
  url: string;
}

function PreviewIcon({ format }: { format: PreviewFormat }) {
  const style = FORMAT_STYLE[format];
  const Icon = style.icon;
  return (
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center rounded-[8px] border"
      style={{ background: style.background, borderColor: style.border, color: style.color }}
    >
      <Icon size={18} />
    </span>
  );
}

function ViewTabs({ value, onChange, labels }: { value: string; onChange: (value: string) => void; labels: Array<{ value: string; label: string }> }) {
  return (
    <div className="flex items-center gap-1 rounded-[8px] border border-hairline bg-card p-[2px]">
      {labels.map((item) => (
        <button
          key={item.value}
          type="button"
          aria-pressed={value === item.value}
          onClick={() => onChange(item.value)}
          className={`rounded-[6px] px-2 py-[3px] text-[11px] transition-colors ${
            value === item.value ? "bg-raised text-ink" : "text-ink-secondary hover:text-ink"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function MarkdownBody({ text }: { text: string }) {
  return (
    <article className="mx-auto w-full max-w-[750px] px-[clamp(19px,4vw,55px)] pt-[31px] pb-[70px] text-[13px] leading-[1.86] text-ink">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="mb-4 text-[26px] font-semibold leading-tight text-ink">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-3 mt-6 border-b border-hairline pb-2 text-[18px] font-semibold text-ink">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-2 mt-5 text-[14px] font-semibold text-ink">{children}</h3>,
          p: ({ children }) => <p className="mb-3">{children}</p>,
          ul: ({ children }) => <ul className="mb-3 list-disc ps-6">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 list-decimal ps-6">{children}</ol>,
          li: ({ children }) => <li className="mb-1">{children}</li>,
          blockquote: ({ children }) => <blockquote className="mb-3 border-s-2 border-accent ps-3 text-ink-secondary">{children}</blockquote>,
          pre: ({ children }) => <pre className="mb-3 overflow-x-auto rounded-[10px] border border-hairline bg-inset p-[15px_17px] text-[12px] leading-[1.7]">{children}</pre>,
          code: ({ children, className }) => className
            ? <code className={className}>{children}</code>
            : <code className="rounded bg-raised px-1 py-0.5 text-[12px] text-accent">{children}</code>,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="text-accent underline decoration-accent/40 hover:decoration-accent">{children}</a>,
          table: ({ children }) => <div className="mb-3 overflow-x-auto"><table className="w-full border-collapse text-[12px]">{children}</table></div>,
          th: ({ children }) => <th className="border border-hairline bg-card px-2 py-1.5 text-start font-medium">{children}</th>,
          td: ({ children }) => <td className="border border-hairline px-2 py-1.5">{children}</td>,
        }}
      >
        {text}
      </Markdown>
    </article>
  );
}

function SourceBody({ text }: { text: string }) {
  return (
    <pre className="h-full overflow-auto whitespace-pre-wrap break-words px-[clamp(17px,3vw,50px)] py-[29px] font-mono text-[12px] leading-[1.8] text-ink">
      {text}
    </pre>
  );
}

function HtmlBody({ text, name }: { text: string; name: string }) {
  const source = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; media-src data:"><base target="_blank">${text}`;
  return (
    <iframe
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={source}
      title={t("preview.html.frame", { name })}
      className="h-full w-full border-0 bg-white"
    />
  );
}

export function FilePreviewDialog({
  path,
  name,
  message,
  position,
  onPositionChange,
  onClose,
  returnFocus,
}: {
  path: string;
  name: string;
  message: MessageAttachmentContext;
  position: PreviewPosition;
  onPositionChange: (position: PreviewPosition) => void;
  onClose: () => void;
  returnFocus?: HTMLElement | null;
}) {
  const format = previewFormat(name) ?? previewFormat(path);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<LoadedPreview | null>(null);
  const [view, setView] = useState<"reading" | "source" | "preview">(format === "md" ? "reading" : "preview");
  const [query, setQuery] = useState("");
  const [sheetIndex, setSheetIndex] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [annotating, setAnnotating] = useState(false);
  const [selection, setSelection] = useState<SelectionRect | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [annotationHint, setAnnotationHint] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [comment, setComment] = useState("");
  const [draft, setDraft] = useState<AnnotationDraft | null>(null);
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const dialogRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const { state, dispatch } = useStore();

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setLoaded(null);
    setQuery("");
    setSheetIndex(0);
    setPage(1);
    setZoom(100);
    void (async () => {
      try {
        const response = await requestMessageFile(path, message, controller.signal);
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        let text: string | null = null;
        let table: TextTable | null = null;
        let workbook: XlsxWorkbook | null = null;
        let mediaUrl: string | null = null;
        let pdfPages = 1;
        if (format && isTextPreviewFormat(format)) {
          if (blob.size > textPreviewLimit(format)) throw new Error("tooLarge");
          text = await blob.text();
          if (format === "csv" || format === "tsv") {
            table = await parseTableInWorker(text, tableDelimiter(name) ?? tableDelimiter(path) ?? ",", controller.signal);
          }
        } else if (format === "xlsx") {
          workbook = await parseWorkbookInWorker(new Uint8Array(await blob.arrayBuffer()), controller.signal);
          if (workbook.sheets.length === 0) throw new Error("noSheets");
        } else if (format === "pdf") {
          pdfPages = countPdfPages(new Uint8Array(await blob.arrayBuffer()));
          mediaUrl = URL.createObjectURL(blob);
        } else if (format === "mp4") {
          mediaUrl = URL.createObjectURL(blob);
        }
        if (controller.signal.aborted) {
          if (mediaUrl) URL.revokeObjectURL(mediaUrl);
          return;
        }
        setLoaded({ blob, text, table, workbook, mediaUrl, pdfPages });
      } catch (reason) {
        if (controller.signal.aborted) return;
        const code = reason instanceof Error ? reason.message : "";
        setError(code === "tooLarge" ? "tooLarge" : code === "noSheets" ? "noSheets" : "loadFailed");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [path, name, message.threadId, message.messageId, format, attempt]);

  useEffect(() => () => {
    if (loaded?.mediaUrl) URL.revokeObjectURL(loaded.mediaUrl);
  }, [loaded?.mediaUrl]);

  useEffect(() => () => {
    if (draft?.url) URL.revokeObjectURL(draft.url);
  }, [draft?.url]);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => {
      const target = returnFocus ?? previous;
      if (target?.isConnected) target.focus();
    };
  }, [returnFocus]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (draft) {
          if (draft.url) URL.revokeObjectURL(draft.url);
          setDraft(null);
        } else if (annotating) {
          setAnnotating(false);
          setSelection(null);
        } else {
          closeRef.current();
        }
        return;
      }
      if (event.key !== "Tab" || position !== "center") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, textarea, [tabindex]:not([tabindex="-1"])')];
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && (document.activeElement === dialog || document.activeElement === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [annotating, draft, position]);

  useEffect(() => {
    if (copyState === "idle") return;
    const timer = setTimeout(() => setCopyState("idle"), 2500);
    return () => clearTimeout(timer);
  }, [copyState]);

  const switchPosition = () => {
    onPositionChange(position === "center" ? "right" : "center");
  };

  const download = useCallback(async () => {
    try {
      const blob = loaded?.blob ?? await (await requestMessageFile(path, message, new AbortController().signal)).blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = canonicalDownloadFilename({ fallback: name, source: path });
      link.style.display = "none";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
    }
  }, [loaded?.blob, message, name, path]);

  const copy = async () => {
    if (!loaded?.text) return;
    const result = await copyText(loaded.text);
    if (result !== "empty") setCopyState(result);
  };

  const pointInContent = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = contentRef.current?.getBoundingClientRect();
    return bounds ? { x: event.clientX - bounds.left, y: event.clientY - bounds.top } : { x: 0, y: 0 };
  };

  const startSelection = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!annotating) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointInContent(event);
    setDragStart(point);
    setSelection(null);
    setAnnotationHint("");
  };

  const moveSelection = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStart) return;
    setSelection(normalizeSelection(dragStart, pointInContent(event)));
  };

  const finishSelection = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStart) return;
    const next = normalizeSelection(dragStart, pointInContent(event));
    setDragStart(null);
    if (!isUsableSelection(next)) {
      setSelection(null);
      setAnnotationHint(t("preview.annotation.tooSmall"));
      return;
    }
    setSelection(next);
  };

  const addToPrompt = async () => {
    if (!selection || !comment.trim()) {
      setAnnotationHint(t("preview.annotation.commentRequired"));
      return;
    }
    const element = contentRef.current;
    if (!element) return;
    setAnnotationHint("");
    setCapturing(true);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const blob = await capturePreviewRegion(element, selection);
    setCapturing(false);
    if (!blob) {
      setAnnotationHint(t("preview.annotation.captureFailed"));
      return;
    }
    const url = URL.createObjectURL(blob);
    setDraft({ comment: comment.trim(), blob, url });
    setPrompt(annotationPrompt(name, comment));
    setAnnotating(false);
    setSelection(null);
  };

  const discardDraft = () => {
    if (draft?.url) URL.revokeObjectURL(draft.url);
    setDraft(null);
    setPrompt("");
    setComment("");
  };

  const sendToAgent = async () => {
    if (!draft || !prompt.trim() || sending) return;
    setSendError("");
    setSending(true);
    try {
      const file = new File([draft.blob], "annotation.png", { type: "image/png" });
      const attachment = await imageAttachmentFromFile(file);
      if (!attachment) throw new Error("attachment");
      const text = composeMessage(prompt, [attachment]);
      const sendId = crypto.randomUUID();
      const group = state.groups.find((candidate) => candidate.threadId === message.threadId);
      const bot = state.bots.find((candidate) => candidate.threadId === message.threadId
        || candidate.tasks?.some((task) => task.threadId === message.threadId));
      if (group) {
        dispatch({ type: "sendGroup", groupId: group.id, text, sendId, threadId: message.threadId });
      } else if (bot) {
        dispatch({ type: "send", botId: bot.id, text, sendId, threadId: message.threadId });
      } else {
        throw new Error("noConversation");
      }
      onClose();
    } catch {
      setSendError(t("preview.annotation.sendFailed"));
    } finally {
      setSending(false);
    }
  };

  const formatStyle = format ? FORMAT_STYLE[format] : null;
  const extension = previewFileExtension(name);
  const hasFooter = format === "md" || format === "html" || format === "csv" || format === "tsv";
  const table = loaded?.table ?? null;
  const workbook = loaded?.workbook ?? null;
  const activeSheet = workbook?.sheets[Math.min(sheetIndex, Math.max(0, workbook.sheets.length - 1))] ?? null;
  const tableColumns = table?.headers ?? activeSheet?.headers ?? [];
  const tableRows = table?.rows ?? activeSheet?.rows ?? [];
  const tableLabel = format === "xlsx" ? activeSheet?.name ?? name : name;

  const content = (() => {
    if (loading) {
      return (
        <div role="status" className="flex h-full items-center justify-center gap-2 text-[13px] text-ink-secondary">
          <LoaderCircle size={17} className="animate-spin" /> {t("preview.loading")}
        </div>
      );
    }
    if (error) {
      return (
        <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-[13px] text-ink-secondary">
          <p>{t(error === "tooLarge" ? "preview.tooLarge" : error === "noSheets" ? "preview.noSheets" : "preview.loadFailed")}</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)} className="flex items-center gap-1.5 rounded-[7px] border border-hairline bg-raised px-3 py-1.5 text-ink hover:bg-raised-hover">
            <RotateCcw size={13} /> {t("preview.retry")}
          </button>
        </div>
      );
    }
    if (format === "md") {
      return view === "source" ? <SourceBody text={loaded?.text ?? ""} /> : <div className="h-full overflow-auto"><MarkdownBody text={loaded?.text ?? ""} /></div>;
    }
    if (format === "html") {
      return view === "source" ? <SourceBody text={loaded?.text ?? ""} /> : <HtmlBody text={loaded?.text ?? ""} name={name} />;
    }
    if (format === "csv" || format === "tsv") {
      return <PreviewTable columns={tableColumns} rows={tableRows} query={query} ariaLabel={tableLabel} />;
    }
    if (format === "xlsx") {
      return <PreviewTable key={activeSheet?.name ?? name} columns={tableColumns} rows={tableRows} query={query} ariaLabel={tableLabel} />;
    }
    if (format === "mp4" && loaded?.mediaUrl) {
      return <video src={loaded.mediaUrl} controls className="h-full w-full bg-[#050608] object-contain" />;
    }
    if (format === "pdf" && loaded?.mediaUrl) {
      return <iframe src={`${loaded.mediaUrl}#page=${page}&zoom=${zoom}`} title={t("preview.pdf.frame", { name })} className="h-full w-full border-0 bg-inset" />;
    }
    return <div className="flex h-full items-center justify-center text-[13px] text-ink-secondary">{t("preview.unsupported")}</div>;
  })();

  const dialog = (
    <div
      ref={dialogRef}
      role={position === "center" ? "dialog" : "complementary"}
      aria-modal={position === "center" ? true : undefined}
      aria-label={t("preview.aria", { name })}
      tabIndex={-1}
      className={`flex min-h-0 min-w-0 flex-col overflow-hidden bg-panel text-ink outline-none ${
        position === "center"
          ? "h-[min(790px,calc(100dvh-44px))] w-[min(1030px,100%)] rounded-[16px] border border-hairline px-[10px] shadow-[0_35px_120px_#000C] max-[650px]:h-[100dvh] max-[650px]:w-[100vw] max-[650px]:rounded-none max-[650px]:border-0"
          : "h-full w-full"
      }`}
    >
      <header className="flex min-h-[46px] shrink-0 flex-wrap items-center gap-[9px] border-b border-hairline bg-card px-[14px] py-1.5 max-[650px]:px-[11px]">
        {formatStyle && <PreviewIcon format={format!} />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-[630] text-ink" title={name}>{name}</div>
          <div className="text-[10px] text-ink-secondary">
            <span className="rounded-[4px] bg-raised px-1 py-[1px] text-[9px]">{extension || previewFormatLabel(format ?? "md")}</span>
            {loaded?.blob.size ? <span className="ms-1.5">{previewFileSize(loaded.blob.size)}</span> : null}
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-[5px]">
          {format === "md" && (
            <ViewTabs value={view} onChange={(value) => setView(value as "reading" | "source")} labels={[
              { value: "reading", label: t("preview.reading") },
              { value: "source", label: t("preview.source") },
            ]} />
          )}
          {format === "html" && (
            <ViewTabs value={view} onChange={(value) => setView(value as "reading" | "source")} labels={[
              { value: "preview", label: t("preview.html.preview") },
              { value: "source", label: t("preview.source") },
            ]} />
          )}
          {(format === "csv" || format === "tsv" || format === "xlsx") && (
            <>
              <span className="rounded-[7px] bg-raised px-2 py-1 text-[11px] text-ink">{t("preview.table.title")}</span>
              <label className="flex h-[30px] w-[188px] max-w-[45vw] items-center gap-1.5 rounded-[7px] border border-hairline bg-raised px-2 text-[11px] text-ink-secondary">
                <Search size={12} className="shrink-0" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label={t("preview.table.search")}
                  placeholder={t("preview.table.search")}
                  className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-tertiary"
                />
              </label>
            </>
          )}
          {format === "pdf" && (
            <div className="flex items-center gap-[2px] rounded-[8px] border border-hairline bg-raised p-[2px]">
              <button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label={t("preview.pdf.previous")} title={t("preview.pdf.previous")} className="flex size-[27px] items-center justify-center rounded-[6px] text-ink hover:bg-raised-hover disabled:opacity-35">
                <ChevronLeft size={14} />
              </button>
              <span className="min-w-[39px] text-center font-mono text-[11px] text-ink">{page} / {loaded?.pdfPages ?? 1}</span>
              <button type="button" disabled={page >= (loaded?.pdfPages ?? 1)} onClick={() => setPage((value) => Math.min(loaded?.pdfPages ?? 1, value + 1))} aria-label={t("preview.pdf.next")} title={t("preview.pdf.next")} className="flex size-[27px] items-center justify-center rounded-[6px] text-ink hover:bg-raised-hover disabled:opacity-35">
                <ChevronRight size={14} />
              </button>
              <span className="mx-1 h-4 w-px bg-hairline" />
              <button type="button" disabled={zoom <= 50} onClick={() => setZoom((value) => Math.max(50, value - 25))} aria-label={t("preview.pdf.zoomOut")} title={t("preview.pdf.zoomOut")} className="flex size-[27px] items-center justify-center rounded-[6px] text-ink hover:bg-raised-hover disabled:opacity-35">
                <Minus size={14} />
              </button>
              <span className="min-w-[39px] text-center font-mono text-[11px] text-ink">{zoom}%</span>
              <button type="button" disabled={zoom >= 200} onClick={() => setZoom((value) => Math.min(200, value + 25))} aria-label={t("preview.pdf.zoomIn")} title={t("preview.pdf.zoomIn")} className="flex size-[27px] items-center justify-center rounded-[6px] text-ink hover:bg-raised-hover disabled:opacity-35">
                <Plus size={14} />
              </button>
            </div>
          )}
          <button type="button" onClick={() => void download()} aria-label={t("preview.download")} title={t("preview.download")} className="flex h-[29px] min-w-[29px] items-center justify-center gap-1 rounded-[7px] border border-hairline bg-raised px-2 text-[11px] text-ink hover:bg-raised-hover">
            <Download size={15} />
            <span className="max-[920px]:hidden">{t("preview.download")}</span>
          </button>
          <button type="button" onClick={switchPosition} aria-label={position === "center" ? t("preview.openSide") : t("preview.center")} title={position === "center" ? t("preview.openSide") : t("preview.center")} className="flex size-[29px] items-center justify-center rounded-[7px] border border-hairline bg-raised text-ink hover:bg-raised-hover">
            {position === "center" ? <PanelRight size={15} /> : <Maximize2 size={15} />}
          </button>
          <button
            type="button"
            aria-pressed={annotating}
            onClick={() => {
              setAnnotating((value) => !value);
              setSelection(null);
              setAnnotationHint("");
            }}
            aria-label={t("preview.annotate")}
            title={t("preview.annotate")}
            className={`flex h-[29px] items-center justify-center gap-1 rounded-[7px] border px-2 text-[11px] ${
              annotating
                ? "border-accent bg-accent/15 text-accent"
                : "border-hairline bg-raised text-ink hover:bg-raised-hover"
            }`}
          >
            <Pencil size={15} />
            <span className="max-[920px]:hidden">{t("preview.annotate")}</span>
          </button>
          <button type="button" onClick={onClose} aria-label={t("preview.close")} title={t("preview.close")} className="flex size-[28px] items-center justify-center rounded-full bg-raised text-ink hover:bg-raised-hover">
            <X size={15} />
          </button>
        </div>
      </header>

      {format === "xlsx" && workbook && (
        <div className="flex h-[42px] shrink-0 items-stretch gap-1 overflow-x-auto border-b border-hairline bg-card px-2">
          {workbook.sheets.map((sheet, index) => (
            <button
              key={`${sheet.name}:${index}`}
              type="button"
              aria-pressed={index === sheetIndex}
              onClick={() => {
                if (index === sheetIndex) return;
                setSheetIndex(index);
                setQuery("");
              }}
              className={`relative shrink-0 px-3 text-[11.5px] ${index === sheetIndex ? "bg-raised text-ink" : "text-ink-secondary hover:text-ink"}`}
            >
              {index === sheetIndex && <span className="absolute inset-x-1 bottom-0 h-[2px] rounded-t bg-success" aria-hidden="true" />}
              {sheet.name}
            </button>
          ))}
        </div>
      )}

      <div ref={contentRef} className="relative min-h-0 flex-1 overflow-hidden bg-app">
        {content}
        {annotating && !capturing && (
          <div
            role="application"
            aria-label={t("preview.annotation.area")}
            className="absolute inset-0 z-20 cursor-crosshair bg-accent/[0.03]"
            onPointerDown={startSelection}
            onPointerMove={moveSelection}
            onPointerUp={finishSelection}
            onPointerCancel={() => setDragStart(null)}
          >
            <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
              <span className="rounded-full border border-accent bg-card px-3 py-1 text-[11px] text-accent">
                {t("preview.annotation.instruction")}
              </span>
            </div>
            {selection && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute border-2 border-accent bg-accent/10"
                style={{ left: selection.x, top: selection.y, width: selection.width, height: selection.height }}
              />
            )}
            {annotationHint && !selection && (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
                <span className="rounded-[7px] bg-card px-3 py-1 text-[11px] text-accent">{annotationHint}</span>
              </div>
            )}
          </div>
        )}
        {annotating && selection && !capturing && (
          <div
            className="absolute bottom-4 right-4 z-30 flex max-h-[calc(100%-32px)] w-[min(334px,calc(100%-32px))] flex-col gap-2 rounded-[12px] border border-hairline bg-card p-[13px] shadow-2xl max-[650px]:bottom-[9px] max-[650px]:right-[9px]"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="text-[12px] font-medium text-ink">{t("preview.annotation.title")}</div>
            <div className="text-[10.5px] text-ink-secondary">{t("preview.annotation.helper")}</div>
            <textarea
              autoFocus
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder={t("preview.annotation.placeholder")}
              aria-label={t("preview.annotation.title")}
              className="min-h-[67px] max-h-[140px] resize-y rounded-[8px] border border-hairline bg-inset p-2 text-[12px] text-ink outline-none placeholder:text-ink-tertiary focus-visible:ring-2 focus-visible:ring-focus"
            />
            {annotationHint && <p role="alert" className="text-[10.5px] text-danger">{annotationHint}</p>}
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => { setSelection(null); setComment(""); setAnnotationHint(""); }} className="rounded-[7px] px-2 py-1.5 text-[11px] text-accent hover:bg-raised-hover">
                {t("preview.annotation.cancel")}
              </button>
              <button type="button" onClick={() => void addToPrompt()} className="rounded-[7px] bg-accent px-3 py-1.5 text-[11px] font-medium text-accent-ink hover:bg-accent/90">
                {t("preview.annotation.addToPrompt")}
              </button>
            </div>
          </div>
        )}
      </div>

      {draft && (
        <div className="shrink-0 border-t border-hairline bg-card px-[14px] py-[10px]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-ink">{t("preview.annotation.messageTitle")}</span>
            <button type="button" onClick={discardDraft} className="text-[11px] text-accent hover:underline">{t("preview.annotation.discard")}</button>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <img src={draft.url} alt={t("preview.annotation.thumbnail")} className="h-[66px] w-[102px] rounded-[6px] border border-hairline object-cover max-[650px]:h-[62px] max-[650px]:w-[88px]" />
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              aria-label={t("preview.annotation.messageTitle")}
              className="min-h-[66px] min-w-[180px] flex-1 resize-y rounded-[7px] border border-hairline bg-inset p-2 text-[11.5px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus"
            />
            <button type="button" disabled={sending || !prompt.trim()} onClick={() => void sendToAgent()} className="h-[34px] rounded-[7px] bg-accent px-3 text-[11.5px] font-medium text-accent-ink hover:bg-accent/90 disabled:opacity-50 max-[650px]:w-full">
              {sending ? <LoaderCircle size={14} className="animate-spin" /> : t("preview.annotation.send")}
            </button>
          </div>
          {sendError && <p role="alert" className="mt-2 text-[11px] text-danger">{sendError}</p>}
        </div>
      )}

      {hasFooter && !draft && (
        <footer className="flex h-[44px] shrink-0 items-center justify-between gap-2 border-t border-hairline bg-card px-[15px]">
          <span className="text-[11px] text-ink-secondary">{t("preview.readOnly")}</span>
          <div className="flex items-center gap-2">
            {copyState !== "idle" && <span role={copyState === "failed" ? "alert" : "status"} className="text-[11px] text-ink-secondary">{t(copyState === "failed" ? "preview.copyFailed" : "preview.copied")}</span>}
            <button type="button" onClick={() => void copy()} className="flex items-center gap-1 rounded-[8px] px-[13px] py-[7px] text-[11.5px] text-ink hover:bg-raised-hover">
              {copyState === "copied" ? <Check size={13} /> : <Copy size={13} />} {t("preview.copy")}
            </button>
            <button type="button" onClick={onClose} className="rounded-[8px] px-[13px] py-[7px] text-[11.5px] text-ink hover:bg-raised-hover">{t("preview.done")}</button>
          </div>
        </footer>
      )}
    </div>
  );

  if (position === "right") {
    return (
      <aside
        aria-label={t("preview.aria", { name })}
        className="relative z-40 flex h-full min-w-0 shrink-0 flex-col border-l border-hairline/40 bg-panel max-md:absolute max-md:inset-0 max-md:z-40 md:w-[clamp(420px,43vw,680px)] md:px-[10px]"
        style={{ contain: "layout paint style" }}
      >
        {dialog}
      </aside>
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[#030407C8] p-[22px] backdrop-blur-[5px] max-[650px]:p-0"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {dialog}
    </div>,
    document.body,
  );
}
