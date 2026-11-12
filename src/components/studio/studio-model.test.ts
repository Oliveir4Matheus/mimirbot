import { describe, expect, it } from "vitest";

import { workflowDefinitionSchema } from "../../../shared/workflow";
import {
  addConditionLine, allDraftSteps, autoLayout, bodyDraft, conditionLines, connect, containedBy, createStep, disconnect, draftProblem, duplicateLoop, fromDefinition,
  newDraft, removeConditionLine, removeStep, renameScript, scriptLanguageOf, scriptNameForLanguage, selectAllSkills,
  setSkillGroup, skillCount, skillSelection, skillSelectionProblem, skillsWithGroup, toDefinition, toggleSkill, toggleSkillGroup,
  updateConditionLine, updateConditionMatch, updateNote, withBodyDraft, type StudioDraft,
} from "./studio-model";

const step = (draft: StudioDraft, kind: "agent" | "script" | "condition", x: number, y: number, botId = "bot-a") =>
  createStep(draft, kind, { x, y }, botId);

describe("studio model", () => {
  it("lays steps out in rows of three", () => {
    const layout = autoLayout([
      { id: "a" }, { id: "b" }, { id: "c" }, { id: "d" },
    ] as never);
    expect(layout.a).toEqual({ x: 80, y: 120 });
    expect(layout.c).toEqual({ x: 80 + 2 * 360, y: 120 });
    expect(layout.d).toEqual({ x: 80, y: 120 + 282 });
  });

  it("connects two steps and fills the condition source", () => {
    const first = step(newDraft("Financeiro"), "agent", 200, 200).draft;
    const agent = first.steps[0]!;
    const second = step(first, "condition", 600, 200).draft;
    const condition = second.steps[1]!;
    const result = connect(second, agent.id, "run", condition.id);
    if (!result.ok) throw new Error(result.key);
    const source = result.draft.steps[0]!;
    const target = result.draft.steps[1]!;
    expect(source.kind === "bot" && source.onSuccess).toBe(condition.id);
    expect(target.kind === "condition" && target.from).toBe(agent.id);
  });

  it("refuses self, cycles, an occupied entry and an occupied output", () => {
    const draft = step(step(step(newDraft("Financeiro"), "agent", 200, 200).draft, "agent", 600, 200).draft, "agent", 1000, 200).draft;
    const [a, b, c] = draft.steps;
    expect(connect(draft, a!.id, "run", a!.id)).toEqual({ ok: false, key: "studio.toast.self" });
    const ab = connect(draft, a!.id, "run", b!.id);
    if (!ab.ok) throw new Error(ab.key);
    expect(connect(ab.draft, b!.id, "run", a!.id)).toEqual({ ok: false, key: "studio.toast.cycle" });
    expect(connect(ab.draft, c!.id, "run", b!.id)).toEqual({ ok: false, key: "studio.toast.entryTaken" });
    expect(connect(ab.draft, a!.id, "run", c!.id)).toEqual({ ok: false, key: "studio.toast.outputTaken" });
  });

  it("removes a step with its edges, inputs and note links", () => {
    const draft = step(step(newDraft("Financeiro"), "agent", 200, 200).draft, "agent", 600, 200).draft;
    const [a, b] = draft.steps;
    const linked = {
      ...draft,
      steps: draft.steps.map((candidate) => candidate.id === b!.id && candidate.kind === "bot"
        ? { ...candidate, inputs: [{ as: "x.csv", from: { step: a!.id, output: "x.csv" } }] }
        : candidate),
      canvas: {
        ...draft.canvas,
        notes: [{ id: "note-1", x: 0, y: 0, width: 255, height: 180, markdown: "", link: { kind: "step" as const, id: a!.id } }],
      },
    };
    const next = removeStep(linked, a!.id);
    expect(next.steps).toHaveLength(1);
    expect(next.steps[0]!.kind === "bot" && next.steps[0]!.inputs).toEqual([]);
    expect(next.canvas.notes[0]!.link).toBeUndefined();
    expect(next.canvas.nodes[a!.id]).toBeUndefined();
  });

  it("prunes stale nodes and container links when it becomes a definition", () => {
    const draft = newDraft("Financeiro");
    const withNote = updateNote(
      { ...draft, canvas: { ...draft.canvas, nodes: { ghost: { x: 1, y: 1 } } } },
      "note-1",
      { markdown: "hi", link: { kind: "container", id: "gone" } },
    );
    const withNote2 = { ...withNote, canvas: { ...withNote.canvas, notes: [{ id: "note-1", x: 0, y: 0, width: 255, height: 180, markdown: "hi", link: { kind: "container" as const, id: "gone" } }] } };
    const agent = step(withNote2, "agent", 200, 200).draft;
    const definition = toDefinition(agent);
    expect(definition.canvas?.nodes.ghost).toBeUndefined();
    expect(definition.canvas?.notes[0]!.link).toBeUndefined();
  });

  it("defaults a new step to automatic and keeps a manual mode when saved", () => {
    const draft = step(newDraft("Financeiro"), "agent", 200, 200).draft;
    expect(draft.steps[0]!.kind === "bot" && draft.steps[0]!.mode).toBe("auto");
    const manual: StudioDraft = {
      ...draft,
      steps: draft.steps.map((candidate) => candidate.kind === "bot" ? { ...candidate, mode: "manual" } : candidate),
    };
    const saved = toDefinition(manual);
    expect(saved.steps[0]!.kind === "bot" && saved.steps[0]!.mode).toBe("manual");
  });

  it("reports a condition without a source and a bot without a bot", () => {
    const draft = { ...step(newDraft("Financeiro"), "condition", 200, 200).draft, name: "Test" };
    expect(draftProblem(draft, new Set(["bot-a"]))?.key).toBe("studio.needFrom");
    const bot = { ...step(newDraft("Financeiro"), "agent", 200, 200, "").draft, name: "Test" };
    expect(draftProblem(bot, new Set(["bot-a"]))?.key).toBe("studio.needBot");
  });

  it("keeps saved positions and fills the steps that have none", () => {
    const draft = step(newDraft("Financeiro"), "agent", 200, 200).draft;
    const definition = toDefinition(draft);
    const restored = fromDefinition({ ...definition, canvas: { nodes: { [draft.steps[0]!.id]: { x: 900, y: 700 } }, notes: [], containers: [], loops: {} } });
    expect(restored.canvas.nodes[draft.steps[0]!.id]).toEqual({ x: 900, y: 700 });
  });

  it("moves the elements whose center sits inside a container", () => {
    const draft = step(newDraft("Financeiro"), "agent", 300, 300).draft;
    const inside = containedBy({ ...draft, canvas: { ...draft.canvas, containers: [{ id: "c1", x: 100, y: 100, width: 520, height: 310, name: "Group" }] } }, "c1");
    expect(inside.steps).toEqual([draft.steps[0]!.id]);
  });

  it("materializes a legacy success edge and saves an unconnected step as the end", () => {
    const definition = workflowDefinitionSchema.parse({
      id: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
      version: 1,
      name: "Legacy",
      department: "Financeiro",
      steps: [
        { id: "a", name: "A", botId: "bot-a", instructions: "A.", outputs: [{ path: "a.txt" }] },
        { id: "b", name: "B", botId: "bot-a", instructions: "B.", outputs: [{ path: "b.txt" }] },
      ],
      createdAt: 1,
      updatedAt: 1,
    });
    const draft = fromDefinition(definition);
    expect(draft.steps[0]!.kind === "bot" && draft.steps[0]!.onSuccess).toBe("b");
    expect(draft.steps[1]!.kind === "bot" && draft.steps[1]!.onSuccess).toBeNull();
    const saved = toDefinition(draft);
    expect(saved.steps[0]!.kind === "bot" && saved.steps[0]!.onSuccess).toBe("b");
  });

  it("connects and disconnects the failure and timeout routes", () => {
    const draft = step(step(newDraft("Financeiro"), "agent", 200, 200).draft, "agent", 600, 200).draft;
    const [a, b] = draft.steps;
    const failure = connect(draft, a!.id, "failure", b!.id);
    if (!failure.ok) throw new Error(failure.key);
    expect(failure.draft.steps[0]!.kind === "bot" && failure.draft.steps[0]!.onFailure).toBe(b!.id);
    const timeout = connect(draft, a!.id, "timeout", b!.id);
    if (!timeout.ok) throw new Error(timeout.key);
    expect(timeout.draft.steps[0]!.kind === "bot" && timeout.draft.steps[0]!.onTimeout).toBe(b!.id);
    const cleared = disconnect(timeout.draft, a!.id, "timeout");
    expect(cleared.steps[0]!.kind === "bot" && cleared.steps[0]!.onTimeout).toBeUndefined();
    const runCleared = disconnect(cleared, a!.id, "run");
    expect(runCleared.steps[0]!.kind === "bot" && runCleared.steps[0]!.onSuccess).toBeNull();
  });

  it("allows a success entry where a failure edge lands and still refuses two success entries", () => {
    const draft = step(step(step(newDraft("Financeiro"), "agent", 200, 200).draft, "agent", 600, 200).draft, "agent", 1000, 200).draft;
    const [a, b, c] = draft.steps;
    const failed = connect(draft, a!.id, "failure", c!.id);
    if (!failed.ok) throw new Error(failed.key);
    expect(connect(failed.draft, b!.id, "run", c!.id).ok).toBe(true);
    const success = connect(draft, a!.id, "run", c!.id);
    if (!success.ok) throw new Error(success.key);
    expect(connect(success.draft, b!.id, "run", c!.id)).toEqual({ ok: false, key: "studio.toast.entryTaken" });
  });

  it("reports a timeout route that has no maximum time", () => {
    const draft = step(step(newDraft("Financeiro"), "agent", 200, 200).draft, "agent", 600, 200).draft;
    const [a, b] = draft.steps;
    const connected = connect(draft, a!.id, "timeout", b!.id);
    if (!connected.ok) throw new Error(connected.key);
    expect(draftProblem({ ...connected.draft, name: "Test" }, new Set(["bot-a"]))?.key).toBe("studio.needTimeout");
  });

  it("maps a script extension to a language and keeps the base name", () => {
    expect(scriptLanguageOf("validar.mjs")).toBe("javascript");
    expect(scriptLanguageOf("validar.js")).toBe("javascript");
    expect(scriptLanguageOf("validar.ts")).toBe("typescript");
    expect(scriptLanguageOf("validar.py")).toBe("python");
    expect(scriptNameForLanguage("validar.mjs", "typescript")).toBe("validar.ts");
    expect(scriptNameForLanguage("validar.ts", "python")).toBe("validar.py");
    expect(scriptNameForLanguage("validar.py", "javascript")).toBe("validar.mjs");
  });

  it("moves the script content when the language renames the file", () => {
    expect(renameScript({ "validar.mjs": "const ok = true;" }, "validar.mjs", "validar.py")).toEqual({ "validar.py": "const ok = true;" });
    expect(renameScript({ "validar.mjs": "same" }, "validar.mjs", "validar.mjs")).toEqual({ "validar.mjs": "same" });
  });

  it("starts a condition with one all line and adds, updates and removes lines", () => {
    const first = step(newDraft("Financeiro"), "condition", 200, 200).draft;
    const id = first.steps[0]!.id;
    expect(conditionLines(first.steps[0]!)).toEqual([{ field: "ok", op: "equals", value: true }]);
    expect(first.steps[0]!.kind === "condition" && first.steps[0]!.match).toBe("all");

    const added = addConditionLine(first, id);
    expect(conditionLines(added.steps[0]!)).toHaveLength(2);

    const updated = updateConditionMatch(updateConditionLine(added, id, 1, { field: "total", op: "gt", value: 10 }), id, "any");
    expect(updated.steps[0]!.kind === "condition" && updated.steps[0]!.match).toBe("any");
    expect(conditionLines(updated.steps[0]!)[1]).toEqual({ field: "total", op: "gt", value: 10 });

    const removed = removeConditionLine(updated, id, 0);
    expect(conditionLines(removed.steps[0]!)).toEqual([{ field: "total", op: "gt", value: 10 }]);
  });

  it("stops adding condition lines at twenty", () => {
    let draft = step(newDraft("Financeiro"), "condition", 200, 200).draft;
    const id = draft.steps[0]!.id;
    for (let index = 0; index < 25; index += 1) draft = addConditionLine(draft, id);
    expect(conditionLines(draft.steps[0]!)).toHaveLength(20);
  });

  it("validates the condition group size and the value of every line", () => {
    const base = step(newDraft("Financeiro"), "agent", 200, 200).draft;
    const agent = base.steps[0]!;
    const withCondition = step(base, "condition", 600, 200).draft;
    const condition = withCondition.steps[1]!;
    const connected = connect(withCondition, agent.id, "run", condition.id);
    if (!connected.ok) throw new Error(connected.key);
    const named = { ...connected.draft, name: "Test" };

    expect(draftProblem({ ...named, steps: named.steps.map((candidate) => candidate.id === condition.id && candidate.kind === "condition" ? { ...candidate, conditions: [] } : candidate) }, new Set(["bot-a"]))?.key).toBe("studio.needCondition");
    expect(draftProblem({ ...named, steps: named.steps.map((candidate) => candidate.id === condition.id && candidate.kind === "condition" ? { ...candidate, conditions: Array.from({ length: 21 }, () => ({ field: "ok", op: "equals" as const, value: true })) } : candidate) }, new Set(["bot-a"]))?.key).toBe("studio.needConditionMax");
    expect(draftProblem({ ...named, steps: named.steps.map((candidate) => candidate.id === condition.id && candidate.kind === "condition" ? { ...candidate, conditions: [{ field: "ok", op: "equals" as const }] } : candidate) }, new Set(["bot-a"]))?.key).toBe("studio.needValue");
  });
});

describe("studio step skills", () => {
  const options = {
    bot: [
      { name: "own", label: "own", description: "Own", available: true },
      { name: "disabled", label: "disabled", description: "Disabled", available: false },
    ],
    bundled: [{ name: "create-bot", label: "Create a Bot", description: "Bundled", available: true }],
    imported: [{ name: "from-claude", label: "from-claude", description: "Imported", available: true }],
  };
  const withAgent = () => {
    const draft = step(newDraft("Financeiro"), "agent", 200, 200).draft;
    return { draft, id: draft.steps[0]!.id };
  };

  it("starts with no skills and reads absent groups as empty", () => {
    const { draft } = withAgent();
    const agent = draft.steps[0]!;
    expect(agent.kind === "bot" && agent.skills).toBeUndefined();
    expect(skillSelection(agent)).toEqual({ bot: [], bundled: [], imported: [] });
    expect(skillCount(agent)).toBe(0);
    expect(skillsWithGroup(draft.steps[0]!, "bot", [])).toBeUndefined();
  });

  it("turns a group on with every available option and off with none", () => {
    const { draft, id } = withAgent();
    const on = toggleSkillGroup(draft, id, "bot", ["own", "disabled"]);
    expect(skillSelection(on.steps[0]!).bot).toEqual(["own", "disabled"]);
    const off = toggleSkillGroup(on, id, "bot", ["own", "disabled"]);
    expect(off.steps[0]!.kind === "bot" && off.steps[0]!.skills).toBeUndefined();
    expect(skillSelection(off.steps[0]!)).toEqual({ bot: [], bundled: [], imported: [] });
  });

  it("selects all, marks one and clears one", () => {
    const { draft, id } = withAgent();
    const all = selectAllSkills(draft, id, "bundled", ["create-bot"]);
    expect(skillSelection(all.steps[0]!).bundled).toEqual(["create-bot"]);
    const removed = toggleSkill(all, id, "bundled", "create-bot");
    expect(removed.steps[0]!.kind === "bot" && removed.steps[0]!.skills).toBeUndefined();
    const imported = toggleSkill(setSkillGroup(draft, id, "imported", ["from-claude"]), id, "imported", "from-claude");
    expect(imported.steps[0]!.kind === "bot" && imported.steps[0]!.skills).toBeUndefined();
  });

  it("round-trips the selection through the definition and the schema", () => {
    const { draft, id } = withAgent();
    const selected = setSkillGroup(setSkillGroup(draft, id, "bot", ["own"]), id, "imported", ["from-claude"]);
    const definition = toDefinition({ ...selected, name: "Test" });
    const parsed = workflowDefinitionSchema.parse(definition);
    expect(parsed.steps[0]!.kind === "bot" && parsed.steps[0]!.skills).toEqual({ bot: ["own"], imported: ["from-claude"] });
    const restored = fromDefinition(parsed);
    expect(restored.steps[0]!.kind === "bot" && restored.steps[0]!.skills).toEqual({ bot: ["own"], imported: ["from-claude"] });
  });

  it("reports an unavailable skill before saving", () => {
    const { draft, id } = withAgent();
    const selected = setSkillGroup(draft, id, "bot", ["disabled"]);
    expect(skillSelectionProblem(selected.steps[0]!, options)?.key).toBe("studio.skillUnavailable");
    expect(draftProblem({ ...selected, name: "Test" }, new Set(["bot-a"]), { "bot-a": options })?.params?.name).toBe("disabled");
    expect(skillSelectionProblem(setSkillGroup(draft, id, "bot", ["own"]).steps[0]!, options)).toBeUndefined();
  });
});

describe("Do While in the Studio", () => {
  const withLoop = () => {
    let draft = { ...newDraft("Financeiro"), name: "Lote" };
    const created = createStep(draft, "loop", { x: 300, y: 300 });
    draft = created.draft;
    const loopId = created.stepId;
    let body = bodyDraft(draft, loopId)!;
    const bodyStep = createStep(body, "script", { x: 120, y: 120 });
    body = bodyStep.draft;
    const bodyId = bodyStep.stepId;
    draft = withBodyDraft(draft, loopId, body);
    draft = {
      ...draft,
      steps: draft.steps.map((step) => step.id === loopId && step.kind === "loop"
        ? { ...step, from: bodyId, outputs: [{ path: "result.json", required: true }], result: "result.json" }
        : step),
    };
    return { draft, loopId, bodyId };
  };

  it("creates a loop card with an empty body and its own sub-canvas", () => {
    const created = createStep({ ...newDraft("Financeiro"), name: "Lote" }, "loop", { x: 300, y: 300 });
    const loop = created.draft.steps[0]!;
    expect(loop.kind).toBe("loop");
    expect(loop.kind === "loop" && loop.body).toEqual([]);
    expect(created.draft.canvas.loops[created.stepId]).toEqual({ nodes: {}, notes: [], containers: [] });
  });

  it("keeps a body step id unique against the main canvas", () => {
    let draft = { ...newDraft("Financeiro"), name: "Lote" };
    const topScript = createStep(draft, "script", { x: 120, y: 120 });
    draft = topScript.draft;
    const created = createStep(draft, "loop", { x: 500, y: 300 });
    draft = created.draft;
    const body = bodyDraft(draft, created.stepId)!;
    const globalIds = new Set(allDraftSteps(draft).map((step) => step.id));
    const bodyStep = createStep(body, "script", { x: 120, y: 120 }, "bot-a", globalIds);
    expect(bodyStep.stepId).not.toBe(topScript.stepId);
    expect(globalIds.has(bodyStep.stepId)).toBe(false);
  });

  it("asks for a body before saving an empty loop", () => {
    const created = createStep({ ...newDraft("Financeiro"), name: "Lote" }, "loop", { x: 300, y: 300 });
    expect(draftProblem(created.draft, new Set())).toEqual({ key: "studio.loop.needBody", params: { name: expect.any(String) } });
  });

  it("edits the body through the same draft model and saves a valid definition", () => {
    const { draft, loopId, bodyId } = withLoop();
    expect(draftProblem(draft, new Set(["bot-a"]))).toBeUndefined();
    const definition = toDefinition(draft);
    expect(workflowDefinitionSchema.safeParse(definition).success).toBe(true);
    const loop = definition.steps.find((step) => step.id === loopId);
    expect(loop?.kind === "loop" && loop.body[0]?.id).toBe(bodyId);
    expect(definition.canvas?.loops[loopId]?.nodes[bodyId]).toBeDefined();
    const restored = fromDefinition(definition);
    expect(restored.steps.find((step) => step.id === loopId)?.kind).toBe("loop");
    expect(restored.canvas.loops[loopId]?.nodes[bodyId]).toBeDefined();
  });

  it("duplicates the body and the sub-canvas with fresh ids", () => {
    const { draft, loopId } = withLoop();
    const copy = duplicateLoop(draft, loopId, { x: 900, y: 400 });
    if (!copy) throw new Error("no copy");
    const original = draft.steps.find((step) => step.id === loopId);
    const clone = copy.draft.steps.find((step) => step.id === copy.stepId);
    if (original?.kind !== "loop" || clone?.kind !== "loop") throw new Error("not a loop");
    expect(clone.id).not.toBe(original.id);
    expect(clone.body[0]!.id).not.toBe(original.body[0]!.id);
    expect(clone.from).toBe(clone.body[0]!.id);
    expect(copy.draft.canvas.loops[copy.stepId]?.nodes[clone.body[0]!.id]).toBeDefined();
    expect(clone.onSuccess).toBeUndefined();
  });

  it("removes the sub-canvas with the loop card", () => {
    const { draft, loopId } = withLoop();
    const removed = removeStep(draft, loopId);
    expect(removed.steps).toHaveLength(0);
    expect(removed.canvas.loops[loopId]).toBeUndefined();
  });

  it("refuses a loop output declared twice or required from an optional body output", () => {
    const { draft, loopId } = withLoop();
    const twice = {
      ...draft,
      steps: draft.steps.map((step) => step.id === loopId && step.kind === "loop"
        ? { ...step, outputs: [{ path: "result.json", required: true }, { path: "result.json", required: true }] }
        : step),
    };
    expect(draftProblem(twice, new Set(["bot-a"]))?.key).toMatch(/studio.loop.needOutput|studio.loop.outputAmbiguous/);
    const optionalBody = {
      ...draft,
      steps: draft.steps.map((step) => step.id === loopId && step.kind === "loop"
        ? { ...step, body: step.body.map((bodyStep) => bodyStep.kind === "script" ? { ...bodyStep, outputs: [{ path: "result.json", required: false }] } : bodyStep) }
        : step),
    };
    expect(draftProblem(optionalBody, new Set(["bot-a"]))?.key).toBe("studio.loop.outputOptional");
  });
});
