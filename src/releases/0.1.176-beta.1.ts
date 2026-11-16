import type { Release } from "@/lib/release-notes";

const release: Release = {
  version: "0.1.176-beta.1",
  date: "2026-11-16",
  notes: {
    en: {
      lead: "Workflows now carry a contract the engine can check, values that know where they came from, and a Studio that shows every problem before you save.",
      features: [
        {
          title: "A step names the file it delivers",
          body: "Every output declares its extension, and the engine reads a .json only when a condition or a parameter asks for it. The old proof file is gone: a step no longer grades its own work with an ok field.",
        },
        {
          title: "A value knows where it came from",
          body: "A parameter is either asked when the run starts, collected from you by a manual step, or read from one field of an earlier step's .json. Starting a run now asks only for the values that have no other origin, and a document and a value never travel twice.",
        },
        {
          title: "You confirm the interview",
          body: "The three questions a proposal needs are shown on its card with the answers the bot wrote. Creating the Workflow stays blocked until you confirm or correct them, and changing an answer later asks again.",
        },
        {
          title: "Approval has one rule",
          body: "A request card pauses the run, the run waits as long as it takes, and refusing cancels it. A daily routine that finds the previous run still waiting replaces it instead of piling up runs.",
        },
        {
          title: "Scripts get their own environment",
          body: "Python runs in a virtual environment and Node in its own node_modules, both per installation. Prepare it once from the Workflows menu; a run checks it and refuses before the first step when a module changed.",
        },
        {
          title: "The Studio shows what is wrong",
          body: "A single Inputs balloon now holds the documents and the parameters of a step, including where each value comes from. A problems panel lists every refusal with its path and opens the field, and a manual step that collects nothing is refused when saving.",
        },
      ],
      fixes: [
        "Saving refuses a manual step without a collected parameter and says which one to add.",
        "A refused save lists every problem with its path instead of one message.",
        "A step can no longer pass by writing ok: true; the engine checks the file, not the opinion.",
        "A routine whose Workflow is already created points at the Workflow, not at the bot.",
      ],
    },
    "pt-br": {
      lead: "Workflows agora carregam um contrato que o motor consegue conferir, valores que sabem de onde vieram, e um Studio que mostra todo problema antes de salvar.",
      features: [
        {
          title: "A etapa nomeia o arquivo que entrega",
          body: "Toda saída declara a extensão, e o motor só lê um .json quando uma condição ou um parâmetro pede por ele. O antigo arquivo de prova saiu: a etapa não avalia mais o próprio trabalho com um campo ok.",
        },
        {
          title: "O valor sabe de onde veio",
          body: "Um parâmetro é pedido no início da run, coletado de você por uma etapa manual, ou lido de um campo do .json de uma etapa anterior. Iniciar uma run agora pede só os valores sem outra origem, e um dado nunca viaja como documento e como parâmetro ao mesmo tempo.",
        },
        {
          title: "Você confirma a entrevista",
          body: "As três perguntas de uma proposta aparecem no cartão com as respostas que o bot escreveu. Criar o Workflow fica bloqueado até você confirmar ou corrigir, e mudar uma resposta depois pede confirmação de novo.",
        },
        {
          title: "Aprovação tem uma regra só",
          body: "Um cartão de pedido pausa a run, a run espera o tempo que for preciso, e recusar cancela. Uma rotina diária que encontra a run anterior ainda esperando substitui essa run em vez de empilhar.",
        },
        {
          title: "Scripts ganham ambiente próprio",
          body: "Python roda em ambiente virtual e Node no próprio node_modules, por instalação. Prepare uma vez pelo menu de Workflows; a run confere e recusa antes da primeira etapa quando um módulo mudou.",
        },
        {
          title: "O Studio mostra o que está errado",
          body: "Um único balão de Entradas reúne os documentos e os parâmetros de uma etapa, incluindo a origem de cada valor. Um painel de problemas lista cada recusa com o caminho e abre o campo, e etapa manual sem valor coletado é recusada ao salvar.",
        },
      ],
      fixes: [
        "Salvar recusa etapa manual sem parâmetro coletado e diz qual adicionar.",
        "Uma recusa lista todos os problemas com o caminho, não uma mensagem só.",
        "Uma etapa não passa mais escrevendo ok: true; o motor confere o arquivo, não a opinião.",
        "Rotina cujo Workflow já existe aponta para o Workflow, não para o bot.",
      ],
    },
  },
};

export default release;
