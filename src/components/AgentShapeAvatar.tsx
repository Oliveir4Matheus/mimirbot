import { useEffect, useMemo, useState } from "react";
import type { MausState } from "@/lib/mascot";
import { usePrefersReducedMotion } from "./mascot-clock";
import {
  agentShapeAsset,
  agentShapeState,
  thickenAgentShapeSvg,
  type AgentShapeId,
} from "@/lib/agent-shapes";

const rawCache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

function loadShape(url: string): Promise<string> {
  const cached = rawCache.get(url);
  if (cached) return Promise.resolve(cached);
  const inFlight = pending.get(url);
  if (inFlight) return inFlight;
  const request = fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`agent shape ${response.status}`);
      return response.text();
    })
    .then((text) => {
      rawCache.set(url, text);
      pending.delete(url);
      return text;
    })
    .catch((error) => {
      pending.delete(url);
      throw error;
    });
  pending.set(url, request);
  return request;
}

function paint(raw: string, color: string): string {
  return thickenAgentShapeSvg(raw)
    .replace(/<title>.*?<\/title>/s, "")
    .replace('color="#000000"', `color="${color}"`)
    .replace("<svg ", '<svg width="100%" height="100%" style="display:block" ');
}

export function AgentShapeAvatar({
  shapeId,
  state,
  size = 44,
  color = "#171428",
  animated = true,
  label,
}: {
  shapeId: AgentShapeId;
  state?: MausState;
  size?: number;
  color?: string;
  animated?: boolean;
  label?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const shapeState = agentShapeState(state, animated && !reduced);
  const url = agentShapeAsset(shapeId, shapeState);
  const [raw, setRaw] = useState<string | null>(() => rawCache.get(url) ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setFailed(false);
    loadShape(url)
      .then((text) => {
        if (live) setRaw(text);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [url]);

  const html = useMemo(() => (raw ? paint(raw, color) : ""), [raw, color]);

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size, color }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {html ? (
        <span style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <span
          aria-hidden="true"
          style={{
            width: Math.round(size * 0.72),
            height: Math.round(size * 0.72),
            borderRadius: "42%",
            border: `max(1px, ${Math.round(size * 0.055)}px) solid ${failed ? color : "transparent"}`,
          }}
        />
      )}
    </span>
  );
}
