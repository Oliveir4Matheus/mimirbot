// Dev-only preview of the update channel in Settings → General, at
// /update-channel-preview.html?lang=pt-br&skin=daylight&channel=beta&status=downloaded
// It mounts the real rows over a fake desktop bridge; never packaged.
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { UpdateChannelRow, UpdatesRow } from "@/components/SettingsModal";
import { Switch } from "@/components/SettingsPrimitives";
import { Select } from "@/components/Select";
import { setLocale, t } from "@/lib/i18n";
import { SKIN_IDS, type SkinId } from "@/lib/skins";
import type { UpdaterState, UpdateChannel } from "@/types/ogb";
import "./styles.css";

const query = new URLSearchParams(location.search);
setLocale(query.get("lang") ?? "en");
const skin = query.get("skin");
if (SKIN_IDS.includes(skin as SkinId)) document.documentElement.dataset.skin = skin as SkinId;

const channel: UpdateChannel = query.get("channel") === "beta" ? "beta" : "main";
const requested = query.get("status") ?? "idle";
const statuses = ["idle", "checking", "downloading", "downloaded", "error"] as const;
const status = statuses.includes(requested as (typeof statuses)[number])
  ? (requested as (typeof statuses)[number])
  : "idle";
let state: UpdaterState = {
  status,
  channel,
  percent: status === "downloading" ? 42 : undefined,
  version: status === "downloaded" || status === "error" ? "0.1.168-beta.1" : undefined,
  message: status === "error" ? "Couldn't reach the beta feed." : undefined,
};
const listeners = new Set<(next: UpdaterState) => void>();
const publish = () => {
  for (const listener of listeners) listener(state);
};

Object.assign(window, {
  ogb: {
    updater: {
      check: async () => {
        state = { ...state, status: "checking", version: undefined, percent: undefined, message: undefined };
        publish();
      },
      install: async () => {},
      setChannel: async (next: UpdateChannel) => {
        state = { ...state, channel: next === "beta" ? "beta" : "main", status: "idle" };
        publish();
      },
      onState: (listener: (next: UpdaterState) => void) => {
        listeners.add(listener);
        listener(state);
        return () => listeners.delete(listener);
      },
    },
  },
});

function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="group" className="px-4">
      <div className="grid min-w-0 grid-cols-1 items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-6">
        <div className="text-[14px] font-medium text-ink">{title}</div>
        <div className="min-w-0 sm:max-w-[240px]">{children}</div>
      </div>
    </div>
  );
}

function Preview() {
  return (
    <div className="min-h-dvh bg-app px-4 py-10 text-ink">
      <div className="mx-auto w-full max-w-[680px] overflow-hidden rounded-2xl border border-hairline/40 bg-panel shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between gap-3 border-b border-hairline/40 px-5 py-3.5">
          <span className="text-[15px] font-semibold">{t("settings.title")}</span>
          <span className="text-[13px] text-ink-secondary">{t("settings.section.general")}</span>
        </div>
        <div className="flex flex-col gap-4 px-3 py-5 sm:px-5">
          <Row title={t("settings.newBotEffort.title")}>
            <Select size="sm" className="w-full max-w-[240px]" defaultValue="balanced" aria-label={t("settings.newBotEffort.title")}>
              <option value="fast">Fast</option>
              <option value="balanced">Balanced</option>
              <option value="thorough">Thorough</option>
            </Select>
          </Row>
          <Row title={t("settings.openAtLogin.title")}>
            <Switch checked={false} aria-label={t("settings.openAtLogin.title")} />
          </Row>
          <div className="mx-1 h-px bg-hairline/40" />
          <UpdateChannelRow />
          <UpdatesRow />
        </div>
      </div>
      <p className="mx-auto mt-4 max-w-[680px] px-2 text-[12px] leading-relaxed text-ink-tertiary">
        Preview only. Query: lang=pt-br, skin=daylight, channel=beta, status=downloading.
      </p>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
