import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

import { APP_NAME, RELEASES_URL, appVersion, openExternalLink } from "@/lib/app-links";
import { useModalDialog } from "@/hooks/use-modal-dialog";
import { activeLocale, t } from "@/lib/i18n";
import { welcomeOnScreen } from "@/lib/onboarding";
import type { FeatureNote, ReleaseNotes } from "@/lib/release-notes";
import { readSeenVersion, whatsNewDecision, writeSeenVersion } from "@/lib/whats-new";
import { useStore } from "@/state/store";

export type ShownRelease = { version: string; date: string; notes: ReleaseNotes };

export function WhatsNewDialog() {
  const { state } = useStore();
  const [shown, setShown] = useState<ShownRelease | null>(null);
  const decided = useRef(false);
  const onboarding = state.config?.onboarding;

  useEffect(() => {
    if (decided.current || !onboarding || welcomeOnScreen()) return;
    decided.current = true;
    const decision = whatsNewDecision({ lastSeen: readSeenVersion(), current: appVersion(), onboarded: Boolean(onboarding.completedAt), locale: activeLocale() });
    if (decision.kind === "show") setShown({ version: decision.version, date: decision.date, notes: decision.notes });
    else if (decision.kind === "baseline") writeSeenVersion(appVersion());
  }, [onboarding]);

  const close = () => {
    writeSeenVersion(appVersion());
    setShown(null);
  };

  if (!shown) return null;
  return <WhatsNewScreen shown={shown} onClose={close} />;
}

export function WhatsNewScreen({ shown, onClose }: { shown: ShownRelease; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(100);
  const [atEnd, setAtEnd] = useState(true);
  useModalDialog(dialogRef, onClose);

  const measure = useCallback(() => {
    const body = bodyRef.current;
    if (!body) return;
    const max = body.scrollHeight - body.clientHeight;
    setProgress(max > 0 ? Math.round((body.scrollTop / max) * 100) : 100);
    setAtEnd(max <= 0 || body.scrollTop >= max - 6);
  }, []);

  useLayoutEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 backdrop-blur-[2px] sm:p-6"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        aria-describedby="whats-new-version"
        data-whats-new
        tabIndex={-1}
        className="animate-pop-in flex max-h-[min(900px,calc(100dvh-1.5rem))] w-full max-w-[1048px] flex-col overflow-hidden rounded-2xl border border-hairline/50 bg-panel text-ink shadow-2xl shadow-black/50 outline-none"
      >
        <header className="relative flex flex-none items-center gap-[13px] border-b border-hairline px-6 py-3.5 pe-[68px]">
          <img src="/app-icon.svg" alt="" width={40} height={40} className="size-10 shrink-0 rounded-[13px] border border-hairline/60 bg-card p-1" />
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-accent-text">
              <span aria-hidden className="size-1.5 rounded-full bg-accent ring-4 ring-accent/20" />
              {t("update.card.whatsNew")}
            </p>
            <h2 id="whats-new-title" className="mt-1 text-[22px] font-semibold leading-[1.16] tracking-[-0.02em]">
              {t("whatsNew.title", { app: APP_NAME })}
            </h2>
            <p id="whats-new-version" className="mt-0.5 text-[13.5px] leading-[1.4] text-ink-secondary">
              {t("whatsNew.version", { version: shown.version })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="absolute end-3.5 top-3 grid size-[30px] place-items-center rounded-full text-ink-secondary hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <X size={15} />
          </button>
          <div aria-hidden className="absolute inset-x-0 -bottom-px h-0.5">
            <div className="h-full bg-accent transition-[width] duration-100 ease-linear" style={{ width: `${progress}%` }} />
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={bodyRef}
            data-whats-new-scroll
            tabIndex={0}
            onScroll={measure}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-7 pb-7 pt-2 outline-none [scrollbar-color:var(--color-hairline)_transparent] [scrollbar-width:thin]"
          >
            <ReleaseEntry shown={shown} />
          </div>
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-x-px bottom-0 h-9 bg-gradient-to-b from-transparent to-panel transition-opacity ${atEnd ? "opacity-0" : "opacity-100"}`}
          />
        </div>

        <footer className="flex flex-none items-center gap-3 border-t border-hairline bg-panel/80 px-7 py-4 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => void openExternalLink(RELEASES_URL)}
            className="text-[13.5px] font-medium text-accent-text hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {t("update.card.allNotes")}
          </button>
          <span className="text-[12px] text-ink-tertiary">{atEnd ? t("whatsNew.escapeHint") : t("whatsNew.scrollHint")}</span>
          <button
            type="button"
            onClick={onClose}
            className="ms-auto rounded-[11px] bg-accent px-5 py-2.5 text-[14px] font-semibold text-accent-ink transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
          >
            {t("whatsNew.done")}
          </button>
        </footer>
      </div>
    </div>
  );
}

function ReleaseEntry({ shown }: { shown: ShownRelease }) {
  const { version, date, notes } = shown;
  return (
    <section className="relative border-s border-hairline pb-1.5 pl-6 pt-5">
      <span
        aria-hidden
        className="absolute -start-[5px] top-[30px] size-[9px] rounded-full border-2 border-panel bg-accent ring-4 ring-accent/15"
      />
      <Reveal>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[17px] font-semibold tabular-nums tracking-[-0.01em]">{version}</span>
          <span className="text-[13px] text-ink-tertiary">{formatReleaseDate(date)}</span>
          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-accent-text">
            {t("whatsNew.latest")}
          </span>
        </div>
        {notes.lead && <p className="mb-4 mt-1 max-w-[72ch] text-[14.5px] leading-[1.55] text-ink-secondary">{notes.lead}</p>}
      </Reveal>

      {notes.features.map((feature, index) => (
        <Reveal key={`${feature.title}-${index}`} delay={(index + 1) * 40} className="mt-6">
          <FeatureEntry feature={feature} />
        </Reveal>
      ))}

      {notes.fixes.length > 0 && (
        <Reveal delay={(notes.features.length + 1) * 40} className="mt-[18px] border-t border-dashed border-hairline pt-3.5">
          <ul className="grid gap-[7px]">
            {notes.fixes.map((fix, index) => (
              <li key={`${fix}-${index}`} className="flex gap-2 text-[13.5px] leading-[1.5] text-ink-secondary">
                <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-hairline" />
                <span className="min-w-0">{fix}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      )}
    </section>
  );
}

function FeatureEntry({ feature }: { feature: FeatureNote }) {
  return (
    <article>
      <h3 className="text-[16.5px] font-semibold leading-[1.35] tracking-[-0.005em]">{feature.title}</h3>
      <p className="mt-1.5 max-w-[72ch] text-[14.5px] leading-[1.55] text-ink-secondary">{feature.body}</p>
      {feature.shot && (
        <figure className="mt-3.5 overflow-hidden rounded-[14px] border border-hairline bg-app">
          <img src={feature.shot.src} alt="" className="block w-full" />
          <figcaption className="border-t border-hairline bg-panel px-3.5 pb-3 pt-2 text-[12px] leading-[1.45] text-ink-tertiary">
            {feature.shot.caption}
          </figcaption>
        </figure>
      )}
    </article>
  );
}

/** Content rises once as it enters the scroll area; the app's motion ceiling does not apply to a first sight. */
function Reveal({ delay = 0, className = "", children }: { delay?: number; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setSeen(true);
        observer.disconnect();
      },
      { root: node.closest("[data-whats-new-scroll]"), rootMargin: "0px 0px -28px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: seen ? `${delay}ms` : undefined }}
      className={`transition duration-500 ease-out motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none ${seen ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"} ${className}`}
    >
      {children}
    </div>
  );
}

function formatReleaseDate(date: string): string {
  const day = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(day.getTime())) return date;
  return new Intl.DateTimeFormat(activeLocale(), { day: "numeric", month: "short", year: "numeric" }).format(day);
}
