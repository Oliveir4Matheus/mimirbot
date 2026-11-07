import { clampCaptureRect } from "./preview-capture.mjs";

export function installPreviewCaptureIpc({ ipcMain, localOnly, BrowserWindow }) {
  ipcMain.handle("desktop:capture-preview-region", localOnly("desktop:capture-preview-region", async (event, rect) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window.isDestroyed()) return null;
    const [width, height] = window.getContentSize();
    const clamped = clampCaptureRect(rect, { width, height });
    if (!clamped) return null;
    const image = await window.webContents.capturePage(clamped);
    return image.isEmpty() ? null : image.toDataURL();
  }));
}
