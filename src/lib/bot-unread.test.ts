import { afterEach, describe, expect, it, vi } from "vitest";

import { showBrowserUnread, titleWithUnread } from "./bot-unread";

describe("browser unread indicator", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("prefixes the title with the count, replaces an older count, and drops it at zero", () => {
    expect(titleWithUnread("MimirBot", 3)).toBe("(3) MimirBot");
    expect(titleWithUnread("(3) MimirBot", 5)).toBe("(5) MimirBot");
    expect(titleWithUnread("(5) Acme", 0)).toBe("Acme");
    expect(titleWithUnread("Acme", 0)).toBe("Acme");
  });

  it("sets the title and the app badge, and clears both", () => {
    const doc = { title: "MimirBot" };
    const setAppBadge = vi.fn(async () => {});
    const clearAppBadge = vi.fn(async () => {});
    vi.stubGlobal("document", doc);
    vi.stubGlobal("navigator", { setAppBadge, clearAppBadge });

    showBrowserUnread(2);
    expect(doc.title).toBe("(2) MimirBot");
    expect(setAppBadge).toHaveBeenCalledWith(2);

    showBrowserUnread(0);
    expect(doc.title).toBe("MimirBot");
    expect(clearAppBadge).toHaveBeenCalled();
  });

  it("keeps the page's own title, such as a white-label name or a preview page's", () => {
    const doc = { title: "Isolated OpenMaus Chat" };
    vi.stubGlobal("document", doc);
    vi.stubGlobal("navigator", {});
    showBrowserUnread(0);
    expect(doc.title).toBe("Isolated OpenMaus Chat");
    showBrowserUnread(1);
    expect(doc.title).toBe("(1) Isolated OpenMaus Chat");
  });

  it("still sets the title where the Badging API is missing or refuses", () => {
    const doc = { title: "MimirBot" };
    vi.stubGlobal("document", doc);
    vi.stubGlobal("navigator", {});
    showBrowserUnread(1);
    expect(doc.title).toBe("(1) MimirBot");

    vi.stubGlobal("navigator", { setAppBadge: () => Promise.reject(new Error("NotAllowedError")) });
    showBrowserUnread(4);
    expect(doc.title).toBe("(4) MimirBot");
  });
});
