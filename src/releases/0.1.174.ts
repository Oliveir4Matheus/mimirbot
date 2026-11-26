import type { Release } from "@/lib/release-notes";

const release: Release = {
  version: "0.1.174",
  date: "2026-11-26",
  notes: {
    en: {
      lead: "The bundled Cua Driver moves to 0.62.1, with its third-party notices, licenses and SBOM regenerated from the exact upstream commit.",
      features: [
        {
          title: "Cua Driver 0.62.1",
          body: "Local computer control ships Cua Driver 0.62.1 on macOS (universal), Windows x64 and Linux x64. The archive and every member it carries were re-measured from the release, and the npm SDK moves with it.",
        },
        {
          title: "Regenerated compliance records",
          body: "The bundled SBOM, licence report and notices were rebuilt with cargo-about 0.8.4 from upstream commit 3f69010c: 388 crate components, ten Cua components and the embedded Inter font.",
        },
      ],
      fixes: [
        "Local computer control accepts the new bundled driver version instead of rejecting every turn with an outdated pin.",
      ],
    },
    "pt-br": {
      lead: "O Cua Driver empacotado passa para 0.62.1, com avisos de terceiros, licenças e SBOM regerados a partir do commit exato do upstream.",
      features: [
        {
          title: "Cua Driver 0.62.1",
          body: "O controle do computador local passa a usar o Cua Driver 0.62.1 no macOS (universal), Windows x64 e Linux x64. O arquivo e cada membro que ele carrega foram medidos de novo a partir do release, e o SDK npm acompanha.",
        },
        {
          title: "Registros de conformidade regerados",
          body: "O SBOM, o relatório de licenças e os avisos foram refeitos com cargo-about 0.8.4 a partir do commit 3f69010c: 388 componentes de crates, dez componentes Cua e a fonte Inter embutida.",
        },
      ],
      fixes: [
        "O controle do computador local aceita a versão nova do driver empacotado em vez de recusar todo turno com um pin antigo.",
      ],
    },
  },
};

export default release;
