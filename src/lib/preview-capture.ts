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

const STYLE_PROPERTIES = [
  "color", "background-color", "background-image", "background-size", "background-position", "background-repeat",
  "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
  "border-top-style", "border-right-style", "border-bottom-style", "border-left-style",
  "border-top-color", "border-right-color", "border-bottom-color", "border-left-color", "border-radius",
  "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing", "text-align",
  "text-decoration", "text-transform", "white-space", "word-break", "overflow-wrap", "vertical-align",
  "display", "position", "top", "right", "bottom", "left", "box-sizing", "width", "height",
  "min-width", "min-height", "max-width", "max-height",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "flex-direction", "flex-wrap", "flex-grow", "flex-shrink", "flex-basis",
  "align-items", "align-content", "align-self", "justify-content", "gap", "row-gap", "column-gap",
  "grid-template-columns", "grid-template-rows", "overflow", "overflow-x", "overflow-y",
  "opacity", "transform", "transform-origin", "list-style-type", "list-style-position",
  "table-layout", "border-collapse", "border-spacing", "visibility",
];

function cloneWithStyles(element: HTMLElement): HTMLElement {
  const clone = element.cloneNode(true) as HTMLElement;
  const sources = [element, ...element.querySelectorAll<HTMLElement>("*")];
  const copies = [clone, ...clone.querySelectorAll<HTMLElement>("*")];
  for (let index = 0; index < sources.length; index += 1) {
    const from = sources[index]!;
    const to = copies[index];
    if (!to) continue;
    const computed = getComputedStyle(from);
    for (const property of STYLE_PROPERTIES) {
      const value = computed.getPropertyValue(property);
      if (value) to.style.setProperty(property, value);
    }
  }
  return clone;
}

async function captureDomRegion(element: HTMLElement, selection: SelectionRect): Promise<Blob | null> {
  if (typeof document === "undefined" || typeof XMLSerializer === "undefined") return null;
  const bounds = element.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  const clone = cloneWithStyles(element);
  const sources = [element, ...element.querySelectorAll<HTMLElement>("*")];
  const copies = [clone, ...clone.querySelectorAll<HTMLElement>("*")];
  let scrollX = 0;
  let scrollY = 0;
  let capturedScroll = false;
  for (let index = 0; index < sources.length; index += 1) {
    const from = sources[index]!;
    const to = copies[index];
    if (!to) continue;
    const scrollsY = from.scrollHeight > from.clientHeight + 1;
    const scrollsX = from.scrollWidth > from.clientWidth + 1;
    if (!scrollsY && !scrollsX) continue;
    if (!capturedScroll) {
      scrollX = from.scrollLeft;
      scrollY = from.scrollTop;
      capturedScroll = true;
    }
    to.style.setProperty("overflow", "visible");
    to.style.setProperty("max-height", "none");
    to.style.setProperty("max-width", "none");
    if (scrollsY) to.style.setProperty("height", `${from.scrollHeight}px`);
    if (scrollsX) to.style.setProperty("width", `${from.scrollWidth}px`);
  }
  clone.style.setProperty("width", `${Math.max(bounds.width, element.scrollWidth)}px`);
  clone.style.setProperty("height", `${Math.max(bounds.height, element.scrollHeight)}px`);
  clone.style.setProperty("overflow", "visible");
  const markup = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${clone.style.width}" height="${clone.style.height}"><foreignObject width="100%" height="100%">${markup}</foreignObject></svg>`;
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("image"));
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
  } catch {
    return null;
  }
  const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(selection.width * scale));
  canvas.height = Math.max(1, Math.round(selection.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.scale(scale, scale);
  context.fillStyle = getComputedStyle(element).backgroundColor || "#ffffff";
  context.fillRect(0, 0, selection.width, selection.height);
  context.drawImage(
    image,
    selection.x + scrollX,
    selection.y + scrollY,
    selection.width,
    selection.height,
    0,
    0,
    selection.width,
    selection.height,
  );
  return await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
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
  return await captureVideoFrame(element, selection) ?? await captureDomRegion(element, selection) ?? await fallbackCapture(selection);
}
