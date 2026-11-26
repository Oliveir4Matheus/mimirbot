/** The eight minimalist agent shapes shipped in `public/agent-shapes/`. */
export const AGENT_SHAPE_IDS = [
  "seixo-compacto",
  "seixo-alongado",
  "seixo-organico",
  "quadrado-macio",
  "squircle",
  "circle",
  "drop",
  "hexagon",
] as const;

export type AgentShapeId = (typeof AGENT_SHAPE_IDS)[number];

export const DEFAULT_AGENT_SHAPE: AgentShapeId = "seixo-compacto";

export const AGENT_SHAPE_NAMES: Record<AgentShapeId, string> = {
  "seixo-compacto": "Seixo compacto",
  "seixo-alongado": "Seixo alongado",
  "seixo-organico": "Seixo orgânico",
  "quadrado-macio": "Quadrado macio",
  squircle: "Squircle",
  circle: "Circle",
  drop: "Drop",
  hexagon: "Hexagon",
};

/** Persisted bots still carry the old body ids; keep their chosen look when rendering. */
const LEGACY_SHAPE: Record<string, AgentShapeId> = {
  cursor: "seixo-compacto",
  blob: "seixo-organico",
  circle: "circle",
  squircle: "squircle",
  capsule: "seixo-alongado",
  drop: "drop",
  shield: "quadrado-macio",
  hexagon: "hexagon",
  diamond: "seixo-organico",
  star: "seixo-compacto",
};

export function agentShapeForBody(value: unknown): AgentShapeId {
  if (typeof value === "string") {
    if ((AGENT_SHAPE_IDS as readonly string[]).includes(value)) return value as AgentShapeId;
    return LEGACY_SHAPE[value] ?? DEFAULT_AGENT_SHAPE;
  }
  return DEFAULT_AGENT_SHAPE;
}
