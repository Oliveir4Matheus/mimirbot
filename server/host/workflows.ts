// The Workflow composition root: one store, one engine, and the two route
// tables (the person's and a bot's). server/index.ts passes startTurn and the
// thread creator in; nothing here imports index.ts.
import { createWorkflowEngine, type WorkflowEngine, type WorkflowTurnOptions } from "../workflows/engine.ts";
import { pruneWorkflowRuns, type RetentionResult } from "../workflows/retention.ts";
import { createWorkflowStore } from "../workflows/store.ts";
import { createWorkflowProposalStore } from "../workflows/proposals.ts";
import { createWorkflowRoutes, createWorkflowInternalRoutes } from "../routes/workflows.ts";
import { createWorkflowProposalInternalRoutes, createWorkflowProposalRoutes } from "../routes/workflow-proposals.ts";
import type { WorkflowProposal } from "../../shared/workflow-proposal.ts";
import type { WorkflowRun, WorkflowSkillOptions, WorkflowStepSkills } from "../../shared/workflow.ts";

export interface WorkflowHostDeps {
  dataDir: string;
  home?: string;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  log?: (line: string) => void;
  /** Creates a thread with cwd = step-N and returns its id, or null when the bot is gone. */
  createTask(botId: string, title: string, cwd: string): string | null;
  bot(id: string): { id: string; name: string; section?: string } | undefined;
  startTurn(botId: string, text: string, options: WorkflowTurnOptions): Promise<unknown>;
  broadcast(frame: Record<string, unknown>): void;
  interrupt?(botId: string, threadId: string): void;
  /** Cards still waiting on a person in a step's conversation. */
  openCards?(threadId: string): Array<{ id: string; question: string }>;
  /** Every persisted transition, so a routine trigger can mirror the run's state. */
  onRun?(run: WorkflowRun): void;
  skillOptions?(botId: string): WorkflowSkillOptions | undefined;
  /** Appends the chat card for a draft the bot just made. */
  proposalCard?(proposal: WorkflowProposal, botId: string, threadId: string): void;
}

export function createWorkflowHost(deps: WorkflowHostDeps) {
  const store = createWorkflowStore({
    dataDir: deps.dataDir,
    home: deps.home,
    env: deps.env,
    now: deps.now,
    log: deps.log,
  });
  const proposals = createWorkflowProposalStore({
    dataDir: deps.dataDir,
    now: deps.now,
    log: deps.log,
  });
  const missingSkills = (botId: string, skills: WorkflowStepSkills | undefined): readonly string[] => {
    if (!skills) return [];
    const options = deps.skillOptions?.(botId);
    const declared = [...(skills.bot ?? []), ...(skills.bundled ?? []), ...(skills.imported ?? [])];
    if (!options) return declared;
    const available = (group: WorkflowSkillOptions["bot"]): Set<string> =>
      new Set(group.filter((option) => option.available).map((option) => option.name));
    const bot = available(options.bot);
    const bundled = available(options.bundled);
    const imported = available(options.imported);
    return [
      ...(skills.bot ?? []).filter((name) => !bot.has(name)),
      ...(skills.bundled ?? []).filter((name) => !bundled.has(name)),
      ...(skills.imported ?? []).filter((name) => !imported.has(name)),
    ];
  };
  const engine: WorkflowEngine = createWorkflowEngine({
    store,
    startTurn: deps.startTurn,
    createThread: (input) => deps.createTask(input.botId, input.title, input.cwd),
    broadcast: deps.broadcast,
    interrupt: deps.interrupt,
    openCards: deps.openCards,
    onRun: deps.onRun,
    missingSkills,
    now: deps.now,
    log: deps.log,
  });
  const routes = createWorkflowRoutes({ store, engine, bot: deps.bot, skillOptions: deps.skillOptions });
  const internal = createWorkflowInternalRoutes({ store, engine, bot: deps.bot });
  const proposalDeps = { proposals, workflows: store, ...(deps.proposalCard ? { card: deps.proposalCard } : {}) };
  const proposalRoutes = createWorkflowProposalRoutes(proposalDeps);
  const proposalInternal = createWorkflowProposalInternalRoutes(proposalDeps);
  return {
    store,
    proposals,
    engine,
    routes,
    proposalRoutes,
    internal,
    proposalInternal,
    missingSkills,
    retention: (): RetentionResult => pruneWorkflowRuns({ store, now: deps.now, log: deps.log }),
  };
}
