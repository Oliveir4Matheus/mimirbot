import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";

/** The execution indicator: three 3px dots with 3px between them, inside the row's single line. */
export function WorkingDots({ className }: { className?: string }) {
  return (
    <span data-testid="working-dots" role="status" aria-label={t("chat.activity.working")} title={t("chat.activity.working")}
      className={cn("flex shrink-0 items-center gap-[3px]", className)}>
      {[0, 1, 2].map((dot) => (
        <span key={dot} aria-hidden="true" className="size-[3px] animate-pulse rounded-full bg-success" style={{ animationDelay: `${dot * 160}ms` }} />
      ))}
    </span>
  );
}

/** Unread, queued or a teammate wait: the 7px dot that marks a row without adding a line. */
export function RowStatusDot({ waiting = false, tone = "accent" }: { waiting?: boolean; tone?: "accent" | "ink" }) {
  const label = waiting ? t("sidebar.preview.waiting") : t("task.unread");
  return <span data-testid={waiting ? "waiting-dot" : "unread-dot"} role="status" aria-label={label} title={label}
    className={cn("size-[7px] shrink-0 rounded-full", tone === "ink" ? "bg-ink-secondary" : "bg-accent")} />;
}
