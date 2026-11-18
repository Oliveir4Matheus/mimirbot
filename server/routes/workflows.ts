// Workflow HTTP. The person's routes are admin-only (they are not in
// CLIENT_ALLOW), and a bot's routes run inside the /api/internal block, after
// the capability bearer names the bot and its conversation. State changes are
// announced as `workflow.run` frames on the app's existing SSE stream.
import type { ServerResponse } from "node:http";
import { closeSync, createReadStream } from "node:fs";

import type { json as sendJson } from "../harness/http.ts";
import {
  isBotStep,
  isWorkflowRelativePath,
  isWorkflowScriptName,
  isWorkflowSlug,
  workflowAllSteps,
  workflowDefinitionSchema,
  workflowUnknownFields,
  WORKFLOW_ARTIFACT_PREVIEW_MAX_BYTES,
  WORKFLOW_ARTIFACT_TEXT_PREVIEW_BYTES,
  WORKFLOW_STEP_MAX,
  type WorkflowArtifactOrigin,
  type WorkflowArtifactPreview,
  type WorkflowDefinition,
  type WorkflowRun,
  type WorkflowSkillOptions,
  type WorkflowStep,
} from "../../shared/workflow.ts";
import { authoringRefusal, workflowRefusal } from "../../shared/workflow-refusal.ts";
import { parseAudioRange } from "../attachments.ts";
import { messageFileDisposition } from "../message-file.ts";
import {
  listWorkflowArtifacts,
  openWorkflowArtifact,
  workflowArtifactKind,
  workflowArtifactName,
  workflowArtifactOriginLabel,
} from "../workflows/artifacts.ts";
import {
  planWorkflowArchive,
  workflowArchiveName,
  writeWorkflowArchive,
  WORKFLOW_ARCHIVE_ENTRIES_MAX,
  type WorkflowArchiveItem,
} from "../workflows/archive.ts";
import type { WorkflowEngine } from "../workflows/engine.ts";
import { WorkflowTriggerRefusal, type WorkflowTriggerManager } from "../workflow-triggers.ts";
import {
  prepareWorkflowEnvironment,
  workflowEnvironmentStatus,
  type WorkflowEnvironmentPrepareOptions,
  type WorkflowEnvironmentPrepareResult,
} from "../workflows/environment.ts";
import { isWorkflowId } from "../workflows/paths.ts";
import { isActiveRun } from "../workflows/state.ts";
import type { WorkflowStore } from "../workflows/store.ts";
import { PASS, type RouteHandler } from "./table.ts";

const BASE = "/api/workflows";
const INTERNAL = "/api/internal/workflows";

export interface WorkflowRoutesDeps {
  store: WorkflowStore;
  engine: WorkflowEngine;
  bot(id: string): { id: string; name: string; section?: string } | undefined;
  skillOptions?(botId: string): WorkflowSkillOptions | undefined;
  /** Draft proposals: their modules are prepared too, so a Workflow can be tested before it is created. */
  draftDefinitions?(): readonly WorkflowDefinition[];
  home?: string;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  log?: (line: string) => void;
  /** Tests inject a stand-in so no package manager runs; a real server installs locally. */
  prepareEnvironment?(options: WorkflowEnvironmentPrepareOptions): Promise<WorkflowEnvironmentPrepareResult>;
  /** The webhook runtime, resolved late because the ingress that advertises its URLs starts after this host. */
  triggers?(): WorkflowTriggerManager | undefined;
}

export interface WorkflowInternalContext {
  method: string;
  path: string;
  res: ServerResponse;
  json: typeof sendJson;
  readBody(): Promise<unknown>;
  botId: string;
  threadId: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

const segments = (path: string, base: string): string[] => path.slice(base.length).split("/").filter(Boolean);

const STEP_NUMBER = /^\d{1,2}$/;
const ITERATION_NUMBER = /^\d{1,6}$/;
const TEXT_PREVIEWS: ReadonlySet<WorkflowArtifactPreview> = new Set(["text", "markdown", "json", "csv"]);
const BINARY_PREVIEWS: ReadonlySet<WorkflowArtifactPreview> = new Set(["image", "pdf", "audio", "video"]);

function stepNumber(value: string | null): number | null {
  if (value === null || !STEP_NUMBER.test(value)) return null;
  const number = Number(value);
  return number >= 1 && number <= WORKFLOW_STEP_MAX ? number : null;
}

type ArtifactQuery =
  | { ok: true; origin: WorkflowArtifactOrigin; path: string; disposition: "inline" | "download" }
  | { ok: false; error: string };

function artifactQuery(url: URL): ArtifactQuery {
  const step = stepNumber(url.searchParams.get("step"));
  if (step === null) return { ok: false, error: "step must be 1-40" };
  const path = url.searchParams.get("path");
  if (!path || !isWorkflowRelativePath(path)) {
    return { ok: false, error: "path must be a relative path inside output/" };
  }
  const iteration = url.searchParams.get("iteration");
  const body = url.searchParams.get("body");
  if ((iteration === null) !== (body === null)) return { ok: false, error: "iteration and body must be given together" };
  let origin: WorkflowArtifactOrigin = { kind: "step", step };
  if (iteration !== null && body !== null) {
    if (!ITERATION_NUMBER.test(iteration) || Number(iteration) < 1) return { ok: false, error: "iteration must be a round number" };
    if (!isWorkflowSlug(body)) return { ok: false, error: "body must be a step id" };
    origin = { kind: "iteration", step, iteration: Number(iteration), body };
  }
  const disposition = url.searchParams.get("disposition") ?? "inline";
  if (disposition !== "inline" && disposition !== "download") {
    return { ok: false, error: "disposition must be inline or download" };
  }
  return { ok: true, origin, path, disposition };
}

const sameDepartment = (left: string, right: string): boolean => left.trim().toLowerCase() === right.trim().toLowerCase();

const departmentOf = (deps: WorkflowRoutesDeps, botId: string): string => deps.bot(botId)?.section?.trim() || "General";

const missingStepSkill = (steps: readonly WorkflowStep[], deps: WorkflowRoutesDeps): string | undefined => {
  for (const step of workflowAllSteps({ steps })) {
    if (!isBotStep(step) || step.skills === undefined) continue;
    const options = deps.skillOptions?.(step.botId);
    for (const group of ["bot", "bundled", "imported"] as const) {
      const allowed = new Set((options?.[group] ?? []).filter((option) => option.available).map((option) => option.name));
      const missing = (step.skills[group] ?? []).find((name) => !allowed.has(name));
      if (missing !== undefined) {
        return `step ${JSON.stringify(step.name)}: skill ${JSON.stringify(missing)} is not available for this Workflow step`;
      }
    }
  }
  return undefined;
};

export function createWorkflowRoutes(deps: WorkflowRoutesDeps): RouteHandler {
  const save = async (res: ServerResponse, json: typeof sendJson, body: unknown, id: string | undefined): Promise<void> => {
    if (!isRecord(body)) return void json(res, 400, workflowRefusal("authoringErrors", "a Workflow must be a JSON object"));
    const { scripts, ...definition } = body;
    if (id !== undefined) {
      if (!isWorkflowId(id)) return void json(res, 400, workflowRefusal("authoringErrors", "the Workflow id must be a uuid"));
      const claimed = definition.id;
      if (claimed !== undefined && String(claimed).toLowerCase() !== id.toLowerCase()) {
        return void json(res, 400, workflowRefusal("authoringErrors", "the body id does not match the path"));
      }
      definition.id = id.toLowerCase();
    }
    let uploads: Array<{ name: string; content: string }> | undefined;
    if (scripts !== undefined) {
      if (!Array.isArray(scripts)) return void json(res, 400, workflowRefusal("authoringErrors", "scripts must be a list"));
      uploads = scripts.map((entry) => isRecord(entry) && typeof entry.name === "string" && typeof entry.content === "string"
        ? { name: entry.name, content: entry.content }
        : null).filter((entry): entry is { name: string; content: string } => entry !== null);
      if (uploads.length !== scripts.length) return void json(res, 400, workflowRefusal("authoringErrors", "a script needs a name and a content string"));
      const workflowId = typeof definition.id === "string" ? definition.id : undefined;
      if (workflowId && deps.store.hasActiveRuns(workflowId)) {
        return void json(res, 409, { error: "this Workflow has active runs; cancel them before changing a script" });
      }
    }
    const unknown = workflowUnknownFields(definition);
    if (unknown.length > 0) {
      return void json(res, 400, authoringRefusal(unknown));
    }
    const candidate = workflowDefinitionSchema.safeParse({
      ...definition,
      version: definition.version ?? 1,
      createdAt: typeof definition.createdAt === "number" ? definition.createdAt : 0,
      updatedAt: typeof definition.updatedAt === "number" ? definition.updatedAt : 0,
    });
    if (candidate.success) {
      const missing = missingStepSkill(candidate.data.steps, deps);
      if (missing) return void json(res, 400, authoringRefusal([{ path: "steps", message: missing }]));
      const existing = id === undefined ? undefined : deps.store.workflow(id);
      if (existing && !sameDepartment(existing.department, candidate.data.department) && deps.triggers?.()?.hasTriggers(id!)) {
        return void json(res, 409, {
          error: "this Workflow has webhook triggers; change its department only after deleting them",
        });
      }
    }
    const saved = deps.store.saveWorkflow(definition, uploads && uploads.length > 0 ? { scripts: uploads } : undefined);
    if (!saved.ok) return void json(res, 400, saved.refusal ?? workflowRefusal("authoringErrors", saved.error));
    return void json(res, 200, { workflow: saved.workflow, ...(saved.warnings.length === 0 ? {} : { warnings: saved.warnings }) });
  };

  const logArtifact = (runId: string, origin: string, reason: string): void => {
    deps.log?.(`workflows: artifact ${runId} ${origin} ${reason}`);
  };

  const serveArtifact = async (run: WorkflowRun, req: Parameters<RouteHandler>[0]["req"], res: ServerResponse, url: URL, method: string, json: typeof sendJson): Promise<void> => {
    const query = artifactQuery(url);
    if (!query.ok) return void json(res, 400, { error: query.error });
    const opened = openWorkflowArtifact({ run, runDir: deps.store.runDir(run), origin: query.origin, path: query.path });
    if (!opened.ok) {
      if (opened.reason === "read") {
        logArtifact(run.id, workflowArtifactOriginLabel(query.origin), "read failed");
        return void json(res, 500, { error: "could not read the file" });
      }
      logArtifact(run.id, workflowArtifactOriginLabel(query.origin), opened.reason);
      return void json(res, 404, { error: "no such file" });
    }

    const name = workflowArtifactName(query.path);
    const kind = workflowArtifactKind(name);
    const attachment = query.disposition === "download" || kind.attachment;
    const headers: Record<string, string | number> = {
      "content-type": kind.contentType,
      "content-disposition": messageFileDisposition(name).replace(/^attachment/, attachment ? "attachment" : "inline"),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox",
      "referrer-policy": "no-referrer",
      "cross-origin-resource-policy": "same-origin",
      "accept-ranges": "bytes",
    };

    if (!attachment && BINARY_PREVIEWS.has(kind.preview) && opened.size > WORKFLOW_ARTIFACT_PREVIEW_MAX_BYTES) {
      closeSync(opened.fd);
      return void json(res, 413, { error: "the file is too large to preview", limit: WORKFLOW_ARTIFACT_PREVIEW_MAX_BYTES });
    }

    let status = 200;
    let start = 0;
    let end = opened.size - 1;
    const range = parseAudioRange(req.headers.range, opened.size);
    if (range.kind === "unsatisfiable") {
      closeSync(opened.fd);
      res.writeHead(416, { ...headers, "content-range": `bytes */${opened.size}`, "content-length": 0 });
      res.end();
      return;
    }
    if (range.kind === "range") {
      status = 206;
      start = range.start;
      end = range.end;
      headers["content-range"] = `bytes ${start}-${end}/${opened.size}`;
    } else if (!attachment && TEXT_PREVIEWS.has(kind.preview) && opened.size > WORKFLOW_ARTIFACT_TEXT_PREVIEW_BYTES) {
      end = WORKFLOW_ARTIFACT_TEXT_PREVIEW_BYTES - 1;
      headers["x-artifact-truncated"] = "1";
    }
    headers["content-length"] = Math.max(0, end - start + 1);

    if (opened.size === 0 || method === "HEAD") {
      closeSync(opened.fd);
      res.writeHead(status, headers);
      res.end();
      return;
    }

    res.writeHead(status, headers);
    await new Promise<void>((resolve) => {
      const stream = createReadStream(opened.file, { fd: opened.fd, start, end, autoClose: true });
      stream.once("error", () => {
        logArtifact(run.id, workflowArtifactOriginLabel(query.origin), "stream failed");
        res.destroy();
        resolve();
      });
      stream.once("end", () => resolve());
      res.once("close", () => {
        stream.destroy();
        resolve();
      });
      stream.pipe(res);
    });
  };

  const serveArtifactsZip = async (run: WorkflowRun, res: ServerResponse, step: number | undefined, json: typeof sendJson): Promise<void> => {
    const list = listWorkflowArtifacts({
      run,
      runDir: deps.store.runDir(run),
      definition: deps.store.workflow(run.workflowId, run.workflowVersion),
      retentionDays: deps.store.retentionDays(run.workflowId),
      limits: { perOrigin: WORKFLOW_ARCHIVE_ENTRIES_MAX + 1, total: WORKFLOW_ARCHIVE_ENTRIES_MAX + 1 },
      ...(step === undefined ? {} : { onlyStep: step }),
      ...(deps.now === undefined ? {} : { now: deps.now() }),
    });
    const sources = list.sources;
    const items: WorkflowArchiveItem[] = [];
    for (const source of sources) {
      for (const artifact of source.files) {
        const opened = openWorkflowArtifact({ run, runDir: deps.store.runDir(run), origin: artifact.origin, path: artifact.path });
        if (!opened.ok) {
          logArtifact(run.id, workflowArtifactOriginLabel(artifact.origin), opened.reason);
          continue;
        }
        closeSync(opened.fd);
        items.push({
          name: workflowArchiveName(artifact.origin, artifact.path),
          file: opened.file,
          bytes: artifact.bytes,
          modifiedAt: artifact.modifiedAt,
        });
      }
    }
    if (items.length === 0) return void json(res, 404, { error: "no such file" });
    const plan = planWorkflowArchive(items);
    if (!plan.ok) {
      return void json(res, 413, {
        error: plan.reason === "entries" ? "the zip has too many files" : "the zip is larger than its limit",
        limit: plan.limit,
      });
    }
    const suffix = step === undefined ? "" : `-step-${step}`;
    res.writeHead(200, {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="run-${run.id}${suffix}.zip"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    });
    try {
      await writeWorkflowArchive(res, plan);
      res.end();
    } catch {
      logArtifact(run.id, step === undefined ? "all" : `step-${step}`, "zip failed");
      res.destroy();
    }
  };

  return async ({ req, res, path, method, url, json, readBody }) => {
    if (path !== BASE && !path.startsWith(`${BASE}/`)) return PASS;
    const parts = segments(path, BASE);

    if (parts.length === 1 && parts[0] === "skill-options" && method === "GET") {
      const botId = url.searchParams.get("botId")?.trim();
      if (!botId) return void json(res, 400, { error: "give a bot id" });
      if (!deps.bot(botId)) return void json(res, 404, { error: "no such bot" });
      const options = deps.skillOptions?.(botId);
      if (!options) return void json(res, 409, { error: "skills are not available for this bot" });
      return void json(res, 200, { options });
    }

    if (parts.length === 0) {
      if (method === "GET") return void json(res, 200, { workflows: deps.store.workflows() });
      if (method === "POST") return save(res, json, await readBody(req), undefined);
      return void json(res, 405, { error: "method not allowed" });
    }

    if (parts[0] === "environment") {
      const definitions = [...deps.store.workflows(), ...(deps.draftDefinitions?.() ?? [])];
      const location = {
        ...(deps.home === undefined ? {} : { home: deps.home }),
        ...(deps.env === undefined ? {} : { env: deps.env }),
      };
      if (parts.length === 1 && method === "GET") {
        return void json(res, 200, workflowEnvironmentStatus(definitions, location));
      }
      if (parts.length === 2 && parts[1] === "prepare" && method === "POST") {
        const prepared = await (deps.prepareEnvironment ?? prepareWorkflowEnvironment)({
          definitions,
          ...location,
          ...(deps.now === undefined ? {} : { now: deps.now }),
        });
        return void json(res, 200, prepared);
      }
      return void json(res, 405, { error: "method not allowed" });
    }

    if (parts[0] === "runs") {
      if (parts.length === 1 && method === "GET") {
        const limit = Number(url.searchParams.get("limit") ?? "");
        return void json(res, 200, {
          runs: deps.store.listRuns({
            ...(url.searchParams.get("workflowId") ? { workflowId: url.searchParams.get("workflowId")! } : {}),
            ...(url.searchParams.get("department") ? { department: url.searchParams.get("department")! } : {}),
            ...(Number.isSafeInteger(limit) && limit > 0 ? { limit } : {}),
          }),
        });
      }
      const runId = parts[1];
      if (!runId) return void json(res, 400, { error: "give a run id" });
      if (parts.length === 3 && parts[2] === "artifacts") {
        if (method !== "GET") return void json(res, 405, { error: "method not allowed" });
        const run = deps.store.readRun(runId);
        if (!run) return void json(res, 404, { error: "no such run" });
        res.setHeader("cache-control", "private, no-store");
        return void json(res, 200, listWorkflowArtifacts({
          run,
          runDir: deps.store.runDir(run),
          definition: deps.store.workflow(run.workflowId, run.workflowVersion),
          retentionDays: deps.store.retentionDays(run.workflowId),
          ...(deps.now === undefined ? {} : { now: deps.now() }),
        }));
      }
      if (parts.length === 3 && parts[2] === "artifact") {
        if (method !== "GET" && method !== "HEAD") return void json(res, 405, { error: "method not allowed" });
        const run = deps.store.readRun(runId);
        if (!run) return void json(res, 404, { error: "no such run" });
        return serveArtifact(run, req, res, url, method, json);
      }
      if (parts.length === 3 && parts[2] === "artifacts.zip") {
        if (method !== "GET") return void json(res, 405, { error: "method not allowed" });
        const run = deps.store.readRun(runId);
        if (!run) return void json(res, 404, { error: "no such run" });
        const rawStep = url.searchParams.get("step");
        let step: number | undefined;
        if (rawStep !== null) {
          const parsed = stepNumber(rawStep);
          if (parsed === null) return void json(res, 400, { error: "step must be 1-40" });
          if (!run.steps[parsed - 1]) return void json(res, 404, { error: "no such file" });
          step = parsed;
        }
        return serveArtifactsZip(run, res, step, json);
      }
      if (parts.length === 2 && method === "GET") {
        const run = deps.store.readRun(runId);
        return run ? void json(res, 200, { run }) : void json(res, 404, { error: "no such run" });
      }
      if (parts.length === 2 && method === "DELETE") {
        const run = deps.store.readRun(runId);
        if (!run) return void json(res, 404, { error: "no such run" });
        if (isActiveRun(run.status)) {
          return void json(res, 409, { error: "this run is still active; cancel it before deleting it", run: { id: run.id, status: run.status } });
        }
        return void json(res, 200, { removed: deps.store.deleteRun(run.id) });
      }
      if (parts.length === 3 && parts[2] === "continue" && method === "POST") {
        const body = await readBody(req);
        const inputs = isRecord(body) && isRecord(body.inputs) ? body.inputs : {};
        const resumed = deps.engine.resume(runId, inputs);
        if (!resumed.ok) {
          if (resumed.needsInput) return void json(res, 400, { ...resumed.needsInput, error: resumed.error });
          return void json(res, resumed.error === "no such run" ? 404 : 409, { error: resumed.error });
        }
        return void json(res, 200, { run: resumed.run });
      }
      if (parts.length === 3 && parts[2] === "cancel" && method === "POST") {
        const body = await readBody(req);
        const cancelled = deps.engine.cancel(runId, isRecord(body) && typeof body.reason === "string" ? body.reason : undefined);
        if (!cancelled.ok) {
          return void json(res, cancelled.error === "no such run" ? 404 : 409, { error: cancelled.error });
        }
        return void json(res, 200, { run: cancelled.run });
      }
      return void json(res, 405, { error: "method not allowed" });
    }

    const id = parts[0]!;
    if (!isWorkflowId(id)) return void json(res, 400, { error: "the Workflow id must be a uuid" });
    if (parts[1] === "triggers") {
      const manager = deps.triggers?.();
      if (!manager) return void json(res, 404, { error: "Workflow triggers are unavailable" });
      const triggerId = parts[2];
      const answerRefusal = (error: unknown): void => {
        if (error instanceof WorkflowTriggerRefusal) {
          json(res, error.status, error.body);
          return;
        }
        throw error;
      };
      try {
        if (!deps.store.workflow(id)) return void json(res, 404, { error: "no such workflow" });
        if (triggerId === undefined) {
          if (method === "GET") return void json(res, 200, { triggers: manager.list(id) });
          if (method === "POST") return void json(res, 201, manager.create(id, await readBody(req)));
          return void json(res, 405, { error: "method not allowed" });
        }
        if (parts.length === 4 && parts[3] === "preview") {
          if (method !== "POST") return void json(res, 405, { error: "method not allowed" });
          return void json(res, 200, { preview: manager.preview(id, triggerId, await readBody(req)) });
        }
        if (parts.length === 4 && parts[3] === "rotate-secret") {
          if (method !== "POST") return void json(res, 405, { error: "method not allowed" });
          const rotated = manager.rotateSecret(id, triggerId);
          return void json(res, 200, { credential: rotated.credential });
        }
        if (parts.length === 4 && parts[3] === "restore") {
          if (method !== "POST") return void json(res, 405, { error: "method not allowed" });
          return void json(res, 200, manager.restore(id, triggerId));
        }
        if (parts.length === 4 && parts[3] === "attempts") {
          if (method !== "GET") return void json(res, 405, { error: "method not allowed" });
          const raw = url.searchParams.get("limit");
          const limit = raw === null ? 50 : Number(raw);
          if (!Number.isSafeInteger(limit) || limit < 1) return void json(res, 400, { error: "limit must be a positive integer" });
          return void json(res, 200, manager.listAttempts(id, triggerId, limit));
        }
        if (parts.length !== 3) return void json(res, 404, { error: "not found" });
        if (method === "GET") {
          const trigger = manager.get(id, triggerId);
          return trigger ? void json(res, 200, { trigger }) : void json(res, 404, { error: "no such Workflow trigger" });
        }
        if (method === "PATCH") return void json(res, 200, { trigger: manager.update(id, triggerId, await readBody(req)) });
        if (method === "DELETE") return void json(res, 200, manager.remove(id, triggerId));
        return void json(res, 405, { error: "method not allowed" });
      } catch (error) {
        return answerRefusal(error);
      }
    }
    if (parts[1] === "scripts") {
      if (!deps.store.workflow(id)) return void json(res, 404, { error: "no such workflow" });
      if (parts.length === 2 && method === "GET") {
        return void json(res, 200, { scripts: deps.store.listScripts(id) });
      }
      const name = parts[2];
      if (!name || parts.length !== 3) return void json(res, 400, { error: "give a script name" });
      if (!isWorkflowScriptName(name)) return void json(res, 400, { error: "a script name must be a flat .mjs file name" });
      if (method === "GET") {
        const script = deps.store.readScript(id, name);
        return script ? void json(res, 200, { script }) : void json(res, 404, { error: "no such script" });
      }
      if (method === "PUT") {
        if (deps.store.hasActiveRuns(id)) {
          return void json(res, 409, { error: "this Workflow has active runs; cancel them before changing a script" });
        }
        const body = await readBody(req);
        if (!isRecord(body) || typeof body.content !== "string" || body.content.length === 0) {
          return void json(res, 400, { error: "a script body needs a non-empty content string" });
        }
        const saved = deps.store.writeScript(id, name, body.content);
        if (!saved.ok) return void json(res, saved.error === "no such workflow" ? 404 : 400, { error: saved.error });
        return void json(res, 200, { script: saved.script });
      }
      return void json(res, 405, { error: "method not allowed" });
    }
    if (parts.length === 1 && method === "GET") {
      const definition = deps.store.workflow(id);
      if (!definition) return void json(res, 404, { error: "no such workflow" });
      return void json(res, 200, { workflow: definition, versions: deps.store.versions(id) });
    }
    if (parts.length === 1 && method === "PUT") return save(res, json, await readBody(req), id);
    if (parts.length === 1 && method === "DELETE") {
      const active = deps.store.listRuns({ workflowId: id, limit: Number.POSITIVE_INFINITY }).filter((run) => isActiveRun(run.status));
      if (active.length > 0) {
        return void json(res, 409, {
          error: "this Workflow has active runs; cancel them before deleting it",
          runs: active.map((run) => ({ id: run.id, status: run.status, currentStep: run.currentStep })),
        });
      }
      const triggers = deps.triggers?.();
      if (triggers?.hasTriggers(id)) {
        if (url.searchParams.get("withTriggers") !== "true") {
          return void json(res, 409, {
            error: "this Workflow has webhook triggers; delete it with withTriggers=true to remove both",
            triggers: triggers.list(id).length,
          });
        }
        triggers.removeForWorkflow(id);
      }
      return void json(res, 200, { removed: deps.store.removeWorkflow(id) });
    }
    if (parts.length === 2 && parts[1] === "run" && method === "POST") {
      const body = await readBody(req);
      const version = isRecord(body) && Number.isSafeInteger(body.version) ? Number(body.version) : undefined;
      const inputs = isRecord(body) && isRecord(body.inputs) ? body.inputs : undefined;
      const requestId = isRecord(body) && typeof body.requestId === "string" ? body.requestId : undefined;
      const started = deps.engine.start(id, {
        ...(version === undefined ? {} : { version }),
        ...(inputs === undefined ? {} : { inputs }),
        ...(requestId === undefined ? {} : { requestId }),
      });
      if (!started.ok) {
        if (started.needsInput) return void json(res, 400, { ...started.needsInput, error: started.error });
        return void json(res, 404, { error: started.error });
      }
      return void json(res, 202, { run: started.run });
    }
    return void json(res, 405, { error: "method not allowed" });
  };
}

export function createWorkflowInternalRoutes(deps: WorkflowRoutesDeps) {
  return async (ctx: WorkflowInternalContext): Promise<typeof PASS | void> => {
    if (ctx.path !== INTERNAL && !ctx.path.startsWith(`${INTERNAL}/`)) return PASS;
    const { res, json } = ctx;
    const parts = segments(ctx.path, INTERNAL);
    const department = departmentOf(deps, ctx.botId);

    if (parts.length === 0 && ctx.method === "GET") {
      return void json(res, 200, { workflows: deps.store.workflows().filter((definition) => sameDepartment(definition.department, department)) });
    }

    if (parts[0] === "runs") {
      const runId = parts[1];
      if (!runId) return void json(res, 400, { error: "give a run id" });
      const run = deps.store.readRun(runId);
      if (!run) return void json(res, 404, { error: "no such run" });
      if (!sameDepartment(run.department, department)) return void json(res, 403, { error: "that run belongs to another department" });
      if (parts.length === 2 && ctx.method === "GET") {
        const definition = deps.store.workflow(run.workflowId, run.workflowVersion);
        return void json(res, 200, {
          run,
          ...(definition
            ? { workflow: { name: definition.name, version: definition.version, steps: definition.steps.map((step) => ({ id: step.id, name: step.name })) } }
            : {}),
        });
      }
      if (parts.length === 3 && parts[2] === "cancel" && ctx.method === "POST") {
        if (run.requestedBy?.botId !== ctx.botId || run.requestedBy.threadId !== ctx.threadId) {
          return void json(res, 403, { error: "only the conversation that started this run can cancel it" });
        }
        const body = await ctx.readBody();
        const cancelled = deps.engine.cancel(run.id, isRecord(body) && typeof body.reason === "string" ? body.reason : undefined);
        if (!cancelled.ok) return void json(res, cancelled.error === "no such run" ? 404 : 409, { error: cancelled.error });
        return void json(res, 200, { run: cancelled.run });
      }
      return void json(res, 405, { error: "method not allowed" });
    }

    if (parts.length === 2 && parts[1] === "run" && ctx.method === "POST") {
      const id = parts[0]!;
      if (!isWorkflowId(id)) return void json(res, 400, { error: "the Workflow id must be a uuid" });
      const definition = deps.store.workflow(id);
      if (!definition) return void json(res, 404, { error: "no such workflow" });
      if (!sameDepartment(definition.department, department)) return void json(res, 403, { error: "that Workflow belongs to another department" });
      const body = await ctx.readBody();
      const version = isRecord(body) && Number.isSafeInteger(body.version) ? Number(body.version) : undefined;
      const inputs = isRecord(body) && isRecord(body.inputs) ? body.inputs : undefined;
      const requestId = isRecord(body) && typeof body.request_id === "string" ? body.request_id : undefined;
      const started = deps.engine.start(definition.id, {
        ...(version === undefined ? {} : { version }),
        requestedBy: { botId: ctx.botId, threadId: ctx.threadId },
        ...(inputs === undefined ? {} : { inputs }),
        ...(requestId === undefined ? {} : { requestId }),
      });
      if (!started.ok) {
        if (started.needsInput) return void json(res, 400, { ...started.needsInput, error: started.error });
        return void json(res, 409, { error: started.error });
      }
      return void json(res, 202, { run: started.run });
    }

    return void json(res, 404, { error: "not found" });
  };
}
