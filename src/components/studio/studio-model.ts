// The Studio's draft: the real WorkflowDefinition plus the canvas the engine
// ignores. Everything here is pure, so a connection rule is testable without a
// DOM, a disk or a server.
import type { LocaleKey } from "@/locales";
import {
  WORKFLOW_CONDITION_ROWS_MAX,
  isWorkflowScriptName,
  type ConditionLine,
  type ConditionMatch,
  type ConditionOp,
  type WorkflowBodyStep,
  type WorkflowCanvas,
  type WorkflowDefinition,
  type WorkflowSkillOptions,
  type WorkflowStep,
  type WorkflowStepSkills,
  type WorkflowSubcanvas,
} from "../../../shared/workflow";

export type StudioKind = "agent" | "script" | "condition" | "loop" | "note" | "container";
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
  return { nodes: {}, notes: [], containers: [], loops: {} };
}

export function emptySubcanvas(): WorkflowSubcanvas {
  return { nodes: {}, notes: [], containers: [] };
}

/** Every step a draft holds, top level first, then each Do While body. */
export function allDraftSteps(draft: StudioDraft): WorkflowStep[] {
  return draft.steps.flatMap((step) => step.kind === "loop" ? [step, ...step.body] : [step]);
}

/** A Do While body seen through the same draft shape the Studio edits. */
export function bodyDraft(draft: StudioDraft, loopId: string): StudioDraft | undefined {
  const loop = draft.steps.find((step) => step.id === loopId);
  if (!loop || loop.kind !== "loop") return undefined;
  const subcanvas = draft.canvas.loops[loopId] ?? emptySubcanvas();
  return {
    ...draft,
    steps: loop.body,
    canvas: { ...emptyCanvas(), ...structuredClone(subcanvas) },
  };
}

/** Writes an edited Do While body back into the main draft, keeping the main canvas. */
export function withBodyDraft(draft: StudioDraft, loopId: string, body: StudioDraft): StudioDraft {
  return {
    ...draft,
    steps: draft.steps.map((step) => step.id === loopId && step.kind === "loop"
      ? { ...step, body: body.steps.filter((candidate): candidate is WorkflowBodyStep => candidate.kind !== "loop") }
      : step),
    canvas: {
      ...draft.canvas,
      loops: { ...draft.canvas.loops, [loopId]: { nodes: body.canvas.nodes, notes: body.canvas.notes, containers: body.canvas.containers } },
    },
  };
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
  const loops = structuredClone(canvas.loops ?? {});
  for (const step of steps) {
    if (step.kind !== "loop" || loops[step.id]) continue;
    loops[step.id] = { nodes: autoLayout(step.body), notes: [], containers: [] };
  }
  return {
    id: definition.id,
    version: definition.version,
    name: definition.name,
    department: definition.department,
    retentionDays: definition.retentionDays,
    steps,
    canvas: {
      nodes,
      notes: structuredClone(canvas.notes),
      containers: structuredClone(canvas.containers),
      loops,
    },
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
  const loops = Object.fromEntries(steps
    .filter((step) => step.kind === "loop")
    .map((step) => {
      const bodyIds = new Set(step.body.map((bodyStep) => bodyStep.id));
      const subcanvas = draft.canvas.loops[step.id] ?? emptySubcanvas();
      return [step.id, {
        nodes: Object.fromEntries(Object.entries(subcanvas.nodes).filter(([id]) => bodyIds.has(id))),
        notes: structuredClone(subcanvas.notes),
        containers: structuredClone(subcanvas.containers),
      }];
    })) as WorkflowCanvas["loops"];
  return {
    id: draft.id,
    version: draft.version ?? 1,
    name: draft.name.trim(),
    department: draft.department.trim(),
    retentionDays: draft.retentionDays,
    steps,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    canvas: { nodes, notes, containers: structuredClone(draft.canvas.containers), loops },
  };
}

export function createStep(
  draft: StudioDraft,
  kind: Exclude<StudioKind, "note" | "container">,
  point: { x: number; y: number },
  botId?: string,
  takenIds?: ReadonlySet<string>,
): { draft: StudioDraft; stepId: string } {
  const taken = new Set([...allDraftSteps(draft).map((step) => step.id), ...(takenIds ?? [])]);
  const count = draft.steps.filter((step) => step.kind === (kind === "agent" ? "bot" : kind)).length + 1;
  const baseName = kind === "agent" ? `Agente ${count}`
    : kind === "script" ? `Script ${count}`
      : kind === "condition" ? `IF / Else ${count}`
        : `Do While ${count}`;
  const id = uniqueId(slugify(baseName), taken);
  const step: WorkflowStep = kind === "agent"
    ? {
      id, kind: "bot", name: baseName, botId: botId ?? FALLBACK_BOT, timeoutMs: 0, mode: "auto",
      instructions: DEFAULT_INSTRUCTIONS, inputs: [], parameters: [], outputs: structuredClone(DEFAULT_OUTPUTS), result: "result.json",
    }
    : kind === "script"
      ? {
        id, kind: "script", name: baseName, run: `${id}.mjs`, timeoutMs: 60_000, mode: "auto",
        inputs: [], parameters: [], outputs: structuredClone(DEFAULT_OUTPUTS), result: "result.json",
      }
      : kind === "condition"
        ? { id, kind: "condition", name: baseName, from: "", match: "all", conditions: [{ field: "ok", op: "equals", value: true }] }
        : {
          id, kind: "loop", name: baseName, body: [], from: "", match: "all",
          conditions: [{ field: "restantes", op: "lte", value: 0 }], maxIterations: 1, outputs: [],
        };
  const canvas = kind === "loop"
    ? { ...draft.canvas, loops: { ...draft.canvas.loops, [id]: emptySubcanvas() } }
    : draft.canvas;
  return {
    draft: {
      ...draft,
      steps: [...draft.steps, step],
      canvas: { ...canvas, nodes: { ...canvas.nodes, [id]: { x: point.x - CARD_WIDTH / 2, y: point.y - CARD_HEIGHT / 2 } } },
    },
    stepId: id,
  };
}

/** Copies a Do While, its body and its sub-canvas with fresh ids and no external edges. */
export function duplicateLoop(draft: StudioDraft, loopId: string, point: { x: number; y: number }): { draft: StudioDraft; stepId: string } | undefined {
  const source = draft.steps.find((step): step is Extract<WorkflowStep, { kind: "loop" }> => step.id === loopId && step.kind === "loop");
  if (!source) return undefined;
  const taken = new Set(allDraftSteps(draft).map((step) => step.id));
  const id = uniqueId(slugify(source.name), taken);
  taken.add(id);
  const bodyIds = new Map<string, string>();
  for (const bodyStep of source.body) {
    const candidate = uniqueId(slugify(bodyStep.name), taken);
    taken.add(candidate);
    bodyIds.set(bodyStep.id, candidate);
  }
  const remap = (target: string | null | undefined): string | null | undefined =>
    target === undefined || target === null ? target : bodyIds.get(target) ?? target;
  const body = source.body.map((bodyStep) => {
    const nextId = bodyIds.get(bodyStep.id)!;
    if (bodyStep.kind === "condition") {
      return {
        ...bodyStep,
        id: nextId,
        from: bodyIds.get(bodyStep.from) ?? bodyStep.from,
        whenTrue: remap(bodyStep.whenTrue),
        whenFalse: remap(bodyStep.whenFalse),
        onFailure: remap(bodyStep.onFailure) ?? undefined,
      } as WorkflowStep;
    }
    return {
      ...bodyStep,
      id: nextId,
      inputs: bodyStep.inputs.map((input) => ({ ...input, from: { ...input.from, step: bodyIds.get(input.from.step) ?? input.from.step } })),
      onSuccess: remap(bodyStep.onSuccess),
      onFailure: remap(bodyStep.onFailure) ?? undefined,
      onTimeout: remap(bodyStep.onTimeout) ?? undefined,
      when: bodyStep.when?.map((branch) => ({ ...branch, next: bodyIds.get(branch.next) ?? branch.next })),
    } as WorkflowStep;
  });
  const clone = {
    ...source,
    id,
    name: `${source.name} cópia`,
    body,
    from: bodyIds.get(source.from) ?? source.from,
    onSuccess: undefined,
    onFailure: undefined,
  } as WorkflowStep;
  const sourceCanvas = draft.canvas.loops[source.id] ?? emptySubcanvas();
  const nodes = Object.fromEntries([...bodyIds.entries()].map(([from, to]) => {
    const node = sourceCanvas.nodes[from];
    return [to, node ? { x: node.x + 40, y: node.y + 80 } : { x: 80, y: 120 }];
  }));
  return {
    draft: {
      ...draft,
      steps: [...draft.steps, clone],
      canvas: {
        ...draft.canvas,
        nodes: { ...draft.canvas.nodes, [id]: { x: point.x - CARD_WIDTH / 2, y: point.y - CARD_HEIGHT / 2 } },
        loops: {
          ...draft.canvas.loops,
          [id]: {
            nodes,
            notes: structuredClone(sourceCanvas.notes),
            containers: structuredClone(sourceCanvas.containers),
          },
        },
      },
    },
    stepId: id,
  };
}

/** The comparisons a condition step holds; an empty list for every other kind. */
export function conditionLines(step: WorkflowStep): ConditionLine[] {
  return step.kind === "condition" ? step.conditions : [];
}

export type StudioSkillGroup = keyof WorkflowSkillOptions;

export function skillSelection(step: WorkflowStep): Required<WorkflowStepSkills> {
  const skills = step.kind === "bot" ? step.skills : undefined;
  return {
    bot: [...(skills?.bot ?? [])],
    bundled: [...(skills?.bundled ?? [])],
    imported: [...(skills?.imported ?? [])],
  };
}

function skillsFromGroups(groups: Required<WorkflowStepSkills>): WorkflowStepSkills | undefined {
  const next = {
    ...(groups.bot.length > 0 ? { bot: groups.bot } : {}),
    ...(groups.bundled.length > 0 ? { bundled: groups.bundled } : {}),
    ...(groups.imported.length > 0 ? { imported: groups.imported } : {}),
  };
  return Object.keys(next).length > 0 ? next : undefined;
}

export function skillsWithGroup(step: WorkflowStep, group: StudioSkillGroup, values: readonly string[]): WorkflowStepSkills | undefined {
  if (step.kind !== "bot") return undefined;
  return skillsFromGroups({ ...skillSelection(step), [group]: [...new Set(values)] });
}

function editSkills(draft: StudioDraft, stepId: string, change: (step: Extract<WorkflowStep, { kind: "bot" }>) => WorkflowStepSkills | undefined): StudioDraft {
  return {
    ...draft,
    steps: draft.steps.map((step) => step.id === stepId && step.kind === "bot"
      ? { ...step, skills: change(step) }
      : step),
  };
}

export function setSkillGroup(draft: StudioDraft, stepId: string, group: StudioSkillGroup, values: readonly string[]): StudioDraft {
  return editSkills(draft, stepId, (step) => skillsWithGroup(step, group, values));
}

export function toggleSkillGroup(draft: StudioDraft, stepId: string, group: StudioSkillGroup, available: readonly string[]): StudioDraft {
  return editSkills(draft, stepId, (step) => skillSelection(step)[group].length > 0
    ? skillsWithGroup(step, group, [])
    : skillsWithGroup(step, group, available));
}

export function selectAllSkills(draft: StudioDraft, stepId: string, group: StudioSkillGroup, available: readonly string[]): StudioDraft {
  return setSkillGroup(draft, stepId, group, available);
}

export function toggleSkill(draft: StudioDraft, stepId: string, group: StudioSkillGroup, name: string): StudioDraft {
  return editSkills(draft, stepId, (step) => {
    const current = skillSelection(step)[group];
    return skillsWithGroup(step, group, current.includes(name) ? current.filter((value) => value !== name) : [...current, name]);
  });
}

export function skillCount(step: WorkflowStep): number {
  const groups = skillSelection(step);
  return groups.bot.length + groups.bundled.length + groups.imported.length;
}

export function skillSelectionProblem(step: WorkflowStep, options: WorkflowSkillOptions | undefined): DraftProblem | undefined {
  if (step.kind !== "bot" || step.skills === undefined || options === undefined) return undefined;
  for (const group of ["bot", "bundled", "imported"] as const) {
    const allowed = new Set(options[group].filter((option) => option.available).map((option) => option.name));
    const missing = (step.skills[group] ?? []).find((name) => !allowed.has(name));
    if (missing !== undefined) return { key: "studio.skillUnavailable", params: { name: missing } };
  }
  return undefined;
}

export function updateConditionLine(draft: StudioDraft, stepId: string, index: number, patch: Partial<ConditionLine>): StudioDraft {
  return {
    ...draft,
    steps: draft.steps.map((step) => step.id === stepId && step.kind === "condition"
      ? { ...step, conditions: step.conditions.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line) }
      : step),
  };
}

export function addConditionLine(draft: StudioDraft, stepId: string): StudioDraft {
  return {
    ...draft,
    steps: draft.steps.map((step) => step.id !== stepId || step.kind !== "condition" || step.conditions.length >= WORKFLOW_CONDITION_ROWS_MAX
      ? step
      : { ...step, conditions: [...step.conditions, { field: "ok", op: "equals", value: true }] }),
  };
}

export function removeConditionLine(draft: StudioDraft, stepId: string, index: number): StudioDraft {
  return {
    ...draft,
    steps: draft.steps.map((step) => step.id === stepId && step.kind === "condition"
      ? { ...step, conditions: step.conditions.filter((_line, lineIndex) => lineIndex !== index) }
      : step),
  };
}

export function updateConditionMatch(draft: StudioDraft, stepId: string, match: ConditionMatch): StudioDraft {
  return {
    ...draft,
    steps: draft.steps.map((step) => step.id === stepId && step.kind === "condition" ? { ...step, match } : step),
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
      if (step.kind === "loop") {
        return {
          ...step,
          body: step.body.map((bodyStep) => bodyStep.kind === "condition"
            ? { ...bodyStep, from: bodyStep.from === stepId ? "" : bodyStep.from } as WorkflowStep
            : { ...bodyStep, inputs: bodyStep.inputs.filter((input) => input.from.step !== stepId) } as WorkflowStep),
          onSuccess: step.onSuccess === stepId ? null : step.onSuccess,
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
  const { [stepId]: _removedLoop, ...loops } = draft.canvas.loops;
  const notes = draft.canvas.notes.map((note) => note.link?.kind === "step" && note.link.id === stepId ? { ...note, link: undefined } : note);
  return { ...draft, steps, canvas: { ...draft.canvas, nodes, loops, notes } };
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
    ...(step.kind !== "loop" && step.onTimeout ? [{ branch: "timeout" as const, target: step.onTimeout }] : []),
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
  if (branch === "timeout" && source.kind !== "bot" && source.kind !== "script") return { ok: false, key: "studio.toast.entryTaken" };
  const current = branch === "run"
    ? (source.kind === "condition" ? undefined : source.onSuccess)
    : branch === "failure" ? source.onFailure
      : branch === "timeout" ? (source.kind === "bot" || source.kind === "script" ? source.onTimeout : undefined)
        : source.kind === "condition" ? (branch === "true" ? source.whenTrue : source.whenFalse) : undefined;
  if (current !== undefined && current !== null) return { ok: false, key: "studio.toast.outputTaken" };
  if (!side && entrySource(draft, toId) !== undefined) return { ok: false, key: "studio.toast.entryTaken" };
  if (reaches(draft, toId, fromId)) return { ok: false, key: "studio.toast.cycle" };
  const steps = draft.steps.map((step) => {
    if (step.id !== fromId) return step;
    if (branch === "run" && step.kind !== "condition") return { ...step, onSuccess: toId };
    if (branch === "failure") return { ...step, onFailure: toId };
    if (branch === "timeout" && (step.kind === "bot" || step.kind === "script")) return { ...step, onTimeout: toId };
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
      if (branch === "timeout" && (step.kind === "bot" || step.kind === "script")) return { ...step, onTimeout: undefined };
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

function conditionProblem(step: WorkflowBodyStep | WorkflowStep, pool: readonly WorkflowStep[]): DraftProblem | undefined {
  if (step.kind !== "condition") return undefined;
  if (!step.from) return { key: "studio.needFrom", params: { name: step.name } };
  const sourceIndex = pool.findIndex((candidate) => candidate.id === step.from);
  const source = pool[sourceIndex];
  if (sourceIndex < 0 || !source || source.kind === "condition" || source.kind === "loop" || source.result === undefined) {
    return { key: "studio.needSourceResult", params: { name: step.name } };
  }
  if (step.conditions.length === 0) return { key: "studio.needCondition", params: { name: step.name } };
  if (step.conditions.length > WORKFLOW_CONDITION_ROWS_MAX) {
    return { key: "studio.needConditionMax", params: { name: step.name, max: WORKFLOW_CONDITION_ROWS_MAX } };
  }
  if (step.conditions.some((line) => line.op !== "exists" && line.value === undefined)) {
    return { key: "studio.needValue", params: { name: step.name } };
  }
  return undefined;
}

function bodyStepProblem(step: WorkflowBodyStep, pool: readonly WorkflowBodyStep[], botIds: ReadonlySet<string>, skillOptions: Record<string, WorkflowSkillOptions>): DraftProblem | undefined {
  if (step.kind === "bot" && (!step.botId || !botIds.has(step.botId))) return { key: "studio.needBot", params: { name: step.name } };
  if (step.kind === "bot") {
    const skillProblem = skillSelectionProblem(step, skillOptions[step.botId]);
    if (skillProblem) return skillProblem;
  }
  if (step.kind === "script" && !isWorkflowScriptName(step.run)) return { key: "studio.needScriptName", params: { name: step.name } };
  if (step.kind !== "condition" && step.onTimeout !== undefined && step.timeoutMs <= 0) {
    return { key: "studio.needTimeout", params: { name: step.name } };
  }
  if (step.kind === "condition") return conditionProblem(step, pool);
  if (step.outputs.length === 0) return { key: "studio.needOutput", params: { name: step.name } };
  return undefined;
}

/** What the Studio can check before the server's schema does. */
export function draftProblem(draft: StudioDraft, botIds: ReadonlySet<string>, skillOptions: Record<string, WorkflowSkillOptions> = {}): DraftProblem | undefined {
  if (!draft.name.trim()) return { key: "studio.needName" };
  if (draft.steps.length === 0) return { key: "studio.needStep" };
  if (allDraftSteps(draft).length > 40) return { key: "studio.needStepMax", params: { max: 40 } };
  for (const step of draft.steps) {
    if (step.kind === "bot" && (!step.botId || !botIds.has(step.botId))) return { key: "studio.needBot", params: { name: step.name } };
    if (step.kind === "bot") {
      const skillProblem = skillSelectionProblem(step, skillOptions[step.botId]);
      if (skillProblem) return skillProblem;
    }
    if (step.kind === "script" && !isWorkflowScriptName(step.run)) return { key: "studio.needScriptName", params: { name: step.name } };
    if (step.kind !== "condition" && step.kind !== "loop" && step.onTimeout !== undefined && step.timeoutMs <= 0) {
      return { key: "studio.needTimeout", params: { name: step.name } };
    }
    if (step.kind === "condition") {
      const problem = conditionProblem(step, draft.steps);
      if (problem) return problem;
      continue;
    }
    if (step.kind !== "loop") {
      if (step.outputs.length === 0) return { key: "studio.needOutput", params: { name: step.name } };
      continue;
    }

    if (step.body.length === 0) return { key: "studio.loop.needBody", params: { name: step.name } };
    const source = step.body.find((candidate) => candidate.id === step.from);
    if (!step.from || !source || source.kind === "condition" || source.result === undefined) {
      return { key: "studio.loop.needFrom", params: { name: step.name } };
    }
    if (step.conditions.length === 0) return { key: "studio.needCondition", params: { name: step.name } };
    if (step.conditions.length > WORKFLOW_CONDITION_ROWS_MAX) {
      return { key: "studio.needConditionMax", params: { name: step.name, max: WORKFLOW_CONDITION_ROWS_MAX } };
    }
    if (step.conditions.some((line) => line.op !== "exists" && line.value === undefined)) {
      return { key: "studio.needValue", params: { name: step.name } };
    }
    if (!Number.isInteger(step.maxIterations) || step.maxIterations < 1) {
      return { key: "studio.loop.needMax", params: { name: step.name } };
    }
    for (const bodyStep of step.body) {
      const problem = bodyStepProblem(bodyStep, step.body, botIds, skillOptions);
      if (problem) return problem;
    }
    for (const bodyStep of step.body) {
      if (bodyStep.kind === "condition" || bodyStep.inputs.length === 0) continue;
      for (const input of bodyStep.inputs) {
        const bodyIndex = step.body.findIndex((candidate) => candidate.id === input.from.step);
        const bodySource = bodyIndex >= 0 ? step.body[bodyIndex] : undefined;
        const topIndex = draft.steps.findIndex((candidate) => candidate.id === input.from.step);
        const topSource = topIndex >= 0 && topIndex < draft.steps.indexOf(step) ? draft.steps[topIndex] : undefined;
        const output = bodySource !== undefined
          ? bodySource.kind !== "condition"
            ? bodySource.outputs.find((entry) => entry.path === input.from.output)
            : undefined
          : topSource !== undefined && topSource.kind !== "condition" && topSource.kind !== "loop"
            ? topSource.outputs.find((entry) => entry.path === input.from.output)
            : undefined;
        if (!output?.required) return { key: "studio.loop.needInput", params: { name: bodyStep.name } };
      }
    }
    const declared = new Map<string, { required: boolean; count: number }>();
    for (const bodyStep of step.body) {
      if (bodyStep.kind === "condition") continue;
      for (const output of bodyStep.outputs) {
        const current = declared.get(output.path);
        declared.set(output.path, { required: output.required && (current?.required ?? true), count: (current?.count ?? 0) + 1 });
      }
    }
    if (step.outputs.length === 0) return { key: "studio.loop.needOutput", params: { name: step.name } };
    const seenOutputs = new Set<string>();
    for (const output of step.outputs) {
      if (seenOutputs.has(output.path)) return { key: "studio.loop.outputAmbiguous", params: { name: step.name, path: output.path } };
      seenOutputs.add(output.path);
      const declaration = declared.get(output.path);
      if (!declaration) return { key: "studio.loop.needOutput", params: { name: step.name } };
      if (declaration.count > 1) return { key: "studio.loop.outputAmbiguous", params: { name: step.name, path: output.path } };
      if (output.required && !declaration.required) return { key: "studio.loop.outputOptional", params: { name: step.name, path: output.path } };
    }
    if (step.result !== undefined && !step.outputs.some((output) => output.path === step.result)) {
      return { key: "studio.loop.needResult", params: { name: step.name } };
    }
    if (step.require !== undefined && step.result === undefined) {
      return { key: "studio.loop.needResult", params: { name: step.name } };
    }
  }
  return undefined;
}

export type ScriptLanguage = "javascript" | "typescript" | "python";

/** The Studio language a script file name points at. */
export function scriptLanguageOf(run: string): ScriptLanguage {
  if (run.endsWith(".py")) return "python";
  if (run.endsWith(".ts")) return "typescript";
  return "javascript";
}

/** The same script under another language, keeping its base name. */
export function scriptNameForLanguage(run: string, language: ScriptLanguage): string {
  const extension = language === "python" ? "py" : language === "typescript" ? "ts" : "mjs";
  return `${run.replace(/\.(mjs|js|ts|py)$/, "")}.${extension}`;
}

/** Move a script's content to its new file name, leaving no stale copy behind. */
export function renameScript(scripts: Record<string, string>, from: string, to: string): Record<string, string> {
  if (from === to) return scripts;
  const next = { ...scripts, [to]: scripts[from] ?? DEFAULT_SCRIPT };
  delete next[from];
  return next;
}

export function resultOf(step: WorkflowStep): string | undefined {
  return step.kind === "condition" ? undefined : step.result;
}

export function outputsOf(step: WorkflowStep): Array<{ path: string; required: boolean }> {
  return step.kind === "condition" ? [] : step.outputs;
}

export function inputsOf(step: WorkflowStep): Array<{ as: string; from: { step: string; output: string } }> {
  return step.kind === "condition" || step.kind === "loop" ? [] : step.inputs;
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
