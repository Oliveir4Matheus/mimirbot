import type { InstanceInfo } from "@/state/store";
import type { EffortLevel } from "../../shared/wire";
import { t } from "@/lib/i18n";

export function modelLabel(instance: InstanceInfo | undefined, model: string): string {
  return instance?.models.options.find((option) => option.id === model)?.label ?? model;
}

export function modelProvider(instance: InstanceInfo | undefined, model: string): string | undefined {
  return instance?.models.options.find((option) => option.id === model)?.provider;
}

export function effortLabel(level: EffortLevel): string {
  return t(`model.effort.${level}` as Parameters<typeof t>[0]);
}

/** What the picker's trigger says about the model in use: its name, the account and provider beside it, and the level. */
export function ModelTriggerLabel({ instance, model, showAccount }: {
  instance: InstanceInfo | undefined;
  model: string;
  showAccount: boolean;
}) {
  const provider = instance ? modelProvider(instance, model) : undefined;
  return (
    <span className="min-w-0 max-w-[160px] truncate">
      {instance && showAccount && (
        <span data-model-account className="text-ink-secondary">{instance.displayName} · </span>
      )}
      {modelLabel(instance, model)}
      {provider && <span className="text-ink-secondary"> · {provider}</span>}
    </span>
  );
}

/** The level beside the name: the chosen variant, else the effort, else nothing. */
export function ModelTriggerLevel({ variant, effort }: { variant: string | undefined; effort: EffortLevel | undefined }) {
  if (variant !== undefined) return <span data-model-variant className="max-w-[120px] truncate text-ink-secondary">· {variant}</span>;
  if (!effort) return null;
  return <span data-model-effort className="shrink-0 text-ink-secondary">· {effortLabel(effort)}</span>;
}
