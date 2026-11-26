import type { Release } from "@/lib/release-notes";
import base from "./0.1.168";

const runtime = {
  en: {
    title: "Antigravity 1.5.0",
    body: "The built-in Antigravity runtime is now Google's 1.5.0 release, downloaded and checked against its published SHA-256 the same way as before. The next run replaces the 1.4.3 files in this computer's data folder; the Antigravity accounts and sessions you already have keep working.",
  },
  "pt-br": {
    title: "Antigravity 1.5.0",
    body: "O runtime do Antigravity que acompanha o app agora é a versão 1.5.0 do Google, baixada e conferida pelo SHA-256 publicado do mesmo jeito que antes. A próxima execução substitui os arquivos da 1.4.3 na pasta de dados deste computador; as contas e sessões do Antigravity que você já tem continuam funcionando.",
  },
};

const release: Release = {
  version: "0.1.172-beta.1",
  date: "2026-11-14",
  notes: {
    en: { ...base.notes.en, features: [runtime.en, ...base.notes.en.features] },
    "pt-br": { ...base.notes["pt-br"]!, features: [runtime["pt-br"], ...base.notes["pt-br"]!.features] },
  },
};

export default release;
