# Workflow trigger (routine → Workflow)

Checks that a routine whose target is a Workflow starts a run at its scheduled
time, that the run records the trigger as its origin, and that the routine run
mirrors the Workflow's final state. It runs the real server and the fake Claude
engine in a disposable fixture; it never touches the installed app or its data.

`control-omb` has no Workflow verbs, so this recipe creates the definition and
the routine through the HTTP routes. Keep the printed fixture log and the run
JSON as evidence.

## Launch

```sh
cat > /tmp/omb-trigger-tools.json <<'JSON'
[{"name":"Bash","input":{"command":"printf '{\"ok\":true}' > output/result.json"},"ok":true}]
JSON

FAKE_CLAUDE_TOOL_CALLS_FILE=/tmp/omb-trigger-tools.json \
FAKE_CLAUDE_EXIT_AFTER_TURN=1 FAKE_CLAUDE_RUN_BASH=1 \
node --experimental-strip-types scripts/control-omb.ts launch
```

The fixture's `PATH` holds only `node`, so the step writes its output with the
shell's builtin `printf`.

## Drive

Use the URL and bot id the fixture prints.

1. `POST /api/workflows` with an `id` (a fresh UUID), `name`, `department` and
   one step: `outputs: [{path: "result.json", required: true}]`,
   `result: "result.json"`, `require: {ok: true}`. The route does not mint the
   id.
2. `POST /api/routines` with `target: "workflow"`, `workflowId` from step 1,
   the same `botId`, an empty `prompt`, and any schedule.
3. `POST /api/routines/<routineId>/run`.
4. Poll `GET /api/routines` until the run has `workflowRunId`, then
   `GET /api/workflows/runs/<workflowRunId>` until it is terminal.
5. Expect:
   - the routine run has `target: "workflow"`, the chosen `workflowId` and a
     `workflowRunId`;
   - the Workflow run has `triggeredBy: {routineId, routineName}`;
   - the Workflow run is `succeeded`, `steps[0].verified` is
     `["result.json"]` and `result` is `{ok: true}`;
   - the routine run ends `completed` with the same `workflowRunId`.
6. `DELETE /api/workflows/<workflowId>` once the run is terminal, then read the
   run again: it keeps `snapshot.name` and `snapshot.steps` so the history stays
   readable without the definition.

## What it does not prove

- Cancelling a routine run and a routine timeout cancelling the Workflow run
  are covered by `server/routines.test.ts`; this recipe only exercises the
  happy path.
- Nothing here proves a real provider, a real approval card or a Cloud home.
  Only the trigger's contract with the Workflow engine.
