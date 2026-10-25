import { useEffect, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { Cloud, Laptop } from "lucide-react";

import { CloudTile } from "@/components/cloud-buy/parts";
import { DesktopWorkspaceSwitcher, openServerMenu } from "@/components/DesktopWorkspaceSwitcher";
import { brand } from "@/lib/brand";
import { cloudColor } from "@/lib/cloud-look";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { useShowThreads } from "@/lib/thread-preferences";
import { useStore, type Bot } from "@/state/store";
import { openThread, type ThreadTarget } from "@/state/thread-navigation";

// SAFETY: Electron's -webkit-app-region is not in React's CSSProperties type; the renderer accepts it as an inline style.
const NO_DRAG = { WebkitAppRegion: "no-drag" } as CSSProperties;

export const TOP_ICON_BUTTON = "grid size-[33px] shrink-0 place-items-center rounded-[7px] text-ink-tertiary transition-colors hover:bg-raised hover:text-ink disabled:pointer-events-none disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

function DoubleChevron() {
  return (
    <svg viewBox="0 0 12 18" aria-hidden="true" className="h-[18px] w-3 shrink-0 text-ink-tertiary" fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7 6 4 9 7M3 11l3 3 3-3" />
    </svg>
  );
}

function WorkspaceMark({ color, local }: { color?: string; local: boolean }) {
  if (cloudColor(color)) return <CloudTile color={color} size={22} />;
  const Icon = local ? Laptop : Cloud;
  return <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-accent text-white"><Icon size={12} strokeWidth={2.2} aria-hidden="true" /></span>;
}

/** The workspace this window shows, as the sidebar's title: the button opens Electron's server menu. */
export function MimirWorkspaceButton({ cloudHome, owner, howTo, onMenuClosed }: {
  cloudHome: boolean; owner: string | null; howTo: boolean; onMenuClosed: () => void;
}) {
  const bridge = window.ogb?.workspaces;
  const [current, setCurrent] = useState<{ local: boolean; name: string; origin?: string; color?: string; home?: boolean } | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    void bridge?.state().then((state) => { if (alive) setCurrent(state); }).catch(() => {});
    return () => { alive = false; };
  }, [bridge]);
  if (cloudHome || current?.home) {
    return <DesktopWorkspaceSwitcher inline cloudHome={cloudHome} owner={owner} howTo={howTo} onMenuClosed={onMenuClosed} />;
  }
  const title = <span className="min-w-0 truncate text-[14px] font-semibold tracking-[-0.02em] text-ink">{current?.name ?? (bridge ? t("sidebar.servers") : brand().name)}</span>;
  if (!bridge) {
    return <div data-workspace-switcher="title" className="flex min-w-0 items-center gap-[7px]"><WorkspaceMark local />{title}</div>;
  }
  const label = t("sidebar.switchServer", { name: current?.name ?? t("sidebar.servers") });
  return (
    <div data-workspace-switcher="title" className="relative flex min-w-0">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        data-tour="server-switcher"
        title={current?.origin ? `${current.name} · ${current.origin}` : current?.name}
        style={NO_DRAG}
        onClick={() => {
          if (open) return;
          setError("");
          setOpen(true);
          void openServerMenu(bridge, { howTo, onClosed: onMenuClosed })
            .catch(() => setError(t("sidebar.switchServerError")))
            .finally(() => setOpen(false));
        }}
        className="flex h-[34px] min-w-0 items-center gap-[7px] rounded-lg pr-1 text-left hover:[&>span:last-of-type]:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <WorkspaceMark color={current?.color} local={current?.local !== false} />
        {title}
        <DoubleChevron />
      </button>
      {error && <p role="alert" className="absolute left-0 top-full z-40 mt-1 w-56 rounded-md bg-menu px-2 py-1 text-[11px] text-danger shadow-lg">{error}</p>}
    </div>
  );
}

/** Where the person has been, chat by chat, so Back and Forward retrace it the way a browser does. */
const history = { entries: [] as ThreadTarget[], at: -1, listeners: new Set<() => void>() };
let snapshot = { canBack: false, canForward: false };

function publish() {
  snapshot = { canBack: history.at > 0, canForward: history.at < history.entries.length - 1 };
  for (const listener of history.listeners) listener();
}

function visit(target: ThreadTarget) {
  const here = history.entries[history.at];
  if (here && here.botId === target.botId && here.threadId === target.threadId) return;
  history.entries = [...history.entries.slice(0, history.at + 1), target].slice(-50);
  history.at = history.entries.length - 1;
  publish();
}

function useHistory() {
  return useSyncExternalStore((listener) => {
    history.listeners.add(listener);
    return () => { history.listeners.delete(listener); };
  }, () => snapshot, () => snapshot);
}

const ARROW = { back: "M19 12H5M11 6l-6 6 6 6", forward: "M5 12h14m-6-6 6 6-6 6" };

function TopIcon({ label, onClick, disabled = false, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} style={NO_DRAG} className={TOP_ICON_BUTTON}>
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}

/** Back, Forward and a new conversation with this bot, ahead of the conversation's name. */
export function MimirChatNav({ bot }: { bot: Pick<Bot, "id" | "threadId"> }) {
  const { state, dispatch } = useStore();
  const showThreads = useShowThreads();
  const { canBack, canForward } = useHistory();
  useEffect(() => { visit({ botId: bot.id, threadId: bot.threadId }); }, [bot.id, bot.threadId]);
  const go = (step: -1 | 1) => {
    const target = history.entries[history.at + step];
    if (!target) return;
    history.at += step;
    publish();
    openThread(dispatch, target, state, showThreads);
  };
  return (
    <nav aria-label={t("sidebar.aria")} className="flex shrink-0 items-center">
      <TopIcon label={t("browser.panel.back")} disabled={!canBack} onClick={() => go(-1)}><path d={ARROW.back} /></TopIcon>
      <TopIcon label={t("browser.panel.forward")} disabled={!canForward} onClick={() => go(1)}><path d={ARROW.forward} /></TopIcon>
      <TopIcon label={t("task.newShort")} onClick={() => dispatch({ type: "newTask", botId: bot.id })}><path d="M12 4v16M4 12h16" strokeWidth={1.6} /></TopIcon>
      <span aria-hidden="true" className="ml-1 mr-3 h-6 w-px shrink-0 bg-hairline" />
    </nav>
  );
}

/** Opens and closes the bot panel on the right, after the model. */
export function MimirPanelToggle() {
  const { state, dispatch } = useStore();
  const label = state.settingsOpen ? t("desktopViewer.closePanel") : t("chat.openProfile");
  return (
    <>
      <span aria-hidden="true" className="h-[25px] w-px shrink-0 bg-hairline" />
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={state.settingsOpen}
        onClick={() => dispatch({ type: "toggleSettings" })}
        style={NO_DRAG}
        className={cn(TOP_ICON_BUTTON, "w-[31px]", state.settingsOpen && "text-ink")}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round">
          <rect x="3.4" y="3" width="17.2" height="18" rx="1.4" /><path d="M13.8 3v18" />
        </svg>
      </button>
    </>
  );
}
