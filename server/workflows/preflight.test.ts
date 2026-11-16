import { describe, expect, it } from "vitest";

import { workflowDefinitionSchema } from "../../shared/workflow.ts";
import { missingWorkflowModules, moduleIssue } from "./preflight.ts";

const PATH = { PATH: "/usr/bin:/bin", PATHEXT: ".EXE" };

const definition = (modules: string[]) => workflowDefinitionSchema.parse({
  id: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
  version: 1,
  name: "Cortes do dia",
  department: "Marketing",
  steps: [{
    id: "baixar",
    kind: "script",
    name: "Baixar",
    run: "baixar.mjs",
    modules,
    outputs: [{ path: "transcript.json" }],
  }],
  createdAt: 1,
  updatedAt: 1,
});

describe("workflow module preflight", () => {
  it("finds a binary that is on PATH and reports the one that is not", () => {
    expect(moduleIssue(process.execPath.split("/").pop() ?? "node", PATH)).toBeUndefined();
    expect(moduleIssue("omb-missing-binary", PATH)).toBe("omb-missing-binary");
  });

  it("names every declared module this machine does not have", () => {
    expect(missingWorkflowModules(definition(["omb-missing-binary"]), PATH)).toEqual(["omb-missing-binary"]);
    expect(missingWorkflowModules(definition([]), PATH)).toEqual([]);
  });
});
