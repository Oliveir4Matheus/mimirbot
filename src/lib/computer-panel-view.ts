export type ComputerPanelView = "computer" | "android" | "browser" | "routines" | "files" | "data";

type PanelTabsContext = { advanced: boolean; androidConnected: boolean };

export function computerPanelTabs({ advanced, androidConnected }: PanelTabsContext): ComputerPanelView[] {
  return advanced
    ? ["computer", "routines", ...(androidConnected ? (["android"] as const) : []), "browser", "data"]
    : ["computer", "browser", "data", "files"];
}

export function resolveComputerPanelView(view: ComputerPanelView, context: PanelTabsContext): ComputerPanelView {
  return computerPanelTabs(context).includes(view) ? view : "computer";
}

const STORAGE_PREFIX = "omb-computer-panel-view";

function storageKey(botId: string): string {
  return `${STORAGE_PREFIX}:${botId}`;
}

export function readComputerPanelView(
  botId: string,
  storage: Pick<Storage, "getItem"> = localStorage,
): ComputerPanelView {
  try {
    const value = storage.getItem(storageKey(botId));
    if (value === "android" || value === "browser" || value === "routines" || value === "files" || value === "data") return value;
  } catch {
  }
  return "computer";
}

export function writeComputerPanelView(
  botId: string,
  view: ComputerPanelView,
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  try {
    storage.setItem(storageKey(botId), view);
  } catch {
  }
}

const VIEWER_PREFIX = "omb-computer-viewer";

/** One shot per open: the Watch action asks for the live viewer, and the next panel mount consumes it. */
export function writeComputerViewer(botId: string): void {
  try {
    sessionStorage.setItem(`${VIEWER_PREFIX}:${botId}`, "1");
  } catch {
  }
}

export function takeComputerViewer(botId: string): boolean {
  try {
    const key = `${VIEWER_PREFIX}:${botId}`;
    const viewer = sessionStorage.getItem(key) === "1";
    if (viewer) sessionStorage.removeItem(key);
    return viewer;
  } catch {
    return false;
  }
}
