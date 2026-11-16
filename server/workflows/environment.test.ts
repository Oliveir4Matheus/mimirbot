import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { workflowDefinitionSchema, type WorkflowDefinition } from "../../shared/workflow.ts";
import {
  declaredWorkflowModules,
  environmentPreflightIssue,
  prepareWorkflowEnvironment,
  readWorkflowEnvironmentState,
  workflowEnvironmentHash,
  workflowEnvironmentPaths,
  workflowEnvironmentStatus,
  type EnvironmentCommand,
  type EnvironmentCommandOptions,
  type EnvironmentCommandResult,
} from "./environment.ts";
import { WORKFLOWS_ROOT_ENV } from "./paths.ts";

const NOW = 1_794_800_000_000;

let root: string;
let location: { env: NodeJS.ProcessEnv; platform: NodeJS.Platform };

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "omb-workflow-environment-"));
  location = { env: { [WORKFLOWS_ROOT_ENV]: root }, platform: "linux" };
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const script = (modules: unknown[]): WorkflowDefinition => workflowDefinitionSchema.parse({
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

function result(ok: boolean, stdout = ""): EnvironmentCommandResult {
  return { ok, stdout, stderr: ok ? "" : stdout, tail: stdout };
}

/** pip, npm and the venv are replaced; the fake records every argument and creates the files a real install would. */
function fakeCommands(options: { node?: string[]; pip?: EnvironmentCommandResult; importFails?: string[] } = {}) {
  const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
  const command: EnvironmentCommand = async (name, args, run: EnvironmentCommandOptions) => {
    calls.push({ command: name, args: [...args], cwd: run.cwd });
    const paths = workflowEnvironmentPaths(location);
    if (args[0] === "-m" && args[1] === "venv") {
      mkdirSync(dirname(paths.python), { recursive: true });
      writeFileSync(paths.python, "");
      return result(true);
    }
    if (args[0] === "-m" && args[1] === "pip") return options.pip ?? result(true, "Successfully installed\n");
    if (args[0] === "-c") {
      const code = String(args[1]);
      if (code.startsWith("import sys")) return result(true, "3.12.4\n");
      if (code.startsWith("import importlib.metadata")) return result(true, "1.2.1\n");
      const imported = /^import ([\w.]+)/.exec(code)?.[1] ?? "";
      if (options.importFails?.includes(imported)) return result(false, `ModuleNotFoundError: No module named '${imported}'`);
      return result(true);
    }
    if (args.includes("install")) {
      for (const module of options.node ?? []) {
        const folder = join(paths.nodeModules, ...module.split("/"));
        mkdirSync(folder, { recursive: true });
        writeFileSync(join(folder, "package.json"), JSON.stringify({ name: module, version: "0.33.5" }));
      }
      return result(true, "added 1 package\n");
    }
    return result(true);
  };
  return { command, calls };
}

describe("preparing the workflow environment", () => {
  it("unions the declared modules into one venv and one node_modules", async () => {
    const paths = workflowEnvironmentPaths(location);
    const python = script([{ name: "faster-whisper", runtime: "python", version: "1.2.1" }]);
    const node = script([{ name: "sharp", runtime: "node", version: "0.33.5" }]);
    const fake = fakeCommands({ node: ["sharp"] });
    const prepared = await prepareWorkflowEnvironment({ definitions: [python, node], ...location, command: fake.command, now: () => NOW });

    expect(prepared.ok).toBe(true);
    expect(prepared.preparedAt).toBe(NOW);
    expect(prepared.hash).toBe(workflowEnvironmentHash(declaredWorkflowModules([python, node]).modules));
    expect(prepared.installed).toEqual([
      { name: "faster-whisper", runtime: "python", version: "1.2.1" },
      { name: "sharp", runtime: "node", version: "0.33.5" },
    ]);
    expect(prepared.missing).toEqual([]);
    expect(readFileSync(paths.requirements, "utf8")).toBe("faster-whisper==1.2.1\n");
    expect(JSON.parse(readFileSync(paths.packageJson, "utf8"))).toMatchObject({ dependencies: { sharp: "0.33.5" } });
    expect(fake.calls.some((call) => call.command === "python3" && call.args.includes("venv"))).toBe(true);
    expect(fake.calls.some((call) => call.command === paths.python && call.args.includes("pip"))).toBe(true);
    expect(fake.calls.some((call) => call.command === "npm" && call.args.includes("install"))).toBe(true);
    for (const call of fake.calls) expect(call.cwd).toBe(paths.root);

    const state = readWorkflowEnvironmentState(paths);
    expect(state).toBeDefined();
    expect(state!.preparedAt).toBe(NOW);
    expect(state!.python).toBe("3.12.4");
    expect(state!.pythonBin).toBe(paths.python);
    expect(state!.node).toBe(process.versions.node);
    expect(state!.modules.map((module) => module.name)).toEqual(["sharp", "faster-whisper"]);
  });

  it("writes requirements.txt without a version and records the version the install resolved", async () => {
    const paths = workflowEnvironmentPaths(location);
    const definition = script([{ name: "faster-whisper", runtime: "python" }]);
    const prepared = await prepareWorkflowEnvironment({
      definitions: [definition],
      ...location,
      command: fakeCommands().command,
      now: () => NOW,
    });
    expect(prepared.ok).toBe(true);
    expect(readFileSync(paths.requirements, "utf8")).toBe("faster-whisper\n");
    expect(readWorkflowEnvironmentState(paths)!.modules).toEqual([{ name: "faster-whisper", runtime: "python", version: "1.2.1" }]);
    expect(environmentPreflightIssue(definition, location)).toBeUndefined();
    expect(workflowEnvironmentStatus([definition], location)).toMatchObject({ stale: false, changed: 0 });
  });

  it("changes the hash when a Workflow changes a module", async () => {
    const first = script([{ name: "faster-whisper", runtime: "python", version: "1.2.1" }]);
    await prepareWorkflowEnvironment({ definitions: [first], ...location, command: fakeCommands().command, now: () => NOW });
    expect(workflowEnvironmentStatus([first], location)).toMatchObject({ prepared: true, stale: false, changed: 0, declared: 1, preparedAt: NOW });

    const second = script([
      { name: "faster-whisper", runtime: "python", version: "1.2.1" },
      { name: "sharp", runtime: "node", version: "0.33.5" },
    ]);
    expect(workflowEnvironmentStatus([second], location)).toMatchObject({ prepared: true, stale: true, changed: 1, declared: 2 });
  });

  it("accepts an unpinned declaration that the install already satisfies", async () => {
    const pinned = script([{ name: "faster-whisper", runtime: "python", version: "1.2.1" }]);
    const unpinned = script([{ name: "faster-whisper", runtime: "python" }]);
    await prepareWorkflowEnvironment({ definitions: [pinned], ...location, command: fakeCommands().command, now: () => NOW });
    expect(workflowEnvironmentStatus([unpinned], location)).toMatchObject({ stale: false, changed: 0 });
    expect(environmentPreflightIssue(unpinned, location)).toBeUndefined();
  });

  it("returns the tail of a pip failure and deletes nothing", async () => {
    const paths = workflowEnvironmentPaths(location);
    const base = script([{ name: "faster-whisper", runtime: "python", version: "1.2.1" }]);
    await prepareWorkflowEnvironment({ definitions: [base], ...location, command: fakeCommands().command, now: () => NOW });
    const stateBefore = readFileSync(paths.state, "utf8");
    expect(existsSync(paths.python)).toBe(true);

    const failing = fakeCommands({ pip: result(false, "ERROR: Could not find a version that satisfies the requirement faster-whisper==9\nERROR: No matching distribution found") });
    const prepared = await prepareWorkflowEnvironment({
      definitions: [script([{ name: "faster-whisper", runtime: "python", version: "9" }])],
      ...location,
      command: failing.command,
      now: () => NOW + 1,
    });

    expect(prepared.ok).toBe(false);
    expect(prepared.tail).toContain("Could not find a version");
    expect(readFileSync(paths.state, "utf8")).toBe(stateBefore);
    expect(readFileSync(paths.requirements, "utf8")).toBe("faster-whisper==1.2.1\n");
    expect(existsSync(paths.python)).toBe(true);
  });

  it("records a package the interpreter cannot import as missing", async () => {
    const prepared = await prepareWorkflowEnvironment({
      definitions: [script([{ name: "faster-whisper", runtime: "python", version: "1.2.1" }])],
      ...location,
      command: fakeCommands({ importFails: ["faster_whisper"] }).command,
      now: () => NOW,
    });
    expect(prepared.ok).toBe(true);
    expect(prepared.missing).toEqual(["faster-whisper"]);
    expect(prepared.tail).toContain("ModuleNotFoundError");
  });

  it("refuses two Workflows that pin the same package to different versions", async () => {
    const prepared = await prepareWorkflowEnvironment({
      definitions: [
        script([{ name: "faster-whisper", runtime: "python", version: "1.2.1" }]),
        script([{ name: "faster-whisper", runtime: "python", version: "1.2.2" }]),
      ],
      ...location,
      command: fakeCommands().command,
      now: () => NOW,
    });
    expect(prepared.ok).toBe(false);
    expect(prepared.tail).toContain("no single environment satisfies both declarations");
    expect(existsSync(workflowEnvironmentPaths(location).state)).toBe(false);
  });
});

describe("the run preflight", () => {
  it("asks nothing of the environment when the Workflow declares no python or node module", () => {
    const paths = workflowEnvironmentPaths(location);
    expect(existsSync(paths.state)).toBe(false);
    expect(environmentPreflightIssue(script(["yt-dlp", "ffmpeg"]), location)).toBeUndefined();
  });

  it("passes once the prepared hash matches", async () => {
    const definition = script([{ name: "faster-whisper", runtime: "python", version: "1.2.1" }]);
    await prepareWorkflowEnvironment({ definitions: [definition], ...location, command: fakeCommands().command, now: () => NOW });
    expect(environmentPreflightIssue(definition, location)).toBeUndefined();
  });

  it("refuses with how many modules changed", async () => {
    await prepareWorkflowEnvironment({
      definitions: [script([{ name: "faster-whisper", runtime: "python", version: "1.2.1" }])],
      ...location,
      command: fakeCommands().command,
      now: () => NOW,
    });
    const issue = environmentPreflightIssue(script([{ name: "faster-whisper", runtime: "python", version: "1.2.2" }]), location);
    expect(issue).toBe('the environment is not prepared for this Workflow: run "Prepare environment" (1 module changed)');
  });

  it("passes for one Workflow when the prepared union also holds another Workflow's modules", async () => {
    const python = script([{ name: "faster-whisper", runtime: "python", version: "1.2.1" }]);
    const node = script([{ name: "sharp", runtime: "node", version: "0.33.5" }]);
    await prepareWorkflowEnvironment({ definitions: [python, node], ...location, command: fakeCommands({ node: ["sharp"] }).command, now: () => NOW });
    expect(environmentPreflightIssue(python, location)).toBeUndefined();
    expect(environmentPreflightIssue(node, location)).toBeUndefined();
  });

  it("refuses when nothing was ever prepared", () => {
    expect(environmentPreflightIssue(script([{ name: "sharp", runtime: "node" }]), location))
      .toBe('the environment is not prepared for this Workflow: run "Prepare environment"');
  });

  it("refuses when the prepared interpreter is gone", async () => {
    const definition = script([{ name: "faster-whisper", runtime: "python", version: "1.2.1" }]);
    await prepareWorkflowEnvironment({ definitions: [definition], ...location, command: fakeCommands().command, now: () => NOW });
    rmSync(workflowEnvironmentPaths(location).python);
    expect(environmentPreflightIssue(definition, location)).toContain("Python interpreter is missing");
  });
});
