import { describe, expect, it } from "vitest";
import { SITE_FRAME_ALLOW, SITE_FRAME_SANDBOX, showable } from "./published-apps";

describe("a published page in the panel's frame", () => {
  it("gets scripts, its own origin, forms and new tabs, and nothing that could escape or reach a device", () => {
    expect(SITE_FRAME_SANDBOX).toBe("allow-scripts allow-same-origin allow-forms allow-popups");
    for (const token of ["allow-top-navigation", "allow-downloads", "allow-modals", "allow-pointer-lock"]) {
      expect(SITE_FRAME_SANDBOX).not.toContain(token);
    }
    expect(SITE_FRAME_ALLOW).toBe("camera 'none'; microphone 'none'; geolocation 'none'; display-capture 'none'; clipboard-read 'none'; autoplay 'none'");
  });

  it("frames plain web addresses but never the app's own origin", () => {
    expect(showable("https://abcdefghijklmnopqrstuvwxyz.mimirbot.invalid/", "https://app.mimirbot.test")).toBe(true);
    expect(showable("http://127.0.0.1:3000/report", "http://127.0.0.1:5173")).toBe(true);
    expect(showable("https://app.mimirbot.test/page", "https://app.mimirbot.test")).toBe(false);
    expect(showable("javascript:alert(1)", "https://app.mimirbot.test")).toBe(false);
    expect(showable("data:text/html,<h1>hi</h1>", "https://app.mimirbot.test")).toBe(false);
    expect(showable("https://user:secret@example.com/", "https://app.mimirbot.test")).toBe(false);
    expect(showable("not a url", "https://app.mimirbot.test")).toBe(false);
  });
});
