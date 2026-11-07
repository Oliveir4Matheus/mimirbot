import { cn } from "@/lib/cn";
/** One line, 43px tall on a desktop; the smaller screens shrink it with the rest of the row. */
export const BOT_ROW_HEIGHT = "h-[43px] max-md:h-[38px]";
export const BOT_ROW_GAP = "gap-[10px] max-md:gap-2";
export const BOT_ROW_PADDING = "pl-[9px] pr-[30px] max-md:pl-2 max-md:pr-[27px]";

/** The selectable container around one bot or room: the compact single line both densities share. */
export function botRowClass({ iconOnly, railTile, showThreads, selected }: {
  iconOnly: boolean;
  railTile: boolean;
  showThreads: boolean;
  selected: boolean;
}): string {
  return cn(
    "flex w-full items-center rounded-lg text-left outline-none transition-colors duration-150 focus-visible:ring-1 focus-visible:ring-accent/60",
    iconOnly
      ? railTile ? "h-[52px] justify-center" : "justify-center px-1 py-1.5"
      : cn(BOT_ROW_HEIGHT, BOT_ROW_GAP, showThreads ? "pl-6 max-md:pl-6 pr-[30px] max-md:pr-[27px]" : BOT_ROW_PADDING),
    selected ? "bg-raised shadow-[0_1px_2px_rgb(0_0_0/0.10)]" : "hover:bg-raised/50",
  );
}
