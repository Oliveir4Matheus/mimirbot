import type { Release } from "@/lib/release-notes";

const release: Release = {
  version: "0.1.182-beta.1",
  date: "2026-11-24",
  notes: {
    en: {
      lead: "The rehearsal now takes example files, so a Workflow that asks the person for a value before its script runs can finally be created.",
      features: [
        {
          title: "Example files in the rehearsal",
          body: "The proposal preview has an Example files section: give the name the step declares and the content the step would write (for example corte.json with {\"dias\":3}), then run the rehearsal. The script runs with that file under input/, the preview shows the result, and Criar Workflow enables once the rehearsal passes.",
        },
      ],
      fixes: [
        "A rehearsal keeps an example file for an input that comes from a bot step, instead of marking the script untested and blocking the create.",
        "A proposal whose first step asks the person a question and feeds the answer to a script is no longer a dead end: it can be rehearsed and created.",
      ],
    },
    "pt-br": {
      lead: "O ensaio agora aceita arquivos de exemplo, então um Workflow que pergunta um valor à pessoa antes de rodar o script finalmente pode ser criado.",
      features: [
        {
          title: "Arquivos de exemplo no ensaio",
          body: "A prévia da proposta tem uma seção Arquivos de exemplo: informe o nome que a etapa declara e o conteúdo que ela escreveria (por exemplo, corte.json com {\"dias\":3}), depois rode o ensaio. O script roda com esse arquivo em input/, a prévia mostra o resultado e o botão Criar Workflow habilita quando o ensaio passa.",
        },
      ],
      fixes: [
        "O ensaio mantém o arquivo de exemplo de uma entrada que vem de uma etapa de bot, em vez de marcar o script como não testado e bloquear a criação.",
        "Uma proposta cujo primeiro passo pergunta algo à pessoa e alimenta o script com a resposta deixou de ser um beco sem saída: dá para ensaiar e criar.",
      ],
    },
  },
};

export default release;
