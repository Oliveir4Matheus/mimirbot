// White-label: a brand.json next to the data dir, applied only with the `whitelabel` entitlement (an unlicensed server
// reports what it found and keeps the default). Read on every request, so an edit shows on the next reload.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import { DATA_DIR } from "./config.ts";
import { entitled } from "./enterprise.ts";

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;
const MAX_LOGO_CHARS = 300_000;
const MAX_FAVICON_CHARS = 120_000;

export const brandSchema = z
  .object({
    /** Product name shown in the window title, onboarding and settings. */
    name: z.string().trim().min(1, "name must not be empty").max(40, "name must be 40 characters or fewer"),
    /** One line under the name on the welcome screen. */
    tagline: z.string().trim().max(120, "tagline must be 120 characters or fewer").optional(),
    /** Accent colour for buttons, links and focus rings; text on it is derived for contrast. */
    accent: z.string().regex(HEX_COLOUR, "accent must be a 6-digit hex colour such as #C2510A").optional(),
    /** Welcome-screen mark: an inline data:image/... URI or an https:// URL. */
    logo: z
      .string()
      .max(MAX_LOGO_CHARS, `logo must be under ${MAX_LOGO_CHARS} characters (inline a small SVG or link an https:// image)`)
      .refine((v) => v.startsWith("data:image/") || v.startsWith("https://"), "logo must be a data:image/... URI or an https:// URL")
      .optional(),
    /** Where "get help" points for this deployment. */
    supportUrl: z.string().url().startsWith("https://", "supportUrl must be an https:// URL").optional(),
    /** Tab and home-screen icon: an inline data:image/... URI (PNG or SVG, small) or an https:// URL. */
    favicon: z
      .string()
      .max(MAX_FAVICON_CHARS, `favicon must be under ${MAX_FAVICON_CHARS} characters (a 64px PNG or a small SVG)`)
      .refine((v) => v.startsWith("data:image/") || v.startsWith("https://"), "favicon must be a data:image/... URI or an https:// URL")
      .optional(),
  })
  .strict();

export type Brand = z.infer<typeof brandSchema>;

export const DEFAULT_BRAND: Brand = { name: "MimirBot", logo: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1MTIiIGhlaWdodD0iNTEyIiB2aWV3Qm94PSI4MCA4OCAzNTIgMzYwIj4KPHRpdGxlPlNlaXhvIGNvbXBhY3RvIOKAlCBQw6lyb2xhPC90aXRsZT4KPGRlc2M+VmFyaWHDp8OjbyBkZSBzaWxodWV0YSBzZWl4byBjb21wYWN0byBjb20gb2xob3MgbWluaW1hbGlzdGFzIGUgYWNhYmFtZW50byBsaWzDoXMgcGVyb2xhZG8uPC9kZXNjPgo8ZGVmcz4KPHBhdGggaWQ9ImJvZHkiIGQ9Ik0xMDcgMjUyIEM5NyAxNzggMTQ3IDExMCAyMjUgMTAyIEMzMDcgOTIgMzgxIDEzNyAzOTggMjExIEM0MTYgMjkyIDM2MyAzNjUgMjg3IDM4MiBDMjAxIDQwMSAxMTggMzM3IDEwNyAyNTIgWiIvPgo8cmFkaWFsR3JhZGllbnQgaWQ9InBlYXJsIiBjeD0iMjclIiBjeT0iMTIlIiByPSIxMDYlIj48c3RvcCBzdG9wLWNvbG9yPSIjRkZGRkZGIi8+PHN0b3Agb2Zmc2V0PSIuMyIgc3RvcC1jb2xvcj0iI0YzRURGRiIvPjxzdG9wIG9mZnNldD0iLjY1IiBzdG9wLWNvbG9yPSIjRDlDQUYxIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjQUE4RkNGIi8+PC9yYWRpYWxHcmFkaWVudD4KPGxpbmVhckdyYWRpZW50IGlkPSJyaW0iIHgxPSIwIiB5MT0iMCIgeDI9Ii44IiB5Mj0iMSI+PHN0b3Agc3RvcC1jb2xvcj0iI0ZGRkZGRiIgc3RvcC1vcGFjaXR5PSIuOTUiLz48c3RvcCBvZmZzZXQ9Ii42IiBzdG9wLWNvbG9yPSIjRkZGIiBzdG9wLW9wYWNpdHk9Ii4xNSIvPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzhCNzBBRSIgc3RvcC1vcGFjaXR5PSIuMyIvPjwvbGluZWFyR3JhZGllbnQ+CjxsaW5lYXJHcmFkaWVudCBpZD0iZXllIiB4MT0iMCIgeTE9IjAiIHgyPSIuNCIgeTI9IjEiPjxzdG9wIHN0b3AtY29sb3I9IiNGRkZGRkYiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNGNUYyRkMiLz48L2xpbmVhckdyYWRpZW50Pgo8bGluZWFyR3JhZGllbnQgaWQ9InB1cGlsIiB4MT0iMCIgeTE9IjAiIHgyPSIwIiB5Mj0iMSI+PHN0b3Agc3RvcC1jb2xvcj0iIzI5MjczNSIvPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzRDNDM1RSIvPjwvbGluZWFyR3JhZGllbnQ+CjxyYWRpYWxHcmFkaWVudCBpZD0ic2hhZG93Ij48c3RvcCBzdG9wLWNvbG9yPSIjNjg1MDgwIiBzdG9wLW9wYWNpdHk9Ii4xNSIvPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzY4NTA4MCIgc3RvcC1vcGFjaXR5PSIwIi8+PC9yYWRpYWxHcmFkaWVudD4KPGZpbHRlciBpZD0iYmx1ciIgeD0iLS41IiB5PSItLjUiIHdpZHRoPSIyIiBoZWlnaHQ9IjIiPjxmZUdhdXNzaWFuQmx1ciBzdGREZXZpYXRpb249IjciLz48L2ZpbHRlcj4KPGNsaXBQYXRoIGlkPSJjbGlwIj48dXNlIGhyZWY9IiNib2R5IiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayIgeGxpbms6aHJlZj0iI2JvZHkiLz48L2NsaXBQYXRoPgo8L2RlZnM+CjxlbGxpcHNlIGN4PSIyNTYiIGN5PSI0NDAiIHJ4PSIxMzciIHJ5PSIyNCIgZmlsbD0idXJsKCNzaGFkb3cpIi8+Cjx1c2UgaHJlZj0iI2JvZHkiIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB4bGluazpocmVmPSIjYm9keSIgZmlsbD0idXJsKCNwZWFybCkiLz4KPGcgY2xpcC1wYXRoPSJ1cmwoI2NsaXApIj4KPHBhdGggZD0iTTEyMiAyMjMgQzEzMSAxNTEgMTkwIDEwNiAyNTAgMTA2IiBmaWxsPSJub25lIiBzdHJva2U9IiNGRkYiIHN0cm9rZS13aWR0aD0iMTQiIG9wYWNpdHk9Ii4zNiIgZmlsdGVyPSJ1cmwoI2JsdXIpIi8+CjxwYXRoIGQ9Ik0xMzUgMTg5IEMxNTEgMTUwIDE4MSAxMjUgMjExIDExNSIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjRkZGIiBzdHJva2Utd2lkdGg9IjIuNCIgb3BhY2l0eT0iLjY0IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KPC9nPgo8dXNlIGhyZWY9IiNib2R5IiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayIgeGxpbms6aHJlZj0iI2JvZHkiIGZpbGw9Im5vbmUiIHN0cm9rZT0idXJsKCNyaW0pIiBzdHJva2Utd2lkdGg9IjEuMiIvPgo8Zz4KPHJlY3QgeD0iMTk0IiB5PSIyMDgiIHdpZHRoPSI0OCIgaGVpZ2h0PSI2NiIgcng9IjI0IiBmaWxsPSIjOEI3MEFFIiBvcGFjaXR5PSIuMSIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMCAyKSIvPgo8cmVjdCB4PSIyNjgiIHk9IjIwOCIgd2lkdGg9IjQ4IiBoZWlnaHQ9IjY2IiByeD0iMjQiIGZpbGw9IiM4QjcwQUUiIG9wYWNpdHk9Ii4xIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgwIDIpIi8+CjxyZWN0IHg9IjE5NCIgeT0iMjA4IiB3aWR0aD0iNDgiIGhlaWdodD0iNjYiIHJ4PSIyNCIgZmlsbD0idXJsKCNleWUpIi8+CjxyZWN0IHg9IjI2OCIgeT0iMjA4IiB3aWR0aD0iNDgiIGhlaWdodD0iNjYiIHJ4PSIyNCIgZmlsbD0idXJsKCNleWUpIi8+CjxyZWN0IHg9IjIxOSIgeT0iMjI4IiB3aWR0aD0iMTYiIGhlaWdodD0iMzEiIHJ4PSI4IiBmaWxsPSJ1cmwoI3B1cGlsKSIvPgo8cmVjdCB4PSIyOTMiIHk9IjIyOCIgd2lkdGg9IjE2IiBoZWlnaHQ9IjMxIiByeD0iOCIgZmlsbD0idXJsKCNwdXBpbCkiLz4KPC9nPgo8L3N2Zz4K" };

export interface BrandStatus {
  brand: Brand;
  /** "file" when brand.json is applied; "default" otherwise (see notice for why). */
  source: "default" | "file";
  /** The path consulted, so an operator knows where to put the file. */
  file: string;
  /** Why the file was not applied, in terms of what to change. */
  notice?: string;
}

export function brandFile(): string {
  return process.env.OMB_BRAND_FILE || join(DATA_DIR, "brand.json");
}

/** Never throws. */
export function loadBrand(options: { file?: string; isEntitled?: (feature: string) => boolean } = {}): BrandStatus {
  const file = options.file ?? brandFile();
  const isEntitled = options.isEntitled ?? entitled;
  const fallback = (notice?: string): BrandStatus =>
    notice ? { brand: DEFAULT_BRAND, source: "default", file, notice } : { brand: DEFAULT_BRAND, source: "default", file };
  if (!existsSync(file)) return fallback();
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    return fallback(`${file} is not valid JSON (${error instanceof Error ? error.message : String(error)}); using the default brand`);
  }
  const parsed = brandSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    return fallback(`${file}: ${where}${issue?.message ?? "invalid"}; using the default brand`);
  }
  if (!isEntitled("whitelabel")) {
    return fallback(`${file} found but this server is not licensed for whitelabel; using the default brand`);
  }
  return { brand: parsed.data, source: "file", file };
}

export function describeBrand(status: BrandStatus): string {
  if (status.source === "file") return `brand: ${status.brand.name} (from ${status.file})`;
  return `brand: default${status.notice ? ` (${status.notice})` : ""}`;
}
