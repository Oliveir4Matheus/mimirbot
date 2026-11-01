# Triagem: CI, release, testes, refactors e segurança

Pacote de 44 commits sem entrada em `decisions.json`, analisados em worktree
separado contra o fork em `5175c401f` (0.1.151).

**Aplicado em 2026-11-01** na branch `feat/upstream-lote-ci-seguranca`, em
quatro lotes disjuntos em arquivo (4 + 2 + 5 + 3): cada lote foi aplicado e
testado num worktree próprio, e os `format-patch` reaplicados linearmente com
`git am`. Os 14 estão registrados como `applied` no `decisions.json`.

Método: `git cherry-pick -n` de cada commit no worktree (fonte de verdade para
"aplica ou conflita"), comparação de blob de cada arquivo tocado com o pai do
commit (para separar "não temos o arquivo" de "nós mudamos essa parte"), e
execução dos testes tocados antes e depois. `git apply --check -3` foi
descartado: ele devolve 0 mesmo com conflito.

## Vale pegar (13)

### Segurança (5)

| Commit | O que faz | Verificação |
|---|---|---|
| `3a5af9486` | mascara tokens GitLab (`glpat-`, `gldt-`, `glrtr-`) | aplica, `server/redact.test.ts` passa |
| `b879e1878` | mascara `Authorization: Basic` | aplica, testes passam |
| `0fdb32dfb` | mascara token Slack `xapp-` | aplica, testes passam |
| `7918c401e` | sign-in MCP abre em `127.0.0.1` em vez de cancelar | aplica, testes passam |
| `095804cb8` | better-auth 1.7.7, happy-dom 21.0.4 | aplica, `pnpm install --lockfile-only` não muda nada, typecheck ok |

Os três de redact são sequenciais e compõem: `3a5af9486` → `b879e1878` →
`0fdb32dfb`. Aplicados fora de ordem, o terceiro conflita.

### Testes (5)

| Commit | O que faz | Verificação |
|---|---|---|
| `a5b546256` | seis testes flaky esperam o que checam | aplica, 473 testes passam |
| `3d10238f8` | credencial de teste de redaction que id aleatório não contém | aplica, passa |
| `74295ad66` | `chmod` um tique depois da escrita | aplica, passa |
| `0e4dbc0e5` | smoke do peer Ask espera a linha de decisão | aplica (smoke não roda fora do app) |
| `81ac1c45c` | espera até dois minutos pelo primeiro comando em runner Windows | aplica, 21 node-tests passam |

### CI e release (3)

| Commit | O que faz | Verificação |
|---|---|---|
| `242a8396e` | `filter: blob:none` no checkout do job static | hunk não aplica (contexto mudou com o Boat); a linha foi aplicada à mão, `scripts/ci-workflow.test.ts` e `ci-scope.test.ts` passam |
| `88d54eb17` | build Mac em `macos-15` | aplica; o `macos-14` que temos aposenta em 2/nov |
| `43d3a84d1` | até seis tentativas de staple no build Mac | aplica |

`88d54eb17` e `43d3a84d1` mexem em `.github/workflows/release.yml`, a lane que
o `AGENTS.md` manda não usar (precisa dos segredos Apple do upstream). Ficam
como manutenção do arquivo, não como pipeline nossa.

### Manual (1)

| Commit | O que faz | Verificação |
|---|---|---|
| `1b1131d71` | contém exceções dos body checks e itera `threadIds` grandes | código aplica; o teste e2e conflita porque já temos a versão mais nova do arquivo (`ec834e08e`, aplicado como `daada3b1b`). Pegar só `server/bot-visibility.ts`, `server/harness/http.ts` e os dois `.test.ts`; 31 testes passam |

## Não vale (30)

**Bumps de versão** — `84bb202f5`, `db1ed62ab`, `20dba2bf6`, `2b918a083`,
`0213b7435`, `d280d4433`. O fork está em 0.1.151 e numera sozinho; carregam
junto mexidas no `file-size-ratchet` e no `source-hashes.json` do upstream.
Pelo mesmo motivo, `ef2ff9d4d` (números de ratchet do upstream) também sai.

**CI do Boat** — `bd6bfa68a` (cria `.github/workflows/boat.yml`), `d46482c5a`,
`21628af22`, `e9a8f5333`, `1f77ff9ee` (só comentário descrevendo o Boat),
`1d3feddad` (docs). É a infra de CI do upstream, que não temos e não usamos.

**Arquivos que o fork não tem** — `32bec83b1`
(`src/state/snapshot-navigation.test.ts`), `459c45949`
(`Sidebar.departments.test.ts`), `53c28ec67` (30 arquivos, 18 ausentes),
`d26d7c164` (deleta screenshots que não temos), `be7c5e351` (25 arquivos, 4
ausentes), `6c121ca5e` (mexe em `server-lines` e `ko.json`).

**Lote inteiro, não um commit** — `1d72a44bd` ("Train"): 273 arquivos, merge de
vários PRs. Precisa ser triado pelos commits que o compõem, não como cherry-pick.

**Refactor de size-pin sobre código que nós reescrevemos** — `524d0d451`,
`ab3b3da07` (tiram código de `server/index.ts`), `63a624673` (tipo do secret
card em `store.tsx`), `7818dceee` (probe do ModelPicker). Todos conflitam e não
mudam comportamento.

**Dependem de renomeações que não temos** — `4867c2dd6` (`remainingMs` →
`limitMs`), `d90acf4d6` ("Maximum turn length" → "Stop after no progress for").
Aplicados, quebram nossos testes.

**E2E que já divergiu** — `a5509ce53` e `426f940d2` (esperas do
`server/cloud-team-connections.e2e.test.ts`). Nosso arquivo está 73 linhas
distante do pai do commit, então os dois conflitam; o teste passa 11/11 no fork.
Reavaliar se ele virar flaky.

**Feature, não fix** — `7650dd229` (bots pedem qualquer segredo no card seguro,
53 arquivos); metade dos arquivos (`secret-cards` em `host/` e `routes/`) não
existe no fork.

**Opcional** — `f2f222fc6` (bench de desktop, 1283 linhas de ferramenta de dev):
aplica e as dependências existem, mas não muda o produto.

## Verificação

Worktree `/tmp/opencode/triage-upstream`, branch `triage-guards` com os 13
commits aplicados:

- `vitest`: 473 testes em 10 arquivos, todos passam (redact, mcp-sign-in,
  computer-idle, browser-evidence, comms, config, openai-chat-tools,
  boat-auto-sleep, SettingsModal.appearance, file-size-ratchet).
- `node --test electron/cloud-lending.node-test.mjs`: 21 passam.
- `pnpm typecheck`: limpo.

## Achado fora do pacote

O `node_modules` do fork está velho: `package.json` declara `undici` 8.11.2 e a
instalação só tem 6.28.0 e 7.29.0. Por isso `server/comms.test.ts` e
`server/drivers/openai-chat-tools.test.ts` falham com `Cannot find package
'undici'`. Um `pnpm install` no repo principal resolve — não é regressão de
nenhum commit desta lista.
