# Workflow long approval (P16)

Checks that a Workflow step which ends its turn on an open card parks the run
as `waiting_approval`, and that answering the card resumes the same step until
its outputs verify. It runs the real server and the fake Claude engine in a
disposable fixture; it never touches the installed app or its data.

`control-omb` has no Workflow verbs, so this recipe creates the definition and
starts the run through the HTTP routes. Keep the printed fixture log and the
run JSON as evidence.

## Launch

```sh
FAKE_CLAUDE_TOOL_CALLS_FILE=/tmp/omb-approval-tools.json \
FAKE_CLAUDE_EXIT_AFTER_TURN=1 FAKE_CLAUDE_RUN_BASH=1 \
node --experimental-strip-types scripts/control-omb.ts launch
```

Write the first turn's tool call before starting a run. The fixture's `PATH`
holds only `node`, so the second turn writes the output with the shell's
builtin `printf`:

```sh
cat > /tmp/omb-approval-tools.json <<'JSON'
[{"server":"agents","name":"request_credential","input":{"credential_id":"xaiApiKey","reason":"Workflow step waiting test"}}]
JSON
```

## Drive

Use the URL and bot id the fixture prints. A credential card stands in for any
card the person must answer; the step only needs one that ends the turn.

1. `POST /api/workflows` with one step: `outputs: [{path: "result.json",
   required: true}]`, `result: "result.json"`, `require: {ok: true}`.
2. `POST /api/workflows/<id>/run` and read
   `GET /api/workflows/runs/<runId>`: the run is `waiting_approval`, the step
   is `running`, and `pause.cardIds` names the card message.
3. Replace `/tmp/omb-approval-tools.json` (write a temporary file, then `mv`
   it) with the second turn:

   ```sh
   [{"name":"Bash","input":{"command":"printf '{\"ok\":true}' > output/result.json"},"ok":true}]
   ```

4. `POST /api/bots/<botId>/secret-cards/<messageId>/dismiss` with
   `{"threadId": "<run.steps[0].threadId>"}`.
5. `GET /api/workflows/runs/<runId>` again: `succeeded`,
   `steps[0].verified` is `["result.json"]` and `result` is `{ok: true}`.

## What it does not prove

- The fake Claude CLI cannot post a question card that survives its turn, so
  this recipe covers the pause and the resume, not a refused card. The
  refusal (`aprovação negada` → `cancelled`) is covered by
  `server/workflows/engine.test.ts`.
- Nothing here proves a real provider's card or a real browser/credential
  flow; only the engine's contract with the host.
