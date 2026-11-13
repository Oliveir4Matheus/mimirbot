import { mkdtempSync, rmSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { WORKFLOWS_ROOT_ENV } from "../workflows/paths.ts";
import { createWorkflowProposalStore } from "../workflows/proposals.ts";
import { createWorkflowStore } from "../workflows/store.ts";
import { createWorkflowProposalInternalRoutes, createWorkflowProposalRoutes, type WorkflowProposalInternalContext } from "./workflow-proposals.ts";
import { PASS, type RouteContext } from "./table.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "omb-proposal-routes-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const steps = [{
  id: "coletar",
  kind: "script",
  name: "Coletar",
  run: "coletar.mjs",
  outputs: [{ path: "dados.json" }],
  result: "dados.json",
}];

const body = (overrides: Record<string, unknown> = {}) => ({
  name: "Cobrança mensal",
  interview: { recurring: true, changes: "Só as datas", confirmer: "Eu confirmo" },
  summary: "Uma mensagem por cliente.",
  steps,
  scripts: [{ name: "coletar.mjs", content: "console.log('ok')\n" }],
  ...overrides,
});

function harness() {
  const dataDir = join(root, "data");
  const workflows = createWorkflowStore({ dataDir, env: { [WORKFLOWS_ROOT_ENV]: join(root, "runs") }, now: () => 1, log: () => {} });
  const proposals = createWorkflowProposalStore({ dataDir, now: () => 1, log: () => {} });
  const cards: Array<{ id: string; botId: string; threadId: string }> = [];
  const deps = { proposals, workflows, card: (proposal: { id: string }, botId: string, threadId: string) => cards.push({ id: proposal.id, botId, threadId }) };
  const publicRoutes = createWorkflowProposalRoutes(deps);
  const internalRoutes = createWorkflowProposalInternalRoutes(deps);
  const state = { status: 0, body: undefined as unknown };
  const res = { headersSent: false, writableEnded: false };
  const json = ((_res: ServerResponse, status: number, value: unknown) => {
    state.status = status;
    state.body = value;
    res.writableEnded = true;
  }) as unknown as RouteContext["json"];
  const call = (method: string, path: string, query?: Record<string, string>) => {
    state.status = 0;
    state.body = undefined;
    res.writableEnded = false;
    const url = new URL(`http://127.0.0.1${path}`);
    for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, value);
    return publicRoutes({
      req: {} as IncomingMessage, res: res as unknown as ServerResponse, url, path, method, auth: {} as RouteContext["auth"], json,
      readBody: (async () => undefined) as unknown as RouteContext["readBody"],
    });
  };
  const callInternal = (method: string, path: string, value?: unknown, department = "Financeiro") => {
    state.status = 0;
    state.body = undefined;
    res.writableEnded = false;
    const ctx: WorkflowProposalInternalContext = {
      method, path, res: res as unknown as ServerResponse, json, readBody: async () => value,
      botId: "bot-a", threadId: "t-1", department,
    };
    return internalRoutes(ctx);
  };
  return { workflows, proposals, cards, state, call, callInternal };
}

describe("workflow proposal internal routes", () => {
  it("creates a department draft, posts the card and leaves the Workflow store empty", async () => {
    const h = harness();
    await h.callInternal("POST", "/api/internal/workflows/proposals", body());
    expect(h.state.status).toBe(201);
    const proposal = (h.state.body as { proposal: { id: string; status: string; createdBy: unknown; department: string } }).proposal;
    expect(proposal).toMatchObject({ status: "draft", department: "Financeiro", createdBy: { botId: "bot-a", threadId: "t-1" } });
    expect(h.cards).toEqual([{ id: proposal.id, botId: "bot-a", threadId: "t-1" }]);
    expect(h.workflows.workflows()).toHaveLength(0);
    expect(h.workflows.listRuns()).toHaveLength(0);
  });

  it("creates the Workflow only on the person's yes, with the first step manual", async () => {
    const h = harness();
    await h.callInternal("POST", "/api/internal/workflows/proposals", body());
    const id = (h.state.body as { proposal: { id: string } }).proposal.id;
    await h.callInternal("POST", `/api/internal/workflows/proposals/${id}/create`, {});
    expect(h.state.status).toBe(201);
    expect(h.workflows.workflows()).toHaveLength(1);
    expect(h.workflows.workflow(id)?.steps[0]).toMatchObject({ mode: "manual" });
    expect(h.workflows.readScript(id, "coletar.mjs")?.content).toContain("console.log");
    expect(h.proposals.read(id)).toMatchObject({ status: "created", createdWorkflowId: id });
    await h.callInternal("POST", `/api/internal/workflows/proposals/${id}/create`, {});
    expect(h.state.status).toBe(200);
    expect(h.workflows.workflows()).toHaveLength(1);
  });

  it("archives on Agora não and keeps it recoverable", async () => {
    const h = harness();
    await h.callInternal("POST", "/api/internal/workflows/proposals", body());
    const id = (h.state.body as { proposal: { id: string } }).proposal.id;
    await h.callInternal("POST", `/api/internal/workflows/proposals/${id}/archive`, {});
    expect(h.state.status).toBe(200);
    expect(h.proposals.read(id)).toMatchObject({ status: "archived" });
    expect(h.workflows.workflows()).toHaveLength(0);
  });

  it("refuses a one-time task and a proposal from another department", async () => {
    const h = harness();
    await h.callInternal("POST", "/api/internal/workflows/proposals", body({ interview: { recurring: false, changes: "", confirmer: "" } }));
    expect(h.state.status).toBe(400);
    expect(String((h.state.body as { error: string }).error)).toContain("one-time task");

    await h.callInternal("POST", "/api/internal/workflows/proposals", body());
    const id = (h.state.body as { proposal: { id: string } }).proposal.id;
    await h.callInternal("GET", `/api/internal/workflows/proposals/${id}`, undefined, "Operações");
    expect(h.state.status).toBe(404);
  });
});

describe("workflow proposal person routes", () => {
  it("lists archived proposals by default and a draft only with status=all", async () => {
    const h = harness();
    await h.callInternal("POST", "/api/internal/workflows/proposals", body());
    const id = (h.state.body as { proposal: { id: string } }).proposal.id;
    await h.call("GET", "/api/workflow-proposals");
    expect(h.state.status).toBe(200);
    expect((h.state.body as { proposals: unknown[] }).proposals).toHaveLength(0);
    await h.callInternal("POST", `/api/internal/workflows/proposals/${id}/archive`, {});
    await h.call("GET", "/api/workflow-proposals");
    expect((h.state.body as { proposals: unknown[] }).proposals).toHaveLength(1);
    await h.call("GET", "/api/workflow-proposals", { status: "all" });
    expect((h.state.body as { proposals: unknown[] }).proposals).toHaveLength(1);
  });

  it("creates from the person's route and refuses a second delete after creation", async () => {
    const h = harness();
    await h.callInternal("POST", "/api/internal/workflows/proposals", body());
    const id = (h.state.body as { proposal: { id: string } }).proposal.id;
    await h.call("POST", `/api/workflow-proposals/${id}/create`);
    expect(h.state.status).toBe(201);
    expect(h.workflows.workflows()).toHaveLength(1);
    await h.call("DELETE", `/api/workflow-proposals/${id}`);
    expect(h.state.status).toBe(409);
  });

  it("is not a Workflows route", async () => {
    const h = harness();
    const answer = await h.call("GET", "/api/workflows");
    expect(answer).toBe(PASS);
  });
});
