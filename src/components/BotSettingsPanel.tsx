import { ChevronLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { useStore, type Bot } from "@/state/store";
import { BotSettingsDialog } from "./lazy-screens";

export const BOT_PANEL_ID = "bot-settings-drawer";

const SLIDE = "duration-300 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:duration-0";

/**
 * The right panel's retracting shell. The drawer slides out of the window and
 * the handle it was opened with stays in reach, so the same button opens and
 * closes it; the panel keeps its place, its scroll and its unsaved drafts while
 * it is away.
 */
export function BotSettingsPanel({ bot, overlay }: { bot: Bot; overlay: boolean }) {
  const { state, dispatch } = useStore();
  const open = state.settingsOpen;
  const [opened, setOpened] = useState(open);
  const drawerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);

  // The content mounts with the first expansion and stays mounted, collapsed
  // and inert, so reopening lands where the panel was left.
  if (open && !opened) setOpened(true);

  useEffect(() => {
    if (open) return;
    const focused = document.activeElement;
    if (focused && focused !== handleRef.current && drawerRef.current?.contains(focused)) handleRef.current?.focus();
  }, [open]);

  const label = t(open ? "botPanel.collapse" : "botPanel.expand");
  // A panel beside it leaves the drawer nowhere to slide to, and sliding across that panel
  // would read as the menu being drawn over it, so it leaves in the frame it was closed.
  const noRoom = !open && (state.computerOpen || state.inspectorOpen);

  return (
    <div
      data-bot-settings-shell=""
      data-bot-settings-open={open ? "true" : "false"}
      className={cn(
        "max-md:contents",
        overlay
          ? "md:absolute md:inset-y-0 md:right-0 md:z-40"
          : "md:relative md:z-40 md:h-full md:shrink-0",
        open ? "md:w-[min(420px,42vw)]" : "md:w-0",
      )}
    >
      <div
        ref={drawerRef}
        id={BOT_PANEL_ID}
        data-bot-settings-drawer=""
        className={cn(
          "absolute inset-0 md:inset-y-0 md:left-auto md:right-0 md:w-[min(420px,42vw)]",
          // Parked, the drawer sits over the panel beside it, so it is hidden once it has slid
          // out; `visibility` keeps it painted for the slide and flips after it.
          noRoom ? "transition-none" : "transition-[translate,visibility]",
          SLIDE,
          open ? "translate-x-0" : "pointer-events-none invisible translate-x-full",
        )}
      >
        {opened && <BotSettingsDialog bot={bot} overlay={overlay} open={open} />}
        <button
          ref={handleRef}
          type="button"
          data-bot-settings-handle=""
          aria-controls={BOT_PANEL_ID}
          aria-expanded={open}
          aria-label={label}
          title={label}
          onClick={() => dispatch({ type: "toggleSettings", open: !open })}
          className={cn(
            // `visible`: the handle is the way back in, so it stays painted while the drawer is hidden.
            "pointer-events-auto visible absolute right-full top-1/2 z-50 flex h-[62px] w-[16px] -translate-y-1/2 items-center justify-center rounded-l-[10px] border border-r-0 shadow-[-2px_2px_12px_rgb(0_0_0/0.06)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
            open
              ? "border-hairline/60 bg-panel text-ink-tertiary hover:bg-raised hover:text-ink"
              : "border-hairline bg-accent/10 text-ink-secondary hover:bg-accent/20 hover:text-ink",
          )}
        >
          <ChevronLeft
            size={13}
            strokeWidth={2.25}
            aria-hidden="true"
            className={cn("transition-transform", SLIDE, open && "rotate-180")}
          />
        </button>
      </div>
    </div>
  );
}
