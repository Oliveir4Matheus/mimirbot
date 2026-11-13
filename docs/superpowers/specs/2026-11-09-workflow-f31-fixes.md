# Handoff — F3.1.1: correções do Workflow Studio

**Data:** 09/11/2026  
**Branch:** `feat/workflow-f1`  
**Base validada:** `00e4205d3` + working tree  
**Status:** implementado em 09/11/2026; verificação na seção 7 e em `tmp/progress.md`.

> **Fonte de verdade:** este handoff supersede a descrição de repetição do F2 em
> `tmp/Workflows_Spec_Completa.md`. Onde a spec histórica ainda fala de caminho
> de volta, teto de 25 visitas ou `attempts`, vale este documento: isso tudo é
> removido.

Este documento é o pacote de implementação da F3.1.1. Ele assume que a pessoa
que for codar **não precisa redescobrir o código**: os arquivos e as linhas
prováveis estão no mapa abaixo. A validação que originou as correções está em
`tmp/progress.md` e no relatório da sessão de teste.

---

## 1. O que foi validado e o que falhou

Foram executados 5 cenários de ETL pela UI, com Playwright, contra um fixture
isolado (`OMB_PORT=8999`, `OMB_DATA_DIR=/tmp/opencode/etl-data`,
`HOME=/tmp/opencode/etl-home`, bot `ETL Bot`, engine fake). Evidências em
`/tmp/opencode/agy-evidence/`.

| Cenário | Resultado | Evidência |
|---|---|---|
| 1. ETL feliz (True) | run `succeeded`, mas a etapa False (`corrigir`) executou em vez de `skipped` | run `20261108-170354-1d18b4`, workflow `a5767659-d8ec-4cd8-8f17-f85e3c5cda9f` |
| 2. ETL inválido (False) | correto: `carrega` `skipped`, `corrigir` executou, run `succeeded` | run `20261108-170703-6ef6df` |
| 3. Falha com `onFailure` | não executável: o Studio não oferece controle de `onFailure` | DOM do card de Script |
| 4. Saída faltando | correto: run `failed` com `missing required output "result.json"`, próxima `pending` | run `20261108-170758-92e6f5` |
| 5. Repetição | não executável: o Studio já recusa a conexão de volta; a F3.1.1 remove também o suporte do motor | toast “Conexão recusada: o fluxo deve permanecer sem ciclos” |

O cenário 1 não é um bug do motor. A spec canônica diz que `next` ausente =
próxima etapa do array (`tmp/Workflows_Spec_Completa.md`, seção “Desvios e
repetição”). O Studio não tem como dizer “termina aqui”, então a etapa final do
ramo True invadiu a etapa do ramo False. A correção é o fim explícito.

---

## 2. Decisões aprovadas

1. **`next` → `onSuccess`** no nível da etapa. O nome `next` some do contrato
   da etapa; `when[].next` (destino de uma condição) **permanece** como está.
2. **Resultados explícitos por etapa:** `onSuccess`, `onFailure`, `onTimeout`.
   `onSkipped` **não existe** e não será implementado. Uma etapa `skipped` é uma
   etapa que nunca executou; o “pulo” é decisão do IF/Else, não um evento da
   etapa. Não inventar um estado artificial.
3. **Timeout é resultado próprio, não falha genérica.** Toda etapa executável
   (Agente e Script) pode declarar `timeoutMs`. Estourou: usa `onTimeout`; se
   não houver, usa `onFailure`; se não houver nenhum, a run para.
4. **Repetição é removida do produto.** Não é só “fora do escopo”: o caminho de
   volta e o teto de 25 visitas **saem do código**, como se nunca tivessem
   existido. Isso inclui a constante `WORKFLOW_STEP_VISIT_MAX`, a checagem em
   `advance`, o `resetStepFolders` de revisita, o campo `attempts` do
   `run.json` e a exibição de tentativas na F2. A validação do schema passa a
   exigir arestas **somente para frente** (sem retorno). A repetição visível
   será o componente `kind: "loop"` da F3.3, com outra arquitetura.
5. **Fim explícito:** `onSuccess: null` encerra o ramo. O Studio grava `null`
   quando a saída de sucesso não está conectada. `onSuccess` ausente continua
   valendo “próxima do array” para definições antigas.
6. **Desconectar:** expor na UI o `disconnect()` que já existe no modelo.
7. **`onSkipped` e `kind: loop` não entram na F3.1.1.** O loop está registrado
   na F3.3 em `tmp/progress.md` e `tmp/Workflows_Spec_Completa.md`.

---

## 3. Contrato final (o que o schema deve dizer)

### 3.1 Etapas

Campos comuns a `bot` e `script`:

```ts
onSuccess?: string | null; // null = fim; ausente = legado (próxima do array)
onFailure?: string;        // destino em falha
onTimeout?: string;        // destino em timeout; exige timeoutMs > 0
timeoutMs?: number;        // 0/ausente = sem limite (bot); script mantém 60 s
```

- `condition` mantém `from`, `field`, `op`, `value`, `whenTrue`, `whenFalse`,
  `onFailure`. **Não** ganha `timeoutMs` nem `onTimeout`: é síncrona e não tem
  I/O. Se o dono quiser o campo em todos os cards por consistência visual, ele
  é cosmético e não deve prometer timeout real.
- `when[].next` continua sendo o destino da condição embutida; não renomear.
- `onTimeout` só é válido com `timeoutMs` configurado e > 0.
- `onSuccess` aceita `null`; `onFailure`/`onTimeout` não.
- `onSuccess`, `onFailure`, `onTimeout`, `when[].next`, `whenTrue` e `whenFalse`
  precisam apontar para etapa existente **e com índice maior que o da etapa de
  origem**. Aresta para trás é erro de validação, não “repetição”.
- `from` de uma condição também precisa apontar para uma etapa anterior.
- `WorkflowRunStep` **não tem mais `attempts`**. Cada etapa executa no máximo
  uma vez; o status `skipped` continua sendo derivado no fim da run.

### 3.2 Timeout

- Constantes novas em `shared/workflow.ts`:
  - `WORKFLOW_STEP_TIMEOUT_MAX_MS = 3_600_000` (1 h);
  - `WORKFLOW_BOT_TIMEOUT_DEFAULT_MS = 0` (sem limite);
  - `WORKFLOW_SCRIPT_TIMEOUT_DEFAULT_MS = 60_000` (mantém).
- `timeoutMs: 0` = desligado. O input da UI mostra vazio/“sem limite”.
- O timeout do bot cobre o turno ativo, **não** a pausa de aprovação. Ao pausar
  (`waiting_approval`), o timer para. Ao retomar, não reinicia: o turno que
  settleou é processado direto.
- O timeout do script usa o timer existente de `runWorkflowScript`.

### 3.3 Falha e timeout no run

- `failStep`/`failStepTo` continuam iguais.
- `WorkflowRunStep` ganha `failureKind?: "failure" | "timeout"` (opcional) para
  a timeline distinguir os dois. Runs antigas continuam válidas.
- Mensagens:
  - timeout de bot: `the step timed out after <N>ms`;
  - timeout de script: manter `the script ran longer than <N>ms` e marcar
    `timedOut: true` no resultado interno.

---

## 4. Mapa de arquivos (o que olhar, onde mexer)

### 4.1 Contrato

| Arquivo | Linha/área | Mudança |
|---|---|---|
| `shared/workflow.ts` | 14–18 | constantes de timeout |
| `shared/workflow.ts` | 18 | **remover** `WORKFLOW_STEP_VISIT_MAX` |
| `shared/workflow.ts` | 136 | `when[].next` — **não** renomear |
| `shared/workflow.ts` | 139–154 (`stepBaseSchema`) | `next` → `onSuccess` nullable; `onTimeout`; `timeoutMs` (bot/script) |
| `shared/workflow.ts` | 156–168 (`botStepSchema`/`scriptStepSchema`) | timeout do bot; script mantém default |
| `shared/workflow.ts` | 173–186 (`conditionStepSchema`) | `onFailure` já existe; não adicionar timeout |
| `shared/workflow.ts` | 189–196 (`workflowStepSchema`) | preprocess: mapear `next`→`onSuccess` para definições antigas |
| `shared/workflow.ts` | 237–276 (`superRefine`) | validar `onSuccess`/`onTimeout`, `onTimeout` exige `timeoutMs`, aresta só para frente |
| `shared/workflow.ts` | 332, 390 | **remover** `attempts` do tipo e do schema da run |
| `shared/workflow.test.ts` | 234 | trocar “aceita back edge” por “recusa aresta para trás” |

### 4.2 Motor

| Arquivo | Linha/área | Mudança |
|---|---|---|
| `server/workflows/flow.ts` | 11–20 (`nextStepIndex`) | `onSuccess`; `null` → fim; `undefined` → legado `index+1` |
| `server/workflows/flow.ts` | 22–26 (`failureStepIndex`) | receber `kind: "failure" \| "timeout"`; escolher `onTimeout`/`onFailure` |
| `server/workflows/engine.ts` | 122–131 (`failOrRoute`) | aceitar `kind`; passar para `failureStepIndex` |
| `server/workflows/engine.ts` | 134–151 (`passStep`) | sem mudança além do nome |
| `server/workflows/engine.ts` | 154–190 (`finishStep`) | limpar o timer do bot no início |
| `server/workflows/engine.ts` | 193–246 (`runScriptStep`) | `outcome.timedOut` → `kind: "timeout"` |
| `server/workflows/engine.ts` | 289–354 (`advance`) | timer do bot; **remover** a checagem de `WORKFLOW_STEP_VISIT_MAX` e o `resetStepFolders` de revisita |
| `server/workflows/engine.ts` | 6, 10, 15 | remover import de `WORKFLOW_STEP_VISIT_MAX`/`resetStepFolders`; atualizar o comentário de “back edge” |
| `server/workflows/engine.ts` | 356–450 | mapa `timers`; limpar em `cancel`, `pause`, terminal |
| `server/workflows/script.ts` | 18 | resultado ganha `timedOut?: true` |
| `server/workflows/script.ts` | 88–121 | marcar `timedOut` no branch do timeout |
| `server/workflows/state.ts` | 36, 71, 79 | **remover** `attempts` de `createRun`, `beginStep` e `enterStep` |
| `server/workflows/state.ts` | 108–130 (`completeStep`) | sem mudança estrutural; `null` já é fim |
| `server/workflows/state.ts` | 133–147 (`failStepTo`) | opcional: gravar `failureKind` |
| `server/workflows/files.ts` | 132–138 (`resetStepFolders`) | **remover** a função e o teste dela |
| `server/workflows/engine.test.ts` | 461–497, 577–598 | **apagar** os testes de back edge e de teto de visitas; tirar `attempts` dos fixtures |
| `server/workflows/state.test.ts` | 45–46, 81, 190 | tirar `attempts` |
| `server/workflows/flow.test.ts` | — | testes de `onSuccess: null`, `onTimeout` e recusa de aresta para trás |
| `server/workflows/script.test.ts` | — | `timedOut` |
| `server/routes/workflows.test.ts` | — | save/leitura do contrato novo e recusa de aresta para trás |

### 4.3 Studio

| Arquivo | Linha/área | Mudança |
|---|---|---|
| `src/components/studio/studio-model.ts` | 13–15 | `StudioBranch` ganha `"failure"` e `"timeout"` |
| `src/components/studio/studio-model.ts` | 93–128 (`fromDefinition`/`toDefinition`) | migrar legado (`next` implícito) e gravar `onSuccess: null` |
| `src/components/studio/studio-model.ts` | 184–207 (`removeStep`) | limpar `onTimeout` e `onSuccess` |
| `src/components/studio/studio-model.ts` | 221–229 (`outgoing`) | incluir `onFailure`/`onTimeout`; `onSuccess` |
| `src/components/studio/studio-model.ts` | 231–236 (`entrySource`) | fan-in para falha/timeout; sucesso continua entrada única |
| `src/components/studio/studio-model.ts` | 252–279 (`connect`) | branches `failure`/`timeout`; `onSuccess` |
| `src/components/studio/studio-model.ts` | 281–292 (`disconnect`) | `failure`/`timeout`; sucesso → `null` |
| `src/components/studio/studio-model.ts` | 354–372 (`draftProblem`) | validar `onTimeout` e `onSuccess: null` |
| `src/components/studio/StudioCard.tsx` | 30–53 | branches de falha/timeout (bot, script; condição só falha) |
| `src/components/studio/StudioCard.tsx` | 90–111 | prévia: `onSuccess`, “Fim”, falha, timeout |
| `src/components/studio/StudioCard.tsx` | 200–283 | portas de falha/timeout |
| `src/components/studio/StudioBalloon.tsx` | 152–201 | timeout do bot/script; `onFailure`/`onTimeout` |
| `src/components/studio/StudioBalloon.tsx` | 203–226 | condição: destino de falha; Run = “Fim” quando `null` |
| `src/components/studio/StudioBalloon.tsx` | 229–233 | botão **Desconectar** no branch conectado |
| `src/components/studio/WorkflowStudioPage.tsx` | 368–388 | desenhar `onFailure`/`onTimeout` com cor própria |
| `src/components/studio/WorkflowStudioPage.tsx` | 492–510 | duplicar limpa `onSuccess`/`onFailure`/`onTimeout` |
| `src/components/studio/WorkflowStudioPage.tsx` | 628–644 | `nearestFreeOutput` com os novos branches |
| `src/components/studio/WorkflowStudioPage.tsx` | 570–587 | passar `onDisconnect` ao balão/card |
| `src/components/studio/studio-model.test.ts` | 34–40 | o teste que fixa “ciclo recusado” continua válido; adicionar falha/timeout/fim |
| `src/components/workflows/StepPanel.tsx` | 86, 171–192 | `onSuccess`, `onTimeout`, “Fim” e runtime |
| `src/components/workflows/RunDetail.tsx` | 41–42 | **remover** a exibição de `attempts`; sobra só a duração |
| `src/components/workflows/WorkflowSteps.tsx` | desenho | se houver aresta, usar `onSuccess` (conferir) |

### 4.4 Textos

| Arquivo | Mudança |
|---|---|
| `src/locales/en.json` | `studio.branch.failure`, `studio.branch.timeout`, `studio.card.end`, `studio.agent.timeout`, `studio.agent.timeoutHelp`, `studio.disconnect`, `workflows.step.onSuccess`, `workflows.step.onTimeout`, `workflows.step.timeoutEnd`; **remover** `workflows.run.attemptsOne/Other` |
| `src/locales/pt-br.json` | idem |
| `scripts/generate-locale.mjs` | rodar `node scripts/generate-locale.mjs pt-br --accept` |
| `source-hashes.json` | atualizar pelo gerador |

### 4.5 Não mexer

- `server/workflows/paths.ts`, `brief.ts`, `retention.ts`, `store.ts` (exceto se
  o tipo do passo vazar para lá — hoje não vaza). `files.ts` só perde
  `resetStepFolders`; o resto fica.
- `server/workflows/condition.ts`: a condição não muda.
- `src/components/studio/studio-geometry.ts`: geometria existente serve.

---

## 5. Ordem de implementação

1. **Contrato** (`shared/workflow.ts` + testes do schema): `onSuccess`, timeout,
   fim explícito, **remoção de `WORKFLOW_STEP_VISIT_MAX` e `attempts`**, aresta
   só para frente. Sem isso, o TypeScript acusa todos os `.next` do resto.
2. **Motor** (`flow.ts`, `engine.ts`, `script.ts`, `state.ts`, `files.ts`) +
   testes: timeout, `onTimeout`, **remoção do teto, do reset de revisita e dos
   testes de back edge**.
3. **Studio model** (`studio-model.ts`) + testes. Aqui entra o fim explícito,
   `onFailure`/`onTimeout` e o `disconnect`.
4. **Studio UI** (`StudioCard`, `StudioBalloon`, `WorkflowStudioPage`).
5. **F2** (`StepPanel`, `RunDetail` sem `attempts`).
6. **i18n** e `generate-locale` (remover as chaves de tentativas).
7. **Verificação** (seção 7).

---

## 6. Compatibilidade e migração

- `workflows.json` e corpos HTTP antigos podem trazer `next`. O preprocess de
  `workflowStepSchema` deve copiar `next` para `onSuccess` quando
  `onSuccess` estiver ausente e remover `next` do objeto final.
- `when[].next` não é migrado.
- `comparable()` em `store.ts` ignora `version`, `createdAt`, `updatedAt` e
  `canvas`; como a normalização acontece na leitura, um save sem mudança não
  cria versão.
- No Studio, `fromDefinition` deve **materializar** o legado: se um passo
  bot/script vier com `onSuccess` ausente e não for o último do array, o draft
  recebe o id da próxima etapa. Assim, abrir e salvar um Workflow antigo preserva
  o comportamento linear. Passos novos/usados sem conexão salvam `null`.
- `run.json` antigo não tem `failureKind`; o campo é opcional e a timeline deve
  tratar ausência como `failure`.
- `run.json` antigo pode ter `attempts`. O schema novo não declara o campo; o
  Zod o descarta na leitura. A UI não mostra mais tentativas.
- Workflow antigo que tenha aresta para trás passa a ser **inválido** na
  validação. O `store.ts` já ignora definições inválidas e registra no log
  (`workflows: ignoring an invalid definition in ...`). Não tentar “consertar”
  automaticamente: a repetição foi removida de propósito. Se o dono quiser um
  aviso na UI para esses casos, isso é um extra, não parte do aceite.
- `WORKFLOW_STEP_VISIT_MAX` some do código e dos testes. Nenhum erro
  `reached the visit limit of 25` deve existir depois da F3.1.1.

---

## 7. Critérios de aceite

### 7.1 Testes automatizados

```sh
pnpm typecheck
pnpm lint
pnpm i18n:check
pnpm vitest run server/workflows server/routes/workflows.test.ts src/components/studio src/components/workflows
```

Casos novos obrigatórios:

- schema aceita `next` antigo e devolve `onSuccess`;
- `onSuccess: null` encerra a run mesmo com etapa seguinte no array;
- `onSuccess` ausente continua linear (legado);
- `onTimeout` só com `timeoutMs > 0`;
- script estoura → `timedOut` → segue `onTimeout`;
- script falha normal → segue `onFailure`, não `onTimeout`;
- bot nunca settle → timeout → `onTimeout`;
- pausa de aprovação não estoura o timeout;
- `connect`/`disconnect` de `onFailure` e `onTimeout`;
- `connect` de sucesso para etapa com entrada de falha é permitido; duas
  entradas de sucesso continuam recusadas;
- **aresta para trás é recusada no schema**, em `onSuccess`, `onFailure`,
  `onTimeout`, `when[].next`, `whenTrue` e `whenFalse`;
- `run.json` novo **não tem `attempts`**;
- os testes de back edge e de teto de 25 visitas foram **removidos**, não
  apenas pulados;
- nenhuma string `reached the visit limit` sobra no código.

### 7.2 Cenários manuais (repetir os 5)

Fixture isolado, conforme `docs/verification/workflow-studio.md`:

```sh
mkdir -p /tmp/opencode/etl-data /tmp/opencode/etl-home
OMB_PORT=8999 OMB_DATA_DIR=/tmp/opencode/etl-data HOME=/tmp/opencode/etl-home pnpm dev:server
OMB_UI_PORT=5399 OMB_PORT=8999 pnpm dev
```

- **Cenário 1:** `extrai → transforma → IF/Else → carrega` + `corrigir`. Com o
  fim explícito, `corrigir` fica `skipped` mesmo sendo a última do array. A run
  termina `succeeded`; a instrução editada gera v2; mover o canvas mantém v2.
- **Cenário 2:** `{"ok":false}` → `corrigir`, `carrega` `skipped`, run
  `succeeded`.
- **Cenário 3:** Script lança erro e declara `onFailure=avisar` pela UI;
  `avisar` executa e a run segue o destino. Sem `onFailure`, a run para.
- **Cenário 4:** Script não grava `result.json` → run `failed` com
  `missing required output "result.json"`; próxima não roda.
- **Cenário 5:** a repetição **não existe mais**. O Studio recusa o ciclo com o
  toast atual e o servidor também recusa a aresta para trás no save. Não deve
  haver run de repetição nem erro de teto de visitas. A repetição estruturada
  fica para o `kind: "loop"` (F3.3), com outra arquitetura.

### 7.3 Regressões conhecidas da base (não são desta entrega)

`server/drivers/codex.test.ts`, `src/mimir/MimirRail.test.ts`,
`src/components/ComputerFilesPane.test.ts`,
`src/components/GroupView.message-actions.test.ts`,
`src/components/TeamOwner.test.ts`, `shared/app-frame/host-page.test.ts`.

---

## 8. Fora do escopo (não fazer nesta rodada)

- `onSkipped` como aresta de etapa.
- Qualquer forma de repetição/ciclo: o caminho de volta e o teto são removidos
  nesta rodada; não reintroduzir por outro caminho.
- `kind: "loop"` com corpo, condição e `maxIterations` (F3.3).
- Expressão livre no IF/Else.
- Retry automático.
- Ferramentas por etapa.
- Modo Manual.

---

## 9. Registro da decisão sobre `kind: "loop"` (F3.3)

Quando a repetição voltar, ela **não** deve ser uma propriedade da etapa nem um
`goto` visível para a pessoa. O desenho aprovado é um componente:

```ts
kind: "loop";
body: WorkflowStep[];      // ou um range explícito de etapas
from: string;              // etapa cujo result.json alimenta a condição
field: string;
op: ConditionOp;
value?: unknown;
maxIterations: number;     // teto próprio, com erro claro
```

A engine pode executar o corpo com um frame de loop no `run.json` ou expandir o
corpo internamente. O importante é que o usuário veja uma caixa, não setas de
retorno, e que o mecanismo antigo de back edge **não volte**: ele foi removido
na F3.1.1. O loop da F3.3 tem o próprio `maxIterations` e o próprio erro de
limite. Isso exige frame de execução (pilha) ou expansão controlada; por isso
fica para depois de validar a arquitetura atual.
