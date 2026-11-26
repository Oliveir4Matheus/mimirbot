// Proposals live beside `workflows.json` but never inside it. A draft has no
// run, no routine and no entry in the Workflows list; only the person's yes
// moves the definition into the Workflow store.
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  proposalAssumptionsBase,
  proposalDefinition,
  workflowProposalAnswersSchema,
  workflowProposalInputSchema,
  workflowProposalSchema,
  evaluateProposal,
  startManualDefinition,
  type WorkflowProposal,
  type WorkflowProposalStatus,
} from "../../shared/workflow-proposal.ts";
import { validateWorkflowAuthoring } from "../../shared/workflow-authoring.ts";
import { authoringRefusal, type WorkflowRefusal } from "../../shared/workflow-refusal.ts";
import { writeFileAtomic } from "../atomic.ts";
import { compileToolSchema } from "../mcp-schema-validator.ts";
import { workflowApprovalHash } from "./approval.ts";

export type ProposalSave =
  | { ok: true; proposal: WorkflowProposal }
  | { ok: false; error: string; refusal?: WorkflowRefusal };

export interface WorkflowProposalStoreOptions {
  dataDir: string;
  now?: () => number;
  log?: (line: string) => void;
}

export interface WorkflowProposalStore {
  readonly file: string;
  list(status?: WorkflowProposalStatus): WorkflowProposal[];
  read(id: string): WorkflowProposal | undefined;
  create(input: unknown, options?: { createdBy?: WorkflowProposal["createdBy"] }): ProposalSave;
  /** Writes the person's answers and stamps the confirmation; only a person's route calls this. */
  confirm(id: string, answers: unknown, by?: string): ProposalSave;
  archive(id: string): ProposalSave;
  markCreated(id: string, workflowId: string): ProposalSave;
  recordRehearsal(id: string, rehearsal: WorkflowProposal["rehearsal"]): ProposalSave;
  annotate(id: string, annotations: Record<string, string>): ProposalSave;
  bumpRounds(id: string): ProposalSave;
  remove(id: string): boolean;
}

const reason = (error: unknown): string => error instanceof SyntaxError ? "invalid JSON" : error instanceof Error ? error.message : String(error);

export function createWorkflowProposalStore(options: WorkflowProposalStoreOptions): WorkflowProposalStore {
  const file = join(options.dataDir, "workflow-proposals.json");
  const now = options.now ?? Date.now;
  const log = options.log ?? ((line: string) => console.warn(line));
  let proposals: WorkflowProposal[] = [];

  try {
    const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new Error("invalid proposals file");
    const list = (raw as { proposals?: unknown }).proposals;
    if (!Array.isArray(list)) throw new Error("invalid proposals file: proposals is not a list");
    for (const entry of list) {
      const parsed = workflowProposalSchema.safeParse(entry);
      if (parsed.success) proposals.push(parsed.data);
      else log(`workflows: ignoring an invalid proposal in ${file}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") log(`workflows: ignoring unreadable ${file}: ${reason(error)}`);
  }

  const persist = (): void => {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    writeFileAtomic(file, JSON.stringify({ version: 1, proposals }, null, 2), { mode: 0o600 });
  };

  const store: WorkflowProposalStore = {
    file,
    list(status) {
      return [...proposals]
        .filter((proposal) => status === undefined || proposal.status === status)
        .sort((left, right) => right.updatedAt - left.updatedAt || (left.id < right.id ? 1 : -1));
    },
    read(id) {
      const normalized = id.trim().toLowerCase();
      return proposals.find((proposal) => proposal.id === normalized);
    },
    create(input, createOptions) {
      const parsedInput = workflowProposalInputSchema.safeParse(input);
      if (!parsedInput.success) {
        const issues = parsedInput.error.issues.map((issue) => ({ path: issue.path.join(".") || "proposal", message: issue.message }));
        const refusal = authoringRefusal(issues);
        return { ok: false, error: refusal.error, refusal };
      }
      const evaluation = evaluateProposal(parsedInput.data.interview, parsedInput.data.assumptions);
      if (!evaluation.ok) return evaluation;
      const stamp = now();
      const id = parsedInput.data.id ?? randomUUID();
      const built = proposalDefinition(parsedInput.data, id, parsedInput.data.createdAt ?? stamp);
      if (!built.ok) {
        const refusal = authoringRefusal([{ path: "steps", message: built.error }]);
        return { ok: false, error: refusal.error, refusal };
      }
      const authoring = validateWorkflowAuthoring(built.definition, "save", {
        compileShape: (shape) => { compileToolSchema(shape); },
        scripts: parsedInput.data.scripts ?? [],
      });
      if (authoring.errors.length > 0) {
        const refusal = authoringRefusal(authoring.errors, authoring.warnings);
        return { ok: false, error: refusal.error, refusal };
      }
      const first = built.definition.steps[0];
      if (!first || (first.kind !== "bot" && first.kind !== "script")) {
        return { ok: false, error: "a proposal must start with a bot or script step; a condition or Do While needs an entry step" };
      }
      if (store.read(id)) {
        return { ok: false, error: "a proposal with that id already exists" };
      }
      const createdBy = createOptions?.createdBy ?? parsedInput.data.createdBy;
      const proposal: WorkflowProposal = {
        id,
        department: parsedInput.data.department,
        status: "draft",
        createdAt: stamp,
        updatedAt: stamp,
        ...(createdBy ? { createdBy } : {}),
        interview: parsedInput.data.interview,
        summary: parsedInput.data.summary,
        assumptions: evaluation.assumptions,
        annotations: {},
        rounds: 0,
        definition: built.definition,
        scripts: parsedInput.data.scripts ?? [],
      };
      proposals.push(proposal);
      try {
        persist();
      } catch (error) {
        proposals.pop();
        return { ok: false, error: `could not save ${file}: ${reason(error)}` };
      }
      return { ok: true, proposal };
    },
    confirm(id, answers, by = "user") {
      const index = proposals.findIndex((proposal) => proposal.id === id.trim().toLowerCase());
      const current = proposals[index];
      if (!current) return { ok: false, error: "no such proposal" };
      if (current.status === "created") return { ok: false, error: "this proposal became a Workflow" };
      const parsedAnswers = workflowProposalAnswersSchema.safeParse(answers);
      if (!parsedAnswers.success) {
        return { ok: false, error: parsedAnswers.error.issues.map((issue) => `${issue.path.join(".") || "interview"}: ${issue.message}`).join("; ") };
      }
      const evaluation = evaluateProposal(parsedAnswers.data, proposalAssumptionsBase(current.assumptions));
      if (!evaluation.ok) return evaluation;
      const stamp = now();
      let approvalHash: string;
      try {
        approvalHash = workflowApprovalHash(startManualDefinition(current.definition), current.scripts, parsedAnswers.data);
      } catch (error) {
        return { ok: false, error: reason(error) };
      }
      const next: WorkflowProposal = {
        ...current,
        interview: { ...parsedAnswers.data, confirmedAt: stamp, confirmedBy: by },
        assumptions: evaluation.assumptions,
        approvalHash,
        updatedAt: stamp,
      };
      proposals[index] = next;
      try {
        persist();
      } catch (error) {
        proposals[index] = current;
        return { ok: false, error: `could not save ${file}: ${reason(error)}` };
      }
      return { ok: true, proposal: next };
    },
    archive(id) {
      const index = proposals.findIndex((proposal) => proposal.id === id.trim().toLowerCase());
      const current = proposals[index];
      if (!current) return { ok: false, error: "no such proposal" };
      if (current.status === "created") return { ok: false, error: "this proposal became a Workflow" };
      const archived: WorkflowProposal = { ...current, status: "archived", updatedAt: now() };
      proposals[index] = archived;
      try {
        persist();
      } catch (error) {
        proposals[index] = current;
        return { ok: false, error: `could not save ${file}: ${reason(error)}` };
      }
      return { ok: true, proposal: archived };
    },
    markCreated(id, workflowId) {
      const index = proposals.findIndex((proposal) => proposal.id === id.trim().toLowerCase());
      const current = proposals[index];
      if (!current) return { ok: false, error: "no such proposal" };
      if (current.status === "created") return { ok: true, proposal: current };
      const created: WorkflowProposal = { ...current, status: "created", createdWorkflowId: workflowId, updatedAt: now() };
      proposals[index] = created;
      try {
        persist();
      } catch (error) {
        proposals[index] = current;
        return { ok: false, error: `could not save ${file}: ${reason(error)}` };
      }
      return { ok: true, proposal: created };
    },
    recordRehearsal(id, rehearsal) {
      const index = proposals.findIndex((proposal) => proposal.id === id.trim().toLowerCase());
      const current = proposals[index];
      if (!current) return { ok: false, error: "no such proposal" };
      const next: WorkflowProposal = { ...current, rehearsal, updatedAt: now() };
      proposals[index] = next;
      try {
        persist();
      } catch (error) {
        proposals[index] = current;
        return { ok: false, error: `could not save ${file}: ${reason(error)}` };
      }
      return { ok: true, proposal: next };
    },
    annotate(id, annotations) {
      const index = proposals.findIndex((proposal) => proposal.id === id.trim().toLowerCase());
      const current = proposals[index];
      if (!current) return { ok: false, error: "no such proposal" };
      const next: WorkflowProposal = { ...current, annotations, updatedAt: now() };
      proposals[index] = next;
      try {
        persist();
      } catch (error) {
        proposals[index] = current;
        return { ok: false, error: `could not save ${file}: ${reason(error)}` };
      }
      return { ok: true, proposal: next };
    },
    bumpRounds(id) {
      const index = proposals.findIndex((proposal) => proposal.id === id.trim().toLowerCase());
      const current = proposals[index];
      if (!current) return { ok: false, error: "no such proposal" };
      const next: WorkflowProposal = { ...current, rounds: current.rounds + 1, updatedAt: now() };
      proposals[index] = next;
      try {
        persist();
      } catch (error) {
        proposals[index] = current;
        return { ok: false, error: `could not save ${file}: ${reason(error)}` };
      }
      return { ok: true, proposal: next };
    },
    remove(id) {
      const index = proposals.findIndex((proposal) => proposal.id === id.trim().toLowerCase());
      const current = proposals[index];
      if (!current) return false;
      proposals.splice(index, 1);
      try {
        persist();
      } catch (error) {
        proposals.splice(index, 0, current);
        log(`workflows: could not remove proposal ${id}: ${reason(error)}`);
        return false;
      }
      return true;
    },
  };
  return store;
}

/** The definition the person approved: the same bytes, with the execution gate applied. */
export function approvedProposalDefinition(proposal: WorkflowProposal): ReturnType<typeof startManualDefinition> {
  return startManualDefinition(proposal.definition);
}
