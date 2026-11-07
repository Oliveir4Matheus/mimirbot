import { describe, expect, it } from "vitest";
import {
  annotationPrompt,
  countPdfPages,
  isTextPreviewFormat,
  previewFileExtension,
  previewFileSize,
  previewFormat,
  previewFormatLabel,
} from "./file-preview";

describe("file preview formats", () => {
  it("recognizes every supported extension", () => {
    expect(previewFormat("notes.md")).toBe("md");
    expect(previewFormat("notes.markdown")).toBe("md");
    expect(previewFormat("page.html")).toBe("html");
    expect(previewFormat("page.htm")).toBe("html");
    expect(previewFormat("data.csv")).toBe("csv");
    expect(previewFormat("data.tsv")).toBe("tsv");
    expect(previewFormat("book.xlsx")).toBe("xlsx");
    expect(previewFormat("clip.mp4")).toBe("mp4");
    expect(previewFormat("paper.pdf")).toBe("pdf");
    expect(previewFormat("notes.txt")).toBeNull();
  });

  it("labels formats and extensions", () => {
    expect(previewFormatLabel("md")).toBe("Markdown");
    expect(previewFormatLabel("xlsx")).toBe("XLSX");
    expect(previewFileExtension("report.FINAL.PDF")).toBe("PDF");
    expect(previewFileExtension("README")).toBe("");
  });

  it("keeps text formats separate from binary previews", () => {
    expect(isTextPreviewFormat("md")).toBe(true);
    expect(isTextPreviewFormat("html")).toBe(true);
    expect(isTextPreviewFormat("csv")).toBe(true);
    expect(isTextPreviewFormat("pdf")).toBe(false);
    expect(isTextPreviewFormat("mp4")).toBe(false);
  });

  it("formats file sizes", () => {
    expect(previewFileSize(0)).toBe("0 B");
    expect(previewFileSize(1536)).toBe("1.5 KB");
    expect(previewFileSize(2 * 1024 * 1024)).toBe("2.0 MB");
    expect(previewFileSize(null)).toBe("");
  });
});

describe("pdf page counting", () => {
  it("counts page objects", () => {
    const bytes = new TextEncoder().encode("%PDF-1.7\n1 0 obj << /Type /Page >> endobj\n2 0 obj << /Type /Page >> endobj\n3 0 obj << /Type /Pages /Count 2 >> endobj");
    expect(countPdfPages(bytes)).toBe(2);
  });

  it("falls back to the page tree count", () => {
    const bytes = new TextEncoder().encode("%PDF-1.7\n1 0 obj << /Type /Pages /Count 7 >> endobj");
    expect(countPdfPages(bytes)).toBe(7);
  });

  it("never reports fewer than one page", () => {
    expect(countPdfPages(new TextEncoder().encode("%PDF-1.7"))).toBe(1);
  });
});

describe("annotation prompt", () => {
  it("names the file and keeps the comment editable", () => {
    expect(annotationPrompt("report.pdf", "  Align the title  ")).toBe(
      "In the file `report.pdf`, make the following change to the highlighted region:\n\nAlign the title",
    );
  });
});
