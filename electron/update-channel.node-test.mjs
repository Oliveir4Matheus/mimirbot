import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { createUpdateChannelStore, applyUpdateChannel, parseUpdateChannel } from "./update-channel.mjs";

function store(initial) {
  let saved = initial;
  const writes = [];
  const channel = createUpdateChannelStore({
    read: () => saved,
    write: (value) => {
      saved = value;
      writes.push(value);
    },
  });
  return { channel, writes, saved: () => saved };
}

test("the official feed is the default and the only fallback", () => {
  assert.equal(parseUpdateChannel(undefined), "main");
  assert.equal(parseUpdateChannel(""), "main");
  assert.equal(parseUpdateChannel("nightly"), "main");
  assert.equal(parseUpdateChannel("beta"), "beta");
  assert.equal(parseUpdateChannel("main"), "main");
});

test("a chosen channel is read back after a restart and saved as a small record", () => {
  const first = store({ channel: "beta" });
  assert.equal(first.channel.get(), "beta");

  assert.equal(first.channel.set("main"), "main");
  assert.deepEqual(first.writes, [{ channel: "main" }]);
  assert.deepEqual(first.saved(), { channel: "main" });
});

test("a missing or damaged record leaves the official feed on, and a failed write still holds for this launch", () => {
  assert.equal(createUpdateChannelStore({ read: () => { throw new Error("ENOENT"); }, write: () => {} }).get(), "main");
  assert.equal(createUpdateChannelStore({ read: () => ({ channel: 7 }), write: () => {} }).get(), "main");

  const channel = createUpdateChannelStore({
    read: () => { throw new Error("ENOENT"); },
    write: () => { throw new Error("disk full"); },
  });
  assert.equal(channel.set("beta"), "beta");
  assert.equal(channel.get(), "beta");
});

test("electron-updater's provider reads the branch's channel files only on beta", () => {
  const updater = new EventEmitter();
  applyUpdateChannel(updater, "beta");
  assert.equal(updater.channel, "beta");
  assert.equal(updater.allowPrerelease, true);
  assert.equal(updater.allowDowngrade, false);

  applyUpdateChannel(updater, "main");
  assert.equal(updater.channel, null);
  assert.equal(updater.allowPrerelease, false);
  assert.equal(updater.allowDowngrade, false);
});
