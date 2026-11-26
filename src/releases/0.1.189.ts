import type { Release } from "@/lib/release-notes";

const release: Release = {
  version: "0.1.189",
  date: "2026-11-26",
  notes: {
    en: {
      lead: "This beta brings the new minimalist agent shapes and a white hexagon brand mark, alongside the Cua Driver 0.62.1 update.",
      features: [
        {
          title: "New agent shapes",
          body: "Eight minimalist outline shapes replace the ten old mascot bodies in the avatar picker and the ready-made bots. Each shape has still, thinking and working states; the bot's own colour is applied to the outline. Bots saved with an old body id keep their look through a mapping, and custom images still work as before.",
        },
        {
          title: "White hexagon Mimir mark",
          body: "The app and rail icon now use the white hexagon on the dark Mimir tile, matching the new agent shape language.",
        },
        {
          title: "Cua Driver 0.62.1",
          body: "Local computer control ships Cua Driver 0.62.1 on macOS (universal), Windows x64 and Linux x64. The archive and every member it carries were re-measured from the release, and the npm SDK moves with it.",
        },
        {
          title: "Regenerated compliance records",
          body: "The bundled SBOM, licence report and notices were rebuilt with cargo-about 0.8.4 from the upstream commit 3f69010c: 388 crate components, ten Cua components and the embedded Inter font. The Linux package verifies the new version, hashes and release record.",
        },
      ],
      fixes: [
        "Old body choices are mapped to the closest new shape, so existing bots do not lose their avatar.",
        "Local computer control accepts the new bundled driver version instead of rejecting every turn with an outdated pin.",
        "The Linux package smoke's stub driver and the X11 input smoke's metadata check follow the new version.",
      ],
    },
    "pt-br": {
      lead: "Este beta traz os novos formatos minimalistas de agente e a marca hexágono branca, junto com a atualização do Cua Driver 0.62.1.",
      features: [
        {
          title: "Novos formatos de agente",
          body: "Oito contornos minimalistas substituem os dez corpos antigos na galeria de avatar e nos bots prontos. Cada formato tem os estados estático, pensando e trabalhando; a cor do bot é aplicada ao contorno. Bots salvos com um corpo antigo mantêm o visual por um mapeamento, e imagens próprias continuam funcionando.",
        },
        {
          title: "Marca do Mimir em hexágono branco",
          body: "O ícone do app e da barra lateral agora usa o hexágono branco sobre o tile escuro do Mimir, acompanhando a linguagem dos novos formatos de agente.",
        },
        {
          title: "Cua Driver 0.62.1",
          body: "O controle do computador local passa a usar o Cua Driver 0.62.1 no macOS (universal), Windows x64 e Linux x64. O arquivo e cada membro que ele carrega foram medidos de novo a partir do release, e o SDK npm acompanha.",
        },
        {
          title: "Registros de conformidade regerados",
          body: "O SBOM, o relatório de licenças e os avisos foram refeitos com cargo-about 0.8.4 a partir do commit 3f69010c: 388 componentes de crates, dez componentes Cua e a fonte Inter embutida. O pacote Linux verifica a versão, os hashes e o registro do release novos.",
        },
      ],
      fixes: [
        "Os corpos antigos são mapeados para o formato novo mais próximo, então bots existentes não perdem o avatar.",
        "O controle do computador local aceita a versão nova do driver empacotado em vez de recusar todo turno com um pin antigo.",
        "O driver stub do smoke do pacote Linux e a checagem de metadados do smoke de X11 acompanham a versão nova.",
      ],
    },
  },
};

export default release;
