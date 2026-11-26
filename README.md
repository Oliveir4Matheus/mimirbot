<div align="center">

# MimirBot

**A workspace of AI agents: a team that talks, hands off work, and gets things done.**

[Download](https://github.com/Oliveir4Matheus/mimirbot/releases/latest) · [All releases](https://github.com/Oliveir4Matheus/mimirbot/releases) · [How it works](#how-it-works) · [Features](#features)

Every bot in the sidebar is a real agent — Claude, Codex or another CLI running on your machine — with its own
model, instructions, memory, skills, routines and computer. Talk to them like contacts. Put them in rooms.
Watch the team hand work to each other, and approve what matters.

![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white) ![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black) ![Electron](https://img.shields.io/badge/Electron-Windows%20%C2%B7%20Linux%20%C2%B7%20macOS-2B2E3A?logo=electron&logoColor=9FEAF9) ![Agents](https://img.shields.io/badge/agents-Claude%20%C2%B7%20Codex-d97757) [![Release](https://img.shields.io/github/v/release/Oliveir4Matheus/mimirbot?label=release&color=1084fe&cacheSeconds=300)](https://github.com/Oliveir4Matheus/mimirbot/releases/latest) ![License](https://img.shields.io/badge/license-Apache%202.0-38d591)

[![Download for Windows](https://img.shields.io/badge/%E2%AC%87%EF%B8%8F%20%20Download%20for%20Windows-MimirBot%20setup.exe-4cc2ff?style=for-the-badge&labelColor=070707)](https://github.com/Oliveir4Matheus/mimirbot/releases/latest) [![Download for Linux](https://img.shields.io/badge/%E2%AC%87%EF%B8%8F%20%20Download%20for%20Linux-.deb%20%2F%20.AppImage-e95420?style=for-the-badge&labelColor=070707)](https://github.com/Oliveir4Matheus/mimirbot/releases/latest) [![Build for macOS](https://img.shields.io/badge/%E2%AC%87%EF%B8%8F%20%20Download%20for%20macOS-build%20from%20source-2a9d8f?style=for-the-badge&labelColor=070707)](https://github.com/Oliveir4Matheus/mimirbot/releases/latest)

<sub>Windows x64 installer · Ubuntu 24.04 x64 `.deb` or AppImage · macOS builds from source · [all releases](https://github.com/Oliveir4Matheus/mimirbot/releases)</sub>

<br>

![MimirBot: Atlas, the Chief of Staff, turns a Downloads clean-up request into a two-step workflow and reports what it would remove](docs/screenshots/readme/hero.png)

</div>

---

> **MimirBot is local-first and open source (Apache 2.0).** By default, agent processes, transcripts, memory and
> keys stay on your computer, under `~/.mimirbot`; local bots need no MimirBot account.
> MimirBot has no token or cryptocurrency. Any coin using the name is not affiliated with this project.

## Why you need MimirBot

A company does not run on one generalist with one chat box. It runs on roles, rituals, handoffs, approvals and a
shared memory of what was decided. A single assistant can answer a question; it cannot run the shape of the work.

MimirBot is that workspace, built for agents. It is a chat app where every contact is an agent and every room is a
team: departments, direct messages, group chats, a Chief of Staff, recurring routines, shared memory, and a
computer for each bot. The agents work **separately** when the job is theirs, and **together** when the job crosses
a boundary.

| Alone, with its own everything | Together, in rooms and handoffs | Accountable by default |
|---|---|---|
| Each bot has its own model, instructions, memory, skills, routines, permissions and computer. Nova does not inherit Kai's context; she gets the sales context she needs and nothing else. | Mention a bot, a department or `@everyone`. The Chief of Staff routes an unaddressed request, and one bot can hand work to another with the thread, the files and the reason attached. | Approvals, permissions, run history and a usage ledger belong to the workspace, not to a prompt. You can see what ran, what it cost, what failed, and who asked for it. |
| **Your models, your machine** | **Memory that belongs to the department** | **Start with one team, not a migration** |
| Keep the Claude, Codex or Grok login you already pay for. Point a bot at a local model or an OpenAI-compatible endpoint. Nothing is proxied through an account you do not control. | People, places, decisions and terms live in department memory and load into every bot in that department. The knowledge stays when a thread is archived or a bot is replaced. | Import a team from one Markdown file, or build one department by hand. Connections stay off until you approve them, routines arrive paused, and no package carries credentials or conversations. |

![Atlas's conversation with a tool-run card and routine results, beside the bot's profile with skills, memory, routines, model and permissions](docs/screenshots/readme/why-workspace.png)

*One bot, one workspace. The conversation, the work it produced, and the settings that make it a teammate:
skills, memory, routines, model, permissions and usage.*

### What this looks like in a company

| Team | The agent owns | The workspace keeps |
|---|---|---|
| **Support** | Inbox triage, routine replies, escalation digests | Refund policy and P1 rules in department memory; every escalation in a run log |
| **Sales** | Lead triage, pipeline review, meeting briefs | Account facts, pricing decisions and the Friday review routine |
| **Engineering** | Nightly build checks, release notes, incident follow-ups | The release train and canary rules; approvals before a deploy |
| **Operations** | Weekly Downloads clean-up, morning briefs, vendor follow-ups | The two-step workflow, its run files, and who approved the change |
| **Finance** | Invoice sweeps and the close checklist | The close calendar, reconciliation rules, and a usage ledger by bot |

The point is not to replace the team. It is to give every role a tireless operator that follows the rules you
already wrote down, asks when a decision is yours, and leaves a receipt.

## Features

Nine primitives, one workspace. Every screenshot below is the running app, not a mockup.

|  |  |
|---|---|
| **Automations**<br>Every trigger in one place: schedules, webhooks and app events, with the next run, the last result and the history. Turn one off without deleting it.<br><br>![Automations list with seven recurring routines, owners, next runs and last results](docs/screenshots/readme/automations.png)<br>*Friday, 18:00 — the Downloads folder cleans itself and reports what it removed.* | **Workflows**<br>A deterministic sequence of steps, each with declared inputs and outputs. The engine verifies the files before the next step starts.<br><br>![The Weekly Downloads clean-up workflow: scan the folder, then remove files older than seven days](docs/screenshots/readme/workflows.png)<br>*Scan, then delete only what is older than seven days; keep PDFs, invoices and folders.* |
| **Schedule**<br>The week at a glance. Routines, calls and the bots that own them on one calendar. Drag a bot onto a time to schedule it.<br><br>![Weekly schedule with inbox triage, the Friday pipeline review and the Downloads clean-up](docs/screenshots/readme/schedule.png)<br>*Thursday's inbox triage, Friday's pipeline review and the 18:00 clean-up, side by side.* | **Team map**<br>Departments, bots and the lines between them. Every card carries its model; every department has its own memory, shared instructions and rooms.<br><br>![Team map with thirteen bots across six departments](docs/screenshots/readme/team-map.png)<br>*Thirteen bots, six departments, one map. Open a card to talk, or move a bot when the team changes.* |
| **Usage**<br>Cost, tokens, runs and failures for any period, by bot and by model. Click a number to chart it; export the ledger when finance asks.<br><br>![Usage over 30 days, charted per day and per bot](docs/screenshots/readme/usage.png)<br>*Thirty days, $194.92 across the team, with the runs that failed and the model that answered.* | **Skills**<br>Teach a skill once, then assign it to the bot that needs it. Skills stay in a local library, with tags, versions and an owner.<br><br>![Skills library with inbox triage, invoice audit and meeting brief assigned to the right bots](docs/screenshots/readme/skills.png)<br>*Inbox triage belongs to Luna; invoice audit to Theo; meeting brief to Nova.* |
| **Routines**<br>A routine is a prompt, a schedule and an owner. Edit the words the bot runs, pick the time, choose the bot, and the next runs appear on the calendar.<br><br>![Routine editor for the Weekly Downloads clean-up](docs/screenshots/readme/routines.png)<br>*The exact prompt, the time, and the bot that owns each run.* | **Memory**<br>Department memory holds people, places, decisions and terms. Every bot in the department gets the accepted notes; proposals wait for an admin.<br><br>![Revenue department memory](docs/screenshots/readme/memory.png)<br>*Marina signs above $50k. Pricing v3 has no exceptions below ten seats. Every Revenue bot knows both.* |
| **Computer**<br>Every bot gets a place to work: auto, a cloud desktop, an isolated local VM, this computer, or off. The panel shows the live screen, browser, data and files.<br><br>![Computer panel for Atlas](docs/screenshots/readme/computer.png)<br>*Auto by default. Cloud desktop with a Boat key. A local VM, this computer after opt-in, or no access.* | **Everything else in the box**<br>Approval cards for shell commands, file edits and questions. Connected apps through Composio. Pin, unread, duplicate and hide bots like contacts. Import a whole team from Markdown and share a department as one file.<br><br>**Streaming replies** with tool-run activity chips · **channels** for each project · **Chief of Staff** routing · **MCP** control from Claude Desktop and Cursor · **voice** replies and calls · **workspace backups**. |

## How it works

Two processes. The app holds no transports of its own — it sends typed commands over HTTP and folds one SSE
event stream into state. The harness server owns every agent process and normalizes each provider's native
protocol into one canonical runtime event stream.

```mermaid
flowchart LR
    subgraph app ["App - React + Tailwind"]
        UI[Chat, model picker, team map, computer panel]
    end
    subgraph server ["Harness server, 127.0.0.1:8799"]
        REG[Driver registry] --> BUS[Event bus, one SSE stream]
        BROKER[Permission broker]
        ROUTINES[Routines and workflows]
    end
    subgraph agents ["Agents on your computer"]
        CL[claude CLI]
        CX[codex CLI]
        GR[grok CLI]
    end
    UI -- "HTTP commands" --> server
    BUS -- "SSE" --> UI
    REG --> CL & CX & GR
    CL & CX & GR -- "permission requests" --> BROKER
    server -- "optional" --> BOAT[("Cloud desktop")]
    server -- "optional" --> APPS[("Gmail, Slack, GitHub, ...")]
```

| Layer | Where | What it does |
|---|---|---|
| Drivers | `server/drivers/` | One per provider: Claude, Codex and Grok Build over their local CLIs, plus a cloud-computer agent. Unknown drivers degrade to "unavailable" instead of crashing the fleet. |
| Harness | `server/harness/` | Registry (configs to live instances) and the fan-in event bus every client folds. |
| API | `server/index.ts` | Bots, turns, approvals, model catalog, computer lifecycle, connectors, routines, workflows and config over HTTP and SSE. |
| App | `src/` | The chat shell. Server-backed store, one reducer, no client-side transports. |
| Desktop | `electron/` | Windows, Linux and macOS shells with an embedded harness; platform capabilities are opt-in and fail closed where the safety boundary is not certified. |

### Orchestrate MimirBot over MCP

MimirBot ships a stdio MCP server for external clients such as Claude Desktop and Cursor. It exposes a bounded
team control plane: inspect bots and channels, read and search compact transcripts, create and configure
bots/channels/tasks, send work, wait for completion, switch models, and interrupt turns. It does **not** expose
approval grants, deletion, arbitrary settings, credentials or computer lifecycle.

See [MCP server setup and tool reference](docs/mcp-server.md).

### Run it from scripts and CI

The headless CLI in this repository drives a running workspace without a screen: set up a team from a file,
give a bot one job, wait until it and every teammate it asked are done, and export what they made. One JSON
document with `--json`, and exit codes a script can branch on.

```sh
pnpm omb team apply team.yaml
pnpm omb run "Room Lead" "Rehearse the launch of https://example.com" --export ./out
```

See [Run MimirBot from scripts and CI](docs/headless-cli.md).

## Quick start

**Released builds:** start at [the latest release](https://github.com/Oliveir4Matheus/mimirbot/releases/latest).
The harness server is embedded, so there is no separate server setup.

| | Download | Install |
|---|---|---|
| **Windows** (x64) | `MimirBot-<version>-setup.exe` | Run it. One-click, per-user, no admin rights. The installer is not code-signed yet, so SmartScreen shows "unknown publisher": **More info -> Run anyway**. |
| **Ubuntu 24.04** (x64) | `MimirBot-<version>-amd64.deb` or `MimirBot-<version>-x86_64.AppImage` | Install the `.deb` with APT (recommended), or make the AppImage executable and run it. Beta; GNOME is the supported desktop. |
| **macOS** | Build from source | No signed `.dmg` is published yet. Follow **From source** below and run `pnpm dev:desktop`. |

See the [Ubuntu Desktop guide](docs/linux-desktop.md) for installation, capabilities and troubleshooting.
Any desktop build can also pair as a client to another Windows, Linux or macOS host over Tailscale; see
[desktop-to-desktop companion mode](docs/desktop-companion.md).

**From source:**

```sh
git clone https://github.com/Oliveir4Matheus/mimirbot && cd mimirbot
pnpm install

pnpm dev:server    # harness server -> 127.0.0.1:8799
pnpm dev           # app -> http://127.0.0.1:5173
pnpm dev:desktop   # Electron shell; keep the two commands above running
```

Requirements: **Windows, Linux or macOS**, **Node 24+**, **pnpm**, and at least one agent CLI —
[`claude`](https://claude.com/claude-code), [`codex`](https://github.com/openai/codex) or
[`grok`](https://x.ai/cli) — installed and logged in. They appear in the model picker automatically.

Package the desktop application:

```sh
pnpm package:win      # Windows: installer + ZIP
pnpm package:linux    # Ubuntu x64: .deb + AppImage
pnpm package:mac      # macOS: DMG + ZIP; requires Swift/Xcode tools
```

### Desktop capability status

| Capability | macOS | Ubuntu 24.04 Xorg | Ubuntu 24.04 Wayland | Windows |
|---|---|---|---|---|
| Packaged app, embedded harness, local agent CLIs | Source | Beta | Beta | Supported |
| Composio and cloud computers | Supported | Beta | Beta | Supported |
| Explicit preview-only local screen capture | Supported | Beta | Beta | Supported |
| Bot control of this computer | Supported | Beta, explicit opt-in | Disabled: Wayland safety gate | Supported |
| Native on-device dictation | Supported | Planned | Planned | Not yet |

The Linux preview is user-initiated and never enables local bot control or Auto routing. On Xorg, the reviewed
Cua Driver runtime starts only after explicit opt-in and without its full-screen cursor overlay. On Wayland the
app never starts it and clears legacy opt-ins while the real-seat safety gate remains unresolved. Chat, preview,
cloud computers and Local VM remain available on both sessions. See the
[Ubuntu Desktop guide](docs/linux-desktop.md).

### Triggers: schedules and webhooks

A trigger is "when something happens, a bot does something". Tell a bot "every weekday at 9, send me a summary of
my inbox" or "whenever our form calls, draft a reply" and it sets the trigger up in that turn with its `trigger`
tool. **Automations** lists every schedule and webhook, with a calendar and the run history. Bots manage them with
`trigger_info`, `trigger` and `delete_trigger`; a webhook a bot creates never shows the bot its secret: the person
copies the link from the card or the Automations page.

Schedules can run once, on selected weekdays, or every 5-1,440 minutes, using either a bot's configured
model/computer or the cloud VM runner. Interval schedules stay aligned to their chosen start time and skip an
occurrence when the previous run is still active, so slow work cannot build an unbounded queue. An optional
advanced run limit can safely stop stuck work; no timeout is imposed unless one is chosen.

**App events** start a bot when something happens in a connected app ("whenever I get an email from Acme, draft a
reply"). Composio sends each event to MimirBot's connected-apps service, which queues it; the app collects the
queue with a long poll, so a desktop needs no public address and events wait while it is closed. Gmail is checked
every 15 minutes; Slack, GitHub and other push apps arrive at once. Details:
[docs/composio.md](docs/composio.md#app-events).

MimirBot starts a webhook-only receiver on `127.0.0.1:8800` by default (or one port above `OMB_PORT`). Set
`OMB_WEBHOOK_PORT` to choose another port. A webhook secret is shown once when the trigger is created or rotated.
Bearer authentication is recommended so the secret stays out of request URLs and most access logs; a single
capability URL remains available for senders that cannot configure headers. The receiver exposes only `/health`
and secret `/hooks/...` endpoints; it never exposes the app's broader API. MimirBot must remain running to accept
a delivery. For public internet delivery, proxy only this dedicated receiver through a hosted relay or a tool such
as Tailscale Funnel.

## Status

MimirBot is in beta. The loop works end to end: message -> agent -> streamed reply -> tools -> approvals ->
computer use, and the team primitives (routines, workflows, memory, skills, usage) are in daily use. Windows and
Ubuntu 24.04 x64 have published builds; Ubuntu remains a beta with the capability limits above. macOS builds from
source. Rough edges to expect: hosted/mobile connectivity is still being built, and webhook triggers use the local
receiver rather than an always-on hosted relay.

The app's **Update channel** setting follows **Main** (stable) or **Beta** (prereleases); an installed app only
offers a version greater than its own. The notes for each version ship in `src/releases/<version>.ts` and open in
the What's new dialog after an update.

Contributions are welcome. The driver SPI in [`server/contracts.ts`](server/contracts.ts) is deliberately small:
adding a provider is one file in [`server/drivers/`](server/drivers/) plus a one-line registration. Any
ACP-speaking CLI or OpenAI-compatible endpoint plugs in through config, with no code:
[`docs/custom-engines.md`](docs/custom-engines.md). Users can add MCP tool servers with no code:
[`docs/custom-mcp-servers.md`](docs/custom-mcp-servers.md).

## Privacy

Usage analytics are optional and anonymous: product events and a once-a-day count of what is set up, never keys,
names, addresses or conversations. Turn them off in **Settings -> General -> Usage analytics**;
[`docs/analytics.md`](docs/analytics.md) lists every event and property.

Agent transcripts, memory, keys and routine history live under `~/.mimirbot` on the machine that runs the
harness. Secrets are write-only in the UI. Cloud computers and connected apps are optional third-party services
with their own accounts and terms.

## Powered by

![Claude](https://img.shields.io/badge/Claude-d97757?logo=claude&logoColor=white)
![Codex](https://img.shields.io/badge/Codex-000000)
![Grok](https://img.shields.io/badge/Grok%20CLI-000000?logo=x&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-2B2E3A?logo=electron&logoColor=9FEAF9)
![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-0F172A?logo=tailwindcss&logoColor=38BDF8)
![Composio](https://img.shields.io/badge/Composio-e6493a)
![Cua](https://img.shields.io/badge/Cua%20Driver-1f2937)
![ElevenLabs](https://img.shields.io/badge/ElevenLabs-000000?logo=elevenlabs&logoColor=white)
![Fish Audio](https://img.shields.io/badge/Fish%20Audio-2563eb)

| Service | Purpose |
|---|---|
| **Claude, Codex, Grok** | The agents behind every bot, run through their local CLIs |
| **Electron** | Desktop shells for Windows, Linux and macOS |
| **React, Vite, Tailwind CSS** | The chat app UI and its build |
| **Composio** | Connected apps: Gmail, Slack, GitHub and more |
| **Cua Driver** | Native computer use on your own machine |
| **ElevenLabs, Fish Audio** | Hosted voices for bots that talk back |
| **Boat** ([boat.dev](https://boat.dev)) | Optional cloud Linux desktops for bots |

## License

[Apache License 2.0](LICENSE) (c) 2026 Milind Soni and MimirBot contributors. Details, including how
contributions are signed off, are in [LICENSING.md](LICENSING.md). MimirBot is based on OpenMausBot, also
Apache-2.0; the original notices are kept in [NOTICE](NOTICE).

Packaged Cua Driver components retain their upstream MIT, SIL OFL 1.1, MPL-2.0 and other dependency terms. The
corresponding notices, license texts, source locations and SBOM are in [`third_party/cua-driver/`](third_party/cua-driver/)
and ship beside the native runtime.

MimirBot is an independent, open-source project inspired by Grok Bot. It is not affiliated with, endorsed by or
associated with xAI; "Grok" is a trademark of its respective owner.
