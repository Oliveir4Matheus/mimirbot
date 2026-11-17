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
      description: "Exact file name with an extension, never a glob. A .json read by a condition needs a shape.",
    },
    required: { type: "boolean", description: "Defaults to true." },
    shape: { type: "object", additionalProperties: true, description: "JSON Schema (draft-07 or 2020-12) of this file's content." },
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
    inputs: { type: "array", maxItems: 50, items: STEP_INPUT, description: "Documents from earlier steps. A step sees only what it declares here." },
    outputs: { type: "array", minItems: 1, maxItems: 50, items: STEP_OUTPUT },
    parameters: {
      type: "array", maxItems: 50,
      items: {
        type: "object", additionalProperties: false,
        properties: {
          name: { type: "string", minLength: 1, maxLength: 64, description: "Lowercase letters, digits and _." },
          type: { type: "string", enum: ["string", "number", "integer", "boolean", "date", "enum"], description: "A list holds values of this type when list is true." },
          required: { type: "boolean", description: "Defaults to true." },
          values: { type: "array", maxItems: 100, items: { type: "string" }, description: "The closed list an enum accepts." },
          whenAbsent: { type: "string", description: "An optional parameter names a rule: rule:<name>." },
          list: { type: "boolean", description: "True when params.json holds a list of scalars of type, never a list of objects." },
          from: {
            type: "object", additionalProperties: false,
            properties: {
              step: { type: "string", description: "An earlier step id." },
              output: { type: "string", description: "Its required .json output, which carries a shape." },
              field: { type: "string", description: "Dotted path into that JSON, such as total or check.clips." },
            },
            required: ["step", "output", "field"],
            description: "The value is a field of an earlier step's JSON output. That document is then not also an input of this step.",
          },
          collectedBy: { type: "string", description: "The id of the manual step that asks the person for this value." },
        },
        required: ["name", "type"],
      },
      description: "A parameter without from or collectedBy is supplied when the run starts. Never require at the start a value that an earlier step writes.",
    },
    onSuccess: { type: ["string", "null"], description: "Next step id; null ends the flow; omit for the next step in order." },
    onFailure: { type: "string", description: "Step to continue at when this step fails." },
    onTimeout: { type: "string", description: "Step to continue at when this step times out; needs timeoutMs." },
    mode: { type: "string", enum: ["auto", "manual"], description: "manual collects one of this step's parameters from the person before the step starts; it is not a pause, and a manual step without such a parameter is refused." },
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
        description: "A string is a binary on PATH. An object names a package and its runtime.",
      },
      description: "Script steps only: a binary such as ffmpeg, a package such as {\"name\":\"faster-whisper\",\"runtime\":\"python\",\"version\":\"1.2.1\"}, or gpu. Checked before a run; only Prepare environment installs a package.",
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
          field: { type: "string", minLength: 1, maxLength: 200, description: "Dotted path into the .json read, such as total or check.ok." },
          op: { type: "string", enum: ["equals", "not_equals", "exists", "contains", "gt", "gte", "lt", "lte"] },
          value: { description: "Compared as JSON; leave it out only for exists." },
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
    {
      id: "escolher-trechos",
      kind: "bot",
      name: "Escolher trechos",
      botId: "<a bot id from list_bots>",
      instructions: "Leia input/transcript.json e escreva output/trechos.json with the chosen clips.",
      inputs: [{ as: "transcript.json", from: { step: "baixar-transcrever", output: "transcript.json" } }],
      outputs: [{ path: "trechos.json", required: true, shape: { type: "object", required: ["clips"], properties: { clips: { type: "array", items: { type: "string" } } } } }],
    },
  ],
});

export const WORKFLOW_PROPOSAL_TOOL_DEFINITIONS = [
  {
    name: "propose_workflow",
    description:
      "Turn a conversation into a Workflow proposal. Call only when the person explicitly asks for a Workflow; a one-time task is not a Workflow. First ask the three interview questions one per turn: does it repeat, what changes each run, and who confirms. Nothing you write in the interview is confirmed: the person confirms or corrects each answer on the proposal card, and only that confirmation lets the Workflow be created, so never say the interview is agreed. "
      + "Every output is a file whose name ends in an extension; the engine parses a .json only when a condition or a parameter from reads it, and that .json must declare a shape. A script is one flat .mjs file: it gets input/params.json and WORKFLOW_STEP_INPUT/WORKFLOW_STEP_OUTPUT, never arguments, and declares what it needs in modules. A document reaches a step only through inputs, from an earlier step's output. A parameter without an origin is supplied when the run starts; from extracts one field of an earlier .json output and collectedBy names the manual step that asks the person, so neither is ever required at the start. A manual step exists to receive a value from the person: it is not a pause, the answer never arrives through the chat, and a manual step without a parameter whose collectedBy is that step is refused. When the proposal is refused, the response is a WorkflowRefusal: it lists every problem with its path and the fix; correct all of them and propose again in the same turn. "
      + `Inside a step, ${WORKFLOW_APPROVAL_RULE}. In a step's instructions, ${WORKFLOW_APPROVAL_NO_FALLBACK}. `
      + `Unknown fields are refused, not ignored. Three linked steps, exactly: ${CANONICAL_EXAMPLE} `
      + "Nothing is created, listed or run until the person chooses Criar Workflow on the card; that choice opens the preview, which rehearses the scripts and carries the interview confirmation.",
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
          description: "The steps, in order. The first is a bot or script step in mode manual. A condition reads one earlier step's required .json output by from {step, output}; a Do While reads its body the same way.",
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
    description: "Create the Workflow the person approved by confirming the three interview answers and choosing Criar Workflow on the proposal card, then reviewing its preview. Never call it before that choice, and never confirm the interview for the person: without their confirmation the route refuses and says what is missing. Creation also requires a passing rehearsal, run by the person in the preview; if the route answers needsRehearsal, tell the person to run it and do not work around it. When the save refuses, the response is a WorkflowRefusal: it lists every problem with its path and the fix; correct all of them and propose again in the same turn. Returns the Workflow id; the first step stays manual.",
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
