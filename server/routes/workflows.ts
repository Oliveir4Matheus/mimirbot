// Workflow HTTP. The person's routes are admin-only (they are not in
// CLIENT_ALLOW), and a bot's routes run inside the /api/internal block, after
// the capability bearer names the bot and its conversation. State changes are
// announced as `workflow.run` frames on the app's existing SSE stream.
import type { ServerResponse } from "node:http";

import type { json as sendJson } from "../harness/http.ts";
import { isWorkflowScriptName } from "../../shared/workflow.ts";
import type { WorkflowEngine } from "../workflows/engine.ts";
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

const sameDepartment = (left: string, right: string): boolean => left.trim().toLowerCase() === right.trim().toLowerCase();

const departmentOf = (deps: WorkflowRoutesDeps, botId: string): string => deps.bot(botId)?.section?.trim() || "General";

export function createWorkflowRoutes(deps: WorkflowRoutesDeps): RouteHandler {
  const save = async (res: ServerResponse, json: typeof sendJson, body: unknown, id: string | undefined): Promise<void> => {
    if (id !== undefined) {
      if (!isWorkflowId(id)) return void json(res, 400, { error: "the Workflow id must be a uuid" });
      if (!isRecord(body)) return void json(res, 400, { error: "a Workflow must be a JSON object" });
      const claimed = body.id;
      if (claimed !== undefined && String(claimed).toLowerCase() !== id.toLowerCase()) {
        return void json(res, 400, { error: "the body id does not match the path" });
      }
      body.id = id.toLowerCase();
    }
    const saved = deps.store.saveWorkflow(body);
    if (!saved.ok) return void json(res, 400, { error: saved.error });
    return void json(res, 200, { workflow: saved.workflow });
  };

  return async ({ req, res, path, method, url, json, readBody }) => {
    if (path !== BASE && !path.startsWith(`${BASE}/`)) return PASS;
    const parts = segments(path, BASE);

    if (parts.length === 0) {
      if (method === "GET") return void json(res, 200, { workflows: deps.store.workflows() });
      if (method === "POST") return save(res, json, await readBody(req), undefined);
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
    if (parts[1] === "scripts") {
      if (!deps.store.workflow(id)) return void json(res, 404, { error: "no such workflow" });
      if (parts.length === 2 && method === "GET") {
        return void json(res, 200, { scripts: deps.store.listScripts(id) });
      }
      const name = parts[2];
      if (!name || parts.length !== 3) return void json(res, 400, { error: "give a script name" });
      if (!isWorkflowScriptName(name)) return void json(res, 400, { error: "a script name must be a flat .mjs or .js file name" });
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
      return void json(res, 200, { removed: deps.store.removeWorkflow(id) });
    }
    if (parts.length === 2 && parts[1] === "run" && method === "POST") {
      const body = await readBody(req);
      const version = isRecord(body) && Number.isSafeInteger(body.version) ? Number(body.version) : undefined;
      const started = deps.engine.start(id, version === undefined ? {} : { version });
      if (!started.ok) return void json(res, 404, { error: started.error });
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
      const started = deps.engine.start(definition.id, {
        ...(version === undefined ? {} : { version }),
        requestedBy: { botId: ctx.botId, threadId: ctx.threadId },
      });
      if (!started.ok) return void json(res, 409, { error: started.error });
      return void json(res, 202, { run: started.run });
    }

    return void json(res, 404, { error: "not found" });
  };
}
