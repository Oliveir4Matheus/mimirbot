import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  mode: "manual",
  parameters: [{ name: "link", type: "string", collectedBy: "coletar" }],
  outputs: [{ path: "dados.json" }],
}];

const body = (overrides: Record<string, unknown> = {}) => ({
  name: "Cobrança mensal",
  interview: { recurring: true, changes: "Só as datas", confirmer: "Eu confirmo" },
  summary: "Uma mensagem por cliente.",
  steps,
  scripts: [{ name: "coletar.mjs", content: "console.log('ok')\n" }],
  ...overrides,
});

const writing = "import { writeFileSync } from \"node:fs\";\nwriteFileSync(process.env.WORKFLOW_STEP_OUTPUT + \"/dados.json\", JSON.stringify({ rows: 1 }));\n";

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
  let sent: unknown;
  const call = (method: string, path: string, query?: Record<string, string>, body?: unknown) => {
    state.status = 0;
    state.body = undefined;
    sent = body;
    res.writableEnded = false;
    const url = new URL(`http://127.0.0.1${path}`);
    for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, value);
    return publicRoutes({
      req: {} as IncomingMessage, res: res as unknown as ServerResponse, url, path, method, auth: {} as RouteContext["auth"], json,
      readBody: (async () => sent) as unknown as RouteContext["readBody"],
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
    await h.callInternal("POST", "/api/internal/workflows/proposals", body({ scripts: [{ name: "coletar.mjs", content: writing }] }));
    const id = (h.state.body as { proposal: { id: string } }).proposal.id;
    await h.callInternal("POST", `/api/internal/workflows/proposals/${id}/create`, {});
    expect(h.state.status).toBe(409);
    expect(h.state.body).toMatchObject({ needsConfirmation: true });
    expect(h.workflows.workflows()).toHaveLength(0);

    await h.call("POST", `/api/workflow-proposals/${id}/confirm`, undefined, { interview: { recurring: true, changes: "Só as datas", confirmer: "Eu confirmo" } });
    expect(h.state.status).toBe(200);
    await h.callInternal("POST", `/api/internal/workflows/proposals/${id}/create`, {});
    expect(h.state.status).toBe(409);
    expect(h.state.body).toMatchObject({ code: "needsRehearsal", needsRehearsal: true });
    expect(h.workflows.workflows()).toHaveLength(0);
    await h.call("POST", `/api/workflow-proposals/${id}/rehearse`, undefined, {});
    expect(h.state.status).toBe(200);
    expect(h.proposals.read(id)?.rehearsal?.status).toBe("passed");
    await h.callInternal("POST", `/api/internal/workflows/proposals/${id}/create`, {});
    expect(h.state.status).toBe(201);
    expect(h.workflows.workflows()).toHaveLength(1);
    expect(h.workflows.workflow(id)?.steps[0]).toMatchObject({ mode: "manual" });
    expect(h.workflows.readScript(id, "coletar.mjs")?.content).toContain("writeFileSync");
    expect(h.proposals.read(id)).toMatchObject({ status: "created", createdWorkflowId: id });
    await h.callInternal("POST", `/api/internal/workflows/proposals/${id}/create`, {});
    expect(h.state.status).toBe(200);
    expect(h.workflows.workflows()).toHaveLength(1);
  });

  it("refuses a create whose interview was never confirmed, with the reason", async () => {
    const h = harness();
    await h.callInternal("POST", "/api/internal/workflows/proposals", body());
    const id = (h.state.body as { proposal: { id: string } }).proposal.id;
    await h.call("POST", `/api/workflow-proposals/${id}/create`, undefined, {});
    expect(h.state.status).toBe(409);
    expect(h.state.body).toMatchObject({ needsConfirmation: true });
    expect(String((h.state.body as { error: string }).error)).toContain("interview was never confirmed");
    expect(h.workflows.workflows()).toHaveLength(0);
  });

  it("stores a corrected answer and a new hash, and only then creates", async () => {
    const h = harness();
    await h.callInternal("POST", "/api/internal/workflows/proposals", body({ scripts: [{ name: "coletar.mjs", content: writing }] }));
    const id = (h.state.body as { proposal: { id: string } }).proposal.id;
    await h.call("POST", `/api/workflow-proposals/${id}/confirm`, undefined, {
      interview: { recurring: true, changes: "O link do vídeo do dia", confirmer: "O Matheus aprova os trechos" },
    });
    expect(h.state.status).toBe(200);
    const confirmed = h.proposals.read(id);
    expect(confirmed?.interview).toMatchObject({ changes: "O link do vídeo do dia", confirmedBy: "user" });
    expect(confirmed?.approvalHash).toMatch(/^[a-f0-9]{64}$/);
    await h.call("POST", `/api/workflow-proposals/${id}/rehearse`, undefined, {});
    expect(h.proposals.read(id)?.rehearsal?.status).toBe("passed");
    await h.call("POST", `/api/workflow-proposals/${id}/create`, undefined, {});
    expect(h.state.status).toBe(201);
  });

  it("accepts não sei as an answer and records the assumption it confirms", async () => {
    const h = harness();
    await h.callInternal("POST", "/api/internal/workflows/proposals", body());
    const id = (h.state.body as { proposal: { id: string } }).proposal.id;
    await h.call("POST", `/api/workflow-proposals/${id}/confirm`, undefined, { interview: { recurring: true, changes: "não sei", confirmer: "" } });
    expect(h.state.status).toBe(200);
    const confirmed = h.proposals.read(id);
    expect(confirmed?.interview.confirmedAt).toBeTypeOf("number");
    expect(confirmed?.assumptions.some((line) => line.includes("O que muda"))).toBe(true);
  });

  it("refuses a create whose answers changed after the confirmation", async () => {
    const h = harness();
    await h.callInternal("POST", "/api/internal/workflows/proposals", body());
    const id = (h.state.body as { proposal: { id: string } }).proposal.id;
    await h.call("POST", `/api/workflow-proposals/${id}/confirm`, undefined, { interview: { recurring: true, changes: "Só as datas", confirmer: "Eu confirmo" } });
    expect(h.state.status).toBe(200);

    const raw = JSON.parse(readFileSync(h.proposals.file, "utf8")) as { proposals: Array<{ interview: { changes: string } }> };
    raw.proposals[0]!.interview.changes = "O link do dia";
    writeFileSync(h.proposals.file, JSON.stringify(raw));

    const fresh = harness();
    expect(fresh.proposals.read(id)?.interview.changes).toBe("O link do dia");
    await fresh.call("POST", `/api/workflow-proposals/${id}/create`, undefined, {});
    expect(fresh.state.status).toBe(409);
    expect(fresh.state.body).toMatchObject({ needsConfirmation: true });
    expect(fresh.workflows.workflows()).toHaveLength(0);
  });

  it("invalidates the hash when a script or the definition changes after the confirmation", async () => {
    const h = harness();
    await h.callInternal("POST", "/api/internal/workflows/proposals", body());
    const id = (h.state.body as { proposal: { id: string } }).proposal.id;
    await h.call("POST", `/api/workflow-proposals/${id}/confirm`, undefined, { interview: { recurring: true, changes: "Só as datas", confirmer: "Eu confirmo" } });
    expect(h.state.status).toBe(200);

    const raw = JSON.parse(readFileSync(h.proposals.file, "utf8")) as {
      proposals: Array<{ scripts: Array<{ content: string }>; definition: { name: string } }>;
    };
    raw.proposals[0]!.scripts[0]!.content = "console.log('changed')\n";
    raw.proposals[0]!.definition.name = "Cobrança mensal revista";
    writeFileSync(h.proposals.file, JSON.stringify(raw));

    const fresh = harness();
    await fresh.call("POST", `/api/workflow-proposals/${id}/create`, undefined, {});
    expect(fresh.state.status).toBe(409);
    expect(fresh.state.body).toMatchObject({ needsConfirmation: true });
    expect(fresh.workflows.workflows()).toHaveLength(0);
    expect(fresh.proposals.read(id)?.approvalHash).toBeTypeOf("string");
  });

  it("refuses a confirmation from the bot's own routes", async () => {
    const h = harness();
    await h.callInternal("POST", "/api/internal/workflows/proposals", body());
    const id = (h.state.body as { proposal: { id: string } }).proposal.id;
    await h.callInternal("POST", `/api/internal/workflows/proposals/${id}/confirm`, { interview: { recurring: true } });
    expect(h.state.status).toBe(405);
    expect(h.proposals.read(id)?.interview.confirmedAt).toBeUndefined();
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

  it("creates from the person's route only after a passing rehearsal", async () => {
    const h = harness();
    await h.callInternal("POST", "/api/internal/workflows/proposals", body({ scripts: [{ name: "coletar.mjs", content: writing }] }));
    const id = (h.state.body as { proposal: { id: string } }).proposal.id;
    await h.call("POST", `/api/workflow-proposals/${id}/confirm`, undefined, { interview: { recurring: true, changes: "Só as datas", confirmer: "Eu confirmo" } });
    await h.call("POST", `/api/workflow-proposals/${id}/rehearse`, undefined, {});
    expect(h.state.status).toBe(200);
    expect(h.proposals.read(id)?.rehearsal?.status).toBe("passed");
    await h.call("POST", `/api/workflow-proposals/${id}/create`);
    expect(h.state.status).toBe(201);
    expect(h.workflows.workflows()).toHaveLength(1);
    await h.call("DELETE", `/api/workflow-proposals/${id}`);
    expect(h.state.status).toBe(409);
  });

  it("rehearses a script fed by a bot step when the person supplies the example file, then creates", async () => {
    const h = harness();
    const botFirst = [
      {
        id: "definir", kind: "bot", name: "Definir o corte", botId: "bot-a", mode: "manual",
        instructions: "Pergunte o corte e escreva output/corte.json.",
        parameters: [{ name: "dias", type: "integer", collectedBy: "definir" }],
        outputs: [{ path: "corte.json" }],
      },
      {
        id: "coletar", kind: "script", name: "Coletar", run: "coletar.mjs",
        inputs: [{ as: "corte.json", from: { step: "definir", output: "corte.json" } }],
        outputs: [{ path: "dados.json" }],
      },
    ];
    const readsCutoff = "import { readFileSync, writeFileSync } from \"node:fs\";\n"
      + "const corte = JSON.parse(readFileSync(\"input/corte.json\", \"utf8\"));\n"
      + "writeFileSync(process.env.WORKFLOW_STEP_OUTPUT + \"/dados.json\", JSON.stringify(corte));\n";
    await h.callInternal("POST", "/api/internal/workflows/proposals", body({ steps: botFirst, scripts: [{ name: "coletar.mjs", content: readsCutoff }] }));
    const id = (h.state.body as { proposal: { id: string } }).proposal.id;
    await h.call("POST", `/api/workflow-proposals/${id}/confirm`, undefined, { interview: { recurring: true, changes: "Só as datas", confirmer: "Eu confirmo" } });

    await h.call("POST", `/api/workflow-proposals/${id}/rehearse`, undefined, {});
    expect(h.state.status).toBe(200);
    expect(h.proposals.read(id)?.rehearsal?.status).toBe("untested");

    await h.call("POST", `/api/workflow-proposals/${id}/rehearse`, undefined, {
      example: { files: [{ name: "corte.json", content: JSON.stringify({ dias: 3 }) }] },
    });
    expect(h.state.status).toBe(200);
    expect(h.proposals.read(id)?.rehearsal?.status).toBe("passed");

    await h.call("POST", `/api/workflow-proposals/${id}/create`);
    expect(h.state.status).toBe(201);
    expect(h.workflows.workflows()).toHaveLength(1);
  });

  it("refuses a create whose rehearsal diverged, even when a reason is sent", async () => {
    const h = harness();
    await h.callInternal("POST", "/api/internal/workflows/proposals", body({ scripts: [{ name: "coletar.mjs", content: "console.log('nothing written')\n" }] }));
    const id = (h.state.body as { proposal: { id: string } }).proposal.id;
    await h.call("POST", `/api/workflow-proposals/${id}/confirm`, undefined, { interview: { recurring: true, changes: "Só as datas", confirmer: "Eu confirmo" } });
    await h.call("POST", `/api/workflow-proposals/${id}/rehearse`, undefined, {});
    expect(h.state.status).toBe(200);
    expect(h.proposals.read(id)?.rehearsal?.status).toBe("diverged");
    await h.call("POST", `/api/workflow-proposals/${id}/create`, undefined, { acknowledge: { reason: "o script ja roda no chat" } });
    expect(h.state.status).toBe(409);
    expect(h.state.body).toMatchObject({ code: "needsRehearsal", needsRehearsal: true });
    expect(h.workflows.workflows()).toHaveLength(0);
  });

  it("refuses a proposal the authoring contract rejects, before it becomes a draft", async () => {
    const h = harness();
    await h.callInternal("POST", "/api/internal/workflows/proposals", body({
      steps: [{ id: "coletar", kind: "script", name: "Coletar", run: "coletar.mjs", outputs: [{ path: "clip_*_9x16.mp4" }] }],
    }));
    expect(h.state.status).toBe(400);
    expect(String((h.state.body as { error: string }).error)).toContain("*");
    expect(h.proposals.list()).toHaveLength(0);
    expect(h.workflows.workflows()).toHaveLength(0);
  });

  it("refuses a step field the contract does not declare", async () => {
    const h = harness();
    await h.callInternal("POST", "/api/internal/workflows/proposals", body({
      steps: [{ id: "coletar", kind: "script", name: "Coletar", run: "coletar.mjs", outputs: [{ path: "dados.json" }], collectedBy: "coletar" }],
    }));
    expect(h.state.status).toBe(400);
    expect(String((h.state.body as { error: string }).error)).toContain("collectedBy");
    expect(h.proposals.list()).toHaveLength(0);
  });

  it("is not a Workflows route", async () => {
    const h = harness();
    const answer = await h.call("GET", "/api/workflows");
    expect(answer).toBe(PASS);
  });
});
