// @vitest-environment happy-dom
// One viewer for both worlds: transcript attachments and a run's artifacts.
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLocale, t } from "@/lib/i18n";
import { FilePreviewDialog, PreviewLoadError } from "./FilePreviewDialog";

let host: HTMLDivElement;
let root: Root;

const response = (body: string, status = 200): Response => new Response(body, {
  status,
  headers: { "content-type": "text/markdown; charset=utf-8" },
});

const render = (element: ReactElement): void => {
  flushSync(() => root.render(element));
};

const dialog = (): HTMLElement | null => document.querySelector<HTMLElement>('[role="dialog"]');
const annotate = (): HTMLButtonElement | null => document.querySelector<HTMLButtonElement>(`[aria-label="${t("preview.annotate")}"]`);

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => response("# Título\n\nTexto")));
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

describe("FilePreviewDialog artifact source", () => {
  it("renders bytes from an injected loader and never offers the conversation actions", async () => {
    const onClose = vi.fn();
    render(
      <FilePreviewDialog
        path="notas.txt"
        name="notas.txt"
        format="text"
        load={async () => new Blob(["linha um\nlinha dois"], { type: "text/plain" })}
        downloadUrl="/api/workflows/runs/r1/artifact?path=notas.txt&disposition=download"
        downloadName="notas.txt"
        onClose={onClose}
      />,
    );
    await vi.waitFor(() => expect(document.querySelector("pre")?.textContent).toContain("linha um"));
    expect(document.querySelector("pre")?.textContent).toContain("linha dois");
    expect(annotate()).toBeNull();
    expect(document.querySelector("textarea")).toBeNull();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();

    const download = dialog()?.querySelector("a[download]");
    expect(download?.getAttribute("href")).toBe("/api/workflows/runs/r1/artifact?path=notas.txt&disposition=download");
    expect(download?.getAttribute("download")).toBe("notas.txt");

    flushSync(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("maps a loader failure onto the viewer's own error state", async () => {
    render(
      <FilePreviewDialog
        path="grande.png"
        name="grande.png"
        format="image"
        load={async () => { throw new PreviewLoadError("tooLarge"); }}
        downloadUrl="/download/grande.png"
        onClose={() => {}}
      />,
    );
    await vi.waitFor(() => expect(document.body.textContent).toContain(t("preview.tooLarge")));
    expect(document.body.textContent).toContain(t("preview.retry"));
    expect(dialog()?.querySelector('a[download]')?.getAttribute("href")).toBe("/download/grande.png");
  });
});

describe("FilePreviewDialog attachment source", () => {
  it("keeps loading through the message and the annotation flow", async () => {
    const onClose = vi.fn();
    render(
      <FilePreviewDialog
        path="/workspace/notas.md"
        name="notas.md"
        message={{ threadId: "t", messageId: "m" }}
        onClose={onClose}
      />,
    );
    await vi.waitFor(() => expect(document.querySelector("h1")?.textContent).toBe("Título"));
    expect(annotate()).not.toBeNull();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/threads/t/messages/m/file",
      expect.objectContaining({ method: "POST" }),
    );
    expect(dialog()?.querySelector("a[download]")).toBeNull();
    expect(document.querySelector(`[aria-label="${t("preview.download")}"]`)?.tagName).toBe("BUTTON");

    flushSync(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
