// What a run left in each step's `output/` folder. Only names and sizes are
// read here: a file's type comes from its extension, never from its bytes.
import { closeSync, fstatSync, lstatSync, openSync, readdirSync, realpathSync } from "node:fs";
import { basename, isAbsolute, join, relative } from "node:path";

import {
  WORKFLOW_ARTIFACT_PREVIEW_MAX_BYTES,
  WORKFLOW_ARTIFACT_TEXT_PREVIEW_BYTES,
  WORKFLOW_PATH_MAX,
  isWorkflowSlug,
  type WorkflowArtifact,
  type WorkflowArtifactList,
  type WorkflowArtifactOrigin,
  type WorkflowArtifactPreview,
  type WorkflowArtifactSource,
  type WorkflowDefinition,
  type WorkflowRun,
  type WorkflowStepStatus,
} from "../../shared/workflow.ts";
import { safeWorkflowPath } from "./files.ts";
import { iterationStepOutputDir, stepOutputDir } from "./paths.ts";

export const WORKFLOW_ARTIFACT_FILES_PER_ORIGIN = 2_000;
export const WORKFLOW_ARTIFACT_FILES_TOTAL = 4_000;
export const WORKFLOW_ARTIFACT_DEPTH = 8;
export const WORKFLOW_ARTIFACT_TEXT_MAX_BYTES = WORKFLOW_ARTIFACT_TEXT_PREVIEW_BYTES;
export const WORKFLOW_ARTIFACT_BINARY_MAX_BYTES = WORKFLOW_ARTIFACT_PREVIEW_MAX_BYTES;
const DAY_MS = 86_400_000;

const IGNORED_DIRS = new Set(["node_modules", "__pycache__", ".git", ".venv"]);

interface ArtifactKind {
  contentType: string;
  preview: WorkflowArtifactPreview;
  /** HTML and SVG are served as source, never rendered inline. */
  attachment: boolean;
}

const OCTET: ArtifactKind = { contentType: "application/octet-stream", preview: "none", attachment: true };
const PLAIN_TEXT: ArtifactKind = { contentType: "text/plain; charset=utf-8", preview: "text", attachment: false };
const SOURCE: ArtifactKind = { contentType: "text/plain; charset=utf-8", preview: "text", attachment: true };

const KIND_BY_EXTENSION: Record<string, ArtifactKind> = {
  ".txt": PLAIN_TEXT, ".log": PLAIN_TEXT,
  ".md": { contentType: "text/markdown; charset=utf-8", preview: "markdown", attachment: false },
  ".markdown": { contentType: "text/markdown; charset=utf-8", preview: "markdown", attachment: false },
  ".json": { contentType: "application/json", preview: "json", attachment: false },
  ".csv": { contentType: "text/csv; charset=utf-8", preview: "csv", attachment: false },
  ".tsv": { contentType: "text/csv; charset=utf-8", preview: "csv", attachment: false },
  ".yaml": PLAIN_TEXT, ".yml": PLAIN_TEXT, ".xml": PLAIN_TEXT, ".toml": PLAIN_TEXT, ".ini": PLAIN_TEXT,
  ".sql": PLAIN_TEXT, ".mjs": PLAIN_TEXT, ".ts": PLAIN_TEXT, ".py": PLAIN_TEXT, ".sh": PLAIN_TEXT,
  ".png": { contentType: "image/png", preview: "image", attachment: false },
  ".jpg": { contentType: "image/jpeg", preview: "image", attachment: false },
  ".jpeg": { contentType: "image/jpeg", preview: "image", attachment: false },
  ".gif": { contentType: "image/gif", preview: "image", attachment: false },
  ".webp": { contentType: "image/webp", preview: "image", attachment: false },
  ".avif": { contentType: "image/avif", preview: "image", attachment: false },
  ".pdf": { contentType: "application/pdf", preview: "pdf", attachment: false },
  ".mp3": { contentType: "audio/mpeg", preview: "audio", attachment: false },
  ".wav": { contentType: "audio/wav", preview: "audio", attachment: false },
  ".m4a": { contentType: "audio/mp4", preview: "audio", attachment: false },
  ".ogg": { contentType: "audio/ogg", preview: "audio", attachment: false },
  ".mp4": { contentType: "video/mp4", preview: "video", attachment: false },
  ".webm": { contentType: "video/webm", preview: "video", attachment: false },
  ".mov": { contentType: "video/quicktime", preview: "video", attachment: false },
  ".html": SOURCE, ".htm": SOURCE, ".svg": SOURCE,
};

export function workflowArtifactKind(name: string): ArtifactKind {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return OCTET;
  return KIND_BY_EXTENSION[name.slice(dot).toLowerCase()] ?? OCTET;
}

export function workflowArtifactOriginLabel(origin: WorkflowArtifactOrigin): string {
  return origin.kind === "step"
    ? `step-${origin.step}`
    : `step-${origin.step}/iter-${origin.iteration}/${origin.body}`;
}

/** The `output/` folder of an origin, or undefined when run.json does not hold that step,
 * round or body step. A round is matched by its recorded index, never by folder order. */
export function workflowArtifactOriginRoot(runDir: string, run: WorkflowRun, origin: WorkflowArtifactOrigin): string | undefined {
  if (!Number.isInteger(origin.step) || origin.step < 1 || origin.step > run.steps.length) return undefined;
  const step = run.steps[origin.step - 1]!;
  if (origin.kind === "step") return stepOutputDir(runDir, origin.step);
  if (!Number.isInteger(origin.iteration) || origin.iteration < 1 || !isWorkflowSlug(origin.body)) return undefined;
  const iteration = step.iterations?.find((candidate) => candidate.index === origin.iteration);
  if (!iteration || !iteration.steps.some((candidate) => candidate.id === origin.body)) return undefined;
  return iterationStepOutputDir(runDir, origin.iteration, origin.body);
}

interface ScanBudget {
  files: number;
  truncated: boolean;
  perOrigin: number;
  total: number;
}

interface ScanResult {
  files: WorkflowArtifact[];
  bytes: number;
}

function scanOutput(root: string, origin: WorkflowArtifactOrigin, verified: ReadonlySet<string>, budget: ScanBudget): ScanResult {
  const files: WorkflowArtifact[] = [];
  let bytes = 0;

  const walk = (dir: string, prefix: string, depth: number): void => {
    if (budget.files >= budget.total) {
      budget.truncated = true;
      return;
    }
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= budget.perOrigin || budget.files >= budget.total) {
        budget.truncated = true;
        return;
      }
      const name = entry.name;
      if (name.startsWith(".") || entry.isSymbolicLink()) continue;
      const full = join(dir, name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(name)) continue;
        if (depth >= WORKFLOW_ARTIFACT_DEPTH) {
          budget.truncated = true;
          continue;
        }
        walk(full, prefix ? `${prefix}/${name}` : name, depth + 1);
        continue;
      }
      let info;
      try {
        info = lstatSync(full);
      } catch {
        continue;
      }
      if (info.isSymbolicLink() || !info.isFile()) continue;
      const path = prefix ? `${prefix}/${name}` : name;
      if (path.length > WORKFLOW_PATH_MAX) {
        budget.truncated = true;
        continue;
      }
      const kind = workflowArtifactKind(name);
      files.push({
        origin,
        path,
        name: name.normalize("NFC"),
        bytes: info.size,
        modifiedAt: Math.floor(info.mtimeMs),
        contentType: kind.contentType,
        preview: kind.preview,
        verified: verified.has(path),
      });
      bytes += info.size;
      budget.files += 1;
    }
  };

  walk(root, "", 0);
  files.sort((left, right) => left.path.localeCompare(right.path));
  return { files, bytes };
}

export interface ArtifactListOptions {
  run: WorkflowRun;
  runDir: string;
  definition?: Pick<WorkflowDefinition, "steps">;
  retentionDays?: number;
  now?: number;
  limits?: { perOrigin?: number; total?: number };
  /** One top-level step and its rounds only, for a step-scoped zip. */
  onlyStep?: number;
}

function stepName(run: WorkflowRun, definition: ArtifactListOptions["definition"], index: number): string {
  return definition?.steps[index]?.name ?? run.snapshot?.steps[index]?.name ?? `Etapa ${index + 1}`;
}

function bodyName(run: WorkflowRun, definition: ArtifactListOptions["definition"], stepIndex: number, bodyId: string): string {
  const loop = definition?.steps[stepIndex];
  const fromDefinition = loop?.kind === "loop" ? loop.body.find((step) => step.id === bodyId)?.name : undefined;
  return fromDefinition ?? run.snapshot?.steps[stepIndex]?.body?.find((step) => step.id === bodyId)?.name ?? bodyId;
}

export function listWorkflowArtifacts(options: ArtifactListOptions): WorkflowArtifactList {
  const { run, runDir, definition } = options;
  const now = options.now ?? Date.now();
  const budget: ScanBudget = {
    files: 0,
    truncated: false,
    perOrigin: options.limits?.perOrigin ?? WORKFLOW_ARTIFACT_FILES_PER_ORIGIN,
    total: options.limits?.total ?? WORKFLOW_ARTIFACT_FILES_TOTAL,
  };
  const sources: WorkflowArtifactSource[] = [];

  const push = (origin: WorkflowArtifactOrigin, stepId: string, name: string, status: WorkflowStepStatus, verified: readonly string[]): void => {
    if (budget.files >= budget.total) {
      budget.truncated = true;
      return;
    }
    const root = workflowArtifactOriginRoot(runDir, run, origin);
    if (!root) return;
    const scanned = scanOutput(root, origin, new Set(verified), budget);
    if (scanned.files.length === 0) return;
    sources.push({ origin, stepId, name, status, files: scanned.files, bytes: scanned.bytes });
  };

  for (const [index, step] of run.steps.entries()) {
    if (options.onlyStep !== undefined && index + 1 !== options.onlyStep) continue;
    const name = stepName(run, definition, index);
    push({ kind: "step", step: index + 1 }, step.id, name, step.status, step.verified ?? []);
    for (const iteration of step.iterations ?? []) {
      for (const body of iteration.steps) {
        push(
          { kind: "iteration", step: index + 1, iteration: iteration.index, body: body.id },
          step.id,
          `Do While · volta ${iteration.index} · ${bodyName(run, definition, index, body.id)}`,
          body.status,
          body.verified ?? [],
        );
      }
    }
  }

  const totals = {
    files: sources.reduce((sum, source) => sum + source.files.length, 0),
    bytes: sources.reduce((sum, source) => sum + source.bytes, 0),
    truncated: budget.truncated,
  };
  const retained = options.retentionDays;
  return {
    runId: run.id,
    generatedAt: now,
    ...(retained === undefined ? {} : { expiresAt: (run.finishedAt ?? run.createdAt) + retained * DAY_MS }),
    runStatus: run.status,
    sources,
    totals,
  };
}

export type ArtifactOpenFailure = "origin" | "path" | "missing" | "link" | "outside" | "read";

export type ArtifactOpen =
  | { ok: true; fd: number; file: string; size: number }
  | { ok: false; reason: ArtifactOpenFailure };

const inside = (root: string, file: string): boolean => {
  const rel = relative(root, file);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
};

/** Opens the file behind an origin and a relative path. Every refusal but a read
 * error is "not found" to the caller: a link, a traversal and a missing file
 * must be indistinguishable. The descriptor is positioned for streaming. */
export function openWorkflowArtifact(input: {
  run: WorkflowRun;
  runDir: string;
  origin: WorkflowArtifactOrigin;
  path: string;
}): ArtifactOpen {
  const root = workflowArtifactOriginRoot(input.runDir, input.run, input.origin);
  if (!root) return { ok: false, reason: "origin" };
  const full = safeWorkflowPath(root, input.path);
  if (!full) return { ok: false, reason: "path" };
  let info;
  try {
    info = lstatSync(full);
  } catch {
    return { ok: false, reason: "missing" };
  }
  if (info.isSymbolicLink() || !info.isFile()) return { ok: false, reason: "link" };
  let rootReal: string;
  let fileReal: string;
  let runReal: string;
  try {
    rootReal = realpathSync(root);
    fileReal = realpathSync(full);
    runReal = realpathSync(input.runDir);
  } catch {
    return { ok: false, reason: "missing" };
  }
  if (!inside(runReal, rootReal)) return { ok: false, reason: "outside" };
  if (!inside(rootReal, fileReal)) return { ok: false, reason: "outside" };
  let fd: number;
  try {
    fd = openSync(fileReal, "r");
  } catch (error) {
    return { ok: false, reason: (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "read" };
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) {
      closeSync(fd);
      return { ok: false, reason: "link" };
    }
    return { ok: true, fd, file: fileReal, size: stat.size };
  } catch {
    closeSync(fd);
    return { ok: false, reason: "read" };
  }
}

/** The displayed name of the file at a relative path. */
export function workflowArtifactName(path: string): string {
  return basename(path).normalize("NFC");
}
