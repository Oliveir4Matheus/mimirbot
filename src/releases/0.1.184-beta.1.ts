import type { Release } from "@/lib/release-notes";

const release: Release = {
  version: "0.1.184-beta.1",
  date: "2026-11-25",
  notes: {
    en: {
      lead: "The browser moves to Chrome for Testing 158, both the headless shell packaged with the app and the full browser downloaded on a server.",
      features: [
        {
          title: "Chrome 158",
          body: "The packaged headless shell and the full Chrome for Testing downloaded on a Linux server are pinned at 158.0.8127.88, with new sizes and SHA-256 for every shipped target. A server that already had 153 downloads 158 on its next browser start.",
        },
      ],
      fixes: [
        "Every browser pin was re-measured from the archive itself: size, archive SHA-256 and the SHA-256 of the executable inside it.",
      ],
    },
    "pt-br": {
      lead: "O navegador passa para o Chrome for Testing 158, tanto o headless empacotado com o app quanto o Chrome completo baixado no servidor.",
      features: [
        {
          title: "Chrome 158",
          body: "O headless empacotado e o Chrome for Testing completo baixado num servidor Linux estão fixados em 158.0.8127.88, com tamanhos e SHA-256 novos para cada alvo. Um servidor que já tinha o 153 baixa o 158 na próxima abertura do navegador.",
        },
      ],
      fixes: [
        "Todo pin do navegador foi medido de novo a partir do próprio arquivo: tamanho, SHA-256 do zip e SHA-256 do executável dentro dele.",
      ],
    },
  },
};

export default release;
