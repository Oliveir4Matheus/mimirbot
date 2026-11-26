# The Workflow authoring contract, end to end

Checks that the contract the engine relies on reaches the author and is refused
at the right moment: the extension in every output name, `shape` on a `.json`
a condition reads, `condition.from` as a step and output pair, `.mjs` as the
only script runtime, `modules` checked before a run and before a rehearsal, and
a create gate that requires a passing rehearsal. A rehearsal that did not run or
diverged refuses the create with `needsRehearsal`; there is no reason to write.
It uses the isolated launcher and the fake Claude engine; it never touches the
installed app or its data.

`control-omb` has no Workflow verbs, so the fake engine is scripted to call the
`agents` tools and the routes are driven directly for the save cases.

## Launch

```sh
mkdir -p /tmp/opencode/wf-authoring/{tools,evidence}
cat > /tmp/opencode/wf-authoring/tools/propose.json <<'JSON'
[{"server":"agents","name":"propose_workflow","input":{
  "name":"Resumo diário",
  "interview":{"recurring":true,"changes":"Nada","confirmer":"Eu"},
  "steps":[{"id":"resumir","kind":"script","name":"Resumir","run":"resumir.mjs",
    "modules":["node"],"outputs":[{"path":"resumo.txt"}]}],
  "scripts":[{"name":"resumir.mjs","content":"import { writeFileSync } from \"node:fs\";\nwriteFileSync(process.env.WORKFLOW_STEP_OUTPUT + \"/resumo.txt\", \"tudo certo\\n\");\n"}]
}}]
JSON
FAKE_CLAUDE_TOOL_CALLS_FILE=/tmp/opencode/wf-authoring/tools/propose.json \
FAKE_CLAUDE_EXIT_AFTER_TURN=1 \
node --experimental-strip-types scripts/control-omb.ts launch
```

## Drive

Use the printed URL and data directory.

1. `pnpm control:omb new-bot --name "Bot Cortes" --url <url>`, then
   `pnpm control:omb send --bot <botId> --text "Transforme isso em um Workflow."`
2. `<dataDir>/workflow-proposals.json` has one draft whose `rehearsal.status` is
   `passed`: `propose_workflow` rehearsed the script as it proposed, and the
   script wrote the file it declared. `workflows.json` does not exist yet.
3. `POST /api/workflow-proposals/<id>/create` with `{}` answers 201 and writes
   the Workflow; `steps[0].mode` is `manual`.
4. A proposal whose script reads a file from a bot step rehearses as
   `untested` (the bot step does not run), and a proposal with a missing
   `modules` entry rehearses as `diverged` with
   `not available on this machine: <name>; install it before rehearsing`.
5. With `rehearsal.status` equal to `untested` or `diverged`,
   `POST /api/workflow-proposals/<id>/create` answers 409
   `needsRehearsal: true`, and it still answers 409 when the body carries
   `{"acknowledge":{"reason":"..."}}`: there is no acknowledgement path. Run
   the rehearsal through `POST /api/workflow-proposals/<id>/rehearse` until it
   passes, then create.

## Save cases

Each `POST /api/workflows` below answers 400 with the message shown, and no
Workflow is written:

| Body | Message |
|---|---|
| `run: "v.js"` or `run: "v.py"` | `steps.0.run: must be a flat .mjs file name` |
| output `"link"` | `output "link" needs a file extension, such as link.txt or link.json` |
| output `"clip1_*_9x16.mp4"` | `output "clip1_*_9x16.mp4" cannot hold *; the engine looks for the exact name...` |
| output `d.json` with `shape: {type: "no-such"}` | `the shape of "d.json" does not compile` |
| a step with `when` | `when is gone; a step does not decide where the run goes. Replace it with a condition step after this one` |
| a step with `require` | `require is gone; the engine checks the shape of a file, not its opinion...` |
| `mode: "manual"` with no parameter collected by that step | `steps.N.mode: step "..." must declare a parameter with collectedBy "..."` |

Every refusal is a `WorkflowRefusal`: `{ code: "authoringErrors", error, authoring: { errors: [{ path, message }], warnings, truncated? } }`.
The route keeps every issue up to 50; the rest are counted in `truncated` and in
`error`, so the bot can correct all of them and propose again in the same turn.
A create that lacks the interview confirmation answers `code:
"needsConfirmation"`, and one whose rehearsal did not pass answers `code:
"needsRehearsal"`; both carry no `authoring` list.

A step that still carries `result` saves with a warning instead:
`result no longer declares what a condition reads; the condition now names the
step and the output with from`.

## What it does not prove

- The read path: a `workflows.json` written before `result` left the contract
  still loads, and a condition's `id` becomes `{step, output}`. That is covered
  by `server/workflows/store.test.ts`; a fixture would need the file written
  before the server starts.
- The engine's own checks (a shape mismatch failing a step, a condition reading
  its pair) are covered by `server/workflows/engine.test.ts`,
  `server/workflows/files.test.ts` and `server/workflows/loop.test.ts`.
- The Studio's shape editor and the Preview dialog were checked by hand; the
  renderer harness cannot drive them.
