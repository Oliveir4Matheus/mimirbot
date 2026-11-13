import type { Release } from "@/lib/release-notes";
import proposal from "./shots/workflow-proposal.png";
import run from "./shots/workflow-run.png";
import studio from "./shots/workflow-studio.png";

const release: Release = {
  version: "0.1.168",
  date: "2026-11-13",
  notes: {
    en: {
      lead: "The screen after an update now reads one release at a time, and Workflows turn a conversation into steps you can edit and follow.",
      features: [
        {
          title: "A screen for what just changed",
          body: "After an update, the app opens this screen once. It starts with the version you are on, gives each change its own heading, and ends with the smaller fixes.",
        },
        {
          title: "Only the release you updated to",
          body: "Notes from earlier versions no longer pile up here. A fresh install, a first open while setup is on screen, and going back to an earlier version stay quiet, and a version with nothing to say shows no screen.",
        },
        {
          title: "Workflows start from a conversation",
          body: "Ask a bot to turn a process into a Workflow. It answers with a proposal card that names the department and lists the steps; nothing is created, listed or scheduled until you choose Create Workflow, and Now no keeps it under Proposals. The Workflow it creates starts with a manual step, so its first run waits for you.",
          shot: {
            src: proposal,
            caption: "The proposal in the conversation: nothing is created until you choose Create Workflow.",
          },
        },
        {
          title: "The Studio draws the steps",
          body: "The Studio is a canvas of stage cards. The palette adds an AI agent step, a script, IF/Else, Do While, a note or a container, and the cards' connectors draw the path between them. Each agent step keeps its own bot and the skills it loads, and every save becomes a version the Workflows screen can run.",
          shot: {
            src: studio,
            caption: "The Studio: an agent step, a condition, a Do While and a script, connected in order.",
          },
        },
        {
          title: "Conditions, loops and scripts",
          body: "IF/Else reads the previous step's result.json and follows the true or false branch. Do While repeats its body while a condition holds, up to a maximum number of turns, and keeps the loop's outputs from the last turn. Script steps run in their own folder with the inputs they declare: .mjs and .js use Node, .ts uses Node's type stripping and .py uses Python. A promised output that never appears fails that step instead of letting the run move on.",
        },
        {
          title: "Runs that wait for a person",
          body: "Every run has a timeline with each stage, the files it produced and whether its outputs verified. A step that ends on an open approval card parks the run as waiting for approval; answering the card resumes the same step. A run can be cancelled or repeated, and it keeps its own copy of the Workflow even after that Workflow is deleted.",
          shot: {
            src: run,
            caption: "A finished run: each stage, the files it produced, and the loop's turns.",
          },
        },
        {
          title: "Triggers, versions and the Workflows screen",
          body: "A routine can start a Workflow on its schedule, and a Workflow also runs from the list, by a call, a webhook or an app event. The Workflows screen lists workflows and runs, keeps each Workflow's versions, and stores the files a run produced for the retention you set, 90 days by default.",
        },
        {
          title: "Choose which releases you get",
          body: "Settings → Updates has an update channel. Main follows the official releases; Beta follows the beta branch's newest prereleases, which can be rougher. The app keeps the choice and checks that feed from then on.",
        },
      ],
      fixes: ["The screen does not come back for the same version, even after a restart."],
    },
    "pt-br": {
      lead: "A tela que abre depois de atualizar agora lê uma versão de cada vez, e os Workflows transformam uma conversa em etapas que você edita e acompanha.",
      features: [
        {
          title: "Uma tela para o que acabou de mudar",
          body: "Depois de atualizar, o app abre esta tela uma vez. Ela começa pela versão em que você está, dá um título a cada mudança e termina com as correções menores.",
        },
        {
          title: "Só a versão para a qual você atualizou",
          body: "As notas de versões anteriores não se acumulam mais aqui. Uma instalação nova, a primeira abertura com a configuração na tela e a volta para uma versão anterior ficam em silêncio, e uma versão sem nada a dizer não mostra tela.",
        },
        {
          title: "Workflows começam a partir de uma conversa",
          body: "Peça a um bot para transformar um processo em Workflow. Ele responde com um cartão de proposta que nomeia o departamento e lista as etapas; nada é criado, listado ou agendado até você escolher Criar Workflow, e Agora não guarda a proposta em Propostas. O Workflow criado começa com uma etapa manual, então a primeira execução espera por você.",
          shot: {
            src: proposal,
            caption: "A proposta na conversa: nada é criado até você escolher Criar Workflow.",
          },
        },
        {
          title: "O Studio desenha as etapas",
          body: "O Studio é uma tela de cartões de etapa. A paleta adiciona uma etapa de agente de IA, um script, IF/Else, Do While, uma nota ou um container, e os conectores dos cartões desenham o caminho entre elas. Cada etapa de agente mantém o próprio bot e as skills que carrega, e cada salvamento vira uma versão que a tela de Workflows pode executar.",
          shot: {
            src: studio,
            caption: "O Studio: uma etapa de agente, uma condição, um Do While e um script, conectados em ordem.",
          },
        },
        {
          title: "Condições, repetições e scripts",
          body: "O IF/Else lê o result.json da etapa anterior e segue o caminho verdadeiro ou falso. O Do While repete o corpo enquanto uma condição vale, até um número máximo de voltas, e guarda as saídas do loop da última volta. Etapas de script rodam na própria pasta com as entradas que declaram: .mjs e .js usam Node, .ts usa o type stripping do Node e .py usa Python. Uma saída prometida que não aparece faz aquela etapa falhar, em vez de deixar a execução seguir.",
        },
        {
          title: "Execuções que esperam por uma pessoa",
          body: "Cada execução tem uma linha do tempo com cada etapa, os arquivos que produziu e se as saídas foram verificadas. Uma etapa que termina num cartão de aprovação aberto deixa a execução aguardando aprovação; responder o cartão retoma a mesma etapa. Uma execução pode ser cancelada ou repetida, e guarda a própria cópia do Workflow mesmo depois que ele é apagado.",
          shot: {
            src: run,
            caption: "Uma execução concluída: cada etapa, os arquivos produzidos e as voltas do loop.",
          },
        },
        {
          title: "Gatilhos, versões e a tela de Workflows",
          body: "Uma rotina pode iniciar um Workflow no horário dela, e um Workflow também roda pela lista, por uma chamada, um webhook ou um evento de app. A tela de Workflows lista workflows e execuções, guarda as versões de cada Workflow e mantém os arquivos produzidos por uma execução pelo tempo de retenção definido, 90 dias por padrão.",
        },
        {
          title: "Escolha quais versões você recebe",
          body: "Em Configurações → Atualizações há um canal de atualização. O Principal segue as versões oficiais; o Beta segue as pré-versões mais novas da branch beta, que podem ser mais instáveis. O app guarda a escolha e verifica esse feed a partir daí.",
        },
      ],
      fixes: ["A tela não volta para a mesma versão, nem depois de reiniciar o app."],
    },
  },
};

export default release;
