import type { ReactNode, Ref } from "react";
import { Check, X } from "lucide-react";

import type { Bot } from "@/state/store";
import { BotAvatar } from "../Avatar";

import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";

export const BUTTON = {
  ghost: "rounded-lg px-4 py-2 text-[13px] text-ink-secondary hover:bg-control disabled:opacity-40",
  secondary: "flex items-center gap-2 rounded-lg bg-control px-4 py-2 text-[13px] text-ink hover:bg-raised-hover disabled:opacity-40",
  primary: "flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-[13px] font-medium text-accent-ink hover:brightness-110 disabled:opacity-40",
} as const;

export interface FrameTab {
  id: string;
  label: string;
  /** How many required fields this step still lacks; `done` shows a check instead. */
  missing?: number;
  done?: boolean;
  description: string;
}

export function NewBotFrame({
  dialogRef,
  title,
  who,
  hidden,
  busy,
  onClose,
  banner,
  tabs,
  activeTab,
  onTab,
  error,
  note,
  noteDone,
  actions,
  done,
  children,
}: {
  dialogRef: Ref<HTMLDivElement>;
  title: string;
  who?: ReactNode;
  hidden?: boolean;
  busy?: boolean;
  onClose: () => void;
  banner?: ReactNode;
  tabs: readonly FrameTab[];
  activeTab: string;
  onTab: (id: string) => void;
  error?: string;
  note?: ReactNode;
  noteDone?: boolean;
  actions: ReactNode;
  /** The bot now exists: the steps give way to a confirmation. */
  done?: { bot: Bot; onAnother: () => void; onStart: () => void };
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-3 sm:p-5" hidden={hidden}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-busy={busy}
        tabIndex={-1}
        className="flex h-[min(92dvh,720px)] max-h-[calc(100dvh-1.5rem)] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border border-hairline/50 bg-panel shadow-2xl outline-none sm:h-[60dvh] sm:max-h-[calc(100dvh-2.5rem)] sm:min-h-[460px]"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline/40 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <h2 className="truncate text-[17px] font-semibold text-ink">{title}</h2>
            {who}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-secondary hover:bg-control hover:text-ink disabled:opacity-40"
          >
            <X size={18} className="pointer-events-none" />
          </button>
        </div>
        {done ? <Done {...done} /> : <>
        {banner}
        <nav aria-label={t("newBot.sections")} className="flex shrink-0 gap-1 overflow-x-auto border-b border-hairline/40 p-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTab(tab.id)}
              aria-current={activeTab === tab.id ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-[13px]",
                activeTab === tab.id ? "bg-control text-ink" : "text-ink-secondary hover:bg-control/50",
              )}
            >
              {tab.label}
              {tab.done ? (
                <span aria-hidden className="flex size-[18px] items-center justify-center rounded-full bg-success text-[color:var(--color-success-ink)]"><Check size={10} strokeWidth={3.5} /></span>
              ) : tab.missing ? (
                <span aria-hidden className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-raised-hover px-1.5 text-[11px] font-semibold text-ink">{tab.missing}</span>
              ) : null}
            </button>
          ))}
        </nav>
        <div key={activeTab} className="min-h-0 min-w-0 flex-1 overflow-y-auto p-5">{children}</div>
        {error && <p role="alert" className="max-h-24 shrink-0 overflow-y-auto border-t border-hairline/40 px-5 py-3 text-[13px] text-danger">{error}</p>}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-hairline/40 px-5 pb-3 pt-2.5">
          <div className="flex w-full items-center justify-center gap-2" data-new-bot-progress>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTab(tab.id)}
                tabIndex={-1}
                aria-label={tab.description}
                aria-current={activeTab === tab.id ? "step" : undefined}
                className={cn(
                  "h-2 rounded-full transition-all motion-reduce:transition-none",
                  activeTab === tab.id ? "w-6 bg-accent" : tab.done ? "w-2 bg-success" : "w-2 bg-raised-hover hover:bg-raised",
                )}
              />
            ))}
          </div>
          <span role="status" className={cn("me-auto flex items-center gap-1.5 text-[13px]", noteDone ? "text-success" : "text-ink-secondary")}>
            {noteDone && note && <Check size={14} aria-hidden />}
            {note}
          </span>
          <div className="ms-auto flex flex-wrap items-center justify-end gap-2">{actions}</div>
        </div>
        </>}
      </div>
    </div>
  );
}

function Done({ bot, onAnother, onStart }: { bot: Bot; onAnother: () => void; onStart: () => void }) {
  const department = bot.section?.trim() || t("teamSettings.general");
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-8">
      <div data-new-bot-done className="flex max-w-[400px] flex-col items-center gap-3 text-center">
        <BotAvatar bot={bot} size={80} />
        <h3 className="text-[17px] font-semibold text-ink">{t("newBot.done.title", { name: bot.name })}</h3>
        <p className="text-[13px] leading-relaxed text-ink-secondary">{t("newBot.done.text", { name: bot.name, department })}</p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <button type="button" onClick={onAnother} className={BUTTON.secondary}>{t("newBot.done.another")}</button>
          <button type="button" onClick={onStart} className={BUTTON.primary}>{t("newBot.done.start")}</button>
        </div>
      </div>
    </div>
  );
}

export function StepHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-[17px] font-semibold text-ink">{title}</h3>
      <p className="mt-0.5 text-[13px] leading-relaxed text-ink-secondary">{subtitle}</p>
    </div>
  );
}
