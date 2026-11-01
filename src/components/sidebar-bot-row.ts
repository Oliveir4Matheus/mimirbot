import { cn } from "@/lib/cn";
import type { SidebarDensity } from "@/lib/sidebar-preferences";

/** Advanced's comfortable row was 54px; both it and Simple share this height. */
export const BOT_ROW_MIN_HEIGHT = "min-h-[69px]";

/** The selectable container around one bot: the prototype's card in Simple mode, the
 *  denser row everywhere else. */
export function botRowClass({ density, iconOnly, railTile, simpleRow, showThreads, selected }: {
  density: SidebarDensity;
  iconOnly: boolean;
  railTile: boolean;
  simpleRow: boolean;
  showThreads: boolean;
  selected: boolean;
}): string {
  return cn(
    "flex w-full items-center rounded-xl text-left outline-none transition-colors duration-150 focus-visible:ring-1 focus-visible:ring-accent/60",
    iconOnly
      ? railTile ? "h-[52px] justify-center" : "justify-center px-1 py-1.5"
      : density === "compact"
        ? cn(showThreads ? "gap-1.5 py-1" : "gap-2.5 py-1.5", showThreads ? "pl-6 pr-9 group-hover:pr-[5.75rem] group-focus-within:pr-[5.75rem] max-md:pr-9 touch:pr-[5.75rem]" : "pl-2 pr-9")
        : simpleRow ? cn(BOT_ROW_MIN_HEIGHT, "gap-2.5 py-0 pl-2", selected ? "pr-9" : "pr-3 group-hover:pr-9 group-focus-within:pr-9 max-md:pr-9 touch:pr-9")
        : cn(BOT_ROW_MIN_HEIGHT, showThreads ? "gap-2 py-2" : "gap-3 py-2", showThreads ? "pl-6 pr-9 group-hover:pr-[5.75rem] group-focus-within:pr-[5.75rem] max-md:pr-9 touch:pr-[5.75rem]" : "pl-2.5 pr-9"),
    !iconOnly && "max-md:rounded-2xl max-md:py-2.5",
    simpleRow
      ? selected
        ? "bg-app shadow-[0_2px_10px_rgb(27_41_58/0.055),0_1px_2px_rgb(27_41_58/0.045)] ring-1 ring-hairline"
        : "hover:bg-raised/40 active:bg-raised/60"
      : selected ? "bg-raised shadow-[0_1px_2px_rgb(0_0_0/0.10)]" : "hover:bg-raised/50",
  );
}
