import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { t } from "@/lib/i18n";
import type { Bot } from "@/state/store";
import { BotConversations } from "./bot-panel/Conversations";

/** Every conversation with one bot, over the chat: picking one opens it and closes this. */
export function ConversationsModal({ bot, onClose }: { bot: Bot; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("chat.conversationsWith", { name: bot.name })}
        data-conversations-modal
        className="animate-pop-in relative flex max-h-[min(640px,85vh)] w-full max-w-[520px] flex-col rounded-2xl border border-hairline/50 bg-panel p-5 shadow-2xl shadow-black/50"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="min-w-0 truncate text-[17px] font-semibold leading-6 text-ink">{t("chat.conversationsWith", { name: bot.name })}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("chat.conversationsClose")}
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-ink-secondary hover:bg-control hover:text-ink"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <BotConversations bot={bot} modal={{ onDone: onClose }} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
