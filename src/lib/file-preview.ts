export type PreviewFormat = "md" | "html" | "csv" | "tsv" | "xlsx" | "mp4" | "pdf";

const FORMAT_BY_EXTENSION: Readonly<Record<string, PreviewFormat>> = {
  md: "md",
  markdown: "md",
  html: "html",
  htm: "html",
  csv: "csv",
  tsv: "tsv",
  xlsx: "xlsx",
  mp4: "mp4",
  pdf: "pdf",
};

export function previewFormat(nameOrPath: string): PreviewFormat | null {
  const extension = /\.([a-z0-9]+)$/i.exec(nameOrPath)?.[1]?.toLowerCase();
  return extension ? FORMAT_BY_EXTENSION[extension] ?? null : null;
}

export function previewFileExtension(name: string): string {
  return /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toUpperCase() ?? "";
}

export function previewFormatLabel(format: PreviewFormat): string {
  switch (format) {
    case "md": return "Markdown";
    case "html": return "HTML";
    case "csv": return "CSV";
    case "tsv": return "TSV";
    case "xlsx": return "XLSX";
    case "mp4": return "MP4";
    case "pdf": return "PDF";
  }
}

export function previewFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isTextPreviewFormat(format: PreviewFormat | null): boolean {
  return format === "md" || format === "html" || format === "csv" || format === "tsv";
}

export const TEXT_PREVIEW_MAX_BYTES = 10 * 1024 * 1024;
export const HTML_PREVIEW_MAX_BYTES = 2 * 1024 * 1024;

export function textPreviewLimit(format: PreviewFormat | null): number {
  return format === "html" ? HTML_PREVIEW_MAX_BYTES : TEXT_PREVIEW_MAX_BYTES;
}

/** Chromium's PDF viewer reads the fragment; the renderer only needs a rough page total. */
export function countPdfPages(bytes: Uint8Array): number {
  let source = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    source += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  const pages = source.match(/\/Type\s*\/Page(?!s)\b/g)?.length ?? 0;
  if (pages > 0) return pages;
  const counts = [...source.matchAll(/\/Count\s+(\d+)/g)].map((match) => Number(match[1]));
  return Math.max(1, ...counts.filter((count) => Number.isSafeInteger(count)));
}

export function annotationPrompt(fileName: string, comment: string): string {
  return `In the file \`${fileName}\`, make the following change to the highlighted region:\n\n${comment.trim()}`;
}
