import { describe, expect, it } from "vitest";
import { dataUrlToBlob, isUsableSelection, normalizeSelection, viewportCaptureRect } from "./preview-capture";

describe("preview selection", () => {
  it("normalizes a drag in any direction", () => {
    expect(normalizeSelection({ x: 40, y: 50 }, { x: 10, y: 20 })).toEqual({ x: 10, y: 20, width: 30, height: 30 });
  });

  it("rejects tiny selections", () => {
    expect(isUsableSelection({ x: 0, y: 0, width: 21, height: 40 })).toBe(false);
    expect(isUsableSelection({ x: 0, y: 0, width: 22, height: 22 })).toBe(true);
  });

  it("converts a local selection into viewport pixels", () => {
    const element = {
      getBoundingClientRect: () => ({ left: 100, top: 50, width: 300, height: 200 }),
    } as HTMLElement;
    expect(viewportCaptureRect(element, { x: 10, y: 20, width: 30, height: 40 })).toEqual({ x: 110, y: 70, width: 30, height: 40 });
  });
});

describe("capture payload", () => {
  it("turns a png data URL into a blob", async () => {
    const blob = dataUrlToBlob("data:image/png;base64,aGk=");
    expect(blob.type).toBe("image/png");
    expect(await blob.text()).toBe("hi");
  });
});
