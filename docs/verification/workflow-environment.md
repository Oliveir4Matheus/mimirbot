# Workflow environment preparation and preflight

Checks the installation's script environment end to end against a disposable
fixture: the status the panel reads, the preparation route that writes
`requirements.txt`/`package.json` and `state.json`, the run's preflight refusal
after a module version changes, and that a failed preparation deletes nothing.
The stand-in interpreter keeps the whole recipe offline; no real `pip` or `npm`
runs, and the installed app and its data are untouched.

`~/MimirBot` is the fixture's temporary home plus `MimirBot`
(`<dataDir>/MimirBot`), because the launcher gives the child `HOME=dataDir`.
That is the only root switch the launched server uses: `workflowsRoot()` also
accepts `OMB_WORKFLOWS_ROOT`, but only from a caller that passes an environment
(`server/workflows/paths.ts`), which the fixture launcher does not.

## Launch

```sh
node --experimental-strip-types scripts/control-omb.ts launch
```

Keep the printed URL, data directory and log path. `control-omb` has no
Workflow verbs, so the driver below calls the HTTP routes.

## Drive

The driver creates a Workflow with one script step that declares
`{ "name": "faster-whisper", "runtime": "python", "version": "1.2.1" }`, then
exercises the status, preparation and run routes.

Before the first preparation it places a stand-in interpreter at the venv path
preparation uses. With that file present, preparation skips `python3 -m venv`,
runs `pip` through the stand-in, and the stand-in answers the `-c` probes for
imports and versions. Nothing leaves the machine.

```js
// node /tmp/opencode/wf-env/drive.mjs <fixture-url> <fixture-data-dir>
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [url, dataDir] = process.argv.slice(2);
const call = async (method, path, body) => {
  const response = await fetch(`${url}${path}`, {
    method,
    ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};

const root = join(dataDir, "MimirBot");
const venv = join(root, ".workflow-env", "python");
const fakePython = join(venv, "bin", "python");
mkdirSync(join(venv, "bin"), { recursive: true });
writeFileSync(fakePython, `#!/bin/sh
case "$1" in
  -c)
    case "$2" in
      *importlib.metadata*) echo 1.2.1 ;;
      *sys.version_info*) echo 3.12.4 ;;
    esac
    exit 0 ;;
esac
exit 0
`, { mode: 0o755 });
chmodSync(fakePython, 0o755);

const id = crypto.randomUUID();
const script = `import { writeFileSync } from "node:fs";
writeFileSync(process.env.WORKFLOW_STEP_OUTPUT + "/ambiente.json", JSON.stringify({
  python: process.env.WORKFLOW_PYTHON,
  nodeModules: process.env.WORKFLOW_NODE_MODULES,
  firstOnPath: process.env.PATH.split(":")[0],
}));`;
const definition = (version) => ({
  id, name: "Ambiente do Workflow", department: "Financeiro", retentionDays: 7,
  steps: [{
    id: "transcrever", kind: "script", name: "Transcrever", run: "transcrever.mjs", timeoutMs: 60_000,
    modules: [{ name: "faster-whisper", runtime: "python", version }],
    outputs: [{ path: "ambiente.json" }],
  }],
});

await call("POST", "/api/workflows", { ...definition("1.2.1"), scripts: [{ name: "transcrever.mjs", content: script }] });
console.log("before", (await call("GET", "/api/workflows/environment")).body);
console.log("prepare", (await call("POST", "/api/workflows/environment/prepare")).body);
console.log("state", readFileSync(join(root, ".workflow-env", "state.json"), "utf8"));
console.log("after", (await call("GET", "/api/workflows/environment")).body);

let run = (await call("POST", `/api/workflows/${id}/run`)).body.run;
for (let attempt = 0; attempt < 40 && !["succeeded", "failed", "cancelled"].includes(run.status); attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 250));
  run = (await call("GET", `/api/workflows/runs/${run.id}`)).body.run;
}
console.log("run", run.status, readFileSync(join(root, "Financeiro", "workflows", id, "runs", run.id, "step-1", "output", "ambiente.json"), "utf8"));

await call("PUT", `/api/workflows/${id}`, definition("1.2.2"));
console.log("changed", (await call("POST", `/api/workflows/${id}/run`)).body);

const stateBefore = readFileSync(join(root, ".workflow-env", "state.json"), "utf8");
renameSync(fakePython, `${fakePython}.away`);
console.log("failed prepare", (await call("POST", "/api/workflows/environment/prepare")).body);
console.log("state kept", readFileSync(join(root, ".workflow-env", "state.json"), "utf8") === stateBefore);
```

Observed on 2026-11-16:

- status before preparation: `prepared: false`, one declared module;
- preparation: `ok: true`, `installed: [{ name: "faster-whisper", runtime:
  "python", version: "1.2.1" }]`, and
  `.workflow-env/requirements.txt` is `faster-whisper==1.2.1\n`;
- `state.json` carries `preparedAt`, `hash`, `python: "3.12.4"`,
  `pythonBin: "<dataDir>/MimirBot/.workflow-env/python/bin/python"`, `node`,
  and the prepared `modules`;
- status after preparation: `prepared: true`, `stale: false`, `changed: 0`;
- the run succeeds and its script writes `WORKFLOW_PYTHON` as the venv path,
  `WORKFLOW_NODE_MODULES` as `<dataDir>/MimirBot/node_modules`, and the venv
  `bin` as the first entry of `PATH`;
- after changing the version to `1.2.2`, `POST .../run` answers 404 with
  `the environment is not prepared for this Workflow: run "Prepare
  environment" (1 module changed)`; the execution dialog shows that text;
- removing the interpreter makes preparation answer `ok: false` with
  `tail: "spawn python3 ENOENT"`, and `state.json`, `requirements.txt` and
  `package.json` stay byte-identical.

## The panel

The Workflows panel's menu shows one of three states under **Preparar
ambiente**: not prepared yet, prepared on a date, or out of date with how many
modules changed. Choosing it runs the same route and shows the failure tail in
a dialog. This renderer state is not driven by `control-omb`; check it by hand
on a disposable fixture.

## What it does not prove

- A real `pip`/`npm` install, a real package's import, or a real `node_modules`
  resolution: `server/workflows/environment.test.ts` covers those paths with
  doubled package managers, as the spec requires, so no test touches the
  network. This recipe has no node module for the same reason.
- The Windows layout (`Scripts/python.exe`, `py -3 -m venv`, `npm-cli.js`) and
  macOS packaging.
- That a script run outside a fixture resolves the author's own packages; that
  is the installation's environment by design.
