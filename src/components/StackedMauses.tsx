import { Users } from "lucide-react";
import type { Bot } from "@/state/store";
import type { SidebarDensity } from "@/lib/sidebar-preferences";
import { BotAvatar } from "./Avatar";

export function StackedMauses({ members, density, large = false, size }: { members: Bot[]; density: SidebarDensity; large?: boolean; size?: number }) {
  const iconOnly = density === "icons";
  const slotSize = size ?? (iconOnly ? 48 : large ? 36 : density === "compact" ? 28 : 32);
  const singleSize = size ?? (iconOnly ? 44 : large ? 36 : density === "compact" ? 26 : 32);
  const shown = members.slice(0, 2);
  const extra = members.length - shown.length;
  if (size !== undefined) {
    const member = members[0];
    if (members.length <= 1) {
      return (
        <div className="flex shrink-0 items-center justify-center" style={{ width: slotSize, height: slotSize }}>
          {member ? <BotAvatar bot={member} state="happy" size={singleSize} animated={false} /> : <Users size={Math.round(slotSize * 0.7)} className="text-ink-secondary" />}
        </div>
      );
    }
    const stacked = Math.round(slotSize * 0.6);
    const overlap = Math.round(slotSize * 0.18);
    return (
      <div className="relative flex shrink-0 items-center justify-center" style={{ width: slotSize, height: slotSize }}>
        <span className="flex items-center">
          {shown.map((member, index) => (
            <span key={member.id} style={{ marginLeft: index === 0 ? 0 : -overlap, zIndex: shown.length - index }}>
              <BotAvatar bot={member} state="happy" size={stacked} animated={false} />
            </span>
          ))}
        </span>
      </div>
    );
  }
  if (members.length <= 1) {
    const b = members[0];
    return (
      <div className="flex shrink-0 items-center justify-center" style={{ width: slotSize, height: slotSize }}>
        {b ? <BotAvatar bot={b} state="happy" size={singleSize} animated={false} /> : <Users size={24} className="text-ink-secondary" />}
      </div>
    );
  }
  return (
    <div className="flex shrink-0 items-center justify-center" style={{ width: slotSize, height: slotSize }}>
      <div className="flex items-center -space-x-2.5">
        {shown.map((b) => (
          <BotAvatar key={b.id} bot={b} state="happy" size={iconOnly ? 30 : large ? 26 : 20} animated={false} />
        ))}
        {extra > 0 && (
          <span className="z-10 flex size-4 items-center justify-center rounded-full border border-hairline/40 bg-raised text-[9px] font-medium text-ink-secondary">
            +{extra}
          </span>
        )}
      </div>
    </div>
  );
}
