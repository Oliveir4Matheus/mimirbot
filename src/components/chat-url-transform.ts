import { defaultUrlTransform } from "react-markdown";
import { isUseMyComputerUrl } from "./ChatLinks";
import { looksLikeThreadRefUrl } from "../lib/thread-refs";

const WINDOWS_PATH = /^[a-zA-Z]:[\\/]/;
const absolutePath = (value: string): string | null => {
  if (value.startsWith("/") || WINDOWS_PATH.test(value)) return value;
  return null;
};

export const localFilePath = (href?: string): string | null => {
  if (!href) return null;
  if (/^file:\/\//i.test(href)) {
    try {
      const url = new URL(href);
      if (url.username || url.password || url.port || url.search || url.hash) return null;
      const path = decodeURIComponent(url.pathname);
      if (url.hostname && url.hostname !== "localhost") return `//${url.hostname}${path}`;
      // WHATWG file URLs spell a Windows drive as /C:/ on every host; a raw /C:/… Markdown target is a POSIX path.
      return /^\/[a-z]:[\\/]/i.test(path) ? path.slice(1) : absolutePath(path);
    } catch {
      return null;
    }
  }
  if (href.startsWith("\\\\")) return href;
  // //host/path is a protocol-relative web URL in Markdown; UNC paths come as backslashes or file://server/share.
  if (href.startsWith("//")) return null;
  const absolute = absolutePath(href);
  if (absolute) return absolute;
  if (href.startsWith("#") || /^[a-z][a-z\d+.-]*:/i.test(href)) return null;
  return href;
};

export function chatUrlTransform(value: string, key = "href"): string {
  if (looksLikeThreadRefUrl(value) || isUseMyComputerUrl(value)) return value;
  // Markdown-to-HTML percent-encodes a destination's backslashes (C:%5CUsers…); restore them and leave other escapes
  // for the server's single decode.
  const url = /^[a-zA-Z]:%5C/i.test(value) ? value.replace(/%5C/gi, "\\") : value;
  if (/^file:\/\//i.test(url) || WINDOWS_PATH.test(url) || url.startsWith("\\\\")) {
    return localFilePath(url) ? url : "";
  }
  if (key === "href" && /^obsidian:\/\//i.test(value)) return value;
  return defaultUrlTransform(value);
}
