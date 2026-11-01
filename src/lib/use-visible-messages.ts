import { useMemo } from "react";
import { visibleMessages, type Bot, type Message } from "@/state/store";

/** The bot's messages along the path it currently shows, recomputed only when either changes. */
export function useVisibleMessages(bot: Bot): Message[] {
  const { messages, activeLeafId } = bot;
  return useMemo(() => visibleMessages({ messages, activeLeafId }), [messages, activeLeafId]);
}
