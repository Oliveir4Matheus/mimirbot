import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Repeat, X } from "lucide-react";

import type { WorkflowSkillOptions, WorkflowStep } from "../../../shared/workflow";
import type { LocaleKey } from "@/locales";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { StudioBalloon } from "./StudioBalloon";
import { StudioCard, type BranchKey } from "./StudioCard";
import { StudioContainer } from "./StudioContainer";
import { StudioNote } from "./StudioNote";
import { StudioPalette } from "./StudioPalette";
import { bezier, entryHit, noteAnchor, noteLinkTarget, outputPoint, type Point } from "./studio-geometry";
import {
  CARD_HEIGHT, CARD_WIDTH, DEFAULT_SCRIPT, allDraftSteps, bodyDraft, connect, containedBy, createContainer, createNote,
  createStep, disconnect, moveContainer, moveNode, moveNote, removeContainer, removeNote,
  removeStep, renameContainer, resizeContainer, resizeNote, updateNote, updateStep,
  withBodyDraft, type StudioBranch, type StudioDraft, type StudioKind, type StudioSelection,
} from "./studio-model";

type Drag =
  | { kind: "pan"; startX: number; startY: number; originX: number; originY: number }
  | { kind: "step"; id: string; startX: number; startY: number; originX: number; originY: number }
  | { kind: "note"; id: string; startX: number; startY: number; originX: number; originY: number }
  | { kind: "container"; id: string; startX: number; startY: number; originX: number; originY: number; steps: Record<string, Point>; notes: Record<string, Point> }
  | { kind: "resize-note"; id: string; startX: number; startY: number; width: number; height: number }
  | { kind: "resize-container"; id: string; startX: number; startY: number; width: number; height: number };

type Link = { kind: "flow"; from: string; branch: StudioBranch } | { kind: "note"; noteId: string };

interface BalloonState { stepId: string; branch: BranchKey; anchor: DOMRect }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const BODY_PALETTE: StudioKind[] = ["agent", "script", "condition", "note", "container"];

export function StudioLoopModal({ draft, loopId, bots, scripts, skillOptions, skillOptionsLoading, skillOptionsError, onEdit, onScript, onRenameScript, onToast, onClose }: {
  draft: StudioDraft;
  loopId: string;
  bots: ReadonlyArray<{ id: string; name: string; section?: string }>;
  scripts: Record<string, string>;
  skillOptions: Record<string, WorkflowSkillOptions>;
  skillOptionsLoading: Record<string, boolean>;
  skillOptionsError: Record<string, string>;
  onEdit: (updater: (current: StudioDraft) => StudioDraft) => void;
  onScript: (name: string, content: string) => void;
  onRenameScript: (from: string, to: string) => void;
  onToast: (key: LocaleKey, params?: Record<string, string | number>) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef({ x: 80, y: 80, zoom: 1 });
  const [viewport, setViewport] = useState(viewportRef.current);
  viewportRef.current = viewport;
  const [selection, setSelection] = useState<StudioSelection>(null);
  const [balloon, setBalloon] = useState<BalloonState | null>(null);
  const [link, setLink] = useState<Link | null>(null);
  const [pointer, setPointer] = useState<Point | null>(null);
  const linkMoved = useRef(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [noteEditing, setNoteEditing] = useState<string | null>(null);
  const [noteLinkMenu, setNoteLinkMenu] = useState<string | null>(null);

  const body = useMemo(() => bodyDraft(draft, loopId), [draft, loopId]);
  const loop = draft.steps.find((step) => step.id === loopId);
  const botName = useCallback((id: string) => bots.find((bot) => bot.id === id)?.name ?? "", [bots]);

  const edit = useCallback((updater: (current: StudioDraft) => StudioDraft) => {
    onEdit((current) => {
      const currentBody = bodyDraft(current, loopId);
      if (!currentBody) return current;
      return withBodyDraft(current, loopId, updater(currentBody));
    });
  }, [loopId, onEdit]);

  const fit = useCallback((next: StudioDraft) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const boxes = [
      ...next.steps.map((step) => next.canvas.nodes[step.id]).filter((node): node is Point => node !== undefined).map((node) => ({ x: node.x, y: node.y, w: CARD_WIDTH, h: CARD_HEIGHT + 75 })),
      ...next.canvas.notes.map((note) => ({ x: note.x, y: note.y, w: note.width, h: note.height })),
      ...next.canvas.containers.map((container) => ({ x: container.x, y: container.y, w: container.width, h: container.height })),
    ];
    if (boxes.length === 0) {
      setViewport({ x: rect.width / 2 - CARD_WIDTH / 2, y: 150, zoom: 1 });
      return;
    }
    const minX = Math.min(...boxes.map((box) => box.x));
    const minY = Math.min(...boxes.map((box) => box.y));
    const maxX = Math.max(...boxes.map((box) => box.x + box.w));
    const maxY = Math.max(...boxes.map((box) => box.y + box.h));
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const zoom = clamp(Math.min((rect.width - 160) / width, (rect.height - 220) / height), 0.35, 1);
    setViewport({
      x: (rect.width - width * zoom) / 2 - minX * zoom,
      y: (rect.height - 140 - height * zoom) / 2 - minY * zoom + 20,
      zoom,
    });
  }, []);

  useEffect(() => {
    if (body) requestAnimationFrame(() => fit(body));
    // Fit once when the modal opens; later edits keep the person's pan and zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const node = dialogRef.current;
    node?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const focusable = [...node.querySelectorAll<HTMLElement>("button,input,textarea,select,[tabindex]:not([tabindex='-1'])")]
        .filter((element) => !element.hasAttribute("disabled"));
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const view = viewportRef.current;
      const next = clamp(view.zoom * (event.deltaY < 0 ? 1.1 : 0.91), 0.35, 2);
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const cx = (px - view.x) / view.zoom;
      const cy = (py - view.y) / view.zoom;
      setViewport({ x: px - cx * next, y: py - cy * next, zoom: next });
    };
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => canvas.removeEventListener("wheel", wheel);
  }, []);

  const canvasPoint = useCallback((clientX: number, clientY: number): Point => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const view = viewportRef.current;
    return { x: (clientX - rect.left - view.x) / view.zoom, y: (clientY - rect.top - view.y) / view.zoom };
  }, []);

  const overCanvas = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect !== undefined && clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }, []);

  useEffect(() => {
    if (!drag) return;
    const held = drag;
    const move = (event: PointerEvent) => {
      const zoom = viewportRef.current.zoom;
      if (held.kind === "pan") {
        setViewport((current) => ({ ...current, x: held.originX + event.clientX - held.startX, y: held.originY + event.clientY - held.startY }));
        return;
      }
      const dx = (event.clientX - held.startX) / zoom;
      const dy = (event.clientY - held.startY) / zoom;
      if (held.kind === "step") {
        edit((current) => moveNode(current, held.id, held.originX + dx, held.originY + dy));
        return;
      }
      if (held.kind === "note") {
        edit((current) => moveNote(current, held.id, held.originX + dx, held.originY + dy));
        return;
      }
      if (held.kind === "resize-note") {
        edit((current) => resizeNote(current, held.id, held.width + dx, held.height + dy));
        return;
      }
      if (held.kind === "resize-container") {
        edit((current) => resizeContainer(current, held.id, held.width + dx, held.height + dy));
        return;
      }
      edit((current) => {
        let next = moveContainer(current, held.id, held.originX + dx, held.originY + dy);
        for (const [id, origin] of Object.entries<Point>(held.steps ?? {})) next = moveNode(next, id, origin.x + dx, origin.y + dy);
        for (const [id, origin] of Object.entries<Point>(held.notes ?? {})) next = moveNote(next, id, origin.x + dx, origin.y + dy);
        return next;
      });
    };
    const up = () => setDrag(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag, edit]);

  useEffect(() => {
    if (!link) return;
    linkMoved.current = false;
    const move = (event: PointerEvent) => {
      linkMoved.current = true;
      setPointer(canvasPoint(event.clientX, event.clientY));
    };
    const up = (event: PointerEvent) => {
      if (!linkMoved.current) return;
      const point = canvasPoint(event.clientX, event.clientY);
      if (body && link.kind === "flow") {
        const target = entryHit(body.steps, body.canvas.nodes, point, 34 / viewportRef.current.zoom);
        if (target) {
          const result = connect(body, link.from, link.branch, target);
          if (result.ok) {
            edit(() => result.draft);
            onToast("studio.toast.connected");
          } else {
            onToast(result.key);
          }
        }
      }
      if (body && link.kind === "note") {
        const target = noteTarget(body, point);
        if (target) {
          edit((value) => updateNote(value, link.noteId, { link: target }));
          const name = target.kind === "step"
            ? body.steps.find((step) => step.id === target.id)?.name
            : body.canvas.containers.find((container) => container.id === target.id)?.name;
          onToast("studio.toast.noteLinked", { name: name ?? target.id });
        } else {
          onToast("studio.toast.dropTarget");
        }
      }
      setLink(null);
      setPointer(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [link, body, canvasPoint, edit, onToast]);

  const center = useCallback((): Point => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return canvasPoint(rect.left + rect.width / 2, rect.top + (rect.height - 120) / 2);
  }, [canvasPoint]);

  const add = useCallback((kind: StudioKind, clientX?: number, clientY?: number) => {
    if (!body || !loop || loop.kind !== "loop") return;
    if (clientX !== undefined && clientY !== undefined && !overCanvas(clientX, clientY)) {
      onToast("studio.toast.outside");
      return;
    }
    const base = center();
    const point = clientX !== undefined && clientY !== undefined
      ? canvasPoint(clientX, clientY)
      : { x: base.x + (body.steps.length % 3) * 60, y: base.y + Math.floor(body.steps.length / 3) * 60 };
    if (kind === "note") {
      const created = createNote(body, point);
      edit(() => created.draft);
      setSelection({ kind: "note", id: created.noteId });
      setNoteEditing(created.noteId);
      return;
    }
    if (kind === "container") {
      const created = createContainer(body, point);
      edit(() => created.draft);
      setSelection({ kind: "container", id: created.containerId });
      return;
    }
    const bot = bots.find((candidate) => candidate.section === draft.department) ?? bots[0];
    const taken = new Set(allDraftSteps(draft).map((step) => step.id));
    const created = createStep(body, kind, point, bot?.id, taken);
    if (kind === "script") {
      const step = created.draft.steps.find((candidate) => candidate.id === created.stepId);
      if (step?.kind === "script") onScript(step.run, scripts[step.run] ?? DEFAULT_SCRIPT);
    }
    const near = nearestFreeOutput(body, point, 75 / viewportRef.current.zoom);
    if (near) {
      const connected = connect(created.draft, near.from, near.branch, created.stepId);
      edit(() => connected.ok ? connected.draft : created.draft);
    } else {
      edit(() => created.draft);
    }
    setSelection({ kind: "step", id: created.stepId });
    onToast("studio.toast.added");
  }, [body, loop, bots, draft.department, overCanvas, canvasPoint, center, edit, onToast, onScript, scripts]);

  const startFlow = useCallback((stepId: string, branch: StudioBranch, event: React.PointerEvent) => {
    event.preventDefault();
    setBalloon(null);
    setLink({ kind: "flow", from: stepId, branch });
    setPointer(canvasPoint(event.clientX, event.clientY));
  }, [canvasPoint]);

  if (!body || !loop || loop.kind !== "loop") return null;

  const links: Array<{ key: string; path: string; color: string }> = [];
  for (const step of body.steps) {
    const node = body.canvas.nodes[step.id];
    if (!node) continue;
    if (step.kind === "condition") {
      if (step.whenTrue) {
        const from = outputPoint(body, step.id, "true");
        const to = body.canvas.nodes[step.whenTrue];
        if (from && to) links.push({ key: `${step.id}-true`, path: bezier(from, { x: to.x, y: to.y + 57 }), color: "var(--color-ink-tertiary)" });
      }
      if (step.whenFalse) {
        const from = outputPoint(body, step.id, "false");
        const to = body.canvas.nodes[step.whenFalse];
        if (from && to) links.push({ key: `${step.id}-false`, path: bezier(from, { x: to.x, y: to.y + 57 }), color: "var(--color-ink-tertiary)" });
      }
      if (step.onFailure) {
        const from = outputPoint(body, step.id, "failure");
        const to = body.canvas.nodes[step.onFailure];
        if (from && to) links.push({ key: `${step.id}-failure`, path: bezier(from, { x: to.x, y: to.y + 57 }), color: "var(--color-danger)" });
      }
    } else {
      if (typeof step.onSuccess === "string") {
        const from = outputPoint(body, step.id, "run");
        const to = body.canvas.nodes[step.onSuccess];
        if (from && to) links.push({ key: `${step.id}-run`, path: bezier(from, { x: to.x, y: to.y + 57 }), color: "var(--color-ink-tertiary)" });
      }
      if (step.onFailure) {
        const from = outputPoint(body, step.id, "failure");
        const to = body.canvas.nodes[step.onFailure];
        if (from && to) links.push({ key: `${step.id}-failure`, path: bezier(from, { x: to.x, y: to.y + 57 }), color: "var(--color-danger)" });
      }
      if (step.kind !== "loop" && step.onTimeout) {
        const from = outputPoint(body, step.id, "timeout");
        const to = body.canvas.nodes[step.onTimeout];
        if (from && to) links.push({ key: `${step.id}-timeout`, path: bezier(from, { x: to.x, y: to.y + 57 }), color: "var(--studio-node-condition)" });
      }
    }
  }
  const noteLinks: Array<{ key: string; path: string }> = [];
  for (const note of body.canvas.notes) {
    if (!note.link) continue;
    const anchor = noteAnchor(note);
    const step = note.link.kind === "step" ? body.steps.find((candidate) => candidate.id === note.link!.id) : undefined;
    const container = note.link.kind === "container" ? body.canvas.containers.find((candidate) => candidate.id === note.link!.id) : undefined;
    const node = step ? body.canvas.nodes[step.id] : undefined;
    const box = node ? { x: node.x, y: node.y, width: CARD_WIDTH, height: CARD_HEIGHT } : container;
    if (!box) continue;
    noteLinks.push({ key: note.id, path: bezier(anchor, noteLinkTarget(note, box, container !== undefined)) });
  }
  const activeLink = link && pointer
    ? link.kind === "flow"
      ? (() => {
        const from = outputPoint(body, link.from, link.branch);
        return from ? { path: bezier(from, pointer), color: "var(--studio-node-bot)", dashed: true } : undefined;
      })()
      : (() => {
        const note = body.canvas.notes.find((candidate) => candidate.id === link.noteId);
        return note ? { path: bezier(noteAnchor(note), pointer), color: "var(--studio-note)", dashed: true } : undefined;
      })()
    : undefined;
  const balloonStep = balloon ? body.steps.find((step) => step.id === balloon.stepId) : undefined;
  const minY = body.steps.length > 0 ? Math.min(...body.steps.map((step) => body.canvas.nodes[step.id]?.y ?? 0)) : 120;
  const maxY = body.steps.length > 0 ? Math.max(...body.steps.map((step) => (body.canvas.nodes[step.id]?.y ?? 0) + CARD_HEIGHT)) : 120;
  const markerX = body.steps.length > 0 ? Math.min(...body.steps.map((step) => body.canvas.nodes[step.id]?.x ?? 0)) : 80;

  return (
    <div className="studio-loop-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        ref={dialogRef}
        className="studio-loop-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t("studio.loop.modalTitle", { name: loop.name })}
        tabIndex={-1}
      >
        <header className="studio-loop-head">
          <span className="studio-loop-title">
            <Repeat size={16} aria-hidden="true" />
            {t("studio.loop.modalTitle", { name: loop.name })}
          </span>
          <button type="button" className="studio-loop-close" aria-label={t("studio.balloon.close")} onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div
          ref={canvasRef}
          className="studio-canvas studio-loop-canvas"
          style={{ backgroundSize: `${24 * viewport.zoom}px ${24 * viewport.zoom}px`, backgroundPosition: `${viewport.x}px ${viewport.y}px` }}
          onPointerDown={(event) => {
            if (event.button !== 0 || event.target !== event.currentTarget) return;
            setSelection(null);
            setBalloon(null);
            setNoteLinkMenu(null);
            setLink(null);
            setPointer(null);
            setDrag({ kind: "pan", startX: event.clientX, startY: event.clientY, originX: viewport.x, originY: viewport.y });
          }}
        >
          <div className="studio-world" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}>
            <svg className="studio-links" width={1} height={1} aria-hidden="true">
              <defs>
                <marker id="studio-loop-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-ink-tertiary)" />
                </marker>
              </defs>
              {links.map((edge) => <path key={edge.key} d={edge.path} stroke={edge.color} markerEnd="url(#studio-loop-arrow)" />)}
              {noteLinks.map((edge) => <path key={edge.key} d={edge.path} className="studio-note-link" />)}
              {activeLink && <path d={activeLink.path} stroke={activeLink.color} className={cn("studio-link-active", activeLink.dashed && "studio-link-dashed")} />}
            </svg>

            <div className="studio-loop-marker" style={{ left: markerX, top: minY - 86 }}>
              {t("studio.loop.entry")}
            </div>
            <div className="studio-loop-marker" style={{ left: markerX, top: maxY + 64 }}>
              {t("studio.loop.end")}
            </div>

            {body.canvas.containers.map((container) => (
              <StudioContainer
                key={container.id}
                container={container}
                selected={selection?.kind === "container" && selection.id === container.id}
                onSelect={() => setSelection({ kind: "container", id: container.id })}
                onDragStart={(event) => {
                  const inside = containedBy(body, container.id);
                  const steps = Object.fromEntries(inside.steps.map((id) => [id, body.canvas.nodes[id]!]));
                  const notes = Object.fromEntries(inside.notes.map((id) => {
                    const note = body.canvas.notes.find((candidate) => candidate.id === id)!;
                    return [id, { x: note.x, y: note.y }];
                  }));
                  setDrag({ kind: "container", id: container.id, startX: event.clientX, startY: event.clientY, originX: container.x, originY: container.y, steps, notes });
                }}
                onResizeStart={(event) => setDrag({ kind: "resize-container", id: container.id, startX: event.clientX, startY: event.clientY, width: container.width, height: container.height })}
                onRename={(name) => edit((current) => renameContainer(current, container.id, name))}
                onDelete={() => { edit((current) => removeContainer(current, container.id)); setSelection(null); }}
              />
            ))}

            {body.steps.map((step, index) => (
              <StudioCard
                key={step.id}
                draft={body}
                step={step}
                index={index}
                selected={selection?.kind === "step" && selection.id === step.id}
                botName={botName}
                onSelect={() => setSelection({ kind: "step", id: step.id })}
                onDragStart={(event) => {
                  const node = body.canvas.nodes[step.id];
                  if (node) setDrag({ kind: "step", id: step.id, startX: event.clientX, startY: event.clientY, originX: node.x, originY: node.y });
                }}
                onEntry={() => {
                  if (link?.kind !== "flow") return;
                  const result = connect(body, link.from, link.branch, step.id);
                  if (result.ok) {
                    edit(() => result.draft);
                    onToast("studio.toast.connected");
                  } else {
                    onToast(result.key);
                  }
                  setLink(null);
                  setPointer(null);
                }}
                onBranch={(branch, anchor) => setBalloon((current) => current && current.stepId === step.id && current.branch === branch ? null : { stepId: step.id, branch, anchor })}
                onPort={(branch, event) => startFlow(step.id, branch, event)}
                onRename={(name) => edit((current) => updateStep(current, step.id, { name } as Partial<WorkflowStep>))}
                onDuplicate={() => {
                  if (step.kind === "loop") return;
                  const created = createStep(body, step.kind === "bot" ? "agent" : step.kind, {
                    x: (body.canvas.nodes[step.id]?.x ?? 0) + CARD_WIDTH / 2 + 46,
                    y: (body.canvas.nodes[step.id]?.y ?? 0) + CARD_HEIGHT / 2 + 220,
                  }, step.kind === "bot" ? step.botId : undefined, new Set(allDraftSteps(draft).map((candidate) => candidate.id)));
                  const copy = created.draft.steps.find((candidate) => candidate.id === created.stepId);
                  if (!copy) return;
                  const runName = copy.kind === "script" ? copy.run : undefined;
                  if (step.kind === "script" && runName) onScript(runName, scripts[step.run] ?? DEFAULT_SCRIPT);
                  const clone: WorkflowStep = step.kind === "condition"
                    ? { ...step, id: copy.id, name: copy.name, whenTrue: undefined, whenFalse: undefined, onFailure: undefined }
                    : step.kind === "script" && runName
                      ? { ...step, id: copy.id, name: copy.name, run: runName, onSuccess: undefined, onFailure: undefined, onTimeout: undefined }
                      : { ...step, id: copy.id, name: copy.name, onSuccess: undefined, onFailure: undefined, onTimeout: undefined };
                  edit(() => ({ ...created.draft, steps: created.draft.steps.map((candidate) => candidate.id === copy.id ? clone : candidate) }));
                  setSelection({ kind: "step", id: copy.id });
                }}
                onDelete={() => { edit((current) => removeStep(current, step.id)); setSelection(null); setBalloon(null); }}
              />
            ))}

            {body.canvas.notes.map((note) => (
              <StudioNote
                key={note.id}
                draft={body}
                note={note}
                selected={selection?.kind === "note" && selection.id === note.id}
                editing={noteEditing === note.id}
                linkMenu={noteLinkMenu === note.id}
                onSelect={() => setSelection({ kind: "note", id: note.id })}
                onDragStart={(event) => setDrag({ kind: "note", id: note.id, startX: event.clientX, startY: event.clientY, originX: note.x, originY: note.y })}
                onResizeStart={(event) => setDrag({ kind: "resize-note", id: note.id, startX: event.clientX, startY: event.clientY, width: note.width, height: note.height })}
                onEdit={(value) => setNoteEditing(value ? note.id : null)}
                onMarkdown={(markdown) => edit((current) => updateNote(current, note.id, { markdown }))}
                onDelete={() => { edit((current) => removeNote(current, note.id)); setNoteEditing(null); setSelection(null); }}
                onAnchor={(event) => {
                  event.preventDefault();
                  setLink({ kind: "note", noteId: note.id });
                  setPointer(canvasPoint(event.clientX, event.clientY));
                }}
                onLinkMenu={(open) => setNoteLinkMenu(open ? note.id : null)}
                onLink={(target) => edit((current) => updateNote(current, note.id, { link: target }))}
                onUnlink={() => edit((current) => updateNote(current, note.id, { link: undefined }))}
              />
            ))}
          </div>

          <StudioPalette kinds={BODY_PALETTE} onActivate={(kind) => add(kind)} onDrop={(kind, x, y) => add(kind, x, y)} />

          {balloon && balloonStep && (
            <StudioBalloon
              draft={body}
              step={balloonStep}
              branch={balloon.branch}
              anchor={balloon.anchor}
              bots={bots}
              scripts={scripts}
              skillOptions={balloonStep.kind === "bot" ? skillOptions[balloonStep.botId] : undefined}
              skillOptionsLoading={balloonStep.kind === "bot" ? skillOptionsLoading[balloonStep.botId] : undefined}
              skillOptionsError={balloonStep.kind === "bot" ? skillOptionsError[balloonStep.botId] : undefined}
              onChange={(patch) => edit((current) => updateStep(current, balloonStep.id, patch))}
              onScript={onScript}
              onRenameScript={onRenameScript}
              onToast={onToast}
              onDisconnect={(branch) => edit((current) => disconnect(current, balloonStep.id, branch))}
              onClose={() => setBalloon(null)}
            />
          )}

        </div>

        <footer className="studio-loop-foot">
          <span className="studio-loop-hint">{t("studio.loop.modalHelp")}</span>
          <button type="button" className="studio-loop-done" onClick={onClose}>
            <Check size={14} aria-hidden="true" />
            {t("studio.loop.close")}
          </button>
        </footer>
      </div>
    </div>
  );
}

function noteTarget(draft: StudioDraft, point: Point): { kind: "step" | "container"; id: string } | undefined {
  for (const step of draft.steps) {
    const node = draft.canvas.nodes[step.id];
    if (node && point.x >= node.x && point.x <= node.x + CARD_WIDTH && point.y >= node.y && point.y <= node.y + CARD_HEIGHT + 62) {
      return { kind: "step", id: step.id };
    }
  }
  for (const container of draft.canvas.containers) {
    if (point.x >= container.x && point.x <= container.x + container.width && point.y >= container.y && point.y <= container.y + container.height) {
      return { kind: "container", id: container.id };
    }
  }
  return undefined;
}

function nearestFreeOutput(draft: StudioDraft, point: Point, radius: number): { from: string; branch: StudioBranch } | undefined {
  let best: { from: string; branch: StudioBranch; distance: number } | undefined;
  for (const step of draft.steps) {
    const branches: StudioBranch[] = step.kind === "condition" ? ["true", "false", "failure"] : ["run", "failure", "timeout"];
    for (const branch of branches) {
      const taken = step.kind === "condition"
        ? (branch === "true" ? step.whenTrue !== undefined : branch === "false" ? step.whenFalse !== undefined : step.onFailure !== undefined)
        : branch === "run" ? typeof step.onSuccess === "string"
          : branch === "failure" ? step.onFailure !== undefined
            : step.kind !== "loop" && step.onTimeout !== undefined;
      if (taken) continue;
      const output = outputPoint(draft, step.id, branch);
      if (!output) continue;
      const distance = Math.hypot(output.x - point.x, output.y - point.y);
      if (distance <= radius && (!best || distance < best.distance)) best = { from: step.id, branch, distance };
    }
  }
  return best ? { from: best.from, branch: best.branch } : undefined;
}
