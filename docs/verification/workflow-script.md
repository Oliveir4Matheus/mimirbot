# Workflow script, branch and repeat

Checks that a script step runs with the step folder as cwd and the declared
inputs, that a condition step reads the script's shaped `result.json` and
chooses the route, that the steps the path skips end as `skipped`, and that the
run stays readable after its Workflow is deleted. It uses the real server and
the fake Claude engine (for the bot steps) in a disposable fixture; it never
touches the installed app or its data.

`control-omb` has no Workflow verbs, so a small driver script creates the
definition, uploads the script and starts the run through the HTTP routes. Keep
the printed fixture log and the run JSON as evidence.

## Launch

```sh
mkdir -p /tmp/opencode/wf-script
cat > /tmp/opencode/wf-script/tools.json <<'JSON'
[{"name":"Bash","input":{"command":"printf '1,2,3' > output/mensagens.json; printf '{\"ok\":true}' > output/result.json"},"ok":true}]
JSON
cat > /tmp/opencode/wf-script/validar.mjs <<'JS'
import { readFileSync, writeFileSync } from "node:fs";
const raw = readFileSync(process.env.WORKFLOW_STEP_INPUT + "/mensagens.json", "utf8");
writeFileSync(process.env.WORKFLOW_STEP_OUTPUT + "/result.json", JSON.stringify({ ok: raw.trim().length > 0, total: raw.split(",").length }));
JS

FAKE_CLAUDE_TOOL_CALLS_FILE=/tmp/opencode/wf-script/tools.json \
FAKE_CLAUDE_EXIT_AFTER_TURN=1 FAKE_CLAUDE_RUN_BASH=1 \
node --experimental-strip-types scripts/control-omb.ts launch
```

## Drive

Use the URL the fixture prints and the id of its bot
(`GET /api/bots` → `bots[0].id`).

1. `POST /api/workflows` with a v1 that has only bot steps (`preparar`,
   `fechar`). The script step cannot be saved before its file exists.
2. `PUT /api/workflows/<id>/scripts/validar.mjs` with
   `{ "content": "<validar.mjs>" }`.
3. `PUT /api/workflows/<id>` with the v2 steps:
   - `preparar` (bot): output `mensagens.json`;
   - `validar` (script, `run: "validar.mjs"`): input `mensagens.json`, output
     `result.json` with `shape: { type: "object", required: ["ok"],
     properties: { ok: { type: "boolean" } } }`;
   - `checar` (condition): `from: { step: "validar", output: "result.json" }`,
     `conditions: [{ field: "ok", op: "equals", value: true }]`,
     `whenTrue: "fechar"`, `whenFalse: "corrigir"`;
   - `corrigir` (bot): output `nota.txt`;
   - `fechar` (bot): output `fim.txt`.
4. `POST /api/workflows/<id>/run`, then poll
   `GET /api/workflows/runs/<runId>` until it is terminal.
5. Expect:
   - `workflowVersion` is 2 and `status` is `succeeded`;
   - `steps[0].verified` is `["mensagens.json"]`, the script step
     (`steps[1]`) has no `threadId` and `verified` is `["result.json"]`;
   - `steps[2]` (the condition) is `succeeded` with `branch: true` and
     `source: { step: "validar", output: "result.json" }`;
   - `steps[3]` (`corrigir`) is `skipped` because the script returned
     `ok: true`;
   - `steps[4]` ran; the run has no `result` field.
6. `DELETE /api/workflows/<id>`, then read the run again: `status` stays
   `succeeded` and `snapshot.name`/`snapshot.steps` remain.

The driver used for the 2026-11-08 evidence:

```js
const id = crypto.randomUUID();
const base = { id, name: "Validacao de cobranca", department: "Financeiro", retentionDays: 7 };
const workflows = "/api/workflows";
await call("POST", workflows, { ...base, steps: [preparar, fechar] });
await call("PUT", `${workflows}/${id}/scripts/validar.mjs`, { content: readFileSync("/tmp/opencode/wf-script/validar.mjs", "utf8") });
await call("PUT", `${workflows}/${id}`, { ...base, steps: [preparar, validar, checar, corrigir, fechar] });
const run = (await call("POST", `${workflows}/${id}/run`)).run;
// poll GET `${workflows}/runs/<run.id>`
```

## What it does not prove

- A loop that never passes is covered by `server/workflows/loop.test.ts` (it
  stops at `maxIterations`). This recipe takes the forward branch only.
- A script that hangs, exits non-zero or writes a `result.json` that does not
  match its `shape` is covered by `server/workflows/script.test.ts` and the
  engine tests.
- Nothing here proves a real provider, a real approval card or a Cloud home.
