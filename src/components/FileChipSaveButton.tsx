import { Check, Download, LoaderCircle, RotateCcw } from "lucide-react";

import { t } from "@/lib/i18n";

export function FileChipSaveButton({ name, state, retryable, onSave }: {
  name: string;
  state: "idle" | "saving" | "saved" | "failed";
  retryable: boolean;
  onSave: () => void;
}) {
  const failed = state === "failed";
  return (
    <button
      type="button"
      onClick={onSave}
      disabled={state === "saving"}
      aria-label={retryable ? t("attach.retrySaveAria", { name }) : t("attach.saveAria", { name })}
      title={t("attach.download")}
      className="table-action shrink-0 disabled:cursor-wait"
    >
      {state === "saving" ? (
        <LoaderCircle size={13} className="shrink-0 animate-spin" aria-hidden="true" />
      ) : state === "saved" ? (
        <Check size={13} className="shrink-0 text-success" aria-hidden="true" />
      ) : failed ? (
        retryable && <RotateCcw size={13} className="shrink-0 text-danger" aria-hidden="true" />
      ) : (
        <Download size={13} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
      )}
    </button>
  );
}
