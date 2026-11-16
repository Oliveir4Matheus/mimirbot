import { useMemo, useState } from "react";

import type { WorkflowDefinition } from "../../../shared/workflow";
import { Select } from "@/components/Select";
import { t } from "@/lib/i18n";
import { formatDateTime } from "@/lib/workflow-format";
import { parameterValues, startParameters, type ParameterFormValues } from "@/lib/workflow-inputs";
import { DIALOG_BUTTON, Dialog, PrimaryButton } from "./Dialog";
import { ParameterFields } from "./ParameterFields";

export function RunDialog({ workflow, versions, initialVersion, busy, error, onClose, onConfirm }: {
  workflow: WorkflowDefinition;
  versions: WorkflowDefinition[];
  initialVersion?: number;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: (version: number, inputs: Record<string, unknown>) => void;
}) {
  const [version, setVersion] = useState(initialVersion ?? workflow.version);
  const [values, setValues] = useState<ParameterFormValues>({});
  const options = versions.length > 0 ? versions : [workflow];
  const selected = options.find((option) => option.version === version) ?? workflow;
  const parameters = useMemo(() => startParameters(selected), [selected]);

  return (
    <Dialog
      title={t("workflows.dialog.executeTitle", { name: workflow.name })}
      onClose={onClose}
      actions={(
        <>
          <button type="button" className={DIALOG_BUTTON} onClick={onClose} disabled={busy}>{t("workflows.dialog.cancel")}</button>
          <PrimaryButton onClick={() => onConfirm(version, parameterValues(parameters, values))} disabled={busy}>
            {busy ? t("workflows.dialog.starting") : t("workflows.dialog.execute")}
          </PrimaryButton>
        </>
      )}
    >
      <label className="block">
        <span className="mb-1.5 block text-[11px] font-semibold text-ink-secondary">{t("workflows.dialog.version")}</span>
        <Select
          value={version}
          onChange={(event) => setVersion(Number(event.target.value))}
          disabled={busy}
          className="w-full"
          size="md"
        >
          {[...options].reverse().map((option) => (
            <option key={option.version} value={option.version}>
              {option.version === workflow.version
                ? t("workflows.detail.versionCurrent", { version: option.version })
                : t("workflows.detail.versionEntry", { version: option.version, date: formatDateTime(option.updatedAt) })}
            </option>
          ))}
        </Select>
      </label>
      {parameters.length > 0 && (
        <section className="mt-4">
          <div className="text-[11px] font-semibold text-ink-secondary">{t("workflows.inputs.startTitle")}</div>
          <ParameterFields
            parameters={parameters}
            values={values}
            onChange={(name, value) => setValues((current) => ({ ...current, [name]: value }))}
            disabled={busy}
            idPrefix="run-input"
          />
        </section>
      )}
      {error && (
        <p className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-2.5 py-2 text-[11px] text-danger">{error}</p>
      )}
      <p className="mt-3 text-[10.5px] text-ink-tertiary">{t("workflows.dialog.executeHelp")}</p>
    </Dialog>
  );
}
