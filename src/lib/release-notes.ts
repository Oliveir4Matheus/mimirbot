export interface ReleaseNotes {
  features: string[];
  fixes: string[];
}

export type LocalizedReleaseNotes = { en: ReleaseNotes } & Partial<Record<string, ReleaseNotes>>;

/** Shown once after an update, so they ship inside the app and work offline. Add the entry for a version when you raise it: `en` is required, other locales (keyed like src/locales) are optional and fall back to `en`. */
export const RELEASE_NOTES: Record<string, LocalizedReleaseNotes> = {
  "0.1.139": {
    en: {
      features: [
        "Stop now really stops: the app confirms that the agent and, on Linux, its sandbox jobs have ended before saying the turn stopped, and tells you when a process could not be ended.",
        "When an ACP agent refuses or stops a turn, the message says why in plain words, with advice for that reason, instead of \"Model turn failed: refusal\".",
        "On OpenCode 2, including GitHub Copilot models, the Reasoning control shows each model's effort levels again.",
        "An automation that failed and then ran fine again posts a \"Recovered\" line in its chat.",
        "The app keeps checking for updates while one is waiting to install and swaps it for a newer release. After three failed checks in a row it says it couldn't check, with a button to try again.",
        "The sidebar shows the email of the signed-in account, and profiles without an email stay neutral.",
        "When Codex refuses a tool call as unsupported, the app now says so.",
        "The cloud browser explains once why Instagram, YouTube and Google sign-in may refuse when no computer shares its internet connection.",
      ],
      fixes: [
        "A webhook's secret and a Local VM's viewer password are no longer handed to anonymous requests on this computer, and the desktop owner header only counts on the app window's own requests.",
        "New bots follow the same settings limits as edits, changing a bot's default model needs an owner or admin, and Mark all read only clears your own notifications.",
        "Chart expressions are interpreted instead of compiled into code, protected message images are no longer cached, and the Data SQL filter reads statements the way DuckDB does.",
        "A boxed bot can no longer reach internal routes with an encoded path, the ElevenLabs key no longer follows a redirect, and Files no longer downloads .git or other version-control folders from My Cloud.",
        "The server, the companion and the desktop app no longer stop on a malformed request or a reset viewer socket.",
        "Stopping a turn now also stops page publishing and a Chrome that was still starting, and deleted or paused routines no longer start a run.",
        "Memory no longer overwrites a file it cannot read, the team's sign-in file stays valid JSON, and exported bots each get their own skill folder.",
        "Mac voice reads text that starts with a dash instead of treating it as options, and the modal keeps Tab inside it, links included.",
      ],
    },
    "pt-br": {
      features: [
        "O Parar agora para de verdade: o app confirma que o agente e, no Linux, os jobs do sandbox terminaram antes de dizer que o turno parou, e avisa quando um processo não pôde ser encerrado.",
        "Quando um agente ACP recusa ou interrompe um turno, a mensagem diz o motivo em palavras claras, com um conselho para aquele caso, em vez de \"Model turn failed: refusal\".",
        "No OpenCode 2, incluindo os modelos do GitHub Copilot, o controle de Raciocínio volta a mostrar os níveis de esforço de cada modelo.",
        "Uma automação que falhou e depois voltou a funcionar posta uma linha \"Recovered\" no chat dela.",
        "O app continua checando atualizações enquanto uma espera para ser instalada e a troca por uma versão mais nova. Depois de três checagens seguidas com falha, avisa que não conseguiu checar, com um botão para tentar de novo.",
        "A barra lateral mostra o e-mail da conta logada, e perfis sem e-mail ficam neutros.",
        "Quando o Codex recusa uma chamada de ferramenta como não suportada, o app agora avisa.",
        "O navegador da nuvem explica uma vez por que Instagram, YouTube e o login do Google podem recusar quando nenhum computador compartilha a internet.",
      ],
      fixes: [
        "O segredo de um webhook e a senha do visualizador de uma VM local não são mais entregues a requisições anônimas neste computador, e o header de dono do desktop só vale nas requisições da própria janela do app.",
        "Bots novos seguem os mesmos limites de configuração das edições, mudar o modelo padrão de um bot exige dono ou admin, e Marcar tudo como lido limpa só as suas notificações.",
        "As expressões dos gráficos são interpretadas e não compiladas em código, imagens protegidas de mensagens não ficam mais em cache, e o filtro do SQL de Dados lê os comandos como o DuckDB.",
        "Um bot dentro do box não alcança mais rotas internas com um caminho codificado, a chave do ElevenLabs não segue mais um redirect, e o Files não baixa mais .git nem outras pastas de controle de versão do My Cloud.",
        "O servidor, o companion e o app desktop não caem mais com uma requisição malformada ou um socket do visualizador reiniciado.",
        "Parar um turno agora também interrompe a publicação de páginas e um Chrome que ainda estava abrindo, e rotinas apagadas ou pausadas não iniciam mais uma execução.",
        "A memória não sobrescreve mais um arquivo que não consegue ler, o arquivo de sign-in do time continua um JSON válido, e cada bot exportado ganha a própria pasta de skill.",
        "A voz do Mac lê texto que começa com traço em vez de tratá-lo como opção, e o modal mantém o Tab dentro dele, links incluídos.",
      ],
    },
  },
  "0.1.138": {
    en: {
      features: [],
      fixes: [
        "On Linux, the chat's top bar no longer marks window-drag areas, since the system uses the native title bar.",
        "The Japanese texts use the MimirBot name again.",
      ],
    },
    "pt-br": {
      features: [],
      fixes: [
        "No Linux, a barra superior do chat deixa de marcar áreas de arrastar a janela, já que o sistema usa a barra de título nativa.",
        "Os textos em japonês voltam a usar o nome MimirBot.",
      ],
    },
  },
  "0.1.137": {
    en: {
      features: [
        "The new bot dialog is now a step-by-step flow: Identity, Permissions, Soul and Summary, with progress dots in the footer. At the Summary you create the bot or go on to the advanced settings (skills, memory, routines, access, model, voice and alerts) and finish with Save and close.",
        "The new bot's department now has search: the list shows 3 at a time, scrolls and filters as you type.",
        "After a bot is created, a screen confirms it, with shortcuts to create another bot or start chatting with it.",
      ],
      fixes: [],
    },
    "pt-br": {
      features: [
        "O modal de novo bot agora é um passo a passo: Identidade, Permissões, Essência e Resumo, com o avanço marcado por bolinhas no rodapé. No Resumo você cria o bot ou segue para as configurações avançadas (habilidades, memória, rotinas, acessos, modelo, voz e alertas) e termina em Salvar e fechar.",
        "O departamento do novo bot agora tem busca: a lista mostra 3 por vez, rola e filtra enquanto você digita.",
        "Ao criar um bot, uma tela confirma o resultado, com atalhos para criar outro bot ou iniciar a conversa com ele.",
      ],
      fixes: [],
    },
  },
  "0.1.136": {
    en: {
      features: [],
      fixes: ["In the Conversations tab, the page buttons stay at the same height, even on the last page with few conversations."],
    },
    "pt-br": {
      features: [],
      fixes: ["Na aba Conversas, os botões de mudar de página ficam sempre na mesma altura, mesmo na última página, com poucas conversas."],
    },
  },
  "0.1.135": {
    en: {
      features: [
        "The agent's conversations now live in a tab of the right-hand panel, next to Bot and Computer, 10 per page with paging. The conversations modal was removed.",
        "The chat's top menu is now centered: the agent and the conversation in the middle, the model and the panel on the right.",
      ],
      fixes: [],
    },
    "pt-br": {
      features: [
        "As conversas do agente agora ficam numa aba do painel da direita, ao lado de Bot e Computador, com 10 por página e paginação. O modal de conversas foi removido.",
        "O menu superior do chat ficou centralizado: o agente e a conversa no meio, e o modelo e o painel à direita.",
      ],
      fixes: [],
    },
  },
  "0.1.134": {
    en: { features: [], fixes: [] },
    "pt-br": { features: [], fixes: [] },
  },
  "0.1.133": {
    en: {
      features: [
        "Usage is now its own screen, opened by the Usage button, in the same place as the chat and the team map. It left Settings.",
        "A usage chart per bot, with period and bot filters, for cost, tokens, runs and errors, and the change from the previous period.",
        "Runs show 10 at a time, with paging and a button to sort by date, cost or duration.",
        "Plan limits appear in large rings, the same ones as in the sidebar.",
      ],
      fixes: [],
    },
    "pt-br": {
      features: [
        "O Uso virou uma tela própria, aberta pelo botão Uso, no mesmo lugar do chat e do mapa da equipe. Saiu das Configurações.",
        "Gráfico de uso por bot, com filtro de período e de bots, para custo, tokens, execuções e erros, e variação em relação ao período anterior.",
        "As execuções aparecem de 10 em 10, com paginação e botão para ordenar por data, custo ou duração.",
        "Os limites dos planos aparecem em anéis grandes, os mesmos da barra lateral.",
      ],
      fixes: [],
    },
  },
  "0.1.132": {
    en: {
      features: [],
      fixes: ["On Linux, the app opens again by itself after an update. From the next update on, you no longer need to open it by hand."],
    },
    "pt-br": {
      features: [],
      fixes: ["No Linux, o app volta a abrir sozinho depois de uma atualização. A partir da próxima atualização, não é mais preciso abri-lo à mão."],
    },
  },
  "0.1.131": {
    en: {
      features: [
        "Clicking the conversation title opens a modal with all of the agent's conversations, with search. The list stays in the sidebar.",
        "The Antigravity runtime installs itself after an update, once you have signed in with your Google account.",
      ],
      fixes: ["Antigravity usage tells you to install the runtime, instead of saying it could not reach it."],
    },
    "pt-br": {
      features: [
        "Clicar no título da conversa abre um modal com todas as conversas do agente, com busca. A lista continua na lateral.",
        "O runtime do Antigravity se instala sozinho depois de uma atualização, quando você já entrou com a sua conta Google.",
      ],
      fixes: ["O uso do Antigravity avisa para instalar o runtime, em vez de dizer que não conseguiu alcançá-lo."],
    },
  },
  "0.1.130": {
    en: {
      features: [
        "Antigravity usage, 5-hour and weekly, appears in the sidebar.",
        "Antigravity uses Google's official 1.4.3 runtime. After updating, install the runtime again in Settings; your sign-in is kept.",
      ],
      fixes: ["Connected providers appear in the sidebar even when usage is not available."],
    },
    "pt-br": {
      features: [
        "O uso do Antigravity, de 5 horas e semanal, aparece na barra lateral.",
        "O Antigravity usa o runtime oficial 1.4.3 do Google. Depois de atualizar, instale o runtime de novo em Configurações; o login é mantido.",
      ],
      fixes: ["Provedores conectados aparecem na barra lateral mesmo quando o uso não está disponível."],
    },
  },
  "0.1.129": {
    en: {
      features: ["When you open the app after an update, a screen shows what changed."],
      fixes: ["The release notes link now opens MimirBot's releases."],
    },
    "pt-br": {
      features: ["Ao abrir o app depois de uma atualização, uma tela mostra o que mudou."],
      fixes: ["O link de notas da versão agora abre as releases do MimirBot."],
    },
  },
  "0.1.128": {
    en: {
      features: [
        "The connected Antigravity appears in the sidebar, with an icon and a usage ring.",
        "The sidebar shows every provider by plan, without the cut at 3.",
      ],
      fixes: ["Antigravity did not appear in the sidebar because plan usage did not know it."],
    },
    "pt-br": {
      features: [
        "O Antigravity conectado aparece na barra lateral, com ícone e anel de uso.",
        "A barra lateral mostra todos os provedores por plano, sem o corte em 3.",
      ],
      fixes: ["O Antigravity não aparecia na barra lateral porque o uso do plano não o conhecia."],
    },
  },
};
