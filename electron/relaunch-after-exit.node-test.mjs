import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const module = join(here, "vendor/relaunch-after-exit.cjs");
const { cleanEnvironment } = createRequire(import.meta.url)(module);

const waitFor = async (condition, timeoutMs, label) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(`timed out waiting for ${label}`);
};

/** A parent process that asks for the relaunch and exits `exitAfterMs` later, as the desktop does. */
function runParent(workspace, target, exitAfterMs) {
  const script = `
    const { relaunchAfterExit } = require(${JSON.stringify(module)});
    const ok = relaunchAfterExit(${JSON.stringify(target)}, { logDirectory: ${JSON.stringify(join(workspace, "log"))}, settleSeconds: 1 });
    require("node:fs").writeFileSync(${JSON.stringify(join(workspace, "scheduled"))}, String(ok));
    setTimeout(() => {
      require("node:fs").writeFileSync(${JSON.stringify(join(workspace, "parent-exit"))}, String(Date.now()));
      process.exit(0);
    }, ${exitAfterMs});
  `;
  return spawn(process.execPath, ["-e", script], { stdio: "ignore" });
}

function fakeAppImage(workspace, body) {
  const path = join(workspace, "Fake.AppImage");
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

test("the environment for the new AppImage drops what points into the old mount", () => {
  const env = cleanEnvironment({
    APPDIR: "/tmp/.mount_old",
    APPIMAGE: "/home/me/App.AppImage",
    ARGV0: "x",
    OWD: "/tmp",
    PATH: "/tmp/.mount_old:/tmp/.mount_old/usr/sbin:/usr/bin:/bin",
    LD_LIBRARY_PATH: "/tmp/.mount_old/usr/lib",
    XDG_DATA_DIRS: "/tmp/.mount_old/usr/share/:/usr/share",
    DISPLAY: ":0",
  }, "/home/me/App.AppImage");
  assert.equal(env.APPDIR, undefined);
  assert.equal(env.APPIMAGE, "/home/me/App.AppImage", "points at the new file, not at the old mount");
  assert.equal(env.ARGV0, undefined);
  assert.equal(env.OWD, undefined);
  assert.equal(env.PATH, "/usr/bin:/bin");
  assert.equal(env.LD_LIBRARY_PATH, undefined, "an empty list is removed, not left as an empty entry");
  assert.equal(env.XDG_DATA_DIRS, "/usr/share");
  assert.equal(env.DISPLAY, ":0", "the session variables stay");
  assert.equal(env.APPIMAGE_SILENT_INSTALL, "true");
});

test("the environment is left alone when the old process was not an AppImage", () => {
  const env = cleanEnvironment({ PATH: "/usr/bin:/bin", LD_LIBRARY_PATH: "/opt/lib" });
  assert.equal(env.PATH, "/usr/bin:/bin");
  assert.equal(env.LD_LIBRARY_PATH, "/opt/lib");
});

test("the new build starts only after the old process has exited, and with a clean environment", { skip: process.platform === "win32" }, async (t) => {
  const workspace = mkdtempSync(join(tmpdir(), "omb-relaunch-"));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  const marker = join(workspace, "started");
  const target = fakeAppImage(workspace, `echo "$(node -e 'process.stdout.write(String(Date.now()))') appdir=\${APPDIR:-unset}" > "${marker}"; sleep 4`);

  runParent(workspace, target, 1500);
  await waitFor(() => existsSync(marker), 15_000, "the new build to start");

  const [startedAt, appdir] = readFileSync(marker, "utf8").trim().split(" ");
  const exitedAt = Number(readFileSync(join(workspace, "parent-exit"), "utf8"));
  assert.equal(readFileSync(join(workspace, "scheduled"), "utf8"), "true");
  assert.ok(Number(startedAt) >= exitedAt, "the watcher must not start the build while the old process is alive");
  assert.equal(appdir, "appdir=unset");
  await waitFor(() => /running \(pid \d+\)/.test(readFileSync(join(workspace, "log/relaunch.log"), "utf8")), 10_000, "the running line");
});

test("a build that exits at once is started again, and the log says so", { skip: process.platform === "win32" }, async (t) => {
  const workspace = mkdtempSync(join(tmpdir(), "omb-relaunch-retry-"));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  const counter = join(workspace, "count");
  const target = fakeAppImage(workspace, `echo x >> "${counter}"; if [ "$(wc -l < "${counter}")" -lt 3 ]; then exit 0; fi; sleep 4`);

  runParent(workspace, target, 300);
  await waitFor(() => existsSync(join(workspace, "log/relaunch.log")) && /running \(pid \d+\)/.test(readFileSync(join(workspace, "log/relaunch.log"), "utf8")), 25_000, "the third attempt to stay up");

  const log = readFileSync(join(workspace, "log/relaunch.log"), "utf8");
  assert.equal((log.match(/starting .* \(attempt \d\)/g) ?? []).length, 3);
  assert.equal((log.match(/exited within 1s/g) ?? []).length, 2);
  assert.doesNotMatch(log, /gave up/);
});

test("it gives up after three attempts instead of starting forever", { skip: process.platform === "win32" }, async (t) => {
  const workspace = mkdtempSync(join(tmpdir(), "omb-relaunch-giveup-"));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  const target = fakeAppImage(workspace, "exit 1");

  runParent(workspace, target, 300);
  await waitFor(() => existsSync(join(workspace, "log/relaunch.log")) && /gave up/.test(readFileSync(join(workspace, "log/relaunch.log"), "utf8")), 25_000, "the watcher to give up");
  assert.equal((readFileSync(join(workspace, "log/relaunch.log"), "utf8").match(/starting /g) ?? []).length, 3);
});
