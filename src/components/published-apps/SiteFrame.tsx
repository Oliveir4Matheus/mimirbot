import { openExternalLink } from "@/lib/app-links";
import { t } from "@/lib/i18n";
import { SITE_FRAME_ALLOW, SITE_FRAME_SANDBOX, showable } from "@/lib/published-apps";

/** A published page, live, in a sandboxed frame; when it cannot be shown here (not a plain web address, or on the app's
 * own origin), a line saying so and Open in browser. */
export function SiteFrame({ url, title, attempt = 0 }: { url: string; title: string; attempt?: number }) {
  if (!showable(url, window.location.origin)) {
    return (
      <div data-app-preview-fallback="" className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-[14px] font-medium text-ink">{t("publishedApps.preview.cantShow")}</p>
        <p className="max-w-sm text-[13px] text-ink-secondary">{t("publishedApps.preview.cantShowBody")}</p>
        <button type="button" className="ui-button ui-button-primary" onClick={() => void openExternalLink(url).catch(() => undefined)}>
          {t("webPanels.page.openInBrowser")}
        </button>
      </div>
    );
  }
  return (
    <iframe
      key={`${url}:${attempt}`}
      data-app-preview-frame=""
      src={url}
      title={title}
      sandbox={SITE_FRAME_SANDBOX}
      allow={SITE_FRAME_ALLOW}
      referrerPolicy="no-referrer"
      className="min-h-0 w-full flex-1 border-0 bg-white"
    />
  );
}
