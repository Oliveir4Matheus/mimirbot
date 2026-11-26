import type { Release } from "@/lib/release-notes";

const release: Release = {
  version: "0.1.177-beta.1",
  date: "2026-11-16",
  notes: {
    en: {
      lead: "The proposal preview became the gate it was meant to be: it scrolls inside the screen, never asks for a reason it would ignore, and only creates after the rehearsal passes.",
      features: [
        {
          title: "A preview that holds its place",
          body: "The dialog keeps a fixed height and scrolls its own body, so the close button and the create action stay where they are. The list of steps is shown as the same white cards you see in the Workflow screen, in both themes.",
        },
        {
          title: "Rehearsal is required",
          body: "A proposal shows two rehearsal states: none yet, or passed. Create stays disabled until the scripts run and nothing diverges. A step that needs a bot is not testable and does not block; a proposal without scripts counts as passed.",
        },
        {
          title: "Errors go back to the bot",
          body: "When the definition cannot be saved, or the rehearsal diverges, the dialog lists every real problem with its path and a button that sends the same list to the conversation that wrote the proposal, so the bot can correct it.",
        },
      ],
      fixes: [
        "Create no longer asks for a justification that the server would ignore.",
        "Starting a run with an unprepared environment now says so, instead of claiming the Workflow takes no inputs.",
        "The Workflow specifications describe the shipped contract: outputs with an extension and a shape, parameters with an origin, manual steps that collect a value, and the per-installation environment.",
      ],
    },
    "pt-br": {
      lead: "A prévia da proposta virou o portão que deveria ser: rola dentro da tela, nunca pede uma justificativa que seria ignorada, e só cria depois que o ensaio passa.",
      features: [
        {
          title: "Uma prévia que fica no lugar",
          body: "O diálogo mantém altura fixa e rola o próprio corpo, então fechar e criar continuam onde estão. A lista de etapas aparece nos mesmos cartões brancos da tela de Workflow, nos dois temas.",
        },
        {
          title: "O ensaio é obrigatório",
          body: "A proposta mostra dois estados de ensaio: nenhum ainda, ou passou. Criar fica desabilitado até os scripts rodarem sem divergir. Etapa que depende de bot não é testável e não bloqueia; proposta sem script conta como aprovada.",
        },
        {
          title: "Erros voltam para o bot",
          body: "Quando a definição não pode ser salva, ou o ensaio diverge, o diálogo lista cada problema real com o caminho e um botão que manda a mesma lista para a conversa que escreveu a proposta, para o bot corrigir.",
        },
      ],
      fixes: [
        "Criar não pede mais uma justificativa que o servidor ignoraria.",
        "Iniciar uma run com ambiente não preparado agora diz isso, em vez de afirmar que o Workflow não recebe entradas.",
        "As especificações de Workflow descrevem o contrato entregue: saídas com extensão e shape, parâmetros com origem, etapa manual que coleta um valor e ambiente por instalação.",
      ],
    },
  },
};

export default release;
