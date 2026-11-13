/** Workflow-from-conversation tools. Kept beside the catalog so the catalog stays a readable size. */
export const WORKFLOW_PROPOSAL_TOOL_DEFINITIONS = [
  {
    name: "propose_workflow",
    description:
      "Turn a conversation into a Workflow proposal. Call only when the person explicitly asks for a Workflow; a one-time task is not a Workflow. First ask the three interview questions one per turn: does it repeat, what changes each run, and who confirms. Then describe each step with its files, result and proof. Nothing is created, listed or run until the person chooses Criar Workflow on the card.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string", minLength: 1, maxLength: 80, description: "Short Workflow name." },
        retention_days: { type: "integer", minimum: 1, maximum: 3650, description: "How long runs are kept; omit for the default." },
        interview: {
          type: "object",
          additionalProperties: false,
          properties: {
            recurring: { type: "boolean", description: "True when the work repeats; false ends the proposal." },
            changes: { type: "string", maxLength: 2000, description: "What changes between runs, or não sei." },
            confirmer: { type: "string", maxLength: 2000, description: "Who answers missing information and who approves an irreversible effect, or não sei." },
          },
          required: ["recurring"],
        },
        summary: { type: "string", maxLength: 4000, description: "What the Workflow does, in the person's words." },
        assumptions: {
          type: "array", maxItems: 30,
          items: { type: "string", minLength: 1, maxLength: 500 },
          description: "What you assumed because the conversation did not say; the preview shows each one in amber.",
        },
        steps: {
          type: "array", minItems: 1, maxItems: 40,
          items: {
            type: "object", additionalProperties: true,
            properties: {
              parameters: {
                type: "array",
                items: { type: "object", additionalProperties: true },
                description: "Values the run must supply: {name, type: string|number|integer|boolean|date|enum, required, values? for enum, whenAbsent? as rule:<name> when optional}.",
              },
            },
          },
          description: "The workflow steps, each with id, kind, name, inputs, parameters, outputs, result and either botId/instructions or run. The first step must be a bot or script step in mode manual.",
        },
        scripts: {
          type: "array", maxItems: 50,
          items: {
            type: "object", additionalProperties: false,
            properties: {
              name: { type: "string", minLength: 1, maxLength: 67, description: "Flat file name ending in .mjs, .js, .ts or .py." },
              content: { type: "string", minLength: 1, description: "The script text." },
            },
            required: ["name", "content"],
          },
          description: "Script files the steps name, kept with the proposal.",
        },
      },
      required: ["name", "interview", "steps"],
    },
  },
  {
    name: "create_workflow_from_proposal",
    description: "Create the Workflow the person approved by choosing Criar Workflow on a proposal card. Never call it before that choice. Returns the Workflow id; the first step stays manual.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        proposal_id: { type: "string", minLength: 1, maxLength: 64, description: "The proposal id shown on the card." },
      },
      required: ["proposal_id"],
    },
  },
  {
    name: "archive_workflow_proposal",
    description: "File a Workflow proposal under Propostas when the person says Agora não. It stays recoverable and is never created.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        proposal_id: { type: "string", minLength: 1, maxLength: 64, description: "The proposal id shown on the card." },
      },
      required: ["proposal_id"],
    },
  },
];
