import { describe, expect, it } from "vitest";

import { workflowDefinitionSchema } from "../../shared/workflow";
import { inputRefusal, parameterValues, startParameters, stepCollectedParameters } from "./workflow-inputs";

const definition = workflowDefinitionSchema.parse({
  id: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
  version: 3,
  name: "Cortes",
  department: "Marketing",
  createdAt: 1,
  updatedAt: 1,
  steps: [
    {
      id: "pedir-link", kind: "bot", name: "Pedir o link", botId: "bot-a", mode: "manual",
      instructions: "Pergunte o link.", outputs: [{ path: "link.txt" }],
      parameters: [
        { name: "link", type: "string", collectedBy: "pedir-link" },
        { name: "canal", type: "enum", values: ["a", "b"] },
      ],
    },
    {
      id: "escolher", kind: "script", name: "Escolher", run: "escolher.mjs",
      outputs: [{
        path: "trechos.json",
        shape: { type: "object", properties: { total: { type: "integer" }, clips: { type: "array", items: { type: "string" } } } },
      }],
    },
    {
      id: "renderizar", kind: "bot", name: "Renderizar", botId: "bot-a",
      instructions: "Corte.", outputs: [{ path: "clip1.mp4" }],
      parameters: [
        { name: "total", type: "integer", from: { step: "escolher", output: "trechos.json", field: "total" } },
        { name: "clips", type: "string", list: true, from: { step: "escolher", output: "trechos.json", field: "clips" } },
        { name: "link", type: "string", collectedBy: "pedir-link" },
      ],
    },
  ],
});

describe("the Run screen's inputs", () => {
  it("asks only the values the start supplies, deduplicated across steps", () => {
    expect(startParameters(definition).map((parameter) => parameter.name)).toEqual(["canal"]);
  });

  it("asks the fields one manual step collects", () => {
    expect(stepCollectedParameters(definition, "pedir-link").map((parameter) => parameter.name)).toEqual(["link"]);
  });

  it("turns typed fields into the flat map, leaving blanks out and splitting lists", () => {
    const parameters = [
      ...startParameters(definition),
      { name: "total", type: "integer" as const, required: true, list: false },
      { name: "clips", type: "string" as const, required: true, list: true },
      { name: "quando", type: "date" as const, required: true, list: false },
      { name: "ativo", type: "boolean" as const, required: true, list: false },
    ];
    expect(parameterValues(parameters, { canal: "a", total: "3", clips: "um, dois", quando: "2026-11-15", ativo: "true", extra: "" }))
      .toEqual({ canal: "a", total: 3, clips: ["um", "dois"], quando: "2026-11-15", ativo: true });
    expect(parameterValues(parameters, {})).toEqual({});
  });

  it("reads a refusal from the API body, with the names that are missing, invalid and allowed", () => {
    expect(inputRefusal({
      missing: [{ step: "Pedir o link", name: "link" }],
      invalid: [{ step: "Cortes", name: "inicio", reason: "must be a date as YYYY-MM-DD" }],
      unknown: ["clips"],
      allowed: ["link", "inicio"],
    })).toEqual([
      "missing: link",
      "invalid: inicio (must be a date as YYYY-MM-DD)",
      "unknown: clips",
      "allowed: link, inicio",
    ]);
    expect(inputRefusal(undefined)).toEqual([]);
  });
});
