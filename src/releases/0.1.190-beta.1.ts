import type { Release } from "@/lib/release-notes";

const release: Release = {
  version: "0.1.190-beta.1",
  date: "2026-11-26",
  notes: {
    en: {
      lead: "The eight minimalist agent shapes get the approved heavier outline, so they read clearly at sidebar sizes without losing their open centre.",
      features: [
        {
          title: "Heavier agent outlines",
          body: "Every agent shape now carries a 4-unit outline stroke in the 180-unit viewBox. The ring has more presence at 16–24 px; the static, thinking and working SVGs all use the same weight.",
        },
      ],
      fixes: [
        "The thicker outline is applied while the shape is painted, so existing bots and the three animation states pick it up automatically.",
      ],
    },
    "pt-br": {
      lead: "Os oito formatos minimalistas de agente recebem o contorno mais grosso aprovado, para ficarem legíveis no tamanho da barra lateral sem fechar o miolo.",
      features: [
        {
          title: "Contornos de agente mais grossos",
          body: "Cada formato de agente agora leva um stroke de 4 unidades no viewBox de 180. O anel ganha presença em 16–24 px; os SVGs estático, pensando e trabalhando usam o mesmo peso.",
        },
      ],
      fixes: [
        "O contorno mais grosso é aplicado na hora de pintar a forma, então bots existentes e os três estados de animação o recebem automaticamente.",
      ],
    },
  },
};

export default release;
