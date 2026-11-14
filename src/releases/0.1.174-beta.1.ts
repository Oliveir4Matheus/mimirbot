import type { Release } from "@/lib/release-notes";
import base from "./0.1.173-beta.1";

const release: Release = {
  ...base,
  version: "0.1.174-beta.1",
  notes: {
    en: {
      ...base.notes.en,
      features: [
        {
          title: "A shortcut to a Workflow",
          body: "Type /cworkflow and describe the process. The bot proposes the Workflow for it in one step, asking only what the description does not answer.",
        },
        ...base.notes.en.features,
      ],
    },
    "pt-br": {
      ...base.notes["pt-br"]!,
      features: [
        {
          title: "Um atalho para um Workflow",
          body: "Digite /cworkflow e descreva o processo. O bot propõe o Workflow em um passo só, perguntando apenas o que a descrição não responde.",
        },
        ...base.notes["pt-br"]!.features,
      ],
    },
  },
};

export default release;
