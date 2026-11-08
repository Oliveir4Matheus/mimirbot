const COLORS = ["#7779BE", "#6F98AF", "#AD79AA", "#87986B", "#589B9C", "#A786C2", "#B7896A", "#7180A0"];

export function botColor(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) hash = (hash * 31 + name.charCodeAt(index)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length]!;
}

export function BotAvatar({ name, size = 16 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: botColor(name), fontSize: Math.round(size * 0.55) }}
    >
      {name.trim().slice(0, 1).toUpperCase() || "?"}
    </span>
  );
}
