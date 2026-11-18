import type { Release } from "@/lib/release-notes";

const release: Release = {
  version: "0.1.179-beta.1",
  date: "2026-11-18",
  notes: {
    en: {
      lead: "Run files now paginate one step at a time, and every preview opens in the same file viewer the app already uses for attachments.",
      features: [
        {
          title: "Five files at a time",
          body: "Each step and each Do While round shows at most five files, with Previous and Next and the current range (1–5 of 12). The page resets when you open another run, and a step with fewer files keeps a single page.",
        },
        {
          title: "One viewer for every file",
          body: "Artifacts now open in the same viewer as message attachments: reading and source views, CSV tables, images, PDF, audio and video, with the same zoom, page controls and close behavior. Annotation stays where it belongs, on a conversation attachment; a run file only previews and downloads.",
        },
      ],
      fixes: [
        "The run screen no longer carries a second, smaller preview component.",
        "Escape closes an artifact preview and returns the focus to its row.",
      ],
    },
    "pt-br": {
      lead: "Os arquivos da execução agora paginam por etapa, e toda prévia abre no mesmo visualizador que o app já usa para anexos.",
      features: [
        {
          title: "Cinco arquivos por vez",
          body: "Cada etapa e cada volta do Do While mostra no máximo cinco arquivos, com Anterior e Próximo e o intervalo atual (1–5 de 12). A página volta ao início ao abrir outra run, e uma etapa com menos arquivos continua em uma página só.",
        },
        {
          title: "Um visualizador para cada arquivo",
          body: "Os artefatos agora abrem no mesmo visualizador dos anexos de mensagem: leitura e fonte, tabela CSV, imagem, PDF, áudio e vídeo, com o mesmo zoom, controles de página e fechamento. Anotação continua onde pertence, num anexo de conversa; arquivo de run só abre e baixa.",
        },
      ],
      fixes: [
        "A tela da run não carrega mais um segundo componente de prévia menor.",
        "Esc fecha a prévia de artefato e devolve o foco para a linha.",
      ],
    },
  },
};

export default release;
