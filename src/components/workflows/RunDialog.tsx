import { useState } from "react";

import type { WorkflowDefinition } from "../../../shared/workflow";
import { t } from "@/lib/i18n";
import { formatDateTime } from "@/lib/workflow-format";
import { DIALOG_BUTTON, Dialog, PrimaryButton } from "./Dialog";

export function RunDialog({ workflow, versions, initialVersion, busy, onClose, onConfirm }: {
  workflow: WorkflowDefinition;
  versions: WorkflowDefinition[];
  initialVersion?: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: (version: number) => void;
}) {
  const [version, setVersion] = useState(initialVersion ?? workflow.version);
  const options = versions.length > 0 ? versions : [workflow];

  return (
    <Dialog
      title={t("workflows.dialog.executeTitle", { name: workflow.name })}
      onClose={onClose}
      actions={(
        <>
          <button type="button" className={DIALOG_BUTTON} onClick={onClose} disabled={busy}>{t("workflows.dialog.cancel")}</button>
          <PrimaryButton onClick={() => onConfirm(version)} disabled={busy}>
            {busy ? t("workflows.dialog.starting") : t("workflows.dialog.execute")}
          </PrimaryButton>
        </>
      )}
    >
      <label className="block">
        <span className="mb-1.5 block text-[11px] font-semibold text-ink-secondary">{t("workflows.dialog.version")}</span>
        <select
          value={version}
          onChange={(event) => setVersion(Number(event.target.value))}
          disabled={busy}
          className="h-[37px] w-full rounded-[9px] border border-hairline bg-app px-2.5 text-[12px] text-ink outline-none focus:border-accent"
        >
          {[...options].reverse().map((option) => (
            <option key={option.version} value={option.version}>
              {option.version === workflow.version
                ? t("workflows.detail.versionCurrent", { version: option.version })
                : t("workflows.detail.versionEntry", { version: option.version, date: formatDateTime(option.updatedAt) })}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-3 text-[10.5px] text-ink-tertiary">{t("workflows.dialog.executeHelp")}</p>
    </Dialog>
  );
}
