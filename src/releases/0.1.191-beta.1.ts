import type { Release } from "@/lib/release-notes";

const release: Release = {
  version: "0.1.191-beta.1",
  date: "2026-11-26",
  notes: {
    en: {
      lead: "The agent icons get the approved +9 outline and the sidebar avatar grows 10%, so the shapes read clearly without relying on extra thickness alone.",
      features: [
        {
          title: "Heavier agent outlines",
          body: "The eight agent shapes now use a 9-unit stroke in the 180-unit viewBox. The ring has a stronger presence at small sizes, and the static, thinking and working SVGs share the same weight.",
        },
        {
          title: "Larger sidebar avatars",
          body: "The bot avatar in the expanded sidebar grows from 27 px to 30 px, a 10% increase. The compact rail sizes stay unchanged so that layout keeps its proportions.",
        },
      ],
      fixes: [
        "The +9 outline is applied while the shape is painted, so existing bots and all three animation states pick it up automatically.",
      ],
    },
    "pt-br": {
      lead: "Os ícones de agente recebem o contorno +9 aprovado e o avatar do menu lateral cresce 10%, para os formatos ficarem legíveis sem depender só da espessura.",
      features: [
        {
          title: "Contornos de agente mais grossos",
          body: "Os oito formatos de agente agora usam um stroke de 9 unidades no viewBox de 180. O anel ganha presença em tamanhos pequenos, e os SVGs estático, pensando e trabalhando usam o mesmo peso.",
        },
        {
          title: "Avatares maiores no menu lateral",
          body: "O avatar do bot na barra lateral expandida passa de 27 px para 30 px, um aumento de 10%. Os tamanhos compactos do rail continuam iguais para preservar as proporções do layout.",
        },
      ],
      fixes: [
        "O contorno +9 é aplicado na hora de pintar a forma, então bots existentes e os três estados de animação o recebem automaticamente.",
      ],
    },
  },
};

export default release;
