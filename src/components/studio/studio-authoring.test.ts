import { describe, expect, it } from "vitest";

import { workflowDefinitionSchema } from "../../../shared/workflow";
import {
  addModule, addParameter, createStep, draftProblems, draftWarnings, legacyFields, newDraft, parameterChannels, removeStep,
  suggestOutputPath, targetForPath, toDefinition, updateModule, updateStep,
  type StudioDraft,
} from "./studio-model";

const step = (draft: StudioDraft, kind: "agent" | "script" | "condition" | "loop", x = 200, botId = "bot-a") =>
  createStep(draft, kind, { x, y: 200 }, botId);

function named(draft: StudioDraft): StudioDraft {
  return { ...draft, name: "Fluxo de teste" };
}

describe("the Studio's authoring checks", () => {
  it("blocks a manual step that collects nothing and accepts it once the parameter exists", () => {
    let draft = named(step(newDraft("Financeiro"), "agent").draft);
    const id = draft.steps[0]!.id;
    draft = updateStep(draft, id, { mode: "manual" } as never);

    expect(draftProblems(draft, new Set(["bot-a"])).map((issue) => issue.key)).toContain("studio.needManualCollect");

    draft = addParameter(draft, id, { collectedBy: id }).draft;
    expect(draftProblems(draft, new Set(["bot-a"]))).toEqual([]);
    expect(workflowDefinitionSchema.safeParse(toDefinition(draft)).success).toBe(true);
  });

  it("blocks an output with no extension, suggests one, and accepts the suggestion", () => {
    let draft = named(step(newDraft("Financeiro"), "script").draft);
    const id = draft.steps[0]!.id;
    draft = updateStep(draft, id, { outputs: [{ path: "trechos", required: true }] } as never);

    const [issue] = draftProblems(draft, new Set());
    expect(issue?.key).toBe("studio.outputs.needExtension");
    expect(issue?.path).toBe("steps.0.outputs.0.path");
    expect(suggestOutputPath("trechos")).toBe("trechos.txt");
    expect(suggestOutputPath("trechos.json")).toBeUndefined();

    draft = updateStep(draft, id, { outputs: [{ path: "trechos.txt", required: true }] } as never);
    expect(draftProblems(draft, new Set())).toEqual([]);
    expect(workflowDefinitionSchema.safeParse(toDefinition(draft)).success).toBe(true);
  });

  it("warns about a consumed .json that declares no shape, and stops when the shape arrives", () => {
    let draft = named(step(newDraft("Financeiro"), "script", 120).draft);
    const source = draft.steps[0]!;
    draft = updateStep(draft, source.id, { outputs: [{ path: "dados.json", required: true }] } as never);
    const consumer = step(draft, "script", 600).draft;
    draft = updateStep(consumer, consumer.steps[1]!.id, {
      inputs: [{ as: "dados.json", from: { step: source.id, output: "dados.json" } }],
    } as never);
    draft = named(draft);

    expect(draftWarnings(draft).map((warning) => warning.path)).toEqual(["steps.0.outputs.0.path"]);

    draft = updateStep(draft, source.id, {
      outputs: [{ path: "dados.json", required: true, shape: { type: "object" } }],
    } as never);
    expect(draftWarnings(draft)).toEqual([]);
  });

  it("records a document already read by a parameter as a channel conflict", () => {
    let draft = named(step(newDraft("Financeiro"), "script", 120).draft);
    const source = draft.steps[0]!;
    draft = updateStep(draft, source.id, { outputs: [{ path: "dados.json", required: true }] } as never);
    draft = step(draft, "agent", 600).draft;
    const consumer = draft.steps[1]!;
    draft = updateStep(draft, consumer.id, {
      parameters: [{ name: "clips", type: "string", list: false, required: true, from: { step: source.id, output: "dados.json", field: "clips" } }],
    } as never);
    draft = named(draft);

    expect(parameterChannels(draft.steps[1]!).get(`${source.id}\u0000dados.json`)).toBe("clips");
    expect(parameterChannels(draft.steps[1]!).size).toBe(1);
    expect(draftProblems(draft, new Set(["bot-a"]))).toEqual([]);

    const after = removeStep(draft, source.id);
    const remaining = after.steps[0]!;
    expect(remaining.kind === "bot" ? remaining.parameters[0]!.from : "keep").toBeUndefined();
  });

  it("refuses a parameter from a step that does not declare the file, and clears it when that step goes", () => {
    let draft = named(step(newDraft("Financeiro"), "agent").draft);
    const id = draft.steps[0]!.id;
    draft = updateStep(draft, id, {
      parameters: [{ name: "clips", type: "string", list: false, required: true, from: { step: "fantasma", output: "dados.json", field: "clips" } }],
    } as never);

    expect(draftProblems(draft, new Set(["bot-a"])).map((issue) => issue.key)).toContain("studio.inputs.fromSource");

    draft = updateStep(draft, id, {
      parameters: [{ name: "clips", type: "string", list: false, required: true, from: { step: id, output: "result.txt", field: "clips" } }],
    } as never);
    expect(draftProblems(draft, new Set(["bot-a"])).map((issue) => issue.key)).toContain("studio.inputs.fromSource");
  });

  it("describes modules with a runtime and a version and refuses a bad entry", () => {
    let draft = named(step(newDraft("Financeiro"), "script").draft);
    const id = draft.steps[0]!.id;

    draft = addModule(draft, id).draft;
    expect(draftProblems(draft, new Set()).map((issue) => issue.path)).toContain("steps.0.modules.0.name");

    draft = updateModule(draft, id, 0, { name: "faster-whisper", runtime: "python", version: "1.2.1" });
    expect(draftProblems(draft, new Set())).toEqual([]);

    draft = updateModule(draft, id, 0, { version: "1.2 1" });
    expect(draftProblems(draft, new Set()).map((issue) => issue.key)).toContain("studio.modules.versionInvalid");

    draft = updateModule(draft, id, 0, { runtime: "bin", version: "1.2.1" });
    const modules = draft.steps[0]!.kind === "script" ? draft.steps[0]!.modules : [];
    expect(modules[0]).toEqual({ name: "faster-whisper", runtime: "bin" });
  });
});

describe("revealing an authoring path", () => {
  it("maps a step field, a parameter and an output to the balloon that owns them", () => {
    const draft = named(step(newDraft("Financeiro"), "agent").draft);
    const id = draft.steps[0]!.id;

    expect(targetForPath(draft.steps, "steps.0.mode")).toEqual({ stepId: id, branch: "run", field: "mode" });
    expect(targetForPath(draft.steps, "steps.0.parameters.1.name")).toEqual({ stepId: id, branch: "context", field: "parameters.1.name" });
    expect(targetForPath(draft.steps, "steps.0.outputs.0.path")).toEqual({ stepId: id, branch: "return", field: "outputs.0.path" });
    expect(targetForPath(draft.steps, "steps.0.instructions")).toEqual({ stepId: id, branch: "instructions", field: "instructions" });
    expect(targetForPath(draft.steps, "name")).toBeUndefined();

    const withCondition = step(draft, "condition", 600).draft;
    const condition = withCondition.steps[1]!;
    expect(targetForPath(withCondition.steps, "steps.1.from")).toEqual({ stepId: condition.id, branch: "condition", field: "from" });
    expect(targetForPath(withCondition.steps, "steps.1.from.output")).toEqual({ stepId: condition.id, branch: "condition", field: "from.output" });
  });

  it("maps a body step to its Do While and keeps the balloon's own branch", () => {
    let draft = named(step(newDraft("Financeiro"), "loop").draft);
    const loopId = draft.steps[0]!.id;
    draft = updateStep(draft, loopId, {
      body: [{
        id: "coletar", kind: "script", name: "Coletar", run: "coletar.mjs", timeoutMs: 60_000, mode: "manual",
        modules: [], inputs: [], parameters: [], outputs: [{ path: "result.txt", required: true }],
      }],
    } as never);

    expect(targetForPath(draft.steps, "steps.0.body.0.run")).toEqual({ stepId: "coletar", loopId, branch: "script", field: "run" });
    expect(targetForPath(draft.steps, "steps.0.body.0.mode")).toEqual({ stepId: "coletar", loopId, branch: "run", field: "mode" });
    expect(targetForPath(draft.steps, "steps.0.outputs.0.path")).toEqual({ stepId: loopId, branch: "condition", field: "outputs" });
  });
});

describe("legacy fields in a definition", () => {
  it("counts result, when and require with the control that removes each", () => {
    let draft = named(step(newDraft("Financeiro"), "agent").draft);
    const id = draft.steps[0]!.id;
    draft = updateStep(draft, id, { result: "result.json", when: [{ field: "ok", equals: true, next: id }], require: { ok: true } } as never);

    const fields = legacyFields(draft);
    expect(fields.map((field) => field.name)).toEqual(["result", "when", "require"]);
    expect(fields[0]!.target).toEqual({ stepId: id, branch: "return", field: "legacy" });
    expect(fields[1]!.target).toEqual({ stepId: id, branch: "run", field: "legacy" });
  });
});
