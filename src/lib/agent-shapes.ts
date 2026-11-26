import type { MausState } from "@/lib/mascot";
export {
  AGENT_SHAPE_IDS,
  AGENT_SHAPE_NAMES,
  DEFAULT_AGENT_SHAPE,
  agentShapeForBody,
  type AgentShapeId,
} from "../../shared/agent-shapes";

export type AgentShapeState = "estatico" | "pensando" | "trabalhando";

const WORKING_STATES: ReadonlySet<MausState> = new Set([
  "working",
  "loading",
  "writing",
  "sending",
  "receiving",
  "uploading",
  "dictating",
  "alerting",
  "notifying",
  "celebrate",
]);

const THINKING_STATES: ReadonlySet<MausState> = new Set([
  "thinking",
  "searching",
  "listening",
  "curious",
  "confused",
]);

export function agentShapeState(state: MausState | undefined, animated: boolean): AgentShapeState {
  if (!animated) return "estatico";
  if (state && WORKING_STATES.has(state)) return "trabalhando";
  if (state && THINKING_STATES.has(state)) return "pensando";
  return "estatico";
}

export function agentShapeAsset(shape: string, state: AgentShapeState): string {
  return `/agent-shapes/${shape}/${state}.svg`;
}

/** The preview flag is set by `?agentShapes=1` and remembered for the session. */
export function agentShapesPreview(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("agentShapes");
    if (requested === "1" || requested === "0") {
      window.localStorage.setItem("omb-agent-shapes", requested);
      return requested === "1";
    }
    return window.localStorage.getItem("omb-agent-shapes") !== "0";
  } catch {
    return false;
  }
}
