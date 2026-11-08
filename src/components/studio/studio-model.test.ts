import { describe, expect, it } from "vitest";

import {
  autoLayout, connect, containedBy, createStep, draftProblem, fromDefinition, newDraft, removeStep,
  toDefinition, updateNote, type StudioDraft,
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
    expect(source.kind === "bot" && source.next).toBe(condition.id);
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

  it("reports a condition without a source and a bot without a bot", () => {
    const draft = { ...step(newDraft("Financeiro"), "condition", 200, 200).draft, name: "Test" };
    expect(draftProblem(draft, new Set(["bot-a"]))?.key).toBe("studio.needFrom");
    const bot = { ...step(newDraft("Financeiro"), "agent", 200, 200, "").draft, name: "Test" };
    expect(draftProblem(bot, new Set(["bot-a"]))?.key).toBe("studio.needBot");
  });

  it("keeps saved positions and fills the steps that have none", () => {
    const draft = step(newDraft("Financeiro"), "agent", 200, 200).draft;
    const definition = toDefinition(draft);
    const restored = fromDefinition({ ...definition, canvas: { nodes: { [draft.steps[0]!.id]: { x: 900, y: 700 } }, notes: [], containers: [] } });
    expect(restored.canvas.nodes[draft.steps[0]!.id]).toEqual({ x: 900, y: 700 });
  });

  it("moves the elements whose center sits inside a container", () => {
    const draft = step(newDraft("Financeiro"), "agent", 300, 300).draft;
    const inside = containedBy({ ...draft, canvas: { ...draft.canvas, containers: [{ id: "c1", x: 100, y: 100, width: 520, height: 310, name: "Group" }] } }, "c1");
    expect(inside.steps).toEqual([draft.steps[0]!.id]);
  });
});
