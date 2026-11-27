// @vitest-environment happy-dom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SITE_FRAME_ALLOW, SITE_FRAME_SANDBOX } from "@/lib/published-apps";
import { SiteFrame } from "./SiteFrame";

const URL = "https://abcdefghijklmnopqrstuvwxyz.mimirbot.invalid/";
const markup = (url: string) => renderToStaticMarkup(createElement(SiteFrame, { url, title: "Bake sale", attempt: 2 }));

describe("the preview's site frame", () => {
  it("frames the page with exactly its sandbox and no device permissions", () => {
    const html = markup(URL);
    expect(html).toContain(`src="${URL}"`);
    expect(html).toContain(`sandbox="${SITE_FRAME_SANDBOX}"`);
    expect(html).toContain("camera &#x27;none&#x27;; microphone &#x27;none&#x27;; geolocation &#x27;none&#x27;; display-capture &#x27;none&#x27;; clipboard-read &#x27;none&#x27;; autoplay &#x27;none&#x27;");
    expect(html).toContain('referrerPolicy="no-referrer"');
    expect(SITE_FRAME_SANDBOX).toBe("allow-scripts allow-same-origin allow-forms allow-popups");
    expect(SITE_FRAME_ALLOW).toBe("camera 'none'; microphone 'none'; geolocation 'none'; display-capture 'none'; clipboard-read 'none'; autoplay 'none'");
  });

  it("never frames the app's own origin or anything that is not a plain web address", () => {
    for (const url of [`${window.location.origin}/page`, "javascript:alert(1)", "data:text/html,<h1>hi</h1>"]) {
      const html = markup(url);
      expect(html).not.toContain("<iframe");
      expect(html).toContain("This page can&#x27;t be shown here");
      expect(html).toContain("Open in browser");
    }
  });
});
