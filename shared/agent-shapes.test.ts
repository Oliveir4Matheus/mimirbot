import { describe, expect, it } from "vitest";
import {
  AGENT_SHAPE_IDS,
  AGENT_SHAPE_NAMES,
  DEFAULT_AGENT_SHAPE,
  agentShapeForBody,
} from "./agent-shapes.ts";
import { MASCOT_BODY_IDS } from "./mascot-bodies.ts";

describe("agent shapes", () => {
  it("has a unique name for each of the eight shapes", () => {
    expect(AGENT_SHAPE_IDS).toHaveLength(8);
    expect(new Set(AGENT_SHAPE_IDS).size).toBe(AGENT_SHAPE_IDS.length);
    for (const id of AGENT_SHAPE_IDS) expect(AGENT_SHAPE_NAMES[id]).toBeTruthy();
  });

  it("maps every legacy body to a new shape", () => {
    for (const id of MASCOT_BODY_IDS) expect(AGENT_SHAPE_IDS).toContain(agentShapeForBody(id));
  });

  it("keeps new ids and falls back to the default", () => {
    for (const id of AGENT_SHAPE_IDS) expect(agentShapeForBody(id)).toBe(id);
    expect(agentShapeForBody("hexagram")).toBe(DEFAULT_AGENT_SHAPE);
    expect(agentShapeForBody(undefined)).toBe(DEFAULT_AGENT_SHAPE);
  });
});
