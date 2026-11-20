import type { Release } from "@/lib/release-notes";

const release: Release = {
  version: "0.1.171",
  date: "2026-11-20",
  notes: {
    en: {
      lead: "A broad upstream sync: secrets are masked before they can be cut or logged, sign-in races are closed, and the Linux browser, PATH and Windows data-directory problems are fixed.",
      features: [
        {
          title: "Secret redaction at the boundary",
          body: "Configured MCP secrets, Notion and Perplexity tokens, and provider output are masked before an answer is clipped, logged or quoted back. The same pass covers long answers and rejected tool arguments.",
        },
        {
          title: "Safer sign-in and credentials",
          body: "Provider sign-in results are discarded after their flow ends, cancelled turns stop filling login forms, 1Password keeps website logins inside the item limit, and MCP token updates stay on the sign-in that started them.",
        },
        {
          title: "Linux browser and PATH",
          body: "Linux servers without Chrome download Chrome for Testing, a browser agent-browser already finds is kept, and the login-shell PATH probe has its own deadline and output cap.",
        },
        {
          title: "Quicker everyday work",
          body: "Chats load 80 messages when you switch, a bot's full screen watches without taking control, ⌘⇧N starts a new thread, and webhook triggers can filter the payload.",
        },
      ],
      fixes: [
        "Windows: a dead process that still answers EPERM no longer holds the data-directory lease.",
        "macOS: the Allow control card can be dismissed with Not now.",
        "Codex: ChatGPT-plan turns use the person's own Codex setup.",
        "The settings file is copied and dated before a save, and an unreadable file is never replaced.",
        "MCP sign-in reports why a server refused to register the app.",
        "The browser stays sharp on scaled Linux desktops.",
      ],
    },
    "pt-br": {
      lead: "Um sync amplo com o upstream: segredos são mascarados antes de serem cortados ou logados, corridas de sign-in são fechadas, e os problemas de browser Linux, PATH e lease no Windows foram corrigidos.",
      features: [
        {
          title: "Redaction na fronteira",
          body: "Segredos de MCP, tokens Notion e Perplexity e a saída de providers são mascarados antes de uma resposta ser cortada, logada ou citada de volta. A mesma passada cobre respostas longas e argumentos de tool rejeitados.",
        },
        {
          title: "Sign-in e credenciais mais seguros",
          body: "Resultados de sign-in são descartados depois que o fluxo termina, turnos cancelados param de preencher formulários de login, o 1Password mantém logins de site no limite de itens e atualizações de token de MCP ficam no sign-in que as iniciou.",
        },
        {
          title: "Browser e PATH no Linux",
          body: "Servidores Linux sem Chrome baixam o Chrome for Testing, um browser que o agent-browser já encontra é mantido, e o probe do PATH do login-shell tem deadline e limite de saída próprios.",
        },
        {
          title: "Trabalho do dia a dia mais rápido",
          body: "Chats carregam 80 mensagens na troca, a tela cheia de um bot assiste sem assumir o controle, ⌘⇧N inicia uma nova thread e gatilhos de webhook podem filtrar o payload.",
        },
      ],
      fixes: [
        "Windows: um processo morto que ainda responde EPERM não segura mais o lease do diretório de dados.",
        "macOS: o card de controle pode ser dispensado com Agora não.",
        "Codex: turnos do plano ChatGPT usam o setup do Codex da própria pessoa.",
        "O arquivo de Settings é copiado e datado antes de salvar, e um arquivo ilegível nunca é substituído.",
        "O sign-in de MCP mostra por que um servidor recusou registrar o app.",
        "O browser fica nítido em desktops Linux com escala.",
      ],
    },
  },
};

export default release;
