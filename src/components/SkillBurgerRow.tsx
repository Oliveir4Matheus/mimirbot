import { useState } from "react";

import { skillBurgerEnabled } from "@/lib/feature-flags";
import { t } from "@/lib/i18n";
import { api, useStore, type ConfigStatus } from "@/state/store";
import { SettingRow, Switch } from "./SettingsPrimitives";

export function SkillBurgerRow() {
  const { state, dispatch } = useStore();
  const on = skillBurgerEnabled(state.config);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggle = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const config: ConfigStatus = await api("/api/config", { method: "PATCH", body: JSON.stringify({ features: { skillBurger: !on } }) });
      dispatch({ type: "configStatus", config });
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : t("settings.skillBurger.error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingRow title={t("settings.skillBurger.title")} subtitle={t("settings.skillBurger.subtitle")}>
      <div className="flex flex-col items-end gap-1">
        <Switch checked={on} disabled={saving} aria-label={t("settings.skillBurger.aria")} onClick={() => void toggle()} />
        {error && <span role="alert" className="text-[12px] text-danger">{error}</span>}
      </div>
    </SettingRow>
  );
}
