import { useState } from "react";
import { ArrowUpRight, Check, Copy, Eye, Trash2 } from "lucide-react";
import type { PublishedApp } from "../../../shared/published-apps";
import { cn } from "@/lib/cn";
import { useCopyFeedback } from "@/lib/copy-text";
import { t } from "@/lib/i18n";
import { relativeTime } from "@/lib/memory";
import { ConfirmDialog } from "../ConfirmDialog";
import { ASK_CHIP, ASK_CHIP_IDLE } from "../AskCard";

/** One live page: its title, link, bot and date, with Preview, Open, Copy link and Delete. Delete asks first and only
 * removes the row once the server answered; a refusal shows the server's own message and keeps the row. */
export function PublishedAppCard({ app, onPreview, onOpen, onDelete }: {
  app: PublishedApp;
  onPreview: () => void;
  onOpen: (url: string) => void;
  /** Resolves with the server's message when deleting failed, or null once it is gone. */
  onDelete: () => Promise<string | null>;
}) {
  const { state: copied, copy } = useCopyFeedback(app.url);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const facts = [app.bot.name, relativeTime(app.publishedAt)].filter(Boolean).join(" · ");
  const confirmDelete = async () => {
    setDeleting(true);
    const failed = await onDelete();
    setDeleting(false);
    setConfirming(false);
    setProblem(failed);
  };
  return (
    <li data-published-app={app.id} className="rounded-xl border border-hairline/40 bg-card p-3">
      <h2 dir="auto" className="truncate text-[14px] font-semibold text-ink" title={app.title}>{app.title}</h2>
      {facts && <p dir="auto" className="mt-0.5 truncate text-[12px] text-ink-secondary">{facts}</p>}
      <a href={app.url} dir="ltr" onClick={(event) => { event.preventDefault(); onOpen(app.url); }}
        className="mt-1 block truncate text-[12px] text-accent-text hover:underline" title={app.url}>{app.url}</a>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button type="button" onClick={onPreview} aria-label={t("publishedApps.card.previewOf", { name: app.title })} className={cn(ASK_CHIP, ASK_CHIP_IDLE)}>
          <Eye size={14} aria-hidden="true" />{t("publishedApps.card.preview")}
        </button>
        <button type="button" onClick={() => onOpen(app.url)} className={cn(ASK_CHIP, ASK_CHIP_IDLE)}>
          <ArrowUpRight size={14} aria-hidden="true" />{t("chat.page.open")}
        </button>
        <button type="button" onClick={copy} aria-label={t("chat.page.copyLink")} className={cn(ASK_CHIP, ASK_CHIP_IDLE)}>
          {copied === "copied" ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {t(copied === "copied" ? "chat.page.copied" : "chat.page.copyLink")}
        </button>
        <button type="button" onClick={() => { setProblem(null); setConfirming(true); }}
          aria-label={t("publishedApps.card.deleteOf", { name: app.title })} className={cn(ASK_CHIP, ASK_CHIP_IDLE, "text-danger")}>
          <Trash2 size={14} aria-hidden="true" />{t("common.delete")}
        </button>
      </div>
      {problem && <p role="alert" className="mt-1.5 text-[12px] leading-snug text-danger">{problem}</p>}
      <ConfirmDialog open={confirming} title={t("publishedApps.delete.title", { name: app.title })} body={t("publishedApps.delete.body")}
        confirmLabel={t("common.delete")} cancelLabel={t("common.cancel")} tone="danger" pending={deleting}
        onCancel={() => { if (!deleting) setConfirming(false); }} onConfirm={() => void confirmDelete()} />
    </li>
  );
}
