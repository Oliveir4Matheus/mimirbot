import type { WorkflowParameter } from "../../../shared/workflow";
import { t } from "@/lib/i18n";
import { Select } from "@/components/Select";
import { parameterLabel, type ParameterFormValues } from "@/lib/workflow-inputs";

const FIELD = "mt-1 w-full rounded-lg border border-hairline bg-control px-2 py-1.5 text-[12px] text-ink disabled:opacity-60";

export function ParameterFields({ parameters, values, onChange, disabled, idPrefix }: {
  parameters: readonly WorkflowParameter[];
  values: ParameterFormValues;
  onChange: (name: string, value: string) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  if (parameters.length === 0) return null;
  return (
    <div className="mt-3 space-y-2.5">
      {parameters.map((parameter) => {
        const id = `${idPrefix}-${parameter.name}`;
        const value = values[parameter.name] ?? "";
        const label = parameterLabel(parameter);
        return (
          <label key={parameter.name} htmlFor={id} className="block">
            <span className="block text-[11px] font-semibold text-ink-secondary">{label}</span>
            {parameter.type === "boolean" ? (
              <input
                id={id}
                type="checkbox"
                checked={value === "true"}
                onChange={(event) => onChange(parameter.name, event.target.checked ? "true" : "false")}
                disabled={disabled}
                className="mt-1 size-4 rounded border-hairline accent-accent"
              />
            ) : parameter.type === "enum" ? (
              <Select
                id={id}
                value={value}
                onChange={(event) => onChange(parameter.name, event.target.value)}
                disabled={disabled}
                className="mt-1 w-full"
              >
                <option value="">{t("workflows.inputs.choose")}</option>
                {(parameter.values ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
              </Select>
            ) : (
              <input
                id={id}
                type={parameter.type === "date" ? "date" : parameter.type === "number" || parameter.type === "integer" ? "number" : "text"}
                value={value}
                onChange={(event) => onChange(parameter.name, event.target.value)}
                disabled={disabled}
                className={FIELD}
              />
            )}
            {parameter.list && (
              <span className="mt-1 block text-[10px] text-ink-tertiary">{t("workflows.inputs.listHint")}</span>
            )}
          </label>
        );
      })}
    </div>
  );
}
