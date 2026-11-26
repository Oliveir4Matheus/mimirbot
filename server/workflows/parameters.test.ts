import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { workflowDefinitionSchema } from "../../shared/workflow.ts";
import { collectedParameters, resolveStepParameters, stepParameterValues, validateCollectedInputs, validateWorkflowInputs, workflowParameterNames, workflowRequiredStartParameters } from "./parameters.ts";
import { writeStepParameters } from "./files.ts";

const definition = workflowDefinitionSchema.parse({
  id: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
  version: 1,
  name: "Relatório",
  department: "Financeiro",
  createdAt: 1,
  updatedAt: 1,
  steps: [{
    id: "periodo",
    kind: "script",
    name: "Período",
    run: "periodo.mjs",
    outputs: [{ path: "periodo.json" }],
    result: "periodo.json",
    parameters: [
      { name: "inicio", type: "date", required: true },
      { name: "fim", type: "date", required: false, whenAbsent: "rule:periodo_padrao" },
      { name: "regime", type: "enum", values: ["escala", "mesa", "todos"], required: true },
    ],
  }],
});

let root: string | undefined;
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

describe("workflow parameters", () => {
  it("lists the union and each step's subset", () => {
    expect(workflowParameterNames(definition)).toEqual(["inicio", "fim", "regime"]);
    expect(stepParameterValues(definition, "periodo", { inicio: "2026-11-01", regime: "escala" })).toEqual({ inicio: "2026-11-01", regime: "escala" });
  });

  it("lists the required start parameters a routine cannot supply", () => {
    expect(workflowRequiredStartParameters(definition).map((parameter) => parameter.name)).toEqual(["inicio", "regime"]);
  });

  it("reports missing, invalid and unknown names without creating a run", () => {
    const result = validateWorkflowInputs(definition, { inicio: "2026-13-01", regime: "mesa", tipo: "x" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toMatchObject({
      status: "needs_input",
      missing: [],
      invalid: [{ step: "Período", name: "inicio" }],
      unknown: ["tipo"],
      allowed: ["inicio", "fim", "regime"],
    });
  });

  it("accepts a valid optional field and leaves an absent one out", () => {
    const valid = validateWorkflowInputs(definition, { inicio: "2026-11-01", regime: "escala" });
    expect(valid).toEqual({ ok: true, values: { inicio: "2026-11-01", regime: "escala" } });
  });

  it("refuses conflicting declarations of the same name at save", () => {
    expect(() => workflowDefinitionSchema.parse({
      ...definition,
      steps: [
        { ...definition.steps[0] },
        {
          id: "consultar", kind: "script", name: "Consultar", run: "consultar.mjs", outputs: [{ path: "x.json" }],
          parameters: [{ name: "inicio", type: "string", required: true }],
        },
      ],
    })).toThrow(/different type/);
  });

  it("writes params.json with only the declared subset", () => {
    root = mkdtempSync(join(tmpdir(), "omb-params-"));
    const written = writeStepParameters(root, definition.steps[0]!, { inicio: "2026-11-01", regime: "escala", outro: 1 });
    expect(written.ok).toBe(true);
    expect(JSON.parse(readFileSync(join(root, "params.json"), "utf8"))).toEqual({ inicio: "2026-11-01", regime: "escala" });
  });

  it("writes no params.json for a step that declares none", () => {
    root = mkdtempSync(join(tmpdir(), "omb-params-"));
    const step = { ...definition.steps[0]!, parameters: [] };
    expect(writeStepParameters(root, step, { inicio: "2026-11-01" }).ok).toBe(true);
    expect(() => readFileSync(join(root!, "params.json"))).toThrow();
  });
});

const origins = workflowDefinitionSchema.parse({
  id: "9a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
  version: 1,
  name: "Cortes",
  department: "Marketing",
  createdAt: 1,
  updatedAt: 1,
  steps: [
    {
      id: "pedir", kind: "bot", name: "Pedir o link", botId: "bot-a", mode: "manual",
      instructions: "Pergunte o link.", outputs: [{ path: "link.txt" }],
      parameters: [{ name: "link", type: "string", collectedBy: "pedir" }],
    },
    {
      id: "escolher", kind: "script", name: "Escolher", run: "escolher.mjs",
      outputs: [{
        path: "trechos.json",
        shape: {
          type: "object", required: ["clips", "total"],
          properties: { total: { type: "integer" }, clips: { type: "array", items: { type: "string" } } },
        },
      }],
    },
    {
      id: "renderizar", kind: "bot", name: "Renderizar", botId: "bot-b",
      instructions: "Corte os trechos.", outputs: [{ path: "clip1.mp4" }],
      parameters: [
        { name: "total", type: "integer", from: { step: "escolher", output: "trechos.json", field: "total" } },
        { name: "clips", type: "string", list: true, from: { step: "escolher", output: "trechos.json", field: "clips" } },
      ],
    },
  ],
});

describe("parameter origins", () => {
  it("never asks at the start for a value that has an origin", () => {
    expect(workflowParameterNames(origins)).toEqual([]);
    expect(validateWorkflowInputs(origins, {})).toEqual({ ok: true, values: {} });
    const refused = validateWorkflowInputs(origins, { total: 3 });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.failure).toMatchObject({ missing: [], invalid: [], unknown: ["total"], allowed: [] });
    expect(collectedParameters(origins, "pedir").map((parameter) => parameter.name)).toEqual(["link"]);
  });

  it("checks what a manual step collects when the person continues it", () => {
    const missing = validateCollectedInputs(origins, "pedir", {});
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.failure).toMatchObject({ missing: [{ step: "Pedir o link", name: "link" }], allowed: ["link"] });

    const invalid = validateCollectedInputs(origins, "pedir", { link: 7 });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.failure.invalid[0]).toMatchObject({ name: "link", reason: "must be text" });

    const unknown = validateCollectedInputs(origins, "pedir", { link: "https://x", outro: 1 });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.failure.unknown).toEqual(["outro"]);

    expect(validateCollectedInputs(origins, "pedir", { link: "https://x" })).toEqual({ ok: true, values: { link: "https://x" } });
  });

  it("extracts a scalar and a list of scalars from the source output", () => {
    const step = origins.steps[2]!;
    const resolved = resolveStepParameters(step, {}, (stepId, output) =>
      stepId === "escolher" && output === "trechos.json"
        ? { ok: true, value: { total: 3, clips: ["a", "b"] } }
        : { ok: false, error: "missing output" });
    expect(resolved).toEqual({ ok: true, values: { total: 3, clips: ["a", "b"] } });
  });

  it("fails the consuming step when the field has the wrong type, naming step, output and field", () => {
    const step = origins.steps[2]!;
    const resolved = resolveStepParameters(step, {}, () => ({ ok: true, value: { total: "3", clips: ["a"] } }));
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.error).toContain('parameter "total"');
    expect(resolved.error).toContain('step "escolher"');
    expect(resolved.error).toContain('"trechos.json"');
    expect(resolved.error).toContain('field "total"');
    expect(resolved.error).toContain("must be an integer");
  });

  it("fails when the field is not in the source output", () => {
    const step = origins.steps[2]!;
    const resolved = resolveStepParameters(step, {}, () => ({ ok: true, value: { total: 3 } }));
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) expect(resolved.error).toContain('field "clips" is missing');
  });

  it("writes params.json with the extracted subset only", () => {
    root = mkdtempSync(join(tmpdir(), "omb-params-"));
    const step = origins.steps[2]!;
    const written = writeStepParameters(root, step, { total: 3, clips: ["a"], outro: "x" });
    expect(written.ok).toBe(true);
    expect(JSON.parse(readFileSync(join(root, "params.json"), "utf8"))).toEqual({ total: 3, clips: ["a"] });
  });
});
