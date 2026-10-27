import { useEffect, useRef, useState } from "react";

import { APP_NAME, RELEASES_URL, appVersion, openExternalLink } from "@/lib/app-links";
import { activeLocale, t } from "@/lib/i18n";
import { welcomeOnScreen } from "@/lib/onboarding";
import type { ReleaseNotes } from "@/lib/release-notes";
import { readSeenVersion, whatsNewDecision, writeSeenVersion } from "@/lib/whats-new";
import { useStore } from "@/state/store";

export function WhatsNewDialog() {
  const { state } = useStore();
  const [notes, setNotes] = useState<ReleaseNotes | null>(null);
  const decided = useRef(false);
  const onboarding = state.config?.onboarding;

  useEffect(() => {
    if (decided.current || !onboarding || welcomeOnScreen()) return;
    decided.current = true;
    const decision = whatsNewDecision({ lastSeen: readSeenVersion(), current: appVersion(), onboarded: Boolean(onboarding.completedAt), locale: activeLocale() });
    if (decision.kind === "show") setNotes(decision.notes);
    else if (decision.kind === "baseline") writeSeenVersion(appVersion());
  }, [onboarding]);

  const close = () => {
    writeSeenVersion(appVersion());
    setNotes(null);
  };

  if (!notes) return null;
  return <WhatsNewCard notes={notes} onClose={close} />;
}

function WhatsNewCard({ notes, onClose }: { notes: ReleaseNotes; onClose: () => void }) {
  const doneRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    doneRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        data-whats-new
        className="animate-pop-in w-full max-w-[420px] rounded-2xl border border-hairline/50 bg-panel p-6 shadow-2xl shadow-black/50"
      >
        <h2 id="whats-new-title" className="text-[17px] font-semibold leading-6 text-ink">{t("update.card.whatsNew")}</h2>
        <p className="text-[13px] leading-5 text-ink-secondary">{`${APP_NAME} ${appVersion()}`}</p>
        <NoteSection title={t("whatsNew.features")} lines={notes.features} />
        <NoteSection title={t("whatsNew.fixes")} lines={notes.fixes} />
        <button
          type="button"
          onClick={() => void openExternalLink(RELEASES_URL)}
          className="mt-4 block text-[13px] font-medium leading-5 text-accent hover:underline"
        >
          {t("update.card.allNotes")}
        </button>
        <button
          ref={doneRef}
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-raised px-4 py-2 text-[13px] font-medium text-ink hover:brightness-110"
        >
          {t("whatsNew.done")}
        </button>
      </div>
    </div>
  );
}

function NoteSection({ title, lines }: { title: string; lines: string[] }) {
  if (!lines.length) return null;
  return (
    <div className="mt-5">
      <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">{title}</h3>
      <ul className="mt-2 space-y-2">
        {lines.map((line) => (
          <li key={line} className="flex gap-2.5 text-[14px] leading-5 text-ink">
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
            <span className="min-w-0">{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
