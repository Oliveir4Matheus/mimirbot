# Prompt — revisão de impacto da feature “Workflow a partir da conversa”

Você é um revisor de engenharia sênior. Avalie os impactos dos arquivos criados
ou alterados pela feature **Workflow a partir da conversa** e diga se ela quebra
algo do projeto que está na `main` ou se está em conformidade.

## Repositório e escopo

- Repo: `/home/matheus/workspace/mobiusbot`
- Branch da feature: `feat/workflow-f1`
- Commits da feature: `85ea992fe..HEAD`
- Base de comparação: `main` para comportamento existente; para os arquivos da
  feature use `git diff --name-status 85ea992fe..HEAD`.
- Leia primeiro:
  - `AGENTS.md`
  - `docs/superpowers/specs/2026-11-12-workflow-a-partir-da-conversa.html`
  - `tmp/Workflows_Spec_Completa.md` — seções **28** (implementação) e **29**
    (mapa de arquivos da feature)
  - `docs/superpowers/specs/2026-11-03-workflow-engine-design.md`
  - `docs/verification/workflow-proposal.md`
  - `tmp/progress.md` — seção **F3.4**

## O que verificar

1. **Compilação e testes:** `pnpm typecheck`, `pnpm lint`, `pnpm i18n:check` e
   os testes focados de workflow/rotinas/propostas.
2. **Compatibilidade de contrato:** `shared/workflow.ts` (novos campos
   `parameters`, `inputs`, `requestId`), `shared/workflow-proposal.ts`,
   `shared/wire.ts`. Workflows e runs antigos continuam válidos?
3. **Motor:** etapa manual, rotina que cria run parada, Do While, condição,
   script, aprovação, retomada, timeout, cancelamento e reinício.
4. **Persistência:** `workflows.json`, `workflow-proposals.json`, `run.json`,
   scripts por versão, retenção e ausência de migração necessária.
5. **Rotas e ferramentas:** rotas públicas/internas, departamento, capability,
   `run_workflow(inputs)`, `needs_input`, ferramentas de proposta.
6. **UI:** Workflows, Propostas, prévia, Studio, cartão no chat, rotina com
   alvo Workflow e textos/i18n.
7. **Segurança:** caminhos de arquivo, scripts, memória vazia na etapa, hash de
   aprovação, cartão de aprovação e isolamento do fixture.
8. **Documentação:** os arquivos de spec/verificação estão no diretório certo
   (`docs/superpowers/specs/`, `docs/verification/`, `tmp/` para working docs)?
9. **Fora de escopo:** não reinterprete decisões de produto; apenas aponte
   contradições entre a spec e o código.

## Saída esperada

- Tabela: arquivo, impacto, risco de quebra, evidência.
- Lista de **bloqueadores** (quebra na main) e **não bloqueadores**.
- Veredito: **em conformidade** ou **quebra algo**.
- Comandos rodados e resultados.
- Não altere código, spec ou commits sem pedido.
