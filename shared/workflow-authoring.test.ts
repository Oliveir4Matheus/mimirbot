import { describe, expect, it } from "vitest";

import { validateWorkflowAuthoring } from "./workflow-authoring.ts";
import { WORKFLOW_SHAPE_MAX_BYTES, workflowDefinitionSchema, type WorkflowDefinition } from "./workflow.ts";

const definition = (steps: unknown[], extra: Record<string, unknown> = {}): WorkflowDefinition => workflowDefinitionSchema.parse({
  id: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
  version: 1,
  name: "Cortes do dia",
  department: "Marketing",
  steps,
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

const producer = (outputs: unknown[], overrides: Record<string, unknown> = {}) => ({
  id: "baixar",
  kind: "script",
  name: "Baixar",
  run: "baixar.mjs",
  outputs,
  ...overrides,
});

const condition = (output: string, overrides: Record<string, unknown> = {}) => ({
  id: "checar",
  kind: "condition",
  name: "Checar",
  from: { step: "baixar", output },
  conditions: [{ field: "total", op: "gte", value: 1 }],
  ...overrides,
});

const compileNothing = (): void => {};

const trechos = {
  type: "object",
  required: ["clips", "total"],
  properties: {
    total: { type: "integer", minimum: 1 },
    clips: { type: "array", minItems: 1, items: { type: "string" } },
  },
};

const consumer = (parameters: unknown[], overrides: Record<string, unknown> = {}) => ({
  id: "renderizar",
  kind: "bot",
  name: "Renderizar",
  botId: "bot-b",
  instructions: "Corte os trechos.",
  outputs: [{ path: "clip1.mp4" }],
  parameters,
  ...overrides,
});

const manualStep = (overrides: Record<string, unknown> = {}) => ({
  id: "pedir-link",
  kind: "bot",
  name: "Pedir link",
  botId: "bot-a",
  instructions: "Peça o link do vídeo do dia.",
  mode: "manual",
  outputs: [{ path: "link.txt" }],
  ...overrides,
});

describe("the authoring contract", () => {
  it("accepts a step whose files carry an extension and a consumed .json with a shape", () => {
    const report = validateWorkflowAuthoring(definition([
      producer([{ path: "transcript.json", shape: { type: "object", required: ["segments"] } }, { path: "source.mp4" }]),
      { ...condition("transcript.json"), whenTrue: null },
    ]), "save", { compileShape: compileNothing });
    expect(report.errors).toEqual([]);
  });

  it("refuses a glob in an output, naming the exact-name rule", () => {
    const report = validateWorkflowAuthoring(definition([
      producer([{ path: "clip1_*_9x16.mp4" }]),
      { id: "fim", kind: "bot", name: "Fim", botId: "bot-a", instructions: "Done.", outputs: [{ path: "ok.txt" }] },
    ]), "save");
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]!.message).toContain("*");
    expect(report.errors[0]!.path).toBe("steps.0.outputs.0.path");
  });

  it("refuses an output without an extension", () => {
    const report = validateWorkflowAuthoring(definition([
      { id: "pedir-link", kind: "bot", name: "Pedir link", botId: "bot-a", instructions: "Grave o link.", outputs: [{ path: "link" }] },
    ]), "save");
    expect(report.errors.map((issue) => issue.message).join(" ")).toContain("needs a file extension");
  });

  it("requires a shape on the .json a condition reads, and refuses a condition on a .txt", () => {
    const report = validateWorkflowAuthoring(definition([
      producer([{ path: "transcript.json" }, { path: "notas.txt" }]),
      condition("transcript.json"),
      { ...condition("notas.txt"), id: "outro", name: "Outro" },
    ]), "save", { compileShape: compileNothing });
    expect(report.errors.map((issue) => issue.message).join(" ")).toContain("needs a shape");
    expect(report.errors.map((issue) => issue.message).join(" ")).toContain("can only read a .json output");
  });

  it("refuses a shape that does not compile, and one larger than the cap", () => {
    const broken = validateWorkflowAuthoring(definition([
      producer([{ path: "transcript.json", shape: { type: "object" } }]),
      condition("transcript.json"),
    ]), "preview", { compileShape: () => { throw new Error("bad keyword"); } });
    expect(broken.errors[0]!.message).toContain("does not compile");

    const huge = validateWorkflowAuthoring(definition([
      producer([{ path: "transcript.json", shape: { type: "object", description: "x".repeat(WORKFLOW_SHAPE_MAX_BYTES) } }]),
      { id: "fim", kind: "bot", name: "Fim", botId: "bot-a", instructions: "Done.", outputs: [{ path: "ok.txt" }] },
    ]), "save");
    expect(huge.errors.map((issue) => issue.message).join(" ")).toContain("larger than");
  });

  it("refuses a condition that reads an output the source does not declare", () => {
    const def = definition([
      producer([{ path: "transcript.json", shape: { type: "object" } }]),
      condition("transcript.json"),
    ]);
    const target = def.steps[1];
    if (target?.kind !== "condition") throw new Error("not a condition");
    target.from.output = "resumo.json";
    const report = validateWorkflowAuthoring(def, "save");
    expect(report.errors.map((issue) => issue.message).join(" ")).toContain("does not declare the output");
  });

  it("refuses require and when, and only warns about result", () => {
    const legacy = definition([
      producer([{ path: "transcript.json", shape: { type: "object" } }], {
        require: { ok: true },
        when: [{ field: "ok", equals: true, next: "fim" }],
        result: "transcript.json",
      }),
      { id: "fim", kind: "bot", name: "Fim", botId: "bot-a", instructions: "Done.", outputs: [{ path: "ok.txt" }] },
    ]);
    const report = validateWorkflowAuthoring(legacy, "save");
    expect(report.errors).toHaveLength(2);
    expect(report.errors.map((issue) => issue.message).join(" ")).toContain("condition step");
    expect(report.warnings.map((issue) => issue.message).join(" ")).toContain("result no longer declares");
  });

  it("warns about an empty input list, a cited file that never arrived, and a parameter named like an output", () => {
    const report = validateWorkflowAuthoring(definition([
      producer([{ path: "transcript.json" }, { path: "source.mp4" }]),
      {
        id: "escolher",
        kind: "bot",
        name: "Escolher",
        botId: "bot-a",
        instructions: "Leia o transcript.json e o resumo.json e escreva output/trechos.json.",
        inputs: [],
        outputs: [{ path: "trechos.json" }],
        parameters: [{ name: "transcript", type: "string", required: true }],
      },
    ]), "preview");
    const text = report.warnings.map((issue) => issue.message).join(" ");
    expect(text).toContain("declares no inputs");
    expect(text).toContain("resumo.json");
    expect(text).not.toContain("the instructions mention \\\"transcript.json\\\"");
    expect(text).toContain("same name as the output");
  });

  it("warns when a script reads process.argv", () => {
    const report = validateWorkflowAuthoring(definition([
      producer([{ path: "transcript.json" }]),
    ]), "preview", { scripts: [{ name: "baixar.mjs", content: "const url = process.argv[2];" }] });
    expect(report.warnings.map((issue) => issue.message).join(" ")).toContain("process.argv");
  });

  it.each([
    ["Peça aprovação; se não houver resposta, siga com a sua escolha.", "se não houver resposta"],
    ["Peça aprovação e, se não responder em 10 minutos, siga.", "se não responder"],
    ["Peça aprovação e siga após 10 minutos.", "siga após"],
    ["Peça aprovação e continue mesmo sem resposta.", "continue mesmo sem"],
    ["Peça aprovação; após 10 minutos siga com o padrão.", "após 10 minutos siga"],
    ["Peça aprovação; após 10 minutos, siga com o padrão.", "após 10 minutos, siga"],
    ["Ask for approval; if no answer, continue with the default.", "if no answer"],
    ["Ask for approval and continue without an answer.", "continue without"],
    ["Ask for approval; after 10 minutes proceed with the default.", "after 10 minutes proceed"],
  ])("warns in preview about an approval fallback: %s", (instructions, snippet) => {
    const report = validateWorkflowAuthoring(definition([
      { id: "escolher", kind: "bot", name: "Escolher", botId: "bot-a", instructions, outputs: [{ path: "trechos.txt" }] },
    ]), "preview");
    expect(report.errors).toEqual([]);
    const warning = report.warnings.find((issue) => issue.message.includes("no fallback"));
    expect(warning?.path).toBe("steps.0.instructions");
    expect(warning?.message).toContain(JSON.stringify(snippet));
  });

  it("does not call a normal approval instruction a fallback, and never raises it at save", () => {
    const instructions = "Abra um cartão de pedido com os três trechos e aguarde a resposta.";
    const preview = validateWorkflowAuthoring(definition([
      { id: "escolher", kind: "bot", name: "Escolher", botId: "bot-a", instructions, outputs: [{ path: "trechos.txt" }] },
    ]), "preview");
    expect(preview.warnings.some((issue) => issue.message.includes("no fallback"))).toBe(false);
    const save = validateWorkflowAuthoring(definition([
      { id: "escolher", kind: "bot", name: "Escolher", botId: "bot-a", instructions: "Peça aprovação; se não houver resposta, siga.", outputs: [{ path: "trechos.txt" }] },
    ]), "save");
    expect(save.warnings.some((issue) => issue.message.includes("no fallback"))).toBe(false);
  });

  it("checks the declared modules only in preflight, with a message that says to install them", () => {
    const def = definition([producer([{ path: "transcript.json" }], { modules: ["yt-dlp", "gpu"] })]);
    expect(validateWorkflowAuthoring(def, "save").errors).toEqual([]);
    const report = validateWorkflowAuthoring(def, "preflight", { missingModules: (modules) => modules.filter((module) => module.name === "yt-dlp").map((module) => module.name) });
    expect(report.errors.map((issue) => issue.message).join(" ")).toContain("install it before running");
    expect(report.errors.map((issue) => issue.message).join(" ")).toContain("yt-dlp");
  });

  it("warns when a package is written as a binary that PATH does not have", () => {
    const def = definition([producer([{ path: "transcript.json" }], { modules: ["faster-whisper", "yt-dlp"] })]);
    const report = validateWorkflowAuthoring(def, "save", { binOnPath: (name) => name === "yt-dlp" });
    const warnings = report.warnings.map((issue) => issue.message).join(" ");
    expect(warnings).toContain('"faster-whisper"');
    expect(warnings).toContain('"runtime": "python"');
    expect(warnings).not.toContain('"yt-dlp"');
    expect(validateWorkflowAuthoring(def, "save", { binOnPath: () => true }).warnings).toEqual([]);
  });

  it("accepts a parameter that reads a scalar and a list of scalars from a shaped output", () => {
    const report = validateWorkflowAuthoring(definition([
      producer([{ path: "trechos.json", shape: trechos }]),
      consumer([
        { name: "total", type: "integer", from: { step: "baixar", output: "trechos.json", field: "total" } },
        { name: "clips", type: "string", list: true, from: { step: "baixar", output: "trechos.json", field: "clips" } },
      ]),
    ]), "save", { compileShape: compileNothing });
    expect(report.errors).toEqual([]);
  });

  it("refuses a parameter type that contradicts the source shape", () => {
    const report = validateWorkflowAuthoring(definition([
      producer([{ path: "trechos.json", shape: trechos }]),
      consumer([{ name: "total", type: "string", from: { step: "baixar", output: "trechos.json", field: "total" } }]),
    ]), "save");
    expect(report.errors.map((issue) => issue.message).join(" ")).toContain("declares integer, not string");
  });

  it("refuses a parameter field the shape does not declare", () => {
    const report = validateWorkflowAuthoring(definition([
      producer([{ path: "trechos.json", shape: trechos }]),
      consumer([{ name: "total", type: "integer", from: { step: "baixar", output: "trechos.json", field: "resumo.total" } }]),
    ]), "save");
    expect(report.errors.map((issue) => issue.message).join(" ")).toContain("does not declare the field");
  });

  it("refuses a parameter origin on an output without a shape", () => {
    const report = validateWorkflowAuthoring(definition([
      producer([{ path: "trechos.json" }]),
      consumer([{ name: "total", type: "integer", from: { step: "baixar", output: "trechos.json", field: "total" } }]),
    ]), "save");
    expect(report.errors.map((issue) => issue.message).join(" ")).toContain("needs a shape");
  });

  it("refuses the same value arriving as a document and as a parameter", () => {
    const report = validateWorkflowAuthoring(definition([
      producer([{ path: "trechos.json", shape: trechos }]),
      consumer([{ name: "total", type: "integer", from: { step: "baixar", output: "trechos.json", field: "total" } }], {
        inputs: [{ as: "trechos.json", from: { step: "baixar", output: "trechos.json" } }],
      }),
    ]), "save");
    expect(report.errors.map((issue) => issue.message).join(" ")).toContain("already arrives through inputs");
  });

  it("refuses an origin that reads a glob", () => {
    const report = validateWorkflowAuthoring(definition([
      producer([{ path: "trechos.json", shape: trechos }, { path: "trechos_*.json", shape: trechos }]),
      consumer([{ name: "total", type: "integer", from: { step: "baixar", output: "trechos_*.json", field: "total" } }]),
    ]), "save");
    expect(report.errors.map((issue) => issue.message).join(" ")).toContain("a parameter reads an exact output name");
  });

  it("refuses a manual bot step that collects nothing, in every mode, naming the step", () => {
    for (const mode of ["preview", "save", "preflight"] as const) {
      const report = validateWorkflowAuthoring(definition([manualStep()]), mode);
      expect(report.errors).toHaveLength(1);
      expect(report.errors[0]!.path).toBe("steps.0.mode");
      expect(report.errors[0]!.message).toContain(JSON.stringify("Pedir link"));
      expect(report.errors[0]!.message).toContain('collectedBy "pedir-link"');
    }
  });

  it("accepts a manual bot step that declares the parameter it collects", () => {
    const report = validateWorkflowAuthoring(definition([
      manualStep({ parameters: [{ name: "link", type: "string", collectedBy: "pedir-link" }] }),
    ]), "save");
    expect(report.errors).toEqual([]);
  });

  it("applies the same rule to a manual script step", () => {
    const report = validateWorkflowAuthoring(definition([{
      id: "coletar", kind: "script", name: "Coletar", run: "coletar.mjs", mode: "manual", outputs: [{ path: "dados.json" }],
    }]), "save");
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]!.path).toBe("steps.0.mode");
    expect(report.errors[0]!.message).toContain(JSON.stringify("Coletar"));
  });

  it("refuses a manual step inside a Do While that collects nothing", () => {
    const report = validateWorkflowAuthoring(definition([{
      id: "laco",
      kind: "loop",
      name: "Repetir",
      body: [manualStep({ outputs: [{ path: "result.json", shape: { type: "object" } }] })],
      from: { step: "pedir-link", output: "result.json" },
      conditions: [{ field: "ok", op: "exists" }],
      maxIterations: 2,
      outputs: [{ path: "result.json", shape: { type: "object" } }],
    }]), "save");
    expect(report.errors.map((issue) => issue.path)).toContain("steps.0.body.0.mode");
  });

  it("still loads a definition whose manual step collects nothing, refusing only at save", () => {
    const legacy = definition([manualStep()]);
    const step = legacy.steps[0]!;
    expect(step.kind === "bot" && step.mode).toBe("manual");
    expect(validateWorkflowAuthoring(legacy, "save").errors.map((issue) => issue.path)).toEqual(["steps.0.mode"]);
  });

  it("accepts an automatic step that collects nothing", () => {
    expect(validateWorkflowAuthoring(definition([manualStep({ mode: "auto" })]), "save").errors).toEqual([]);
  });
});
