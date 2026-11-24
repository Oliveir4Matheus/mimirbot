import type { Release } from "@/lib/release-notes";

const release: Release = {
  version: "0.1.183-beta.1",
  date: "2026-11-24",
  notes: {
    en: {
      lead: "Antigravity and OpenCode were updated to their latest releases, with every installer hash re-measured.",
      features: [
        {
          title: "Antigravity 1.5.2",
          body: "Google's agent is pinned at 1.5.2 for macOS (arm64 and x64), Linux (x64 and arm64) and Windows (x64 and arm64). The archive and expanded member sizes were re-read from the official registry and from each archive; Settings → Engines → Install official Antigravity downloads the new build.",
        },
        {
          title: "OpenCode 2.4.1",
          body: "The standalone build (used when the app installs OpenCode without Node.js) moves from 2.2.5 to 2.4.1 on all eight targets, with archive and executable hashes taken from the release's own SHA256SUMS and re-measured here. Copies installed by earlier pins stay usable.",
        },
      ],
      fixes: [
        "An OpenCode copy installed by the previous pin keeps working after the update, so the engine is not dropped from PATH until the person installs again.",
        "Engines installed through npm (Claude, Codex, Kimi, Cline, Copilot, DeepSeek, pi, MiniMax) still fetch the latest package on their Install button; nothing to reinstall for this release.",
      ],
    },
    "pt-br": {
      lead: "Antigravity e OpenCode foram atualizados para as versões mais recentes, com todos os hashes dos instaladores medidos de novo.",
      features: [
        {
          title: "Antigravity 1.5.2",
          body: "O agente do Google está fixado em 1.5.2 para macOS (arm64 e x64), Linux (x64 e arm64) e Windows (x64 e arm64). Os tamanhos do arquivo e dos membros expandidos foram relidos do registro oficial e de cada arquivo; Configurações → Engines → Install official Antigravity baixa a versão nova.",
        },
        {
          title: "OpenCode 2.4.1",
          body: "O build standalone (usado quando o app instala o OpenCode sem Node.js) sai de 2.2.5 para 2.4.1 nos oito alvos, com hashes do arquivo e do executável tirados do SHA256SUMS do próprio release e medidos aqui. Cópias instaladas por pins anteriores continuam utilizáveis.",
        },
      ],
      fixes: [
        "Uma cópia do OpenCode instalada pelo pin anterior continua funcionando depois da atualização, então o engine não some do PATH até a pessoa instalar de novo.",
        "Engines instalados por npm (Claude, Codex, Kimi, Cline, Copilot, DeepSeek, pi, MiniMax) continuam buscando o pacote mais recente no botão Install; nada a reinstalar por causa deste release.",
      ],
    },
  },
};

export default release;
