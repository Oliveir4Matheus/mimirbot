# Workflow — ambiente de execução por instalação

**Data:** 2026-11-16
**Estado:** aprovado para implementação
**Escopo:** isolamento de dependências de script (Python e Node) em um ambiente por instalação do app.
**Fora do escopo:** drivers de GPU, sandbox de execução, instalação automática durante a run.

## 1. Problema

Hoje o script de Workflow roda como o usuário do app, usando o Python e o Node do sistema. Isso produziu uma falha real no QA do beta: `faster_whisper 1.2.1` quebrou por conflito com a biblioteca `av` instalada no sistema, e a etapa falhou no meio da run.

Consequências do modelo atual:

- `modules` só confere binário no `PATH`; não confere versão nem importabilidade;
- instalar dependência exige mexer no Python do sistema, que em distro moderna é recusado (PEP 668);
- duas máquinas com a mesma definição podem rodar versões diferentes da mesma biblioteca;
- não há como desfazer uma instalação sem afetar o resto do sistema.

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

O `node_modules` fica na raiz e **não** dentro de `.workflow-env` por uma razão técnica: o resolvedor ESM do Node sobe a árvore a partir do script (`<dept>/workflows/<id>/scripts/`) e só encontra um `node_modules` que seja ancestral. Symlink não é usado porque no Windows exige privilégio.

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

`hash` é o SHA-256 da lista ordenada de `(name, runtime, version)` do conjunto **preparado**. Ele é o que torna a verificação da run barata.

## 4. Contrato de `modules`

`modules` de uma etapa de script continua sendo uma lista. Cada item é:

| Forma | Significado |
|---|---|
| `"yt-dlp"` | binário no `PATH` (comportamento atual, mantido) |
| `{ "name": "ffmpeg" }` | binário, na forma explícita |
| `{ "name": "faster-whisper", "runtime": "python", "version": "1.2.1" }` | pacote do venv |
| `{ "name": "sharp", "runtime": "node", "version": "0.33.5" }` | pacote do `node_modules` |

Regras:

- `runtime` ausente com objeto = `"bin"`; string = binário.
- `version` opcional; quando presente, a preparação instala exatamente e o preflight compara.
- Nome de pacote: `^[a-z0-9][a-z0-9._-]*$` para python e binário; `^(@[a-z0-9._-]+/)?[a-z0-9][a-z0-9._-]*$` para node.
- Versão: `^[0-9A-Za-z.+!_*-]+$`. Sem URL, sem caminho local, sem `--flag`, sem espaço.
- Nada de instalar dependência de dependência declarada no Workflow: isso é papel do lockfile.

## 5. Preparação

Rota admin: `POST /api/workflows/environment/prepare`. Ação humana; o bot não instala.

1. Calcula a união de `modules` de todos os Workflows salvos **e** das propostas em rascunho.
2. Escreve `.workflow-env/requirements.txt` com `name==version` (ou `name` sem versão).
3. Escreve `package.json` na raiz com `dependencies` (versão exata quando declarada).
4. Cria o venv se não existir: `python3 -m venv .workflow-env/python` (no Windows, `py -3 -m venv`).
5. Roda `pip install -r requirements.txt` e `npm install --no-audit --no-fund`, **sem shell**, capturando a cauda do erro.
6. Importa cada módulo python (`python -c "import x"`) e resolve cada pacote node, registrando a versão instalada.
7. Grava `state.json` com versões, `preparedAt` e o hash do conjunto instalado.
8. Devolve `{ ok, preparedAt, hash, installed, missing, tail }`.

Falha em qualquer passo: `ok: false`, o resto do ambiente fica como estava e nada é apagado.

### 5.1 Quando preparar

- Primeira vez que um Workflow declara um módulo python/node.
- Quando o hash das dependências deixa de bater com `state.json`.
- Quando a pessoa pede, pelo botão “Preparar ambiente” (menu do painel de Workflows).

A interface mostra: nunca preparado, preparado em `<data>`, ou desatualizado (com o que mudou).

## 6. Preflight da run

Antes de criar a run (e de novo antes de cada etapa de script), sem rede:

1. Para cada item `bin`: binário no `PATH`.
2. Se o Workflow não declara nenhum `python`/`node`: nada a verificar além dos binários.
3. Se declara: `state.json` existe, o hash do conjunto declarado é igual ao preparado, e o interpretador aponta para um caminho existente.

Falha = run não começa (ou etapa falha) com mensagem acionável:

```
the environment is not prepared for this Workflow: run "Prepare environment" (2 modules changed)
```

O preflight **não importa** módulo: importar `torch` custa segundos e não cabe por etapa.

## 7. Execução

`server/workflows/script.ts` passa a:

- exportar `WORKFLOW_PYTHON` com o caminho absoluto do interpretador do venv;
- exportar `WORKFLOW_NODE_MODULES` com o caminho absoluto do `node_modules` da instalação;
- prefixar `PATH` com `<venv>/bin` (`Scripts` no Windows), para que `python`/`pip` resolvam no venv quando o script os chamar pelo nome;
- manter o ambiente mínimo atual, sem shell.

Contrato para o autor: em `.mjs`, chamar `python` por `process.env.WORKFLOW_PYTHON`; nunca `python3` fixo.

## 8. Segurança

- Nomes e versões validados pelo contrato de `modules`; nada de URL, caminho, flag ou espaço.
- `pip` e `npm` rodam por `spawn` com argumentos, **nunca** por shell.
- A preparação é ação admin, humana, com rede; a run não instala nada.
- O ambiente fica fora do data dir e não entra no backup (dependências são reproduzíveis; o `package.json`/`requirements.txt` sim).
- Apagar `.workflow-env`, `node_modules`, `package.json` e `package-lock.json` desfaz o ambiente por completo.

## 9. Migração

- `modules: ["yt-dlp"]` continua válido e não exige ambiente preparado.
- Workflow que já declara string de pacote python (caso do QA: `"faster-whisper"`) passa a ser tratado como **binário** até alguém corrigir para objeto com `runtime: "python"`. O validador de autoria avisa quando um nome parece pacote (tem `-` e não existe no `PATH`) e sugere `runtime`.
- `state.json` ausente com módulos python/node: preflight recusa com a mensagem do §6.

## 10. Testes

- Schema: string, objeto sem runtime, python com versão, node com escopo, nome/versão inválidos recusados.
- Preparação: união de Workflows + propostas; hash muda quando `modules` muda; falha de `pip` devolve cauda e não apaga o ambiente; `state.json` gravado.
- Preflight: sem módulos python/node não exige ambiente; hash diferente recusa; hash igual passa; binário ausente recusa.
- Runner: `WORKFLOW_PYTHON` e `WORKFLOW_NODE_MODULES` presentes; `PATH` prefixado; nenhum desses valores vaza para etapa de bot.
- Autorização: rota de preparação só admin.
- Nenhum teste de rede: `pip`/`npm` são dublês.

## 11. Fora do escopo

- Driver/CUDA (é do sistema, não do Python).
- Sandbox de execução de script.
- Instalação automática na run.
- Ambiente por Workflow ou por departamento.
- Lockfile próprio além do gerado pelo npm/pip.
