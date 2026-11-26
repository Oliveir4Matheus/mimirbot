import { useEffect, useRef, type RefObject } from "react";
import { AlertTriangle, X } from "lucide-react";

import { t } from "@/lib/i18n";
import { cn } from "@/lib/cn";

export interface ProblemItem {
  path: string;
  message: string;
}

export interface StudioProblems {
  errors: ProblemItem[];
  warnings: ProblemItem[];
}

/** The refusal the server sent, or the problems the Studio already sees, in one place. */
export function StudioProblemsPanel({ problems, onOpen, onClose }: {
  problems: StudioProblems;
  onOpen: (item: ProblemItem) => void;
  onClose: () => void;
}) {
  const firstRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  const errors = problems.errors;
  const warnings = problems.warnings;
  const blocked = errors.length > 0;
  const errorTitle = errors.length === 1 ? t("studio.problems.titleOne") : t("studio.problems.title", { count: errors.length });
  const warningTitle = warnings.length === 1 ? t("studio.problems.warningsOne") : t("studio.problems.warnings", { count: warnings.length });
  return (
    <div
      className={cn("studio-problems", blocked ? "studio-problems-error" : "studio-problems-warning")}
      role="alert"
      aria-live="polite"
      aria-label={blocked ? errorTitle : warningTitle}
    >
      <div className="studio-problems-head">
        <span className="studio-problems-title">{blocked ? errorTitle : warningTitle}</span>
        <button type="button" className="studio-problems-close" aria-label={t("studio.problems.close")} onClick={onClose}>
          <X size={13} aria-hidden="true" />
        </button>
      </div>
      {blocked && (
        <div className="studio-problems-list">
          {errors.map((item, index) => (
            <ProblemRow key={`${item.path}:${index}`} item={item} first={index === 0} firstRef={firstRef} onOpen={onOpen} />
          ))}
        </div>
      )}
      {warnings.length > 0 && (
        <>
          <div className="studio-problems-subhead">
            <AlertTriangle size={11} aria-hidden="true" />
            {warningTitle}
          </div>
          <div className="studio-problems-list">
            {warnings.map((item, index) => (
              <ProblemRow
                key={`warn:${item.path}:${index}`}
                item={item}
                first={!blocked && index === 0}
                firstRef={firstRef}
                warning
                onOpen={onOpen}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ProblemRow({ item, first, warning, firstRef, onOpen }: {
  item: ProblemItem;
  first: boolean;
  warning?: boolean;
  firstRef: RefObject<HTMLDivElement | null>;
  onOpen: (item: ProblemItem) => void;
}) {
  const messageId = `problem-${warning ? "warn" : "error"}-${item.path.replace(/[^a-z0-9]+/gi, "-")}`;
  return (
    <div
      ref={first ? firstRef : undefined}
      className={cn("studio-problem", warning && "studio-problem-warning")}
      tabIndex={-1}
      aria-describedby={messageId}
    >
      <span className="studio-problem-dot" aria-hidden="true" />
      <div className="studio-problem-body">
        <span className="studio-problem-path">{item.path}</span>
        <span className="studio-problem-message" id={messageId}>{item.message}</span>
      </div>
      <button type="button" className="studio-problem-open" onClick={() => onOpen(item)}>
        {t("studio.problems.open")}
      </button>
    </div>
  );
}
