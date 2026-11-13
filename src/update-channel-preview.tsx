// Dev-only preview of Settings → Updates, served at
// /update-channel-preview.html?lang=pt-br&skin=daylight&channel=beta&status=downloaded
// It mounts the real update rows over a fake desktop bridge; never packaged.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CircleUser, Cloud, Download, Monitor, Palette, Sparkles, User, X } from "lucide-react";
import { UpdateChannelRow, UpdatesRow } from "@/components/SettingsModal";
import { setLocale, t } from "@/lib/i18n";
import { SKIN_IDS, type SkinId } from "@/lib/skins";
import { cn } from "@/lib/cn";
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

const PAGES: Array<{ labelKey: Parameters<typeof t>[0]; icon: typeof User; selected?: boolean }> = [
  { labelKey: "settings.section.general", icon: User },
  { labelKey: "settings.section.appearance", icon: Palette },
  { labelKey: "settings.group.ai", icon: Sparkles },
  { labelKey: "settings.group.computers", icon: Monitor },
  { labelKey: "settings.section.cloudAccount", icon: Cloud },
  { labelKey: "settings.group.account", icon: CircleUser },
  { labelKey: "settings.section.updates", icon: Download, selected: true },
];

function Preview() {
  return (
    <div className="min-h-dvh bg-app px-4 py-10 text-ink">
      <div className="mx-auto flex w-full max-w-[860px] overflow-hidden rounded-2xl border border-hairline/40 bg-panel shadow-2xl shadow-black/40 max-md:flex-col">
        <aside className="flex w-[220px] shrink-0 flex-col gap-0.5 border-e border-hairline/40 bg-inset/40 p-3 max-md:w-full max-md:border-b max-md:border-e-0">
          <div className="px-2.5 pb-2 pt-1 text-[15px] font-semibold">{t("settings.title")}</div>
          {PAGES.map(({ labelKey, icon: Icon, selected }) => (
            <div
              key={labelKey}
              className={cn(
                "flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px]",
                selected ? "bg-control text-ink" : "text-ink-secondary",
              )}
            >
              <Icon size={15} className="shrink-0" />
              {t(labelKey)}
            </div>
          ))}
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-hairline/40 px-5 py-3.5">
            <span className="text-[15px] font-semibold">{t("settings.section.updates")}</span>
            <span className="flex size-7 items-center justify-center rounded-full text-ink-secondary">
              <X size={16} aria-hidden />
            </span>
          </div>
          <div className="flex flex-col gap-4 px-3 py-5 sm:px-5">
            <UpdateChannelRow />
            <UpdatesRow />
          </div>
        </div>
      </div>
      <p className="mx-auto mt-4 max-w-[860px] px-2 text-[12px] leading-relaxed text-ink-tertiary">
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
