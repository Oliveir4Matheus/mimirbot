import { updateErrorMessage, updateErrorNeedsPerson } from "./update-errors.mjs";

/** electron-updater's GitHub provider gives the release body (HTML); a multi-release feed gives [{ version, note }]. */
export function releaseNotesText(notes) {
  const text = typeof notes === "string"
    ? notes
    : Array.isArray(notes)
      ? notes.map((entry) => (typeof entry?.note === "string" ? entry.note : "")).filter(Boolean).join("\n")
      : "";
  const trimmed = text.trim();
  return trimmed ? trimmed.slice(0, 8000) : undefined;
}

/** Three consecutive hourly failures: the app has gone about three hours without seeing the release feed. */
export const QUIET_FAILURES_BEFORE_NOTICE = 3;

/** True when `candidate` is a higher release than `base` (dotted numbers; a prerelease sorts below its release). */
export function isNewerVersion(candidate, base) {
  if (typeof candidate !== "string" || typeof base !== "string") return false;
  const parse = (version) => {
    const [core, pre] = version.trim().replace(/^v/, "").split("+")[0].split(/-(.*)/s);
    return { nums: core.split(".").map((part) => Number.parseInt(part, 10) || 0), pre: pre ?? "" };
  };
  const a = parse(candidate);
  const b = parse(base);
  for (let i = 0; i < Math.max(a.nums.length, b.nums.length); i += 1) {
    const diff = (a.nums[i] ?? 0) - (b.nums[i] ?? 0);
    if (diff) return diff > 0;
  }
  if (a.pre === b.pre) return false;
  if (!a.pre) return true;
  if (!b.pre) return false;
  return a.pre.localeCompare(b.pre, "en", { numeric: true }) > 0;
}

export function createUpdaterCoordinator(updater, setState, { handOffInstall = null, nativeStaging = false } = {}) {
  let checkOperation = null;
  let downloadedFiles = null;
  let downloadOperation = null;
  let installOperation = null;
  let nativeStagingStarted = false;
  let nativeReady = false;
  // Squirrel has no cancellation or attempt ID: a retry could consume a failed attempt's late ready event.
  let recoveryRequired = false;
  // A staged update, hand-off or failed action stays until the person acts; hourly checks must not replace it.
  let actionOwnsState = false;
  // The downloaded or handed-off update the person has not acted on: { version, patch } (patch restores its card). Hourly checks look for a newer one.
  let staged = null;
  const routedErrors = new WeakSet();
  // Hourly checks fail quietly one at a time (offline laptop, a feed still uploading), but a feed that stays
  // unreachable must not leave the app on an old version with no sign of it.
  let quietFailures = 0;

  const routeError = (manual, error) => {
    if (recoveryRequired) return;
    const shown = manual || updateErrorNeedsPerson(error);
    actionOwnsState = shown;
    if (error instanceof Error) routedErrors.add(error);
    // A failed replacement cannot fall back to the staged update: electron-updater empties its pending cache before
    // downloading a newer file (DownloadedUpdateHelper), so the old one is gone. It is handled like any other failure;
    // a quiet one goes idle and the next hourly check downloads the newest release again.
    if (downloadOperation?.replacing) downloadedFiles = null;
    staged = null;
    if (downloadOperation) {
      downloadOperation.failed = true;
      clearTimeout(downloadOperation.timer);
    }
    if (checkOperation) checkOperation.failed = true;
    if (installOperation) {
      installOperation.failed = true;
      clearTimeout(installOperation.timer);
      installOperation = null;
    }
    if (nativeStagingStarted) {
      recoveryRequired = true;
      nativeReady = false;
      setState({
        status: "error",
        retryable: false,
        message: `${updateErrorMessage(error)} Quit and reopen MimirBot before trying the update again.`,
      });
      return;
    }
    if (!shown) {
      quietFailures += 1;
      if (quietFailures >= QUIET_FAILURES_BEFORE_NOTICE) {
        // The notice does not own the state: hourly checks go on, and the first one that reaches the feed clears it.
        setState({ status: "error", message: `Couldn't check for updates. ${updateErrorMessage(error)}` });
        return;
      }
      setState({ status: "idle" });
      return;
    }
    setState({ status: "error", message: updateErrorMessage(error) });
  };

  function handleRejectedOperation(manual, error) {
    if (error instanceof Error && routedErrors.has(error)) return;
    routeError(manual, error);
  }

  function checkOwnsState() {
    return !recoveryRequired && !actionOwnsState && !installOperation && !downloadOperation && !checkOperation?.supersededByDownload;
  }

  updater.on("checking-for-update", () => {
    if (checkOwnsState()) setState({ status: "checking" });
  });
  updater.on("update-available", (info) => {
    quietFailures = 0;
    if (checkOperation?.recheck && !downloadOperation && !installOperation && !recoveryRequired && staged && isNewerVersion(info?.version, staged.version)) {
      download(Boolean(checkOperation.manual), {
        version: info?.version,
        releaseNotes: releaseNotesText(info?.releaseNotes),
        percent: undefined,
        message: undefined,
      }, true);
      return;
    }
    if (checkOwnsState()) {
      download(Boolean(checkOperation?.manual), {
        version: info?.version,
        releaseNotes: releaseNotesText(info?.releaseNotes),
        percent: undefined,
        message: undefined,
      });
    }
  });
  updater.on("update-not-available", () => {
    quietFailures = 0;
    if (checkOwnsState()) setState({ status: "idle" });
  });
  // macOS native staging (quitAndInstall) reports failure only through this event; quitAndInstall returns void.
  updater.on("error", (error) => {
    // Shared error events do not identify their operation.
    if (checkOperation?.supersededByDownload && !installOperation) return;
    if (checkOperation?.recheck && !checkOperation.manual && !downloadOperation && !installOperation && !nativeStagingStarted) return;
    const manual = Boolean(installOperation || downloadOperation?.manual || checkOperation?.manual || nativeStagingStarted);
    routeError(manual, error);
  });
  updater.on("download-progress", (progress) => {
    if (recoveryRequired || installOperation || nativeStagingStarted) return;
    setState({ status: "downloading", percent: Math.round(progress?.percent ?? 0) });
  });
  updater.on("update-downloaded", (info) => {
    if (recoveryRequired || installOperation) return;
      // On macOS electron-updater emits this before Squirrel.Mac finishes staging; the vendor patch resolves downloadUpdate on the native ready event.
    if (downloadOperation) {
      downloadOperation.downloadedInfo = info;
      if (nativeStaging && !nativeStagingStarted) {
        nativeStagingStarted = true;
        setState({ status: "preparing", version: info?.version, message: undefined });
        downloadOperation.timer = setTimeout(() => {
          updater.logger?.warn?.("Native update preparation exceeded the five-minute deadline; restart is required before retrying.");
          routeError(true, new Error("Preparing the update took too long."));
        }, 5 * 60 * 1000);
        downloadOperation.timer.unref?.();
      }
      return;
    }
    if (nativeStaging) return;
    actionOwnsState = true;
    staged = { version: info?.version, patch: { status: "downloaded", version: info?.version, message: undefined } };
    setState({ status: "downloaded", version: info?.version });
  });

  function check(manual = false) {
    if (manual && downloadOperation) downloadOperation.manual = true;
    if (recoveryRequired || installOperation || (nativeStaging && (downloadOperation || nativeStagingStarted)) || (!manual && actionOwnsState && !(staged && !nativeStaging && !downloadOperation))) return Promise.resolve();
    if (checkOperation) {
      if (manual) checkOperation.manual = true;
      return checkOperation.promise;
    }

    if (manual) actionOwnsState = false;
    const operation = { manual, recheck: !manual && actionOwnsState, supersededByDownload: Boolean(downloadOperation), failed: false, promise: null };
    checkOperation = operation;
    try {
      operation.promise = Promise.resolve(updater.checkForUpdates())
        .catch((error) => {
          if (!operation.supersededByDownload && !(operation.recheck && !operation.manual)) handleRejectedOperation(operation.manual, error);
        })
        .finally(() => {
          if (checkOperation === operation) checkOperation = null;
        });
    } catch (error) {
      if (!operation.supersededByDownload && !(operation.recheck && !operation.manual)) handleRejectedOperation(operation.manual, error);
      checkOperation = null;
      operation.promise = Promise.resolve();
    }
    return operation.promise;
  }

  function download(manual, starting, replacing = false) {
    if (recoveryRequired || installOperation || nativeStagingStarted) return;
    if (checkOperation) checkOperation.supersededByDownload = true;

    const operation = { downloadedInfo: null, failed: false, manual, replacing, timer: null };
    downloadOperation = operation;
      // Own the state before the request: the first progress event can be seconds away, and no percent reads as "starting".
    setState({ status: "downloading", ...starting });
    try {
      void Promise.resolve(updater.downloadUpdate())
        .then((result) => {
          if (!operation.failed) {
            downloadedFiles = Array.isArray(result) ? result.filter((file) => typeof file === "string") : null;
          }
          if (!operation.failed && operation.downloadedInfo) {
            nativeReady = nativeStaging;
            actionOwnsState = true;
            const version = operation.downloadedInfo?.version;
            staged = { version, patch: { status: "downloaded", version, message: undefined } };
            setState({ status: "downloaded", version });
          }
        })
        .catch((error) => handleRejectedOperation(operation.manual, error))
        .finally(() => {
          clearTimeout(operation.timer);
          if (downloadOperation === operation) downloadOperation = null;
        });
    } catch (error) {
      handleRejectedOperation(operation.manual, error);
      downloadOperation = null;
    }
  }

  function install() {
    if (recoveryRequired || installOperation || downloadOperation || (nativeStaging && !nativeReady)) return;
    actionOwnsState = true;
    if (handOffInstall) {
      handOff();
      return;
    }
    const operation = { failed: false, timer: null };
    installOperation = operation;
    setState({ status: "installing" });
    try {
      updater.quitAndInstall(true, true);
    } catch (error) {
      routeError(true, error);
      return;
    }
      // quitAndInstall is void and cannot be canceled: a Retry here would arm another native quit callback.
    if (installOperation === operation) {
      operation.timer = setTimeout(() => {
        if (installOperation !== operation) return;
        updater.logger?.warn?.("Update restart handoff exceeded two minutes; keeping installation locked to prevent overlapping retries.");
        setState({ status: "installing", message: "Restart is taking longer than expected. Quit and reopen MimirBot to finish the update." });
      }, 2 * 60 * 1000);
      operation.timer.unref?.();
    }
  }

  function handOff() {
    const operation = { failed: false, timer: null };
    installOperation = operation;
    setState({ status: "installing" });
    Promise.resolve()
      .then(() => handOffInstall(downloadedFiles))
      .then((patch) => {
        if (installOperation !== operation) return;
        installOperation = null;
        if (staged) staged = { version: staged.version, patch: { status: "handed-off", version: staged.version, ...patch } };
        setState({ status: "handed-off", ...patch });
      })
      .catch((error) => {
        if (installOperation !== operation) return;
        routeError(true, error);
      });
  }

  /** The downloaded update that `install` would install now by quitting and reopening the app, or null: none is ready,
   * another update action holds it, or it installs through a password prompt or a terminal. */
  function installable() {
    if (recoveryRequired || installOperation || downloadOperation || elevatedInstall || handOffInstall || (nativeStaging && !nativeReady)) return null;
    return staged?.patch.status === "downloaded" && typeof staged.version === "string" ? { version: staged.version } : null;
  }

  return { check, install, installable };
}
