# Workflow — ambiente de execução por instalação

**Data:** 2026-11-16
**Estado:** implementado (branch `release/0.1.176-beta.1`)
**Escopo:** isolamento de dependências de script (Python e Node) em um ambiente por instalação do app.
**Fora do escopo:** drivers de GPU, sandbox de execução, instalação automática durante a run.

## 1. Problema

Antes desta entrega, o script de Workflow rodava como o usuário do app, usando o
Python e o Node do sistema. Isso produziu uma falha real no QA do beta:
`faster_whisper 1.2.1` quebrou por conflito com a biblioteca `av` instalada no
sistema, e a etapa falhou no meio da run.

Consequências do modelo anterior:

- `modules` só conferia binário no `PATH`; não conferia versão nem importabilidade;
- instalar dependência exigia mexer no Python do sistema, que em distro moderna é recusado (PEP 668);
- duas máquinas com a mesma definição podiam rodar versões diferentes da mesma biblioteca;
- não havia como desfazer uma instalação sem afetar o resto do sistema.

## 2. Decisão

**Um ambiente por instalação**, preparado por ação explícita, verificado no preflight e nunca instalado durante a run.

- Python: `venv` próprio.
- Node: `package.json` + `node_modules` próprios, na raiz do projeto do app.
- O ambiente é único para todos os departamentos e Workflows da instalação.

## 3. Layout

```
~/MimirBot/
├── package.json                    ← gerado; dependências node declaradas
├── package-lock.json               ← gerado pelo npm
├── node_modules/                   ← instalado pelo npm
└── .workflow-env/
    ├── python/                     ← venv
    │   ├── bin/python              (POSIX)
    │   └── Scripts/python.exe      (Windows)
    ├── requirements.txt            ← gerado; dependências python
    └── state.json                  ← hash, versões, quando preparou
```

O `node_modules` fica na raiz e **não** dentro de `.workflow-env` por uma razão
técnica: o resolvedor ESM do Node sobe a árvore a partir do script
(`<dept>/workflows/<id>/scripts/`) e só encontra um `node_modules` que seja
ancestral. Symlink não é usado porque no Windows exige privilégio.

`~/MimirBot` já é a raiz de projeto do app (D6) e não fica no data dir.

### 3.1 `state.json`

```json
{
  "preparedAt": 1794800000000,
  "hash": "sha256:…",
  "python": "3.12.4",
  "pythonBin": "/home/user/MimirBot/.workflow-env/python/bin/python",
  "node": "22.11.0",
  "modules": [
    { "name": "faster-whisper", "runtime": "python", "version": "1.2.1" },
    { "name": "sharp", "runtime": "node", "version": "0.33.5" }
  ]
}
```

O schema de leitura é `environmentStateSchema`; um `state.json` inválido é
tratado como ambiente não preparado.

`hash` é `workflowEnvironmentHash` sobre a lista ordenada de
`(name, runtime, version)` do conjunto **declarado** na preparação. Como o
declarado sem versão continua sem versão no hash, preparar e depois rodar dá o
mesmo hash mesmo que o `state.json` registre a versão resolvida.

## 4. Contrato de `modules`

`modules` de uma etapa de script é uma lista. Cada item é:

| Forma | Significado |
|---|---|
| `"yt-dlp"` | binário no `PATH` (comportamento mantido) |
| `"gpu"` | a GPU da máquina (só binário) |
| `{ "name": "ffmpeg" }` | binário, na forma explícita |
| `{ "name": "faster-whisper", "runtime": "python", "version": "1.2.1" }` | pacote do venv |
| `{ "name": "sharp", "runtime": "node", "version": "0.33.5" }` | pacote do `node_modules` |

Regras:

- `runtime` ausente com objeto = `"bin"`; string = binário.
- `runtime` é um de `bin`, `python`, `node`.
- `version` opcional em `python`/`node`; quando presente, a preparação instala
  exatamente e o preflight compara.
- **`bin` não aceita `version`**: um binário é conferido no `PATH` e não tem
  versão declarada. O schema recusa; a mensagem manda remover `version` ou
  declarar a dependência com `runtime: "python"`/`"node"`.
- Nome de pacote: `^[a-z0-9][a-z0-9._-]*$` para python e binário;
  `^(@[a-z0-9._-]+/)?[a-z0-9][a-z0-9._-]*$` para node.
- Versão: `^[0-9A-Za-z.+!_*-]+$`. Sem URL, sem caminho local, sem `--flag`, sem
  espaço.
- Máximo de 16 módulos por etapa, 64 caracteres por nome e por versão.
- Nada de instalar dependência de dependência declarada no Workflow: isso é
  papel do lockfile.

## 5. Preparação

Rota admin: `POST /api/workflows/environment/prepare`. Ação humana; o bot não
instala.

1. Calcula a união de `modules` de todos os Workflows salvos **e** das propostas
   em rascunho (`declaredWorkflowModules`). Se o mesmo pacote aparece com duas
   versões, a preparação falha antes de qualquer comando.
2. Escreve `.workflow-env/requirements.txt` com `name==version` (ou `name` sem
   versão).
3. Escreve `package.json` na raiz com `dependencies` (versão exata quando
   declarada; `*` quando não).
4. Cria o venv se não existir: `python3 -m venv .workflow-env/python` (no
   Windows, `py -3 -m venv`).
5. Roda `pip install -r requirements.txt` e `npm install --no-audit --no-fund`,
   **sem shell**, capturando a cauda do erro. No Windows, `npm` é chamado pelo
   seu `npm-cli.js` com o `process.execPath`, porque um `.cmd` não abre sem
   shell.
6. Confere cada módulo: python por `python -c "import x"` e
   `importlib.metadata.version`; node pelo `package.json` instalado; binário por
   `isCommandOnPath`. O que não responde entra em `missing`.
7. Grava `state.json` com versões, `preparedAt`, interpretador, Node e o hash do
   conjunto declarado.
8. Devolve `{ ok, preparedAt, hash, installed, missing, tail }`.

Timeouts: cada comando (`pip`, `npm`, `venv`) tem **15 min**
(`INSTALL_TIMEOUT_MS`); cada verificação de módulo e a leitura da versão do
Python têm **60 s** (`PROBE_TIMEOUT_MS`). A rota não aceita outro valor; os
testes injetam `installTimeoutMs`.

Falha em qualquer passo: `ok: false`, os manifestos voltam ao conteúdo anterior
(e são removidos se não existiam) e nenhum `state.json` novo é gravado. Nada é
apagado: o venv, o `node_modules` e o que já estava instalado permanecem.

**Não há poda.** Um pacote que ninguém mais declara continua instalado; o
`state.json` passa a listar só o conjunto novo e o status da tela mostra
`changed` (declarados que faltam + preparados que não são mais declarados).

### 5.1 Quando preparar

- Primeira vez que um Workflow declara um módulo python/node.
- Quando o conjunto declarado muda (o hash deixa de bater).
- Quando a pessoa pede, pelo botão **Preparar ambiente** (balão do Script ou
  menu do painel de Workflows).

A interface mostra: nunca preparado, preparado em `<data>`, ou desatualizado
(com quantos módulos mudaram).

## 6. Preflight da run

Antes de criar a run (e de novo antes de cada etapa de script), sem rede:

1. Para cada item `bin`: binário no `PATH`; `gpu` checa a GPU da máquina.
2. Se o Workflow não declara nenhum `python`/`node`: nada a verificar além dos
   binários.
3. Se declara: `state.json` existe; o Workflow não declara o mesmo pacote em
   duas versões; o hash do conjunto declarado é igual ao preparado; e o
   interpretador (`state.pythonBin`, ou `paths.python`) / `node_modules`
   existem.

Detalhe do hash: quando o hash difere, o preflight conta quantos módulos
declarados faltam no preparado (`missingDeclaredModules`). Se nenhum falta — por
exemplo, o `state.json` registrou a versão resolvida de uma declaração sem
versão — a run segue. Se algum falta, recusa:

```
the environment is not prepared for this Workflow: run "Prepare environment" (2 modules changed)
```

O preflight **não importa** módulo: importar `torch` custa segundos e não cabe
por etapa.

## 7. Execução

`server/workflows/script.ts`:

- exporta `WORKFLOW_PYTHON` com o caminho absoluto do interpretador do venv;
- exporta `WORKFLOW_NODE_MODULES` com o caminho absoluto do `node_modules` da instalação;
- prefixa `PATH` com `<venv>/bin` (`Scripts` no Windows), para que `python`/`pip` resolvam no venv quando o script os chamar pelo nome;
- mantém o ambiente mínimo atual, sem shell;
- usa o próprio Node do app (`process.execPath`), com
  `ELECTRON_RUN_AS_NODE=1` quando empacotado;
- não passa argumentos: os valores chegam por `input/params.json`.

Contrato para o autor: em `.mjs`, chamar `python` por
`process.env.WORKFLOW_PYTHON`; nunca `python3` fixo. O runner só aceita `.mjs`;
`.py` não é etapa.

Nenhum desses valores (`WORKFLOW_PYTHON`, `WORKFLOW_NODE_MODULES`, `PATH`
prefixado) chega a uma etapa de bot: o ambiente é montado só para o processo do
script.

## 8. Segurança

- Nomes e versões validados pelo contrato de `modules`; nada de URL, caminho, flag ou espaço.
- `pip` e `npm` rodam por `spawn` com argumentos, **nunca** por shell.
- A preparação é ação admin, humana, com rede; a run não instala nada.
- O ambiente fica fora do data dir e não entra no backup (dependências são reproduzíveis; o `package.json`/`requirements.txt` sim).
- Apagar `.workflow-env`, `node_modules`, `package.json` e `package-lock.json` desfaz o ambiente por completo.

## 9. Migração

- `modules: ["yt-dlp"]` continua válido e não exige ambiente preparado.
- Workflow que declara string de pacote python (caso do QA: `"faster-whisper"`)
  continua tratado como **binário** até alguém corrigir para objeto com
  `runtime: "python"`. O validador de autoria avisa quando um nome parece pacote
  (tem `-` e não existe no `PATH`) e sugere `runtime`.
- `state.json` ausente com módulos python/node: preflight recusa com a mensagem
  do §6.
- O `run.json` e as definições antigas não mudam: o ambiente é externo à
  definição.

## 10. Testes

- Schema: string, objeto sem runtime, python com versão, node com escopo,
  `bin` com versão recusado, nome/versão inválidos recusados, `gpu` só em
  binário.
- Preparação: união de Workflows + propostas; conflito de versões falha antes de
  instalar; hash muda quando `modules` muda; falha de `pip` devolve cauda e não
  apaga o ambiente; `state.json` gravado; versão resolvida registrada.
- Preflight: sem módulos python/node não exige ambiente; hash diferente recusa;
  hash igual passa; binário ausente recusa; interpretador/`node_modules` ausente
  recusa.
- Runner: `WORKFLOW_PYTHON` e `WORKFLOW_NODE_MODULES` presentes; `PATH`
  prefixado; nenhum desses valores vaza para etapa de bot.
- Autorização: rota de preparação só admin.
- Nenhum teste de rede: `pip`/`npm` são dublês.

## 11. Fora do escopo e pendências

- Driver/CUDA (é do sistema, não do Python).
- Sandbox de execução de script.
- Instalação automática na run (**nunca**).
- **Poda**: remover pacotes que ninguém declara. Hoje eles permanecem.
- **Windows**: o código tem os ramos (`py -3 -m venv`, `Scripts/python.exe`,
  `npm-cli.js` sem shell), mas a suíte cobre o layout POSIX; a verificação em
  uma máquina Windows está pendente.
- Ambiente por Workflow ou por departamento.
- Lockfile próprio além do gerado pelo npm/pip.
- **Python de primeira classe** (etapa `.py` com contrato próprio): não existe;
  Python é dependência chamada por um `.mjs`.
