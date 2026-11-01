import { Crown } from "lucide-react";
import { t } from "@/lib/i18n";
import type { Bot } from "@/state/store";

export function SidebarBotRole({ role }: { role: string }) {
  return (
    <span data-testid="bot-role" className="@container -ms-1.5 min-w-0 grow">
      <span title={role} className="block truncate ps-1.5 text-[13px] font-normal leading-[18px] text-ink-secondary @max-[3rem]:sr-only">
        <span className="sr-only">, </span>{role}
      </span>
    </span>
  );
}

export function ChatHeadRole({ bot }: { bot: Pick<Bot, "title" | "chiefOfStaff"> }) {
  const role = bot.title.trim();
  const repeatsChiefBadge = bot.chiefOfStaff && role.toLocaleLowerCase() === t("chat.chiefOfStaff").toLocaleLowerCase();
  if (!role || repeatsChiefBadge) return null;
  return (
    <span data-chathead-role className="flex min-w-0 max-w-fit grow basis-0">
      <span title={role} className="max-w-[16rem] truncate text-[13px] text-ink-secondary">{role}</span>
    </span>
  );
}

/** The chief-of-staff crown, worn on the chat header's avatar rather than in a pill beside the name. */
export function ChatHeadCrown() {
  const label = t("chat.chiefOfStaff");
  return (
    <span
      title={label}
      role="img"
      aria-label={label}
      className="pointer-events-none absolute -right-1.5 -top-1.5 grid size-[15px] place-items-center text-[#b98b38] drop-shadow-[0_1px_1px_var(--color-panel)] drop-shadow-[0_0_2px_var(--color-panel)]"
    >
      <Crown size={15} strokeWidth={2.15} aria-hidden="true" />
    </span>
  );
}
