# Próximas tarefas combinadas

Itens pedidos pelo dono em 2026-11-06, para trabalharmos juntos. Nenhum deles
depende de commits do upstream que ainda não tenhamos triado.

## 1. Expor o modo `pool` na tela do Computer

Hoje `localVm.mode` aceita `shared`, `per-bot` e `pool` no servidor
(`server/config.ts`), e o pool já tem seats com afinidade por thread
(`server/local-vm-lease.ts`, `server/local-vm-inventory.ts`). A tela
`src/components/LocalComputerSection.tsx` só oferece `shared` e `per-bot`
(linha ~1294), igual ao upstream.

Falta: adicionar a opção `pool` ao seletor, mostrar o campo de `maxInstances`
(quantos seats) e explicar o custo de memória de cada seat. O servidor e os
testes de config já cobrem `mode: "pool"`.

## 2. Modal de preview para `.md` e `.xlsx`

O que já existe:

- `.html`: `src/components/HtmlFilePreview.tsx` (frame sandboxed).
- `.csv`/`.tsv`: `src/components/TableFilePreview.tsx` + `RichTable`.
- `.md` e `.xlsx` caem no fluxo genérico de download.

Falta:

- `.md`: abrir num modal reusando `ChatMarkdown` (já renderiza markdown com
  tabelas, código e links). É o caso barato.
- `.xlsx`: não há parser de planilha nas dependências. Decidir entre SheetJS
  e exceljs, ler só o primeiro sheet e limitar linhas/colunas como o
  `TableFilePreview` faz para CSV. Avaliar se vale a dependência ou se é
  melhor abrir o arquivo no painel de dados (AG Grid/DuckDB) que já existe.

## Fora de escopo

- `f63eea855` e `76da3a323` (HTML preview + Open in browser do upstream) são
  melhorias do HTML que já temos; ficam para quando o preview for mexido.
