// Proposal HTTP. The person's routes are admin-only like /api/workflows; a
// bot's routes live in the internal block and cannot name another department.
// Creating a Workflow is the only path from here into the Workflow store.
import type { ServerResponse } from "node:http";

import { isWorkflowId } from "../workflows/paths.ts";
import { approvedProposalDefinition, type WorkflowProposalStore } from "../workflows/proposals.ts";
import { workflowApprovalHash } from "../workflows/approval.ts";
import { rehearseProposal, type RehearsalExample } from "../workflows/rehearsal.ts";
import type { WorkflowStore } from "../workflows/store.ts";
import type { WorkflowProposal } from "../../shared/workflow-proposal.ts";
import type { json as sendJson } from "../harness/http.ts";
import { PASS, type RouteHandler } from "./table.ts";

const BASE = "/api/workflow-proposals";
const INTERNAL = "/api/internal/workflows/proposals";

export interface WorkflowProposalRouteDeps {
  proposals: WorkflowProposalStore;
  workflows: WorkflowStore;
  /** Appends the chat card for a draft the bot just made. */
  card?(proposal: WorkflowProposal, botId: string, threadId: string): void;
}

export interface WorkflowProposalInternalContext {
  method: string;
  path: string;
  res: ServerResponse;
  json: typeof sendJson;
  readBody(): Promise<unknown>;
  botId: string;
  threadId: string;
  department: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const segments = (path: string, base: string): string[] => path.slice(base.length).split("/").filter(Boolean);
const sameDepartment = (left: string, right: string): boolean => left.trim().toLowerCase() === right.trim().toLowerCase();

function createWorkflow(
  proposal: WorkflowProposal,
  workflows: WorkflowStore,
): { ok: true; workflowId: string; version: number } | { ok: false; error: string } {
  let definition;
  try {
    definition = approvedProposalDefinition(proposal);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  const currentHash = workflowApprovalHash(definition, proposal.scripts);
  if (proposal.approvalHash !== undefined && proposal.approvalHash !== currentHash) {
    return { ok: false, error: "the proposal changed after the review; review it again before creating the Workflow" };
  }
  const saved = workflows.saveWorkflow(definition, proposal.scripts.length > 0 ? { scripts: proposal.scripts } : undefined);
  if (!saved.ok) return saved;
  return { ok: true, workflowId: saved.workflow.id, version: saved.workflow.version };}

export function createWorkflowProposalRoutes(deps: WorkflowProposalRouteDeps): RouteHandler {
  return async ({ req, res, path, method, url, json, readBody }) => {
    if (path !== BASE && !path.startsWith(`${BASE}/`)) return PASS;
    const parts = segments(path, BASE);

    if (parts.length === 0 && method === "GET") {
      const status = url.searchParams.get("status");
      const proposals = status === "all"
        ? deps.proposals.list()
        : deps.proposals.list(status === "draft" || status === "created" || status === "archived" ? status : "archived");
      return void json(res, 200, { proposals });
    }

    const id = parts[0]?.toLowerCase();
    if (!id || !isWorkflowId(id)) return void json(res, 400, { error: "the proposal id must be a uuid" });
    const proposal = deps.proposals.read(id);
    if (!proposal) return void json(res, 404, { error: "no such proposal" });

    if (parts.length === 1 && method === "GET") {
      return void json(res, 200, { proposal });
    }
    if (parts.length === 2 && parts[1] === "archive" && method === "POST") {
      const archived = deps.proposals.archive(id);
      return archived.ok
        ? void json(res, 200, { proposal: archived.proposal })
        : void json(res, 409, { error: archived.error });
    }
    if (parts.length === 2 && parts[1] === "annotate" && method === "POST") {
      const body = await readBody(req);
      if (!isRecord(body) || !isRecord(body.annotations)) return void json(res, 400, { error: "annotations must be an object of step id to text" });
      const annotations = Object.fromEntries(Object.entries(body.annotations)
        .filter(([key, value]) => typeof value === "string" && key.length <= 64)
        .map(([key, value]) => [key, String(value).slice(0, 2_000)]));
      const saved = deps.proposals.annotate(id, annotations);
      return saved.ok ? void json(res, 200, { proposal: saved.proposal }) : void json(res, 409, { error: saved.error });
    }
    if (parts.length === 2 && parts[1] === "round" && method === "POST") {
      const saved = deps.proposals.bumpRounds(id);
      return saved.ok ? void json(res, 200, { proposal: saved.proposal }) : void json(res, 409, { error: saved.error });
    }
    if (parts.length === 2 && parts[1] === "rehearse" && method === "POST") {
      const body = await readBody(req);
      const example = isRecord(body) && isRecord(body.example) ? body.example as RehearsalExample : {};
      const rehearsal = await rehearseProposal(proposal, example);
      const saved = deps.proposals.recordRehearsal(id, rehearsal);
      return saved.ok ? void json(res, 200, { rehearsal, proposal: saved.proposal }) : void json(res, 409, { error: saved.error });
    }
    if (parts.length === 2 && parts[1] === "create" && method === "POST") {
      if (proposal.status === "created" && proposal.createdWorkflowId) {
        return void json(res, 200, { workflowId: proposal.createdWorkflowId });
      }
      const created = createWorkflow(proposal, deps.workflows);
      if (!created.ok) return void json(res, 400, { error: created.error });
      const marked = deps.proposals.markCreated(id, created.workflowId);
      if (!marked.ok) return void json(res, 500, { error: marked.error });
      return void json(res, 201, { workflowId: created.workflowId, version: created.version, proposal: marked.proposal });
    }
    if (parts.length === 1 && method === "DELETE") {
      if (proposal.status === "created") return void json(res, 409, { error: "this proposal became a Workflow" });
      return void json(res, 200, { removed: deps.proposals.remove(id) });
    }
    return void json(res, 405, { error: "method not allowed" });
  };
}

export function createWorkflowProposalInternalRoutes(deps: WorkflowProposalRouteDeps) {
  return async (ctx: WorkflowProposalInternalContext): Promise<typeof PASS | void> => {
    if (ctx.path !== INTERNAL && !ctx.path.startsWith(`${INTERNAL}/`)) return PASS;
    const { res, json } = ctx;
    const parts = segments(ctx.path, INTERNAL);

    if (parts.length === 0 && ctx.method === "POST") {
      const body = await ctx.readBody();
      if (!isRecord(body)) return void json(res, 400, { error: "a proposal must be a JSON object" });
      const created = deps.proposals.create(
        { ...body, department: ctx.department },
        { createdBy: { botId: ctx.botId, threadId: ctx.threadId } },
      );
      if (!created.ok) return void json(res, 400, { error: created.error });
      deps.card?.(created.proposal, ctx.botId, ctx.threadId);
      return void json(res, 201, { proposal: created.proposal });
    }

    const id = parts[0]?.toLowerCase();
    if (!id || !isWorkflowId(id)) return void json(res, 400, { error: "the proposal id must be a uuid" });
    const proposal = deps.proposals.read(id);
    if (!proposal || !sameDepartment(proposal.department, ctx.department)) return void json(res, 404, { error: "no such proposal" });

    if (parts.length === 1 && ctx.method === "GET") {
      return void json(res, 200, { proposal });
    }
    if (parts.length === 2 && parts[1] === "archive" && ctx.method === "POST") {
      const archived = deps.proposals.archive(id);
      return archived.ok ? void json(res, 200, { proposal: archived.proposal }) : void json(res, 409, { error: archived.error });
    }
    if (parts.length === 2 && parts[1] === "create" && ctx.method === "POST") {
      if (proposal.status === "created" && proposal.createdWorkflowId) {
        return void json(res, 200, { workflowId: proposal.createdWorkflowId });
      }
      const created = createWorkflow(proposal, deps.workflows);
      if (!created.ok) return void json(res, 400, { error: created.error });
      const marked = deps.proposals.markCreated(id, created.workflowId);
      if (!marked.ok) return void json(res, 500, { error: marked.error });
      return void json(res, 201, { workflowId: created.workflowId, version: created.version });
    }
    return void json(res, 405, { error: "method not allowed" });
  };
}
