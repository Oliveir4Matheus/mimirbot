// The Studio's draft: the real WorkflowDefinition plus the canvas the engine
// ignores. Everything here is pure, so a connection rule is testable without a
// DOM, a disk or a server.
import type { LocaleKey } from "@/locales";
import {
  isWorkflowScriptName,
  type ConditionOp,
  type WorkflowCanvas,
  type WorkflowDefinition,
  type WorkflowStep,
} from "../../../shared/workflow";

export type StudioKind = "agent" | "script" | "condition" | "note" | "container";
export type StudioBranch = "run" | "failure" | "timeout" | "true" | "false";
export type StudioSelection = { kind: "step" | "note" | "container"; id: string } | null;

export interface StudioDraft {
  id: string;
  version?: number;
  name: string;
  department: string;
  retentionDays: number;
  steps: WorkflowStep[];
  canvas: WorkflowCanvas;
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_INSTRUCTIONS = "Analise os dados de entrada e identifique os pontos relevantes.";
export const DEFAULT_SCRIPT = "// Transforme os dados de entrada\nconst result = input;\nreturn result;\n";
export const DEFAULT_OUTPUTS = [{ path: "result.json", required: true }];

export const CARD_WIDTH = 240;
export const CARD_HEIGHT = 112;
export const CARD_GAP_X = 120;
export const CARD_GAP_Y = 170;
export const NOTE_WIDTH = 255;
export const NOTE_HEIGHT = 180;
export const CONTAINER_WIDTH = 520;
export const CONTAINER_HEIGHT = 310;

const FALLBACK_BOT = "";

export function slugify(value: string): string {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  return slug || "step";
}

export function uniqueId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let index = 2; index < 1_000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

export function emptyCanvas(): WorkflowCanvas {
  return { nodes: {}, notes: [], containers: [] };
}

export function autoLayout(steps: readonly WorkflowStep[]): Record<string, { x: number; y: number }> {
  const nodes: Record<string, { x: number; y: number }> = {};
  steps.forEach((step, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    nodes[step.id] = { x: 80 + column * (CARD_WIDTH + CARD_GAP_X), y: 120 + row * (CARD_HEIGHT + CARD_GAP_Y) };
  });
  return nodes;
}

export function newDraft(department: string): StudioDraft {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: "",
    department: department.trim() || "General",
    retentionDays: 90,
    steps: [],
    canvas: emptyCanvas(),
    createdAt: now,
    updatedAt: now,
  };
}

export function fromDefinition(definition: WorkflowDefinition): StudioDraft {
  const canvas = definition.canvas ?? emptyCanvas();
  const layout = autoLayout(definition.steps);
  const nodes = { ...layout, ...canvas.nodes };
  const steps = structuredClone(definition.steps).map((step, index, all) => {
    if (step.kind === "condition" || step.onSuccess !== undefined) return step;
    return { ...step, onSuccess: index + 1 < all.length ? all[index + 1]!.id : null } as WorkflowStep;
  });
  return {
    id: definition.id,
    version: definition.version,
    name: definition.name,
    department: definition.department,
    retentionDays: definition.retentionDays,
    steps,
    canvas: { nodes, notes: structuredClone(canvas.notes), containers: structuredClone(canvas.containers) },
    createdAt: definition.createdAt,
    updatedAt: definition.updatedAt,
  };
}

export function toDefinition(draft: StudioDraft): WorkflowDefinition {
  const ids = new Set(draft.steps.map((step) => step.id));
  const nodes = Object.fromEntries(Object.entries(draft.canvas.nodes).filter(([id]) => ids.has(id)));
  const containerIds = new Set(draft.canvas.containers.map((container) => container.id));
  const notes = draft.canvas.notes.map((note) => note.link && note.link.kind === "container" && !containerIds.has(note.link.id)
    ? { ...note, link: undefined }
    : note);
  const steps = structuredClone(draft.steps).map((step) => step.kind !== "condition" && step.onSuccess === undefined
    ? { ...step, onSuccess: null } as WorkflowStep
    : step);
  return {
    id: draft.id,
    version: draft.version ?? 1,
    name: draft.name.trim(),
    department: draft.department.trim(),
    retentionDays: draft.retentionDays,
    steps,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    canvas: { nodes, notes, containers: structuredClone(draft.canvas.containers) },
  };
}

export function createStep(draft: StudioDraft, kind: Exclude<StudioKind, "note" | "container">, point: { x: number; y: number }, botId?: string): { draft: StudioDraft; stepId: string } {
  const taken = new Set(draft.steps.map((step) => step.id));
  const count = draft.steps.filter((step) => step.kind === (kind === "agent" ? "bot" : kind)).length + 1;
  const baseName = kind === "agent" ? `Agente ${count}` : kind === "script" ? `Script ${count}` : `IF / Else ${count}`;
  const id = uniqueId(slugify(baseName), taken);
  const step: WorkflowStep = kind === "agent"
    ? {
      id, kind: "bot", name: baseName, botId: botId ?? FALLBACK_BOT, timeoutMs: 0, mode: "auto",
      instructions: DEFAULT_INSTRUCTIONS, inputs: [], outputs: structuredClone(DEFAULT_OUTPUTS), result: "result.json",
    }
    : kind === "script"
      ? {
        id, kind: "script", name: baseName, run: `${id}.mjs`, timeoutMs: 60_000, mode: "auto",
        inputs: [], outputs: structuredClone(DEFAULT_OUTPUTS), result: "result.json",
      }
      : { id, kind: "condition", name: baseName, from: "", field: "ok", op: "equals", value: true };
  return {
    draft: {
      ...draft,
      steps: [...draft.steps, step],
      canvas: { ...draft.canvas, nodes: { ...draft.canvas.nodes, [id]: { x: point.x - CARD_WIDTH / 2, y: point.y - CARD_HEIGHT / 2 } } },
    },
    stepId: id,
  };
}

export function createNote(draft: StudioDraft, point: { x: number; y: number }): { draft: StudioDraft; noteId: string } {
  const noteId = `note-${crypto.randomUUID().slice(0, 8)}`;
  return {
    draft: {
      ...draft,
      canvas: {
        ...draft.canvas,
        notes: [...draft.canvas.notes, { id: noteId, x: point.x - NOTE_WIDTH / 2, y: point.y - NOTE_HEIGHT / 2, width: NOTE_WIDTH, height: NOTE_HEIGHT, markdown: "" }],
      },
    },
    noteId,
  };
}

export function createContainer(draft: StudioDraft, point: { x: number; y: number }): { draft: StudioDraft; containerId: string } {
  const containerId = `container-${crypto.randomUUID().slice(0, 8)}`;
  return {
    draft: {
      ...draft,
      canvas: {
        ...draft.canvas,
        containers: [...draft.canvas.containers, { id: containerId, x: point.x - CONTAINER_WIDTH / 2, y: point.y - CONTAINER_HEIGHT / 2, width: CONTAINER_WIDTH, height: CONTAINER_HEIGHT, name: "Novo container" }],
      },
    },
    containerId,
  };
}

export function removeStep(draft: StudioDraft, stepId: string): StudioDraft {
  const steps = draft.steps
    .filter((step) => step.id !== stepId)
    .map((step) => {
      if (step.kind === "condition") {
        return {
          ...step,
          from: step.from === stepId ? "" : step.from,
          whenTrue: step.whenTrue === stepId ? undefined : step.whenTrue,
          whenFalse: step.whenFalse === stepId ? undefined : step.whenFalse,
          onFailure: step.onFailure === stepId ? undefined : step.onFailure,
        } as WorkflowStep;
      }
      return {
        ...step,
        inputs: step.inputs.filter((input) => input.from.step !== stepId),
        onSuccess: step.onSuccess === stepId ? null : step.onSuccess,
        onFailure: step.onFailure === stepId ? undefined : step.onFailure,
        onTimeout: step.onTimeout === stepId ? undefined : step.onTimeout,
      } as WorkflowStep;
    });
  const { [stepId]: _removed, ...nodes } = draft.canvas.nodes;
  const notes = draft.canvas.notes.map((note) => note.link?.kind === "step" && note.link.id === stepId ? { ...note, link: undefined } : note);
  return { ...draft, steps, canvas: { ...draft.canvas, nodes, notes } };
}

export function removeNote(draft: StudioDraft, noteId: string): StudioDraft {
  return { ...draft, canvas: { ...draft.canvas, notes: draft.canvas.notes.filter((note) => note.id !== noteId) } };
}

export function removeContainer(draft: StudioDraft, containerId: string): StudioDraft {
  const notes = draft.canvas.notes.map((note) => note.link?.kind === "container" && note.link.id === containerId ? { ...note, link: undefined } : note);
  return {
    ...draft,
    canvas: { ...draft.canvas, containers: draft.canvas.containers.filter((container) => container.id !== containerId), notes },
  };
}

export function outgoing(step: WorkflowStep): Array<{ branch: StudioBranch; target: string }> {
  if (step.kind === "condition") {
    return [
      ...(step.whenTrue ? [{ branch: "true" as const, target: step.whenTrue }] : []),
      ...(step.whenFalse ? [{ branch: "false" as const, target: step.whenFalse }] : []),
      ...(step.onFailure ? [{ branch: "failure" as const, target: step.onFailure }] : []),
    ];
  }
  return [
    ...(typeof step.onSuccess === "string" ? [{ branch: "run" as const, target: step.onSuccess }] : []),
    ...(step.onFailure ? [{ branch: "failure" as const, target: step.onFailure }] : []),
    ...(step.onTimeout ? [{ branch: "timeout" as const, target: step.onTimeout }] : []),
  ];
}

/** The step that owns a step's success entry. Failure and timeout edges may fan in. */
export function entrySource(draft: StudioDraft, stepId: string): string | undefined {
  for (const step of draft.steps) {
    if (outgoing(step).some((edge) => edge.target === stepId && edge.branch !== "failure" && edge.branch !== "timeout")) return step.id;
  }
  return undefined;
}

function reaches(draft: StudioDraft, start: string, target: string): boolean {
  const seen = new Set<string>();
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.pop()!;
    if (current === target) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    const step = draft.steps.find((candidate) => candidate.id === current);
    if (step) queue.push(...outgoing(step).map((edge) => edge.target));
  }
  return false;
}

export type ConnectResult =
  | { ok: true; draft: StudioDraft }
  | { ok: false; key: "studio.toast.self" | "studio.toast.cycle" | "studio.toast.entryTaken" | "studio.toast.outputTaken" };

export function connect(draft: StudioDraft, fromId: string, branch: StudioBranch, toId: string): ConnectResult {
  const source = draft.steps.find((step) => step.id === fromId);
  if (!source) return { ok: false, key: "studio.toast.entryTaken" };
  if (fromId === toId) return { ok: false, key: "studio.toast.self" };
  const side = branch === "failure" || branch === "timeout";
  if (branch === "run" && source.kind === "condition") return { ok: false, key: "studio.toast.entryTaken" };
  if ((branch === "true" || branch === "false") && source.kind !== "condition") return { ok: false, key: "studio.toast.entryTaken" };
  if (branch === "timeout" && source.kind === "condition") return { ok: false, key: "studio.toast.entryTaken" };
  const current = branch === "run"
    ? (source.kind === "condition" ? undefined : source.onSuccess)
    : branch === "failure" ? source.onFailure
      : branch === "timeout" ? (source.kind === "condition" ? undefined : source.onTimeout)
        : source.kind === "condition" ? (branch === "true" ? source.whenTrue : source.whenFalse) : undefined;
  if (current !== undefined && current !== null) return { ok: false, key: "studio.toast.outputTaken" };
  if (!side && entrySource(draft, toId) !== undefined) return { ok: false, key: "studio.toast.entryTaken" };
  if (reaches(draft, toId, fromId)) return { ok: false, key: "studio.toast.cycle" };
  const steps = draft.steps.map((step) => {
    if (step.id !== fromId) return step;
    if (branch === "run" && step.kind !== "condition") return { ...step, onSuccess: toId };
    if (branch === "failure") return { ...step, onFailure: toId };
    if (branch === "timeout" && step.kind !== "condition") return { ...step, onTimeout: toId };
    if (branch === "true" && step.kind === "condition") return { ...step, whenTrue: toId };
    if (branch === "false" && step.kind === "condition") return { ...step, whenFalse: toId };
    return step;
  }).map((step) => {
    if (step.kind !== "condition" || step.id !== toId || step.from !== "") return step;
    return { ...step, from: fromId };
  });
  return { ok: true, draft: { ...draft, steps } };
}

export function disconnect(draft: StudioDraft, stepId: string, branch: StudioBranch): StudioDraft {
  return {
    ...draft,
    steps: draft.steps.map((step) => {
      if (step.id !== stepId) return step;
      if (step.kind === "condition") {
        if (branch === "true") return { ...step, whenTrue: undefined };
        if (branch === "false") return { ...step, whenFalse: undefined };
        if (branch === "failure") return { ...step, onFailure: undefined };
        return step;
      }
      if (branch === "run") return { ...step, onSuccess: null };
      if (branch === "failure") return { ...step, onFailure: undefined };
      if (branch === "timeout") return { ...step, onTimeout: undefined };
      return step;
    }),
  };
}

export function updateStep(draft: StudioDraft, stepId: string, patch: Partial<WorkflowStep>): StudioDraft {
  return {
    ...draft,
    steps: draft.steps.map((step) => step.id === stepId ? { ...step, ...patch } as WorkflowStep : step),
  };
}

export function moveNode(draft: StudioDraft, stepId: string, x: number, y: number): StudioDraft {
  return { ...draft, canvas: { ...draft.canvas, nodes: { ...draft.canvas.nodes, [stepId]: { x, y } } } };
}

export function moveNote(draft: StudioDraft, noteId: string, x: number, y: number): StudioDraft {
  return { ...draft, canvas: { ...draft.canvas, notes: draft.canvas.notes.map((note) => note.id === noteId ? { ...note, x, y } : note) } };
}

export function resizeNote(draft: StudioDraft, noteId: string, width: number, height: number): StudioDraft {
  return { ...draft, canvas: { ...draft.canvas, notes: draft.canvas.notes.map((note) => note.id === noteId ? { ...note, width: Math.max(190, width), height: Math.max(120, height) } : note) } };
}

export function updateNote(draft: StudioDraft, noteId: string, patch: { markdown?: string; link?: { kind: "step" | "container"; id: string } | undefined }): StudioDraft {
  return { ...draft, canvas: { ...draft.canvas, notes: draft.canvas.notes.map((note) => note.id === noteId ? { ...note, ...patch } : note) } };
}

export function moveContainer(draft: StudioDraft, containerId: string, x: number, y: number): StudioDraft {
  return { ...draft, canvas: { ...draft.canvas, containers: draft.canvas.containers.map((container) => container.id === containerId ? { ...container, x, y } : container) } };
}

export function resizeContainer(draft: StudioDraft, containerId: string, width: number, height: number): StudioDraft {
  return { ...draft, canvas: { ...draft.canvas, containers: draft.canvas.containers.map((container) => container.id === containerId ? { ...container, width: Math.max(310, width), height: Math.max(190, height) } : container) } };
}

export function renameContainer(draft: StudioDraft, containerId: string, name: string): StudioDraft {
  const trimmed = name.trim().slice(0, 64);
  return { ...draft, canvas: { ...draft.canvas, containers: draft.canvas.containers.map((container) => container.id === containerId ? { ...container, name: trimmed || "Container" } : container) } };
}

export function updateCanvas(draft: StudioDraft, canvas: WorkflowCanvas): StudioDraft {
  return { ...draft, canvas };
}

/** The steps whose visual center sits inside a container, below its header. */
export function containedBy(draft: StudioDraft, containerId: string): { steps: string[]; notes: string[] } {
  const container = draft.canvas.containers.find((candidate) => candidate.id === containerId);
  if (!container) return { steps: [], notes: [] };
  const top = container.y + 44;
  const inside = (x: number, y: number) => x >= container.x && x <= container.x + container.width && y >= top && y <= container.y + container.height;
  const steps = draft.steps.filter((step) => {
    const node = draft.canvas.nodes[step.id];
    return node ? inside(node.x + CARD_WIDTH / 2, node.y + CARD_HEIGHT / 2) : false;
  }).map((step) => step.id);
  const notes = draft.canvas.notes.filter((note) => inside(note.x + note.width / 2, note.y + note.height / 2)).map((note) => note.id);
  return { steps, notes };
}

export interface DraftProblem {
  key: string;
  params?: Record<string, string | number>;
}

/** What the Studio can check before the server's schema does. */
export function draftProblem(draft: StudioDraft, botIds: ReadonlySet<string>): DraftProblem | undefined {
  if (!draft.name.trim()) return { key: "studio.needName" };
  if (draft.steps.length === 0) return { key: "studio.needStep" };
  for (const step of draft.steps) {
    if (step.kind === "bot" && (!step.botId || !botIds.has(step.botId))) return { key: "studio.needBot", params: { name: step.name } };
    if (step.kind === "script" && !isWorkflowScriptName(step.run)) return { key: "studio.needScriptName", params: { name: step.name } };
    if (step.kind !== "condition" && step.onTimeout !== undefined && step.timeoutMs <= 0) {
      return { key: "studio.needTimeout", params: { name: step.name } };
    }
    if (step.kind === "condition") {
      if (!step.from) return { key: "studio.needFrom", params: { name: step.name } };
      const source = draft.steps.find((candidate) => candidate.id === step.from);
      if (!source || source.kind === "condition" || source.result === undefined) {
        return { key: "studio.needSourceResult", params: { name: step.name } };
      }
      if (step.op !== "exists" && step.value === undefined) return { key: "studio.needValue", params: { name: step.name } };
    } else if (step.outputs.length === 0) {
      return { key: "studio.needOutput", params: { name: step.name } };
    }
  }
  return undefined;
}

export function resultOf(step: WorkflowStep): string | undefined {
  return step.kind === "condition" ? undefined : step.result;
}

export function outputsOf(step: WorkflowStep): Array<{ path: string; required: boolean }> {
  return step.kind === "condition" ? [] : step.outputs;
}

export function inputsOf(step: WorkflowStep): Array<{ as: string; from: { step: string; output: string } }> {
  return step.kind === "condition" ? [] : step.inputs;
}

export const conditionOpLabel: Record<ConditionOp, LocaleKey> = {
  equals: "studio.condition.equals",
  not_equals: "studio.condition.notEquals",
  exists: "studio.condition.exists",
  contains: "studio.condition.contains",
  gt: "studio.condition.gt",
  gte: "studio.condition.gte",
  lt: "studio.condition.lt",
  lte: "studio.condition.lte",
};

export function nextConditionValue(op: ConditionOp): unknown {
  return op === "exists" ? undefined : op === "contains" ? "" : op === "equals" || op === "not_equals" ? true : 0;
}
