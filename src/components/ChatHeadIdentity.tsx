import { ChevronRight } from "lucide-react";
import type { Dispatch } from "react";

import { BotAvatar } from "./Avatar";
import { ChatHeadCrown } from "./BotRole";
import { RenameTitle } from "./RenameTitle";
import { api, type Action, type Bot } from "@/state/store";
import { stateForBot, type MausMotion } from "@/lib/mascot";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";

const CHATHEAD_PILL = "flex min-w-0 items-center gap-2.5 rounded-lg py-0.5 pl-1 text-ink";
const NAME = "min-w-0 max-w-[235px] truncate text-[13px] font-[650] tracking-[-0.18px] text-ink";

/** Who this conversation is with: the bot's avatar and name, either opening the panel or renaming in place. */
export function ChatHeadIdentity({ bot, advanced, messages, mascotMotion, headerAnimated, dispatch }: {
  bot: Bot;
  advanced: boolean;
  messages: Bot["messages"];
  mascotMotion: { kind: Exclude<MausMotion, "none">; nonce: number } | null;
  headerAnimated: boolean;
  dispatch: Dispatch<Action>;
}) {
  const avatar = (
    <BotAvatar bot={bot} state={stateForBot({ ...bot, messages })} size={34}
      motion={mascotMotion?.kind ?? "none"} motionKey={mascotMotion?.nonce ?? 0} animated={headerAnimated} />
  );
  if (advanced) {
    return (
      <div data-chathead-pill className={cn(CHATHEAD_PILL, "pr-1")}>
        <button
          type="button"
          onClick={() => dispatch({ type: "toggleSettings", open: true })}
          className="relative grid size-[35px] shrink-0 place-items-center"
          title={t("chat.openProfile")}
          aria-label={t("chat.openProfileAria", { name: bot.name })}
        >
          {avatar}
          {bot.chiefOfStaff && <ChatHeadCrown />}
        </button>
        <RenameTitle
          value={bot.name}
          onCommit={(name) => {
            if (window.ogb?.remoteClient?.active) {
              void api(`/api/bots/${bot.id}/profile`, { method: "PATCH", body: JSON.stringify({ name }) })
                .then(({ bot: updated }) => dispatch({ type: "botPatched", bot: updated }))
                .catch((cause) => dispatch({ type: "error", message: cause instanceof Error ? cause.message : String(cause) }));
            } else {
              dispatch({ type: "updateBot", botId: bot.id, patch: { name } });
            }
          }}
          onActivate={() => dispatch({ type: "toggleSettings", open: true })}
          showEditButton
          className="truncate text-[13px] font-[650] tracking-[-0.18px] text-ink"
          editButtonClassName="size-6 rounded-full"
          inputClassName="max-w-[220px] rounded-full bg-inset px-2 py-0.5 text-[13px] font-[650]"
        />
      </div>
    );
  }
  return (
    <button
      type="button"
      data-chathead-pill data-tour="bot-pill"
      onClick={() => dispatch({ type: "toggleSettings", open: true })}
      title={t("chat.openProfile")}
      aria-label={t("chat.openProfileAria", { name: bot.name })}
      className={cn(CHATHEAD_PILL, "group gap-2.5 rounded-[11px] py-0.5 pl-1 pr-2 hover:bg-raised-hover")}
    >
      <span className="relative grid size-[35px] shrink-0 place-items-center">
        {avatar}
        {bot.chiefOfStaff && <ChatHeadCrown />}
      </span>
      <span className={NAME}>{bot.name}</span>
      <ChevronRight size={13} aria-hidden="true" className="-ml-1 w-0 shrink-0 text-ink-tertiary opacity-0 transition-[width,margin,opacity] duration-150 group-hover:ml-0 group-hover:w-[13px] group-hover:opacity-100 group-focus-visible:ml-0 group-focus-visible:w-[13px] group-focus-visible:opacity-100" />
    </button>
  );
}
