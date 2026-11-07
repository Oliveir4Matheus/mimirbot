import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FilePreviewButton } from "./FilePreviewButton";

const message = { threadId: "t", messageId: "m" };

describe("file preview trigger", () => {
  it("opens the unified preview for a supported file", () => {
    const html = renderToStaticMarkup(createElement(FilePreviewButton, { path: "/workspace/report.md", name: "report.md", message }));
    expect(html).toContain("Open preview: report.md");
    expect(html).not.toContain("Save a copy of report.md");
  });

  it("keeps the download action for a format without a preview", () => {
    const html = renderToStaticMarkup(createElement(FilePreviewButton, { path: "/workspace/notes.txt", name: "notes.txt", message }));
    expect(html).toContain("Save a copy of notes.txt");
    expect(html).not.toContain("Open preview:");
  });
});
