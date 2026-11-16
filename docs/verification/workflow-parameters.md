# Workflow parameters with an origin, end to end

Checks that a value born during a run never has to be supplied at the start: a
manual step collects it and stores it on the run before the step executes, and
a later step extracts one field of an earlier step's JSON output into its own
`input/params.json` without also receiving the document. It also checks that a
routine can target a Workflow that already exists and that its run stops in
`waiting_manual`. It runs the real server, the real script runner and the fake
Claude engine in a disposable fixture; it never touches the installed app or
its data.

## Launch

```sh
mkdir -p /tmp/opencode/wf-params/{tools,evidence}
cat > /tmp/opencode/wf-params/tools/link.json <<'JSON'
[{"name":"Bash","input":{"command":"printf 'https://www.youtube.com/watch?v=MsBw25KFZMI' > output/link.txt"},"ok":true}]
JSON

FAKE_CLAUDE_TOOL_CALLS_FILE=/tmp/opencode/wf-params/tools/link.json \
FAKE_CLAUDE_EXIT_AFTER_TURN=1 FAKE_CLAUDE_RUN_BASH=1 \
node --experimental-strip-types scripts/control-omb.ts launch
```

## Drive

Use the printed URL, data directory and bot id.

1. `POST /api/workflows` with a fresh UUID and three steps:
   - `pedir-link`, a bot step in `mode: "manual"`, one output `link.txt`, and
     one parameter `{ "name": "link", "type": "string", "collectedBy": "pedir-link" }`;
   - `escolher`, a script step that writes `trechos.json` with a `shape`
     declaring `total` as `integer` and `clips` as a list of strings;
   - `renderizar`, a script step with `inputs: []` and one parameter
     `{ "name": "total", "type": "integer", "from": { "step": "escolher", "output": "trechos.json", "field": "total" } }`.
   Send both scripts in the same body (`scripts: [{name, content}]`); each
   reads `WORKFLOW_STEP_INPUT`/`WORKFLOW_STEP_OUTPUT`, and `renderizar` reads
   `input/params.json`.
2. The save answers 200. The same body with `instructions` on the script step
   answers 400 naming `steps.0.instructions`; a `from` parameter declared as
   `string` over an `integer` field answers 400 with
   `declares integer, not string`.
3. `POST /api/workflows/<id>/run` with `{"inputs":{"total":2}}` answers 400
   `needs_input` with `unknown: ["total"]` and `allowed: []`: a value with an
   origin is never supplied at the start.
4. `POST /api/routines` with `target: "workflow"`, the Workflow id, an empty
   `prompt` and a daily schedule answers 201. The same body naming an id that
   does not exist is refused and writes no routine.
5. `POST /api/routines/<routineId>/run` starts the routine run; poll
   `GET /api/workflows/runs/<workflowRunId>` until it is `waiting_manual`. The
   Workflow run carries `triggeredBy: {routineId, routineName}`.
6. `POST /api/workflows/runs/<runId>/continue` with `{}` answers 400
   `missing: [{step: "Pedir o link", name: "link"}]`; with
   `{"inputs":{"link":7}}` it answers 400 `invalid ... must be text`; with
   `{"inputs":{"link":"https://..."}}` it answers 200 and the run finishes
   `succeeded` with `inputs: {link: "https://..."}`.
7. Read the run folder under
   `<dataDir>/MimirBot/<department>/workflows/<id>/runs/<runId>/`:
   - `step-1/input/params.json` holds `{"link": "https://..."}` before the
     turn, written from the continued answers;
   - `step-3/input/` holds only `params.json` with `{"total": 2}`: the source
     document `trechos.json` was not copied, because that value travels as a
     parameter;
   - `step-3/output/clip1.txt` holds `total=2`, and all three steps show their
     verified outputs.
8. The fake engine's prompt dump holds `COLLECT link:string` and the collecting
   rule only in the collecting step's brief; the other two briefs carry no
   request to ask a person.

## What it does not prove

- The Run dialog and the Run detail form are renderer surfaces the harness
  cannot drive; their field selection and payload are covered by
  `src/lib/workflow-inputs.test.ts` and
  `src/components/workflows/RunDialog.test.ts`, and the route's refusal by
  `server/routes/workflows.test.ts`.
- The bot's own `trigger` tool path (target `workflow` through
  `/api/internal/trigger-requests`) is covered by
  `server/drivers/agents-call-triggers.test.ts` and
  `server/routine-requests.test.ts`; this recipe uses the person's routes.
- What the scheduler does with an earlier paused run of the same Workflow is
  deliberately undecided; this recipe only checks that the decision point
  exists and does nothing yet.
