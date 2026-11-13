import { describe, expect, it } from "vitest";

import { callTool, type ToolCallContext } from "./agents-call.ts";

type Reply = { ok: boolean; status: number; body: Record<string, unknown> };

function context(reply: Reply | ((path: string, init?: RequestInit) => Reply), overrides: Partial<ToolCallContext> = {}): ToolCallContext {
  const answer = (path: string, init?: RequestInit) => typeof reply === "function" ? reply(path, init) : reply;
  return {
    botId: "bot-a",
    threadId: "t-1",
    depth: 0,
    externalRuntime: false,
    sharedComputers: false,
    client: {
      api: async (path, init) => answer(path, init).body,
      apiResponse: async (path, init) => answer(path, init),
    },
    ...overrides,
  };
}

const proposal = {
  id: "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
  definition: { name: "Cobrança mensal" },
};

describe("propose_workflow", () => {
  it("saves a draft, maps the tool arguments and tells the bot to wait for the card", async () => {
    const calls: Array<{ path: string; init?: RequestInit }> = [];
    const result = await callTool("propose_workflow", {
      name: "Cobrança mensal",
      interview: { recurring: true, changes: "Só as datas", confirmer: "Eu" },
      summary: "Uma mensagem por cliente.",
      assumptions: ["A planilha mantém o nome", 3],
      steps: [{ id: "coletar", kind: "script", name: "Coletar", run: "coletar.mjs", outputs: [{ path: "dados.json" }] }],
      scripts: [{ name: "coletar.mjs", content: "console.log('ok')\n" }],
      retention_days: 30,
    }, context((path, init) => {
      calls.push({ path, init });
      return { ok: true, status: 201, body: { proposal } };
    }));
    expect(result.isError).toBeFalsy();
    expect(result.text).toContain("Proposal saved as a draft");
    expect(result.text).toContain(proposal.id);
    expect(result.text).toContain("Nothing was created");
    expect(calls[0]!.path).toBe("/api/internal/workflows/proposals");
    const sent = JSON.parse(String(calls[0]!.init?.body)) as Record<string, unknown>;
    expect(sent).toMatchObject({
      name: "Cobrança mensal",
      retentionDays: 30,
      interview: { recurring: true, changes: "Só as datas", confirmer: "Eu" },
      assumptions: ["A planilha mantém o nome"],
    });
    expect(sent.scripts).toHaveLength(1);
  });

  it("refuses a one-time task before calling the server", async () => {
    const result = await callTool("propose_workflow", {
      name: "Enviar uma vez",
      interview: { recurring: false },
      steps: [{ id: "a", kind: "bot", name: "A", botId: "bot-a", instructions: "Do it.", outputs: [{ path: "x" }] }],
    }, context({ ok: true, status: 201, body: { proposal } }));
    expect(result.isError).toBe(true);
    expect(result.text).toContain("one-time task is not a Workflow");
  });

  it("surfaces the server's validation error", async () => {
    const result = await callTool("propose_workflow", {
      name: "Sem prova",
      interview: { recurring: true },
      steps: [{ id: "a", kind: "bot", name: "A", botId: "bot-a", instructions: "Do it.", outputs: [] }],
    }, context({ ok: false, status: 400, body: { error: "steps.0.outputs: too small" } }));
    expect(result.isError).toBe(true);
    expect(result.text).toBe("steps.0.outputs: too small");
  });
});

describe("create_workflow_from_proposal", () => {
  it("creates through the internal route and reports the manual first step", async () => {
    const result = await callTool("create_workflow_from_proposal", { proposal_id: proposal.id }, context({
      ok: true, status: 201, body: { workflowId: proposal.id, version: 1 },
    }));
    expect(result.isError).toBeFalsy();
    expect(result.text).toContain("Workflow created");
    expect(result.text).toContain(proposal.id);
    expect(result.text).toContain("first step is manual");
  });

  it("requires a proposal id", async () => {
    const result = await callTool("create_workflow_from_proposal", {}, context({ ok: true, status: 201, body: {} }));
    expect(result.isError).toBe(true);
    expect(result.text).toContain("needs proposal_id");
  });
});

describe("archive_workflow_proposal", () => {
  it("archives under Propostas", async () => {
    const result = await callTool("archive_workflow_proposal", { proposal_id: proposal.id }, context({
      ok: true, status: 200, body: { proposal: { ...proposal, status: "archived" } },
    }));
    expect(result.isError).toBeFalsy();
    expect(result.text).toContain("Workflows → Propostas");
  });

  it("maps a missing proposal to a useful error", async () => {
    const result = await callTool("archive_workflow_proposal", { proposal_id: proposal.id }, context({ ok: false, status: 404, body: { error: "no such proposal" } }));
    expect(result.isError).toBe(true);
    expect(result.text).toContain("No proposal with that id");
  });
});
