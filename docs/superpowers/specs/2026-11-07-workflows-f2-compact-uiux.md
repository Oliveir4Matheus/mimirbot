# MimirBot — Workflows (F2)
## Especificação detalhada de interface e experiência — versão compacta aprovada

**Tipo:** especificação visual e comportamental de UI/UX  
**Tela:** Workflows / Runs  
**Referência visual principal:** `MimirBot_Workflows_F2_Compacto.html`  
**Referências auxiliares:** `MimirBot_Workflows_F2_Compacto_workflows.png`, `MimirBot_Workflows_F2_Compacto_runs.png`, `MimirBot_Workflows_F2_Compacto_mobile.png`  
**Estado:** reprodução fiel do protótipo aprovado em 07/11/2026  
**Idioma visível:** português (Brasil)

> **Limite obrigatório desta especificação:** definir **o que a pessoa vê e como a interface reage**. Não prescrever framework, estrutura de componentes, arquivos-fonte, bibliotecas, endpoints, banco de dados, mecanismo de eventos, persistência ou implementação de execução. O código existente do MimirBot é responsável por essas decisões.
>
> **Separação de funcionalidades:** esta é uma tela de **administração, consulta e acompanhamento**. Não criar nem editar Workflows nesta tela. A visualização das etapas é **somente leitura**. O editor visual Workflow Studio é outra interface.

---

## 1. Objetivo e fidelidade

Reproduzir a interface **Workflows** dentro do shell visual existente do MimirBot. A pessoa pode localizar Workflows, ver suas versões e etapas, acompanhar runs, iniciar novas execuções, cancelar e excluir itens nos estados permitidos.

O design deve permanecer coerente com a interface da aplicação mostrada no material de referência: superfície predominantemente branca, navegação de ícones estreita à esquerda, barra superior discreta e composição minimalista com divisórias finas.

**Alterações aprovadas nesta versão em relação ao primeiro protótipo F2:**

1. O desenho **vertical do fluxo** utiliza um fundo branco com **pontos escuros a cada 24 px**, como no Workflow Studio.
2. Cada run na lista lateral possui um **ícone circular próprio** com anel de cor e distintivo visual para representar seu estado.
3. Quando a run está **em execução**, parte do anel azul **gira continuamente**.
4. A lista de Runs **não apresenta rótulos redundantes de status** como “Falhou”, “Concluída”, “Em execução” e “Aguardando aprovação”. O ícone comunica o estado. O nome do estado permanece acessível via tooltip e leitor de tela.
5. Itens das listas de **Workflows e Runs são compactos**, com menor altura e menos espaço entre informações.
6. Todas as demais funções da tela F2 são preservadas.

**Regra de escopo:** o item 4 aplica-se **à lista compacta de Runs**. No cabeçalho de detalhe de uma run, nos avisos e na linha do tempo, os textos de status **continuam necessários** para clareza.

---

## 2. Estrutura principal e hierarquia visual

### 2.1 Composição em desktop

```text
┌─────────┬───────────────────────────────────────────────────────────────────┐
│ Logo    │ This computer       Controles      MimirBot      Modelo           │ ← topo
├─────────┼───────────────────┬───────────────────────────────────────────────┤
│ Ícones  │ Workflows  Ao vivo │                                               │
│ do app  │ Workflows | Runs   │   Cabeçalho do Workflow ou da run            │
│         │───────────────────│───────────────────────────────────────────────│
│         │ Busca             │                                               │
│         │ Filtros + total   │   Workflow: desenho vertical pontilhado        │
│         │───────────────────│             OU                                │
│         │ Lista compacta    │   Run: aprovação, timeline, resultado         │
│         │                   │                                               │
│         │                   │                                               │
└─────────┴───────────────────┴───────────────────────────────────────────────┘
```

- A faixa vertical de navegação global permanece à esquerda; a tela não abre uma janela isolada.
- A barra de topo da aplicação permanece visível e **não** é substituída pelo cabeçalho de Workflows.
- O painel de Workflows fica entre a barra de navegação global e o detalhe.
- A linha divisória entre a lista e o detalhe pode ser arrastada horizontalmente.
- Lista e detalhe têm áreas de rolagem próprias.
- O fundo pontilhado aparece **somente no bloco de desenho do Workflow**. Não se estende à barra lateral, ao cabeçalho de detalhe, às modais nem à timeline de Runs.

### 2.2 Dimensões macro do protótipo

| Elemento | Medida de referência | Observação |
|---|---:|---|
| Altura da barra superior | 39 px | Ocupa toda a largura útil acima do conteúdo |
| Largura do trilho global de ícones | 55 px | Em telas até 900 px: 50 px |
| Painel interno Workflows / Runs | 320 px | Redimensionável; mínimo visual recomendado de 280 px |
| Painel interno em 901–1100 px | 280 px | Valor inicial reduzido |
| Separador arrastável | 5 px de área interativa | Linha fina aparece ao passar o mouse |
| Área de detalhe | Toda a largura restante | Nunca deve causar corte horizontal dos controles essenciais |
| Altura da aplicação | 100% da altura visível | As regiões roláveis devem ficar dentro da tela |
| Base de tipografia | 12 px | Escala com tamanhos específicos abaixo |

A largura ajustada do painel deve continuar a mesma ao navegar entre as abas durante a sessão de uso. A retenção da preferência entre sessões pode seguir o comportamento já existente no app; esta spec não define como fazê-lo.

---

## 3. Paleta de cores e estilo global

### 3.1 Cores exatas de referência

| Uso visual | HEX / valor |
|---|---|
| Fundo geral claro | `#FBFBFB` |
| Superfície principal | `#FFFFFF` |
| Superfície de painéis e topo | `#F8F8F8` |
| Superfície do painel de lista | `#FAFAFA` |
| Texto principal | `#202124` |
| Texto secundário | `#808287` |
| Texto terciário | `#A0A2A7` |
| Divisória principal | `#E8E8E9` |
| Divisória muito sutil | `#EDEDED` |
| Hover neutro | `#F0F0F1` |
| Item selecionado | `#EAEAEC` |
| Acento neutro | `#53536D` |
| Azul contextual | `#4C77D6` |
| Azul claro | `#EDF3FF` |
| Verde contextual | `#279566` |
| Verde claro | `#EBF8F0` |
| Âmbar contextual | `#B98430` |
| Âmbar claro | `#FFF8E7` |
| Vermelho contextual | `#C65356` |
| Vermelho claro | `#FFF0F1` |
| Fundo do botão primário | `#28282D` |
| Texto do botão primário | `#FFFFFF` |
| Borda dos campos | `#E6E6E7` |
| Borda do foco em controles | `#7895C9` |
| Fundo escuro do bloco de JSON | `#24262D` |
| Cor dos pontos do canvas | `#292E32` |

### 3.2 Tipografia

- Família de referência: **Inter**, com aparência de fonte de sistema quando indisponível.
- Texto padrão: 12 px, peso normal.
- Título do painel: 14 px, peso aproximado 650, espaçamento entre letras −0,25 px.
- Título do detalhe: 23 px, peso aproximado 650, espaçamento entre letras −0,65 px.
- Nome de Workflow na lista: 12 px, peso aproximado 620.
- Nome de run na lista: 11,5 px, peso aproximado 635.
- Linhas de metadados: 9–10,5 px conforme o papel.
- Identificadores e versões: fonte **monoespaçada**.
- Não usar títulos extragrandes, cores saturadas fora dos estados ou sombras muito pesadas.

### 3.3 Bordas, raios e sombras

- Divisórias: geralmente 1 px, cinza muito claro.
- Itens de lista: cantos arredondados de aproximadamente 9 px.
- Campos de busca: raio de 10 px.
- Botões principais: raio de 9 px.
- Cards de etapas: raio de 12 px.
- Painéis de detalhe secundários: raio de 13 px.
- Diálogos: raio de 15 px.
- Cards neutros quase sem sombra. Sombras perceptíveis somente em popovers, modais e painéis flutuantes.
- Acentos de foco devem ser discerníveis sem depender da cor de fundo.

---

## 4. Barra global do MimirBot (contexto visual)

Esta seção descreve a moldura necessária para contextualizar a tela. **Não redesenhar o app inteiro** quando essa moldura já existir.

### 4.1 Barra superior

- Superfície cinza muito clara `#F8F8F8`, altura aproximada de 39 px.
- À esquerda, símbolo quadrado da aplicação: 25 × 25 px, cantos de 8 px, fundo escuro em degradê, ícone claro no centro.
- Área “This computer”: cerca de 214 px de largura em desktop; ícone circular azul, texto semibold e indicador de expansão.
- A seguir, pequenos controles de navegação: busca, adicionar, setas e botão adicional, em superfícies discretas.
- Ao centro visual, mascote cinza e texto **MimirBot** em semibold.
- À direita, identificação do modelo selecionado e controles de layout.
- Os botões do topo não devem competir com o conteúdo da tela Workflows.

### 4.2 Navegação global vertical

- Largura de 55 px; fundo `#F8F8F8`; borda direita de 1 px.
- Botões majoritariamente de 36 × 35 px; ícones de cerca de 19 px.
- Espaçamento vertical entre botões em torno de 8 px.
- Ícone ativo de Workflows exibido dentro de retângulo cinza claro de raio ~12 px.
- O item ativo possui um filete vertical de acento à esquerda: cerca de 3 × 15 px.
- Ícones sem seleção usam cinza neutro; hover mostra fundo cinza mais perceptível.
- Os atalhos inferiores (notificações, ajuda, configurações, avatar) permanecem no rodapé do trilho.

---

## 5. Painel esquerdo — estrutura fixa

### 5.1 Cabeçalho “Workflows”

- Faixa superior do painel com aproximadamente 20 px de respiro acima do conteúdo.
- Título **Workflows**, ícone pequeno de lista com etapas à esquerda.
- À direita, etiqueta **Ao vivo** quando a tela está recebendo atualizações: ponto verde de 5 px, fundo `#EAF5ED`, texto verde discreto.
- Botão de reticências, cerca de 25 × 25 px, junto à etiqueta.
- O menu das reticências inclui **Abrir console de teste** (não é uma aba nova).
- Não acrescentar botão **Criar Workflow**.

### 5.2 Abas

Duas abas alinhadas na mesma linha, com larguras iguais:

| Aba | Conteúdo | Estado inicial |
|---|---|---|
| **Workflows** | Lista de definições com versão atual | Selecionada ao abrir a tela |
| **Runs** | Histórico de execuções | Não selecionada |

- Altura visual das abas determinada por cerca de 12 px de padding superior e 13 px inferior.
- Fundo transparente, linha divisória de 1 px embaixo.
- Texto inativo cinza; texto ativo quase preto.
- Aba ativa possui uma barra horizontal inferior escura de 2 px, deixando uma margem lateral de aproximadamente 13 px em cada lado.
- A aba Runs mostra ícone de execução pequeno, com cerca de 12 px, e pode mostrar contador em etiqueta cinza.
- Trocar de aba muda busca, filtros, contagem e lista; mantém a moldura global.

### 5.3 Campo de busca

- Área própria com cerca de 15 px de padding horizontal.
- Campo branco de **36 px** de altura.
- Borda `#E6E6E7` de 1 px; raio **10 px**.
- Ícone de lupa à esquerda, separação horizontal de aproximadamente 9 px.
- Placeholder em cinza claro, tamanho de 11,5 px.
- Placeholder de Workflows: **Buscar por nome**.
- Placeholder de Runs: **Buscar por id da run**.
- Foco: borda azul-acinzentada e halo azul sutil; sem alterar a altura do campo.
- A busca deve atualizar a lista conforme a pessoa digita.

### 5.4 Linha de filtros e contador

- Abaixo da busca, respiro de cerca de 11 px.
- Botão **Filtros**: cerca de 30 px de altura, fundo branco, raio 8 px, ícone de filtro + texto.
- À direita, contador discreto: por exemplo, **12 Workflows** ou **8 runs**.
- Com filtros ativos, mostrar etiquetas removíveis sob a linha de controles.
- Cada etiqueta possui texto curto, borda cinza, fundo neutro e ícone de remoção **×**.
- Os elementos não devem aumentar a largura do painel ao apresentar filtros múltiplos; devem quebrar para a linha seguinte.

### 5.5 Região rolável

- A lista começa abaixo de uma divisória horizontal sutil.
- Scroll vertical independente do conteúdo de detalhe.
- Padding horizontal da lista: aproximadamente **8 px**.
- Padding superior na versão compacta: **6 px**.
- Scrollbar fina, de cor cinza suave, sem ocupar espaço excessivo.
- Em caso de nomes longos, aplicar uma linha com reticências, nunca overflow horizontal.

---

## 6. Aba Workflows — linhas compactas

### 6.1 Estrutura visual de um item

```text
┌─────────────────────────────────────────────┐
│ Contrato mensal                          v4 │
│ Financeiro · 4 etapas                       │
│ ● Aguardando aprovação · há 4 min           │
└─────────────────────────────────────────────┘
```

A apresentação segue **três linhas curtas**, sem avatar grande e sem cartão volumoso:

| Subparte | Estilo visual | Comportamento |
|---|---|---|
| Nome | 12 px, semibold, 1 linha | Truncar com reticências |
| Versão | 10 px, mono, borda fina | Posicionar à direita da primeira linha |
| Departamento e etapas | 10,5 px, cinza claro | Uma linha |
| Última execução | 10 px, cinza contextual | Uma linha com ponto colorido |
| Ações da linha | Botões pequenos | Aparecem em hover ou foco, sem aumentar altura |

### 6.2 Medidas compactas

- Padding do item: **7 px na vertical** e **12 px na horizontal**.
- Espaçamento entre itens: **2 px**.
- Espaço entre nome e sublinha: aproximadamente **3 px**.
- Espaço entre sublinha e última execução: aproximadamente **4 px**.
- Altura de referência de um item comum: **aproximadamente 63 px**; o conteúdo deve permanecer legível se a métrica real da fonte exigir pequena variação.
- Raio: aproximadamente **9 px**.
- Não retornar à altura antiga de ~77 px.
- A linha de ações pode surgir sobre o lado direito da faixa inferior; não deslocar as demais informações nem crescer o cartão.

### 6.3 Estados de item

- **Normal:** fundo transparente sobre `#FAFAFA`.
- **Hover:** fundo `#F1F1F2`.
- **Selecionado:** fundo `#EAEAEC`; filete vertical esquerdo cinza escuro de **3 px**, recuado cerca de 9 px do topo e da base.
- **Foco via teclado:** contorno visível; o item é ativável com Enter.
- **Ações de contexto:** visíveis no hover e no foco; ocultas normalmente.

### 6.4 Estado de execução na terceira linha

Na lista **Workflows**, manter texto de situação da última run junto ao ponto colorido; a remoção de rótulos aprovada é exclusiva da lista de **Runs**.

| Situação | Ponto | Texto exibido quando aplicável |
|---|---|---|
| Nunca executado | Cinza | `Nunca executado` |
| Na fila | Azul | `Na fila` |
| Em execução | Azul; pode pulsar | `Em execução · há 2 min` |
| Aguardando aprovação | Âmbar | `Aguardando aprovação · há 4 min` |
| Concluída | Verde | `Concluída · ontem` |
| Falhou | Vermelho | `Falhou · ontem` |
| Cancelada | Cinza | `Cancelada · há 3 dias` |

- Pontos têm aproximadamente **6 × 6 px**, sempre circulares.
- Se houver execução ativa, pode aparecer um anel pulsante discreto conforme a referência original.
- As duas ações rápidas são **Executar** e **Abrir**; executar abre diálogo, abrir seleciona o detalhe.

---

## 7. Aba Runs — linhas compactas com ícone de estado

Esta é a principal alteração de identidade visual aprovada na revisão final.

### 7.1 Conteúdo de uma run na lista

```text
┌──────────────────────────────────────────────────┐
│ ◉  Contrato mensal                            v4 │
│    20261106-184233-a1b2c3                       │
│    Financeiro · 4 min                  há 4 min   │
│    • Etapa 2 de 4 · Revisar                      │ ← apenas quando ativa
└──────────────────────────────────────────────────┘
```

O círculo à esquerda **não é um ponto simples**. É uma composição com anel colorido, ícone de workflow no centro e distintivo pequeno no canto inferior direito.

### 7.2 Medidas da run compacta

| Elemento | Tamanho / posição |
|---|---|
| Padding do item | 10 px vertical; 12 px horizontal |
| Distância entre itens | 2 px |
| Ícone circular total | **34 × 34 px** |
| Distância do ícone ao texto | **10 px** |
| Linha do nome | 11,5 px, peso ~635 |
| Versão `vN` | 9,5 px, mono, à direita |
| Identificador da run | 9 px, mono, cinza, abaixo do nome |
| Linha departamento/duração/tempo | 10 px, cinza |
| Linha etapa ativa | 9,5 px, abaixo dos metadados |
| Distância entre linhas de metadados | ~4–5 px |
| Altura típica de run encerrada | ~68 px |
| Altura típica de run ativa | ~85 px |

A altura é **orientativa**: deve se adaptar ao conteúdo real, mantendo o visual comprimido. Uma run ativa ocupa mais altura somente porque mostra a etapa atual. Não reservar uma linha vazia para runs finalizadas.

### 7.3 Composição do ícone circular

- Área externa circular de **34 px de diâmetro**.
- Fundo interno pastel, definido pelo estado.
- Anel de **2,5 px** ao redor da circunferência.
- Ícone principal central de aproximadamente **16 × 16 px**, com traço próximo de 2 px.
- Ícone central: um símbolo de **workflow / nós conectados**; não trocar por avatar de pessoa.
- Distintivo circular de cerca de **15 × 15 px** sobreposto no **canto inferior direito** do círculo.
- Distintivo preenchido com a cor forte do estado e ícone interno branco de aproximadamente 9 px.
- Borda externa branca ou com a mesma cor de fundo do item: aproximadamente 2 px, para separar o distintivo do anel.
- Em item selecionado, a borda do distintivo acompanha o cinza do fundo selecionado.
- O círculo nunca diminui ao comprimir a largura do texto.

### 7.4 Estados e cores exatas do ícone

| Situação | Cor forte do anel e distintivo | Fundo pastel do círculo | Símbolo no distintivo | Movimento |
|---|---|---|---|---|
| **Em execução** | `#397EE7` | `#EAF2FF` | execução / play | **Anel giratório** |
| **Na fila** | `#8795AC` | `#F0F3F8` | relógio / espera | Estático |
| **Concluída** | `#2EA574` | `#EAF8EF` | check | Estático |
| **Falhou** | `#D35E68` | `#FFF0F1` | X / erro | Estático |
| **Aguardando aprovação** | `#C5923A` | `#FFF7E5` | ampulheta | Estático |
| **Cancelada** | `#8E9199` | `#F2F3F5` | cancelamento | Estático |

**Não escrever o nome desses estados junto ao ícone na linha compacta de Runs.** Cor, símbolo e animação são o indicador principal. O estado deve existir no **nome acessível** e em **tooltip** no hover, para que a interface não dependa exclusivamente de cor.

### 7.5 Animação da run em execução

- Apenas a run em estado **Em execução** apresenta rotação.
- O centro do ícone e o distintivo permanecem **parados**.
- Somente o anel externo gira.
- A borda da run ativa utiliza azul muito claro `#BBD5FF`, com dois trechos de destaque `#397EE7`.
- Rotação contínua de **360° a cada 1 segundo**.
- Easing **linear**, sem aceleração, pausa ou mudança de escala.
- Ao terminar a execução, o anel **para imediatamente** e passa à cor/ícone do estado final.
- Em ambientes com preferência por movimento reduzido, não girar; usar anel azul estático.
- Não girar todos os ícones azuis: **Na fila** continua estático.
- Evitar brilho, pulso amplo ou animações adicionais não presentes no protótipo.

### 7.6 Conteúdo permitido e proibido na lista

**Mostrar:** nome do Workflow, versão, ID da run, departamento, duração, tempo relativo e (em estados ativos) etapa atual.

**Não mostrar como linha ou etiqueta de status na lista:** `Em execução`, `Falhou`, `Concluída`, `Aguardando aprovação` ou outras palavras repetindo o estado representado pelo ícone.

**Exceções de clareza:** um texto funcional pode existir na etapa ativa quando necessário, mas o padrão aprovado para a linha é `Etapa 2 de 4 · Revisar`, sem repetir “Em execução”.

### 7.7 Seleção e hover

- Seleção de run usa o mesmo fundo `#EAEAEC` e filete esquerdo da lista de Workflows.
- Hover usa `#F1F1F2` e não aumenta a altura do item.
- Ícone mantém cor no hover e na seleção.
- Todo item é clicável, não somente o nome.
- Tooltip de status surge sobre o ícone em hover ou foco; não altera o layout.
- A lista deve continuar permitindo leitura clara de várias runs simultaneamente.

---

## 8. Busca, filtros e ordenação

### 8.1 Workflows

Ao abrir **Filtros**, mostrar um popover ancorado ao botão com:

- **Departamento:** `Todos` e departamentos disponíveis.
- **Situação:** `Todas`, `Com run ativa`, `Sem run ativa`.
- **Ordenar por:** `Nome (A–Z)`, `Última atividade`.
- Seleções confirmadas atualizam a lista e o contador.
- Exibir chips removíveis para filtros ativos.
- A busca procura nomes; a ordenação selecionada não deve ser perdida ao refinar a busca.

### 8.2 Runs

Ao abrir **Filtros** na aba Runs, mostrar:

- **Workflow:** nomes disponíveis.
- **Situação:** opções de múltipla seleção: `Na fila`, `Em execução`, `Aguardando aprovação`, `Concluída`, `Falhou`, `Cancelada`.
- **Departamento**.
- **Período:** `Hoje`, `Últimos 7 dias`, `Últimos 30 dias`, `Tudo`.
- O resultado é ordenado da run mais recente para a mais antiga.
- O status filtrado é identificado internamente pelo estado exibido, mesmo quando o nome do estado não aparece na linha da lista.

### 8.3 Visual do popover

| Propriedade | Referência |
|---|---|
| Largura | **270 px** |
| Fundo | Branco |
| Borda | 1 px `#E4E4E6` |
| Raio | **12 px** |
| Padding | **16 px** |
| Sombra | Elevada, suave, concentrada abaixo |
| Título | 12 px semibold |
| Labels | ~10 px, cinza |
| Selects | Altura ~33 px, raio 7 px |
| Opções de múltipla escolha | Caixa + texto, separação ~6 px |
| Rodapé | Linha superior e botões alinhados à direita |

O popover deve fechar ao clicar fora ou pressionar Esc. Deve abrir sem deslocar ou comprimir a lista.

---

## 9. Workflows — cabeçalho do detalhe

### 9.1 Estrutura

```text
Contrato mensal                                  [Executar] [Apagar]
Financeiro · v4 de 4 · Guarda runs por 90 dias
Atualizado em 06/11/2026 às 18:42

Versão  [v4 (atual) — 06/11/2026 18:42  ▾]
```

### 9.2 Medidas e aparência

- Área com padding aproximado de **31 px no topo**, **46 px nas laterais** e **27 px na base**.
- Título de **23 px**, peso ~650, cor quase preta.
- Metadados de 11 px, cinza, separados por ponto médio `·`.
- Data da última atualização em linha própria, cinza ainda mais claro.
- Alinhar as ações principais à direita e à altura do título.
- Botões com **34 px de altura**, raio ~9 px, fonte 11,5 px.
- **Executar:** preenchimento escuro `#28282D`, texto branco, ícone play.
- **Apagar:** visual de perigo discreto, cor vermelha, normalmente secundário.
- Se houver run ativa, **Apagar desabilitado**, com tooltip explicativo.
- O cabeçalho termina com divisória fina, não com card com sombra.

### 9.3 Seletor de versões

- Aparece abaixo dos metadados, com cerca de 15 px de distância do bloco anterior.
- Label “Versão” à esquerda; select branco à direita, **29 px de altura**, raio 7 px.
- A lista de opções mostra versões da mais recente para a mais antiga.
- Versão ativa: `v4 (atual)`; versões antigas incluem número e data.
- Escolher versão antiga troca o desenho de etapas **somente para visualização**.
- Mostrar faixa amarelo-clara: `Você está vendo a versão 3. A atual é a 4.` e ação **Voltar para a atual**.
- O botão de execução passa a indicar a versão escolhida, por exemplo **Executar v3**.
- Escolher uma versão não altera a definição existente.

---

## 10. Área de desenho do Workflow — fundo pontilhado

### 10.1 Tratamento do fundo

- Aplicar o padrão **apenas** ao espaço que contém o desenho vertical das etapas.
- Fundo branco puro: `#FFFFFF`.
- Ponto escuro: `#292E32`.
- Raio visual do ponto: cerca de **0,85 px**, borda suavizada até aproximadamente 1,05 px.
- Distância entre centros: **24 px na horizontal e 24 px na vertical**.
- Deslocamento do padrão: aproximadamente **12 px** de cada borda.
- Os pontos devem se repetir continuamente em toda a superfície disponível; não desenhar linhas de grade.
- Não utilizar contraste muito forte, textura colorida ou painéis sólidos que cubram a grade.

### 10.2 Tamanho da área

- Largura: acompanha o painel direito.
- Altura mínima de referência: **560 px** no desktop.
- Padding interno aproximado: **22 px superior, 28 px laterais e 66 px inferior**.
- Arredondamento de bordas: **12 px**.
- O bloco do desenho pode crescer verticalmente conforme o número de etapas.
- Até 620 px de largura de viewport, usar altura mínima de **470 px** e padding aproximado de **20 px em cima, 14 px nas laterais e 48 px embaixo**.
- A faixa de título/metadados do Workflow permanece em **fundo branco liso**.

### 10.3 Orientação do fluxo

- O desenho é **vertical e centralizado**.
- Etapas aparecem em ordem de execução, de cima para baixo.
- Entre etapas, uma linha de conexão fina termina em uma pequena seta apontando para baixo.
- Ao lado das conexões de arquivo, mostrar o nome do arquivo em texto discreto com ícone de arquivo.
- Não permitir que a pessoa arraste, reordene, conecte ou edite as etapas nesta tela.
- Se houver muitas etapas, a região principal deve rolar verticalmente sem quebrar a ordem.

### 10.4 Cards de etapas

| Propriedade | Valor de referência |
|---|---|
| Largura máxima do card | **375 px** |
| Altura mínima | **76 px** |
| Fundo | Branco `#FFFFFF` |
| Borda | 1 px `#E5E5E8` |
| Raio | **12 px** |
| Padding interno | ~14 px vertical; ~17 px horizontal |
| Sombra | Quase imperceptível |
| Espaço entre grupos internos | ~13 px |
| Número à esquerda | 31 × 31 px, fundo cinza-claro, raio 9 px |
| Nome da etapa | 12 px, semibold |
| Descrição bot/saídas | 10,5 px, cinza |
| Indicador à direita | Seta fina cinza |

**Composição:** número, nome, avatar/indicador do bot, texto `Bot: Ana · 1 saída` e seta discreta à direita.

### 10.5 Conexões

- Distância vertical reservada entre cards: aproximadamente **51 px**.
- Linha central vertical: aproximadamente **36 px**, espessura 1–1,5 px, cor `#C7C7CC`.
- Ponta da seta fina de cerca de 7 px.
- Labels de arquivos em fonte pequena cinza, centralizados ou levemente deslocados da linha para não encobrir o conector.
- Se houver vínculo de arquivo lateral, desenhar a ligação adicional e identificar o arquivo de origem e destino sem modificar o card principal.

### 10.6 Estados do card

- **Normal:** borda cinza fina.
- **Hover:** borda `#BFBFC6` e sombra um pouco maior.
- **Selecionado:** borda `#888C9E` e halo discreto.
- **Etapa em execução:** borda azul `#77A3E7`, fundo `#FBFDFF`, halo azul-claro.
- A etapa selecionada pode abrir o painel de detalhe, mas não entrar em modo de edição.
- Se o card estiver no contexto de uma run, o estado atual deve ficar visualmente destacado.

### 10.7 O que não deve aparecer nesta visualização

- Barra inferior de criação do Workflow Studio.
- Menus “Agente”, “Script”, “IF / Else”, “Notas”, “Containers”.
- Handles para arrastar nós.
- Conectores editáveis ou criação de linhas com mouse.
- Botões de salvar/editar o fluxo.

---

## 11. Painel de detalhe da etapa (somente leitura)

- Abre ao clicar em um card.
- No desktop, painel à direita do desenho, largura de **360 px**.
- Borda `#EBEBED` de 1 px, raio **13 px**, fundo branco e sombra discreta.
- Cabeçalho com número/ID da etapa, nome e botão **×**.
- Padding do topo: aproximadamente 17–18 px.
- Conteúdo interno com scroll próprio se superar cerca de **620 px** de altura.
- Fechar ao clicar em **×**, ao pressionar Esc ou ao selecionar outro item, conforme contexto.

### 11.1 Seções do painel

1. **Bot:** avatar e nome do agente.
2. **Instruções:** até quatro linhas por padrão; botão **Mostrar mais** / **Mostrar menos**.
3. **Entradas:** tabela de arquivo recebido, etapa de origem e arquivo de origem.
4. **Saídas:** tabela de arquivos esperados e indicador de obrigatoriedade.
5. **Resultado:** arquivo ou estrutura declarada como resultado.
6. **Condições:** pares campo/valor exigido.
7. **Skills:** grupos bot, bundled e imported com os nomes escolhidos, ou **Nenhuma skill** quando a etapa não declara nenhuma.

### 11.2 Padrões de conteúdo

- Títulos de seção em caixa alta pequena e cor cinza.
- Tabelas com cabeçalho sutil, bordas finas e linhas alternadas suavemente.
- Se uma seção não possuir dados, mostrar **Nenhuma** em cinza.
- Campos textuais longos podem quebrar linha dentro do painel.
- Não mostrar inputs editáveis, botões de salvar nem controles de drag-and-drop.

---

## 12. Aba Runs — detalhe da execução

O detalhe de Runs usa **fundo branco liso**, sem o padrão pontilhado de Workflows.

### 12.1 Cabeçalho

```text
[● Aguardando aprovação] Contrato mensal v4     [Cancelar] [Apagar] [Rodar de novo]
20261106-184233-a1b2c3  [Copiar]
Pedido por Bruno · 06/11/2026 18:42 → Em andamento · 4 min
```

- Status em etiqueta com ícone, cor pastel e **texto**: aqui não se aplica a remoção de texto da lista.
- Nome do Workflow e versão em título.
- ID da run em fonte monoespaçada com ícone para copiar.
- Clique em **Copiar** mostra confirmação com check durante aproximadamente **1,5 s**.
- Mostrar solicitante (nome do bot com acesso à conversa ou **Você**), início, fim/duração ou tempo decorrido.
- Para run ativa: **Cancelar** disponível; **Apagar** indisponível.
- Para run encerrada: **Apagar** disponível; **Cancelar** indisponível.
- **Rodar de novo** sempre abre o diálogo de execução com a versão da run selecionada.
- Botões indisponíveis devem explicar o motivo por tooltip.

### 12.2 Área principal

- Largura máxima de leitura aproximada de **930 px**, centralizada.
- Padding aproximado de **35 px em cima**, **48 px nas laterais** e **90 px embaixo**.
- Se houver aguardando aprovação, apresentar primeiro um bloco de aprovação.
- Se houver falha, mostrar faixa de erro antes da timeline.
- A timeline de etapas vem em seguida.
- Blocos **Resultado** e **Arquivos** aparecem abaixo, conforme a disponibilidade.

---

## 13. Timeline das etapas de uma Run

### 13.1 Layout

- Lista vertical em ordem da definição.
- Cada etapa utiliza um círculo de status à esquerda e conteúdo à direita.
- Círculo de aproximadamente **25 × 25 px**, alinhado em uma coluna de 32 px.
- Espaço entre ícone e conteúdo: cerca de 12 px.
- Linha vertical fina e cinza conecta os marcadores.
- Nome da etapa: 12 px, semibold.
- Tentativa/duração/situação em fonte de 10 px, alinhada à direita quando houver espaço.
- Segunda linha opcional para arquivos, erro ou ação **Abrir conversa**.

### 13.2 Estados das etapas

| Etapa | Tratamento visual |
|---|---|
| Concluída | Círculo verde-claro e check verde |
| Em execução | Círculo azul-claro e indicador animado discreto |
| Aguardando aprovação | Círculo amarelo-claro e ampulheta |
| Falhou | Círculo vermelho-claro e símbolo de erro |
| Pendente | Círculo neutro e ícone vazado |
| Pulada | Cinza reduzido; texto da etapa pode aparecer riscado |

### 13.3 Conteúdo complementar

- Tentativas e duração ao lado do nome ou à direita da linha.
- Arquivos verificados em pequenas etiquetas com ícone de arquivo, fundo cinza muito claro e borda fina.
- Mensagem de falha em vermelho sob o nome.
- **Abrir conversa** em azul quando houver conversa vinculada à etapa.
- A timeline é informativa; não é um editor de workflow nem um painel para aprovar/reprovar.

---

## 14. Aviso de aprovação pendente

Mostrar somente quando uma run está em estado de espera por aprovação e existe uma solicitação de aprovação associada.

### 14.1 Card

- Fundo amarelo muito claro `#FFFAF0`.
- Borda fina amarelada `#F2E4C6`.
- Raio aproximado de **11 px**.
- Padding aproximado de **17 px vertical e 18 px horizontal**.
- Distância para o conteúdo seguinte: cerca de **30 px**.

### 14.2 Conteúdo

```text
⌛ Aguardando aprovação
Etapa 2 · Revisar

“Posso enviar o relatório para o cliente?”

Pergunta feita há 4 min · 1 cartão aberto     [Abrir conversa →]
```

- Ícone de ampulheta e título em âmbar.
- Etapa e nome em texto auxiliar.
- Pergunta com maior destaque, em uma ou mais linhas.
- Informação temporal abaixo.
- Botão **Abrir conversa** à direita no desktop, abaixo em telas estreitas.
- **Não** adicionar botões Aprovar/Rejeitar diretamente nesta tela. A decisão ocorre na conversa indicada.

---

## 15. Erros, resultado e arquivos

### 15.1 Faixa de erro

- Exibir quando existir erro da run.
- Fundo `#FFF5F5`, borda `#F4D7D8`, texto vermelho escuro.
- Título identifica etapa com falha.
- Linha seguinte apresenta a mensagem detalhada, sem paráfrase artificial.
- A faixa não deve esconder a timeline.

### 15.2 Resultado

- Se existir resultado, apresentar bloco recolhível **Resultado**.
- Cabeçalho com nome do arquivo declarado e botão **Copiar**.
- Corpo com JSON formatado e fonte monoespaçada.
- Fundo do código `#24262D`; texto `#E6E7E9`.
- Raio ~8 px; padding ~15 px; rolagem própria para conteúdo grande.
- Se exceder 12 linhas, iniciar recolhido.
- O botão de expandir/recolher não interfere com outros blocos.

### 15.3 Arquivos

- Bloco recolhível **Arquivos**, abaixo da timeline/resultado.
- Agrupar arquivos por etapa.
- Cada nome de arquivo aparece em etiqueta neutra com ícone de documento.
- A etiqueta é **informativa**, sem função de abrir ou baixar nesta fase.

### 15.4 Definição indisponível

Se a definição de um Workflow não puder ser recuperada, a timeline pode mostrar IDs das etapas com o texto:

> A definição original deste Workflow não está mais disponível. Os nomes das etapas não podem ser mostrados.

---

## 16. Diálogos e confirmações

### 16.1 Padrão visual de diálogo

| Propriedade | Valor de referência |
|---|---|
| Fundo de bloqueio | Escurecimento suave `#1D20273D` |
| Largura máxima | **450 px** |
| Fundo do diálogo | Branco |
| Raio | **15 px** |
| Padding | ~22–24 px |
| Título | **17 px**, peso ~650 |
| Corpo | 11,5 px, cinza |
| Campo de texto | 37 px de altura, raio 9 px |
| Ações | Alinhadas à direita, separação ~9 px |
| Ação primária | Botão preenchido escuro |
| Ação destrutiva | Tratamento de perigo vermelho |

- Todos os diálogos possuem **Cancelar** ou **Voltar**, e uma ação principal de confirmação.
- Fechar com tecla Esc e retorno de foco ao controle de origem.
- Manter foco de teclado dentro do diálogo enquanto aberto.
- Enquanto a ação está sendo processada, desabilitar a confirmação e mostrar o texto de progresso.

### 16.2 Executar Workflow

- Título: `Executar Contrato mensal`.
- Seletor **Versão**, com a versão atual pré-selecionada.
- Texto auxiliar: `A run usa esta versão até o fim, mesmo que o Workflow mude depois.`
- Botões: **Cancelar** e **Executar**.
- Durante processamento: **Iniciando…**.
- No sucesso: fechar e abrir o detalhe da nova run; mostrar aviso **Run iniciada**.

### 16.3 Cancelar run

- Título: `Cancelar esta run?`.
- Campo opcional **Motivo**.
- Informação sobre a interrupção da etapa atual e preservação dos arquivos já gravados.
- Botões: **Voltar** e **Cancelar run** (perigo).
- Durante processamento: **Cancelando…**.

### 16.4 Apagar Workflow

- Título: `Apagar "Contrato mensal"?`.
- Texto: todas as versões serão apagadas; runs já realizadas permanecem no histórico.
- Botões: **Voltar** e **Apagar**.
- Se houver run ativa e a operação for impedida, mostrar motivo e link para a run ativa.

### 16.5 Apagar run

- Título: `Apagar esta run?`.
- Texto informa que o registro e arquivos serão excluídos e não há reversão.
- Botões: **Voltar** e **Apagar**.
- A ação de apagar não fica disponível para runs ativas.

---

## 17. Menus contextuais e tooltips

### 17.1 Menu de reticências da tela

- Pequeno popover branco ancorado ao botão de três pontos.
- Largura aproximada de **185 px**; padding cerca de 6 px.
- Cada ação é uma linha clicável com ícone e texto, sem borda grossa.
- Item **Abrir console de teste** deve ficar disponível quando previsto.
- O menu fecha em clique externo ou Esc.

### 17.2 Tooltips essenciais

- Ícone de run: nome completo da situação, por exemplo **Aguardando aprovação**.
- Botão Apagar desabilitado em Workflow: `Este Workflow tem runs ativas. Cancele antes de apagar.`
- Apagar em run ativa: `Esta run ainda está ativa. Cancele antes de apagar.`
- Cancelar em run encerrada: `Esta run já terminou.`
- Botões representados apenas por ícones: explicar a ação (copiar ID, fechar, abrir opções).

Os tooltips nunca substituem o conteúdo principal nem geram mudança de altura nas linhas compactas.

---

## 18. Estados de carregamento, vazio, falha e permissão

| Contexto | Tratamento esperado |
|---|---|
| Lista carregando | Seis linhas esqueleto cinzas, aproximadamente da mesma altura dos itens reais |
| Detalhe carregando | Blocos esqueleto no lugar de título, desenho ou timeline |
| Workflows vazio | **Nenhum Workflow ainda.** / `Quando um Workflow for criado, ele aparece aqui.` |
| Runs vazio | **Nenhuma run ainda.** / `Execute um Workflow para ver o histórico aqui.` |
| Nenhuma seleção | Ícone neutro + **Escolha um Workflow ou uma run** + linha curta de ajuda |
| Erro de lista/detalhe | Faixa vermelha com mensagem e botão **Tentar de novo** |
| Item removido | **Este item não existe mais.** + **Voltar para a lista** |
| Sem permissão | **Você não tem acesso aos Workflows.** |
| Conflito com run ativa | Motivo visível e acesso à run que impede a operação |

- Não mostrar botões de criação em estados vazios.
- Skeleton usa gradiente neutro com animação horizontal suave.
- A mensagem de erro deve preservar o conteúdo devolvido ao usuário, quando houver.
- Atualizações de conteúdo não fecham popovers, diálogos ou tiram foco do elemento que a pessoa está utilizando.

---

## 19. Atualizações visíveis e feedback

- Quando uma run mudar de estado, o ícone na lista deve mudar de cor, símbolo e animação conforme o estado novo.
- O indicador **Ao vivo** mostra quando o acompanhamento está ativo.
- O detalhe aberto deve refletir alterações observáveis de etapa/status, sem obrigar a pessoa a voltar à lista.
- Enquanto uma run está em andamento, atualizar a indicação de tempo relativo/duração conforme necessário.
- Não interromper digitação em busca, filtro ou diálogo durante uma atualização.
- A run que estava selecionada deve permanecer selecionada quando seus dados mudarem.
- Mostrar confirmações curtas no canto inferior direito, como **Run iniciada**, sem bloquear a interface.
- Toast de referência: fundo `#26272C`, texto branco, bordas de 10 px, distância de ~26 px da borda direita e ~24 px da inferior.

Esta seção define **comportamento visível** e não o mecanismo técnico utilizado para obter as atualizações.

---

## 20. Responsividade

### 20.1 Acima de 1100 px

- Barra global vertical + lista lateral + detalhe lado a lado.
- Lista com largura inicial de 320 px.
- Painel de etapa à direita do desenho, quando aberto, com aproximadamente 360 px.
- Ações do cabeçalho alinhadas à direita.

### 20.2 Entre 901 e 1100 px

- Lista começa com cerca de 280 px.
- Reduzir padding lateral do cabeçalho de detalhe para ~28 px.
- Conteúdo interno usa aproximadamente 22–26 px de padding lateral.
- Painel de etapa passa a aproximadamente 300 px para preservar a leitura.
- Evitar encurtar o nome a ponto de eliminar informações essenciais.

### 20.3 Até 900 px

- Navegação global estreita para cerca de 50 px.
- Mostrar **uma coluna funcional por vez**: lista ou detalhe.
- Ao selecionar Workflow/run, detalhe ocupa a área restante com controle **← Voltar**.
- O controle Voltar retorna para a lista preservando aba, busca, filtros e seleção quando possível.
- Não tentar manter lista e detalhe lado a lado apertados.
- Remover a divisória de redimensionamento nesse modo.

### 20.4 Até 620 px

- Reduzir espaço ocupado pelos controles superiores não essenciais.
- O título central superior do app pode ficar oculto se faltar espaço.
- Ações do cabeçalho podem quebrar para uma linha própria.
- O painel de etapa vira uma superfície inferior sobreposta, com cantos arredondados superiores e altura máxima próxima de **70% da tela**.
- Diagramas devem continuar ordenados verticalmente, evitando cortes horizontais.
- O bloco pontilhado do Workflow conserva o padrão de 24 px e adapta padding.
- Avisos de aprovação empilham texto e ação quando necessário.
- A timeline mantém a ordem e pode mover duração/estado para uma linha secundária.

---

## 21. Acessibilidade e interação por teclado

- Todos os botões, abas, itens de lista, selects e menus devem poder receber foco pelo teclado.
- Itens da lista: setas para cima/baixo mudam a seleção; Enter abre detalhe.
- Foco visível equivalente a contorno azul de cerca de 2 px, com pequeno deslocamento externo.
- Todo ícone que comunica estado precisa de **nome acessível textual**, independentemente da presença de rótulo na linha.
- Não depender apenas da diferença entre verde e vermelho: diferenciar por **símbolo** (check/X/ampulheta/play/relógio).
- Ícones puramente decorativos não devem ser anunciados por leitores de tela.
- Diálogos controlam o foco e o devolvem ao botão original quando fechados.
- O diagrama visual deve possuir alternativa de navegação sequencial para leitores de tela.
- Respeitar preferência de **movimento reduzido**; desativar a rotação do anel da run ativa nesse caso.
- Contraste mínimo: 4,5:1 para texto comum e 3:1 para indicadores/componentes essenciais quando aplicável. Se a cor pastel do protótipo não atingir o contraste em um uso crítico, reforçar o contraste sem mudar a identidade geral.

---

## 22. Regras de conteúdo e textos visíveis

| Contexto | Texto de interface |
|---|---|
| Título da tela | `Workflows` |
| Aba 1 | `Workflows` |
| Aba 2 | `Runs` |
| Status de conexão | `Ao vivo` |
| Busca de definição | `Buscar por nome` |
| Busca de run | `Buscar por id da run` |
| Filtro | `Filtros` |
| Ações | `Executar`, `Abrir`, `Apagar`, `Cancelar`, `Cancelar run`, `Rodar de novo` |
| Navegação | `Abrir conversa`, `Voltar para a lista`, `Abrir console de teste` |
| Recuperação | `Tentar de novo`, `Carregar mais` |
| Estados completos | `Na fila`, `Em execução`, `Aguardando aprovação`, `Concluída`, `Falhou`, `Cancelada` |
| Estados das etapas | `Pendente`, `Em execução`, `Concluída`, `Falhou`, `Pulada` |
| Sem run | `Nunca executado` |
| Diálogo carregando | `Iniciando…`, `Cancelando…`, `Apagando…` |

**Regra de localização:** os textos são conteúdo de interface, não exemplos de nomenclatura técnica. Evitar introduzir traduções aleatórias ou alternar “Run” com “Execução” dentro do mesmo agrupamento visual.

---

## 23. Interações detalhadas: roteiro verificável

### 23.1 Selecionar Workflow

1. Abrir a tela Workflows.
2. Aba **Workflows** aparece selecionada.
3. Clicar em um item da lista.
4. Item recebe fundo de seleção e filete esquerdo.
5. À direita, título, metadados, ações, versão e desenho vertical atualizam.
6. Desenho mostra os pontos escuros sobre branco.
7. Clicar em uma etapa abre detalhe somente leitura.
8. Clicar em **×** fecha detalhe sem modificar o Workflow.

### 23.2 Selecionar Runs

1. Clicar na aba **Runs**.
2. Campo de busca muda para `Buscar por id da run`.
3. A lista mostra ícones circulares de estado à esquerda de cada run.
4. A descrição de estado **não** aparece como texto redundante na linha da lista.
5. Passar o mouse sobre o ícone mostra o estado completo em tooltip.
6. Clicar em uma run destaca a linha e abre detalhe.
7. O cabeçalho do detalhe **pode** exibir texto completo de estado.

### 23.3 Testar animação

1. Localizar uma run em execução.
2. Verificar anel azul externo girando continuamente; centro e distintivo parados.
3. Localizar run na fila: anel cinza-azulado estático.
4. Localizar run concluída: anel verde estático e check.
5. Localizar run falha: anel vermelho estático e X.
6. Localizar run aguardando aprovação: anel âmbar estático e ampulheta.
7. Simular preferência por movimento reduzido: anel azul estático.

### 23.4 Verificar compactação

1. Abrir Workflows e visualizar vários itens ao mesmo tempo.
2. Conferir padding vertical baixo e distância de aproximadamente 2 px entre linhas.
3. Passar mouse sobre item: as ações aparecem **sem aumentar o item**.
4. Abrir Runs: ícone de 34 px, linhas curtas e etapa atual somente em runs ativas.
5. Conferir que uma run finalizada não mantém uma linha vazia de “etapa atual”.

### 23.5 Filtrar e buscar

1. Digitar parte de um nome na aba Workflows e verificar a lista filtrada.
2. Abrir popover Filtros, mudar departamento ou situação e confirmar.
3. Verificar chip removível e contador atualizado.
4. Mudar para Runs e repetir com ID, período e situação.
5. A seleção de filtros na lista não deve editar dados de Workflows ou Runs.

### 23.6 Ações e confirmações

1. Clicar em **Executar** e confirmar que existe seletor de versão.
2. Cancelar diálogo; nenhum estado é alterado.
3. Confirmar execução; abrir run nova e mostrar notificação.
4. Verificar **Cancelar** disponível somente em run ativa.
5. Verificar **Apagar** indisponível durante run ativa e tooltip correspondente.
6. Verificar **Rodar de novo** trazendo a versão correta para o diálogo.
7. Verificar cópia de ID com feedback transitório.

### 23.7 Responsividade

1. Desktop amplo: lista e detalhe simultâneos.
2. 1000 px: lista menor e conteúdo sem corte.
3. 800 px: lista e detalhe aparecem em telas alternadas.
4. 600 px: painel de etapa abre como sobreposição inferior.
5. Em todos os tamanhos, os ícones das runs permanecem circulares e legíveis.

---

## 24. Critérios de aceitação

Os itens abaixo servem como checklist de comparação com o protótipo de referência.

### Identidade visual

- [ ] O shell existente do MimirBot continua visível e coerente.
- [ ] A tela aparece como destino da navegação lateral.
- [ ] Fundo principal da aplicação e do detalhe preserva tons claros.
- [ ] Tipografia, bordas e sombras reproduzem a densidade minimalista.
- [ ] Não surgiram títulos, avisos ou controles extras não solicitados.

### Painel esquerdo

- [ ] Largura inicial 320 px em desktop amplo e 280 px em desktop menor.
- [ ] Divisor permite redimensionar o painel.
- [ ] Workflows e Runs têm abas e busca distintas.
- [ ] Filtros mostram opções, seleção e chips removíveis.
- [ ] Contadores correspondem ao conjunto listado.
- [ ] Listas rolam independentemente do detalhe.

### Workflows compactos

- [ ] Itens usam três linhas compactas.
- [ ] Padding aproximado de 7 × 12 px.
- [ ] Distância entre itens próxima de 2 px.
- [ ] Versões aparecem alinhadas à direita.
- [ ] Status da última run permanece visível nesta lista.
- [ ] Hover e seleção não alteram a altura.
- [ ] Ações rápidas aparecem em hover/foco sem deslocar texto.

### Runs compactas

- [ ] Cada run tem ícone circular de 34 px.
- [ ] O centro representa workflow/nós conectados.
- [ ] Distintivo inferior direito representa o estado.
- [ ] Vermelho/falha, verde/conclusão, âmbar/aprovação, azul/execução corretos.
- [ ] Run na fila e cancelada usam cinzas distintos.
- [ ] Apenas run em execução possui anel giratório.
- [ ] Anel gira em 1 s, linear, sem girar o centro.
- [ ] Preferência por movimento reduzido desativa rotação.
- [ ] **Não aparecem nomes redundantes dos estados na linha da lista**.
- [ ] Tooltip/nome acessível apresenta o estado completo.
- [ ] ID usa fonte monoespaçada.
- [ ] Tempo e duração ocupam uma linha compacta.
- [ ] Etapa atual aparece somente quando aplicável.
- [ ] Itens não mantêm altura artificial de 91–102 px da versão anterior.

### Detalhe de Workflow

- [ ] Cabeçalho mostra título, departamento, versão, retenção e data.
- [ ] Executar e Apagar têm os estados esperados.
- [ ] Escolher versão antiga mostra aviso e muda o desenho.
- [ ] Desenho de etapas é vertical e centralizado.
- [ ] **Fundo pontilhado possui passo de 24 × 24 px, pontos escuros e branco.**
- [ ] Fundo pontilhado não invade cabeçalho nem lista.
- [ ] Cards exibem número, nome, bot e saídas.
- [ ] Conexões com seta e arquivos são legíveis.
- [ ] Cards são somente leitura e não têm handles editáveis.
- [ ] Clicar na etapa abre painel de 360 px no desktop.
- [ ] Painel apresenta instruções, entradas, saídas, resultado, condições e skills.

### Detalhe de Run

- [ ] Status textual permanece no cabeçalho e na timeline.
- [ ] Cancelar/Apagar respeitam estado da run.
- [ ] Rodar de novo abre versão correta.
- [ ] Copiar ID confirma a ação.
- [ ] Aprovação pendente mostra pergunta e botão Abrir conversa.
- [ ] Não existem botões de aprovação direta nesta tela.
- [ ] Timeline respeita ordem e estados das etapas.
- [ ] Resultado e Arquivos seguem os estados recolhíveis.
- [ ] Não aparece fundo pontilhado na timeline de Runs.

### Robustez de interface

- [ ] Modais fecham com Esc e preservam o foco.
- [ ] Erros e estados vazios têm mensagens úteis.
- [ ] Loading usa skeleton discreto.
- [ ] Acessibilidade não depende somente de cor.
- [ ] Desktop, tablet e telas pequenas preservam uso correto.
- [ ] Nenhuma ação permite criar/editar a definição do Workflow aqui.

---

## 25. Fora de escopo explícito

A tela **não** deve:

- Criar Workflow, adicionar etapa ou abrir a barra de elementos do editor.
- Editar nome, instruções, bot, inputs, outputs, resultado ou condições.
- Arrastar, conectar, reordenar ou remover etapas do desenho.
- Aprovar ou recusar pedidos diretamente pela tela de Runs.
- Abrir ou baixar arquivos verificados nas runs, nesta fase.
- Exibir logs detalhados de agente, custo, tokens ou modelo utilizado na etapa.
- Apagar versões antigas isoladamente.
- Importar ou exportar definições de Workflow.
- Prescrever arquitetura de implementação ou estratégia de integração.

---

## 26. Guia de comparação visual com as referências

| Arquivo do pacote | O que conferir |
|---|---|
| `MimirBot_Workflows_F2_Compacto.html` | Interações, hover, foco, filtros, estado do fluxo e animação |
| `MimirBot_Workflows_F2_Compacto_workflows.png` | Painel de Workflows compacto, cabeçalho, pontos no fundo do fluxo, cards verticais |
| `MimirBot_Workflows_F2_Compacto_runs.png` | Lista de Runs com ícones e ausência de rótulos redundantes; timeline e aprovação |
| `MimirBot_Workflows_F2_Compacto_mobile.png` | Empilhamento e tratamento da visualização estreita |

**Precedência:** se uma descrição abstrata desta spec não for suficiente para reproduzir um detalhe de aparência, usar o **protótipo HTML compacto** como referência visual e interativa. Não importar alterações não aprovadas de versões anteriores.

---

## 27. Entrega esperada da implementação

Uma tela Workflows com a mesma identidade visual do MimirBot, lista compacta, estados de run identificáveis por ícone animado/estático, detalhe de Workflow com fundo pontilhado e ações administrativas visíveis conforme o estado. A implementação pode se adaptar ao código real da aplicação, mas a **aparência e as interações definidas neste documento não devem ser redesenhadas sem solicitação**.

**Fim da especificação de UI/UX — versão compacta, documento independente.**
