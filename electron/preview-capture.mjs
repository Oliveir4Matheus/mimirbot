/** `capturePage` wants whole DIP pixels inside the window; a renderer rect can be fractional or stale. */
export function clampCaptureRect(rect, bounds) {
  if (!rect || typeof rect !== "object") return null;
  const { x, y, width, height } = rect;
  if (![x, y, width, height].every((value) => typeof value === "number" && Number.isFinite(value))) return null;
  const left = Math.max(0, Math.min(Math.floor(x), bounds.width - 1));
  const top = Math.max(0, Math.min(Math.floor(y), bounds.height - 1));
  const right = Math.min(Math.floor(width), bounds.width - left);
  const bottom = Math.min(Math.floor(height), bounds.height - top);
  return right > 0 && bottom > 0 ? { x: left, y: top, width: right, height: bottom } : null;
}
