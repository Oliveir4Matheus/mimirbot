export interface ReleaseNotes {
  features: string[];
  fixes: string[];
}

/** Shown once after an update, so they ship inside the app and work offline. Add the entry for a version when you raise it. */
export const RELEASE_NOTES: Record<string, ReleaseNotes> = {
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
