export interface Brand {
  name: string;
  tagline?: string;
  accent?: string;
  logo?: string;
  favicon?: string;
  supportUrl?: string;
}

export interface BrandStatus {
  brand: Brand;
  source: "default" | "file";
  file: string;
  notice?: string;
}

export const DEFAULT_BRAND: Brand = { name: "MimirBot", logo: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1MTIiIGhlaWdodD0iNTEyIiB2aWV3Qm94PSI4MCA4OCAzNTIgMzYwIj4KPHRpdGxlPlNlaXhvIGNvbXBhY3RvIOKAlCBQw6lyb2xhPC90aXRsZT4KPGRlc2M+VmFyaWHDp8OjbyBkZSBzaWxodWV0YSBzZWl4byBjb21wYWN0byBjb20gb2xob3MgbWluaW1hbGlzdGFzIGUgYWNhYmFtZW50byBsaWzDoXMgcGVyb2xhZG8uPC9kZXNjPgo8ZGVmcz4KPHBhdGggaWQ9ImJvZHkiIGQ9Ik0xMDcgMjUyIEM5NyAxNzggMTQ3IDExMCAyMjUgMTAyIEMzMDcgOTIgMzgxIDEzNyAzOTggMjExIEM0MTYgMjkyIDM2MyAzNjUgMjg3IDM4MiBDMjAxIDQwMSAxMTggMzM3IDEwNyAyNTIgWiIvPgo8cmFkaWFsR3JhZGllbnQgaWQ9InBlYXJsIiBjeD0iMjclIiBjeT0iMTIlIiByPSIxMDYlIj48c3RvcCBzdG9wLWNvbG9yPSIjRkZGRkZGIi8+PHN0b3Agb2Zmc2V0PSIuMyIgc3RvcC1jb2xvcj0iI0YzRURGRiIvPjxzdG9wIG9mZnNldD0iLjY1IiBzdG9wLWNvbG9yPSIjRDlDQUYxIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjQUE4RkNGIi8+PC9yYWRpYWxHcmFkaWVudD4KPGxpbmVhckdyYWRpZW50IGlkPSJyaW0iIHgxPSIwIiB5MT0iMCIgeDI9Ii44IiB5Mj0iMSI+PHN0b3Agc3RvcC1jb2xvcj0iI0ZGRkZGRiIgc3RvcC1vcGFjaXR5PSIuOTUiLz48c3RvcCBvZmZzZXQ9Ii42IiBzdG9wLWNvbG9yPSIjRkZGIiBzdG9wLW9wYWNpdHk9Ii4xNSIvPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzhCNzBBRSIgc3RvcC1vcGFjaXR5PSIuMyIvPjwvbGluZWFyR3JhZGllbnQ+CjxsaW5lYXJHcmFkaWVudCBpZD0iZXllIiB4MT0iMCIgeTE9IjAiIHgyPSIuNCIgeTI9IjEiPjxzdG9wIHN0b3AtY29sb3I9IiNGRkZGRkYiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNGNUYyRkMiLz48L2xpbmVhckdyYWRpZW50Pgo8bGluZWFyR3JhZGllbnQgaWQ9InB1cGlsIiB4MT0iMCIgeTE9IjAiIHgyPSIwIiB5Mj0iMSI+PHN0b3Agc3RvcC1jb2xvcj0iIzI5MjczNSIvPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzRDNDM1RSIvPjwvbGluZWFyR3JhZGllbnQ+CjxyYWRpYWxHcmFkaWVudCBpZD0ic2hhZG93Ij48c3RvcCBzdG9wLWNvbG9yPSIjNjg1MDgwIiBzdG9wLW9wYWNpdHk9Ii4xNSIvPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzY4NTA4MCIgc3RvcC1vcGFjaXR5PSIwIi8+PC9yYWRpYWxHcmFkaWVudD4KPGZpbHRlciBpZD0iYmx1ciIgeD0iLS41IiB5PSItLjUiIHdpZHRoPSIyIiBoZWlnaHQ9IjIiPjxmZUdhdXNzaWFuQmx1ciBzdGREZXZpYXRpb249IjciLz48L2ZpbHRlcj4KPGNsaXBQYXRoIGlkPSJjbGlwIj48dXNlIGhyZWY9IiNib2R5IiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayIgeGxpbms6aHJlZj0iI2JvZHkiLz48L2NsaXBQYXRoPgo8L2RlZnM+CjxlbGxpcHNlIGN4PSIyNTYiIGN5PSI0NDAiIHJ4PSIxMzciIHJ5PSIyNCIgZmlsbD0idXJsKCNzaGFkb3cpIi8+Cjx1c2UgaHJlZj0iI2JvZHkiIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB4bGluazpocmVmPSIjYm9keSIgZmlsbD0idXJsKCNwZWFybCkiLz4KPGcgY2xpcC1wYXRoPSJ1cmwoI2NsaXApIj4KPHBhdGggZD0iTTEyMiAyMjMgQzEzMSAxNTEgMTkwIDEwNiAyNTAgMTA2IiBmaWxsPSJub25lIiBzdHJva2U9IiNGRkYiIHN0cm9rZS13aWR0aD0iMTQiIG9wYWNpdHk9Ii4zNiIgZmlsdGVyPSJ1cmwoI2JsdXIpIi8+CjxwYXRoIGQ9Ik0xMzUgMTg5IEMxNTEgMTUwIDE4MSAxMjUgMjExIDExNSIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjRkZGIiBzdHJva2Utd2lkdGg9IjIuNCIgb3BhY2l0eT0iLjY0IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KPC9nPgo8dXNlIGhyZWY9IiNib2R5IiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayIgeGxpbms6aHJlZj0iI2JvZHkiIGZpbGw9Im5vbmUiIHN0cm9rZT0idXJsKCNyaW0pIiBzdHJva2Utd2lkdGg9IjEuMiIvPgo8Zz4KPHJlY3QgeD0iMTk0IiB5PSIyMDgiIHdpZHRoPSI0OCIgaGVpZ2h0PSI2NiIgcng9IjI0IiBmaWxsPSIjOEI3MEFFIiBvcGFjaXR5PSIuMSIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMCAyKSIvPgo8cmVjdCB4PSIyNjgiIHk9IjIwOCIgd2lkdGg9IjQ4IiBoZWlnaHQ9IjY2IiByeD0iMjQiIGZpbGw9IiM4QjcwQUUiIG9wYWNpdHk9Ii4xIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgwIDIpIi8+CjxyZWN0IHg9IjE5NCIgeT0iMjA4IiB3aWR0aD0iNDgiIGhlaWdodD0iNjYiIHJ4PSIyNCIgZmlsbD0idXJsKCNleWUpIi8+CjxyZWN0IHg9IjI2OCIgeT0iMjA4IiB3aWR0aD0iNDgiIGhlaWdodD0iNjYiIHJ4PSIyNCIgZmlsbD0idXJsKCNleWUpIi8+CjxyZWN0IHg9IjIxOSIgeT0iMjI4IiB3aWR0aD0iMTYiIGhlaWdodD0iMzEiIHJ4PSI4IiBmaWxsPSJ1cmwoI3B1cGlsKSIvPgo8cmVjdCB4PSIyOTMiIHk9IjIyOCIgd2lkdGg9IjE2IiBoZWlnaHQ9IjMxIiByeD0iOCIgZmlsbD0idXJsKCNwdXBpbCkiLz4KPC9nPgo8L3N2Zz4K" };

let current: BrandStatus = { brand: DEFAULT_BRAND, source: "default", file: "" };

export function brand(): Brand {
  return current.brand;
}

export function brandStatus(): BrandStatus {
  return current;
}

const HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

export function luminance(hex: string): number {
  const m = HEX.exec(hex);
  if (!m) return 0;
  const channel = (h: string) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(m[1]) + 0.7152 * channel(m[2]) + 0.0722 * channel(m[3]);
}

export function accentInk(accent: string): string {
  // contrast vs white = 1.05 / (L + 0.05); vs black = (L + 0.05) / 0.05
  const l = luminance(accent);
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.05 ? "#ffffff" : "#111111";
}

export function brandVars(b: Brand): Record<string, string> {
  if (!b.accent || !HEX.test(b.accent)) return {};
  return {
    "--color-accent": b.accent,
    "--color-accent-border": b.accent,
    "--color-focus": b.accent,
    "--color-accent-text": b.accent,
    "--color-accent-ink": accentInk(b.accent),
  };
}

export function iconType(href: string): string {
  const match = /^data:(image\/[a-z0-9.+-]+)/i.exec(href);
  return match ? match[1].toLowerCase() : "";
}

let defaultIcon: { href: string; type: string } | null = null;

function applyIcon(favicon: string | undefined): void {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) return;
  defaultIcon ??= { href: link.getAttribute("href") ?? "", type: link.getAttribute("type") ?? "" };
  const next = favicon ? { href: favicon, type: iconType(favicon) } : defaultIcon;
  link.setAttribute("href", next.href);
  if (next.type) link.setAttribute("type", next.type);
  else link.removeAttribute("type");
  let touch = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"][data-brand]');
  if (favicon) {
    if (!touch) {
      touch = document.createElement("link");
      touch.rel = "apple-touch-icon";
      touch.dataset.brand = "1";
      document.head.appendChild(touch);
    }
    touch.href = favicon;
  } else touch?.remove();
}

export function applyBrand(status: BrandStatus): void {
  current = status;
  if (typeof document === "undefined") return;
  document.title = status.brand.name;
  applyIcon(status.brand.favicon);
  const root = document.documentElement;
  for (const name of ["--color-accent", "--color-accent-border", "--color-focus", "--color-accent-text", "--color-accent-ink"]) {
    root.style.removeProperty(name);
  }
  for (const [name, value] of Object.entries(brandVars(status.brand))) root.style.setProperty(name, value);
}

function isBrandStatus(value: unknown): value is BrandStatus {
  if (!value || typeof value !== "object") return false;
  const v = Reflect.get(value, "brand");
  return Boolean(v) && typeof v === "object" && typeof Reflect.get(Object(v), "name") === "string";
}

export async function bootstrapBrand(fetchImpl: typeof fetch = fetch, timeoutMs = 1500): Promise<BrandStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl("/api/brand", { signal: controller.signal });
    if (!res.ok) return current;
    const body: unknown = await res.json();
    if (isBrandStatus(body)) applyBrand(body);
  } catch {
  } finally {
    clearTimeout(timer);
  }
  return current;
}
