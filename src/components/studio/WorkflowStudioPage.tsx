import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, Plus, X } from "lucide-react";

import { WORKFLOW_TRIGGER_MAX, isBotStep, isScriptStep, workflowAllSteps, type WorkflowParameter, type WorkflowSkillOptions, type WorkflowStep } from "../../../shared/workflow";
import type { WorkflowTrigger } from "../../../shared/workflow-trigger";
import { parseWorkflowRefusal } from "../../../shared/workflow-refusal";
import type { LocaleKey } from "@/locales";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { useStore } from "@/state/store";
import { ApiError } from "@/state/api";
import {
  createWorkflow, deleteWorkflowTrigger, listScripts, listWorkflowTriggers, prepareEnvironment, readEnvironment, readScript, readWorkflow,
  readWorkflowSkillOptions, updateWorkflow, type WorkflowEnvironmentStatus,
} from "@/lib/workflows-api";
import { StudioBalloon, type BalloonFocus } from "./StudioBalloon";
import { StudioCard, type BranchKey } from "./StudioCard";
import { StudioContainer } from "./StudioContainer";
import { StudioLoopModal } from "./StudioLoopModal";
import { StudioNote } from "./StudioNote";
import { StudioPalette } from "./StudioPalette";
import { StudioProblemsPanel, type StudioProblems } from "./StudioProblemsPanel";
import { StudioTriggerCard, StudioTriggerInspector } from "./StudioTrigger";
import { bezier, entryHit, entryPoint, noteAnchor, noteLinkTarget, outputPoint, type Point } from "./studio-geometry";
import {
  CARD_HEIGHT, CARD_WIDTH, DEFAULT_SCRIPT, TRIGGER_GAP, TRIGGER_HEIGHT, TRIGGER_WIDTH, addTrigger, allDraftSteps, consumedOutputs, containedBy, connect, createContainer, createNote, createStep,
  disconnect, draftProblems, draftWarnings, duplicateLoop, fromDefinition, inputsBranch, legacyFields, moveContainer, moveNode, moveNote, newDraft,
  removeContainer, removeNote, removeStep, removeTrigger, renameContainer, renameScript, resizeContainer, resizeNote, targetForPath, toDefinition,
  triggerPoint, updateNote, updateStep, updateTrigger, type StudioBranch, type StudioDraft, type StudioKind, type StudioSelection, type StudioTarget,
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
  const [triggerInspector, setTriggerInspector] = useState<string | null>(null);
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
  const [editingLoop, setEditingLoop] = useState<string | null>(null);
  const [skillOptions, setSkillOptions] = useState<Record<string, WorkflowSkillOptions>>({});
  const [skillOptionsLoading, setSkillOptionsLoading] = useState<Record<string, boolean>>({});
  const [skillOptionsError, setSkillOptionsError] = useState<Record<string, string>>({});
  const skillOptionsCache = useRef(new Map<string, WorkflowSkillOptions>());
  const skillOptionsPending = useRef(new Set<string>());
  const toastTimer = useRef<number | undefined>(undefined);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [problems, setProblems] = useState<StudioProblems | null>(null);
  const [problemsToken, setProblemsToken] = useState(0);
  const [focusRequest, setFocusRequest] = useState<(BalloonFocus & { stepId: string }) | null>(null);
  const [loopFocus, setLoopFocus] = useState<(StudioTarget & { token: number }) | null>(null);
  const [legacyIndex, setLegacyIndex] = useState(0);
  const [runtimeTriggers, setRuntimeTriggers] = useState<Record<string, WorkflowTrigger>>({});
  const [environment, setEnvironment] = useState<WorkflowEnvironmentStatus | null>(null);
  const [preparingEnvironment, setPreparingEnvironment] = useState(false);

  const showToast = useCallback((text: string) => {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  const edit = useCallback((updater: (current: StudioDraft) => StudioDraft) => {
    setDraft((current) => current ? updater(current) : current);
    setDirty(true);
  }, []);

  const loadSkillOptions = useCallback((botId: string) => {
    if (!botId || skillOptionsCache.current.has(botId) || skillOptionsPending.current.has(botId)) return;
    skillOptionsPending.current.add(botId);
    setSkillOptionsLoading((current) => ({ ...current, [botId]: true }));
    setSkillOptionsError((current) => {
      if (!(botId in current)) return current;
      const { [botId]: _removed, ...rest } = current;
      return rest;
    });
    readWorkflowSkillOptions(botId)
      .then((options) => {
        skillOptionsCache.current.set(botId, options);
        setSkillOptions((current) => ({ ...current, [botId]: options }));
      })
      .catch((cause) => {
        setSkillOptionsError((current) => ({ ...current, [botId]: message(cause) }));
      })
      .finally(() => {
        skillOptionsPending.current.delete(botId);
        setSkillOptionsLoading((current) => {
          if (!(botId in current)) return current;
          const { [botId]: _removed, ...rest } = current;
          return rest;
        });
      });
  }, []);

  const refreshEnvironment = useCallback(() => {
    readEnvironment().then(setEnvironment).catch(() => setEnvironment(null));
  }, []);

  const prepare = useCallback(() => {
    setPreparingEnvironment(true);
    prepareEnvironment()
      .then((prepared) => {
        if (!prepared.ok) showToast(prepared.tail ?? t("studio.env.failed"));
      })
      .catch((cause) => showToast(message(cause)))
      .finally(() => {
        setPreparingEnvironment(false);
        refreshEnvironment();
      });
  }, [refreshEnvironment, showToast]);

  useEffect(() => { refreshEnvironment(); }, [refreshEnvironment]);

  const botIds = useMemo(() => new Set(bots.map((bot) => bot.id)), [bots]);
  const startParameters = useMemo<WorkflowParameter[]>(() => {
    if (!draft) return [];
    const seen = new Set<string>();
    const list: WorkflowParameter[] = [];
    for (const step of workflowAllSteps(toDefinition(draft))) {
      if (step.kind !== "bot" && step.kind !== "script") continue;
      for (const parameter of step.parameters ?? []) {
        if (parameter.from !== undefined || parameter.collectedBy !== undefined || seen.has(parameter.name)) continue;
        seen.add(parameter.name);
        list.push(parameter);
      }
    }
    return list;
  }, [draft]);
  const issues = useMemo(() => draft ? draftProblems(draft, botIds, skillOptions) : [], [draft, botIds, skillOptions]);
  const triggerIssueIndexes = useMemo(() => new Set(issues
    .filter((issue) => issue.path.startsWith("triggers."))
    .map((issue) => Number(issue.path.split(".")[1]))
    .filter((index) => Number.isInteger(index))), [issues]);
  const clientWarnings = useMemo(() => draft ? draftWarnings(draft) : [], [draft]);
  const consumed = useMemo(() => draft ? consumedOutputs(draft) : new Set<string>(), [draft]);
  const legacy = useMemo(() => draft ? legacyFields(draft) : [], [draft]);
  const saveBlockedTitle = issues.length === 0 ? undefined : issues.length === 1
    ? t("studio.saveBlockedTooltipOne", { paths: issues[0]!.path })
    : t("studio.saveBlockedTooltip", { count: issues.length, paths: issues.slice(0, 3).map((issue) => issue.path).join(", ") });

  const showProblemList = useCallback((next: StudioProblems) => {
    setProblems(next);
    setProblemsToken((token) => token + 1);
  }, []);

  const showDraftIssues = useCallback((errors: typeof issues, warnings: typeof clientWarnings) => {
    showProblemList({
      errors: errors.map((issue) => ({ path: issue.path, message: t(issue.key as LocaleKey, issue.params) })),
      warnings: warnings.map((issue) => ({ path: issue.path, message: t(issue.key as LocaleKey, issue.params) })),
    });
  }, [showProblemList]);

  const reveal = useCallback((target: StudioTarget | undefined) => {
    setProblems(null);
    setTriggerInspector(null);
    if (target === undefined) return;
    setSelection({ kind: "step", id: target.stepId });
    if (target.loopId !== undefined) {
      setBalloon(null);
      setEditingLoop(target.loopId);
      setLoopFocus({ ...target, token: Date.now() });
      return;
    }
    const card = document.querySelector(`[data-studio-step="${target.stepId}"]`);
    const anchor = card?.getBoundingClientRect() ?? new DOMRect(window.innerWidth / 2, 240, 0, 0);
    setLoopFocus(null);
    setBalloon({ stepId: target.stepId, branch: target.branch, anchor });
    setFocusRequest({ stepId: target.stepId, field: target.field, token: Date.now() });
  }, []);

  const revealPath = useCallback((path: string) => {
    if (path === "name") {
      setProblems(null);
      nameInputRef.current?.focus();
      return;
    }
    if (path === "triggers" || path.startsWith("triggers.")) {
      const index = path === "triggers" ? 0 : Number(path.split(".")[1]);
      const trigger = Number.isInteger(index) ? draft?.triggers[index] : undefined;
      if (trigger) {
        setProblems(null);
        setBalloon(null);
        setSelection(null);
        setTriggerInspector(trigger.id);
      }
      return;
    }
    reveal(targetForPath(draft?.steps ?? [], path));
  }, [draft, reveal]);

  const reviewLegacy = useCallback(() => {
    const field = legacy[legacyIndex % Math.max(1, legacy.length)];
    if (field === undefined) return;
    setLegacyIndex((index) => index + 1);
    reveal(field.target);
  }, [legacy, legacyIndex, reveal]);

  const openInputs = useCallback((stepId: string, field: string) => {
    const step = draft?.steps.find((candidate) => candidate.id === stepId);
    if (step === undefined) return;
    const card = document.querySelector(`[data-studio-step="${stepId}"]`);
    const anchor = card?.getBoundingClientRect() ?? new DOMRect(window.innerWidth / 2, 240, 0, 0);
    setBalloon({ stepId, branch: inputsBranch(step), anchor });
    setFocusRequest({ stepId, field, token: Date.now() });
  }, [draft]);

  const fit = useCallback((next: StudioDraft) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const boxes = [
      ...next.steps.map((step) => next.canvas.nodes[step.id]).filter((node): node is Point => node !== undefined).map((node) => ({ x: node.x, y: node.y, w: CARD_WIDTH, h: CARD_HEIGHT + 75 })),
      ...next.canvas.notes.map((note) => ({ x: note.x, y: note.y, w: note.width, h: note.height })),
      ...next.canvas.containers.map((container) => ({ x: container.x, y: container.y, w: container.width, h: container.height })),
      ...triggerBoxes(next),
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
    setTriggerInspector(null);
    setScripts({});
    setDirty(false);
    if (workflowId) {
      readWorkflow(workflowId)
        .then(async (detail) => {
          if (!alive) return;
          const next = fromDefinition(detail.workflow);
          setDraft(next);
          for (const step of allDraftSteps(next)) {
            if (isBotStep(step) && step.botId) loadSkillOptions(step.botId);
          }
          const steps = allDraftSteps(next).filter(isScriptStep);
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
  }, [workflowId, department, fit, loadSkillOptions]);

  const draftId = draft?.id;
  const draftVersion = draft?.version;
  const triggerLinkSignature = draft?.triggers.map((trigger) => `${trigger.id}:${trigger.triggerId ?? ""}`).join("|") ?? "";
  useEffect(() => {
    if (!draftId || draftVersion === undefined) {
      setRuntimeTriggers({});
      return;
    }
    let alive = true;
    listWorkflowTriggers(draftId, { background: true })
      .then((triggers) => {
        if (!alive) return;
        setRuntimeTriggers(() => {
          const next: Record<string, WorkflowTrigger> = {};
          for (const trigger of triggers) {
            if (trigger.nodeId) next[trigger.nodeId] = trigger;
          }
          for (const node of draft?.triggers ?? []) {
            if (!node.triggerId) continue;
            const found = triggers.find((trigger) => trigger.id === node.triggerId);
            if (found) next[node.id] = found;
          }
          return next;
        });
      })
      .catch(() => { if (alive) setRuntimeTriggers({}); });
    return () => { alive = false; };
  }, [draftId, draftVersion, triggerLinkSignature]);

  const setRuntimeForNode = useCallback((nodeId: string, trigger: WorkflowTrigger | null) => {
    setRuntimeTriggers((current) => {
      const next = { ...current };
      if (trigger) next[nodeId] = trigger;
      else delete next[nodeId];
      return next;
    });
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
        if (problems !== null) {
          setProblems(null);
          return;
        }
        if (triggerInspector !== null) {
          setTriggerInspector(null);
          return;
        }
        if (balloon !== null) {
          setBalloon(null);
          return;
        }
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
  }, [selection, edit, problems, balloon, triggerInspector]);

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

  const addTriggerNode = useCallback(() => {
    if (!draft) return;
    const next = addTrigger(draft);
    if (next === draft) {
      showToast(t("studio.trigger.needMax", { max: WORKFLOW_TRIGGER_MAX }));
      return;
    }
    edit(() => next);
    setTriggerInspector(next.triggers[next.triggers.length - 1]!.id);
  }, [draft, edit, showToast]);

  const deleteTrigger = useCallback((triggerId: string) => {
    if (!draft) return;
    const result = removeTrigger(draft, triggerId);
    if (!result.ok) {
      showToast(t(result.key));
      return;
    }
    edit(() => result.draft);
    setTriggerInspector((current) => current === triggerId ? null : current);
  }, [draft, edit]);

  const openBranch = useCallback((step: WorkflowStep, branch: BranchKey, anchor: DOMRect) => {
    if (step.kind === "bot" && step.botId) loadSkillOptions(step.botId);
    setTriggerInspector(null);
    setBalloon((current) => current && current.stepId === step.id && current.branch === branch ? null : { stepId: step.id, branch, anchor });
  }, [loadSkillOptions]);

  const startFlow = useCallback((stepId: string, branch: StudioBranch, event: React.PointerEvent) => {
    event.preventDefault();
    setBalloon(null);
    setLink({ kind: "flow", from: stepId, branch });
    setPointer(canvasPoint(event.clientX, event.clientY));
  }, [canvasPoint]);

  const save = async () => {
    if (!draft) return;
    const current = draftProblems(draft, botIds, skillOptions);
    if (current.length > 0) {
      showDraftIssues(current, clientWarnings);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const definition = toDefinition(draft);
      const uploads = workflowAllSteps(definition).filter(isScriptStep).map((step) => ({ name: step.run, content: scripts[step.run] ?? DEFAULT_SCRIPT }));
      const saved = draft.version ? await updateWorkflow(definition, uploads) : await createWorkflow(definition, uploads);
      const savedDraft = fromDefinition(saved.workflow);
      setDraft(savedDraft);
      for (const [nodeId, runtime] of Object.entries(runtimeTriggers)) {
        const node = savedDraft.triggers.find((trigger) => trigger.id === nodeId);
        if (node?.kind === "webhook") continue;
        deleteWorkflowTrigger(saved.workflow.id, runtime.id)
          .then(() => setRuntimeForNode(nodeId, null))
          .catch((cause) => showToast(message(cause)));
      }
      setDirty(false);
      showToast(t("studio.saved"));
      refreshEnvironment();
      if (saved.warnings.length > 0) {
        // A save with warnings keeps the editor open: the list would hide what to review.
        showProblemList({ errors: [], warnings: saved.warnings.map((issue) => ({ path: issue.path, message: issue.message })) });
      } else {
        onSaved(saved.workflow.id);
      }
    } catch (cause) {
      const refusal = cause instanceof ApiError ? parseWorkflowRefusal(cause.body) : undefined;
      if (refusal?.authoring !== undefined) {
        showProblemList({ errors: refusal.authoring.errors, warnings: refusal.authoring.warnings });
      } else {
        setError(message(cause));
      }
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
        if (from && to) links.push({ key: `${step.id}-true`, path: bezier(from, { x: to.x, y: to.y + 57 }), color: "var(--color-ink-tertiary)" });
      }
      if (step.whenFalse) {
        const from = outputPoint(draft, step.id, "false");
        const to = draft.canvas.nodes[step.whenFalse];
        if (from && to) links.push({ key: `${step.id}-false`, path: bezier(from, { x: to.x, y: to.y + 57 }), color: "var(--color-ink-tertiary)" });
      }
      if (step.onFailure) {
        const from = outputPoint(draft, step.id, "failure");
        const to = draft.canvas.nodes[step.onFailure];
        if (from && to) links.push({ key: `${step.id}-failure`, path: bezier(from, { x: to.x, y: to.y + 57 }), color: "var(--color-danger)" });
      }
    } else {
      if (typeof step.onSuccess === "string") {
        const from = outputPoint(draft, step.id, "run");
        const to = draft.canvas.nodes[step.onSuccess];
        if (from && to) links.push({ key: `${step.id}-run`, path: bezier(from, { x: to.x, y: to.y + 57 }), color: "var(--color-ink-tertiary)" });
      }
      if (step.onFailure) {
        const from = outputPoint(draft, step.id, "failure");
        const to = draft.canvas.nodes[step.onFailure];
        if (from && to) links.push({ key: `${step.id}-failure`, path: bezier(from, { x: to.x, y: to.y + 57 }), color: "var(--color-danger)" });
      }
      if (step.kind !== "loop" && step.onTimeout) {
        const from = outputPoint(draft, step.id, "timeout");
        const to = draft.canvas.nodes[step.onTimeout];
        if (from && to) links.push({ key: `${step.id}-timeout`, path: bezier(from, { x: to.x, y: to.y + 57 }), color: "var(--studio-node-condition)" });
      }
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
        return from ? { path: bezier(from, pointer), color: "var(--studio-node-bot)", dashed: true } : undefined;
      })()
      : (() => {
        const note = draft.canvas.notes.find((candidate) => candidate.id === link.noteId);
        return note ? { path: bezier(noteAnchor(note), pointer), color: "var(--studio-note)", dashed: true } : undefined;
      })()
    : undefined;
  const balloonStep = balloon ? draft.steps.find((step) => step.id === balloon.stepId) : undefined;
  const triggerRow = draft.triggers.length > 0 ? triggerPoint(draft, 0) : undefined;
  const triggerRailY = triggerRow ? triggerRow.y + TRIGGER_HEIGHT + 16 : 0;
  const firstNode = draft.steps[0] ? draft.canvas.nodes[draft.steps[0].id] : undefined;
  const triggerLink = triggerRow ? {
    railY: triggerRailY,
    left: firstNode ? firstNode.x : triggerRow.x + TRIGGER_WIDTH / 2,
    right: triggerRow.x + (draft.triggers.length - 1) * (TRIGGER_WIDTH + TRIGGER_GAP) + TRIGGER_WIDTH / 2,
    entryY: firstNode ? entryPoint(firstNode).y : undefined,
  } : undefined;
  const inspectorTrigger = triggerInspector ? draft.triggers.find((trigger) => trigger.id === triggerInspector) : undefined;
  const addTriggerPoint = triggerPoint(draft, draft.triggers.length);

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
          setTriggerInspector(null);
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
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-ink-tertiary)" />
              </marker>
            </defs>
            {links.map((edge) => <path key={edge.key} d={edge.path} stroke={edge.color} markerEnd="url(#studio-arrow)" />)}
            {noteLinks.map((edge) => <path key={edge.key} d={edge.path} className="studio-note-link" />)}
            {triggerLink && draft.triggers.map((trigger, index) => {
              const point = triggerPoint(draft, index);
              return <path key={`trigger-${trigger.id}`} d={`M ${point.x + TRIGGER_WIDTH / 2} ${point.y + TRIGGER_HEIGHT} L ${point.x + TRIGGER_WIDTH / 2} ${triggerLink.railY}`} className="studio-trigger-link" />;
            })}
            {triggerLink && (
              <>
                <path d={`M ${triggerLink.left} ${triggerLink.railY} L ${triggerLink.right} ${triggerLink.railY}`} className="studio-trigger-link" />
                {triggerLink.entryY !== undefined && (
                  <path
                    d={`M ${triggerLink.left} ${triggerLink.railY} L ${triggerLink.left} ${triggerLink.entryY}`}
                    className="studio-trigger-link studio-trigger-drop"
                    markerEnd="url(#studio-arrow)"
                  />
                )}
              </>
            )}
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

          {triggerRow && (
            <div className="studio-trigger-track" style={{ left: triggerRow.x, top: triggerRow.y - 22 }}>
              <span className="studio-trigger-track-label">{t("studio.trigger.track")}</span>
            </div>
          )}

          {draft.triggers.map((trigger, index) => (
            <StudioTriggerCard
              key={trigger.id}
              trigger={trigger}
              point={triggerPoint(draft, index)}
              selected={triggerInspector === trigger.id}
              invalid={triggerIssueIndexes.has(index)}
              runtime={runtimeTriggers[trigger.id]}
              currentVersion={draft.version}
              onOpen={() => {
                setBalloon(null);
                setSelection(null);
                setTriggerInspector(trigger.id);
              }}
            />
          ))}

          <button
            type="button"
            className="studio-trigger-add"
            style={{ left: addTriggerPoint.x, top: addTriggerPoint.y }}
            aria-label={t("studio.trigger.add")}
            onClick={addTriggerNode}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <Plus size={14} aria-hidden="true" />
            {t("studio.trigger.add")}
          </button>

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
              onExpand={step.kind === "loop" ? () => setEditingLoop(step.id) : undefined}
              onRename={(name) => edit((current) => updateStep(current, step.id, { name } as Partial<WorkflowStep>))}
              onDuplicate={() => {
                if (step.kind === "loop") {
                  const node = draft.canvas.nodes[step.id];
                  const copy = duplicateLoop(draft, step.id, {
                    x: (node?.x ?? 0) + CARD_WIDTH / 2 + 46,
                    y: (node?.y ?? 0) + CARD_HEIGHT / 2 + 220,
                  });
                  if (!copy) return;
                  edit(() => copy.draft);
                  setSelection({ kind: "step", id: copy.stepId });
                  return;
                }
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
                    ? { ...step, id: copy.id, name: copy.name, run: runName, onSuccess: undefined, onFailure: undefined, onTimeout: undefined }
                    : { ...step, id: copy.id, name: copy.name, onSuccess: undefined, onFailure: undefined, onTimeout: undefined } as WorkflowStep;
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
            ref={nameInputRef}
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
          <button
            type="button"
            className={cn("studio-save", issues.length > 0 && "studio-save-blocked")}
            disabled={saving}
            aria-disabled={issues.length > 0}
            aria-describedby={issues.length > 0 ? "studio-save-problems" : undefined}
            title={saveBlockedTitle}
            onClick={() => {
              if (issues.length > 0) showDraftIssues(issues, clientWarnings);
              else void save();
            }}
          >
            <Check size={14} aria-hidden="true" />
            {saving ? t("studio.saving") : issues.length > 0
              ? (issues.length === 1 ? t("studio.saveProblemsOne") : t("studio.saveProblems", { count: issues.length }))
              : t("studio.save")}
          </button>
          {issues.length > 0 && <span id="studio-save-problems" className="sr-only">{saveBlockedTitle}</span>}
        </header>

        {legacy.length > 0 && (
          <div className="studio-legacy-strip" role="status">
            <AlertTriangle size={13} aria-hidden="true" />
            <span>{t("studio.legacy.banner", { count: legacy.length })}</span>
            <button type="button" onClick={reviewLegacy}>{t("studio.legacy.review")}</button>
          </div>
        )}

        {error && (
          <div className="studio-error" role="alert">
            {error}
            <button type="button" aria-label={t("studio.balloon.close")} onClick={() => setError(null)}><X size={13} aria-hidden="true" /></button>
          </div>
        )}

        <StudioPalette onActivate={(kind) => add(kind)} onDrop={(kind, x, y) => add(kind, x, y)} />

        {problems !== null && (
          <StudioProblemsPanel
            key={problemsToken}
            problems={problems}
            onOpen={(item) => revealPath(item.path)}
            onClose={() => setProblems(null)}
          />
        )}

        {inspectorTrigger && (
          <StudioTriggerInspector
            trigger={inspectorTrigger}
            count={draft.triggers.length}
            workflowId={draft.version ? draft.id : undefined}
            workflowVersion={draft.version}
            parameters={startParameters}
            runtime={runtimeTriggers[inspectorTrigger.id]}
            onChange={(patch) => edit((current) => updateTrigger(current, inspectorTrigger.id, patch))}
            onRuntime={(trigger) => setRuntimeForNode(inspectorTrigger.id, trigger)}
            onDelete={() => deleteTrigger(inspectorTrigger.id)}
            onClose={() => setTriggerInspector(null)}
          />
        )}

        {balloon && balloonStep && (
          <StudioBalloon
            draft={draft}
            step={balloonStep}
            branch={balloon.branch}
            anchor={balloon.anchor}
            bots={bots}
            scripts={scripts}
            skillOptions={balloonStep.kind === "bot" ? skillOptions[balloonStep.botId] : undefined}
            skillOptionsLoading={balloonStep.kind === "bot" ? skillOptionsLoading[balloonStep.botId] : undefined}
            skillOptionsError={balloonStep.kind === "bot" ? skillOptionsError[balloonStep.botId] : undefined}
            environment={environment ?? undefined}
            preparingEnvironment={preparingEnvironment}
            onPrepareEnvironment={prepare}
            consumed={consumed}
            focus={focusRequest?.stepId === balloonStep.id ? focusRequest : undefined}
            onChange={(patch) => {
              edit((current) => updateStep(current, balloonStep.id, patch));
              const nextBotId = (patch as { botId?: unknown }).botId;
              if (balloonStep.kind === "bot" && typeof nextBotId === "string") loadSkillOptions(nextBotId);
            }}
            onScript={(name, content) => setScripts((current) => ({ ...current, [name]: content }))}
            onRenameScript={(from, to) => setScripts((current) => renameScript(current, from, to))}
            onToast={(key) => showToast(t(key))}
            onDisconnect={(branch) => edit((current) => disconnect(current, balloonStep.id, branch))}
            onOpenInputs={(field) => openInputs(balloonStep.id, field)}
            onClose={() => setBalloon(null)}
          />
        )}

        {editingLoop && (
          <StudioLoopModal
            draft={draft}
            loopId={editingLoop}
            bots={bots}
            scripts={scripts}
            skillOptions={skillOptions}
            skillOptionsLoading={skillOptionsLoading}
            skillOptionsError={skillOptionsError}
            environment={environment ?? undefined}
            preparingEnvironment={preparingEnvironment}
            onPrepareEnvironment={prepare}
            consumed={consumed}
            focusTarget={loopFocus?.loopId === editingLoop ? loopFocus : null}
            onEdit={edit}
            onScript={(name, content) => setScripts((current) => ({ ...current, [name]: content }))}
            onRenameScript={(from, to) => setScripts((current) => renameScript(current, from, to))}
            onToast={(key, params) => showToast(t(key, params))}
            onClose={() => { setEditingLoop(null); setLoopFocus(null); }}
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

function triggerBoxes(draft: StudioDraft): Array<{ x: number; y: number; w: number; h: number }> {
  const first = triggerPoint(draft, 0);
  const last = triggerPoint(draft, draft.triggers.length);
  return [{ x: first.x - 8, y: first.y - 26, w: last.x + 150 - first.x, h: TRIGGER_HEIGHT + 34 }];
}

function nearestFreeOutput(draft: StudioDraft, point: Point, radius: number): { from: string; branch: StudioBranch } | undefined {
  let best: { from: string; branch: StudioBranch; distance: number } | undefined;
  for (const step of draft.steps) {
    const branches: StudioBranch[] = step.kind === "condition" ? ["true", "false", "failure"]
      : step.kind === "loop" ? ["run", "failure"]
        : ["run", "failure", "timeout"];
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
