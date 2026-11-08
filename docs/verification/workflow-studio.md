# Workflow Studio and the condition step

The Studio is the F3 editor. This fixture proves three things end to end, with
no access to the real app or its data:

1. the Studio saves a Workflow whose script step and condition step are real;
2. the engine reads the source step's `result.json` and follows True or False;
3. the F2 screen draws the saved Workflow and its new condition step.

## 1. Engine and save, against an isolated server

Start a fixture in one terminal:

```sh
node --experimental-strip-types scripts/control-omb.ts launch
```

It prints `url`, `pid` and `dataDir`. Keep the URL for the script below. The
fixture's server has no engine, so a Workflow made only of script and
condition steps runs without a model.

```sh
node - <<'EOF'
const base = "http://127.0.0.1:PORT"; // the printed URL
const id = crypto.randomUUID();
const preparar = `import { writeFileSync } from "node:fs";
import { join } from "node:path";
writeFileSync(join(process.env.WORKFLOW_STEP_OUTPUT, "result.json"), JSON.stringify({ ok: false }));
`;
const nao = `import { writeFileSync } from "node:fs";
import { join } from "node:path";
writeFileSync(join(process.env.WORKFLOW_STEP_OUTPUT, "nao.txt"), "no\\n");
`;
const sim = `import { writeFileSync } from "node:fs";
import { join } from "node:path";
writeFileSync(join(process.env.WORKFLOW_STEP_OUTPUT, "sim.txt"), "yes\\n");
`;
const definition = {
  id, version: 1, name: "Fixture condição", department: "General", retentionDays: 90,
  steps: [
    { id: "preparar", kind: "script", name: "Prepare", run: "preparar.mjs", timeoutMs: 30000, outputs: [{ path: "result.json" }], result: "result.json" },
    { id: "checar", kind: "condition", name: "Check", from: "preparar", field: "ok", op: "equals", value: true, whenTrue: "sim", whenFalse: "nao" },
    { id: "sim", kind: "script", name: "Yes", run: "sim.mjs", timeoutMs: 30000, outputs: [{ path: "sim.txt" }] },
    { id: "nao", kind: "script", name: "No", run: "nao.mjs", timeoutMs: 30000, outputs: [{ path: "nao.txt" }] },
  ],
  createdAt: Date.now(), updatedAt: Date.now(),
  canvas: {
    nodes: { preparar: { x: 80, y: 120 }, checar: { x: 480, y: 120 }, sim: { x: 880, y: 60 }, nao: { x: 880, y: 260 } },
    notes: [], containers: [],
  },
  scripts: [
    { name: "preparar.mjs", content: preparar },
    { name: "sim.mjs", content: sim },
    { name: "nao.mjs", content: nao },
  ],
};
const saved = await fetch(`${base}/api/workflows/${id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(definition) });
if (!saved.ok) throw new Error(`save: ${saved.status} ${await saved.text()}`);
const started = await fetch(`${base}/api/workflows/${id}/run`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
const { run } = await started.json();
let current = run;
for (let i = 0; i < 60; i += 1) {
  await new Promise((resolve) => setTimeout(resolve, 250));
  current = (await (await fetch(`${base}/api/workflows/runs/${run.id}`)).json()).run;
  if (["succeeded", "failed", "cancelled"].includes(current.status)) break;
}
console.log(JSON.stringify({ status: current.status, error: current.error, steps: current.steps.map((step) => [step.id, step.status]) }, null, 2));
EOF
```

Expected: `status: "succeeded"`, `preparar` and `nao` succeeded, `checar`
succeeded with no verified file, `sim` skipped. The condition read
`result.json` with `{ "ok": false }`, answered false and followed `whenFalse`.

This also proves the save path the Studio uses: the request carries `scripts`
next to the definition, the server writes the files before it checks the
script step, and a new Workflow may start with a script step.

## 2. Studio screen, in a disposable workspace

```sh
mkdir -p /tmp/opencode/studio-data /tmp/opencode/studio-home
OMB_PORT=8999 OMB_DATA_DIR=/tmp/opencode/studio-data HOME=/tmp/opencode/studio-home pnpm dev:server
OMB_UI_PORT=5399 OMB_PORT=8999 pnpm dev
```

Create one bot so the Agent step has a bot to pick:

```sh
curl -s -X POST http://127.0.0.1:8999/api/bots -H 'content-type: application/json' \
  -d '{"name":"Studio Bot","section":"Financeiro"}'
```

Open `http://127.0.0.1:5399/`, dismiss the welcome tour, click **Workflows**,
then **Novo Workflow** (the `+` beside *Ao vivo*). In the Studio:

1. the canvas is white with 24 px dots; the bottom bar has exactly five items:
   Agente, Script, IF / Else, Nota, Container;
2. clicking **Script** adds a 240 × 112 card with Input, Output, Script and Run;
3. clicking **IF / Else** adds the condition card with True and False on the
   right and Run and Condition below;
4. clicking the Script's Run output point and then the condition's entry port
   connects them: the Run tooltip shows the condition's name and the toast says
   **Etapas conectadas**;
5. type a name and click **Salvar**: the Workflows screen lists the new
   Workflow with its two steps and the **Editar** button.

The saved definition must carry `onSuccess` on the script and `from` on the
condition:

```sh
curl -s http://127.0.0.1:8999/api/workflows | \
  node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.stringify(JSON.parse(d).workflows[0].steps,null,2)))"
```

## Live view while a run happens

A bot step is not an HTTP request: the engine calls `startTurn` inside the same
server process. The observable wire is the app's own `/api/events` stream, and
`scripts/workflow-watch.ts` reads it without touching the run:

```sh
node --experimental-strip-types scripts/workflow-watch.ts --url http://127.0.0.1:PORT
```

It prints, for every `workflow.run` frame, the run status, the current step and
each step's `status` / `verified` / `error`; for bot steps it also prints the
brief (the user message of the step's thread), the tool calls the bot makes and
any approval card it opens. `--run <id>` narrows the output to one run.

To see the routes and JSON the app sends, add `--proxy-port`:

```sh
node --experimental-strip-types scripts/workflow-watch.ts --url http://127.0.0.1:8999 --proxy-port 9001
OMB_PORT=9001 OMB_UI_PORT=5399 pnpm dev
```

The proxy forwards to `--url`, prints every request as `→ METHOD /path` with
its JSON body (secret-looking keys are replaced by `***`) and the response
status, and streams SSE unbuffered. Point the app and the fixture at the proxy
port. This is the only way to see the HTTP routes, because a bot step itself
runs in-process; the workflow's own traffic is the save and the run start.

The ground truth is still the run folder: `run.json` carries the final status,
the verified files and the failure reason, and `step-N/input` and
`step-N/output` carry the contract the engine checked. The watcher is the live
view; the files are the evidence.

## What this does not prove

- The Studio's drag, resize, note and container geometry are visual checks; the
  headless snapshot sees the DOM, not the pixels. Compare with
  `Workflow_Studio_v05_preview.png` and `Workflow_Studio_v05_vinculos.png`.
- A real model is not used. The engine path is proved by the script steps; a
  bot step still needs the fake or a real engine.
- The Studio does not run a Workflow; the F2 screen's **Executar** does.

## Cleanup

Stop the `pnpm dev` and `pnpm dev:server` processes and Ctrl-C the `launch`
process. The launcher removes only its own temporary data directory. The
`/tmp/opencode/studio-*` directories are disposable.
