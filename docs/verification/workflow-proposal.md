# Workflow proposal from a conversation

Checks that a bot's Workflow proposal stays a draft until the person says yes,
that “Agora não” archives it, and that creating it writes a real Workflow whose
first step is manual. It uses the isolated launcher and the fake Claude engine;
it never touches the installed app or its data.

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
    "outputs":[{"path":"dados.json"}],"result":"dados.json"}],
  "scripts":[{"name":"coletar.mjs","content":"console.log('ok')\n"}]
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
   `steps[0].mode === "manual"`.
6. Open the UI (`OMB_PORT=<port> OMB_UI_PORT=5399 pnpm dev`), choose
   **Workflows → Mais opções → Propostas**, select the archived proposal and
   click **Criar Workflow**. The request is
   `POST /api/workflow-proposals/<id>/create` and answers 201.

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

## Preview, rehearsal, annotations and rounds

The proposal detail opens a preview with Input, Process, Output and Proof per
step, the step map, assumptions, per-step notes, “ver o que o programa faz” for
scripts and non-blocking script warnings.

The rehearsal runs script steps in a disposable folder with the example's
`inputs` and `files`, compares the declared outputs byte for byte when
`expected` is supplied, and marks bot or branch steps **not tested** instead of
pretending they ran. The result is stored on the proposal.

Each step can carry a note. **Registrar outra rodada** increments the review
round; after three rounds the preview offers **Refazer do zero com o que
aprendemos** and **Abrir no editor de Workflows**.

## What it does not prove

- The bot's card answer is a normal chat message; the model must call
  `create_workflow_from_proposal`. The QA recipes use the fake engine's scripted
  calls, not a real provider's judgment about when to propose or start a run.
- The preview shows the top-level steps; the body of a Do While is not expanded
  with its own Process/Proof/code yet.
- The rehearsal runs script steps only; bot and branch steps stay **not tested**.
- A routine cannot supply required parameters, so only parameterless or
  `whenAbsent` Workflows are schedulable.
- Webhook and app-event triggers do not offer a Workflow target in this version.
