// macOS auto-update requires a signed app, so this runs only when packaged. electron-updater is vendored
// because the packaged app ships no node_modules.
import { app, clipboard, ipcMain } from "electron";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import {
  HAND_OFF_PACKAGE_TYPES,
  linuxPackageType,
  packageInstallCommand,
  stagedInstallFile,
} from "./package-install-command.mjs";
import { openBlankTerminal } from "./terminal-launch.mjs";
import { createUpdaterCoordinator } from "./updater-coordinator.mjs";
import { jsonFile } from "./desktop-prefs.mjs";
import { applyUpdateChannel, createUpdateChannelStore, parseUpdateChannel } from "./update-channel.mjs";

const require = createRequire(import.meta.url);

let autoUpdater = null;
let win = null;
let state = { status: "idle" };
let updaterCoordinator = null;
let pageAllowed = () => false;
let channelStore = null;
let channel = "main";

function appendUpdaterLog(level, values) {
  try {
    const directory = app.getPath("logs");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const message = values
      .map((value) => (value instanceof Error ? value.stack ?? value.message : String(value)))
      .join(" ");
    appendFileSync(join(directory, "updater.log"), `[${new Date().toISOString()}] [${level}] ${message}\n`, { mode: 0o600 });
  } catch {
  }
}

function updaterLogger() {
  return Object.fromEntries(["debug", "info", "warn", "error"].map((level) => [level, (...values) => appendUpdaterLog(level, values)]));
}

// electron-updater would install a .deb through a polkit root prompt and `dpkg -i` (no dependency resolution) over the running app.
const HAND_OFF_TYPES = new Set(HAND_OFF_PACKAGE_TYPES);

// The command is never executed for the person, so nothing here becomes a process argument.
export function handOffDownloadedPackage(packageType) {
  return async (files) => {
    const target = stagedInstallFile(files);
    const command = packageInstallCommand(packageType, target);
    clipboard.writeText(command);
    return { command, terminalOpened: await openBlankTerminal() };
  };
}

function setState(patch) {
  state = { ...state, ...patch };
  try {
    const contents = win?.webContents;
    if (contents && pageAllowed({ sender: contents, senderFrame: contents.mainFrame })) contents.send("update:state", state);
  } catch {
  }
}

export function sendUpdaterState() {
  setState({});
}

export function registerUpdaterIpc({ pageAllowed: allowed }) {
  pageAllowed = allowed;
  const guarded = (name, handler) => (event, ...args) => {
    if (!pageAllowed(event)) {
      // Recorded rather than dropped: a refused page sees no update at all, so the reason has to outlive the window.
      appendUpdaterLog("warn", [`${name} refused for ${event?.senderFrame?.url ?? "an unknown frame"}`]);
      throw new Error(`${name} is only available in this app's window`);
    }
    return handler(...args);
  };
  ipcMain.handle("update:get-state", guarded("update:get-state", () => state));
  ipcMain.handle("update:check", guarded("update:check", () => updaterCoordinator?.check(true)));
  ipcMain.handle("update:install", guarded("update:install", () => updaterCoordinator?.install()));
  ipcMain.handle("update:set-channel", guarded("update:set-channel", (next) => setChannel(next)));
}

/**
 * The feed the person picked. A download already offered belongs to the feed they left, so it is
 * dropped and the new feed is checked at once instead.
 */
function setChannel(value) {
  const next = channelStore ? channelStore.set(value) : parseUpdateChannel(value);
  if (next === channel) return state;
  channel = next;
  setState({ channel });
  if (!autoUpdater) return state;
  applyUpdateChannel(autoUpdater, channel);
  autoUpdater.logger?.info?.(`update channel=${channel}`);
  if (updaterCoordinator?.reset() === false) return state;
  void updaterCoordinator?.check(true);
  return state;
}

// macOS keeps the process (and updater) alive after its window closes, so each new window is retargeted here.
export function attachUpdaterWindow(mainWindow) {
  win = mainWindow;
}

export function startUpdater() {
  channelStore ??= createUpdateChannelStore(jsonFile(join(app.getPath("userData"), "update-channel.json")));
  channel = channelStore.get();
  setState({ channel });
  if (!app.isPackaged) {
    updaterCoordinator = null;
    setState({ status: "idle" });
    return;
  }
  try {
    ({ autoUpdater } = require("./vendor/electron-updater.cjs"));
  } catch {
    updaterCoordinator = null;
    setState({ status: "error", message: "updater unavailable" });
    return;
  }
  // The coordinator starts each download itself, so it owns macOS staging and quiet failures.
  autoUpdater.autoDownload = false;
  autoUpdater.logger = updaterLogger();
  applyUpdateChannel(autoUpdater, channel);
  autoUpdater.logger.info(`update channel=${channel}`);

  // Broadcast the install flavour before the first check so the banner never offers a restart it cannot deliver.
  const packageType = linuxPackageType({ readMarker: (file) => (existsSync(file) ? readFileSync(file, "utf8") : null) });
  autoUpdater.logger.info(`startup packageType=${packageType} appImage=${process.env.APPIMAGE ?? "unset"} execPath=${process.execPath}`);
  const handOff = HAND_OFF_TYPES.has(packageType);
  // On macOS this also starts Squirrel.Mac's native staging at once; a system package is never installed on quit.
  autoUpdater.autoInstallOnAppQuit = !handOff;
  setState({ installMode: handOff ? "handoff" : "restart" });
  updaterCoordinator = createUpdaterCoordinator(autoUpdater, setState, {
    handOffInstall: handOff ? handOffDownloadedPackage(packageType) : null,
    nativeStaging: process.platform === "darwin",
  });

  setTimeout(() => void updaterCoordinator?.check(), 15_000).unref?.();
  setInterval(() => void updaterCoordinator?.check(), 60 * 60 * 1000).unref?.();
}
