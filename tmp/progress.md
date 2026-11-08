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
| F3 | Editor visual e Team Cloud/VM | Não iniciada |

A tela F2 foi mergeada em `feat/workflow-f1` (commit `6c9f98fdc`). As mudanças
da aprovação longa (P16) estão na working tree dessa branch, ainda sem commit e
sem push.

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

### Etapa de script + condição/repetição

- `shared/workflow.ts`: etapa é união por `kind` (`"bot"` padrão, `"script"` com `run` e `timeoutMs`), mais `next`, `when` e `onFailure`.
- `server/workflows/script.ts`: executor Node com `cwd` da etapa, `WORKFLOW_STEP_INPUT`/`OUTPUT`, ambiente mínimo, timeout, kill e saída capturada; em Electron usa `ELECTRON_RUN_AS_NODE=1`.
- `server/workflows/flow.ts`: `when` (caminho pontuado no `result.json`), `next` e `onFailure`; repetição é caminho de volta com teto de 25 visitas.
- `state.ts`: `completeStep` recebe o destino, `failStepTo` continua a run pela `onFailure`, etapa revisitada reabre preservando `attempts`, caminho não percorrido termina `skipped`.
- `store.ts` + rotas: `PUT/GET /api/workflows/:id/scripts/:name` (admin, 256 KB, 409 com run ativa); o save recusa etapa de script sem arquivo.
- Tela F2 somente leitura: card de script, painel com arquivo/runtime e seção **Fluxo**; `en.json`/`pt-br.json` atualizados.
- Testes: `shared/workflow.test.ts`, `flow.test.ts`, `script.test.ts`, estado, motor (desvio, `onFailure`, volta com teto, `skipped`, script ausente) e rotas.
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

Desvios deliberados do protótipo v0.5 nesta fatia:

- barra superior mínima (Voltar, nome, departamento, Salvar): o app precisa de uma saída e de um save;
- o balão do Agente ganhou o seletor de bot (o motor exige `botId`);
- **Ferramentas** mostra o bot, somente leitura (as ferramentas vêm do cadastro do bot);
- **Expressão** do IF/Else virou Comparação/Igualdade/Existe/Contém (não há avaliador de expressão livre);
- **Run** mostra o destino, sem modo Manual (fica para a F3.2);
- Script aceita apenas JavaScript/Node, como decidido no F2;
- o rodapé do balão diz **Rascunho local**, não “alterações salvas no protótipo”.

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

1. **F3.2:** modo Manual (pausa antes da etapa), ferramentas restritas por etapa, Python/TypeScript e polimento do editor (arraste de nota/container, minimapa fora da spec).
2. **record→promote** (transformar uma conversa ou sequência que deu certo em Workflow) — pulado por decisão do dono nesta rodada.
3. **Team Cloud/VM** (F3).

O retry automático continua adiado: qualquer erro falha a execução de imediato, salvo quando a etapa declara `onFailure`.

Quando o dono aprovar, commitar e enviar a branch `feat/workflow-f1`.
