import { useState } from "react";
import { ArrowLeft, ExternalLink, RefreshCw, X } from "lucide-react";
import type { AppPreview } from "@/lib/app-preview";
import { openExternalLink } from "@/lib/app-links";
import { t } from "@/lib/i18n";
import { SiteFrame } from "./SiteFrame";

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** One published page inside the panel: its title and host, Reload, Open in browser, Back to the cards and Close. */
export function AppPreviewPanel({ preview, onBack, onClose }: { preview: AppPreview; onBack: () => void; onClose: () => void }) {
  const [attempt, setAttempt] = useState(0);
  const button = "rounded-md p-1 text-ink-secondary hover:bg-raised hover:text-ink";
  return (
    <div data-app-preview={preview.url} className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-1 px-3 py-2.5">
        <button type="button" onClick={onBack} className={button} aria-label={t("publishedApps.preview.back")} title={t("publishedApps.preview.back")}>
          <ArrowLeft size={17} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 dir="auto" className="truncate text-[14px] font-semibold text-ink" title={preview.title}>{preview.title}</h2>
          <p dir="ltr" className="truncate text-[12px] text-ink-secondary" title={preview.url}>{hostOf(preview.url)}</p>
        </div>
        <button type="button" className={button} aria-label={t("webPanels.page.reload")} title={t("webPanels.page.reload")} onClick={() => setAttempt((n) => n + 1)}>
          <RefreshCw size={16} />
        </button>
        <button type="button" className={button} aria-label={t("webPanels.page.openInBrowser")} title={t("webPanels.page.openInBrowser")}
          onClick={() => void openExternalLink(preview.url).catch(() => undefined)}>
          <ExternalLink size={16} />
        </button>
        <button type="button" className={button} aria-label={t("publishedApps.close")} title={t("publishedApps.close")} onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      <SiteFrame url={preview.url} title={preview.title} attempt={attempt} />
    </div>
  );
}
