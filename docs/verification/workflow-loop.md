# Do While (`kind: "loop"`) — verification

This fixture proves the F3.3 component at three layers: the closed contract,
the engine and run folder, and the Studio/F2 interface. Everything runs against
a throwaway data directory and a fake engine; no real app data is touched.

## 1. Unit and integration tests

```sh
pnpm exec vitest run shared/workflow.test.ts server/workflows server/routes/workflows.test.ts
pnpm typecheck
pnpm lint
pnpm i18n:check
```

The focused suite covers:

- the contract accepts a minimal Do While and refuses a nested loop, a body
  edge that leaves the body or points backwards, an ambiguous output, a
  required loop output from an optional body output, and executable-only fields
  on the loop;
- the engine runs the body at least once, repeats until the condition stops,
  records every round, fails with `failureKind: "limit"`, follows `onFailure`,
  fails when `from` did not run or a comparison has the wrong type, keeps a
  failed body step visible when its own route continues the round, ends a round
  on a `null` condition branch, parks/resumes a manual body step, pauses for
  approval with `pause.path`, cancels a waiting round, and recovers a running
  body step after a restart;
- a real script body updates 150/50/0 over three rounds and projects the last
  round's `result.json` into the loop folder;
- `iterations/iter-N/step-<bodyId>/input|output` are created per round and
  `projectLoopOutputs` refuses a missing required output;
- `canvas.loops` is stored without creating a version, changing the body
  creates a version, `run.json` keeps iterations/snapshot body/hold path, and
  old runs without those fields still parse;
- the save routes accept a loop with a body script, refuse the §4.7 cases, and
  return 409 when a body script changes during an active run.

## 2. Isolated server with a real run

Start the verification server. It prints `url`, `pid` and `dataDir`; it owns a
temporary fake engine and creates a starter bot.

```sh
node --experimental-strip-types scripts/control-omb.ts launch
```

Point the UI at that server:

```sh
OMB_UI_PORT=5401 OMB_PORT=<printed-port> pnpm dev
```

Seed three Workflows with the API (`PUT /api/workflows/:id`) and upload their
scripts in the same body. Each one has an Agent step, scripts, an IF/Else and a
Do While:

| Scenario | Top-level steps | Body | Expected |
|---|---|---|---|
| 1 · Lote em 3 voltas | Agente → Prepara → Checa → Do While → Fecha | `processa.mjs` writes `{ lote, restantes }` 150 → 50 → 0 | `succeeded`, 3 rounds, third round `conditionMatched: true`, loop `verified: ["result.json"]`, downstream reads the loop output, `result: { final: true, restantes: 0 }` |
| 2 · Limite com onFailure | Agente → Prepara → Checa → Do While → Resgate | `nunca.mjs` always writes `{ restantes: 99 }`; `maxIterations: 2` | loop `failed`, `failureKind: "limit"`, message `step "laco" reached the iteration limit of 2`, `resgate` `succeeded`, run `succeeded` |
| 3 · Corpo manual | Agente → Do While → Conclui | `manual.mjs`, `mode: "manual"`, writes `{ restantes: 0 }` | run `waiting_manual`, `hold.path = [1, 0, 0]`; Continue resumes and finishes one round |

The scripts keep their only shared state outside the round folder (a counter in
the run directory), which is exactly the external-state rule: there is no
`input/` or `output/` shared between rounds.

## 3. Interface and video

### 3.1 Workflow created from zero

The final QA run starts on an empty **Workflows** screen and creates the whole
flow in the Studio, with every component:

1. **Novo Workflow** and the name `QA do zero · E2E`;
2. add **Script**, **Agente**, **IF / Else** and **Do While** from the palette;
3. edit the top script, connect Script → Agente → IF / Else, and connect the
   condition's True branch to the Do While;
4. open the Do While substudio, add the body **Script**, edit its code, see the
   **Entrada do Do While** / **Fim da volta** markers, and close;
5. in the loop balloon choose the body script as `from`, maximum **3**, the
   `result.json` output and the loop result;
6. **Salvar**, **Executar**, and expand the Do While row: Volta 1 and 2 show
   “Condição não satisfeita”, Volta 3 shows “Parou porque restantes lte 0”.

Evidence from the final 12/11/2026 run:

- video: `QA/qa-do-zero.mp4` (h264, 1440×900, 45.12 s) and
  `QA/qa-do-zero.webm`;
- screenshots: `/tmp/opencode/loop-qa2/evidence/01-workflows-empty.png` …
  `10-run-rounds.png` (the editor-open frames are `04-top-script.png`,
  `06-body-script-editor.png` and `06-substudio-body.png`);
- workflow `51916e22-f9fa-49aa-ba36-b1e68ce2d597`, run
  `20261112-224321-e17e49`, 4 top-level steps and 3 loop rounds
  (`restantes` 2/1/0).

The fixture's first script also writes the next step's declared
`result.json`; the temporary fake engine does not write files, so this keeps
the bot step real while its output contract is still checked by the engine.

### 3.2 Seeded scenarios

The same UI was also used to run three prepared workflows:

1. scenario 1 (3 rounds) and scenario 2 (limit with `onFailure`) from the
   **Executar** dialog;
2. scenario 3 (manual body) parks the run, **Continuar** resumes it, and the
   round expands in the timeline.

Earlier evidence: `/tmp/opencode/loop-qa/evidence/01-workflows-list.png` …
`07-scenario-3-resumed.png`.

The substudio measured about 1150×628 px in a 1440×900 viewport (79.9% ×
69.8%), with no clipped copy.

## 4. Compatibility checks

- an old `run.json` with `hold: { step, since }` still loads;
- an old definition without `canvas.loops` loads normally (`loops` defaults to
  `{}`);
- `kind`-less steps and `next` edges are normalized inside a body too;
- `DELETE`/retention still treat `queued`, `running`, `waiting_manual` and
  `waiting_approval` as active, including a loop waiting inside its body.
