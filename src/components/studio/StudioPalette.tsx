import { useEffect, useRef, useState } from "react";
import { Box, Code2, GitBranch, Sparkles, StickyNote } from "lucide-react";

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
  { kind: "agent", label: "studio.palette.agent", hint: "studio.palette.agentHint", icon: Sparkles, color: "#6254D6", background: "#F2F0FF" },
  { kind: "script", label: "studio.palette.script", hint: "studio.palette.scriptHint", icon: Code2, color: "#247B8A", background: "#EAF6F7" },
  { kind: "condition", label: "studio.palette.condition", hint: "studio.palette.conditionHint", icon: GitBranch, color: "#C08023", background: "#FFF6E8" },
  { kind: "note", label: "studio.palette.note", hint: "studio.palette.noteHint", icon: StickyNote, color: "#A37A29", background: "#FFF5D6" },
  { kind: "container", label: "studio.palette.container", hint: "studio.palette.containerHint", icon: Box, color: "#6688A0", background: "#E9F2F9" },
];

export function StudioPalette({ onActivate, onDrop }: {
  onActivate: (kind: StudioKind) => void;
  onDrop: (kind: StudioKind, clientX: number, clientY: number) => void;
}) {
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
        {ITEMS.map((item) => {
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
            const item = ITEMS.find((candidate) => candidate.kind === ghost.kind)!;
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
