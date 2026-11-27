import { useCallback, useEffect, useRef, useState } from "react";
import { Globe, RefreshCw, X } from "lucide-react";
import type { PublishedApp } from "../../../shared/published-apps";
import { previewPublishedApp, showPublishedAppsList, useAppPreview } from "@/lib/app-preview";
import { openExternalLink } from "@/lib/app-links";
import { t } from "@/lib/i18n";
import { deletePublishedApp, listPublishedApps } from "@/lib/published-apps";
import { ApiError } from "@/state/api";
import { useStore, type Bot } from "@/state/store";
import { AppPreviewPanel } from "./AppPreviewPanel";
import { PublishedAppCard } from "./PublishedAppCard";

/** The live pages this server published, beside the chat; Preview swaps the cards for one page in a sandboxed frame. */
export function PublishedAppsPanel({ bot }: { bot: Bot }) {
  const { dispatch } = useStore();
  const preview = useAppPreview();
  const [apps, setApps] = useState<PublishedApp[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadAbort = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    loadAbort.current?.abort();
    const controller = new AbortController();
    loadAbort.current = controller;
    setError(null);
    try {
      const next = await listPublishedApps(controller.signal);
      if (!controller.signal.aborted) setApps(next);
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (loadAbort.current === controller) loadAbort.current = null;
    }
  }, []);

  useEffect(() => {
    void load();
    return () => loadAbort.current?.abort();
  }, [load]);

  const close = () => {
    showPublishedAppsList();
    dispatch({ type: "togglePublishedApps", open: false });
  };
  const open = (url: string) => void openExternalLink(url).catch(() => undefined);
  const remove = async (app: PublishedApp): Promise<string | null> => {
    try {
      await deletePublishedApp(app.id);
    } catch (e) {
      return e instanceof ApiError ? e.message : t("publishedApps.delete.failed");
    }
    setApps((current) => current?.filter((one) => one.id !== app.id) ?? current);
    return null;
  };
  const button = "rounded-md p-1 text-ink-secondary hover:bg-raised hover:text-ink";

  return (
    <aside aria-label={t("publishedApps.panel.aria", { name: bot.name })} data-published-apps-panel
      className="animate-panel-in flex h-full w-[400px] max-w-full shrink-0 flex-col border-l border-hairline/40 bg-panel max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-30">
      {preview.mode === "preview" ? (
        <AppPreviewPanel preview={preview} onBack={showPublishedAppsList} onClose={close} />
      ) : (
        <>
          <header className="flex items-center justify-between px-4 py-3">
            <span className="flex min-w-0 items-center gap-2 text-[15px] font-semibold text-ink">
              <Globe size={16} className="shrink-0 text-ink-secondary" aria-hidden="true" />
              <span className="truncate">{t("publishedApps.title")}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={() => void load()} className={button} aria-label={t("publishedApps.reload")} title={t("publishedApps.reload")}>
                <RefreshCw size={14} />
              </button>
              <button type="button" onClick={close} className={button} aria-label={t("publishedApps.close")} title={t("publishedApps.close")}>
                <X size={18} />
              </button>
            </span>
          </header>
          <p className="border-b border-hairline/40 px-4 pb-3 text-[12px] text-ink-secondary">
            {t("publishedApps.subtitle")}
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto" data-published-apps={apps ? apps.length : "loading"}>
            {error && !apps ? (
              <section role="alert" className="px-4 py-6 text-center">
                <p className="text-[13px] text-danger">{t("publishedApps.loadFailed")}</p>
                <button type="button" className="ui-button mt-3" onClick={() => void load()}>{t("common.tryAgain")}</button>
              </section>
            ) : apps && apps.length === 0 ? (
              <section className="px-4 py-10 text-center">
                <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                  <Globe size={20} aria-hidden="true" />
                </div>
                <h2 className="text-[14px] font-semibold text-ink">{t("publishedApps.empty.title")}</h2>
                <p className="mx-auto mt-1 max-w-[17rem] text-[13px] leading-snug text-ink-secondary">{t("publishedApps.empty.body")}</p>
              </section>
            ) : apps ? (
              <ul aria-label={t("publishedApps.title")} className="flex flex-col gap-2 p-3">
                {apps.map((app) => (
                  <PublishedAppCard key={app.id} app={app} onOpen={open}
                    onPreview={() => previewPublishedApp({ url: app.url, title: app.title })} onDelete={() => remove(app)} />
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-[13px] text-ink-secondary">{t("publishedApps.loading")}</p>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
