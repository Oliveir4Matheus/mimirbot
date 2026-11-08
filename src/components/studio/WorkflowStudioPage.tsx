import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, X } from "lucide-react";

import { isScriptStep, type WorkflowStep } from "../../../shared/workflow";
import type { LocaleKey } from "@/locales";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { useStore } from "@/state/store";
import { createWorkflow, listScripts, readScript, readWorkflow, updateWorkflow } from "@/lib/workflows-api";
import { StudioBalloon } from "./StudioBalloon";
import { StudioCard, type BranchKey } from "./StudioCard";
import { StudioContainer } from "./StudioContainer";
import { StudioNote } from "./StudioNote";
import { StudioPalette } from "./StudioPalette";
import { bezier, entryHit, noteAnchor, noteLinkTarget, outputPoint, type Point } from "./studio-geometry";
import {
  CARD_HEIGHT, CARD_WIDTH, DEFAULT_SCRIPT, containedBy, connect, createContainer, createNote, createStep,
  draftProblem, fromDefinition, moveContainer, moveNode, moveNote, newDraft,
  removeContainer, removeNote, removeStep, renameContainer, resizeContainer, resizeNote,
  toDefinition, updateNote, updateStep, type StudioBranch, type StudioDraft, type StudioKind, type StudioSelection,
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
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

export function WorkflowStudioPage({ workflowId, department, onBack, onSaved }: {
  workflowId?: string;
  department: string;
  onBack: () => void;
  onSaved: (id: string) => void;
}) {
  const { state } = useStore();
  const bots = useMemo(() => state.bots.map((bot) => ({ id: bot.id, name: bot.name, section: bot.section })), [state.bots]);
  const botName = useCallback((id: string) => bots.find((bot) => bot.id === id)?.name ?? "", [bots]);

  const canvasRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<StudioDraft | null>(null);
  const [scripts, setScripts] = useState<Record<string, string>>({});
  const [viewport, setViewport] = useState({ x: 80, y: 80, zoom: 1 });
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const [selection, setSelection] = useState<StudioSelection>(null);
  const [balloon, setBalloon] = useState<BalloonState | null>(null);
  const [link, setLink] = useState<Link | null>(null);
  const [pointer, setPointer] = useState<Point | null>(null);
  const linkMoved = useRef(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmBack, setConfirmBack] = useState(false);
  const [noteEditing, setNoteEditing] = useState<string | null>(null);
  const [noteLinkMenu, setNoteLinkMenu] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const showToast = useCallback((text: string) => {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  const edit = useCallback((updater: (current: StudioDraft) => StudioDraft) => {
    setDraft((current) => current ? updater(current) : current);
    setDirty(true);
  }, []);

  const fit = useCallback((next: StudioDraft) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const boxes = [
      ...next.steps.map((step) => next.canvas.nodes[step.id]).filter((node): node is Point => node !== undefined).map((node) => ({ x: node.x, y: node.y, w: CARD_WIDTH, h: CARD_HEIGHT + 75 })),
      ...next.canvas.notes.map((note) => ({ x: note.x, y: note.y, w: note.width, h: note.height })),
      ...next.canvas.containers.map((container) => ({ x: container.x, y: container.y, w: container.width, h: container.height })),
    ];
    if (boxes.length === 0) {
      setViewport({ x: rect.width / 2 - CARD_WIDTH / 2, y: 140, zoom: 1 });
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
      y: (rect.height - 120 - height * zoom) / 2 - minY * zoom + 20,
      zoom,
    });
  }, []);

  useEffect(() => {
    let alive = true;
    setDraft(null);
    setError(null);
    setSelection(null);
    setBalloon(null);
    setScripts({});
    setDirty(false);
    if (workflowId) {
      readWorkflow(workflowId)
        .then(async (detail) => {
          if (!alive) return;
          const next = fromDefinition(detail.workflow);
          setDraft(next);
          const steps = next.steps.filter(isScriptStep);
          if (steps.length > 0) {
            const files = await listScripts(next.id);
            const entries = await Promise.all(files
              .filter((file) => steps.some((step) => step.run === file.name))
              .map(async (file) => [file.name, await readScript(next.id, file.name)] as const));
            if (alive) setScripts(Object.fromEntries(entries));
          }
          requestAnimationFrame(() => fit(next));
        })
        .catch((cause) => { if (alive) setError(message(cause)); });
    } else {
      const next = newDraft(department);
      setDraft(next);
      requestAnimationFrame(() => fit(next));
    }
    return () => { alive = false; };
  }, [workflowId, department, fit]);

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

  const center = useCallback((): Point => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return canvasPoint(rect.left + rect.width / 2, rect.top + (rect.height - 120) / 2);
  }, [canvasPoint]);

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
      const current = draft;
      if (current && link.kind === "flow") {
        const target = entryHit(current.steps, current.canvas.nodes, point, 34 / viewportRef.current.zoom);
        if (target) {
          const result = connect(current, link.from, link.branch, target);
          if (result.ok) {
            edit(() => result.draft);
            showToast(t("studio.toast.connected"));
          } else {
            showToast(t(result.key));
          }
        }
      }
      if (current && link.kind === "note") {
        const target = noteTarget(current, point);
        if (target) {
          edit((value) => updateNote(value, link.noteId, { link: target }));
          showToast(t("studio.toast.noteLinked", { name: targetName(current, target) }));
        } else {
          showToast(t("studio.toast.dropTarget"));
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
  }, [link, draft, canvasPoint, edit, showToast]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setBalloon(null);
        setLink(null);
        setPointer(null);
        setNoteLinkMenu(null);
        setSelection(null);
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest("input,textarea,select,[contenteditable=true]")) return;
      if ((event.key === "Delete" || event.key === "Backspace") && selection) {
        event.preventDefault();
        edit((current) => selection.kind === "step"
          ? removeStep(current, selection.id)
          : selection.kind === "note" ? removeNote(current, selection.id) : removeContainer(current, selection.id));
        setSelection(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, edit]);

  const add = useCallback((kind: StudioKind, clientX?: number, clientY?: number) => {
    if (!draft) return;
    if (clientX !== undefined && clientY !== undefined && !overCanvas(clientX, clientY)) {
      showToast(t("studio.toast.outside"));
      return;
    }
    const base = center();
    const point = clientX !== undefined && clientY !== undefined
      ? canvasPoint(clientX, clientY)
      : { x: base.x + (draft.steps.length % 3) * 60, y: base.y + Math.floor(draft.steps.length / 3) * 60 };
    if (kind === "note") {
      const created = createNote(draft, point);
      edit(() => created.draft);
      setSelection({ kind: "note", id: created.noteId });
      setNoteEditing(created.noteId);
      return;
    }
    if (kind === "container") {
      const created = createContainer(draft, point);
      edit(() => created.draft);
      setSelection({ kind: "container", id: created.containerId });
      return;
    }
    const bot = bots.find((candidate) => candidate.section === draft.department) ?? bots[0];
    const created = createStep(draft, kind, point, bot?.id);
    if (kind === "script") {
      const step = created.draft.steps.find((candidate) => candidate.id === created.stepId);
      if (step?.kind === "script") setScripts((current) => ({ ...current, [step.run]: DEFAULT_SCRIPT }));
    }
    const near = nearestFreeOutput(draft, point, 75 / viewportRef.current.zoom);
    if (near) {
      const connected = connect(created.draft, near.from, near.branch, created.stepId);
      edit(() => connected.ok ? connected.draft : created.draft);
    } else {
      edit(() => created.draft);
    }
    setSelection({ kind: "step", id: created.stepId });
    showToast(t("studio.toast.added"));
  }, [draft, bots, overCanvas, canvasPoint, center, edit, showToast]);

  const openBranch = useCallback((step: WorkflowStep, branch: BranchKey, anchor: DOMRect) => {
    setBalloon((current) => current && current.stepId === step.id && current.branch === branch ? null : { stepId: step.id, branch, anchor });
  }, []);

  const startFlow = useCallback((stepId: string, branch: StudioBranch, event: React.PointerEvent) => {
    event.preventDefault();
    setBalloon(null);
    setLink({ kind: "flow", from: stepId, branch });
    setPointer(canvasPoint(event.clientX, event.clientY));
  }, [canvasPoint]);

  const save = async () => {
    if (!draft) return;
    const problem = draftProblem(draft, new Set(bots.map((bot) => bot.id)));
    if (problem) {
      setError(t(problem.key as LocaleKey, problem.params));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const definition = toDefinition(draft);
      const uploads = definition.steps.filter(isScriptStep).map((step) => ({ name: step.run, content: scripts[step.run] ?? DEFAULT_SCRIPT }));
      const saved = draft.version ? await updateWorkflow(definition, uploads) : await createWorkflow(definition, uploads);
      setDraft(fromDefinition(saved));
      setDirty(false);
      showToast(t("studio.saved"));
      onSaved(saved.id);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setSaving(false);
    }
  };

  if (!draft) {
    return (
      <div className="studio-root">
        <div className="studio-loading">{error ? <span className="text-danger">{error}</span> : t("studio.loading")}</div>
      </div>
    );
  }

  const links: Array<{ key: string; path: string; color: string; dashed?: boolean }> = [];
  for (const step of draft.steps) {
    const node = draft.canvas.nodes[step.id];
    if (!node) continue;
    if (step.kind === "condition") {
      if (step.whenTrue) {
        const from = outputPoint(draft, step.id, "true");
        const to = draft.canvas.nodes[step.whenTrue];
        if (from && to) links.push({ key: `${step.id}-true`, path: bezier(from, { x: to.x, y: to.y + 57 }), color: "#868F96" });
      }
      if (step.whenFalse) {
        const from = outputPoint(draft, step.id, "false");
        const to = draft.canvas.nodes[step.whenFalse];
        if (from && to) links.push({ key: `${step.id}-false`, path: bezier(from, { x: to.x, y: to.y + 57 }), color: "#868F96" });
      }
    } else if (step.next) {
      const from = outputPoint(draft, step.id, "run");
      const to = draft.canvas.nodes[step.next];
      if (from && to) links.push({ key: `${step.id}-run`, path: bezier(from, { x: to.x, y: to.y + 57 }), color: "#868F96" });
    }
  }
  const noteLinks: Array<{ key: string; path: string }> = [];
  for (const note of draft.canvas.notes) {
    if (!note.link) continue;
    const anchor = noteAnchor(note);
    const step = note.link.kind === "step" ? draft.steps.find((candidate) => candidate.id === note.link!.id) : undefined;
    const container = note.link.kind === "container" ? draft.canvas.containers.find((candidate) => candidate.id === note.link!.id) : undefined;
    const node = step ? draft.canvas.nodes[step.id] : undefined;
    const box = node ? { x: node.x, y: node.y, width: CARD_WIDTH, height: CARD_HEIGHT } : container;
    if (!box) continue;
    const target = noteLinkTarget(note, box, container !== undefined);
    noteLinks.push({ key: note.id, path: bezier(anchor, target) });
  }
  const selected = selection;
  const activeLink = link && pointer
    ? link.kind === "flow"
      ? (() => {
        const from = outputPoint(draft, link.from, link.branch);
        return from ? { path: bezier(from, pointer), color: "#5856CB", dashed: true } : undefined;
      })()
      : (() => {
        const note = draft.canvas.notes.find((candidate) => candidate.id === link.noteId);
        return note ? { path: bezier(noteAnchor(note), pointer), color: "#A87A30", dashed: true } : undefined;
      })()
    : undefined;
  const balloonStep = balloon ? draft.steps.find((step) => step.id === balloon.stepId) : undefined;

  return (
    <div className="studio-root">
      <div
        ref={canvasRef}
        className="studio-canvas"
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
              <marker id="studio-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#868F96" />
              </marker>
            </defs>
            {links.map((edge) => <path key={edge.key} d={edge.path} stroke={edge.color} markerEnd="url(#studio-arrow)" />)}
            {noteLinks.map((edge) => <path key={edge.key} d={edge.path} className="studio-note-link" />)}
            {activeLink && <path d={activeLink.path} stroke={activeLink.color} className={cn("studio-link-active", activeLink.dashed && "studio-link-dashed")} />}
          </svg>

          {draft.canvas.containers.map((container) => (
            <StudioContainer
              key={container.id}
              container={container}
              selected={selected?.kind === "container" && selected.id === container.id}
              onSelect={() => setSelection({ kind: "container", id: container.id })}
              onDragStart={(event) => {
                const inside = containedBy(draft, container.id);
                const steps = Object.fromEntries(inside.steps.map((id) => [id, draft.canvas.nodes[id]!]));
                const notes = Object.fromEntries(inside.notes.map((id) => {
                  const note = draft.canvas.notes.find((candidate) => candidate.id === id)!;
                  return [id, { x: note.x, y: note.y }];
                }));
                setDrag({ kind: "container", id: container.id, startX: event.clientX, startY: event.clientY, originX: container.x, originY: container.y, steps, notes });
              }}
              onResizeStart={(event) => setDrag({ kind: "resize-container", id: container.id, startX: event.clientX, startY: event.clientY, width: container.width, height: container.height })}
              onRename={(name) => edit((current) => renameContainer(current, container.id, name))}
              onDelete={() => { edit((current) => removeContainer(current, container.id)); setSelection(null); }}
            />
          ))}

          {draft.steps.map((step, index) => (
            <StudioCard
              key={step.id}
              draft={draft}
              step={step}
              index={index}
              selected={selected?.kind === "step" && selected.id === step.id}
              botName={botName}
              onSelect={() => setSelection({ kind: "step", id: step.id })}
              onDragStart={(event) => {
                const node = draft.canvas.nodes[step.id];
                if (node) setDrag({ kind: "step", id: step.id, startX: event.clientX, startY: event.clientY, originX: node.x, originY: node.y });
              }}
              onEntry={() => {
                if (link?.kind !== "flow" || !draft) return;
                const result = connect(draft, link.from, link.branch, step.id);
                if (result.ok) {
                  edit(() => result.draft);
                  showToast(t("studio.toast.connected"));
                } else {
                  showToast(t(result.key));
                }
                setLink(null);
                setPointer(null);
              }}
              onBranch={(branch, anchor) => openBranch(step, branch, anchor)}
              onPort={(branch, event) => startFlow(step.id, branch, event)}
              onRename={(name) => edit((current) => updateStep(current, step.id, { name } as Partial<WorkflowStep>))}
              onDuplicate={() => {
                const created = createStep(draft, step.kind === "bot" ? "agent" : step.kind, {
                  x: (draft.canvas.nodes[step.id]?.x ?? 0) + CARD_WIDTH / 2 + 46,
                  y: (draft.canvas.nodes[step.id]?.y ?? 0) + CARD_HEIGHT / 2 + 220,
                }, step.kind === "bot" ? step.botId : undefined);
                const copy = created.draft.steps.find((candidate) => candidate.id === created.stepId);
                if (!copy) return;
                const runName = copy.kind === "script" ? copy.run : undefined;
                if (step.kind === "script" && runName) {
                  setScripts((current) => ({ ...current, [runName]: current[step.run] ?? DEFAULT_SCRIPT }));
                }
                const clone: WorkflowStep = step.kind === "condition"
                  ? { ...step, id: copy.id, name: copy.name, whenTrue: undefined, whenFalse: undefined, onFailure: undefined }
                  : step.kind === "script" && runName
                    ? { ...step, id: copy.id, name: copy.name, run: runName, next: undefined, onFailure: undefined }
                    : { ...step, id: copy.id, name: copy.name, next: undefined, onFailure: undefined } as WorkflowStep;
                edit(() => ({ ...created.draft, steps: created.draft.steps.map((candidate) => candidate.id === copy.id ? clone : candidate) }));
                setSelection({ kind: "step", id: copy.id });
              }}
              onDelete={() => { edit((current) => removeStep(current, step.id)); setSelection(null); setBalloon(null); }}
            />
          ))}

          {draft.canvas.notes.map((note) => (
            <StudioNote
              key={note.id}
              draft={draft}
              note={note}
              selected={selected?.kind === "note" && selected.id === note.id}
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

        <header className="studio-bar">
          <button type="button" className="studio-back" onClick={() => { if (dirty) setConfirmBack(true); else onBack(); }}>
            <ArrowLeft size={14} aria-hidden="true" />
            {t("studio.back")}
          </button>
          <input
            className="studio-name"
            value={draft.name}
            placeholder={t("studio.untitled")}
            aria-label={t("studio.name")}
            onChange={(event) => edit((current) => ({ ...current, name: event.target.value }))}
          />
          <label className="studio-department">
            <span>{t("studio.department")}</span>
            <input value={draft.department} onChange={(event) => edit((current) => ({ ...current, department: event.target.value }))} />
          </label>
          <span className="studio-bar-spacer" />
          {dirty && <span className="studio-dirty">{t("studio.unsaved")}</span>}
          <button type="button" className="studio-save" disabled={saving} onClick={() => void save()}>
            <Check size={14} aria-hidden="true" />
            {saving ? t("studio.saving") : t("studio.save")}
          </button>
        </header>

        {error && (
          <div className="studio-error" role="alert">
            {error}
            <button type="button" aria-label={t("studio.balloon.close")} onClick={() => setError(null)}><X size={13} aria-hidden="true" /></button>
          </div>
        )}

        <StudioPalette onActivate={(kind) => add(kind)} onDrop={(kind, x, y) => add(kind, x, y)} />

        {balloon && balloonStep && (
          <StudioBalloon
            draft={draft}
            step={balloonStep}
            branch={balloon.branch}
            anchor={balloon.anchor}
            bots={bots}
            scripts={scripts}
            onChange={(patch) => edit((current) => updateStep(current, balloonStep.id, patch))}
            onScript={(name, content) => setScripts((current) => ({ ...current, [name]: content }))}
            onToast={(key) => showToast(t(key))}
            onClose={() => setBalloon(null)}
          />
        )}

        {toast && <div className="studio-toast" role="status">{toast}</div>}

        {confirmBack && (
          <div className="studio-confirm" role="dialog" aria-modal="true">
            <div className="studio-confirm-card">
              <p>{t("studio.discard")}</p>
              <div>
                <button type="button" onClick={() => setConfirmBack(false)}>{t("workflows.dialog.cancel")}</button>
                <button type="button" className="studio-confirm-danger" onClick={onBack}>{t("studio.discardConfirm")}</button>
              </div>
            </div>
          </div>
        )}
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

function targetName(draft: StudioDraft, target: { kind: "step" | "container"; id: string }): string {
  return target.kind === "step"
    ? draft.steps.find((step) => step.id === target.id)?.name ?? target.id
    : draft.canvas.containers.find((container) => container.id === target.id)?.name ?? target.id;
}

function nearestFreeOutput(draft: StudioDraft, point: Point, radius: number): { from: string; branch: StudioBranch } | undefined {
  let best: { from: string; branch: StudioBranch; distance: number } | undefined;
  for (const step of draft.steps) {
    const branches: StudioBranch[] = step.kind === "condition" ? ["true", "false"] : ["run"];
    for (const branch of branches) {
      const taken = step.kind === "condition"
        ? (branch === "true" ? step.whenTrue !== undefined : step.whenFalse !== undefined)
        : step.next !== undefined;
      if (taken) continue;
      const output = outputPoint(draft, step.id, branch);
      if (!output) continue;
      const distance = Math.hypot(output.x - point.x, output.y - point.y);
      if (distance <= radius && (!best || distance < best.distance)) best = { from: step.id, branch, distance };
    }
  }
  return best ? { from: best.from, branch: best.branch } : undefined;
}
