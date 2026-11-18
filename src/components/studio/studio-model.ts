// The Studio's draft: the real WorkflowDefinition plus the canvas the engine
// ignores. Everything here is pure, so a connection rule is testable without a
// DOM, a disk or a server.
import type { LocaleKey } from "@/locales";
import {
  WORKFLOW_CONDITION_ROWS_MAX,
  WORKFLOW_TRIGGER_MAX,
  isWorkflowJsonPath,
  isWorkflowModuleName,
  isWorkflowModuleVersion,
  isWorkflowScriptName,
  workflowDefaultTriggers,
  workflowFileExtension,
  workflowReceivesExternalParameters,
  type ConditionLine,
  type ConditionMatch,
  type ConditionOp,
  type WorkflowBodyStep,
  type WorkflowCanvas,
  type WorkflowDefinition,
  type WorkflowModule,
  type WorkflowParameter,
  type WorkflowTriggerKind,
  type WorkflowTriggerNode,
  type StepOutput,
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
  triggers: WorkflowTriggerNode[];
  canvas: WorkflowCanvas;
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_INSTRUCTIONS = "Analise os dados de entrada e identifique os pontos relevantes.";
export const DEFAULT_SCRIPT = "// Transforme os dados de entrada\nconst result = input;\nreturn result;\n";
export const DEFAULT_OUTPUTS = [{ path: "result.txt", required: true }];

export const CARD_WIDTH = 240;
export const CARD_HEIGHT = 112;
export const CARD_GAP_X = 120;
export const CARD_GAP_Y = 170;
export const NOTE_WIDTH = 255;
export const NOTE_HEIGHT = 180;
export const CONTAINER_WIDTH = 520;
export const CONTAINER_HEIGHT = 310;
export const TRIGGER_WIDTH = 208;
export const TRIGGER_HEIGHT = 64;
export const TRIGGER_GAP = 12;
/** The vertical space between the trigger row and the first step's card. */
export const TRIGGER_LIFT = 88;

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
    triggers: workflowDefaultTriggers(),
    canvas: emptyCanvas(),
    createdAt: now,
    updatedAt: now,
  };
}

/** The trigger cards sit in one row above the first step, without a position of their own. */
export function triggerPoint(draft: StudioDraft, index: number): { x: number; y: number } {
  const first = draft.steps[0];
  const node = first ? draft.canvas.nodes[first.id] : undefined;
  return {
    x: (node?.x ?? 80) + index * (TRIGGER_WIDTH + TRIGGER_GAP),
    y: (node?.y ?? 120) - TRIGGER_HEIGHT - TRIGGER_LIFT,
  };
}

export type StudioTriggerChange =
  | { ok: true; draft: StudioDraft }
  | { ok: false; key: LocaleKey };

const TRIGGER_NAMES: Record<WorkflowTriggerKind, string> = { manual: "Manual", webhook: "Webhook", routine: "Rotina" };

/** The row holds at most WORKFLOW_TRIGGER_MAX nodes; a full row keeps the draft it received. */
export function addTrigger(draft: StudioDraft, kind: WorkflowTriggerKind = "manual"): StudioDraft {
  if (draft.triggers.length >= WORKFLOW_TRIGGER_MAX) return draft;
  const taken = new Set(draft.triggers.map((trigger) => trigger.id));
  const count = draft.triggers.filter((trigger) => trigger.kind === kind).length;
  const name = count === 0 ? TRIGGER_NAMES[kind] : `${TRIGGER_NAMES[kind]} ${count + 1}`;
  const id = uniqueId(slugify(name), taken);
  return { ...draft, triggers: [...draft.triggers, { id, kind, name }] };
}

/** A new kind never keeps the entity of the old one: the link is configured after the save. */
export function updateTrigger(
  draft: StudioDraft,
  triggerId: string,
  patch: { name?: string; kind?: WorkflowTriggerKind },
): StudioDraft {
  return {
    ...draft,
    triggers: draft.triggers.map((trigger) => {
      if (trigger.id !== triggerId) return trigger;
      if (patch.kind === undefined || patch.kind === trigger.kind) {
        return { ...trigger, ...(patch.name === undefined ? {} : { name: patch.name }) };
      }
      const { triggerId: _triggerId, routineId: _routineId, ...rest } = trigger;
      return { ...rest, kind: patch.kind, ...(patch.name === undefined ? {} : { name: patch.name }) };
    }),
  };
}

export function removeTrigger(draft: StudioDraft, triggerId: string): StudioTriggerChange {
  if (draft.triggers.length <= 1) return { ok: false, key: "studio.trigger.lastOne" };
  const triggers = draft.triggers.filter((trigger) => trigger.id !== triggerId);
  if (triggers.length === draft.triggers.length) return { ok: true, draft };
  return { ok: true, draft: { ...draft, triggers } };
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
    triggers: definition.triggers?.length > 0 ? structuredClone(definition.triggers) : workflowDefaultTriggers(),
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
    triggers: structuredClone(draft.triggers),
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
      instructions: DEFAULT_INSTRUCTIONS, inputs: [], parameters: [], outputs: structuredClone(DEFAULT_OUTPUTS),
    }
    : kind === "script"
      ? {
        id, kind: "script", name: baseName, run: `${id}.mjs`, timeoutMs: 60_000, mode: "auto", modules: [],
        inputs: [], parameters: [], outputs: structuredClone(DEFAULT_OUTPUTS),
      }
      : kind === "condition"
        ? { id, kind: "condition", name: baseName, from: { step: "", output: "" }, match: "all", conditions: [{ field: "ok", op: "equals", value: true }] }
        : {
          id, kind: "loop", name: baseName, body: [], from: { step: "", output: "" }, match: "all",
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
        from: { ...bodyStep.from, step: bodyIds.get(bodyStep.from.step) ?? bodyStep.from.step },
        whenTrue: remap(bodyStep.whenTrue),
        whenFalse: remap(bodyStep.whenFalse),
        onFailure: remap(bodyStep.onFailure) ?? undefined,
      } as WorkflowStep;
    }
    return {
      ...bodyStep,
      id: nextId,
      inputs: bodyStep.inputs.map((input) => ({ ...input, from: { ...input.from, step: bodyIds.get(input.from.step) ?? input.from.step } })),
      parameters: bodyStep.parameters.map((parameter) => parameter.from === undefined
        ? parameter
        : { ...parameter, from: { ...parameter.from, step: bodyIds.get(parameter.from.step) ?? parameter.from.step } }),
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
    from: { ...source.from, step: bodyIds.get(source.from.step) ?? source.from.step },
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
          from: step.from.step === stepId ? { step: "", output: "" } : step.from,
          whenTrue: step.whenTrue === stepId ? undefined : step.whenTrue,
          whenFalse: step.whenFalse === stepId ? undefined : step.whenFalse,
          onFailure: step.onFailure === stepId ? undefined : step.onFailure,
        } as WorkflowStep;
      }
      if (step.kind === "loop") {
        return {
          ...step,
          body: step.body.map((bodyStep) => bodyStep.kind === "condition"
            ? { ...bodyStep, from: bodyStep.from.step === stepId ? { step: "", output: "" } : bodyStep.from } as WorkflowStep
            : {
              ...bodyStep,
              inputs: bodyStep.inputs.filter((input) => input.from.step !== stepId),
              parameters: bodyStep.parameters.map((parameter) => parameter.from?.step === stepId ? withoutParameterSource(parameter) : parameter),
            } as WorkflowStep),
          onSuccess: step.onSuccess === stepId ? null : step.onSuccess,
          onFailure: step.onFailure === stepId ? undefined : step.onFailure,
        } as WorkflowStep;
      }
      return {
        ...step,
        inputs: step.inputs.filter((input) => input.from.step !== stepId),
        parameters: step.parameters.map((parameter) => parameter.from?.step === stepId ? withoutParameterSource(parameter) : parameter),
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
    if (step.kind !== "condition" || step.id !== toId || step.from.step !== "") return step;
    const source = draft.steps.find((candidate) => candidate.id === fromId);
    const outputs = source && source.kind !== "condition" ? source.outputs : [];
    const output = outputs.find((candidate) => candidate.shape !== undefined)
      ?? outputs.find((candidate) => candidate.path.toLowerCase().endsWith(".json"))
      ?? outputs[0];
    return { ...step, from: { step: fromId, output: output?.path ?? "" } };
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

/** The balloon a control lives in. The card's context and input branches both open the
 * Inputs balloon, which holds documents and parameters. */
export type StudioBranchName = "instructions" | "context" | "tools" | "skills" | "return" | "run"
  | "input" | "output" | "script" | "condition" | "true" | "false" | "failure" | "timeout";

/** A control the problems panel can reveal: a card, a balloon and one field in it. */
export interface StudioTarget {
  stepId: string;
  /** Set when the step is inside a Do While body. */
  loopId?: string;
  branch: StudioBranchName;
  /** `data-studio-field` of the control; `card` means the balloon's first control. */
  field: string;
}

/** The balloon and field that own an authoring path such as `steps.0.parameters.1.name`. */
export function targetForPath(steps: readonly WorkflowStep[], path: string): StudioTarget | undefined {
  const match = /^steps\.(\d+)(?:\.body\.(\d+))?(?:\.(.+))?$/.exec(path);
  if (!match) return undefined;
  const top = steps[Number(match[1])];
  if (!top) return undefined;
  const loopId = match[2] === undefined ? undefined : top.kind === "loop" ? top.id : undefined;
  const step = match[2] === undefined
    ? top
    : top.kind === "loop" ? top.body[Number(match[2])] : undefined;
  if (!step || (match[2] !== undefined && loopId === undefined)) return undefined;
  const { branch, field } = branchForPath(step, match[3]);
  return { stepId: step.id, ...(loopId === undefined ? {} : { loopId }), branch, field };
}

function branchForPath(step: WorkflowStep, rest: string | undefined): { branch: StudioBranchName; field: string } {
  if (rest === undefined) return { branch: defaultBranch(step), field: "card" };
  if (rest.startsWith("parameters")) return { branch: inputsBranch(step), field: rest };
  if (rest === "inputs") return { branch: inputsBranch(step), field: "documents" };
  if (rest.startsWith("outputs")) {
    return step.kind === "loop" ? { branch: "condition", field: "outputs" } : { branch: outputsBranch(step), field: rest };
  }
  if (rest === "body") return { branch: "condition", field: "card" };
  if (rest === "mode") return { branch: "run", field: "mode" };
  if (rest === "timeoutMs") return { branch: "run", field: "timeout" };
  if (rest === "botId" || rest === "skills") return { branch: "instructions", field: rest === "botId" ? "bot" : "card" };
  if (rest === "instructions") return { branch: "instructions", field: "instructions" };
  if (rest === "run") return { branch: "script", field: "run" };
  if (rest === "modules") return { branch: "script", field: "modules" };
  if (rest === "from" || rest === "from.output") return { branch: "condition", field: rest };
  if (rest === "conditions") return { branch: "condition", field: "conditions" };
  if (rest === "result" || rest === "when" || rest === "require") return { branch: "run", field: "legacy" };
  return { branch: defaultBranch(step), field: "card" };
}

export function defaultBranch(step: WorkflowStep): StudioBranchName {
  if (step.kind === "bot") return "instructions";
  if (step.kind === "script") return "script";
  return "condition";
}

export function inputsBranch(step: WorkflowStep): StudioBranchName {
  return step.kind === "script" ? "input" : "context";
}

function outputsBranch(step: WorkflowStep): StudioBranchName {
  return step.kind === "script" ? "output" : "return";
}

export interface LegacyField {
  stepId: string;
  loopId?: string;
  name: string;
  target: StudioTarget;
}

/** The fields a save removes: `result` on a bot or script step, `when` and `require`. */
export function legacyFields(draft: StudioDraft): LegacyField[] {
  const fields: LegacyField[] = [];
  for (const step of allDraftSteps(draft)) {
    const loopId = draft.steps.find((candidate) => candidate.kind === "loop" && candidate.body.includes(step as WorkflowBodyStep))?.id;
    const branch: StudioBranchName = "run";
    if (step.kind !== "condition" && step.kind !== "loop") {
      if (step.result !== undefined) fields.push({ stepId: step.id, ...(loopId === undefined ? {} : { loopId }), name: "result", target: { stepId: step.id, ...(loopId === undefined ? {} : { loopId }), branch: outputsBranch(step), field: "legacy" } });
      if (step.when !== undefined) fields.push({ stepId: step.id, ...(loopId === undefined ? {} : { loopId }), name: "when", target: { stepId: step.id, ...(loopId === undefined ? {} : { loopId }), branch, field: "legacy" } });
      if (step.require !== undefined) fields.push({ stepId: step.id, ...(loopId === undefined ? {} : { loopId }), name: "require", target: { stepId: step.id, ...(loopId === undefined ? {} : { loopId }), branch, field: "legacy" } });
    }
  }
  return fields;
}

const parameterNamePattern = /^[a-z][a-z0-9_]*$/;
const whenAbsentPattern = /^rule:[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

export function isParameterNameValid(name: string): boolean {
  return parameterNamePattern.test(name);
}

function nextParameterName(taken: ReadonlySet<string>): string {
  if (!taken.has("valor")) return "valor";
  for (let index = 2; index < 1_000; index += 1) {
    const candidate = `valor_${index}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `valor_${crypto.randomUUID().slice(0, 6)}`;
}

/** A parameter cleared for editing: no origin, required, not a list. */
export function newParameter(taken: ReadonlySet<string>, patch: Partial<WorkflowParameter> = {}): WorkflowParameter {
  return { name: nextParameterName(taken), type: "string", list: false, required: true, ...patch };
}

export type ParameterOrigin = "none" | "collected" | "from";

export function parameterOrigin(parameter: WorkflowParameter): ParameterOrigin {
  if (parameter.from !== undefined) return "from";
  if (parameter.collectedBy !== undefined) return "collected";
  return "none";
}

function editParameters(draft: StudioDraft, stepId: string, change: (parameters: WorkflowParameter[]) => WorkflowParameter[]): StudioDraft {
  return {
    ...draft,
    steps: draft.steps.map((step) => step.id === stepId && step.kind !== "condition" && step.kind !== "loop"
      ? { ...step, parameters: change([...step.parameters]) }
      : step),
  };
}

export function addParameter(draft: StudioDraft, stepId: string, patch: Partial<WorkflowParameter> = {}): { draft: StudioDraft; index: number } {
  const step = draft.steps.find((candidate) => candidate.id === stepId);
  if (!step || step.kind === "condition" || step.kind === "loop") return { draft, index: -1 };
  const index = step.parameters.length;
  return {
    draft: editParameters(draft, stepId, (parameters) => [...parameters, newParameter(new Set(parameters.map((parameter) => parameter.name)), patch)]),
    index,
  };
}

export function updateParameter(draft: StudioDraft, stepId: string, index: number, patch: Partial<WorkflowParameter>): StudioDraft {
  return editParameters(draft, stepId, (parameters) => parameters.map((parameter, position) => position === index
    ? normalizeParameter({ ...parameter, ...patch })
    : parameter));
}

export function removeParameter(draft: StudioDraft, stepId: string, index: number): StudioDraft {
  return editParameters(draft, stepId, (parameters) => parameters.filter((_parameter, position) => position !== index));
}

/** A parameter whose source step disappeared falls back to the start of the run. */
export function withoutParameterSource(parameter: WorkflowParameter): WorkflowParameter {
  const { from: _from, ...rest } = parameter;
  return rest;
}

/** Switching origin clears what the old one owned, because the schema allows exactly one. */
export function setParameterOrigin(draft: StudioDraft, stepId: string, index: number, origin: ParameterOrigin): StudioDraft {
  return editParameters(draft, stepId, (parameters) => parameters.map((parameter, position) => {
    if (position !== index) return parameter;
    const { from: _from, collectedBy: _collectedBy, whenAbsent: _whenAbsent, ...rest } = parameter;
    if (origin === "collected") return { ...rest, required: true, collectedBy: stepId };
    if (origin === "from") return { ...rest, required: true, from: { step: "", output: "", field: "" } };
    return rest;
  }));
}

/** Keeps `required`, `values` and `whenAbsent` consistent with the parameter's type and origin. */
function normalizeParameter(parameter: WorkflowParameter): WorkflowParameter {
  const origin = parameterOrigin(parameter);
  const next: WorkflowParameter = {
    ...parameter,
    required: origin === "none" ? parameter.required : true,
  };
  if (next.type !== "enum") delete next.values;
  else if (next.values === undefined) next.values = [];
  if (next.required) delete next.whenAbsent;
  return next;
}

export interface ParameterProblem {
  index: number;
  /** The parameter field the message belongs to. */
  field: "name" | "values" | "whenAbsent" | "from" | "origin";
  key: string;
  params?: Record<string, string | number>;
}

export function parameterProblems(step: WorkflowStep, earlier: readonly WorkflowStep[] = []): ParameterProblem[] {
  if (step.kind === "condition" || step.kind === "loop") return [];
  const problems: ParameterProblem[] = [];
  const seen = new Set<string>();
  step.parameters.forEach((parameter, index) => {
    if (!isParameterNameValid(parameter.name)) {
      problems.push({ index, field: "name", key: "studio.inputs.nameInvalid" });
    } else if (seen.has(parameter.name)) {
      problems.push({ index, field: "name", key: "studio.inputs.nameRepeated" });
    }
    seen.add(parameter.name);
    if (parameter.type === "enum" && (parameter.values === undefined || parameter.values.length === 0)) {
      problems.push({ index, field: "values", key: "studio.inputs.enumNeedsValues" });
    }
    const origin = parameterOrigin(parameter);
    if (origin === "none" && !parameter.required) {
      if (parameter.whenAbsent === undefined) problems.push({ index, field: "whenAbsent", key: "studio.inputs.whenAbsentNeeded" });
      else if (!whenAbsentPattern.test(parameter.whenAbsent)) problems.push({ index, field: "whenAbsent", key: "studio.inputs.whenAbsentInvalid" });
    }
    if (origin === "from") {
      const source = parameter.from;
      if (!source?.step || !source.output || !source.field) {
        problems.push({ index, field: "from", key: "studio.inputs.fromNeeded" });
      } else {
        const sourceStep = earlier.find((candidate) => candidate.id === source.step);
        const sourceOutput = sourceStep !== undefined && sourceStep.kind !== "condition" && sourceStep.kind !== "loop"
          ? sourceStep.outputs.find((output) => output.path === source.output)
          : undefined;
        if (sourceOutput === undefined || workflowFileExtension(source.output) !== "json") {
          problems.push({ index, field: "from", key: "studio.inputs.fromSource" });
        }
      }
    }
  });
  return problems;
}

export function addModule(draft: StudioDraft, stepId: string): { draft: StudioDraft; index: number } {
  const step = draft.steps.find((candidate) => candidate.id === stepId);
  if (!step || step.kind !== "script") return { draft, index: -1 };
  const index = step.modules.length;
  return {
    draft: { ...draft, steps: draft.steps.map((candidate) => candidate.id === stepId && candidate.kind === "script"
      ? { ...candidate, modules: [...candidate.modules, { name: "", runtime: "bin" }] }
      : candidate) },
    index,
  };
}

export function updateModule(draft: StudioDraft, stepId: string, index: number, patch: Partial<WorkflowModule>): StudioDraft {
  return {
    ...draft,
    steps: draft.steps.map((step) => step.id !== stepId || step.kind !== "script"
      ? step
      : {
        ...step,
        modules: step.modules.map((module, position) => {
          if (position !== index) return module;
          const next = { ...module, ...patch };
          return next.runtime === "bin" ? { name: next.name, runtime: "bin" } : next;
        }),
      }),
  };
}

export function removeModule(draft: StudioDraft, stepId: string, index: number): StudioDraft {
  return {
    ...draft,
    steps: draft.steps.map((step) => step.id === stepId && step.kind === "script"
      ? { ...step, modules: step.modules.filter((_module, position) => position !== index) }
      : step),
  };
}

export interface ModuleProblem {
  index: number;
  field: "name" | "version";
  key: string;
  params?: Record<string, string | number>;
}

export function moduleProblems(modules: readonly WorkflowModule[]): ModuleProblem[] {
  const problems: ModuleProblem[] = [];
  modules.forEach((module, index) => {
    if (!module.name.trim()) problems.push({ index, field: "name", key: "studio.modules.needName" });
    else if (!isWorkflowModuleName(module.name, module.runtime)) problems.push({ index, field: "name", key: "studio.modules.nameInvalid" });
    if (module.runtime !== "bin" && module.version !== undefined && !isWorkflowModuleVersion(module.version)) {
      problems.push({ index, field: "version", key: "studio.modules.versionInvalid" });
    }
  });
  return problems;
}

/** The `.txt` a name without an extension suggests; `undefined` when the name already has one. */
export function suggestOutputPath(path: string): string | undefined {
  if (workflowFileExtension(path) !== undefined) return undefined;
  const trimmed = path.trim().replace(/\.$/, "");
  return trimmed ? `${trimmed}.txt` : undefined;
}

/** Outputs some later step reads, by condition, input or parameter `from`. */
export function consumedOutputs(draft: StudioDraft): Set<string> {
  const consumed = new Set<string>();
  const add = (step: string, output: string) => consumed.add(`${step}\u0000${output}`);
  for (const step of allDraftSteps(draft)) {
    if (step.kind === "condition") {
      add(step.from.step, step.from.output);
      continue;
    }
    if (step.kind === "loop") {
      add(step.from.step, step.from.output);
      continue;
    }
    for (const input of step.inputs) add(input.from.step, input.from.output);
    for (const parameter of step.parameters) {
      if (parameter.from !== undefined) add(parameter.from.step, parameter.from.output);
    }
  }
  return consumed;
}

/** A step's parameter `from` origin, keyed by the source step and output it takes. */
export function parameterChannels(step: WorkflowStep): Map<string, string> {
  const channels = new Map<string, string>();
  if (step.kind === "condition" || step.kind === "loop") return channels;
  for (const parameter of step.parameters) {
    if (parameter.from === undefined) continue;
    channels.set(`${parameter.from.step}\u0000${parameter.from.output}`, parameter.name);
  }
  return channels;
}

export interface DraftProblem {
  key: string;
  params?: Record<string, string | number>;
}

/** A refusal the Studio can already see, with the authoring path the panel and the server use. */
export interface DraftIssue extends DraftProblem {
  path: string;
}

export function draftProblems(draft: StudioDraft, botIds: ReadonlySet<string>, skillOptions: Record<string, WorkflowSkillOptions> = {}): DraftIssue[] {
  const issues: DraftIssue[] = [];
  if (!draft.name.trim()) issues.push({ key: "studio.needName", path: "name" });
  if (draft.steps.length === 0) issues.push({ key: "studio.needStep", path: "steps" });
  if (allDraftSteps(draft).length > 40) issues.push({ key: "studio.needStepMax", params: { max: 40 }, path: "steps" });
  if (draft.triggers.length === 0) issues.push({ key: "studio.trigger.needOne", path: "triggers" });
  if (draft.triggers.length > WORKFLOW_TRIGGER_MAX) {
    issues.push({ key: "studio.trigger.needMax", params: { max: WORKFLOW_TRIGGER_MAX }, path: "triggers" });
  }
  const triggerIds = new Set<string>();
  const receivesParameters = workflowReceivesExternalParameters(draft);
  draft.triggers.forEach((trigger, index) => {
    if (triggerIds.has(trigger.id)) {
      issues.push({ key: "studio.trigger.duplicateId", params: { id: trigger.id }, path: `triggers.${index}.id` });
    }
    triggerIds.add(trigger.id);
    if (!trigger.name.trim()) issues.push({ key: "studio.trigger.needName", params: { index: index + 1 }, path: `triggers.${index}.name` });
    if (trigger.kind === "webhook" && !receivesParameters) {
      issues.push({ key: "studio.trigger.needParameter", params: { name: trigger.name }, path: `triggers.${index}` });
    }
  });
  draft.steps.forEach((step, index) => stepIssues(step, `steps.${index}`, draft.steps, index, botIds, skillOptions, issues));
  return issues;
}

function stepIssues(step: WorkflowStep, path: string, pool: readonly WorkflowStep[], index: number, botIds: ReadonlySet<string>, skillOptions: Record<string, WorkflowSkillOptions>, issues: DraftIssue[]): void {
  if (step.kind === "bot" && (!step.botId || !botIds.has(step.botId))) {
    issues.push({ key: "studio.needBot", params: { name: step.name }, path: `${path}.botId` });
  }
  if (step.kind === "bot") {
    const skillProblem = skillSelectionProblem(step, skillOptions[step.botId]);
    if (skillProblem) issues.push({ ...skillProblem, path: `${path}.skills` });
  }
  if (step.kind === "script" && !isWorkflowScriptName(step.run)) {
    issues.push({ key: "studio.needScriptName", params: { name: step.name }, path: `${path}.run` });
  }
  if (step.kind !== "condition" && step.kind !== "loop" && step.onTimeout !== undefined && step.timeoutMs <= 0) {
    issues.push({ key: "studio.needTimeout", params: { name: step.name }, path: `${path}.timeoutMs` });
  }
  if (step.kind === "condition") {
    const problem = conditionProblem(step, pool);
    if (problem) {
      const fromProblem = problem.key === "studio.needFrom" || problem.key === "studio.needSourceResult";
      issues.push({ ...problem, path: `${path}.${fromProblem ? "from" : "conditions"}` });
    }
    return;
  }
  if (step.kind !== "loop") {
    const collect = collectProblem(step);
    if (collect) issues.push({ ...collect, path: `${path}.mode` });
    if (step.outputs.length === 0) issues.push({ key: "studio.needOutput", params: { name: step.name }, path: `${path}.outputs` });
    step.outputs.forEach((output, outputIndex) => outputIssues(output, `${path}.outputs.${outputIndex}.path`, issues));
    parameterIssues(step, `${path}.parameters`, issues, pool.slice(0, index));
    if (step.kind === "script") moduleIssues(step.modules, `${path}.modules`, issues);
    return;
  }

  if (step.body.length === 0) issues.push({ key: "studio.loop.needBody", params: { name: step.name }, path: `${path}.body` });
  const source = step.body.find((candidate) => candidate.id === step.from.step);
  const sourceOutput = source && source.kind !== "condition" ? source.outputs.find((output) => output.path === step.from.output) : undefined;
  if (!step.from.step || !step.from.output || !source || source.kind === "condition" || !sourceOutput?.required) {
    issues.push({ key: "studio.loop.needFrom", params: { name: step.name }, path: `${path}.from` });
  }
  if (step.conditions.length === 0) issues.push({ key: "studio.needCondition", params: { name: step.name }, path: `${path}.conditions` });
  if (step.conditions.length > WORKFLOW_CONDITION_ROWS_MAX) {
    issues.push({ key: "studio.needConditionMax", params: { name: step.name, max: WORKFLOW_CONDITION_ROWS_MAX }, path: `${path}.conditions` });
  }
  if (step.conditions.some((line) => line.op !== "exists" && line.value === undefined)) {
    issues.push({ key: "studio.needValue", params: { name: step.name }, path: `${path}.conditions` });
  }
  if (!Number.isInteger(step.maxIterations) || step.maxIterations < 1) {
    issues.push({ key: "studio.loop.needMax", params: { name: step.name }, path: `${path}.maxIterations` });
  }
  step.body.forEach((bodyStep, bodyIndex) => {
    bodyStepIssues(bodyStep, `${path}.body.${bodyIndex}`, step.body, botIds, skillOptions, issues);
  });
  step.body.forEach((bodyStep, bodyIndex) => {
    if (bodyStep.kind === "condition" || bodyStep.inputs.length === 0) return;
    bodyStep.inputs.forEach((input, inputIndex) => {
      const bodySource = step.body.find((candidate) => candidate.id === input.from.step);
      const topIndex = pool.findIndex((candidate) => candidate.id === input.from.step);
      const topSource = topIndex >= 0 && topIndex < pool.indexOf(step) ? pool[topIndex] : undefined;
      const output = bodySource !== undefined
        ? bodySource.kind !== "condition" ? bodySource.outputs.find((entry) => entry.path === input.from.output) : undefined
        : topSource !== undefined && topSource.kind !== "condition" && topSource.kind !== "loop"
          ? topSource.outputs.find((entry) => entry.path === input.from.output)
          : undefined;
      if (!output?.required) {
        issues.push({ key: "studio.loop.needInput", params: { name: bodyStep.name }, path: `${path}.body.${bodyIndex}.inputs.${inputIndex}` });
      }
    });
  });
  const declared = new Map<string, { required: boolean; count: number }>();
  for (const bodyStep of step.body) {
    if (bodyStep.kind === "condition") continue;
    for (const output of bodyStep.outputs) {
      const current = declared.get(output.path);
      declared.set(output.path, { required: output.required && (current?.required ?? true), count: (current?.count ?? 0) + 1 });
    }
  }
  if (step.outputs.length === 0) issues.push({ key: "studio.loop.needOutput", params: { name: step.name }, path: `${path}.outputs` });
  const seenOutputs = new Set<string>();
  step.outputs.forEach((output, outputIndex) => {
    if (seenOutputs.has(output.path)) {
      issues.push({ key: "studio.loop.outputAmbiguous", params: { name: step.name, path: output.path }, path: `${path}.outputs.${outputIndex}` });
    }
    seenOutputs.add(output.path);
    const declaration = declared.get(output.path);
    if (!declaration) issues.push({ key: "studio.loop.needOutput", params: { name: step.name }, path: `${path}.outputs.${outputIndex}` });
    else if (declaration.count > 1) issues.push({ key: "studio.loop.outputAmbiguous", params: { name: step.name, path: output.path }, path: `${path}.outputs.${outputIndex}` });
    else if (output.required && !declaration.required) issues.push({ key: "studio.loop.outputOptional", params: { name: step.name, path: output.path }, path: `${path}.outputs.${outputIndex}` });
  });
}

function outputIssues(output: StepOutput, path: string, issues: DraftIssue[]): void {
  if (!output.path.trim()) {
    issues.push({ key: "studio.outputs.needName", path });
    return;
  }
  if (workflowFileExtension(output.path) === undefined) {
    issues.push({ key: "studio.outputs.needExtension", params: { name: output.path }, path });
  }
}

function parameterIssues(step: WorkflowStep, path: string, issues: DraftIssue[], earlier: readonly WorkflowStep[]): void {
  for (const problem of parameterProblems(step, earlier)) {
    issues.push({ key: problem.key, params: problem.params, path: `${path}.${problem.index}.${problem.field}` });
  }
}

function moduleIssues(modules: readonly WorkflowModule[], path: string, issues: DraftIssue[]): void {
  for (const problem of moduleProblems(modules)) {
    issues.push({ key: problem.key, params: problem.params, path: `${path}.${problem.index}.${problem.field}` });
  }
}

/** A `.json` an earlier step reads whose shape is still missing. */
export function draftWarnings(draft: StudioDraft): DraftIssue[] {
  const warnings: DraftIssue[] = [];
  const consumed = consumedOutputs(draft);
  const add = (steps: readonly WorkflowStep[], prefix: string) => {
    steps.forEach((step, index) => {
      if (step.kind === "condition" || step.kind === "loop") return;
      step.outputs.forEach((output, outputIndex) => {
        if (!isWorkflowJsonPath(output.path) || output.shape !== undefined) return;
        if (!consumed.has(`${step.id}\u0000${output.path}`)) return;
        warnings.push({ key: "studio.outputs.shapeMissing", params: { name: output.path }, path: `${prefix}.${index}.outputs.${outputIndex}.path` });
      });
    });
  };
  add(draft.steps, "steps");
  draft.steps.forEach((step, index) => {
    if (step.kind === "loop") add(step.body as readonly WorkflowStep[], `steps.${index}.body`);
  });
  return warnings;
}

function bodyStepIssues(step: WorkflowBodyStep, path: string, pool: readonly WorkflowBodyStep[], botIds: ReadonlySet<string>, skillOptions: Record<string, WorkflowSkillOptions>, issues: DraftIssue[]): void {
  const asStep = step as WorkflowStep;
  if (asStep.kind === "bot" && (!asStep.botId || !botIds.has(asStep.botId))) {
    issues.push({ key: "studio.needBot", params: { name: asStep.name }, path: `${path}.botId` });
  }
  if (asStep.kind === "bot") {
    const skillProblem = skillSelectionProblem(asStep, skillOptions[asStep.botId]);
    if (skillProblem) issues.push({ ...skillProblem, path: `${path}.skills` });
  }
  if (asStep.kind === "script" && !isWorkflowScriptName(asStep.run)) {
    issues.push({ key: "studio.needScriptName", params: { name: asStep.name }, path: `${path}.run` });
  }
  if (asStep.kind !== "condition" && asStep.kind !== "loop" && asStep.onTimeout !== undefined && asStep.timeoutMs <= 0) {
    issues.push({ key: "studio.needTimeout", params: { name: asStep.name }, path: `${path}.timeoutMs` });
  }
  if (asStep.kind === "condition") {
    const problem = conditionProblem(asStep, pool as readonly WorkflowStep[]);
    if (problem) {
      const fromProblem = problem.key === "studio.needFrom" || problem.key === "studio.needSourceResult";
      issues.push({ ...problem, path: `${path}.${fromProblem ? "from" : "conditions"}` });
    }
    return;
  }
  const collect = collectProblem(asStep);
  if (collect) issues.push({ ...collect, path: `${path}.mode` });
  if (asStep.outputs.length === 0) issues.push({ key: "studio.needOutput", params: { name: asStep.name }, path: `${path}.outputs` });
  asStep.outputs.forEach((output, outputIndex) => outputIssues(output, `${path}.outputs.${outputIndex}.path`, issues));
  parameterIssues(asStep, `${path}.parameters`, issues, pool.slice(0, pool.indexOf(step)));
  if (asStep.kind === "script") moduleIssues(asStep.modules, `${path}.modules`, issues);
}

/** The first problem, kept for callers that only need the refusal line. */
export function draftProblem(draft: StudioDraft, botIds: ReadonlySet<string>, skillOptions: Record<string, WorkflowSkillOptions> = {}): DraftProblem | undefined {
  const [first] = draftProblems(draft, botIds, skillOptions);
  return first === undefined ? undefined : { key: first.key, params: first.params };
}

function conditionProblem(step: WorkflowBodyStep | WorkflowStep, pool: readonly WorkflowStep[]): DraftProblem | undefined {
  if (step.kind !== "condition") return undefined;
  if (!step.from.step || !step.from.output) return { key: "studio.needFrom", params: { name: step.name } };
  const sourceIndex = pool.findIndex((candidate) => candidate.id === step.from.step);
  const source = pool[sourceIndex];
  const sourceOutput = source && source.kind !== "condition" ? source.outputs.find((output) => output.path === step.from.output) : undefined;
  if (sourceIndex < 0 || !source || source.kind === "condition" || !sourceOutput?.required) {
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

function collectProblem(step: WorkflowBodyStep | WorkflowStep): DraftProblem | undefined {
  if (step.kind === "condition" || step.kind === "loop") return undefined;
  if (step.mode !== "manual") return undefined;
  if (step.parameters.some((parameter) => parameter.collectedBy === step.id)) return undefined;
  return { key: "studio.needManualCollect", params: { name: step.name } };
}

/** Move a script's content to its new file name, leaving no stale copy behind. */
export function renameScript(scripts: Record<string, string>, from: string, to: string): Record<string, string> {
  if (from === to) return scripts;
  const next = { ...scripts, [to]: scripts[from] ?? DEFAULT_SCRIPT };
  delete next[from];
  return next;
}

export function outputsOf(step: WorkflowStep): StepOutput[] {
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
