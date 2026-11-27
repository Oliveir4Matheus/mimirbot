import type { PublishedApp, PublishedAppsList } from "../../shared/published-apps";
import { api } from "@/state/api";
import { isAppOrigin } from "./web-panels";

/** Security: a published page is untrusted content. Its frame keeps the page's own origin (so its scripts and storage
 * work as on the site) and gets scripts, forms and new tabs, never top navigation, downloads, pointer lock or a way out
 * of the sandbox. A page on the app's own origin is never framed (`showable`). */
export const SITE_FRAME_SANDBOX = "allow-scripts allow-same-origin allow-forms allow-popups";
/** What the frame may never ask the browser for. */
export const SITE_FRAME_ALLOW = "camera 'none'; microphone 'none'; geolocation 'none'; display-capture 'none'; clipboard-read 'none'; autoplay 'none'";

/** A plain web address that is not the app itself. */
export function showable(url: string, appOrigin: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  return !parsed.username && !parsed.password && !isAppOrigin(parsed.href, appOrigin);
}

export function listPublishedApps(signal?: AbortSignal): Promise<PublishedApp[]> {
  return api<PublishedAppsList>("/api/published-apps", { signal }).then((answer) => answer.apps);
}

/** Resolves after the server answered 200; a refusal throws the server's own message. */
export function deletePublishedApp(id: string): Promise<void> {
  return api(`/api/published-apps/${encodeURIComponent(id)}`, { method: "DELETE" }).then(() => undefined);
}
