export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MIN_SELECTION_SIDE = 22;

export function normalizeSelection(start: { x: number; y: number }, end: { x: number; y: number }): SelectionRect {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

export function isUsableSelection(rect: SelectionRect): boolean {
  return rect.width >= MIN_SELECTION_SIDE && rect.height >= MIN_SELECTION_SIDE;
}

export function viewportCaptureRect(element: HTMLElement, selection: SelectionRect): SelectionRect {
  const bounds = element.getBoundingClientRect();
  return {
    x: Math.max(0, bounds.left + selection.x),
    y: Math.max(0, bounds.top + selection.y),
    width: Math.max(1, selection.width),
    height: Math.max(1, selection.height),
  };
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, payload = ""] = dataUrl.split(",", 2);
  const mime = /^data:([^;]+)/.exec(header ?? "")?.[1] ?? "image/png";
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
}

function fallbackCapture(selection: SelectionRect): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(selection.width));
  canvas.height = Math.max(1, Math.round(selection.height));
  const context = canvas.getContext("2d");
  if (!context) return Promise.resolve(null);
  context.fillStyle = "#18191B";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#AA89F2";
  context.lineWidth = 2;
  context.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

function captureVideoFrame(element: HTMLElement, selection: SelectionRect): Promise<Blob | null> {
  const video = element.querySelector("video");
  if (!video || video.videoWidth === 0 || video.videoHeight === 0) return Promise.resolve(null);
  const bounds = element.getBoundingClientRect();
  const scale = Math.min(bounds.width / video.videoWidth, bounds.height / video.videoHeight);
  const shownWidth = video.videoWidth * scale;
  const shownHeight = video.videoHeight * scale;
  const left = (bounds.width - shownWidth) / 2;
  const top = (bounds.height - shownHeight) / 2;
  const sourceX = Math.max(0, (selection.x - left) / scale);
  const sourceY = Math.max(0, (selection.y - top) / scale);
  const sourceWidth = Math.min(video.videoWidth - sourceX, selection.width / scale);
  const sourceHeight = Math.min(video.videoHeight - sourceY, selection.height / scale);
  if (sourceWidth <= 0 || sourceHeight <= 0) return Promise.resolve(null);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(selection.width));
  canvas.height = Math.max(1, Math.round(selection.height));
  const context = canvas.getContext("2d");
  if (!context) return Promise.resolve(null);
  context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#AA89F2";
  context.lineWidth = 2;
  context.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export async function capturePreviewRegion(element: HTMLElement, selection: SelectionRect): Promise<Blob | null> {
  const rect = viewportCaptureRect(element, selection);
  const bridge = typeof window === "undefined" ? undefined : window.ogb?.capturePreviewRegion;
  if (bridge) {
    try {
      const dataUrl = await bridge(rect);
      if (dataUrl) return dataUrlToBlob(dataUrl);
    } catch {
    }
  }
  return await captureVideoFrame(element, selection) ?? await fallbackCapture(selection);
}
