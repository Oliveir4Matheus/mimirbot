import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { workflowDefinitionSchema } from "../../shared/workflow.ts";
import { stepParameterValues, validateWorkflowInputs, workflowParameterNames } from "./parameters.ts";
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
