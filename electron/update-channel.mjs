/** The two release feeds a person can pick between in Settings. */
export const UPDATE_CHANNELS = Object.freeze(["main", "beta"]);
export const DEFAULT_UPDATE_CHANNEL = "main";

/** Anything this app did not write (or a newer build's name) means the official feed. */
export function parseUpdateChannel(value) {
  return UPDATE_CHANNELS.includes(value) ? value : DEFAULT_UPDATE_CHANNEL;
}

/** The channel survives restarts in a small file; an unreadable or damaged file leaves the official feed on. */
export function createUpdateChannelStore({ read, write }) {
  let channel = null;
  return {
    get() {
      if (channel === null) {
        let saved;
        try {
          saved = read()?.channel;
        } catch {
        }
        channel = parseUpdateChannel(saved);
      }
      return channel;
    },
    set(value) {
      const next = parseUpdateChannel(value);
      channel = next;
      try {
        write({ channel: next });
      } catch {
      }
      return next;
    },
  };
}

/**
 * electron-updater's GitHub provider reads `<channel>-linux.yml` (and `beta.yml` on Windows) from
 * the newest matching release. "latest" is the provider's own name for the official feed, and it
 * also decides whether the releases feed may hand back a prerelease tag.
 */
export function applyUpdateChannel(updater, channel) {
  const beta = parseUpdateChannel(channel) === "beta";
  updater.channel = beta ? "beta" : null;
  updater.allowPrerelease = beta;
  // electron-updater turns allowDowngrade on with every channel write; neither feed installs an older build by itself.
  updater.allowDowngrade = false;
}
