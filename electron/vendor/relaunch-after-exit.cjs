"use strict";
// Starts the updated AppImage once this process is gone, from a plain /bin/sh that lives outside the old AppImage's
// mount (Electron's own relauncher runs from inside it, and that mount is torn down as the app exits). It waits for
// this process, starts the new build with the old AppImage's variables removed, and starts it again when it does not stay up.
const { spawn } = require("node:child_process");
const { mkdirSync } = require("node:fs");
const { homedir } = require("node:os");
const { join } = require("node:path");

const WAIT_FOR_EXIT_SECONDS = 120;
const ATTEMPTS = 3;
const DEFAULT_SETTLE_SECONDS = 15;

const WATCHER = `
pid="$1"; target="$2"; log="$3"
say() { printf '%s %s\\n' "$(date -u +%FT%TZ)" "$1" >> "$log"; }
say "waiting for pid $pid to exit"
waited=0
while kill -0 "$pid" 2>/dev/null; do
  sleep 0.2
  waited=$((waited + 1))
  if [ "$waited" -ge ${WAIT_FOR_EXIT_SECONDS * 5} ]; then say "pid $pid did not exit in ${WAIT_FOR_EXIT_SECONDS}s; giving up"; exit 1; fi
done
sleep 1
attempt=0
while [ "$attempt" -lt ${ATTEMPTS} ]; do
  attempt=$((attempt + 1))
  say "starting $target (attempt $attempt)"
  "$target" >/dev/null 2>&1 &
  child=$!
  sleep "$SETTLE_SECONDS"
  if kill -0 "$child" 2>/dev/null; then say "running (pid $child)"; exit 0; fi
  say "exited within \${SETTLE_SECONDS}s"
done
say "gave up after ${ATTEMPTS} attempts"
exit 1
`;

const APPIMAGE_VARIABLES = ["APPDIR", "ARGV0", "OWD"];
const PATH_LISTS = ["PATH", "LD_LIBRARY_PATH", "XDG_DATA_DIRS", "GSETTINGS_SCHEMA_DIR"];

/** What the new AppImage should see: nothing that points into the mount this one is leaving, and its own path as APPIMAGE. */
function cleanEnvironment(source, target) {
  const env = { ...source };
  const mount = source.APPDIR;
  for (const name of APPIMAGE_VARIABLES) delete env[name];
  if (mount) {
    for (const name of PATH_LISTS) {
      if (!env[name]) continue;
      const kept = env[name].split(":").filter((entry) => entry && !entry.startsWith(mount));
      if (kept.length) env[name] = kept.join(":");
      else delete env[name];
    }
  }
  if (target) env.APPIMAGE = target;
  env.APPIMAGE_SILENT_INSTALL = "true";
  return env;
}

/** True once the watcher is running; false when it could not be started, so the caller can fall back. */
function relaunchAfterExit(target, options = {}) {
  const logDirectory = options.logDirectory ?? join(homedir(), ".cache", "mimirbot-updater");
  try {
    mkdirSync(logDirectory, { recursive: true });
  } catch {}
  try {
    const watcher = spawn("/bin/sh", ["-c", WATCHER, "mimirbot-relaunch", String(process.pid), target, join(logDirectory, "relaunch.log")], {
      detached: true,
      stdio: "ignore",
      cwd: homedir(),
      env: { ...cleanEnvironment(process.env, target), SETTLE_SECONDS: String(options.settleSeconds ?? DEFAULT_SETTLE_SECONDS) },
    });
    watcher.on("error", () => {});
    watcher.unref();
    return watcher.pid !== undefined;
  } catch {
    return false;
  }
}

module.exports = { relaunchAfterExit, cleanEnvironment };
