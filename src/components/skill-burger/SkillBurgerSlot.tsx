import { useEffect, useMemo, useState } from "react";

import { askOf, burgerLayers, replayableLayers, type RunMessage } from "../../../shared/skill-burger/layers";
import { SkillBurger, layerLine } from "./SkillBurger";

/** The chat dock's burger: the run since the person's last ask, once it has two steps this version can repeat. */
export function SkillBurgerSlot({ botId, threadId, busy, canSave, messages, liveTools, transcriptKey, onShownChange }: {
  botId: string;
  threadId: string;
  busy: boolean;
  /** False while the bot still works, or for someone who can't write in this chat. */
  canSave: boolean;
  messages: readonly RunMessage[];
  liveTools: ReadonlySet<string>;
  transcriptKey: string;
  onShownChange?: (shown: boolean) => void;
}) {
  const layers = useMemo(() => burgerLayers(messages, liveTools), [messages, liveTools]);
  const replayable = useMemo(() => replayableLayers(layers), [layers]);
  const [closed, setClosed] = useState<ReadonlyMap<string, string>>(() => new Map());
  const run = layers[0]?.messageId;
  const allReplayable = layers.length > 0 && replayable.length === layers.length;
  const finished = Boolean(run) && replayable.length >= 2 && !busy && layers.every((layer) => layer.status !== "running");
  const shown = finished && closed.get(transcriptKey) !== run;

  useEffect(() => { onShownChange?.(shown); }, [shown, onShownChange]);

  if (!shown || !run) return null;
  const summary = (askOf(messages) ?? layers.map(layerLine).join(", ")).slice(0, 160);
  return (
    <div className="flex justify-end px-5 pb-2">
      <SkillBurger
        key={`${transcriptKey}:${run}`}
        run={`${transcriptKey}:${run}`}
        layers={layers}
        summary={summary}
        canSave={canSave && allReplayable}
        botId={botId}
        threadId={threadId}
        onDismiss={() => setClosed((current) => new Map(current).set(transcriptKey, run))}
      />
    </div>
  );
}
