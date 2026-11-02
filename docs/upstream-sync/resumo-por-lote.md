# Upstream sync: o que cada lote resolveu

Upstream `milind-soni/OpenMausBot` @ `ac08cf72a`, aplicado em
`feat/upstream-lote-ci-seguranca` sobre `69a68b116` (fork `0.1.151`).

Cada lote foi aplicado num worktree próprio, com os testes tocados e o
`pnpm typecheck` verdes antes de entrar na branch, e o lote seguinte foi
testado contra o estado que o anterior deixou.

| Lote | Commits | Problema que foi resolvido |
|---|---|---|
| 1 — Segurança | 4 | Tokens GitLab (glpat/gldt/glrtr), `Authorization: Basic` e Slack `xapp-` apareciam sem máscara em logs e mensagens; agora são mascarados como as demais credenciais. |
| 2 — Dependências e MCP | 2 | O sign-in de um MCP era cancelado em vez de abrir a página; agora abre em `127.0.0.1`. better-auth 1.7.7 e happy-dom 21.0.4 fecham vulnerabilidades conhecidas. |
| 3 — Testes instáveis | 5 | Cinco testes falhavam por relógio, porta sorteada ou leitura única; agora esperam o que verificam, cortando falhas falsas no CI. |
| 4 — CI e release | 3 | O build Mac quebraria no `macos-14` aposentado e o staple desistia cedo; agora usa `macos-15`, tenta seis vezes, e o job static não baixa blobs. |
| 5 — Correções de plataforma | 13 | Agente ACP sem modo, ícone de provider, modelos do Cursor, PATH do fnm, painel do browser, lease de pid no Windows, PATH emprestado, meta 1:1 e AppArmor. |
| 6 — Engines e composer | 10 | Composer passa a steerar, enfileirar ou reiniciar com o bot trabalhando; Copilot Auto, Kimi pela Settings, Greenference, limite de 4 imagens e textos no idioma da pessoa. |
| 10 — Features | 11 | Crédito do Boat, lista de ferramentas dos agents enxuta, esperas sem IA, passos salvos reutilizáveis e um cartão "Now" com o que o bot está fazendo. |
| 11 — Correções que caem no fork | 15 | Sala não morre esperando tool longa; dois colegas pedindo o mesmo ao bot recebem uma resposta; Simple mode mostra as threads que esperam você; a página sobrevive a um erro. |

Total: **58 commits do upstream aplicados**, mais 5 commits de casa (ratchet de
tamanho e ajustes de teste).

## Descartados neste sync

| Commit | Por quê |
|---|---|
| `405846c9b` | Sem a base: retry automático em `chief-notices`, `first-hour.ts`, `value-ledger.ts`, `AccountMove` na sidebar e `browser-page-size.ts`. |
| `097e8f527` | Sem a base: o fork ainda tem `ApiKeys.tsx` plano, sem `keys/key-catalog.ts`, `key-save.ts` ou `SavedKey`. |
| `25e79dd60` | Sem a base: Simple mode, `update-when-quiet.mjs` e o rail/own-Cloud de `electron/main.mjs`. |
| `97ee8c731`, `7c43dbfba`, `d693dcf4b`, `059b0e769`, `fde016edc` | Sem a base (server lines, routine holds, empréstimo de terminal, coreano) ou rename para MausBot. |

Cada um está registrado em `decisions.json` com `status: "ignored"` e o motivo.

## Lote 11: o que foi adaptado

Os 15 commits deste lote mexem em código que o fork tem. Sete entraram sem
conflito; oito precisaram de ajuste, porque o upstream mudou junto com features
que o fork não tem:

| Commit | Ajuste |
|---|---|
| `62f1c0264` | Sem `quietRow`/`Message.relay`: entra só a regra de visibilidade, e o teste perde a comparação com o 1:1 |
| `9368f25b8` | `runtime-coordinator` e `share-answer` inteiros; no `index.ts` só o import novo, porque o bloco de imports dele é de features ausentes |
| `1f35a3449` | Teste mantém o marcador de não-lido do fork (`aria-label="Unread threads"`) no lugar do `data-testid` deles |
| `ee7d52ce6` | Só o import do `PageBoundary`: o fork não tem `lib/session-ended` |
| `604f5575f` | `onOpenAppSettings` passa de `HOME_PAGE` para `REMOTE_SAFE`; o bloco de `rail-beside` não existe aqui |
| `c91b82001` | Sem `ownHome`: o retry e o log do companion entram iguais |
| `ca3478ec6` | Teste do VPS fica com os textos do fork, sem a asserção de `connectBoatHint` |
| `f2f222fc6` | Só acrescenta `scripts/bench-desktop*` |

Quatro ficaram de fora, com motivo em `decisions.json`:

| Commit | Por quê |
|---|---|
| `ec6fd25e9` | O fork não tem nenhuma chave `rail.*`; o rail dele é `src/mimir/RailShell.tsx` |
| `95661138d` | A página de uso do fork é `UsageRank`/`RankList`; não existe `GroupBars` |
| `8c663d2b7` | Não existe `--rail-beside` no CSS do fork |
| `03065106b` | O fork ainda tem o IPC `desktop-notices:shown` em `electron/desktop-prefs.mjs`, testado: nada quebra |

## Merge com o fork (0.1.158)

O trabalho foi feito sobre `0.1.151`; o `mimirbot` já estava em **0.1.158**
(58 commits, 174 arquivos). O merge traz os dois lados: 6 arquivos conflitaram
e foram resolvidos mantendo o que o 0.1.158 construiu e somando o nosso:

| Arquivo | Resolução |
|---|---|
| `src/components/Sidebar.tsx` | `simpleRow` e `useVisibleMessages` deles; linha advanced ocupada mostra o passo (`SidebarWorkingStep`) |
| `server/drivers/acp/quiet-status.ts` | `ProcReader`/`sampleLinuxProc` deles + `systemTool`/`startedSince` nossos |
| `server/index.ts` | `limitTakeover`/`startupBackups` deles + `savedSteps.dispatch` nosso |
| `server/drivers/acp/core.ts`, `quiet-status.test.ts` | união de imports |
| `scripts/testing/file-size-ratchet.test.ts` | maior pin dos dois lados |

## Falha conhecida

`server/connected-app-tools.e2e.test.ts` falha a partir do commit do "Now card"
(`35be290cc`): passa em `cd15d5520`, falha em `35be290cc`, e **passa no
`upstream/main`** com o mesmo teste e o mesmo fake. O servidor que responde ao
bridge tem zero capabilities internas, então o token do connector volta 401.
Não é crash nem estado local (reproduz em worktree limpo). Fica como pendência
do próximo sync.

