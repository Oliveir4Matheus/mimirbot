import { describe, expect, it } from "vitest";

import { workflowDefinitionSchema, workflowUnknownFields } from "./workflow.ts";

const definition = (modules: unknown) => ({
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

const modulesOf = (modules: unknown) => {
  const parsed = workflowDefinitionSchema.parse(definition(modules));
  const step = parsed.steps[0]!;
  if (step.kind !== "script") throw new Error("expected a script step");
  return step.modules;
};

const issues = (modules: unknown) => {
  const parsed = workflowDefinitionSchema.safeParse(definition(modules));
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join("."));
};

describe("workflow modules", () => {
  it("reads a bare string as a binary, as every older Workflow declared it", () => {
    expect(modulesOf(["yt-dlp"])).toEqual([{ name: "yt-dlp", runtime: "bin" }]);
  });

  it("reads an object without runtime as a binary", () => {
    expect(modulesOf([{ name: "ffmpeg" }])).toEqual([{ name: "ffmpeg", runtime: "bin" }]);
  });

  it("keeps a python package and its exact version", () => {
    expect(modulesOf([{ name: "faster-whisper", runtime: "python", version: "1.2.1" }]))
      .toEqual([{ name: "faster-whisper", runtime: "python", version: "1.2.1" }]);
  });

  it("accepts a scoped node package", () => {
    expect(modulesOf([{ name: "@ffmpeg/ffmpeg", runtime: "node", version: "0.12.10" }]))
      .toEqual([{ name: "@ffmpeg/ffmpeg", runtime: "node", version: "0.12.10" }]);
  });

  it("keeps gpu as a binary entry", () => {
    expect(modulesOf(["gpu"])).toEqual([{ name: "gpu", runtime: "bin" }]);
  });

  it("refuses a name that is a path, a flag, uppercase or a space", () => {
    expect(issues(["../escape"])).toEqual(["steps.0.modules.0.name"]);
    expect(issues(["--upgrade"])).toEqual(["steps.0.modules.0.name"]);
    expect(issues(["Faster-Whisper"])).toEqual(["steps.0.modules.0.name"]);
    expect(issues(["faster whisper"])).toEqual(["steps.0.modules.0.name"]);
    expect(issues([{ name: "faster-whisper", runtime: "node" }])).toEqual([]);
    expect(issues([{ name: "faster_whisper", runtime: "python" }])).toEqual([]);
  });

  it("refuses a version that is a URL, a path, a flag or a range", () => {
    const at = (version: string) => issues([{ name: "faster-whisper", runtime: "python", version }]);
    expect(at("1.2.1")).toEqual([]);
    expect(at("1.2.1-beta.1")).toEqual([]);
    expect(at("https://example.com/pkg.whl")).toEqual(["steps.0.modules.0.version"]);
    expect(at("./local/pkg")).toEqual(["steps.0.modules.0.version"]);
    expect(at("--index-url")).toEqual(["steps.0.modules.0.version"]);
    expect(at("1.2 1.3")).toEqual(["steps.0.modules.0.version"]);
    expect(at("^1.2.1")).toEqual(["steps.0.modules.0.version"]);
  });

  it("refuses a version pinned to a binary, which has none to compare", () => {
    expect(issues([{ name: "ffmpeg", runtime: "bin", version: "6.1" }])).toEqual(["steps.0.modules.0.version"]);
  });

  it("refuses gpu as a package", () => {
    expect(issues([{ name: "gpu", runtime: "python" }])).toEqual(["steps.0.modules.0.name"]);
  });

  it("refuses an unknown field of a module object on save", () => {
    expect(workflowUnknownFields(definition([{ name: "sharp", runtime: "node", url: "https://example.com" }])))
      .toEqual([{ path: "steps.0.modules.0.url", message: 'module 1 of step "Baixar": "url" is not a field of this contract' }]);
  });
});
