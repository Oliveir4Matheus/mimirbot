import type { Release } from "@/lib/release-notes";

const release: Release = {
  version: "0.1.168",
  date: "2026-11-13",
  notes: {
    en: {
      lead: "The screen after an update now reads one release at a time.",
      features: [
        {
          title: "A screen for what just changed",
          body: "After an update, the app opens this screen once. It starts with the version you are on, gives each change its own heading, and ends with the smaller fixes.",
        },
        {
          title: "Only the release you updated to",
          body: "Notes from earlier versions no longer pile up here. A fresh install, a first open while setup is on screen, and going back to an earlier version stay quiet, and a version with nothing to say shows no screen.",
        },
        {
          title: "Switch to the beta channel",
          body: "Settings → Updates now has an update channel. Keep Main for the official releases, or choose Beta to get the beta branch's newest prereleases, which can be rougher. The app keeps the choice and checks that feed from then on.",
        },
      ],
      fixes: ["The screen does not come back for the same version, even after a restart."],
    },
    "pt-br": {
      lead: "A tela que abre depois de atualizar agora lê uma versão de cada vez.",
      features: [
        {
          title: "Uma tela para o que acabou de mudar",
          body: "Depois de atualizar, o app abre esta tela uma vez. Ela começa pela versão em que você está, dá um título a cada mudança e termina com as correções menores.",
        },
        {
          title: "Só a versão para a qual você atualizou",
          body: "As notas de versões anteriores não se acumulam mais aqui. Uma instalação nova, a primeira abertura com a configuração na tela e a volta para uma versão anterior ficam em silêncio, e uma versão sem nada a dizer não mostra tela.",
        },
        {
          title: "Troque para o canal beta",
          body: "Configurações → Atualizações agora tem um canal de atualização. Mantenha o Principal para as versões oficiais ou escolha o Beta para receber as pré-versões mais novas da branch beta, que podem ser mais instáveis. O app guarda a escolha e verifica esse feed a partir daí.",
        },
      ],
      fixes: ["A tela não volta para a mesma versão, nem depois de reiniciar o app."],
    },
  },
};

export default release;
