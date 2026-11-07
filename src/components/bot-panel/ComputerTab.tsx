import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";

import { writeComputerPanelView, writeComputerViewer, type ComputerPanelView } from "@/lib/computer-panel-view";
import { t } from "@/lib/i18n";
import { useOwnerOrAdmin } from "@/lib/use-owner-or-admin";
import { api, useStore, type Bot } from "@/state/store";
import { ComputerPanel } from "../ComputerPanel";
import type { useBotSettingsDerived } from "../bot-settings/useBotSettingsDerived";
import type { SimplePageId } from "./page-registry";
import { Card, NavRow } from "./rows";

type Derived = ReturnType<typeof useBotSettingsDerived>;

export function useOpenComputer(bot: Pick<Bot, "id">) {
  const { dispatch } = useStore();
  // One dispatch: `toggleComputer` already closes the settings panel, and two renders would let the
  // drawer start a slide it then has to abandon half way.
  return (view: ComputerPanelView = "computer", viewer = false) => {
    writeComputerPanelView(bot.id, view);
    if (viewer) writeComputerViewer(bot.id);
    dispatch({ type: "toggleComputer", open: true });
  };
}

/** How many sites the bot's own browser is signed in to; null until read, and never asked for by a non-owner. */
function useSignedInCount(bot: Pick<Bot, "id">, enabled: boolean): number | null {
  const [count, setCount] = useState<{ botId: string; count: number } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void api(`/api/browser-sites?bot=${encodeURIComponent(bot.id)}`)
      .then((answer: { sites?: unknown[] }) => { if (!cancelled) setCount({ botId: bot.id, count: answer.sites?.length ?? 0 }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [bot.id, enabled]);
  return count?.botId === bot.id ? count.count : null;
}

export function ComputerTab({ bot, derived, onOpen }: { bot: Bot; derived: Derived; onOpen: (page: SimplePageId) => void }) {
  const ownerOrAdmin = useOwnerOrAdmin();
  const openComputer = useOpenComputer(bot);
  const signedIn = useSignedInCount(bot, derived.browserEnabled && bot.computer !== "off" && ownerOrAdmin !== false);

  return (
    <div data-panel-tabpanel="computer" className="mt-[18px] flex h-[min(660px,calc(100dvh-210px))] min-h-[420px] flex-col">
      <ComputerPanel
        bot={bot}
        embedded
        onWatch={() => openComputer("computer", true)}
        sites={(
          <Card anchor="logins">
            <NavRow
              data-panel-page="browser"
              icon={KeyRound}
              title={t("settings.sites.title")}
              value={signedIn ?? undefined}
              onClick={() => onOpen("browser")}
            />
          </Card>
        )}
      />
    </div>
  );
}
