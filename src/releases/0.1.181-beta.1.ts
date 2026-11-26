import type { Release } from "@/lib/release-notes";

const release: Release = {
  version: "0.1.181-beta.1",
  date: "2026-11-21",
  notes: {
    en: {
      lead: "Creating a Workflow is now a Chief's job, like creating a bot, and the Workflow tools say the same with far fewer words.",
      features: [
        {
          title: "Workflows belong to the Chief",
          body: "propose_workflow, create_workflow_from_proposal and archive_workflow_proposal are only listed to a Chief of Staff and to your own MimirBot. Every other bot asks a reachable Chief through coordinate_bots, and says plainly when there is no Chief to ask. Any bot can still list and run the Workflows it can see.",
        },
        {
          title: "Smaller tool text",
          body: "The seven Workflow tools explain only what the model cannot read from the schema: the interview, the refusal path, the approval rule and one worked example. Rules already stated on each field, or already in the bot's instructions, are no longer repeated. A Chief's catalog drops by about 2.3 KB; a bot without Chief powers drops by about 12.7 KB, which matters most on local models and engines without the tool bridge.",
        },
      ],
      fixes: [
        "A bot that is not a Chief is told to hand Workflow requests to a Chief instead of building the process by hand.",
      ],
    },
    "pt-br": {
      lead: "Criar um Workflow agora é tarefa de Chief, como criar um bot, e as tools de Workflow dizem o mesmo com bem menos palavras.",
      features: [
        {
          title: "Workflow é do Chief",
          body: "propose_workflow, create_workflow_from_proposal e archive_workflow_proposal só aparecem para um Chief of Staff e para o seu próprio MimirBot. Os outros bots pedem a um Chief alcançável via coordinate_bots e dizem com clareza quando não há Chief para chamar. Qualquer bot continua listando e iniciando os Workflows que enxerga.",
        },
        {
          title: "Menos texto nas tools",
          body: "As sete tools de Workflow explicam só o que o modelo não consegue ler do schema: a entrevista, o caminho de recusa, a regra de aprovação e um exemplo funcional. Regras que já estão em cada campo, ou já estão nas instruções do bot, não se repetem. O catálogo de um Chief cai cerca de 2,3 KB; o de um bot sem poderes de Chief cai cerca de 12,7 KB, o que pesa mais em modelos locais e engines sem a ponte de tools.",
        },
      ],
      fixes: [
        "Um bot que não é Chief passa a ser instruído a entregar pedidos de Workflow a um Chief em vez de montar o processo por conta própria.",
      ],
    },
  },
};

export default release;
