import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { LimitWarnings } from "@/components/automations/LimitWarnings";
import { useDesktopCapabilities } from "@/components/DesktopCapabilities";
import { SidebarProfileMenu } from "@/components/SidebarProfileMenu";
import { UpdateIndicator } from "@/components/UpdateIndicator";
import { useAutomationsNeedYou } from "@/components/SidebarFooterNav";
import { HELP_CENTER_URL, openExternalLink } from "@/lib/app-links";
import { brand } from "@/lib/brand";
import { useCloudFilesReady } from "@/lib/cloud-files";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { nearLimitEngines, useEngineLimits } from "@/lib/limit-resets";
import { useStore } from "@/state/store";
import { planLabel, PlanRingGraphic, useOnePlanPerEngine, type PlanProvider } from "./plan-ring";

const ITEM = "group relative flex size-10 shrink-0 items-center justify-center rounded-[13px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

function HoverLabel({ label }: { label: string }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none invisible absolute left-[calc(100%+12px)] top-1/2 z-50 -translate-x-1 -translate-y-1/2 whitespace-nowrap rounded-lg border border-hairline bg-card px-2.5 py-1.5 text-[12px] font-medium text-ink opacity-0 shadow-sm transition-[opacity,transform,visibility] duration-150 group-hover:visible group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:visible group-focus-visible:translate-x-0 group-focus-visible:opacity-100 motion-reduce:transition-none"
    >
      {label}
    </span>
  );
}

function RailButton({ label, active = false, attention = false, onClick, children }: {
  label: string;
  active?: boolean;
  attention?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={cn(ITEM, active ? "bg-raised text-ink" : "text-ink-secondary hover:bg-raised/60 hover:text-ink")}
    >
      {children}
      {attention && <span aria-hidden="true" className="absolute right-1.5 top-1.5 size-2 rounded-full bg-danger" />}
      <HoverLabel label={label} />
    </button>
  );
}

/** The rail's inbox; for now it holds only the AI usage warnings. */
function NotificationsButton() {
  const count = nearLimitEngines(useEngineLimits()).length;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", escape); };
  }, [open]);
  const label = count ? `${t("notifications.title")} (${count})` : t("notifications.title");
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        className={cn(ITEM, open ? "bg-raised text-ink" : "text-ink-secondary hover:bg-raised/60 hover:text-ink")}
      >
        {ICONS.notifications}
        {count > 0 && (
          <span aria-hidden="true" className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-warning px-1 text-[10px] font-semibold leading-none text-white">{count}</span>
        )}
        {!open && <HoverLabel label={label} />}
      </button>
      {open && (
        <div role="dialog" aria-label={t("notifications.title")} data-mimir-notifications=""
          className="absolute bottom-0 left-[calc(100%+12px)] z-50 w-[380px] max-w-[calc(100vw-90px)] rounded-xl border border-hairline bg-card p-3 shadow-lg">
          <div className="mb-2.5 flex items-center justify-between px-0.5">
            <h2 className="text-[14px] font-semibold text-ink">{t("notifications.title")}</h2>
            <button type="button" onClick={() => setOpen(false)} aria-label={t("common.close")} title={t("common.close")}
              className="grid size-7 place-items-center rounded-md text-ink-tertiary hover:bg-raised hover:text-ink">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
          {count ? <div className="[&>section]:mb-0"><LimitWarnings /></div>
            : <p className="px-0.5 pb-1 text-[13px] text-ink-secondary">{t("automations.run.nothingNew")}</p>}
        </div>
      )}
    </div>
  );
}

function Glyph({ children, strokeWidth = 1.65 }: { children: ReactNode; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[22px]" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const ICONS = {
  bots: <Glyph><rect x="4" y="7" width="16" height="13" rx="2.7" /><path d="M12 7V3H9M1.7 12.3H4M20 12.3h2.3" /><path d="M9 12.5v2M15 12.5v2" strokeWidth={2.6} /></Glyph>,
  automations: <Glyph><rect x="3" y="3.5" width="8.5" height="8.5" rx="2" /><rect x="13" y="13" width="8.5" height="8.5" rx="2" /><path d="M7.25 12v3.2a2 2 0 0 0 2 2H13" /></Glyph>,
  schedule: <Glyph><path d="M4 8V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3M8 1.7v4M16 1.7v4M4 8h16M4 9v10a2 2 0 0 0 2 2h5" /><circle cx="16.5" cy="16.5" r="5" /><path d="M16.5 13.7v3l2 1.1" /></Glyph>,
  logs: <Glyph><path d="m3 6 2.1 2.1L8.4 4.8M11.5 6.5H21M3 16l2.1 2.1 3.3-3.3M11.5 16.5H21" /><path d="M11.5 11.5H21" opacity=".75" /></Glyph>,
  teamMap: (
    <Glyph strokeWidth={2}>
      <path d="M7.4 12.7 15.8 6.6M7.4 12.7h10.2M17.6 12.7l-5.2 5.1" />
      <circle cx="6.2" cy="13" r="2.5" className="fill-panel" /><circle cx="16" cy="6" r="2.5" className="fill-panel" />
      <circle cx="18.2" cy="13" r="2.5" className="fill-panel" /><circle cx="11.5" cy="19" r="2.5" className="fill-panel" />
    </Glyph>
  ),
  files: <Glyph><path d="M3 7.5V6a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><path d="M3 10h18" /></Glyph>,
  usage: <Glyph><path d="M3.5 2.8v18h18" /><path d="M7.5 17.2v-6.1l4 2.6 6-5.2v8.7z" /></Glyph>,
  apps: <Glyph><path d="M3.2 10.4 5 4.8h14l1.8 5.6c0 1.6-1.2 2.6-2.6 2.6-1 0-1.8-.5-2.3-1.2-.5.7-1.4 1.2-2.4 1.2s-1.8-.5-2.3-1.2c-.5.7-1.4 1.2-2.3 1.2S7.1 12.5 6.6 11.8c-.5.7-1.3 1.2-2.3 1.2-1.5 0-2.4-1.2-1.1-2.6Z" /><path d="M5 13v7h14v-7M9.2 20v-5h5.6v5" /></Glyph>,
  help: <Glyph strokeWidth={2}><circle cx="12" cy="12" r="9.3" /><path d="M9.6 9.3a2.6 2.6 0 0 1 5.1.6c0 1.8-2.6 2.1-2.6 4.1" /><path d="M12 17.5h.01" strokeWidth={3} /></Glyph>,
  notifications: <Glyph><path d="M6 9.5a6 6 0 0 1 12 0c0 4.6 1.8 6.3 2.3 6.8H3.7c.5-.5 2.3-2.2 2.3-6.8Z" /><path d="M10 19.5a2.1 2.1 0 0 0 4 0" /></Glyph>,
  settings: <Glyph><path d="M10 2.8 9.3 5a7 7 0 0 0-1.8 1L5.2 5.4 2.8 9l1.8 1.7a8 8 0 0 0 0 2.5L2.8 15l2.4 3.6 2.3-.7a7 7 0 0 0 1.8 1l.7 2.3h4l.7-2.3a7 7 0 0 0 1.8-1l2.3.7 2.4-3.6-1.8-1.8a8 8 0 0 0 0-2.5l1.8-1.7-2.4-3.6-2.3.6a7 7 0 0 0-1.8-1L14 2.8Z" /><circle cx="12" cy="12" r="3.1" /></Glyph>,
};

function PlanRing({ provider, onOpen }: { provider: PlanProvider; onOpen: () => void }) {
  const label = planLabel(provider);
  return (
    <button type="button" aria-label={label} onClick={onOpen} className={cn(ITEM, "rounded-full hover:brightness-110")}>
      <PlanRingGraphic provider={provider} size={40} />
      <HoverLabel label={label} />
    </button>
  );
}

export function MimirRail() {
  const { state, dispatch } = useStore();
  const { capabilities } = useDesktopCapabilities();
  const automationsNeedYou = useAutomationsNeedYou();
  const filesReady = useCloudFilesReady();
  const rings = useOnePlanPerEngine();
  const overlay = state.appSettingsOpen || state.pluginsOpen;
  const routines = state.activeView === "routines" && !overlay;
  const focus = state.routinesFocus;
  // macOS draws the traffic lights over the window's top-left corner, so the rail starts below them on a strip that drags the window.
  // SAFETY: Electron's -webkit-app-region is not in React's CSSProperties type; the renderer accepts it as an inline style.
  const dragStyle = { WebkitAppRegion: "drag" } as CSSProperties;
  const macInset = capabilities.windowChrome === "mac-inset";
  const openUsage = () => dispatch({ type: "showUsage" });

  return (
    <nav
      aria-label={t("sidebar.aria")}
      data-mimir-rail=""
      className="relative z-30 flex h-full w-[66px] shrink-0 flex-col items-center border-r border-hairline/40 bg-panel pb-[9px] pt-2.5 max-md:hidden"
    >
      {macInset && <div aria-hidden="true" className="h-7 w-full shrink-0" style={dragStyle} />}
      <button
        type="button"
        aria-label={brand().name}
        title={brand().name}
        onClick={() => dispatch({ type: "showChat" })}
        className="mb-3.5 grid size-8 shrink-0 place-items-center rounded-[9px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <img src="/app-icon.svg" alt="" className="size-7" />
      </button>

      <div className="flex w-full flex-col items-center gap-1.5">
        <RailButton label={t("sidebar.section.bots")} active={state.activeView === "chat" && !overlay} onClick={() => dispatch({ type: "showChat" })}>{ICONS.bots}</RailButton>
        <RailButton
          label={t("sidebar.nav.automations")}
          active={routines && focus.view !== "calendar" && focus.section !== "logs"}
          attention={automationsNeedYou}
          onClick={() => dispatch({ type: "showRoutines", view: "list" })}
        >
          {ICONS.automations}
        </RailButton>
        <RailButton label={t("routines.drawer.schedule")} active={routines && focus.view === "calendar"} onClick={() => dispatch({ type: "showRoutines", view: "calendar" })}>{ICONS.schedule}</RailButton>
        <RailButton label={t("routines.logs")} active={routines && focus.section === "logs"} onClick={() => dispatch({ type: "showRoutines", section: "logs" })}>{ICONS.logs}</RailButton>
        <RailButton label={t("sidebar.nav.teamMap")} active={state.activeView === "team-map" && !overlay} onClick={() => dispatch({ type: "showTeamMap" })}>{ICONS.teamMap}</RailButton>
        {filesReady && <RailButton label={t("sidebar.nav.files")} active={state.activeView === "files" && !overlay} onClick={() => dispatch({ type: "showFiles" })}>{ICONS.files}</RailButton>}
        <RailButton label={t("settings.section.usage")} active={state.activeView === "usage" && !overlay} onClick={openUsage}>{ICONS.usage}</RailButton>
      </div>

      <div className="mt-auto flex w-full flex-col items-center gap-1.5 pt-3">
        <NotificationsButton />
        {rings.map((provider) => <PlanRing key={provider.driver} provider={provider} onOpen={openUsage} />)}
        <RailButton label={t("sidebar.nav.apps")} active={state.pluginsOpen} onClick={() => dispatch({ type: "togglePlugins", open: true })}>{ICONS.apps}</RailButton>
        <RailButton label={t("sidebar.menu.help")} onClick={() => void openExternalLink(HELP_CENTER_URL)}>{ICONS.help}</RailButton>
        <RailButton
          label={t("sidebar.menu.settings")}
          active={state.appSettingsOpen}
          onClick={() => dispatch({ type: "toggleAppSettings", open: true })}
        >
          {ICONS.settings}
        </RailButton>
        <UpdateIndicator className="size-10" />
        <SidebarProfileMenu iconOnly rail />
      </div>
    </nav>
  );
}
