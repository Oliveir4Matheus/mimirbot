# Lotes de triagem restantes

125 commits sem decisao, agrupados por area. Estado = resultado de um `git cherry-pick -n` no fork em `69a68b116`.

`clean` aplica direto; `conflict` precisa de resolucao manual; `already` ja esta no fork.

## CI, release, testes e refactors (29)

| Commit | Data | Estado | Arquivos | Assunto |
|---|---|---|---|---|
| `32bec83b1` | 2026-10-28 | conflict | 1f | test(store): the reconnect-snapshot tests bring their own localStorage |
| `7818dceee` | 2026-10-28 | conflict | 3f | refactor(ui): move the model picker's local-model probe into its own module |
| `524d0d451` | 2026-10-29 | conflict | 4f | fix(main): move sign-in settling and MCP message projection out of oversized files (#3761) |
| `ab3b3da07` | 2026-10-29 | conflict | 3f | refactor(server): move the credential card host and routes out of index.ts |
| `63a624673` | 2026-10-29 | conflict | 1f | refactor(ui): the app's secret card type is the wire type, so the store stays within its size pin |
| `d280d4433` | 2026-10-30 | conflict | 3f | chore(release): bump version to 0.1.133 (#3857) |
| `0213b7435` | 2026-10-30 | conflict | 3f | chore(release): bump version to 0.1.134 (#3882) |
| `a5509ce53` | 2026-10-30 | conflict | 1f | test(team connections): the chain test waits for each chat's resumed bot, so nothing runs into the next test |
| `426f940d2` | 2026-10-30 | conflict | 1f | test(team connections): count Cleo's work only once Ada's has finished |
| `d46482c5a` | 2026-10-31 | conflict | 1f | ci(boat): one Boat VM per Linux shard, like ci.yml |
| `bd6bfa68a` | 2026-10-31 | clean | 1f | ci: Linux checks on one Boat VM per run, behind vars.BOAT_CI |
| `53c28ec67` | 2026-10-31 | conflict | 30f | test: neutral example names in docs and tests |
| `21628af22` | 2026-10-31 | conflict | 1f | ci(boat): 16 GB boat-large VMs, so typecheck has heap room |
| `4867c2dd6` | 2026-10-31 | clean | 1f | test(local vm): the room turn deadline's limit is limitMs now |
| `d90acf4d6` | 2026-10-31 | clean | 2f | test(settings): the group turn setting is "Stop after no progress for" now |
| `1d3feddad` | 2026-10-31 | conflict | 1f | docs(ci): the Boat job's measured time |
| `1f77ff9ee` | 2026-10-31 | conflict | 2f | ci: a job Boat refuses fails at once, so routing must never send one there |
| `e9a8f5333` | 2026-10-31 | conflict | 10f | ci: Linux on one Boat VM inside ci.yml, and Windows only where a change can break it |
| `d26d7c164` | 2026-10-31 | conflict | 48f | docs: remove screenshots that showed real example data |
| `459c45949` | 2026-10-31 | conflict | 4f | test(sidebar): the DesktopCapabilities stand-ins export windowFramed |
| `be7c5e351` | 2026-10-31 | conflict | 25f | Main green: language guard, talk test, mobile test, shard balance and Windows test fixes (#3989) |
| `2b918a083` | 2026-10-31 | conflict | 3f | chore(release): bump version to 0.1.135 (#3997) |
| `ef2ff9d4d` | 2026-10-31 | conflict | 1f | test(ratchet): the two sizes the 0.1.135 bump tightened before #3950 and #3846 landed (#3998) |
| `1d72a44bd` | 2026-10-31 | conflict | 273f | Train: team-trial fixes, warm summaries, team bot access, own-server places, server lines (merge with Create a merge commit) (#3999) |
| `20dba2bf6` | 2026-11-01 | conflict | 3f | chore(release): bump version to 0.1.136 (#4041) |
| `6c121ca5e` | 2026-11-01 | conflict | 11f | fix(tests): repair main's failing and flaky checks (#3977) |
| `db1ed62ab` | 2026-11-01 | conflict | 2f | chore(release): bump version to 0.1.137 (#4054) |
| `f2f222fc6` | 2026-11-01 | clean | 5f | bench(desktop): one repeatable desktop baseline that prints JSON (#4068) |
| `84bb202f5` | 2026-11-01 | conflict | 3f | chore(release): bump version to 0.1.138 (#4077) |

## Diversos (19)

| Commit | Data | Estado | Arquivos | Assunto |
|---|---|---|---|---|
| `4937ff920` | 2026-10-29 | conflict | 33f | Cancel trial / Cancel plan with a short survey on the plan card (#3747) |
| `4551c7c66` | 2026-10-30 | clean | 2f | fix(linux): skip the optional AppArmor 4 policy only on unrestricted hosts (#3876) |
| `5b4311b50` | 2026-10-30 | conflict | 39f | Simple Bot settings: a bot's backup AIs, working with no switch (#3905) |
| `2b663335f` | 2026-10-31 | conflict | 30f | When a customer leaves: routines pause, the trial credit takes no bots after a sign-out, a failed tool call is named |
| `9eb74a97d` | 2026-10-31 | conflict | 18f | One person-wide preference, saved once, instead of telling every bot (#3945) |
| `b1e76afb6` | 2026-10-31 | conflict | 73f | What's new popup: the new MausBot Cloud and Team's shared bots, once per person, each button tagged for the Cloud's funnel (#4000) |
| `b964f90d5` | 2026-10-31 | conflict | 1f | A bot's name clash looks up its conversation's language only when it clashes (#4003) |
| `604f5575f` | 2026-10-31 | conflict | 4f | fix(desktop): the app menu's Settings opens on a remote server's page (#4029) |
| `165f6fd96` | 2026-10-31 | conflict | 14f | fix(panels): a pinned page that refuses to be framed says so, with Open in browser (#4030) |
| `9519c4ccd` | 2026-11-01 | conflict | 2f | Updater: count a failed check once, and keep the failure notice up during quiet checks (#3966) |
| `03065106b` | 2026-11-01 | conflict | 3f | Desktop: keep desktopNotices.shown so a Cloud page on 0.1.135 doesn't go blank (#4053) |
| `57ca30240` | 2026-11-01 | clean | 3f | fix(browser): compare fnm's PATH link by the Node version it names (#4036) |
| `68490ddea` | 2026-11-01 | conflict | 4f | fix(settings): call the Simple-mode keys row "API keys" (#4039) |
| `ca3478ec6` | 2026-11-01 | conflict | 3f | fix(settings): say the computer setup hint once (#4033) |
| `ee7d52ce6` | 2026-11-01 | conflict | 4f | fix(page): keep the page up, with a reload, when a part of it throws (#4057) |
| `9acd9ab7c` | 2026-11-01 | clean | 2f | test(preload): the bridge keeps every function a page of the last two releases calls (#4059) |
| `ab59ba866` | 2026-11-01 | clean | 4f | fix(browser): opt browser panel out of window drag and handle restore clicks (#3995) (#3996) |
| `a5be3e504` | 2026-11-01 | clean | 2f | Windows: a reused pid no longer holds the data-directory lease when wmic is missing (#4071) |
| `af125b41d` | 2026-11-01 | clean | 3f | fix(browser): offer the install in the panel the person is already on (#4066) |

## Lending, phones e Cloud/computador proprio (17)

| Commit | Data | Estado | Arquivos | Assunto |
|---|---|---|---|---|
| `238bf4ea6` | 2026-10-30 | conflict | 19f | The move to My Cloud warns in the account area, with Try again, instead of a strip over the page (#3866) |
| `dd7045000` | 2026-10-30 | conflict | 22f | Fewer Cloud wakes, stage 1: apps stop reaching a sleeping home, and the home says what woke it (#3872) |
| `8e9a3a92d` | 2026-10-30 | conflict | 24f | ＋ → Add your own server: a box to paste its pairing link, no install commands (#3879) |
| `9d68a0aa4` | 2026-10-30 | clean | 3f | fix(lending): a lent terminal's commands get the person's shell PATH (#3652) |
| `7b9dd52c4` | 2026-10-30 | conflict | 1f | fix(lending): build the usual install folders with POSIX joins (#3899) |
| `8c960af7b` | 2026-10-30 | conflict | 24f | Cloud rail: a Cloud that isn't running shows its state and never hangs; Remove from list (#3908) |
| `29b9400fa` | 2026-10-30 | conflict | 8f | feat(lending): let your own Clouds run commands on this computer from the menu-bar icon (#3933) |
| `7fb1f79b1` | 2026-10-30 | conflict | 38f | feat(lending): a bot changes a lent file by one passage, appends to it, or deletes it |
| `7de00e425` | 2026-10-31 | conflict | 66f | Make a server of your own your bots' home, as My Cloud is (#3948) |
| `9b2c10b20` | 2026-10-31 | conflict | 85f | Windows: lend a PC's apps and screen, say plainly when it can't, and let a Cloud's bot ask to turn it on (#3950) |
| `3e72997a1` | 2026-10-31 | conflict | 6f | fix(lending): an update keeps the terminal a Cloud had, and a room bot can ask for it (#4017) |
| `9dd48816e` | 2026-10-31 | conflict | 16f | fix(lending): a lent computer's command returns its output when it hits its limit, and may run up to 15 minutes (#4018) |
| `aaedba142` | 2026-11-01 | clean | 2f | fix(cloud power): a lent computer's open asks poll never counts as work in progress (#4055) |
| `42c179030` | 2026-11-01 | conflict | 3f | fix(own home): ask a saved server who owns it once at a time, and leave one that did not say alone for a minute (#4058) |
| `c91b82001` | 2026-11-01 | conflict | 3f | Desktop: retry the phone companion when its launch start fails, and log why (#4072) |
| `eb3f8176b` | 2026-11-01 | conflict | 5f | fix(cloud home): the saved place of My Cloud follows the account's machine, and takes the Admin's name for it (#4070) |
| `99b61dcfb` | 2026-11-01 | conflict | 8f | Phones: read a bot's MCP servers (names and switches only) (#4076) |

## Sidebar, rail, janela e modo Simple (16)

| Commit | Data | Estado | Arquivos | Assunto |
|---|---|---|---|---|
| `6500a0d8c` | 2026-10-29 | conflict | 2f | feat(rail): anyone with a Cloud of their own sees the rail, with its ＋ to buy another (#3774) |
| `7345f4c7d` | 2026-10-29 | conflict | 32f | feat(rail): New organization from ＋ for a Team plan with organizations (#3787) |
| `23a71697e` | 2026-10-29 | conflict | 13f | feat(sidebar): pinned web panels, a dashboard one click away (#3806) |
| `66c4876e8` | 2026-10-30 | conflict | 59f | A smaller computers strip you can hide, and the sidebar's colour and picture in Simple's General settings (#3861) |
| `9eb690ed9` | 2026-10-30 | conflict | 5f | fix(sidebar): a Cloud's sidebar is plain, with no night sky or stars (#3880) |
| `bbe4daa65` | 2026-10-30 | clean | 2f | main: the room delete wording moves out of Sidebar.tsx (#3881) |
| `e6cc9b5c6` | 2026-10-30 | conflict | 55f | Simple's sidebar: drag bots to reorder them and into departments (#3906) |
| `ba0af3ca5` | 2026-10-30 | conflict | 6f | fix(sidebar): a member who may not move bots gets no bot drag (#3914) |
| `10af83e74` | 2026-10-30 | conflict | 6f | Simple's sidebar: move the bots, group chats and bot threads like any section (#3910) |
| `18a81845b` | 2026-10-31 | conflict | 32f | Window frame: a thin top bar, a thinner rail, and the app in a rounded card |
| `46fcf2c0e` | 2026-10-31 | conflict | 10f | Window frame: the traffic lights move into the bar only beside a page that draws it (#4006) |
| `8c663d2b7` | 2026-10-31 | conflict | 6f | Bottom-left cards make room for the desktop rail instead of sliding under it (#4008) |
| `007f92a31` | 2026-11-01 | conflict | 145f | Settings → Appearance → Window frame: turn the window's own frame off for the window as it was before (#4012) |
| `ccb66496f` | 2026-11-01 | conflict | 5f | Window frame: the sidebar back in the app's card, and the rail in the bar's colour (#4061) |
| `1f35a3449` | 2026-11-01 | conflict | 4f | fix(sidebar): in Simple mode, show threads that wait on the person under their bot |
| `cdbf1495d` | 2026-11-01 | conflict | 10f | fix(rail): remove a server saved by hand from the rail, and never send the window to one that doesn't answer (#4081) |

## Capacidades novas (12)

| Commit | Data | Estado | Arquivos | Assunto |
|---|---|---|---|---|
| `8eb759455` | 2026-10-28 | conflict | 92f | See what a bot is doing right now: the step, how it is going, and a Now card (#3736) |
| `3544e5173` | 2026-10-29 | conflict | 22f | Credit Boat, our sponsor, for the cloud desktops in the app (#3758) |
| `25e79dd60` | 2026-10-29 | conflict | 69f | feat(talk): hold ⌃⌥Space in any app to talk to MausBot (#3764) |
| `a96950e01` | 2026-10-29 | conflict | 99f | Smaller agents tool list: compact schemas, action tools, fewer tools where a turn can't use them (#3773) |
| `1b0547911` | 2026-10-29 | conflict | 31f | Agents tools: delete_trigger on its own, memory_log back, and merged tools name what they were (#3786) |
| `3ed90a037` | 2026-10-29 | already | 0f | fix(limits): a bot carries on with another AI by itself when its AI reaches a usage limit, and says so once (#3782) |
| `097e8f527` | 2026-10-29 | conflict | 64f | Postiz in Apps: a Social category, so bots can draft, schedule and publish social posts (#3785) |
| `f71928c15` | 2026-10-30 | conflict | 69f | feat(waits): "tell me when…" with no AI running while a bot waits (#3763) |
| `671cf72d1` | 2026-10-30 | conflict | 63f | feat(saved-steps): a bot repeats a computer task it has done before, with no AI (#3762) |
| `18d549510` | 2026-10-30 | conflict | 32f | Agents tools: every turn of a conversation is listed the same tools (#3871) |
| `405846c9b` | 2026-10-30 | conflict | 44f | Room to grow: memory never takes the workspace down, says why in one line, retries, and offers the plan that fixes it |
| `72905754a` | 2026-10-31 | conflict | 47f | Boat's $50 credit offer: a one-time card for everyone, and a lasting copy on the Boat card in Settings |

## Salas, automacoes, calendario, brief e uso (8)

| Commit | Data | Estado | Arquivos | Assunto |
|---|---|---|---|---|
| `f0a2f45ae` | 2026-10-30 | conflict | 3f | fix(calendar): automation cards fit their height (#3863) |
| `71ce6b8c6` | 2026-10-30 | conflict | 3f | fix(brief): align morning wake deadlines to the minute (#3830) |
| `3f2a56786` | 2026-10-31 | clean | 2f | Calendar: a room goal whose room is gone cannot be saved, and a run keeps its own group |
| `d40f17d7f` | 2026-10-31 | conflict | 14f | Keep active automations visible across conversations |
| `95661138d` | 2026-10-31 | conflict | 2f | fix(usage): ChatGPT and other unpriced models show in "Where it went" (#3845) |
| `62f1c0264` | 2026-10-31 | conflict | 2f | fix(rooms): with tool calls off, a room hides a failed step like a 1:1 chat (#3846) |
| `6fe142640` | 2026-10-31 | conflict | 4f | fix(rooms): a room turn waits for a running tool instead of stopping at its limit (#4023) |
| `7eaaac9c7` | 2026-11-01 | clean | 2f | One-on-one goal: a turn that keeps losing its slot ends blocked at the wait cap (#3967) |

## Time, coordenacao e delegacao (8)

| Commit | Data | Estado | Arquivos | Assunto |
|---|---|---|---|---|
| `d124292a2` | 2026-10-30 | conflict | 117f | Team plan fixes from end-to-end testing (#3853) |
| `459e96b4b` | 2026-10-30 | conflict | 17f | Each person's own apps work in work they started: delegated tasks and group chats (#3915) |
| `de5bfe83f` | 2026-10-31 | conflict | 8f | A person's own apps only bring results to that person: work they start where others read runs in a chat of theirs |
| `9368f25b8` | 2026-10-31 | conflict | 11f | fix(coordination): two teammates asking a bot the same thing get one answer (#3957) |
| `541a8a151` | 2026-11-01 | conflict | 21f | Every thread of a bot runs with the bot's Claude settings and follows it to its working folder (#4014) |
| `65a270e61` | 2026-11-01 | conflict | 25f | A teammate's question goes back to the bot that handed the work on, and its follow-ups reach that work (#4016) |
| `a52829ea9` | 2026-11-01 | conflict | 4f | MausBot's notification tools refuse on any shared workspace, not only a Team Cloud (#3961) |
| `7124ebc4f` | 2026-11-01 | conflict | 48f | Team bots: Bot access in Settings, and asking the owner to chat (#4062) |

## Idioma e texto (6)

| Commit | Data | Estado | Arquivos | Assunto |
|---|---|---|---|---|
| `fde016edc` | 2026-10-30 | conflict | 128f | Plain words: MausBot everywhere, no em dashes, no VM, engine or ctx, and errors that say what to do (#3865) |
| `059b0e769` | 2026-10-30 | conflict | 10f | feat(i18n): add Korean locale (#3852) |
| `d693dcf4b` | 2026-10-30 | conflict | 1f | fix(wording): "the Cloud", not "your Cloud", in the terminal-lending refusal |
| `7c43dbfba` | 2026-10-31 | conflict | 3f | Say "MCP server" in the routine pause note, as everyday screens do |
| `5f01634c6` | 2026-10-31 | conflict | 2f | Bots write every line the person sees in the person's language (#3956) |
| `97ee8c731` | 2026-10-31 | conflict | 32f | Server lines in the person's language: the way in, a guard, and bug report lines (#3931) |

## Engines e provedores (6)

| Commit | Data | Estado | Arquivos | Assunto |
|---|---|---|---|---|
| `c88df7052` | 2026-10-30 | conflict | 56f | feat(greenference): Greenference as an AI provider, with its own logo |
| `fc77d3b3d` | 2026-10-31 | conflict | 21f | fix(kimi): install and sign in to Kimi from Settings, on a Cloud with no terminal (#4026) |
| `80012e69d` | 2026-10-31 | clean | 5f | fix(cursor): the picker lists every model the ACP session offers (#4027) |
| `a55540c3f` | 2026-11-01 | conflict | 7f | Accept Copilot Auto when the session leaves the model currentValue unset. (#4044) |
| `9338b7410` | 2026-11-01 | clean | 5f | feat(engines): an OpenAI-compatible server shows its provider's mark (#4067) |
| `9230dc9b7` | 2026-11-01 | clean | 2f | fix(antigravity): skip mode config option when unadvertised by ACP server (#3958) |

## Composer e superficie do chat (3)

| Commit | Data | Estado | Arquivos | Assunto |
|---|---|---|---|---|
| `3f24359e8` | 2026-11-01 | conflict | 3f | Advanced composer: a message past one line gets the full width above the buttons (#3919) |
| `1f1e8f452` | 2026-11-01 | conflict | 5f | Composer: stop at 4 images and say which ones weren't attached (#4032) |
| `6d32b86b2` | 2026-11-01 | conflict | 21f | Composer: steer, queue or restart a message sent while a bot works (#4069) |

## Seguranca, segredos e dependencias (1)

| Commit | Data | Estado | Arquivos | Assunto |
|---|---|---|---|---|
| `7650dd229` | 2026-10-29 | conflict | 53f | feat(secrets): bots ask for any secret on the secure card, as a one-use ref or a private file |
