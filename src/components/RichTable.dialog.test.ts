// @vitest-environment happy-dom
import { StrictMode, createElement, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TableDialog } from "./RichTable";

function Harness() {
  const [open, setOpen] = useState(true);
  return open
    ? createElement(TableDialog, { title: "Table", onClose: () => setOpen(false), returnFocus: null, children: "body" })
    : createElement("p", null, "closed");
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  flushSync(() => root.render(createElement(StrictMode, null, createElement(Harness))));
});

afterEach(() => {
  flushSync(() => root.unmount());
  host.remove();
});

describe("table dialog", () => {
  it("stays open after StrictMode's development effect replay", async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    const dialog = document.querySelector("dialog");
    expect(dialog).not.toBeNull();
    expect(dialog?.open).toBe(true);
    expect(document.body.textContent).not.toContain("closed");
  });
});
