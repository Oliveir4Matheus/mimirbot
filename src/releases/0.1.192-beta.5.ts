import type { Release } from "@/lib/release-notes";

const release: Release = {
  version: "0.1.192-beta.5",
  date: "2026-11-27",
  notes: {
    en: {
      lead: "Published apps now have a home beside the chat, and a finished run can become a reusable Skill Burger.",
      features: [
        {
          title: "Published apps",
          body: "Open ⋯ → Published apps to see every live page this server published, newest first. Each card shows its link, bot and date, with Preview, Open, Copy link and Delete. Preview draws the page in a sandboxed frame inside the panel, and Delete asks before taking the link down.",
        },
        {
          title: "Published apps in the rail",
          body: "The Published apps panel also has a button in the bottom bar, beside Apps, whenever a bot chat is open.",
        },
        {
          title: "Build an app with /create-apps",
          body: "Type /create-apps in the composer, name what you want, and the bot builds the page with show_html. The reply points at the page card, where Share publishes it and adds it to Published apps.",
        },
        {
          title: "Skill Burger",
          body: "A finished run with shell or file steps shows a small card in chat. Save as skill turns it into a normal skill with SKILL.md and workflow.json, listed under the bot's Skills page. Run replays the steps in the conversation folder, and the run_saved_workflow tool lets a bot run it later.",
        },
      ],
      fixes: [
        "A saved file step refuses a symlink at its target and a symlinked folder, so a replay cannot write outside the conversation. Step paths are shown with forward slashes on Windows, and the Windows shell tests skip the POSIX-only replay cases.",
        "The Published apps panel and Bot settings, Computer, Inspector and Activity close each other instead of stacking.",
        "Skill Burger can be turned off in Settings; saved skills stay readable.",
      ],
    },
    "pt-br": {
      lead: "Os apps publicados agora têm um lugar ao lado do chat, e uma execução concluída pode virar um Skill Burger reutilizável.",
      features: [
        {
          title: "Apps publicados",
          body: "Abra ⋯ → Apps publicados para ver todas as páginas ativas que este servidor publicou, das mais recentes para as mais antigas. Cada cartão mostra o link, o bot e a data, com Visualizar, Abrir, Copiar link e Excluir. A visualização desenha a página num frame isolado dentro do painel, e Excluir pergunta antes de tirar o link do ar.",
        },
        {
          title: "Apps publicados na barra",
          body: "O painel Apps publicados também tem um botão na barra inferior, ao lado de Apps, sempre que um chat de bot está aberto.",
        },
        {
          title: "Crie um app com /create-apps",
          body: "Digite /create-apps no compositor, diga o que quer, e o bot constrói a página com show_html. A resposta aponta para o cartão da página, onde Compartilhar publica e adiciona em Apps publicados.",
        },
        {
          title: "Skill Burger",
          body: "Uma execução concluída com passos de shell ou arquivo mostra um cartão pequeno no chat. Salvar como skill transforma a execução numa skill normal com SKILL.md e workflow.json, listada em Skills do bot. Executar repete os passos na pasta da conversa, e a ferramenta run_saved_workflow permite que um bot rode a skill depois.",
        },
      ],
      fixes: [
        "Um passo de arquivo salvo recusa symlink no destino e pasta com symlink, então a repetição não escreve fora da conversa. No Windows, os caminhos dos passos aparecem com barra normal e os testes de shell pulam os casos POSIX.",
        "O painel de Apps publicados e Configurações do bot, Computador, Inspetor e Atividade se fecham entre si em vez de empilhar.",
        "O Skill Burger pode ser desligado nas Configurações; as skills salvas continuam legíveis.",
      ],
    },
  },
};

export default release;
