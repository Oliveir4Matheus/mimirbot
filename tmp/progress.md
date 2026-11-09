# Progresso — Workflows (F1 + F2)

Atualizado em 08/11/2026.

## Situação

| Fase | Entrega | Estado |
|---|---|---|
| F1 | Motor de Workflow, rotas, ferramentas dos bots, console de teste | Concluída |
| F2 | Tela administrativa de Workflows e Runs | Implementada, aguardando aprovação visual |
| F2 | Aprovação longa (P16) | Concluída |
| F2 | Gatilho "Workflow" | Concluída |
| F2 | Snapshot da run | Concluída |
| F2 | Etapa de script, condição e repetição | Concluída |
| F3.1 | Editor visual Workflow Studio v0.5 | Concluída (08/11/2026) |
| F3.1.1 | Correções do Studio: `onSuccess`, `onFailure`/`onTimeout` na UI, fim explícito e desconectar | Concluída (09/11/2026) |
| F3.2 | Fatia 1: modo Manual por etapa (pausa antes da etapa) | Concluída (09/11/2026) |
| F3.2 | Fatia 3: Python/TypeScript no script | Concluída (09/11/2026) |
| F3.2 | Fatia 4: condição E/OU no IF/Else | Concluída (09/11/2026) |
| F3.2 | Fatia 2: ferramentas por etapa | Adiada (§9.5 do handoff) |
| F3.2 | Fatia 5: QA do canvas | Pendente |
| F3.3 | Componente `kind: "loop"` (repetição estruturada) | Planejada |
| F3 | Editor visual e Team Cloud/VM | Em andamento |

A tela F2 foi mergeada em `feat/workflow-f1` (commit `6c9f98fdc`). As mudanças
da aprovação longa (P16) estão na working tree dessa branch, ainda sem commit e
sem push.

## Decisões aprovadas para a F3.1.1 (09/11/2026)

A validação de 5 cenários de ETL pela UI encontrou quatro pontos. As decisões
foram:

1. **Resultados por etapa:** renomear `next` para `onSuccess` no nível da etapa
   (`onSuccess`, `onFailure`, `onTimeout`). `onSkipped` **não** será
   implementado: uma etapa `skipped` nunca executa, então não há evento para
   rotear; o pulo continua sendo decisão do IF/Else. `onTimeout` passa a ser
   distinto de falha.
2. **Timeout por etapa:** qualquer etapa executável (Agente ou Script) pode
   declarar `timeoutMs`. O timeout vira um resultado próprio e pode seguir
   `onTimeout`; sem ele, cai em `onFailure`; sem nenhum dos dois, a run para.
3. **Repetição:** removida do produto. Saem o caminho de volta, o teto de 25
   visitas (`WORKFLOW_STEP_VISIT_MAX`), o reset de revisita, o campo `attempts`
   do `run.json` e a exibição de tentativas. O schema passa a exigir arestas só
   para frente; o Studio continua recusando ciclos. A repetição visível volta
   como componente `kind: "loop"` na F3.3.
4. **Fim explícito:** `onSuccess: null` encerra o ramo. O Studio grava `null`
   quando a saída de sucesso não está conectada; `onSuccess` ausente continua
   significando “próxima do array” para definições antigas.
5. **Desconectar:** expor no Studio o `disconnect()` que já existe no modelo.

O plano detalhado, com arquivos e linhas, está em
`docs/superpowers/specs/2026-11-09-workflow-f31-fixes.md`.

## O que já foi feito

### F1 — motor

- Contrato `shared/workflow.ts`: definição, etapas, entradas, saídas, `result` e `require`.
- Motor determinístico: cada etapa é um bot; a ordem é a do array.
- Verificação de arquivos: `copyStepInputs`, `verifyStepOutputs`, `result.json` até 64 KB.
- Pasta da run por departamento em `~/MimirBot`.
- Rotas da pessoa em `/api/workflows` e rotas internas dos bots em `/api/internal/workflows`.
- Ferramentas dos bots: `list_workflows`, `run_workflow`, `workflow_status`, `cancel_workflow`.
- Recuperação de runs no boot e retenção por dias.
- Guardas de exclusão: 409 enquanto houver run `queued`, `running` ou `waiting_approval`.
- Cancelamento interrompe o turno e marca a etapa atual como `skipped`.
- Versões imutáveis: cada run fica presa a `workflowId + workflowVersion`.
- Console de teste das rotas.

### F2 — tela

- Tela própria na barra lateral, no lugar do console de teste.
- Console movido para **Abrir console de teste**, no menu de reticências.
- Lista de Workflows: busca, filtros, ordenação, contador, chips removíveis.
- Linha compacta: nome, versão, departamento, etapas e situação da última run.
- Ações rápidas **Executar** e **Abrir** no hover/foco.
- Detalhe do Workflow: cabeçalho, metadados, retenção, data, seletor de versão.
- Aviso de versão antiga e botão **Executar vN**.
- Desenho vertical somente leitura com fundo pontilhado de 24 px.
- Cards de etapa com número, nome, bot e saídas.
- Conexões verticais com seta e nome do arquivo.
- Painel de detalhe da etapa: bot, instruções, entradas, saídas, resultado e condições.
- Aba Runs: busca por id, filtros por Workflow, situação, departamento e período.
- Ícone circular de 34 px por run, com anel, distintivo e cores por estado.
- Anel giratório somente em run `running`, 1 s linear; respeita movimento reduzido.
- Lista de Runs sem rótulos redundantes de status.
- Detalhe da run: cabeçalho, status textual, id com copiar, solicitante, horários e duração.
- Timeline de etapas com tentativas, duração, arquivos, erro e **Abrir conversa**.
- Bloco de aprovação pendente com pergunta, etapa, tempo, cartões e **Abrir conversa**.
- Resultado recolhível com JSON e copiar; arquivos agrupados por etapa.
- Diálogos de executar, cancelar run, apagar Workflow e apagar run.
- Tratamento de 409 com links para as runs ativas.
- Estados de carregando, vazio, erro, 404 e sem permissão.
- Atualização por `workflow.run` e busca de reserva a cada 5 s enquanto houver run ativa.
- Layout responsivo: duas colunas acima de 900 px; uma coluna abaixo.
- Painel de etapa como folha inferior em telas estreitas.
- Textos em português e chaves novas no catálogo de traduções.
- Spec oficial copiada para `docs/superpowers/specs/2026-11-07-workflows-f2-compact-uiux.md`.

### F2 — aprovação longa (P16)

- Quando o turno da etapa termina com um cartão aberto, a run fica `waiting_approval` com `pause` (etapa, pergunta, cartões e hora).
- A run espera para sempre: a retenção não apaga runs ativas e um reinício não mexe nas pausadas.
- O motor indexa a conversa de cada etapa e reconhece o turno de continuação depois da resposta.
- Responder o cartão retoma a verificação da etapa; outro cartão aberto mantém a run pausada.
- Recusar o cartão cancela a run com o motivo `aprovação negada`.
- Em workspace compartilhado, qualquer membro responde o cartão de uma etapa (não só quem iniciou).
- O motor relata cada turno uma vez, então o settle de limpeza do host não derruba a run.

### F2 — gatilho "Workflow"

- `RoutineTarget` aceita `"workflow"`; a rotina guarda `workflowId`.
- O editor de rotina ganhou o terceiro tipo **Workflow**, com seletor de Workflow e sem pedir instruções.
- O disparo usa a versão atual do Workflow no momento em que a run nasce; a run fica presa a ela.
- O intervalo/sobreposição da rotina continua valendo (`skip` ou `queue`).
- A run do Workflow grava `triggeredBy: { routineId, routineName }`; o detalhe mostra **Gatilho · nome da rotina** no lugar de "Pedido por".
- A run da rotina espelha o Workflow: `running`, `waiting` (aprovação), `completed`, `failed` ou `cancelled`.
- Cancelar a run da rotina cancela a run do Workflow; o timeout da rotina também.
- Um reinício reconcilia a run da rotina com o `run.json` do Workflow: run terminal fecha, run ativa continua.
- Workflow apagado depois da rotina criada: a próxima ocorrência falha com "The assigned Workflow no longer exists".
- Rotinas de gatilho não entram em exportação de equipe (o pacote ainda não carrega Workflows); aparecem como "workflow_not_shared".

### F2 — snapshot da run

- `run.json` guarda `snapshot: { name, steps: [{ id, name }] }` no nascimento da run.
- Lista e detalhe usam o snapshot quando a definição do Workflow não está mais disponível.
- O aviso "definição original indisponível" só aparece em runs antigas, sem snapshot.

## Arquivos principais

| Arquivo | Papel |
|---|---|
| `src/components/WorkflowsPage.tsx` | Contêiner, abas, filtros, seleção, diálogos e ações |
| `src/components/workflows/WorkflowList.tsx` | Lista de Workflows |
| `src/components/workflows/WorkflowDetail.tsx` | Cabeçalho e versões do Workflow |
| `src/components/workflows/WorkflowSteps.tsx` | Desenho vertical pontilhado |
| `src/components/workflows/StepPanel.tsx` | Detalhe somente leitura da etapa |
| `src/components/workflows/RunList.tsx` | Lista de runs |
| `src/components/workflows/RunDetail.tsx` | Cabeçalho, timeline, aprovação, resultado e arquivos |
| `src/components/workflows/RunGlyph.tsx` | Ícone circular animado |
| `src/components/workflows/StatusChip.tsx` | Etiqueta de situação |
| `src/components/workflows/RunDialog.tsx` | Diálogo de execução |
| `src/components/workflows/ConfirmDialog.tsx` | Cancelar e apagar |
| `src/components/workflows/FilterPopover.tsx` | Filtros |
| `src/lib/workflows-api.ts` | Chamadas às rotas |
| `src/lib/workflow-format.ts` | Duração, datas e rótulos |
| `src/hooks/useWorkflowFeed.ts` | Carga, evento `workflow.run` e reserva |
| `shared/wire.ts` | Frame `workflow.run` no contrato do servidor |

## Verificação

### F1 + tela F2

- `pnpm typecheck`: passou.
- `pnpm lint`: passou.
- `pnpm i18n:check`: passou.
- `index-route-ratchet`: passou.
- `src/state` + `src/lib`: 2893 testes passaram.
- Componentes, traduções e guardas: 42 testes passaram.
- Teste manual da tela: lista, filtros, versões, painel de etapa, diálogos, runs, animação, movimento reduzido e responsivo.

### Aprovação longa (P16)

- `pnpm typecheck`: passou.
- `pnpm lint`: passou.
- `server/workflows` + rotas + `server/host`: **553 testes passaram** (24 pulados).
- `server/workflows/engine.test.ts`: **19 testes**, incluindo pausa, retomada, cartão novo, recusa, reinício e settle duplicado.
- `server/index.test.ts`: **309/310**; o único que falhou foi um timeout de sala que passa isolado (6,9 s), flaky da base.
- Fixture isolado (`control-omb launch`, fake Claude, dados temporários): a run pausou em `waiting_approval` com `pause.cardIds`, a dispensa do cartão disparou o turno de continuação e a run terminou `succeeded`, com `verified: ["result.json"]` e `result: {ok: true}`.
- Receita reproduzível em `docs/verification/workflow-approval.md`.

### Gatilho "Workflow" + snapshot

- `pnpm typecheck`: passou.
- `pnpm lint`: passou.
- `pnpm i18n:check`: passou.
- `server/routines.test.ts`: **201 testes**, incluindo disparo, espelho de estados, cancelamento, timeout, falha, reinício e Workflow apagado.
- `server/workflows` + rotas + `server/host` + rotinas + pacotes: **421 testes** no conjunto focado; `server/index.test.ts` **310/310**.
- `src/components/RoutineCalendarPage.simple.test.ts`: **28 testes**, incluindo o editor com o tipo Workflow.
- Fixture isolado (`control-omb launch`, fake Claude, dados temporários): a rotina `target: "workflow"` iniciou a run, a run gravou `triggeredBy`, terminou `succeeded` com `verified: ["result.json"]` e `result: {ok: true}`, a run da rotina terminou `completed` com o mesmo `workflowRunId`, e depois de apagar o Workflow o `run.json` manteve `snapshot.name` e `snapshot.steps`.
- Receita reproduzível em `docs/verification/workflow-trigger.md`.

### Etapa de script + condição (a repetição foi removida na F3.1.1)

- `shared/workflow.ts`: etapa é união por `kind` (`"bot"` padrão, `"script"` com `run` e `timeoutMs`), mais `onSuccess`, `onFailure`, `onTimeout`, `when` e `timeoutMs` no bot. A repetição e o teto de 25 visitas foram removidos na F3.1.1.
- `server/workflows/script.ts`: executor Node com `cwd` da etapa, `WORKFLOW_STEP_INPUT`/`OUTPUT`, ambiente mínimo, timeout, kill e saída capturada; em Electron usa `ELECTRON_RUN_AS_NODE=1`. O timeout agora marca `timedOut` e segue `onTimeout`.
- `server/workflows/flow.ts`: `when` (caminho pontuado no `result.json`), `onSuccess` (`null` = fim, ausente = próxima do array), `onFailure` e `onTimeout`. A repetição por caminho de volta e o teto de 25 visitas foram removidos na F3.1.1.
- `state.ts`: `completeStep` recebe o destino, `failStepTo` continua a run pela `onFailure`/`onTimeout` e grava `failureKind`; caminho não percorrido termina `skipped`. Não há mais `attempts` nem reabertura de etapa.
- `store.ts` + rotas: `PUT/GET /api/workflows/:id/scripts/:name` (admin, 256 KB, 409 com run ativa); o save recusa etapa de script sem arquivo e aresta para trás.
- Tela F2 somente leitura: card de script, painel com arquivo/runtime e seção **Fluxo** (`onSuccess`, `onFailure`, `onTimeout` e **Fim**); `en.json`/`pt-br.json` atualizados.
- Testes: `shared/workflow.test.ts`, `flow.test.ts`, `script.test.ts`, estado, motor (desvio, `onFailure`, `onTimeout`, timeout de bot e de script, pausa de aprovação, `skipped`, script ausente) e rotas.
- `pnpm typecheck`, `pnpm lint` e `pnpm i18n:check`: passaram.
- Fixture isolado (`control-omb launch`, fake Claude, dados temporários): a run v2 rodou o script real, o `when` escolheu `fechar`, `corrigir` ficou `skipped`, terminou `succeeded` e manteve o snapshot depois de apagar o Workflow.
- Receita reproduzível em `docs/verification/workflow-script.md`.

### Editor visual Workflow Studio v0.5 (F3.1)

- `shared/workflow.ts`: etapa `kind: "condition"` (`from`, `field`, `op`, `value`, `whenTrue`, `whenFalse`, `onFailure`), operadores fechados (`equals`, `not_equals`, `exists`, `contains`, `gt`, `gte`, `lt`, `lte`) e o bloco opcional `canvas` (`nodes`, `notes`, `containers`) que o motor ignora.
- `server/workflows/condition.ts`: avaliação determinística sobre o `result.json` da etapa de origem; caminho pontuado, comparação por valor JSON, `contains` para texto/lista e recusa de comparação numérica sobre texto.
- `server/workflows/engine.ts`: a etapa `condition` lê o `result.json` da origem, escolhe `whenTrue`/`whenFalse` e entra na etapa destino; a etapa fica `succeeded` com `verified: []`. `flow.ts` e `files.ts` ignoram a condição nos caminhos de arquivo.
- `store.ts` + rota de save: o corpo pode trazer `scripts`; os arquivos são gravados antes da checagem da etapa de script, então um Workflow novo já pode nascer com script. `canvas` não entra na comparação de versão: mover cards não cria versão, e o layout é gravado no lugar.
- `src/components/studio/`: `WorkflowStudioPage` (canvas, pan/zoom 35–200%, paleta, conexões, notas, containers, salvar), `StudioCard` (Agente/Script/IF-Else), `StudioBalloon` (Instruções, Contexto, Ferramentas, Retorno, Execução, Entrada, Saída, Script, Condição, True/False), `StudioNote`, `StudioContainer`, `StudioPalette`, `studio-model` (conexão, ciclo, remoção, validação) e `studio-geometry`.
- Tela F2: **Novo Workflow** e **Editar**; o detalhe desenha a condição e o painel mostra origem, campo, operador, valor e as duas rotas.
- Textos em `en.json`/`pt-br.json`; `source-hashes.json` atualizado.
- Testes: `condition.test.ts`, `studio-model.test.ts`, condição no motor e no schema, canvas no store e `scripts` na rota.
- `pnpm typecheck`, `pnpm lint` e `pnpm i18n:check`: passaram.
- Fixture isolado (`control-omb launch`, scripts reais, dados temporários): o save com `scripts` criou o Workflow, a condição leu `{ "ok": false }` e seguiu `nao`; `sim` ficou `skipped` e a run terminou `succeeded`.
- Fixture de tela (`pnpm dev:server` + `pnpm dev`, dados temporários): **Novo Workflow**, Script + IF/Else, conexão Run → entrada, **Salvar**; o Workflow apareceu na lista com as duas etapas e o `run.json`/definição guardaram `next` e `from`.
- Receita reproduzível em `docs/verification/workflow-studio.md`.

### Correções do Studio (F3.1.1)

- Contrato: `next` virou `onSuccess` (nullable; ausente = legado, `null` = fim). Etapas de bot e script ganharam `onTimeout` e `timeoutMs` (bot 0 = sem limite; script mantém 60 s). `when[].next` continua igual.
- Motor: timeout é resultado próprio (`failureKind: "timeout"`); segue `onTimeout`, cai em `onFailure` ou para. O relógio do bot cobre o turno ativo e para na pausa de aprovação. O timeout do script marca `timedOut`.
- Repetição removida: `WORKFLOW_STEP_VISIT_MAX`, a checagem em `advance`, `resetStepFolders`, `attempts` do `run.json` e a exibição de tentativas. O schema recusa arestas para trás em `onSuccess`, `onFailure`, `onTimeout`, `when[].next`, `whenTrue`, `whenFalse` e `from`.
- Studio: portas de Falha e Tempo esgotado nos cards de Agente e Script (Falha também no IF/Else), **Fim do fluxo** quando `onSuccess` é `null`, tempo máximo do bot no balão de Execução e botão **Desconectar**. Abrir um Workflow antigo materializa `onSuccess`; salvar um passo sem conexão grava `null`.
- F2: o painel mostra `onSuccess`/`onTimeout`/Fim; a timeline mostra **Tempo esgotado** e não mostra mais tentativas.
- `pnpm typecheck`, `pnpm lint` e `pnpm i18n:check`: passaram.
- `pnpm vitest run server/workflows server/routes/workflows.test.ts src/components/studio src/components/workflows shared/workflow.test.ts`: **195 testes** passaram.
- Fixture isolado (`pnpm dev:server` em 8999, scripts reais, dados temporários): cenário 1 termina com `corrigir` `skipped`; cenário 2 com `carrega` `skipped`; cenário 3 segue `onFailure` e, sem ele, a run para; cenário 4 falha com `missing required output "result.json"` e a próxima fica `pending`; cenário 5 é recusado no save (`onSuccess step "a" must come after this step`); um script que estoura o timeout segue `onTimeout`. Nenhum `run.json` tem `attempts` e não existe erro de teto de visitas.
- Studio real em Chrome headless: as portas Falha/Tempo esgotado aparecem, a conexão para frente mostra **Etapas conectadas**, a conexão de volta é recusada com **Conexão recusada: o fluxo deve permanecer sem ciclos** e **Desconectar** volta o Run para **Fim do fluxo**.

Desvios deliberados do protótipo v0.5 nesta fatia:

- barra superior mínima (Voltar, nome, departamento, Salvar): o app precisa de uma saída e de um save;
- o balão do Agente ganhou o seletor de bot (o motor exige `botId`);
- **Ferramentas** mostra o bot, somente leitura (as ferramentas vêm do cadastro do bot);
- **Expressão** do IF/Else virou Comparação/Igualdade/Existe/Contém (não há avaliador de expressão livre);
- **Run** mostra o destino, sem modo Manual (fica para a F3.2);
- Script aceita apenas JavaScript/Node, como decidido no F2;
- o rodapé do balão diz **Rascunho local**, não “alterações salvas no protótipo”.

### F3.2 — fatia 1: modo Manual por etapa (09/11/2026)

- Contrato: `mode: "auto" | "manual"` (default `"auto"`) nas etapas `bot` e `script`; `condition` não tem modo. `workflowStartsManual` centraliza a regra usada pela rotina.
- Run: status `waiting_manual` e `hold: { step, since }` no `run.json`. `isActiveRun` inclui o estado, então retenção, `DELETE` de Workflow/run, cancelamento e polling da F2 o tratam como ativo.
- Motor: `advance` para antes de copiar `input/` ou abrir thread quando a etapa é manual e não foi liberada; nenhum turno, thread ou script inicia antes do Continuar. `engine.resume` libera uma única vez (memória do processo) e segue o fluxo normal; dois cliques respondem 409. O reinício não retoma a run parada.
- Timeout: a espera manual não consome o `timeoutMs`; o relógio só começa quando a etapa inicia, como na pausa de aprovação.
- Rota: `POST /api/workflows/runs/:id/continue` (404 inexistente, 409 fora de `waiting_manual`), exposta por `server/host/workflows.ts` via `engine.resume`.
- Rotina: `workflowStartsWithManual` bloqueia no editor e em `RoutineManager.create/update` (400); a run da rotina espelha `waiting` com `attention: "Waiting for you to continue"`.
- Studio: balão **Execução** ganha **Modo de execução** (Automático/Manual) para Agente e Script; `createStep` nasce `auto` e o save grava `mode`.
- F2: bloco **Aguardando você continuar** (etapa, tempo parado, **Continuar**), ícone âmbar de pausa, status/detalhe, timeline com **Aguardando início**, painel com **Manual**, filtros/contadores e textos em `en.json`/`pt-br.json`.
- Verificação: `pnpm typecheck`, `pnpm lint` e `pnpm i18n:check` passaram. Testes focados: `shared/workflow.test.ts`, `server/workflows/state.test.ts`, `engine.test.ts`, `retention.test.ts`, `server/routes/workflows.test.ts`, `server/routines.test.ts`, `src/components/studio/studio-model.test.ts` e `RoutineCalendarPage.simple.test.ts` — **360 testes** passaram.
- Fixture isolado (`OMB_PORT=8931`, `OMB_DATA_DIR`/`HOME` temporários, servidor real e script real): a etapa manual parou a run em `waiting_manual` sem thread (`hold.step = 0`, etapa `pending`); `DELETE` respondeu 409; Continuar retomou e concluiu com `result.json`; o segundo clique respondeu 409; reiniciar o servidor manteve a run parada e o Continuar seguinte concluiu; rotina com primeira etapa manual foi recusada no `POST` e no `PATCH` (400). Evidência em `/tmp/opencode/f32-manual/evidence/`.

### F3.2 — fatia 3: Python/TypeScript (09/11/2026)

- Contrato: `isWorkflowScriptName` aceita `.mjs`, `.js`, `.ts` e `.py`; nenhum campo novo, a extensão é o contrato. O schema recusa caminho e qualquer outra extensão.
- Executor: `workflowScriptCommand` escolhe o runtime pela extensão. `.mjs`/`.js` usam `process.execPath`; `.ts` usa `process.execPath --experimental-strip-types`; `.py` usa `WORKFLOW_PYTHON` ou `python3` (`python` no Windows). O ambiente, o `cwd` da etapa e o timeout continuam os mesmos; no Electron, `ELECTRON_RUN_AS_NODE=1` continua sendo aplicado. Um Python ausente falha com `could not find <comando> on PATH to run this script`.
- Studio: o seletor **Linguagem** ficou habilitado para JavaScript, TypeScript e Python. Trocar a linguagem renomeia `run` mantendo o nome base e move o conteúdo do editor para o novo arquivo (`renameScript`), sem deixar cópia no nome antigo.
- F2: o painel da etapa mostra o runtime derivado da extensão.
- Verificação: `pnpm typecheck`, `pnpm lint` e `pnpm i18n:check` passaram. Testes: `shared/workflow.test.ts` (aceita as quatro extensões e recusa as demais), `server/workflows/script.test.ts` (executa `.ts` e `.py` reais, escolhe o comando por extensão e nomeia o Python ausente) e `src/components/studio/studio-model.test.ts` (linguagem, nome base e conteúdo preservado no rename) — **76 testes** no conjunto focado.
- Fixture isolado (`OMB_PORT=35645`, `OMB_DATA_DIR`/`HOME` em `/tmp/opencode/f32-script`, servidor real): um Workflow com `preparar.ts` seguido de `fechar.py` terminou `succeeded`; as duas etapas gravaram e tiveram seus `result.json` verificados. Evidência em `/tmp/opencode/f32-script/evidence/` (`README.txt`, `results.json`, `run.json`, `output/preparar.json`, `output/fechar.json`, `verify.mjs`, `verify-output.txt` e `server.log`).

### F3.2 — fatia 4: condição E/OU (09/11/2026)

- Contrato: a etapa `condition` vira um grupo com `match: "all" | "any"` (default `"all"`) e `conditions` de 1..20 linhas `{ field, op, value? }`. O legado (`field`, `op`, `value` soltos) é normalizado no preprocess de `workflowStepSchema` para uma linha + `all`; o `conditionStepSchema` não foi envolvido em `z.preprocess` para preservar o `discriminatedUnion`. Cada valor continua limitado a 4 KB; o grupo inteiro, a 64 KB. Negação continua sendo trocar as rotas True/False.
- Avaliador: `evaluateConditionGroup` combina as linhas com curto-circuito e mantém `evaluateCondition` exportado. Erro de tipo/caminho inclui a linha e o campo (`condition 2 ("total"): ...`). Sem expressão livre, eval, funções ou aritmética.
- Motor: `runConditionStep` avalia o grupo. Erro segue `onFailure` ou para a run; a etapa continua sem timeout e segue `succeeded` com `verified: []` quando escolhe uma rota.
- Studio: o balão **Condição** tem **Todas / Qualquer**, uma linha por comparação com Campo, Operador, Valor e remover, e **Adicionar condição** até 20. `createStep` nasce com uma linha `ok equals true`; helpers `conditionLines`, `updateConditionLine`, `addConditionLine`, `removeConditionLine` e `updateConditionMatch`; `draftProblem` valida 1..20 linhas e valor por linha. O resumo do card mostra `Todas`/`Qualquer` + a primeira linha ou **N condições**.
- F2: o painel da etapa mostra `match` e todas as linhas (Campo, Operador, Valor).
- Verificação: `pnpm typecheck`, `pnpm lint` e `pnpm i18n:check` passaram; `source-hashes.json` foi atualizado com `node scripts/generate-locale.mjs pt-br --accept`. Testes focados (`shared/workflow.test.ts`, `condition.test.ts`, `engine.test.ts`, `studio-model.test.ts`): **108 testes** passaram.
- Fixture isolado (`OMB_PORT=41157`, `OMB_DATA_DIR`/`HOME` em `/tmp/opencode/f32-condition`, servidor real e scripts reais): com `{ ok: false, check: { total: 12 } }`, `any` seguiu **sim** e pulou **nao**; `all` seguiu **nao** e pulou **sim**; uma linha `gt` sobre texto falhou a etapa com `condition 2 ("total"): the gt operator needs two numbers; "total" is "12"`. Evidência em `/tmp/opencode/f32-condition/evidence/` (`README.txt`, `results.json`, `run-any.json`, `run-all.json`, `run-type-error.json`, `verify.mjs`, `verify-output.txt`, `run-json-index.json` e `server.log`).

Falhas que já existem na base, sem relação com esta entrega:

- `server/drivers/codex.test.ts`: “passes the person's proxy settings…”.
- `src/mimir/MimirRail.test.ts`: “titles the sidebar's top row…”.
- `src/components/ComputerFilesPane.test.ts`: “offers the existing CSV preview and save controls…”.
- `src/components/GroupView.message-actions.test.ts`: “keeps delivered files beneath the reply…”.
- `src/components/TeamOwner.test.ts`: “shows the owner's face…” e “keeps the selected bot's ⋯ menu in view…”.
- `shared/app-frame/host-page.test.ts`: o `app-host.html` commitado não bate com o hash gerado pelo build.
- `server/team-backup.test.ts` pode estourar 20 s quando roda em paralelo com a suíte inteira; isolado passa.
- O guard de `<select>` nativo foi corrigido nesta entrega em `components/workflows` e `components/studio`; ele já estava vermelho na base por causa dos selects da tela F2.

## Como abrir

```bash
cd /home/matheuso/workspace/mobiusbot
pnpm install --frozen-lockfile
OMB_PORT=8997 OMB_DATA_DIR=/tmp/opencode/workflow-f2-data HOME=/tmp/opencode/workflow-f2-home pnpm dev:server
OMB_UI_PORT=5397 OMB_PORT=8997 pnpm dev
```

Abrir `http://127.0.0.1:5397/` e clicar em **Workflows** na barra da esquerda.

Os dados de demonstração ficam em `/tmp/opencode/workflow-f2-data` e
`/tmp/opencode/workflow-f2-home`. O app instalado e os dados reais não são tocados.

Para a aprovação longa, a receita com o fixture isolado e o fake engine está em
`docs/verification/workflow-approval.md`.

## Próximo passo

1. **F3.2:** fatias 1 (Manual), 3 (Python/TypeScript) e 4 (condição E/OU) concluídas. Falta só o **QA do canvas** (arraste de nota/container; minimapa fora da spec). A fatia 2 (ferramentas por etapa) foi adiada por decisão do dono e está registrada em `docs/superpowers/specs/2026-11-09-workflow-f32.md` §9.5.
2. **F3.2.1:** replay a partir de uma etapa — pegar uma run já terminada e criar uma execução nova começando em `fromStep`. Hoje não existe; "Rodar de novo" sempre começa do zero. Decisões em aberto no handoff da F3.2.
3. **record→promote** (transformar uma conversa ou sequência que deu certo em Workflow) — pulado por decisão do dono nesta rodada.
4. **Team Cloud/VM** (F3).

O retry automático continua adiado: qualquer erro falha a execução de imediato, salvo quando a etapa declara `onFailure`.

Quando o dono aprovar, commitar e enviar a branch `feat/workflow-f1`.
