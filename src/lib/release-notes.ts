export interface ReleaseNotes {
  features: string[];
  fixes: string[];
}

/** Shown once after an update, so they ship inside the app and work offline. Add the entry for a version when you raise it. */
export const RELEASE_NOTES: Record<string, ReleaseNotes> = {
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
