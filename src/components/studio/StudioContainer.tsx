import { useEffect, useRef, useState } from "react";
import { Box, X } from "lucide-react";

import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import type { StudioDraft } from "./studio-model";

export function StudioContainer({ container, selected, onSelect, onDragStart, onResizeStart, onRename, onDelete }: {
  container: StudioDraft["canvas"]["containers"][number];
  selected: boolean;
  onSelect: () => void;
  onDragStart: (event: React.PointerEvent) => void;
  onResizeStart: (event: React.PointerEvent) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(container.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setName(container.name), [container.name]);
  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  const commit = () => {
    const trimmed = name.trim().slice(0, 64);
    onRename(trimmed || "Container");
    setRenaming(false);
  };

  return (
    <div
      className={cn("studio-container", selected && "studio-container-selected")}
      style={{ left: container.x, top: container.y, width: container.width, height: container.height }}
      data-studio-container={container.id}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        if ((event.target as HTMLElement).closest("button,input,.studio-container-resize")) return;
        onSelect();
      }}
    >
      <div
        className="studio-container-head"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          if ((event.target as HTMLElement).closest("button,input")) return;
          onSelect();
          onDragStart(event);
        }}
      >
        <span className="studio-container-icon"><Box size={16} strokeWidth={1.8} aria-hidden="true" /></span>
        {renaming ? (
          <input
            ref={inputRef}
            autoFocus
            value={name}
            maxLength={64}
            aria-label={t("studio.container.name")}
            onChange={(event) => setName(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit();
              if (event.key === "Escape") { setName(container.name); setRenaming(false); }
            }}
            className="studio-container-rename"
            onPointerDown={(event) => event.stopPropagation()}
          />
        ) : (
          <span className="studio-container-name" onDoubleClick={() => setRenaming(true)} title={container.name}>{container.name}</span>
        )}
        <button type="button" className="studio-container-delete" aria-label={t("studio.container.delete")} onClick={onDelete}>
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <span className="studio-container-resize" onPointerDown={onResizeStart} aria-hidden="true" />
    </div>
  );
}
