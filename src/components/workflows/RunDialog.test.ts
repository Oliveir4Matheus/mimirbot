import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { workflowDefinitionSchema } from "../../../shared/workflow";
import { RunDialog } from "./RunDialog";

const workflow = workflowDefinitionSchema.parse({
  id: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
  version: 2,
  name: "Cortes",
  department: "Marketing",
  createdAt: 1,
  updatedAt: 1,
  steps: [
    {
      id: "pedir-link", kind: "bot", name: "Pedir o link", botId: "bot-a", mode: "manual",
      instructions: "Pergunte o link.", outputs: [{ path: "link.txt" }],
      parameters: [{ name: "link", type: "string", collectedBy: "pedir-link" }],
    },
    {
      id: "escolher", kind: "script", name: "Escolher", run: "escolher.mjs",
      outputs: [{ path: "trechos.json", shape: { type: "object", properties: { total: { type: "integer" } } } }],
    },
    {
      id: "renderizar", kind: "bot", name: "Renderizar", botId: "bot-a",
      instructions: "Corte.", outputs: [{ path: "clip1.mp4" }],
      parameters: [
        { name: "total", type: "integer", from: { step: "escolher", output: "trechos.json", field: "total" } },
        { name: "canal", type: "enum", values: ["a", "b"] },
      ],
    },
  ],
});

describe("the Execute dialog", () => {
  const markup = renderToStaticMarkup(createElement(RunDialog, {
    workflow,
    versions: [workflow],
    busy: false,
    onClose: () => {},
    onConfirm: () => {},
  }));

  it("asks for the values the start supplies, by type", () => {
    expect(markup).toContain("run-input-canal");
    expect(markup).toContain("canal · enum");
    expect(markup).toContain("<select");
  });

  it("never asks for a value with an origin", () => {
    expect(markup).not.toContain("run-input-link");
    expect(markup).not.toContain("run-input-total");
  });

  it("shows the refusal when the server names what is missing", () => {
    const refused = renderToStaticMarkup(createElement(RunDialog, {
      workflow,
      versions: [workflow],
      busy: false,
      error: "missing: canal",
      onClose: () => {},
      onConfirm: () => {},
    }));
    expect(refused).toContain("missing: canal");
  });
});
