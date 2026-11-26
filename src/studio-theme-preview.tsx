// Dev-only preview of the Workflow Studio surface across skins, served at
// /studio-theme-preview.html?skin=midnight&lang=pt-br
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowLeft, Check, Moon, Sun } from "lucide-react";
import { StudioPalette } from "@/components/studio/StudioPalette";
import { setLocale, t } from "@/lib/i18n";
import { SKIN_IDS, type SkinId } from "@/lib/skins";
import "./styles.css";

const query = new URLSearchParams(location.search);
setLocale(query.get("lang") ?? "en");
const initialSkin: SkinId = SKIN_IDS.includes(query.get("skin") as SkinId) ? (query.get("skin") as SkinId) : "midnight";

function Preview() {
  const [skin, setSkin] = useState<SkinId>(initialSkin);
  document.documentElement.dataset.skin = skin;
  return (
    <div className="flex h-dvh flex-col bg-app text-ink">
      <div className="flex items-center justify-between border-b border-hairline px-4 py-2 text-[12px] text-ink-secondary">
        <span>Studio theme preview</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setSkin("midnight")} className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-raised">
            <Moon size={13} aria-hidden /> midnight
          </button>
          <button type="button" onClick={() => setSkin("daylight")} className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-raised">
            <Sun size={13} aria-hidden /> daylight
          </button>
        </div>
      </div>
      <div className="studio-root">
        <div className="studio-canvas" style={{ backgroundSize: "24px 24px", backgroundPosition: "12px 12px" }}>
          <div className="studio-bar">
            <span className="studio-back"><ArrowLeft size={13} aria-hidden /> {t("studio.back")}</span>
            <span className="studio-name">{t("studio.untitled")}</span>
            <span className="studio-department">{t("studio.department")} <span>General</span></span>
            <span className="studio-bar-spacer" />
            <span className="studio-dirty">{t("studio.unsaved")}</span>
            <span className="studio-save"><Check size={12} aria-hidden /> {t("studio.save")}</span>
          </div>
          <div className="studio-world" style={{ inset: "60px 0 0" }}>
            <div className="studio-node studio-node-bot" style={{ left: 360, top: 96, width: 300 }}>
              <div className="studio-card">
                <div className="studio-card-head">
                  <span className="studio-card-icon" style={{ background: "color-mix(in srgb, var(--studio-node-bot) 16%, var(--color-card))", color: "var(--studio-node-bot)" }}>
                    <Check size={18} aria-hidden />
                  </span>
                  <div className="studio-card-title">
                    <span className="studio-card-name">{t("studio.palette.agent")}</span>
                    <span className="studio-card-category">AI AGENT</span>
                  </div>
                </div>
                <div className="studio-card-divider" />
                <div className="studio-card-foot">
                  <span className="studio-status-dot" />
                  <span className="studio-card-status">Ready</span>
                  <span className="studio-card-id">N1</span>
                </div>
              </div>
            </div>
            <div className="studio-node studio-node-condition" style={{ left: 360, top: 300, width: 300 }}>
              <div className="studio-card">
                <div className="studio-card-head">
                  <span className="studio-card-icon" style={{ background: "color-mix(in srgb, var(--studio-node-condition) 16%, var(--color-card))", color: "var(--studio-node-condition)" }}>
                    <Check size={18} aria-hidden />
                  </span>
                  <div className="studio-card-title">
                    <span className="studio-card-name">{t("studio.palette.condition")}</span>
                    <span className="studio-card-category">CONDITIONAL</span>
                  </div>
                </div>
                <div className="studio-card-divider" />
                <div className="studio-card-foot">
                  <span className="studio-status-dot" />
                  <span className="studio-card-status">Ready</span>
                  <span className="studio-card-id">N2</span>
                </div>
              </div>
            </div>
          </div>
          <StudioPalette onActivate={() => {}} onDrop={() => {}} />
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
