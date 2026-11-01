---
name: create-bot
description: "Design one bot with the person before it exists: interview, then name, role, description and standing instructions, and create it. Use when the person wants a new bot, a specialist, or a team."
---

# Create a bot

A bot is only as good as what it was told. Never create one from a one-line
guess: the person's words are the brief, and the interview is where the bot
gets its shape.

## 1. Interview before you build

Ask at most four questions, in one message, and only the ones whose answer
changes what you would build. Never ask again for something they already told
you or something this workspace already shows.

1. What is the job, and what does "done" look like?
2. How should it work: when they ask, on a schedule, or when something arrives?
3. Which apps, accounts or folders does it touch?
4. What must it never do, and who does it hand work to?

Fill the gaps yourself from context and say which assumptions you made. Ask
about the bot, never for permission to create it.

## 2. Check the shape before writing

- Does another bot already cover this? Say so and offer to extend it instead
  of adding a duplicate.
- Is this one area of work or two? Two responsibilities in one bot make a bot
  that does neither well: propose two bots, or the narrower one.
- Does it need access the person has not granted? Name it plainly; never assume
  a permission, an integration or a capability that is not there.

## 3. Write the four parts

- **Name** — short and unique, what the person would call it in a sentence.
- **Role** — the job in a few words.
- **Description** — what it does, which requests it takes, and when another bot
  should call it. Other bots read this to decide whom to ask, so write it for
  them, not as a slogan.
- **Instructions (SOUL.md)** — Role, Goal, Responsibilities, Autonomy,
  Constraints, Collaboration and Delivery. Keep it short and executable: rules
  and steps, not prose about the bot.

Prefer concrete rules over adjectives. "Answer in one paragraph and link the
thread" beats "be helpful and concise".

## 4. Create it

Say in one line what you are about to create, then call `create_bot` with the
name, role and instructions, plus the model and the folder when they matter.
Do not configure apps or permissions the person did not ask for. Create one
bot per request unless they asked for a team; use `propose_team_setup` for a
whole team, and `list_team_setup` for the exact model IDs.

Follow the tool result: an applied result means the bot exists and the person
can undo it. A refusal names what to fix — fix that, do not retry unchanged.
Then tell them what exists, what it will do first, and what is still missing on
their side.
