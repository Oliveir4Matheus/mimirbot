import type { Release } from "@/lib/release-notes";

const release: Release = {
  version: "0.1.178-beta.1",
  date: "2026-11-18",
  notes: {
    en: {
      lead: "Workflow triggers are part of the Studio, a webhook can start a Workflow with its own parameters, and every run now shows its files with preview and download.",
      features: [
        {
          title: "Triggers live in the Studio",
          body: "Every Workflow starts with a Manual trigger and can take more, chosen inside the node: Manual, Webhook or Routine. The last trigger cannot be removed, and the type lives with the node instead of another screen.",
        },
        {
          title: "A webhook starts the Workflow",
          body: "A Webhook trigger gets its own address and secret, pins a Workflow version, and maps start parameters from the payload, a header, the query string or a constant. The server resolves and validates the map before creating the run; a missing value answers 422 and a retry with the same delivery ID returns the same run. The credential is shown once.",
        },
        {
          title: "Files from the run",
          body: "The run screen lists what each step and each Do While round wrote under output/. Text, Markdown, JSON, CSV, images, PDF, audio and video open in a side preview; one file or the whole run downloads as a zip. HTML and SVG only download as source, and retention still applies.",
        },
      ],
      fixes: [
        "A routine can no longer target a Workflow that needs start parameters: creation answers 400 instead of leaving a run to fail.",
        "Escape closes the PDF preview again and returns the focus to the file row.",
        "Creating a bot through the API with an empty tool selection now really leaves it without tools.",
        "A proposal with nothing to collect is created directly; one that collects a value still starts manual.",
        "A failed artifact read is written to the server log.",
      ],
    },
    "pt-br": {
      lead: "Gatilhos de Workflow no Studio, webhook capaz de iniciar um Workflow com parâmetros próprios e arquivos da execução com prévia e download.",
      features: [
        {
          title: "Gatilhos no Studio",
          body: "Todo Workflow começa com um gatilho Manual e pode receber mais, escolhidos dentro do nó: Manual, Webhook ou Rotina. O último gatilho não pode ser removido, e o tipo fica no nó em vez de outra tela.",
        },
        {
          title: "Um webhook inicia o Workflow",
          body: "O gatilho de Webhook ganha endereço e segredo próprios, fixa uma versão do Workflow e mapeia parâmetros de início do payload, de um cabeçalho, da query string ou de uma constante. O servidor resolve e valida o mapa antes de criar a run; valor ausente responde 422 e um reenvio com o mesmo delivery ID devolve a mesma run. A credencial aparece uma vez.",
        },
        {
          title: "Arquivos da execução",
          body: "A tela da run lista o que cada etapa e cada volta do Do While escreveu em output/. Texto, Markdown, JSON, CSV, imagem, PDF, áudio e vídeo abrem numa prévia lateral; um arquivo ou a run inteira baixam em zip. HTML e SVG só baixam como fonte, e a retenção continua valendo.",
        },
      ],
      fixes: [
        "Uma rotina não pode mais apontar para um Workflow que precisa de parâmetros de início: a criação responde 400 em vez de deixar a run falhar.",
        "Esc volta a fechar a prévia de PDF e devolve o foco para a linha do arquivo.",
        "Criar um bot pela API com a seleção de ferramentas vazia agora realmente o deixa sem ferramentas.",
        "Uma proposta sem valor a coletar é criada direto; a que coleta um valor continua começando manual.",
        "Falha ao ler um artefato passa a ser registrada no log do servidor.",
      ],
    },
  },
};

export default release;
