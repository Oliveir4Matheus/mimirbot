/** Workflow-from-conversation tools. Kept beside the catalog so the catalog stays a readable size. */
import { WORKFLOW_APPROVAL_NO_FALLBACK, WORKFLOW_APPROVAL_RULE } from "../../shared/workflow-approval.ts";

const STEP_INPUT = {
  type: "object",
  additionalProperties: false,
  properties: {
    as: { type: "string", minLength: 1, maxLength: 200, description: "The file name this step sees under input/." },
    from: {
      type: "object",
      additionalProperties: false,
      properties: {
        step: { type: "string", minLength: 1, maxLength: 64, description: "An earlier step id." },
        output: { type: "string", minLength: 1, maxLength: 200, description: "That step's declared output, exactly." },
      },
      required: ["step", "output"],
    },
  },
  required: ["as", "from"],
};

const STEP_OUTPUT = {
  type: "object",
  additionalProperties: false,
  properties: {
    path: {
      type: "string", minLength: 1, maxLength: 200,
      pattern: "^[^*]+\\.[A-Za-z0-9]{1,12}$",
      description: "Exact file name, never a glob. A .json a condition or a parameter reads needs a shape.",
    },
    required: { type: "boolean", description: "Defaults to true." },
    shape: { type: "object", additionalProperties: true, description: "JSON Schema of this file's content." },
  },
  required: ["path"],
};

const STEP = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string", minLength: 1, maxLength: 64, description: "Lowercase letters, digits and single hyphens." },
    kind: { type: "string", enum: ["bot", "script", "condition", "loop"] },
    name: { type: "string", minLength: 1, maxLength: 120 },
    inputs: { type: "array", maxItems: 50, items: STEP_INPUT, description: "Files from earlier steps. A step sees only what it declares here." },
    outputs: { type: "array", minItems: 1, maxItems: 50, items: STEP_OUTPUT },
    parameters: {
      type: "array", maxItems: 50,
      items: {
        type: "object", additionalProperties: false,
        properties: {
          name: { type: "string", minLength: 1, maxLength: 64, description: "Lowercase letters, digits and _." },
          type: { type: "string", enum: ["string", "number", "integer", "boolean", "date", "enum"] },
          required: { type: "boolean", description: "Defaults to true." },
          values: { type: "array", maxItems: 100, items: { type: "string" }, description: "The closed list an enum accepts." },
          whenAbsent: { type: "string", description: "An optional parameter names a rule: rule:<name>." },
          list: { type: "boolean", description: "True when params.json holds a list of scalars, never a list of objects." },
          from: {
            type: "object", additionalProperties: false,
            properties: {
              step: { type: "string", description: "An earlier step id." },
              output: { type: "string", description: "Its required .json output." },
              field: { type: "string", description: "Dotted path into that JSON, such as total or check.clips." },
            },
            required: ["step", "output", "field"],
            description: "Value = a field of an earlier step's .json output; that file then need not be an input here.",
          },
          collectedBy: { type: "string", description: "Id of the manual step that asks the person for this value." },
        },
        required: ["name", "type"],
      },
      description: "Without from or collectedBy, supplied when the run starts. Never require at the start a value an earlier step writes.",
    },
    onSuccess: { type: ["string", "null"], description: "Next step id; null ends the flow; omit for the next in order." },
    onFailure: { type: "string", description: "Step to continue at when this step fails." },
    onTimeout: { type: "string", description: "Step to continue at on timeout; needs timeoutMs." },
    mode: {
      type: "string", enum: ["auto", "manual"],
      description: "manual asks the person for a parameter whose collectedBy is this step, before it starts; not a pause, and the answer never arrives through the chat. Without such a parameter the step is refused.",
    },
    timeoutMs: { type: "integer", minimum: 0, maximum: 3600000, description: "Per step: 0 means no limit for a bot step." },
    botId: { type: "string", minLength: 1, maxLength: 200, description: "Bot steps only: a bot id from list_bots." },
    instructions: { type: "string", minLength: 1, maxLength: 12000, description: "Bot steps only: what the bot does, naming the exact output files." },
    skills: { type: "object", additionalProperties: true, description: "Bot steps only." },
    run: { type: "string", minLength: 1, maxLength: 67, description: "Script steps only: a flat .mjs file name listed in scripts." },
    modules: {
      type: "array", maxItems: 16,
      items: {
        type: ["string", "object"],
        minLength: 1, maxLength: 64,
        additionalProperties: false,
        properties: {
          name: { type: "string", minLength: 1, maxLength: 64 },
          runtime: { type: "string", enum: ["bin", "python", "node"], description: "bin checks PATH; python and node install in this installation's own environment." },
          version: { type: "string", minLength: 1, maxLength: 64, description: "Install exactly this version." },
        },
        description: "A string is a binary on PATH; an object names a package and its runtime.",
      },
      description: "Script steps only: a binary (ffmpeg), a package, or gpu. Checked before a run; only Prepare environment installs a package.",
    },
    from: {
      type: "object", additionalProperties: false,
      properties: {
        step: { type: "string", description: "An earlier step id." },
        output: { type: "string", description: "Its required .json output." },
      },
      required: ["step", "output"],
      description: "Condition and Do While steps only: the step and output they read.",
    },
    match: { type: "string", enum: ["all", "any"], description: "Condition and Do While steps only; defaults to all." },
    conditions: {
      type: "array", minItems: 1, maxItems: 20,
      items: {
        type: "object", additionalProperties: false,
        properties: {
          field: { type: "string", minLength: 1, maxLength: 200, description: "Dotted path into the .json read." },
          op: { type: "string", enum: ["equals", "not_equals", "exists", "contains", "gt", "gte", "lt", "lte"] },
          value: { description: "Compared as JSON; omit only for exists." },
        },
        required: ["field", "op"],
      },
      description: "Condition and Do While steps only.",
    },
    whenTrue: { type: ["string", "null"], description: "Condition steps only." },
    whenFalse: { type: ["string", "null"], description: "Condition steps only." },
    body: { type: "array", minItems: 1, maxItems: 20, description: "Do While steps only: one round's steps, with no nested Do While." },
    maxIterations: { type: "integer", minimum: 1, description: "Do While steps only; defaults to 1." },
  },
  required: ["id", "kind", "name", "outputs"],
};

const CANONICAL_EXAMPLE = JSON.stringify({
  steps: [
    {
      id: "pedir-link",
      kind: "bot",
      name: "Pedir o link",
      botId: "<a bot id from list_bots>",
      mode: "manual",
      instructions: "Ask the person for today's video link and write it to output/link.txt.",
      parameters: [{ name: "link", type: "string", collectedBy: "pedir-link" }],
      outputs: [{ path: "link.txt", required: true }],
    },
    {
      id: "baixar-transcrever",
      kind: "script",
      name: "Baixar e transcrever",
      run: "fetchshorts.mjs",
      timeoutMs: 1800000,
      modules: ["yt-dlp", "ffmpeg", { name: "faster-whisper", runtime: "python", version: "1.2.1" }, "gpu"],
      inputs: [{ as: "link.txt", from: { step: "pedir-link", output: "link.txt" } }],
      outputs: [{
        path: "transcript.json",
        required: true,
        shape: {
          type: "object",
          required: ["segments"],
          properties: {
            segments: {
              type: "array",
              items: {
                type: "object",
                required: ["start", "end", "text"],
                properties: { start: { type: "number" }, end: { type: "number" }, text: { type: "string" } },
              },
            },
          },
        },
      }],
    },
  ],
});

const REFUSAL = "When refused, the response is a WorkflowRefusal: it lists every problem with its path and the fix; correct all of them and propose again in the same turn.";

export const WORKFLOW_PROPOSAL_TOOL_DEFINITIONS = [
  {
    name: "propose_workflow",
    description:
      "Turn a conversation into a Workflow proposal. Call only when the person explicitly asks for a Workflow; a one-time task is not one. First ask the three interview questions one per turn: does it repeat, what changes each run, who confirms. The person confirms each answer on the card, so never call the interview agreed. A script is one flat .mjs file: it gets input/params.json and WORKFLOW_STEP_INPUT/WORKFLOW_STEP_OUTPUT, never arguments, and declares what it needs in modules. "
      + REFUSAL + " Inside a step, " + WORKFLOW_APPROVAL_RULE + ". In a step's instructions, " + WORKFLOW_APPROVAL_NO_FALLBACK + ". Unknown fields are refused, not ignored. Example, exactly: " + CANONICAL_EXAMPLE,
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
          items: STEP,
          description: "Steps in order. The first is a bot or script step in mode manual. A condition or Do While reads one earlier step's required .json output by from {step, output}.",
        },
        scripts: {
          type: "array", maxItems: 50,
          items: {
            type: "object", additionalProperties: false,
            properties: {
              name: { type: "string", minLength: 1, maxLength: 67, description: "Flat file name ending in .mjs." },
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
    description:
      "Create the Workflow the person approved: after they confirmed the three interview answers and chose Criar Workflow on the card, and its preview's rehearsal passed. Never call it before that, and never confirm the interview for the person. If it answers needsRehearsal, tell the person to run it and do not work around it. " + REFUSAL + " Returns the Workflow id; the first step stays manual.",
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
