# Upstream pendente de triagem

Upstream `https://github.com/milind-soni/OpenMausBot` @ `ac08cf72a`
Merge base `0d8eacc65`, fork em `69a68b116`.

**125 commits sem entrada em `decisions.json`** de 716 nao-merge em `mergeBase..upstream/main`.

## Resumo por area

| Area | Commits |
|---|---|
| CI, release, testes e refactors | 29 |
| Diversos | 19 |
| Lending, phones e Cloud/computador proprio | 17 |
| Sidebar, rail, janela e modo Simple | 16 |
| Capacidades novas | 12 |
| Time, coordenacao e delegacao | 8 |
| Salas, automacoes, calendario, brief e uso | 8 |
| Engines e provedores | 6 |
| Idioma e texto | 6 |
| Composer e superficie do chat | 3 |
| Seguranca, segredos e dependencias | 1 |

## CI, release, testes e refactors

- `32bec83b1` 2026-10-28 test(store): the reconnect-snapshot tests bring their own localStorage
- `7818dceee` 2026-10-28 refactor(ui): move the model picker's local-model probe into its own module
- `524d0d451` 2026-10-29 fix(main): move sign-in settling and MCP message projection out of oversized files (#3761)
- `ab3b3da07` 2026-10-29 refactor(server): move the credential card host and routes out of index.ts
- `63a624673` 2026-10-29 refactor(ui): the app's secret card type is the wire type, so the store stays within its size pin
- `d280d4433` 2026-10-30 chore(release): bump version to 0.1.133 (#3857)
- `0213b7435` 2026-10-30 chore(release): bump version to 0.1.134 (#3882)
- `a5509ce53` 2026-10-30 test(team connections): the chain test waits for each chat's resumed bot, so nothing runs into the next test
- `426f940d2` 2026-10-30 test(team connections): count Cleo's work only once Ada's has finished
- `d46482c5a` 2026-10-31 ci(boat): one Boat VM per Linux shard, like ci.yml
- `bd6bfa68a` 2026-10-31 ci: Linux checks on one Boat VM per run, behind vars.BOAT_CI
- `53c28ec67` 2026-10-31 test: neutral example names in docs and tests
- `21628af22` 2026-10-31 ci(boat): 16 GB boat-large VMs, so typecheck has heap room
- `4867c2dd6` 2026-10-31 test(local vm): the room turn deadline's limit is limitMs now
- `d90acf4d6` 2026-10-31 test(settings): the group turn setting is "Stop after no progress for" now
- `1d3feddad` 2026-10-31 docs(ci): the Boat job's measured time
- `1f77ff9ee` 2026-10-31 ci: a job Boat refuses fails at once, so routing must never send one there
- `e9a8f5333` 2026-10-31 ci: Linux on one Boat VM inside ci.yml, and Windows only where a change can break it
- `d26d7c164` 2026-10-31 docs: remove screenshots that showed real example data
- `459c45949` 2026-10-31 test(sidebar): the DesktopCapabilities stand-ins export windowFramed
- `be7c5e351` 2026-10-31 Main green: language guard, talk test, mobile test, shard balance and Windows test fixes (#3989)
- `2b918a083` 2026-10-31 chore(release): bump version to 0.1.135 (#3997)
- `ef2ff9d4d` 2026-10-31 test(ratchet): the two sizes the 0.1.135 bump tightened before #3950 and #3846 landed (#3998)
- `1d72a44bd` 2026-10-31 Train: team-trial fixes, warm summaries, team bot access, own-server places, server lines (merge with Create a merge commit) (#3999)
- `20dba2bf6` 2026-11-01 chore(release): bump version to 0.1.136 (#4041)
- `6c121ca5e` 2026-11-01 fix(tests): repair main's failing and flaky checks (#3977)
- `db1ed62ab` 2026-11-01 chore(release): bump version to 0.1.137 (#4054)
- `f2f222fc6` 2026-11-01 bench(desktop): one repeatable desktop baseline that prints JSON (#4068)
- `84bb202f5` 2026-11-01 chore(release): bump version to 0.1.138 (#4077)

## Diversos

- `4937ff920` 2026-10-29 Cancel trial / Cancel plan with a short survey on the plan card (#3747)
- `4551c7c66` 2026-10-30 fix(linux): skip the optional AppArmor 4 policy only on unrestricted hosts (#3876)
- `5b4311b50` 2026-10-30 Simple Bot settings: a bot's backup AIs, working with no switch (#3905)
- `2b663335f` 2026-10-31 When a customer leaves: routines pause, the trial credit takes no bots after a sign-out, a failed tool call is named
- `9eb74a97d` 2026-10-31 One person-wide preference, saved once, instead of telling every bot (#3945)
- `b1e76afb6` 2026-10-31 What's new popup: the new MausBot Cloud and Team's shared bots, once per person, each button tagged for the Cloud's funnel (#4000)
- `b964f90d5` 2026-10-31 A bot's name clash looks up its conversation's language only when it clashes (#4003)
- `604f5575f` 2026-10-31 fix(desktop): the app menu's Settings opens on a remote server's page (#4029)
- `165f6fd96` 2026-10-31 fix(panels): a pinned page that refuses to be framed says so, with Open in browser (#4030)
- `9519c4ccd` 2026-11-01 Updater: count a failed check once, and keep the failure notice up during quiet checks (#3966)
- `03065106b` 2026-11-01 Desktop: keep desktopNotices.shown so a Cloud page on 0.1.135 doesn't go blank (#4053)
- `57ca30240` 2026-11-01 fix(browser): compare fnm's PATH link by the Node version it names (#4036)
- `68490ddea` 2026-11-01 fix(settings): call the Simple-mode keys row "API keys" (#4039)
- `ca3478ec6` 2026-11-01 fix(settings): say the computer setup hint once (#4033)
- `ee7d52ce6` 2026-11-01 fix(page): keep the page up, with a reload, when a part of it throws (#4057)
- `9acd9ab7c` 2026-11-01 test(preload): the bridge keeps every function a page of the last two releases calls (#4059)
- `ab59ba866` 2026-11-01 fix(browser): opt browser panel out of window drag and handle restore clicks (#3995) (#3996)
- `a5be3e504` 2026-11-01 Windows: a reused pid no longer holds the data-directory lease when wmic is missing (#4071)
- `af125b41d` 2026-11-01 fix(browser): offer the install in the panel the person is already on (#4066)

## Lending, phones e Cloud/computador proprio

- `238bf4ea6` 2026-10-30 The move to My Cloud warns in the account area, with Try again, instead of a strip over the page (#3866)
- `dd7045000` 2026-10-30 Fewer Cloud wakes, stage 1: apps stop reaching a sleeping home, and the home says what woke it (#3872)
- `8e9a3a92d` 2026-10-30 ＋ → Add your own server: a box to paste its pairing link, no install commands (#3879)
- `9d68a0aa4` 2026-10-30 fix(lending): a lent terminal's commands get the person's shell PATH (#3652)
- `7b9dd52c4` 2026-10-30 fix(lending): build the usual install folders with POSIX joins (#3899)
- `8c960af7b` 2026-10-30 Cloud rail: a Cloud that isn't running shows its state and never hangs; Remove from list (#3908)
- `29b9400fa` 2026-10-30 feat(lending): let your own Clouds run commands on this computer from the menu-bar icon (#3933)
- `7fb1f79b1` 2026-10-30 feat(lending): a bot changes a lent file by one passage, appends to it, or deletes it
- `7de00e425` 2026-10-31 Make a server of your own your bots' home, as My Cloud is (#3948)
- `9b2c10b20` 2026-10-31 Windows: lend a PC's apps and screen, say plainly when it can't, and let a Cloud's bot ask to turn it on (#3950)
- `3e72997a1` 2026-10-31 fix(lending): an update keeps the terminal a Cloud had, and a room bot can ask for it (#4017)
- `9dd48816e` 2026-10-31 fix(lending): a lent computer's command returns its output when it hits its limit, and may run up to 15 minutes (#4018)
- `aaedba142` 2026-11-01 fix(cloud power): a lent computer's open asks poll never counts as work in progress (#4055)
- `42c179030` 2026-11-01 fix(own home): ask a saved server who owns it once at a time, and leave one that did not say alone for a minute (#4058)
- `c91b82001` 2026-11-01 Desktop: retry the phone companion when its launch start fails, and log why (#4072)
- `eb3f8176b` 2026-11-01 fix(cloud home): the saved place of My Cloud follows the account's machine, and takes the Admin's name for it (#4070)
- `99b61dcfb` 2026-11-01 Phones: read a bot's MCP servers (names and switches only) (#4076)

## Sidebar, rail, janela e modo Simple

- `6500a0d8c` 2026-10-29 feat(rail): anyone with a Cloud of their own sees the rail, with its ＋ to buy another (#3774)
- `7345f4c7d` 2026-10-29 feat(rail): New organization from ＋ for a Team plan with organizations (#3787)
- `23a71697e` 2026-10-29 feat(sidebar): pinned web panels, a dashboard one click away (#3806)
- `66c4876e8` 2026-10-30 A smaller computers strip you can hide, and the sidebar's colour and picture in Simple's General settings (#3861)
- `9eb690ed9` 2026-10-30 fix(sidebar): a Cloud's sidebar is plain, with no night sky or stars (#3880)
- `bbe4daa65` 2026-10-30 main: the room delete wording moves out of Sidebar.tsx (#3881)
- `e6cc9b5c6` 2026-10-30 Simple's sidebar: drag bots to reorder them and into departments (#3906)
- `ba0af3ca5` 2026-10-30 fix(sidebar): a member who may not move bots gets no bot drag (#3914)
- `10af83e74` 2026-10-30 Simple's sidebar: move the bots, group chats and bot threads like any section (#3910)
- `18a81845b` 2026-10-31 Window frame: a thin top bar, a thinner rail, and the app in a rounded card
- `46fcf2c0e` 2026-10-31 Window frame: the traffic lights move into the bar only beside a page that draws it (#4006)
- `8c663d2b7` 2026-10-31 Bottom-left cards make room for the desktop rail instead of sliding under it (#4008)
- `007f92a31` 2026-11-01 Settings → Appearance → Window frame: turn the window's own frame off for the window as it was before (#4012)
- `ccb66496f` 2026-11-01 Window frame: the sidebar back in the app's card, and the rail in the bar's colour (#4061)
- `1f35a3449` 2026-11-01 fix(sidebar): in Simple mode, show threads that wait on the person under their bot
- `cdbf1495d` 2026-11-01 fix(rail): remove a server saved by hand from the rail, and never send the window to one that doesn't answer (#4081)

## Capacidades novas

- `8eb759455` 2026-10-28 See what a bot is doing right now: the step, how it is going, and a Now card (#3736)
- `3544e5173` 2026-10-29 Credit Boat, our sponsor, for the cloud desktops in the app (#3758)
- `25e79dd60` 2026-10-29 feat(talk): hold ⌃⌥Space in any app to talk to MausBot (#3764)
- `a96950e01` 2026-10-29 Smaller agents tool list: compact schemas, action tools, fewer tools where a turn can't use them (#3773)
- `1b0547911` 2026-10-29 Agents tools: delete_trigger on its own, memory_log back, and merged tools name what they were (#3786)
- `3ed90a037` 2026-10-29 fix(limits): a bot carries on with another AI by itself when its AI reaches a usage limit, and says so once (#3782)
- `097e8f527` 2026-10-29 Postiz in Apps: a Social category, so bots can draft, schedule and publish social posts (#3785)
- `f71928c15` 2026-10-30 feat(waits): "tell me when…" with no AI running while a bot waits (#3763)
- `671cf72d1` 2026-10-30 feat(saved-steps): a bot repeats a computer task it has done before, with no AI (#3762)
- `18d549510` 2026-10-30 Agents tools: every turn of a conversation is listed the same tools (#3871)
- `405846c9b` 2026-10-30 Room to grow: memory never takes the workspace down, says why in one line, retries, and offers the plan that fixes it
- `72905754a` 2026-10-31 Boat's $50 credit offer: a one-time card for everyone, and a lasting copy on the Boat card in Settings

## Time, coordenacao e delegacao

- `d124292a2` 2026-10-30 Team plan fixes from end-to-end testing (#3853)
- `459e96b4b` 2026-10-30 Each person's own apps work in work they started: delegated tasks and group chats (#3915)
- `de5bfe83f` 2026-10-31 A person's own apps only bring results to that person: work they start where others read runs in a chat of theirs
- `9368f25b8` 2026-10-31 fix(coordination): two teammates asking a bot the same thing get one answer (#3957)
- `541a8a151` 2026-11-01 Every thread of a bot runs with the bot's Claude settings and follows it to its working folder (#4014)
- `65a270e61` 2026-11-01 A teammate's question goes back to the bot that handed the work on, and its follow-ups reach that work (#4016)
- `a52829ea9` 2026-11-01 MausBot's notification tools refuse on any shared workspace, not only a Team Cloud (#3961)
- `7124ebc4f` 2026-11-01 Team bots: Bot access in Settings, and asking the owner to chat (#4062)

## Salas, automacoes, calendario, brief e uso

- `f0a2f45ae` 2026-10-30 fix(calendar): automation cards fit their height (#3863)
- `71ce6b8c6` 2026-10-30 fix(brief): align morning wake deadlines to the minute (#3830)
- `3f2a56786` 2026-10-31 Calendar: a room goal whose room is gone cannot be saved, and a run keeps its own group
- `d40f17d7f` 2026-10-31 Keep active automations visible across conversations
- `95661138d` 2026-10-31 fix(usage): ChatGPT and other unpriced models show in "Where it went" (#3845)
- `62f1c0264` 2026-10-31 fix(rooms): with tool calls off, a room hides a failed step like a 1:1 chat (#3846)
- `6fe142640` 2026-10-31 fix(rooms): a room turn waits for a running tool instead of stopping at its limit (#4023)
- `7eaaac9c7` 2026-11-01 One-on-one goal: a turn that keeps losing its slot ends blocked at the wait cap (#3967)

## Engines e provedores

- `c88df7052` 2026-10-30 feat(greenference): Greenference as an AI provider, with its own logo
- `fc77d3b3d` 2026-10-31 fix(kimi): install and sign in to Kimi from Settings, on a Cloud with no terminal (#4026)
- `80012e69d` 2026-10-31 fix(cursor): the picker lists every model the ACP session offers (#4027)
- `a55540c3f` 2026-11-01 Accept Copilot Auto when the session leaves the model currentValue unset. (#4044)
- `9338b7410` 2026-11-01 feat(engines): an OpenAI-compatible server shows its provider's mark (#4067)
- `9230dc9b7` 2026-11-01 fix(antigravity): skip mode config option when unadvertised by ACP server (#3958)

## Idioma e texto

- `fde016edc` 2026-10-30 Plain words: MausBot everywhere, no em dashes, no VM, engine or ctx, and errors that say what to do (#3865)
- `059b0e769` 2026-10-30 feat(i18n): add Korean locale (#3852)
- `d693dcf4b` 2026-10-30 fix(wording): "the Cloud", not "your Cloud", in the terminal-lending refusal
- `7c43dbfba` 2026-10-31 Say "MCP server" in the routine pause note, as everyday screens do
- `5f01634c6` 2026-10-31 Bots write every line the person sees in the person's language (#3956)
- `97ee8c731` 2026-10-31 Server lines in the person's language: the way in, a guard, and bug report lines (#3931)

## Composer e superficie do chat

- `3f24359e8` 2026-11-01 Advanced composer: a message past one line gets the full width above the buttons (#3919)
- `1f1e8f452` 2026-11-01 Composer: stop at 4 images and say which ones weren't attached (#4032)
- `6d32b86b2` 2026-11-01 Composer: steer, queue or restart a message sent while a bot works (#4069)

## Seguranca, segredos e dependencias

- `7650dd229` 2026-10-29 feat(secrets): bots ask for any secret on the secure card, as a one-use ref or a private file
## Ja mostrados ao dono, deixados sem decisao (`pending`) (41)

Pela regra do proprio arquivo, so voltam a mesa quando ficarem relevantes. Nao sao backlog ativo.

- `2971e0d6d` A Chief's new bots start with the Chief's connected apps
- `93c93ee9f` test(comms): a Chief-made operator starts with the Chief's connected apps
- `d6306866f` fix(coordination): keep coordinate_bots within the catalog budget, and refresh the bridged goldens
- `1aa2e2025` Start a person's direct message beside the bot's room turn when a thread slot is free.
- `559ce8cce` One room-turn rule for a person's sends, now and queued; index.ts stays at its pin
- `164372adb` test: stabilize server ports and coordination readiness
- `2b7010d2d` Team Cloud: teammates' pictures instead of their initials
- `62c809ec2` Team Cloud: @mention teammates, and bots can pass a message to a person
- `b2d0e846d` Speak replies sooner: a short first block, and speech while the reply is written
- `9e653373b` test: retry the owned identity probe once after an aborted navigation
- `e13646e69` test: wait for completed cloud sleep retry instead of a fixed delay
- `8cfef6493` test: fix Windows browser fixtures and catalog expectations
- `9558ad9c6` test(ci): match the shared Vitest timeout
- `1a7dd2eae` test: fix Windows drive-root fixture and allow CI headroom
- `26c3e1f74` test: allow Windows Chrome cleanup handles to settle
- `ab0296993` Fix cross-platform CI fixtures after upstream sync
- `b9e666ec1` feat(chat): watch for a first reply that never comes
- `45b74bb0c` feat(chat): post the first-reply rescue in every chat
- `d1db6dd55` fix(chat): a Stop ends with one quiet line and never reaches the next turn
- `8887f8285` feat(chat): rescue row buttons, "You stopped this.", one Stop per press
- `3415aece6` fix(chat): a Stop the server finds already over stops naming that turn
- `7486dacb1` fix(chat): the rescue row belongs to its turn, and Stop fences on the running turn
- `9197d5dcc` fix(acp): plain words in what a quiet or empty turn tells the person
- `b6a238c62` feat(chat): Switch AI opens this bot's picker for this turn, and switches only on a pick
- `1335b3718` fix(chat): the picker stops taking Switch AI once the row's turn is over
- `54706fb97` fix(chat): a stop mark and a live turn id never outlive their turn
- `42a6d2058` fix(chat): a restart closes the rescue notices it left open
- `fe5f58476` fix(chat): an ended rescue notice reads as history
- `b2d993067` fix(chat): a Switch AI pick lands once the chat is idle, and resends only when that is safe
- `cbea5d480` fix(chat): Switch AI picks are kept per chat and survive a turn that starts first
- `e54a83c37` test(chat): say what a Stop pressed during a dispatch does
- `8c3313c47` chore: lower the size pins this branch shrank
- `97f565e8e` fix(chat): a picker opened before its engine lists models says it is loading, then shows them
- `7ccbfed10` docs(pr): screenshots for the quiet-chat rescue
- `3cb4a7c40` i18n(chat): translate the rescue row, "You stopped this." and the model loading line
- `a8a31da05` refactor(ratchet): move roomNeedsSetup out of GroupView and lower chat pins
- `c727c8ef4` Size the rescue row and model-list status in whole pixels
- `49088dc76` fix(browser): the bot's live page fills its panel on both engines, at a desktop's width (#3691)
- `14067581e` Settings: API keys in plain sections, one key row everywhere (#3692)
- `29d3bbb6f` Advanced mode takes Simple's visual language: palette, menus, surfaces, buttons and icons (#3690)
- `3dc872825` A one-time Simple mode popup for everyone, and the mode on app_active (#3688)

## Queridos, mas bloqueados (`deferred`) (14)

Vale revisitar: cada um tem um motivo de bloqueio anotado.

- `87c156828` A run nobody stopped says it was cut off, and a stopped run says why
- `b818a7cd1` fix(reply): the reply habits name no files, so routine prompts stay free of memory-file names
- `e00a082e3` fix(chat): a table uses the message's full width and shows every column
- `698cef40c` fix(automations): plain time zones, "First run Mon 9:00", panels titled by name
- `7b16145c1` fix(i18n): Russian "Use my Mac" popup words, and the lending note names its button (#3625)
- `47405e69e` Only the desktop app's own server may use this computer
- `c7899ef99` The morning brief is pushed once when another edit comes as it posts; Polish says 'około 2 godzin'
- `5c8b975fb` fix(mcp): keep failed personal connections disabled
- `4bec110a6` fix(mcp): keep replacement personal keys out of shared headers
- `0a223df4d` fix(mcp): defer shared headers until personal setup succeeds
- `3ff877878` feat(team): the inbox as a list in the right panel, and one live card in the inbox chat (#3735) - Batch 11 inbox panel/card feature. Same missing Team Cloud inbox base as baa8425f30 (person-inbox.ts, team-messages.ts, shared/inbox.ts, inbox UI); not applicable without adopting 62c809ec2 and 32e46312a first.
- `d915c2d8a` test(team-messages): Marco's assistant reads a fixed clock, so his Thursday slot is still ahead (#3850) - Batch 11 test fix for server/host/team-messages.test.ts, which does not exist without the Team Cloud inbox base.
- `d779bb16f` feat(cloud): this computer works for each of your Clouds automatically (#3734) - Batch 10, skipped after a trial pick (51 content conflicts, 8 upstream deletes of files we changed). It needs the multi-Cloud rail base the fork never adopted: electron/cloud-rail.mjs, the session contract v1 clouds list, otherOwnClouds/parseCloudList and pairHome(cloudId) in electron/cloud-account.mjs (ours has pairHome() for My Cloud only and no state().clouds), account().isOwnCloud(), and the Admin routes POST/PATCH desktop/clouds. It also deletes our Use my computer model outright (electron/use-my-computer.mjs, electron/cloud-lending-ipc.mjs, src/components/CloudLending.tsx, LentComputers.tsx, the popup and its words) in favour of automatic lending to every own Cloud, which reverses the fork's decision behind deferred 47405e69e7. Needs a hand port on top of an adopted rail base, not a pick.
- `0a98081db` fix(tts): stop failed stream audio before publishing idle

## Em observacao, sem decisao (`observation`) (19)

Ficam de olho ate importarem.

- `99b6dbf0c` test(updater): run the root install script tests on Linux only
- `6b0053ae9` Linux .deb: install updates behind one password prompt instead of a terminal
- `664f5ed04` Fix the keys: say which headers a server refused and ask for just those values
- `259c9d8e3` Add an MCP server by pasting its link or setup command
- `5a9ba47ae` test: include the MCP query_result helper in app tool expectations
- `4003ac6ec` Composio: apps that need your own OAuth app connect with an auth config made in the dashboard
- `b60d40898` fix(composio-broker): resume the idle trigger sweep where it stopped
- `117d3c646` fix(updates): let the latest consent answer win over a sync in flight
- `f08c737d2` fix(external-runtime): a finished hand-off leaves the runtime's conversation read
- `3bc9f57f7` test(agents catalog): refresh the tool-list goldens after rebasing onto main
- `3ca542f0c` Approval level: change it while the bot works (#3627)
- `a9d725204` New bot makes the bot at once and opens its chat, with no popup
- `6ed71aa83` Bots answer first, ask one thing, and remember and forget in plain words
- `e3b9af254` fix(composio-broker): bind sessions to the current acting user (#3717) - Only matters if we host the Composio broker; on watch with the other Composio commits.
- `905a3d251` OpenRouter and other API-key models work again on Windows: the built-in tools fit the 128-tool limit (#3811) - Tool-count limit for Windows API-key models; the fork has its own tool-count-limit.ts.
- `44dd7f67f` fix(antigravity): saved Low/Medium/High Gemini Flash picks run again (#3807) - Re-lands 1e4a6de69; the fork's antigravity-acp.ts keeps its own catalog path.
- `75c6c4b40` Revert "fix(antigravity): normalize legacy effort models (#3748)" for 0.1.131 (#3770) - Revert of code the fork never took; nothing to undo.
- `1e4a6de69` fix(antigravity): normalize legacy effort models (#3748) - The upstream reverted it (75c6c4b406) and re-landed it as 44dd7f67f8; neither side is in the fork.
- `baa8425f3` fix(team): an inbox item stays listed only while it really waits, and its count shows on the inbox (#3724) - Batch 11 inbox item/count fix. Depends on the Team Cloud inbox base the fork never adopted (upstream 32e46312a ignored, 62c809ec2 pending): server/host/person-inbox.ts, team-messages.ts, representative.ts, shared/inbox.ts and the inbox UI. Importing that is a 100+ file product change (removes team-briefs.ts, rewires notifications), not a safe adaptation; revisit only if the fork adopts the inbox base.
