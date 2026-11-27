# Skill Burger: save a run as a workflow skill

A finished run of two or more shell or file steps shows a small burger card in
the chat dock. One click saves its steps as an ordinary skill folder
(`SKILL.md` + `workflow.json`) in the shared skills library, tagged `workflow`,
approved, for every bot. The bot panel's Skills page lists saved burgers,
expands their steps, runs them without the AI, and removes them with an Undo.

This slice repeats **shell and file steps only**. App, browser and computer
steps are never saved: a run that changed an app, a page or a screen is
refused, and its card is not shown. `VerifyCard` keeps working when the switch
is off or the run is not replayable.

## What it proves

- A finished run of at least two exact shell/file steps shows the burger card
  (summary, ordered steps, Save as skill, dismiss). Saving writes
  `DATA/skills-library/skills/<name>/SKILL.md` and `workflow.json`; the index
  entry is `reviewState: approved`, `everyBot: true`, `tags: ["workflow"]`.
- A run that changed an app, the browser or a computer screen, or that has
  fewer than two repeatable steps, is refused with the reason and saves
  nothing.
- The bot panel's Skills page lists saved burgers with their steps; Run opens
  an args dialog prefilled from the saved defaults, or starts at once when
  there are no args.
- Run executes the steps in order in the conversation's folder; a failed step
  stops the run and names itself. Each step has 60 s and 512 KB of output.
  A file step can only write inside that folder.
- The bot tool `run_saved_workflow` runs the same saved burger through
  `/api/internal/skill-burgers/run`. `run_workflow` (Workflow Studio) is
  unchanged.
- Settings → Skill Burger off hides the chat card and the panel card; saved
  skills remain readable through the API and turn back on without loss.

## Run

Focused unit and route checks:

```sh
pnpm exec vitest run shared/skill-burger server/skill-burger \
  src/lib/verify-steps.test.ts src/lib/feature-flags.test.ts src/lib/i18n.test.ts \
  server/drivers/agents-call-workflow.test.ts server/drivers/agents-catalog-wire.test.ts \
  server/drivers/agents-bridge-wire.test.ts
```

The fixture scripts a Claude turn that runs two shell/file steps. The fake
engine reports the calls; the saved burger runs them for real later.

```sh
SCRATCH=$(mktemp -d)
cat > "$SCRATCH/calls.json" <<'EOF'
[{"name":"Bash","input":{"command":"mkdir -p burger-demo"}},
 {"name":"Write","input":{"file_path":"burger-demo/hello.txt","content":"hello from the burger"}}]
EOF
FAKE_CLAUDE_TOOL_CALLS_FILE="$SCRATCH/calls.json" \
FAKE_CLAUDE_REPLIES='["Made the demo folder and wrote the file.","Ran the saved skill."]' \
  node --experimental-strip-types scripts/control-omb.ts launch
```

In a second terminal, set `URL` to the printed `url` and `DATA` to the printed
data directory.

```sh
pnpm control:omb new-bot --name Burger --url $URL
# BOT_ID and T1 come from the JSON above.
pnpm control:omb send --bot $BOT_ID --task $T1 --text "make a hello file in a demo folder" --url $URL
pnpm control:omb wait --bot $BOT_ID --task $T1 --timeout 120 --url $URL
```

## User path (isolated fixture)

1. Open the bot's chat. Above the composer, a burger card shows the ask and
   two steps: `Run mkdir -p burger-demo` and `Write hello.txt`. `VerifyCard`
   is not also shown.
2. Click **Save as skill**. The card says it was saved and offers Undo. The
   skill folder appears under `DATA/skills-library/skills/`, named from the
   ask (`make-a-hello-file-in-a`), with `SKILL.md` and
   `workflow.json`.
3. Open the bot panel → **Skills**. **Skill Burgers** lists it. Expand it to
   see the two steps. Click **Run**: with no args it starts at once, lists
   both steps as done, and
   `DATA/task-workspaces/$BOT_ID/$T1/burger-demo/hello.txt` holds
   `hello from the burger`.
4. Click the trash icon on the skill: it disappears, with **Undo**. Undo puts
   the same copy back.
5. Settings → **Skill Burger** off. Return to the chat: no burger card, and
   the panel's Skill Burgers card is gone. `GET /api/skill-burgers` still
   lists the saved skill. Turn the switch back on to see it again.
6. A run that writes a file but also sends an app message does not show a card
   and `POST /api/skill-burgers` refuses it with the app/page/screen reason.
7. In a new chat, ask a bot to run the saved skill by name; with a Claude turn
   that calls `run_saved_workflow` (`{"name":"<skill-name>"}`), the reply
   reports each step and stops at the first failure.

## Notes

- The card and panel list are gated by `features.skillBurger` (on unless
  false) and the existing **This run card** preference.
- Saved burgers live only in the shared skills library; there is no per-bot
  copy, delegated run, recording pipeline, small-model summary, live run view,
  decide/case, AI step or `workflow_edit` in this slice.
