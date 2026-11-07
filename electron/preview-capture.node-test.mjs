import assert from "node:assert/strict";
import test from "node:test";

import { clampCaptureRect } from "./preview-capture.mjs";

test("keeps a capture rectangle inside the window", () => {
  assert.deepEqual(clampCaptureRect({ x: 10, y: 20, width: 100, height: 80 }, { width: 500, height: 400 }), {
    x: 10,
    y: 20,
    width: 100,
    height: 80,
  });
});

test("clamps a rectangle that runs past the window", () => {
  assert.deepEqual(clampCaptureRect({ x: 450, y: 380, width: 200, height: 200 }, { width: 500, height: 400 }), {
    x: 450,
    y: 380,
    width: 50,
    height: 20,
  });
});

test("rejects malformed rectangles", () => {
  assert.equal(clampCaptureRect(null, { width: 500, height: 400 }), null);
  assert.equal(clampCaptureRect({ x: Number.NaN, y: 0, width: 10, height: 10 }, { width: 500, height: 400 }), null);
  assert.equal(clampCaptureRect({ x: 0, y: 0, width: 0, height: 10 }, { width: 500, height: 400 }), null);
  assert.equal(clampCaptureRect({ x: 0, y: 0, width: -5, height: 10 }, { width: 500, height: 400 }), null);
});
