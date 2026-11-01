import { t } from "@/lib/i18n";
import { localizedTaskTitle } from "@/lib/task-title";
import { useStore, type Bot } from "@/state/store";
import { openBotSettings } from "./bot-panel/panel-link";
import { sidebarBotActivityTasks } from "./SidebarBotActivity";

/** Simple mode's "Conversation": the open conversation's title, in the tray fused to the header's bottom edge. */
export function ChatHeadConversation({ bot }: { bot: Bot }) {
  const { state, dispatch } = useStore();
  const task = bot.tasks?.find((candidate) => candidate.threadId === bot.threadId);
  if (!task) return null;
  const elsewhere = sidebarBotActivityTasks(bot, state.pendingQueued).filter((other) => other.threadId !== bot.threadId).length;
  const title = localizedTaskTitle(task.title || t("task.newShort"));
  return (
    <div className="conversation-submenu" title={title}>
      {/* One continuous line with the header: the fill masks the border it crosses, the stroke curves away from it. */}
      <svg className="conversation-submenu-outline" viewBox="0 0 298 41" preserveAspectRatio="none" aria-hidden="true">
        <path className="conversation-submenu-surface" d="M0 -4 H298 V0 C278 0 271 7 271 18 V27 Q271 40 257 40 H41 Q27 40 27 27 V18 C27 7 20 0 0 0 Z" />
        <path className="conversation-submenu-stroke" d="M0 0 C20 0 27 7 27 18 V27 Q27 40 41 40 H257 Q271 40 271 27 V18 C271 7 278 0 298 0" />
      </svg>
      <svg className="conversation-submenu-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 5.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-4.5 3v-3H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
      <button
        type="button"
        data-chathead-conversation
        title={t("chat.showConversations", { name: bot.name })}
        onClick={() => openBotSettings(dispatch, "overview", { tab: "conversations" })}
        className="conversation-submenu-title"
      >
        <span dir="auto" className="truncate">{title}</span>
        {elsewhere > 0 && (
          <span role="img" aria-label={t("task.otherActivity", { count: elsewhere })} className="conversation-submenu-dot" />
        )}
      </button>
    </div>
  );
}
