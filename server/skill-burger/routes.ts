// Skill Burgers over HTTP. POST /api/skill-burgers saves the run in a conversation as a workflow skill in the shared
// skills library (SKILL.md + workflow.json, tagged "workflow", approved, every bot); GET lists the saved ones; POST
// /:name/run repeats one's shell and file steps in the conversation's folder; DELETE with the sha256 it was saved with
// is its Undo. A bot reaches the same runner through POST /api/internal/skill-burgers/run.
import type { ServerResponse } from "node:http";
import { z } from "zod";

import { draftWorkflow } from "../../shared/skill-burger/draft.ts";
import { burgerLayers, BURGER_MIN_LAYERS, replayableLayers, type RunMessage } from "../../shared/skill-burger/layers.ts";
import { SUMMARY_MAX, workflowSchema } from "../../shared/skill-burger/format.ts";
import type { SavedWorkflow } from "../../shared/skill-burger/saved.ts";
import { createExecutors } from "./executors.ts";
import { runWorkflow, type RunResult } from "./runner.ts";
import { findWorkflowSkill, listWorkflowSkills, removeWorkflowSkill, saveWorkflowSkill, type Failure } from "./store.ts";
import { PASS, type RouteContext, type RouteHandler } from "../routes/table.ts";

export const SKILL_BURGERS_PATH = "/api/skill-burgers";
export const SKILL_BURGER_RUN_INTERNAL = "/api/internal/skill-burgers/run";

export interface SkillBurgerRouteDeps {
  /** The conversation's messages on its active branch. */
  messages(threadId: string): readonly RunMessage[];
  /** True when this thread is one of the bot's own conversations. */
  owns(botId: string, threadId: string): boolean;
  /** The folder a conversation's turns run in, created if missing. */
  folder(botId: string, threadId: string): string;
  root?: string;
}

const id = z.string().min(1).max(100);
const saveBody = z.union([
  z.object({
    botId: id,
    threadId: z.string().min(1).max(200),
    summary: z.string().max(SUMMARY_MAX).optional(),
    name: z.string().max(64).optional(),
  }).strict(),
  // Undo of a removal: the workflow the list read before removing it, put back under its name.
  z.object({ workflow: z.unknown(), name: z.string().min(1).max(64) }).strict(),
]);
const runBody = z.object({
  botId: id,
  threadId: z.string().min(1).max(200).optional(),
  args: z.record(z.string(), z.unknown()).optional(),
}).strict();

const isFailure = (value: SavedWorkflow | Failure): value is Failure => "error" in value;

function nameOf(path: string): string {
  return decodeURIComponent(path.slice(SKILL_BURGERS_PATH.length + 1));
}

/** Saves the run in `threadId` for `botId`, or why it can't be saved. */
function draftFrom(threadId: string, deps: SkillBurgerRouteDeps, options: { summary?: string; name?: string }): SavedWorkflow | Failure {
  const messages = deps.messages(threadId);
  const layers = burgerLayers(messages).filter((layer) => layer.status === "done");
  if (replayableLayers(layers).length < BURGER_MIN_LAYERS) return { error: "This run has fewer than two steps that can run again." };
  const draft = draftWorkflow(messages, options.summary ? { summary: options.summary } : {});
  if ("reason" in draft) return { error: draft.reason };
  return saveWorkflowSkill({ workflow: draft.workflow, ...(options.name ? { name: options.name } : {}), ...(deps.root ? { root: deps.root } : {}) });
}

async function run(input: { name: string; botId: string; threadId: string; args?: Record<string, unknown> }, deps: SkillBurgerRouteDeps): Promise<RunResult | { error: string }> {
  const found = findWorkflowSkill(input.name, deps.root);
  if (!found) return { error: "No saved skill has that name." };
  const workflow = workflowSchema.safeParse(found.workflow);
  if (!workflow.success) return { error: "That saved skill's steps can't be read." };
  return runWorkflow({ workflow: workflow.data, ...(input.args ? { args: input.args } : {}) }, {
    exec: createExecutors({ botId: input.botId, cwd: deps.folder(input.botId, input.threadId) }),
  });
}

const sendRun = (json: RouteContext["json"], res: ServerResponse, result: RunResult | { error: string }) => {
  if (!("steps" in result)) return json(res, 404, { error: result.error });
  return json(res, 200, result);
};

export function createSkillBurgerRoutes(deps: SkillBurgerRouteDeps): RouteHandler {
  return async ({ req, res, url, path, method, json, readBody }) => {
    if (path !== SKILL_BURGERS_PATH && !path.startsWith(`${SKILL_BURGERS_PATH}/`)) return PASS;
    if (path === SKILL_BURGERS_PATH) {
      if (method === "GET") return json(res, 200, { skills: listWorkflowSkills(deps.root) });
      if (method !== "POST") return json(res, 405, { error: "Use GET or POST." });
      const body = saveBody.safeParse(await readBody(req));
      if (!body.success) return json(res, 400, { error: "Send botId and threadId." });
      if ("workflow" in body.data) {
        const restored = saveWorkflowSkill({ workflow: body.data.workflow, name: body.data.name, ...(deps.root ? { root: deps.root } : {}) });
        if (isFailure(restored)) return json(res, restored.taken ? 409 : 422, { error: restored.error });
        return json(res, 201, { skill: restored });
      }
      const { botId, threadId, summary, name } = body.data;
      if (!deps.owns(botId, threadId)) return json(res, 404, { error: "No such conversation." });
      const saved = draftFrom(threadId, deps, { ...(summary ? { summary } : {}), ...(name ? { name } : {}) });
      if (isFailure(saved)) return json(res, saved.taken ? 409 : 422, { error: saved.error });
      return json(res, 201, { skill: saved });
    }
    const rest = nameOf(path);
    if (method === "POST" && rest.endsWith("/run")) {
      const name = rest.slice(0, -"/run".length);
      const body = runBody.safeParse(await readBody(req));
      if (!body.success) return json(res, 400, { error: "Send botId and threadId." });
      const { botId, threadId, args } = body.data;
      const chosen = threadId ?? "";
      if (!chosen || !deps.owns(botId, chosen)) return json(res, 404, { error: "No such conversation." });
      return sendRun(json, res, await run({ name, botId, threadId: chosen, ...(args ? { args } : {}) }, deps));
    }
    const name = rest;
    if (!name) return json(res, 404, { error: "No such skill." });
    if (method === "GET") {
      const skill = listWorkflowSkills(deps.root).find((entry) => entry.name === name);
      const found = findWorkflowSkill(name, deps.root);
      if (!skill || !found) return json(res, 404, { error: "No such skill." });
      return json(res, 200, { skill, workflow: found.workflow });
    }
    if (method === "DELETE") {
      const removed = removeWorkflowSkill(name, url.searchParams.get("sha256") ?? undefined, deps.root);
      if ("stale" in removed) return json(res, 409, { error: "This skill changed since. Reload and try again." });
      if ("error" in removed) return json(res, 500, { error: removed.error });
      return json(res, 200, { removed: true });
    }
    return json(res, 405, { error: "Use GET, POST or DELETE." });
  };
}

export interface SkillBurgerInternalContext {
  method: string;
  path: string;
  res: ServerResponse;
  json: RouteContext["json"];
  readBody(): Promise<unknown>;
  botId: string;
  threadId: string;
}

const internalBody = z.object({
  name: z.string().min(1).max(64),
  args: z.record(z.string(), z.unknown()).optional(),
}).strict();

/** The bot's own door to a saved burger: same runner, same folder, the bot the capability belongs to. */
export function createSkillBurgerInternalRoutes(deps: SkillBurgerRouteDeps) {
  return async (ctx: SkillBurgerInternalContext): Promise<typeof PASS | void> => {
    if (ctx.path !== SKILL_BURGER_RUN_INTERNAL) return PASS;
    const { res, json } = ctx;
    if (ctx.method !== "POST") return void json(res, 405, { error: "Use POST." });
    const body = internalBody.safeParse(await ctx.readBody());
    if (!body.success) return void json(res, 400, { error: "Send the skill's name." });
    return void sendRun(json, res, await run({ name: body.data.name, botId: ctx.botId, threadId: ctx.threadId, ...(body.data.args ? { args: body.data.args } : {}) }, deps));
  };
}
