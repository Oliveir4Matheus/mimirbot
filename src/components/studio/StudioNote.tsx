import { useEffect, useRef } from "react";
import { Eye, Link2, Pencil, StickyNote, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import type { StudioDraft } from "./studio-model";

export function StudioNote({ draft, note, selected, editing, linkMenu, onSelect, onDragStart, onResizeStart, onEdit, onMarkdown, onDelete, onAnchor, onLinkMenu, onLink, onUnlink }: {
  draft: StudioDraft;
  note: StudioDraft["canvas"]["notes"][number];
  selected: boolean;
  editing: boolean;
  linkMenu: boolean;
  onSelect: () => void;
  onDragStart: (event: React.PointerEvent) => void;
  onResizeStart: (event: React.PointerEvent) => void;
  onEdit: (editing: boolean) => void;
  onMarkdown: (markdown: string) => void;
  onDelete: () => void;
  onAnchor: (event: React.PointerEvent) => void;
  onLinkMenu: (open: boolean) => void;
  onLink: (target: { kind: "step" | "container"; id: string }) => void;
  onUnlink: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!linkMenu) return;
    const close = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onLinkMenu(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [linkMenu, onLinkMenu]);

  return (
    <div
      className={cn("studio-note", selected && "studio-note-selected")}
      style={{ left: note.x, top: note.y, width: note.width, height: note.height }}
      data-studio-note={note.id}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        if ((event.target as HTMLElement).closest("button,textarea,.studio-note-resize,.studio-note-anchor")) return;
        onSelect();
      }}
    >
      <div
        className="studio-note-head"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          if ((event.target as HTMLElement).closest("button")) return;
          onSelect();
          onDragStart(event);
        }}
      >
        <StickyNote size={16} aria-hidden="true" className="studio-note-icon" />
        <span className="studio-note-title">{t("studio.note.title")}</span>
        <span className="studio-note-actions">
          <button type="button" aria-label={t("studio.note.link")} aria-pressed={note.link !== undefined} className={cn("studio-note-action", note.link && "studio-note-action-on")} onClick={() => onLinkMenu(!linkMenu)}>
            <Link2 size={15} aria-hidden="true" />
          </button>
          <button type="button" aria-label={editing ? t("studio.note.view") : t("studio.note.edit")} className="studio-note-action" onClick={() => onEdit(!editing)}>
            {editing ? <Eye size={15} aria-hidden="true" /> : <Pencil size={15} aria-hidden="true" />}
          </button>
          <button type="button" aria-label={t("studio.note.delete")} className="studio-note-action" onClick={onDelete}>
            <X size={15} aria-hidden="true" />
          </button>
        </span>
      </div>

      {editing ? (
        <textarea
          autoFocus
          value={note.markdown}
          placeholder={t("studio.note.placeholder")}
          onChange={(event) => onMarkdown(event.target.value)}
          onPointerDown={(event) => event.stopPropagation()}
          className="studio-note-editor"
          aria-label={t("studio.note.edit")}
        />
      ) : (
        <div className="studio-note-body" onDoubleClick={() => onEdit(true)}>
          {note.markdown.trim() ? (
            <div className="studio-note-md">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a> }}
              >
                {note.markdown}
              </ReactMarkdown>
            </div>
          ) : (
            <span className="studio-note-empty">{t("studio.note.empty")}</span>
          )}
        </div>
      )}

      <button type="button" className="studio-note-anchor" aria-label={t("studio.note.link")} onPointerDown={onAnchor} />

      {linkMenu && (
        <div ref={menuRef} className="studio-link-menu" role="menu">
          <div className="studio-link-title">{t("studio.note.linkTo")}</div>
          <div className="studio-link-list">
            {draft.steps.map((step) => (
              <button
                key={step.id}
                type="button"
                role="menuitemradio"
                aria-checked={note.link?.kind === "step" && note.link.id === step.id}
                onClick={() => onLink({ kind: "step", id: step.id })}
              >
                <span className="studio-link-name">{step.name}</span>
                {note.link?.kind === "step" && note.link.id === step.id && <span aria-hidden="true">✓</span>}
              </button>
            ))}
            {draft.canvas.containers.map((container) => (
              <button
                key={container.id}
                type="button"
                role="menuitemradio"
                aria-checked={note.link?.kind === "container" && note.link.id === container.id}
                onClick={() => onLink({ kind: "container", id: container.id })}
              >
                <span className="studio-link-name">{container.name}</span>
                {note.link?.kind === "container" && note.link.id === container.id && <span aria-hidden="true">✓</span>}
              </button>
            ))}
          </div>
          {note.link && (
            <button type="button" role="menuitem" className="studio-link-unlink" onClick={onUnlink}>
              {t("studio.note.unlink")}
            </button>
          )}
        </div>
      )}

      <span className="studio-note-resize" onPointerDown={onResizeStart} aria-hidden="true" />
    </div>
  );
}
