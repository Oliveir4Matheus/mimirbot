import type { Release } from "@/lib/release-notes";
import base from "./0.1.172-beta.1";

const release: Release = {
  ...base,
  version: "0.1.173-beta.1",
  notes: {
    en: {
      ...base.notes.en,
      fixes: [
        ...base.notes.en.fixes,
        "When you ask a bot to build a Workflow, it now proposes the Workflow instead of changing an automation and calling that a Workflow.",
      ],
    },
    "pt-br": {
      ...base.notes["pt-br"]!,
      fixes: [
        ...base.notes["pt-br"]!.fixes,
        "Quando você pede a um bot para montar um Workflow, ele agora propõe o Workflow em vez de alterar uma automação e chamar isso de Workflow.",
      ],
    },
  },
};

export default release;
