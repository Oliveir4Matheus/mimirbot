# Triagem do upstream — lógica dos apps — 2026-11-26

Fork `mimirbot` @ `69d779551` (0.1.191-beta.1) · upstream `milind-soni/OpenMausBot` @ `46f016125` (main, 2026-11-27) · merge base `0d8eacc65`.

Fonte de verdade: `decisions.json`. Um commit conta como triado quando tem entrada no arquivo, com qualquer status.

## Escopo

Esta passagem olha **somente a lógica dos apps** (connected apps/Composio, bridge de conectores, MCP sign-in/transporte, automações de app-event, painel de Apps e MCP servers) na janela **2026-11-18 a 2026-11-27**, depois da última passagem (`untriaged-2026-11-18.md`).

| | |
|---|---|
| Commits não-merge em `35d044295..upstream/main` | 1.317 |
| Commits totais (com merges) na janela | 2.003 |
| Commits que tocam a lógica dos apps | **34** |
| Com entrada em `decisions.json` antes desta passagem | 0 |
| Aplicados nesta passagem | 8 |
| Adiados (base/feature ausente no fork) | 15 |
| Ignorados (regra, teste, CI, feature que o fork não tem) | 11 |

O restante da janela (1.284 commits: engines, desktop, browser, cloud, time, sidebar, idioma, release) **não** foi triado aqui; continua no backlog da próxima passagem geral.

## Método

- `git log --no-merges --name-only 35d044295..upstream/main` para achar os commits que tocam os arquivos de apps.
- Conferência de base arquivo a arquivo contra `HEAD` (`server/composio*`, `shared/connector*`, `server/connector*`, `server/app-trigger*`, `server/app-event*`, `src/components/PluginsPanel*`, `src/components/McpServersPanel*`, `electron/managed-composio.mjs`, `cloudflare/composio-broker/**`).
- Leitura do diff de cada candidato e do estado atual do fork.
- Aplicação só onde a base existe; testes tocados + typecheck + lint antes de registrar `applied`.

Estados: `applied` = portado para o fork; `deferred` = faz sentido, mas depende de uma feature/arquitetura que o fork ainda não tem; `ignored` = não se aplica ou é coberto por regra.

## Aplicados (8)

Commit do fork: `56c302f2e`.

| Commit | Data | Assunto | Por que entrou |
|---|---|---|---|
| `d0d95ebe9` | 11-25 | fix(mcp): keep JSON-RPC frames with U+2028/U+2029 whole on stdio | `node:readline` corta frames em U+2028/U+2029; um `tools/call` com esses caracteres sumia e o cliente esperava timeout. Novo `server/stdio-lines.ts` usado nos 7 leitores stdio. |
| `5a211dd76` | 11-21 | fix(app-events): honor service retry-after responses | `Retry-After` em segundos ou data HTTP, e respeitado também em 429/5xx. |
| `ac39e88c7` | 11-21 | fix(app-events): retire polling loops across stop and restart | Um `stop()` durante reconciliação deixava o loop antigo vivo; agora cada start tem versão e o loop velho se aposenta. |
| `896e2e94a` | 11-21 | fix(app-events): serialize automation identity checks | Duas cópias da mesma automação (restore/adopt concorrentes) criavam duplicata; a checagem de id agora roda dentro do `exclusive`. |
| `5ca1b7a25` | 11-21 | fix(app-events): keep shared trigger switches in sync | Automações que compartilham a cópia remota ligavam/desligavam a cópia errada ao criar, restaurar ou remover. |
| `4d225552f` | 11-22 | fix(connectors): list the connected-apps service's own tools when discovery fails | Numa queda do serviço, a sessão ficava só com Gmail/Calendar. Agora lista os quatro `COMPOSIO_*`; numa recusa (4xx/resultado), lista vazio após uma tentativa. |
| `3f15b33c4` | 11-24 | fix(mcp): name the refused tool call's wrong argument and document Composio argument names | A recusa de schema agora nomeia a ferramenta e o primeiro problema, em vez de uma frase fixa. |
| `779ac78e9` | 11-19 | MCP servers: finishing the list load no longer crashes a translated page | O spinner sem `<span>` quebrava a página traduzida ao terminar a lista. |

Testes: `stdio-lines`, `app-trigger-retry`, `app-trigger-identity`, `app-trigger-lifecycle`, `app-trigger-switches`, `app-triggers`, `connector-proxy`, `chat-mcp-tools`, `mcp-gate`, `mcp-remote-proxy`, `agents-proxy`, `dweb-proxy`, `phone-proxy` — todos passando. `pnpm typecheck` limpo; `pnpm lint` só acusa o arquivo não versionado `docs/prototypes/gerar-icones-espessura.mjs` (pré-existente). Neste host, `mcp-remote-proxy.test.ts` precisa de `NO_PROXY`/`no_proxy` ausentes do ambiente (o teste compara as chaves do env do processo).

## Adiados (15)

Fazem sentido, mas a base não existe no fork ou depende de uma feature maior. Não são para ignorar de vez.

| Commit | Data | Assunto | Bloqueio / plano |
|---|---|---|---|
| `e1eaf3ff3` | 11-22 | Keep a bot's app-event automations to the accounts it may use | Depende de `ConnectorScopes.accounts` (limite por conta) que o fork não tem. Portar a feature de escopos por conta primeiro. |
| `64ba5ebed` | 11-22 | Cancel queued app-event runs when the bot loses the account | Depende de `e1eaf3ff3`. |
| `c7b049aec` | 11-22 | Check the account limit as a queued app-event run starts | Depende de `e1eaf3ff3`. |
| `8cb9d26ff` | 11-22 | Check the account limit again right before an app-event turn is sent | Depende de `e1eaf3ff3`. |
| `488ee674f` | 11-23 | App-event runs carried on later check the bot's account limit before the turn is sent | Depende de `e1eaf3ff3`. |
| `46b29b0a9` | 11-22 | fix(mcp): point bots at connected Google Drive, Sheets and Docs instead of an MCP sign-in that cannot finish | `server/mcp-server-app.ts` não existe no fork. Portar o módulo e o swap de servidores MCP antes. |
| `640c87342` | 11-24 | fix(connector): name the usable accounts when a call names no account and the app has more than one | `server/connector-account-hint.ts` não existe no fork; o `withAccountHint` do `index.ts` também não. Portar a base inteira. |
| `3529752e9` | 11-27 | Bot pages can call the connector tools they declare, with the person's own connection | Nova capacidade (`connector-gate.ts`, `packages/phone-protocol/src/app*.ts`). Avaliar como feature separada. |
| `464175e29` | 11-20 | Apps: a long list mounts only the rows on screen | O painel do fork não usa `AppsSection`/`app-tile-window`; virtualizar a lista atual exige reescrever o componente. |
| `0df490516` | 11-20 | Permissions: Ask reaches open chats, sending rule shows what Full access does; clearer Apps screen and grey-bot switches | UI de permissões do fork divergiu; portar só a parte de Apps depois de um diff dedicado. |
| `ecabd15ca` | 11-20 | Apps: the connected-apps list opens at once from a kept copy, and tiles stop re-rendering | Refactor grande (`composio-catalog.ts`, `composio-inventory-cache.ts`) sobre um `composio.ts` que já difere. Fazer junto de uma atualização ampla do módulo. |
| `81e3365c7` | 11-20 | Train Y3: declare the Apps list's load error after the panel's other state | `loadError`/`hostedCards` não existem no `McpServersPanel` do fork. |
| `a5760dbed` | 11-20 | Train Y3: the Apps list error replaces the cards only before any list has loaded, and reads in Portuguese | Depende de `81e3365c7`. |
| `03c526038` | 11-11 | fix(apps): show an MCP list failure once | Depende de `loadError`/`hostedCards`; o painel atual mostra o erro num lugar só. |
| `902b09591` | 11-18 | fix(connector): restore secret redaction on load and redact at output boundary | O connector do fork é v1 (token) e não tem `audit.ts`/`customer-run.ts`/`images.ts`; a redação no load precisa ser adaptada à base v1. Segurança: tratar antes de qualquer uso multi-tenant do connector. |

## Ignorados (11)

| Commit | Data | Assunto | Motivo |
|---|---|---|---|
| `b2e662007` | 11-27 | Antigravity CLI: fit connected apps and the person's servers into the session tool budget | Arquitetura `own-mcp-http`/`session-tool-budget` não existe no fork. |
| `7beafaa1f` | 11-25 | Antigravity CLI: bots keep OpenMausBot's own MCP tools on the native runtime | Mesmo motivo: runtime nativo de MCP do upstream ausente. |
| `85b08241f` | 11-24 | GitHub sign-in card: ask again before saying connected, and release a turn parked on a dismissed card | Feature de GitHub sign-in card não existe no fork. |
| `2bc18664c` | 11-24 | GitHub sign-in card: a GitHub row in Apps and a Connect GitHub card in a chat after a failed push | Feature de GitHub sign-in card não existe no fork. |
| `71ada2b57` | 11-20 | perf(broker): keep catalog pages and reuse a checked Session on connector routes | O fork não publica o broker gerenciado; `session-identity.ts` também não existe. |
| `09adc3db6` | 11-25 | CI: fail the broker deploy when it cannot deploy, and deploy nightly too | CI-only do broker do upstream. |
| `ca4b35bcb` | 11-21 | fix(train): the Retry-After test builds its deferred promise itself | Test-only; o teste foi portado já com o helper local. |
| `78cc68099` | 11-21 | fix(train): the stop/restart test builds its deferred promises itself | Test-only; o teste foi portado já com o helper local. |
| `f6743316a` | 11-18 | Shorten the outdated-service doc comment so the reply text alone gives the retry advice | `server/connector-files.ts` não existe no fork. |
| `e0eab4bd3` | 11-18 | Say the connected-apps service is out of date when its upload route is missing | Upload de arquivos do serviço não existe no fork. |
| `63bd6356c` | 11-18 | fix: accept Composio upload links on Cloudflare R2 | Upload de arquivos do serviço não existe no fork. |

## Verificação

```sh
pnpm exec vitest run server/stdio-lines.test.ts server/app-trigger-{retry,identity,lifecycle,switches}.test.ts \
  server/app-triggers.test.ts server/connector-proxy.test.ts server/drivers/chat-mcp-tools.test.ts \
  server/mcp-gate.test.ts server/mcp-remote-proxy.test.ts server/drivers/{agents,dweb,phone}-proxy.test.ts server/harness-mcp-proxy.test.ts
pnpm typecheck
```

A instância isolada (`node --experimental-strip-types scripts/control-omb.ts launch`) continua sendo o caminho para um smoke de servidor; nenhum dado do app em uso foi tocado.

## Próximo passo

1. Antes da próxima passagem geral, portar `ConnectorScopes.accounts` (limite por conta) para destravar os cinco commits de app-event (`e1eaf3ff3` e dependentes).
2. Decidir se o fork quer a feature de GitHub sign-in card e o upload de arquivos do serviço; hoje ela não existe aqui, então os commits relacionados ficam ignorados.
3. A passagem geral da janela 18–27/11 (1.284 commits restantes) segue pendente.
