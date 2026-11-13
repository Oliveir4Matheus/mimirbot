import { useEffect, useId, useRef, type ReactNode } from "react";

import { useModalDialog } from "@/hooks/use-modal-dialog";
import { cn } from "@/lib/cn";

export const DIALOG_BUTTON = "flex h-[34px] items-center justify-center rounded-[9px] border border-hairline px-3.5 text-[11.5px] font-medium text-ink-secondary hover:bg-raised/60 disabled:cursor-not-allowed disabled:opacity-50";

export function Dialog({ title, children, actions, onClose }: {
  title: string;
  children: ReactNode;
  actions: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalDialog(ref, onClose);
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>("select:not([disabled]), input:not([disabled]), button:not([disabled])");
    first?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#1D20273D] p-5"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="w-full max-w-[450px] rounded-[15px] bg-app p-[22px] shadow-2xl outline-none">
        <h2 id={titleId} className="text-[17px] font-[650] leading-snug tracking-[-0.3px] text-ink">{title}</h2>
        <div className="mt-4 text-[11.5px] leading-[1.65] text-ink-secondary">{children}</div>
        <div className="mt-6 flex justify-end gap-2">{actions}</div>
      </div>
    </div>
  );
}

export function DangerButton({ children, onClick, disabled, className }: { children: ReactNode; onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn("flex h-[34px] items-center justify-center rounded-[9px] border border-danger/40 px-3.5 text-[11.5px] font-medium text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50", className)}
    >
      {children}
    </button>
  );
}

export function PrimaryButton({ children, onClick, disabled, className }: { children: ReactNode; onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn("flex h-[34px] items-center justify-center rounded-[9px] bg-[#28282D] px-3.5 text-[11.5px] font-medium text-white hover:bg-[#414148] disabled:cursor-not-allowed disabled:opacity-50", className)}
    >
      {children}
    </button>
  );
}
