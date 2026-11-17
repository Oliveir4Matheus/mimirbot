# Workflow proposal from a conversation

Checks that a bot's Workflow proposal stays a draft until the person says yes,
that “Agora não” archives it, and that creating it writes a real Workflow whose
first step is manual. The create is gated twice: the person confirms the three
interview answers on the card, and the rehearsal passes. A rehearsal that did
not run or diverged refuses the create; there is no justification field. It uses
the isolated launcher and the fake Claude engine; it never touches the installed
app or its data.

`control-omb` has no Workflow verbs, so this recipe drives the proposal with the
fake engine's scripted `agents` tool calls and reads the fixture's JSON files.

## Launch

Write the first scripted call before launching. The fake engine executes a call
only when it names `server: "agents"`.

```sh
mkdir -p /tmp/opencode/wf-proposal/{tools,evidence}
cat > /tmp/opencode/wf-proposal/tools/propose.json <<'JSON'
[{"server":"agents","name":"propose_workflow","input":{
  "name":"Cobrança mensal",
  "interview":{"recurring":true,"changes":"Só as datas","confirmer":"Eu confirmo"},
  "summary":"Uma mensagem por cliente.",
  "steps":[{"id":"coletar","kind":"script","name":"Coletar","run":"coletar.mjs",
    "outputs":[{"path":"dados.json"}]}],
  "scripts":[{"name":"coletar.mjs","content":"import { writeFileSync } from \"node:fs\";\nwriteFileSync(process.env.WORKFLOW_STEP_OUTPUT + \"/dados.json\", JSON.stringify({ rows: 1 }));\n"}]
}}]
JSON
FAKE_CLAUDE_TOOL_CALLS_FILE=/tmp/opencode/wf-proposal/tools/propose.json \
FAKE_CLAUDE_EXIT_AFTER_TURN=1 \
node --experimental-strip-types scripts/control-omb.ts launch
```

## Drive

Use the printed URL and data directory.

1. `pnpm control:omb new-bot --name "Bot Proposta" --url <url>`.
2. `pnpm control:omb send --bot <botId> --text "Transforme isso em um Workflow."`.
3. `<dataDir>/workflow-proposals.json` has one `status: "draft"`; the
   conversation has a `kind: "options"` message whose card carries
   `workflowProposal` and the options **Criar Workflow** / **Agora não**.
   `workflows.json` does not exist yet.
4. Replace the tool file with
   `[{"server":"agents","name":"archive_workflow_proposal","input":{"proposal_id":"<id>"}}]`
   and send “Agora não.” The proposal becomes `archived`.
5. Put the propose call back, send again, then replace the file with
   `[{"server":"agents","name":"create_workflow_from_proposal","input":{"proposal_id":"<id>"}}]`
   and send “Criar Workflow.” `workflows.json` now has version 1 and
   `steps[0].mode === "manual"`. The script above writes `dados.json`, so the
   proposal's recorded rehearsal is `passed` and the create succeeds; a
   proposal whose rehearsal is `untested` or `diverged` answers 409 with
   `needsRehearsal: true` and no Workflow is written (see
   [the authoring contract fixture](workflow-authoring.md)). The preview's
   **Rodar ensaio** button is the only way to change that status.
6. A create before the interview is confirmed answers 409 with
   `needsConfirmation: true`.
   The person's route is the only way to confirm, and it writes the answers it
   receives — a correction replaces the bot's text:

   ```sh
   curl -sS -X POST -H 'content-type: application/json' \
     -d '{"interview":{"recurring":true,"changes":"O link do video do dia","confirmer":"O Matheus aprova os 3 trechos"}}' \
     http://127.0.0.1:PORT/api/workflow-proposals/<id>/confirm
   ```

   The stored proposal now carries `interview.confirmedAt`,
   `interview.confirmedBy: "user"` and an `approvalHash`. The create after that
   answers 201.
7. Open the UI (`OMB_PORT=<port> OMB_UI_PORT=5399 pnpm dev`), choose
   **Workflows → Mais opções → Propostas**, select the archived proposal and
   click **Criar Workflow**. The preview opens and its footer creates it; the
   request is `POST /api/workflow-proposals/<id>/create` and answers 201. The
   preview's interview block shows the bot's answers under
   **Repete? / O que muda / Quem confirma**; **Criar Workflow** stays disabled
   until **Confirmar respostas** is pressed, and editing an answer turns the
   badge back to “Uma resposta mudou — confirme de novo” and disables the
   create again.

Keep `workflow-proposals.json`, `workflows.json`, the UI screenshots and the
server log as evidence.

## Routines and parameters

A routine can target a Workflow created here. At the scheduled time the routine
creates the run; because the first step is manual, the run lands in
`waiting_manual` and waits for **Continuar** before copying files or opening a
thread. The routine run mirrors **waiting**.

A routine cannot supply required parameters. A scheduled Workflow must declare
its parameters optional with `whenAbsent`, or leave them out; otherwise the
start fails with `needs_input` and no run is created.

## The interview and its confirmation

The bot asks the three questions one per turn and writes its answers anyway; it
never confirms them. The preview is the authority: it shows the answers, the
person confirms or corrects each one, and
`POST /api/workflow-proposals/<id>/confirm` stamps `interview.confirmedAt` and
`interview.confirmedBy` and computes the `approvalHash` over the definition, the
scripts and the interview answers. A different answer, script or definition
leaves the stored hash stale and the create answers 409 `needsConfirmation`
until the person confirms again. “Não sei” is still a valid answer: it becomes
an assumption the person is confirming, and correcting it removes the
assumption.

The bot's tool descriptions say the same thing: `propose_workflow` asks one
question per turn, and `create_workflow_from_proposal` never confirms for the
person.

## Preview, rehearsal, annotations and rounds

The proposal detail opens a preview with Input, Process, Output and Proof per
step, the step map, assumptions, per-step notes, “ver o que o programa faz” for
scripts and non-blocking script warnings.

The rehearsal runs script steps in a disposable folder with the example's
`inputs` and `files`, compares the declared outputs byte for byte when
`expected` is supplied, and marks bot or branch steps **not tested** instead of
pretending they ran. The result is stored on the proposal.

The preview shows two rehearsal states only: **Sem ensaio** in amber and
**Passou** in green. A diverged script is an error in the body with its real
exit code and stderr tail, and the seal returns to **Sem ensaio** until a new
rehearsal passes. Authoring errors block **Rodar ensaio**; the create stays
disabled until the definition is valid, the interview is confirmed and the
rehearsal passed. Both error bands offer **Copiar** and **Enviar erro ao bot**,
which sends the same real `path` + `message` list to the conversation that
created the proposal (`createdBy.threadId`); without that conversation the send
button is disabled with a tooltip.

Each step can carry a note. **Registrar outra rodada** increments the review
round; after three rounds the preview offers **Refazer do zero com o que
aprendemos** and **Abrir no editor de Workflows**.

## Real-conversation QA (13/11/2026)

A separate run used the real model `opencode/deepseek-v4.1-flash-free`
(`opencodeGo`) in the real UI, with no `FAKE_CLAUDE_*`. The person gave a task,
answered the bot's questions, received the delivery, asked for a Workflow,
answered the interview, requested a concrete change to one step, asked for a
rehearsal, and asked for a schedule. The model itself called
`propose_workflow` twice: the first proposal had four steps, the adjusted one
had three (`script → Do While → bot`). The recorded tool arguments match the
stored proposal byte for byte after schema defaults.

Result: **14 PASS, 1 FAIL, 1 N/A**. Evidence is under `tmp/qa-e2e/qa-real/`,
including `QA-REAL.mp4`, `model-proposal-request.json`, the transcripts and the
run/proposal JSON.

The one FAIL was an approval scenario: the bot used `show_widget`, which is a
widget card without `requestId`; the engine only parks on request/approval
cards, so the run continued without the widget answer and failed on a missing
output. Use a request card (`request_credential` or an approval) to test the
pause. The card pause/resume path itself is proven by QA-B and by
`server/workflows/engine.test.ts`.

## What it does not prove

- The bot's card answer is a normal chat message; the model must call
  `create_workflow_from_proposal`. The QA recipes use the fake engine's scripted
  calls, not a real provider's judgment about when to propose or start a run.
- The interview confirmation is a person's route; no bot tool can press it. A
  stored proposal whose answers were edited on disk keeps its old hash, so the
  create refuses it, but nothing re-runs the bot's three questions for a draft
  made before this gate existed.
- The preview shows the top-level steps; the body of a Do While is not expanded
  with its own Process/Proof/code yet.
- The rehearsal runs script steps only; bot and branch steps stay **not tested**.
- A routine cannot supply required parameters, so only parameterless or
  `whenAbsent` Workflows are schedulable.
- Webhook and app-event triggers do not offer a Workflow target in this version.
