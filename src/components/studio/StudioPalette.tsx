import { useEffect, useRef, useState } from "react";
import { Box, Code2, GitBranch, Repeat, Sparkles, StickyNote } from "lucide-react";

import type { LocaleKey } from "@/locales";
import { t } from "@/lib/i18n";
import type { StudioKind } from "./studio-model";

interface PaletteItem {
  kind: StudioKind;
  label: LocaleKey;
  hint: LocaleKey;
  icon: typeof Sparkles;
  color: string;
  background: string;
}

const ITEMS: PaletteItem[] = [
  { kind: "agent", label: "studio.palette.agent", hint: "studio.palette.agentHint", icon: Sparkles, color: "var(--studio-node-bot)", background: "color-mix(in srgb, var(--studio-node-bot) 16%, var(--color-card))" },
  { kind: "script", label: "studio.palette.script", hint: "studio.palette.scriptHint", icon: Code2, color: "var(--studio-node-script)", background: "color-mix(in srgb, var(--studio-node-script) 16%, var(--color-card))" },
  { kind: "condition", label: "studio.palette.condition", hint: "studio.palette.conditionHint", icon: GitBranch, color: "var(--studio-node-condition)", background: "color-mix(in srgb, var(--studio-node-condition) 16%, var(--color-card))" },
  { kind: "loop", label: "studio.palette.loop", hint: "studio.palette.loopHint", icon: Repeat, color: "var(--studio-node-loop)", background: "color-mix(in srgb, var(--studio-node-loop) 16%, var(--color-card))" },
  { kind: "note", label: "studio.palette.note", hint: "studio.palette.noteHint", icon: StickyNote, color: "var(--studio-note)", background: "color-mix(in srgb, var(--studio-note) 16%, var(--color-card))" },
  { kind: "container", label: "studio.palette.container", hint: "studio.palette.containerHint", icon: Box, color: "var(--studio-container)", background: "color-mix(in srgb, var(--studio-container) 16%, var(--color-card))" },
];

export function StudioPalette({ onActivate, onDrop, kinds }: {
  onActivate: (kind: StudioKind) => void;
  onDrop: (kind: StudioKind, clientX: number, clientY: number) => void;
  /** The substudio leaves Do While out: nesting is not part of the contract. */
  kinds?: readonly StudioKind[];
}) {
  const items = kinds ? ITEMS.filter((item) => kinds.includes(item.kind)) : ITEMS;
  const [ghost, setGhost] = useState<{ kind: StudioKind; x: number; y: number } | null>(null);
  const pending = useRef<{ kind: StudioKind; x: number; y: number; moved: boolean } | null>(null);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const held = pending.current;
      if (!held) return;
      if (!held.moved && Math.hypot(event.clientX - held.x, event.clientY - held.y) < 6) return;
      held.moved = true;
      setGhost({ kind: held.kind, x: event.clientX, y: event.clientY });
    };
    const up = (event: PointerEvent) => {
      const held = pending.current;
      if (!held) return;
      pending.current = null;
      setGhost(null);
      if (held.moved) onDrop(held.kind, event.clientX, event.clientY);
      else onActivate(held.kind);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [onActivate, onDrop]);

  return (
    <>
      <div className="studio-palette" role="toolbar" aria-label={t("studio.palette.title")}>
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.kind}
              type="button"
              data-studio-palette={item.kind}
              className="studio-palette-item group"
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                pending.current = { kind: item.kind, x: event.clientX, y: event.clientY, moved: false };
              }}
              onClick={(event) => { event.preventDefault(); if (event.detail === 0) onActivate(item.kind); }}
            >
              <span className="studio-palette-icon" style={{ background: item.background, color: item.color }}>
                <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span className="studio-palette-label">{t(item.label)}</span>
              <span className="studio-palette-tip" role="tooltip">
                <strong>{t(item.label)}</strong>
                <span>{t(item.hint)}</span>
              </span>
            </button>
          );
        })}
      </div>
      {ghost && (
        <div className="studio-ghost" style={{ left: ghost.x + 14, top: ghost.y + 14 }}>
          {(() => {
            const item = items.find((candidate) => candidate.kind === ghost.kind)!;
            const Icon = item.icon;
            return (
              <>
                <span className="studio-palette-icon" style={{ background: item.background, color: item.color, width: 21, height: 21, borderRadius: 6 }}>
                  <Icon size={14} strokeWidth={1.8} aria-hidden="true" />
                </span>
                <span>{t(item.label)}</span>
                <span className="studio-ghost-hint">{t("studio.palette.drop")}</span>
              </>
            );
          })()}
        </div>
      )}
    </>
  );
}
