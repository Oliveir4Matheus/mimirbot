# Workflow script, branch and repeat

Checks that a script step runs with the step folder as cwd and the declared
inputs, that `when` chooses the next step from the script's `result.json`, that
the steps the path skips end as `skipped`, that the run stays readable after
its Workflow is deleted, and that a declared package is installed for the run
and removed when it ends. It uses the real server and the fake Claude engine
(for the bot steps) in a disposable fixture; it never touches the installed app
or its data.

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
     and result `result.json`, `when: [{ field: "ok", equals: true, next:
     "fechar" }]`;
   - `corrigir` (bot): output `result.json`, `next: "validar"` (the back edge
     is the repeat);
   - `fechar` (bot): output and result `result.json`.
4. `POST /api/workflows/<id>/run`, then poll
   `GET /api/workflows/runs/<runId>` until it is terminal.
5. Expect:
   - `workflowVersion` is 2 and `status` is `succeeded`;
   - `steps[0].verified` is `["mensagens.json"]`, the script step
     (`steps[1]`) has no `threadId` and `verified` is `["result.json"]`;
   - `steps[2]` is `skipped` because the script returned `ok: true`;
   - `steps[3]` ran and `result` is `{ok: true}`.
6. `DELETE /api/workflows/<id>`, then read the run again: `status` stays
   `succeeded` and `snapshot.name`/`snapshot.steps` remain.

The driver used for the 2026-11-08 evidence:

```js
const id = crypto.randomUUID();
const base = { id, name: "Validacao de cobranca", department: "Financeiro", retentionDays: 7 };
const workflows = "/api/workflows";
await call("POST", workflows, { ...base, steps: [preparar, fechar] });
await call("PUT", `${workflows}/${id}/scripts/validar.mjs`, { content: readFileSync("/tmp/opencode/wf-script/validar.mjs", "utf8") });
await call("PUT", `${workflows}/${id}`, { ...base, steps: [preparar, validar, corrigir, fechar] });
const run = (await call("POST", `${workflows}/${id}/run`)).run;
// poll GET `${workflows}/runs/<run.id>`
```

## Modules and a longer limit

A script step may declare `modules`: the packages it imports. `.mjs`/`.js`/`.ts`
install with npm, `.py` with pip; the install and the script share the step's
`timeoutMs`, which defaults to five minutes and accepts anything up to an hour.
The packages land in a copy of the Workflow's `scripts/` folder inside the
step's folder (`.workflow-modules`) and that folder is removed when the step
ends, whether it passed, failed or timed out.

The driver used for the 2026-11-14 evidence:

1. Create the Workflow with one bot step, upload
   `scripts/validar.mjs` (it imports `nanoid` and writes the id to
   `result.json`), then `PUT /api/workflows/<id>` with a single script step
   declaring `modules: ["nanoid"]` and `timeoutMs: 900000`.
2. `PUT` the same step with `modules: ["../evil"]` returns 400
   `steps.0.modules.0: must be a package name with an optional version`.
3. `POST /api/workflows/<id>/run` reaches `succeeded`, `verified` is
   `["result.json"]`, the file holds a 21-character nanoid, and the step folder
   has only `input/` and `output/`: `.workflow-modules` is gone.
4. With `WORKFLOW_PYTHON=/usr/bin/python3`, a `.py` script declaring
   `modules: ["six==1.16.0"]` ran through `runWorkflowScript` directly, wrote
   `six 1.16.0` and left no `.workflow-modules` folder; that run is covered
   here because the fixture's PATH carries Node and npm but not Python.

```js
await call("PUT", `/api/workflows/${id}`, {
  ...base,
  steps: [{ id: "validar", kind: "script", name: "Validate", run: "validar.mjs", modules: ["nanoid"], timeoutMs: 900000, outputs: [{ path: "result.json" }], result: "result.json" }],
});
const run = (await call("POST", `/api/workflows/${id}/run`)).run;
```

## What it does not prove

- The visit limit and a real loop that never passes are covered by
  `server/workflows/engine.test.ts` (a self-referencing script stops with
  `reached the visit limit of 25`). This recipe takes the forward branch only.
- A script that hangs, exits non-zero or writes a bad `result.json` is covered
  by `server/workflows/script.test.ts` and the engine tests.
- Installing needs npm or pip on the machine and the registry reachable. A
  failed install, an unsafe spec and the cleanup after them are covered by
  `server/workflows/script.test.ts` with a local package folder; a machine with
  no npm at all is not exercised here.
- A step that really runs past five minutes is not timed here; the accepted
  value, its one-hour ceiling and the runner clamp are checked by the schema
  tests.
- Nothing here proves a real provider, a real approval card or a Cloud home.
