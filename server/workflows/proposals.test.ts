import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { WORKFLOWS_ROOT_ENV } from "./paths.ts";
import { createWorkflowProposalStore } from "./proposals.ts";
import { createWorkflowStore } from "./store.ts";

const NOW = 1_700_000_000_000;
const id = "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "omb-proposals-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const input = (overrides: Record<string, unknown> = {}) => ({
  id,
  name: "Cobrança mensal",
  department: "Financeiro",
  createdAt: NOW,
  interview: { recurring: true, changes: "Só as datas", confirmer: "Eu confirmo" },
  summary: "Uma mensagem por cliente.",
  steps: [{
    id: "coletar",
    kind: "script",
    name: "Coletar",
    run: "coletar.mjs",
    outputs: [{ path: "dados.json" }],
    result: "dados.json",
  }],
  scripts: [{ name: "coletar.mjs", content: "console.log('ok')\n" }],
  ...overrides,
});

const harness = () => createWorkflowProposalStore({ dataDir: join(root, "data"), now: () => NOW, log: () => {} });

describe("workflow proposal store", () => {
  it("keeps a draft out of the Workflow store and out of the archived list", () => {
    const proposals = harness();
    const workflows = createWorkflowStore({ dataDir: join(root, "data"), env: { [WORKFLOWS_ROOT_ENV]: join(root, "runs") }, now: () => NOW, log: () => {} });
    const created = proposals.create(input(), { createdBy: { botId: "bot-a", threadId: "t-1" } });
    expect(created.ok).toBe(true);
    expect(proposals.list("draft")).toHaveLength(1);
    expect(proposals.list("archived")).toHaveLength(0);
    expect(workflows.workflows()).toHaveLength(0);
    expect(workflows.listRuns()).toHaveLength(0);
  });

  it("persists the draft with its scripts and reads it back after a restart", () => {
    const first = harness();
    expect(first.create(input()).ok).toBe(true);
    const raw = JSON.parse(readFileSync(first.file, "utf8")) as { proposals: Array<{ status: string; scripts: Array<{ name: string }> }> };
    expect(raw.proposals[0]).toMatchObject({ status: "draft" });
    expect(raw.proposals[0]!.scripts[0]).toMatchObject({ name: "coletar.mjs" });

    const second = harness();
    expect(second.read(id)).toMatchObject({ id, status: "draft", department: "Financeiro" });
  });

  it("archives, marks created and refuses to archive a created proposal", () => {
    const proposals = harness();
    expect(proposals.create(input()).ok).toBe(true);
    const archived = proposals.archive(id);
    expect(archived.ok && archived.proposal.status).toBe("archived");
    expect(proposals.list("archived")).toHaveLength(1);

    const created = proposals.markCreated(id, "11111111-1111-4111-8111-111111111111");
    expect(created.ok && created.proposal.status).toBe("created");
    expect(created.ok && created.proposal.createdWorkflowId).toBe("11111111-1111-4111-8111-111111111111");
    expect(proposals.archive(id).ok).toBe(false);
  });

  it("refuses a one-time task and a duplicate id", () => {
    const proposals = harness();
    expect(proposals.create(input({ interview: { recurring: false, changes: "", confirmer: "" } }))).toEqual({
      ok: false,
      error: "a one-time task is not a Workflow; finish the task instead of proposing one",
    });
    expect(proposals.create(input()).ok).toBe(true);
    expect(proposals.create(input()).ok).toBe(false);
  });

  it("adds assumptions for unanswered interview questions", () => {
    const proposals = harness();
    const created = proposals.create(input({ interview: { recurring: true, changes: "", confirmer: "não sei" } }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.proposal.assumptions).toHaveLength(2);
  });

  it("removes only a proposal that did not become a Workflow", () => {
    const proposals = harness();
    expect(proposals.create(input()).ok).toBe(true);
    expect(proposals.remove(id)).toBe(true);
    expect(proposals.read(id)).toBeUndefined();
  });
});
