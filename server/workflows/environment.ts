// The installation's script environment: one python venv and one node_modules for
// every Workflow. Preparation is the only place that installs, it is a person's
// action, and the run only checks the hash preparation recorded. See
// docs/superpowers/specs/2026-11-16-workflow-environment.md.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";

import {
  workflowModuleSchema,
  workflowModules,
  type WorkflowDefinition,
  type WorkflowModule,
} from "../../shared/workflow.ts";
import { writeFileAtomic } from "../atomic.ts";
import { isCommandOnPath } from "./preflight.ts";
import { workflowsRoot } from "./paths.ts";

export const WORKFLOW_ENV_DIR = ".workflow-env";
const STATE_FILE = "state.json";
const REQUIREMENTS_FILE = "requirements.txt";
const PACKAGE_FILE = "package.json";
const PACKAGE_LOCK_FILE = "package-lock.json";
const INSTALL_TIMEOUT_MS = 15 * 60_000;
const PROBE_TIMEOUT_MS = 60_000;
const TAIL_KEEP = 4_000;
const PACKAGE_NAME = "mimirbot-workflow-environment";

export interface WorkflowEnvironmentPaths {
  /** `~/MimirBot`, where `node_modules` and `package.json` live so Node's resolver finds them. */
  root: string;
  envDir: string;
  venvDir: string;
  binDir: string;
  /** The venv interpreter: `bin/python` or `Scripts/python.exe`. */
  python: string;
  nodeModules: string;
  requirements: string;
  packageJson: string;
  packageLock: string;
  state: string;
}

export interface WorkflowEnvironmentLocation {
  home?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
}

export function workflowEnvironmentPaths(location: WorkflowEnvironmentLocation = {}): WorkflowEnvironmentPaths {
  const platform = location.platform ?? process.platform;
  const root = workflowsRoot({ home: location.home, env: location.env });
  const envDir = join(root, WORKFLOW_ENV_DIR);
  const venvDir = join(envDir, "python");
  const binDir = join(venvDir, platform === "win32" ? "Scripts" : "bin");
  return {
    root,
    envDir,
    venvDir,
    binDir,
    python: join(binDir, platform === "win32" ? "python.exe" : "python"),
    nodeModules: join(root, "node_modules"),
    requirements: join(envDir, REQUIREMENTS_FILE),
    packageJson: join(root, PACKAGE_FILE),
    packageLock: join(root, PACKAGE_LOCK_FILE),
    state: join(envDir, STATE_FILE),
  };
}

export interface WorkflowEnvironmentState {
  preparedAt: number;
  hash: string;
  /** The interpreter version, such as 3.12.4. */
  python?: string;
  pythonBin?: string;
  node?: string;
  modules: WorkflowModule[];
}

const environmentStateSchema = z.object({
  preparedAt: z.number().int().nonnegative(),
  hash: z.string(),
  python: z.string().optional(),
  pythonBin: z.string().optional(),
  node: z.string().optional(),
  modules: z.array(workflowModuleSchema),
});

function compareModules(left: WorkflowModule, right: WorkflowModule): number {
  return left.runtime.localeCompare(right.runtime)
    || left.name.localeCompare(right.name)
    || (left.version ?? "").localeCompare(right.version ?? "");
}

/** SHA-256 of the ordered (name, runtime, version) list. The same function runs at
 * preparation and at preflight, so a version already prepared is never installed again. */
export function workflowEnvironmentHash(modules: readonly WorkflowModule[]): string {
  const rows = [...modules].sort(compareModules).map((module) => [module.name, module.runtime, module.version ?? ""]);
  return `sha256:${createHash("sha256").update(JSON.stringify(rows)).digest("hex")}`;
}

/** The module key preflight compares: a package pinned to another version is a change. */
const moduleKey = (module: WorkflowModule): string => `${module.runtime}\u0000${module.name}\u0000${module.version ?? ""}`;

export interface DeclaredWorkflowModules {
  modules: WorkflowModule[];
  /** The same package pinned to different versions by two Workflows; no single environment satisfies both. */
  conflicts: string[];
}

/** The union of every Workflow's and every draft proposal's modules, each once. */
export function declaredWorkflowModules(
  definitions: ReadonlyArray<Pick<WorkflowDefinition, "steps">>,
): DeclaredWorkflowModules {
  const unique = new Map<string, WorkflowModule>();
  const versions = new Map<string, string>();
  const conflicts = new Set<string>();
  for (const definition of definitions) {
    for (const module of workflowModules(definition)) {
      unique.set(moduleKey(module), module);
      const name = `${module.runtime}\u0000${module.name}`;
      const seen = versions.get(name);
      const version = module.version ?? "";
      if (seen === undefined) versions.set(name, version);
      else if (seen !== version) {
        conflicts.add(`${module.name} (${module.runtime}) at ${seen || "any version"} and ${version || "any version"}`);
      }
    }
  }
  return { modules: [...unique.values()].sort(compareModules), conflicts: [...conflicts] };
}

export function readWorkflowEnvironmentState(paths: WorkflowEnvironmentPaths): WorkflowEnvironmentState | undefined {
  try {
    const parsed = environmentStateSchema.safeParse(JSON.parse(readFileSync(paths.state, "utf8")));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** Declared modules the prepared state does not cover. A declaration without a version
 * accepts whatever the install resolved; a pinned one must match it. */
export function missingDeclaredModules(prepared: readonly WorkflowModule[], declared: readonly WorkflowModule[]): number {
  const installed = new Map(prepared.map((module) => [`${module.runtime}\u0000${module.name}`, module.version ?? ""]));
  let missing = 0;
  for (const module of declared) {
    const version = installed.get(`${module.runtime}\u0000${module.name}`);
    if (version === undefined || (module.version !== undefined && version !== module.version)) missing += 1;
  }
  return missing;
}

/** How many declared modules changed against the prepared state, in either direction. */
export function changedWorkflowModules(prepared: readonly WorkflowModule[], declared: readonly WorkflowModule[]): number {
  const installed = new Map(prepared.map((module) => [`${module.runtime}\u0000${module.name}`, module.version ?? ""]));
  const wanted = new Set(declared.map((module) => `${module.runtime}\u0000${module.name}`));
  let changed = 0;
  for (const module of declared) {
    const version = installed.get(`${module.runtime}\u0000${module.name}`);
    if (version === undefined || (module.version !== undefined && version !== module.version)) changed += 1;
  }
  for (const key of installed.keys()) if (!wanted.has(key)) changed += 1;
  return changed;
}

export interface WorkflowEnvironmentStatus {
  prepared: boolean;
  stale: boolean;
  preparedAt?: number;
  hash?: string;
  /** Declared modules that are not in the prepared set, and prepared ones no longer declared. */
  changed: number;
  declared: number;
  python?: string;
  node?: string;
  modules: WorkflowModule[];
}

/** What the panel shows when it opens: never prepared, prepared on a date, or out of date. */
export function workflowEnvironmentStatus(
  definitions: readonly WorkflowDefinition[],
  location: WorkflowEnvironmentLocation = {},
): WorkflowEnvironmentStatus {
  const declared = declaredWorkflowModules(definitions).modules;
  const paths = workflowEnvironmentPaths(location);
  const state = readWorkflowEnvironmentState(paths);
  if (!state) return { prepared: false, stale: false, changed: declared.length, declared: declared.length, modules: declared };
  const changed = changedWorkflowModules(state.modules, declared);
  return {
    prepared: true,
    stale: changed > 0,
    preparedAt: state.preparedAt,
    hash: state.hash,
    changed,
    declared: declared.length,
    ...(state.python === undefined ? {} : { python: state.python }),
    ...(state.node === undefined ? {} : { node: state.node }),
    modules: declared,
  };
}

/** Why this Workflow cannot run here, or undefined. Never imports a module and never uses the network:
 * a package's presence is the hash preparation recorded, not a probe. */
export function environmentPreflightIssue(
  definition: Pick<WorkflowDefinition, "steps">,
  location: WorkflowEnvironmentLocation = {},
): string | undefined {
  const modules = workflowModules(definition);
  const packages = modules.filter((module) => module.runtime !== "bin");
  if (packages.length === 0) return undefined;
  const paths = workflowEnvironmentPaths(location);
  const state = readWorkflowEnvironmentState(paths);
  if (!state) return 'the environment is not prepared for this Workflow: run "Prepare environment"';
  const declared = declaredWorkflowModules([definition]);
  if (declared.conflicts.length > 0) {
    return `this Workflow declares ${declared.conflicts.join("; ")}; keep one version before running it`;
  }
  if (state.hash !== workflowEnvironmentHash(modules)) {
    const changed = missingDeclaredModules(state.modules, modules);
    if (changed > 0) {
      return `the environment is not prepared for this Workflow: run "Prepare environment" (${changed} module${changed === 1 ? "" : "s"} changed)`;
    }
  }
  if (packages.some((module) => module.runtime === "python") && !existsSync(state.pythonBin ?? paths.python)) {
    return 'the environment\'s Python interpreter is missing: run "Prepare environment"';
  }
  if (packages.some((module) => module.runtime === "node") && !existsSync(paths.nodeModules)) {
    return 'the environment\'s node_modules is missing: run "Prepare environment"';
  }
  return undefined;
}

export interface EnvironmentCommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  /** The end of the output, which a person reads when a step fails. */
  tail: string;
  timedOut?: boolean;
}

export interface EnvironmentCommandOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
}

/** Runs one preparation command. `shell: false`, so a name from a Workflow is never parsed as a command line. */
export type EnvironmentCommand = (command: string, args: readonly string[], options: EnvironmentCommandOptions) => Promise<EnvironmentCommandResult>;

function keepTail(value: string): string {
  return value.trim().slice(-TAIL_KEEP);
}

const runCommand: EnvironmentCommand = (command, args, options) => new Promise((resolve) => {
  let child;
  try {
    child = spawn(command, [...args], { cwd: options.cwd, env: options.env, shell: false, stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    resolve({ ok: false, stdout: "", stderr: "", tail: error instanceof Error ? error.message : String(error) });
    return;
  }
  let stdout = "";
  let stderr = "";
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGKILL");
  }, options.timeoutMs);
  child.stdout?.on("data", (chunk: Buffer) => { stdout = keepTail(stdout + chunk.toString("utf8")); });
  child.stderr?.on("data", (chunk: Buffer) => { stderr = keepTail(stderr + chunk.toString("utf8")); });
  child.on("error", (error) => {
    clearTimeout(timer);
    resolve({ ok: false, stdout, stderr, tail: keepTail(error.message) });
  });
  child.on("close", (code) => {
    clearTimeout(timer);
    const detail = stderr.trim() ? stderr : stdout;
    resolve({
      ok: code === 0 && !timedOut,
      stdout,
      stderr,
      tail: timedOut ? `it ran longer than ${options.timeoutMs}ms` : keepTail(detail),
      ...(timedOut ? { timedOut: true } : {}),
    });
  });
});

/** npm on Windows is a `.cmd`, which spawn cannot start without a shell; its JS entry runs instead. */
function npmInvocation(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): { command: string; args: string[] } {
  if (platform !== "win32") return { command: "npm", args: [] };
  const entry = env.npm_execpath?.endsWith("npm-cli.js")
    ? env.npm_execpath
    : join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  return { command: process.execPath, args: [entry] };
}

export interface WorkflowEnvironmentPrepareOptions extends WorkflowEnvironmentLocation {
  definitions: readonly WorkflowDefinition[];
  now?: () => number;
  /** Injected by tests so no package manager and no network is touched. */
  command?: EnvironmentCommand;
  installTimeoutMs?: number;
}

export interface WorkflowEnvironmentPrepareResult {
  ok: boolean;
  preparedAt?: number;
  hash?: string;
  /** The modules the environment now provides, with the version the install recorded. */
  installed: WorkflowModule[];
  missing: string[];
  tail?: string;
}

/** Writes the manifest, installs what changed and records the prepared set. A failure
 * leaves every earlier file in place: nothing is deleted and no state is recorded. */
export async function prepareWorkflowEnvironment(options: WorkflowEnvironmentPrepareOptions): Promise<WorkflowEnvironmentPrepareResult> {
  const platform = options.platform ?? process.platform;
  const now = options.now ?? Date.now;
  const command = options.command ?? runCommand;
  const timeout = options.installTimeoutMs ?? INSTALL_TIMEOUT_MS;
  const paths = workflowEnvironmentPaths(options);
  const env: NodeJS.ProcessEnv = { ...process.env, ...options.env };
  const declaration = declaredWorkflowModules(options.definitions);
  if (declaration.conflicts.length > 0) {
    return {
      ok: false,
      installed: [],
      missing: [],
      tail: `no single environment satisfies both declarations: ${declaration.conflicts.join("; ")}`,
    };
  }
  const modules = declaration.modules;
  const python = modules.filter((module) => module.runtime === "python");
  const node = modules.filter((module) => module.runtime === "node");
  const run: EnvironmentCommandOptions = { cwd: paths.root, env, timeoutMs: timeout };
  let tail = "";

  const manifests = [paths.requirements, paths.packageJson];
  const previous = manifests.map((path) => {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return undefined;
    }
  });
  const failure = (reason: string): WorkflowEnvironmentPrepareResult => {
    manifests.forEach((path, index) => {
      try {
        if (previous[index] === undefined) rmSync(path, { force: true });
        else writeFileSync(path, previous[index]!, { mode: 0o600 });
      } catch {}
    });
    return { ok: false, installed: [], missing: [], tail: reason };
  };

  try {
    mkdirSync(paths.envDir, { recursive: true, mode: 0o700 });
    mkdirSync(paths.root, { recursive: true, mode: 0o700 });
    writeFileSync(paths.requirements, python.map((module) => module.version ? `${module.name}==${module.version}` : module.name).join("\n") + (python.length > 0 ? "\n" : ""), { mode: 0o600 });
    const dependencies = Object.fromEntries(node.map((module) => [module.name, module.version ?? "*"]));
    writeFileSync(paths.packageJson, `${JSON.stringify({ name: PACKAGE_NAME, private: true, dependencies }, null, 2)}\n`, { mode: 0o600 });
  } catch (error) {
    return failure(`could not write the environment manifests: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!existsSync(paths.python)) {
    const venv = platform === "win32"
      ? await command("py", ["-3", "-m", "venv", paths.venvDir], run)
      : await command("python3", ["-m", "venv", paths.venvDir], run);
    if (!venv.ok) return failure(venv.tail || "the python venv could not be created");
    tail = venv.tail;
  }

  if (python.length > 0) {
    const pip = await command(paths.python, ["-m", "pip", "install", "--disable-pip-version-check", "-r", paths.requirements], run);
    if (!pip.ok) return failure(pip.tail || "pip install failed");
    tail = pip.tail;
  }

  if (node.length > 0) {
    const npm = npmInvocation(platform, env);
    const installed = await command(npm.command, [...npm.args, "install", "--no-audit", "--no-fund"], run);
    if (!installed.ok) return failure(installed.tail || "npm install failed");
    tail = installed.tail;
  }

  const installedModules: WorkflowModule[] = [];
  const missing: string[] = [];
  for (const module of python) {
    const importName = module.name.replace(/-/g, "_");
    const probe = await command(paths.python, ["-c", `import ${importName}`], { cwd: paths.root, env, timeoutMs: PROBE_TIMEOUT_MS });
    if (!probe.ok) {
      missing.push(module.name);
      tail = probe.tail || tail;
      continue;
    }
    const version = await command(paths.python, ["-c", `import importlib.metadata as m; print(m.version(${JSON.stringify(module.name)}))`], { cwd: paths.root, env, timeoutMs: PROBE_TIMEOUT_MS });
    const resolved = version.ok ? version.stdout.trim() : module.version;
    installedModules.push({ name: module.name, runtime: "python", ...(resolved ? { version: resolved } : {}) });
  }
  for (const module of node) {
    const manifest = join(paths.nodeModules, ...module.name.split("/"), PACKAGE_FILE);
    try {
      const info: unknown = JSON.parse(readFileSync(manifest, "utf8"));
      const resolved = info !== null && typeof info === "object" && typeof (info as { version?: unknown }).version === "string"
        ? (info as { version: string }).version
        : module.version;
      installedModules.push({ name: module.name, runtime: "node", ...(resolved ? { version: resolved } : {}) });
    } catch {
      missing.push(module.name);
    }
  }
  for (const module of modules.filter((entry) => entry.runtime === "bin")) {
    if (isCommandOnPath(module.name, env)) installedModules.push(module);
    else missing.push(module.name);
  }

  const pythonVersion = await command(paths.python, ["-c", "import sys; print('.'.join(str(part) for part in sys.version_info[:3]))"], { cwd: paths.root, env, timeoutMs: PROBE_TIMEOUT_MS });
  const preparedAt = now();
  const hash = workflowEnvironmentHash(modules);
  // A declaration without a version records the version the install resolved.
  const resolved = new Map(installedModules.map((module) => [`${module.runtime}\u0000${module.name}`, module.version]));
  const preparedModules = modules.map((module) => {
    if (module.runtime === "bin") return module;
    const version = resolved.get(`${module.runtime}\u0000${module.name}`);
    return version === undefined ? module : { ...module, version };
  });
  const state: WorkflowEnvironmentState = {
    preparedAt,
    hash,
    ...(pythonVersion.ok && pythonVersion.stdout.trim() ? { python: pythonVersion.stdout.trim() } : {}),
    pythonBin: paths.python,
    node: process.versions.node,
    modules: preparedModules,
  };
  try {
    writeFileAtomic(paths.state, JSON.stringify(state, null, 2), { mode: 0o600 });
  } catch (error) {
    return { ok: false, installed: installedModules, missing, tail: `could not write ${paths.state}: ${error instanceof Error ? error.message : String(error)}` };
  }
  return {
    ok: true,
    preparedAt,
    hash,
    installed: installedModules,
    missing,
    ...(tail ? { tail } : {}),
  };
}
