import type { ReactNode } from "react";

import { t } from "@/lib/i18n";
import { DIALOG_BUTTON, DangerButton, Dialog, PrimaryButton } from "./Dialog";

export function ConfirmDialog({ title, message, children, confirmLabel, busyLabel, busy, danger = true, onClose, onConfirm }: {
  title: string;
  message: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  busyLabel: string;
  busy: boolean;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      title={title}
      onClose={onClose}
      actions={(
        <>
          <button type="button" className={DIALOG_BUTTON} onClick={onClose} disabled={busy}>{t("workflows.dialog.back")}</button>
          {danger
            ? <DangerButton onClick={onConfirm} disabled={busy}>{busy ? busyLabel : confirmLabel}</DangerButton>
            : <PrimaryButton onClick={onConfirm} disabled={busy}>{busy ? busyLabel : confirmLabel}</PrimaryButton>}
        </>
      )}
    >
      {message}
      {children}
    </Dialog>
  );
}
