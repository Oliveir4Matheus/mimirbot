export interface ReleaseNotes {
  features: string[];
  fixes: string[];
}

/** Shown once after an update, so they ship inside the app and work offline. Add the entry for a version when you raise it. */
export const RELEASE_NOTES: Record<string, ReleaseNotes> = {
  "0.1.138": {
    features: [],
    fixes: [
      "No Linux, a barra superior do chat deixa de marcar áreas de arrastar a janela, já que o sistema usa a barra de título nativa.",
      "Os textos em japonês voltam a usar o nome MimirBot.",
    ],
  },
  "0.1.137": {
    features: [
      "O modal de novo bot agora é um passo a passo: Identidade, Permissões, Essência e Resumo, com o avanço marcado por bolinhas no rodapé. No Resumo você cria o bot ou segue para as configurações avançadas (habilidades, memória, rotinas, acessos, modelo, voz e alertas) e termina em Salvar e fechar.",
      "O departamento do novo bot agora tem busca: a lista mostra 3 por vez, rola e filtra enquanto você digita.",
      "Ao criar um bot, uma tela confirma o resultado, com atalhos para criar outro bot ou iniciar a conversa com ele.",
    ],
    fixes: [],
  },
  "0.1.136": {
    features: [],
    fixes: ["Na aba Conversas, os botões de mudar de página ficam sempre na mesma altura, mesmo na última página, com poucas conversas."],
  },
  "0.1.135": {
    features: [
      "As conversas do agente agora ficam numa aba do painel da direita, ao lado de Bot e Computador, com 10 por página e paginação. O modal de conversas foi removido.",
      "O menu superior do chat ficou centralizado: o agente e a conversa no meio, e o modelo e o painel à direita.",
    ],
    fixes: [],
  },
  "0.1.134": {
    features: [],
    fixes: [],
  },
  "0.1.133": {
    features: [
      "O Uso virou uma tela própria, aberta pelo botão Uso, no mesmo lugar do chat e do mapa da equipe. Saiu das Configurações.",
      "Gráfico de uso por bot, com filtro de período e de bots, para custo, tokens, execuções e erros, e variação em relação ao período anterior.",
      "As execuções aparecem de 10 em 10, com paginação e botão para ordenar por data, custo ou duração.",
      "Os limites dos planos aparecem em anéis grandes, os mesmos da barra lateral.",
    ],
    fixes: [],
  },
  "0.1.132": {
    features: [],
    fixes: ["No Linux, o app volta a abrir sozinho depois de uma atualização. A partir da próxima atualização, não é mais preciso abri-lo à mão."],
  },
  "0.1.131": {
    features: [
      "Clicar no título da conversa abre um modal com todas as conversas do agente, com busca. A lista continua na lateral.",
      "O runtime do Antigravity se instala sozinho depois de uma atualização, quando você já entrou com a sua conta Google.",
    ],
    fixes: ["O uso do Antigravity avisa para instalar o runtime, em vez de dizer que não conseguiu alcançá-lo."],
  },
  "0.1.130": {
    features: [
      "O uso do Antigravity, de 5 horas e semanal, aparece na barra lateral.",
      "O Antigravity usa o runtime oficial 1.4.3 do Google. Depois de atualizar, instale o runtime de novo em Configurações; o login é mantido.",
    ],
    fixes: ["Provedores conectados aparecem na barra lateral mesmo quando o uso não está disponível."],
  },
  "0.1.129": {
    features: ["Ao abrir o app depois de uma atualização, uma tela mostra o que mudou."],
    fixes: ["O link de notas da versão agora abre as releases do MimirBot."],
  },
  "0.1.128": {
    features: [
      "O Antigravity conectado aparece na barra lateral, com ícone e anel de uso.",
      "A barra lateral mostra todos os provedores por plano, sem o corte em 3.",
    ],
    fixes: ["O Antigravity não aparecia na barra lateral porque o uso do plano não o conhecia."],
  },
};
