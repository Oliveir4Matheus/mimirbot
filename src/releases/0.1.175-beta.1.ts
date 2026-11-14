import type { Release } from "@/lib/release-notes";
import base from "./0.1.174-beta.1";

const release: Release = {
  ...base,
  version: "0.1.175-beta.1",
  date: "2026-11-14",
  notes: {
    en: {
      ...base.notes.en,
      features: [
        {
          title: "A script can bring its own packages",
          body: "A Script step now lists the packages it imports. npm installs them for JavaScript and TypeScript and pip for Python, right before the step runs, and the folder is removed when it ends so the next run starts clean.",
        },
        {
          title: "Scripts get five minutes",
          body: "A Script step now stops after five minutes instead of one, and you can raise the limit up to an hour in its settings.",
        },
        ...base.notes.en.features,
      ],
    },
    "pt-br": {
      ...base.notes["pt-br"]!,
      features: [
        {
          title: "Um script pode trazer os próprios pacotes",
          body: "A etapa de Script agora lista os pacotes que importa. O npm instala para JavaScript e TypeScript e o pip para Python, logo antes da etapa rodar, e a pasta é removida quando ela termina para a próxima execução começar limpa.",
        },
        {
          title: "Scripts ganham cinco minutos",
          body: "Uma etapa de Script agora encerra após cinco minutos em vez de um, e você pode aumentar o limite até uma hora nas configurações dela.",
        },
        ...base.notes["pt-br"]!.features,
      ],
    },
  },
};
export default release;
