import { describe, expect, it } from "vitest";

import { AGENT_SHAPE_IDS, DEFAULT_AGENT_SHAPE } from "./agent-shapes.ts";
import { BOT_BODY_IDS, COSTUME_FOR_COLOR, botBodyId, botBodySchema, isHalloweenBody } from "./bot-body.ts";
import { HALLOWEEN_BODY_IDS } from "./halloween-bodies.ts";
import { MASCOT_BODY_IDS } from "./mascot-bodies.ts";
import { MAUS_COLOR_NAMES } from "./wire.ts";

describe("bot bodies", () => {
  it("accepts every shape, legacy body and Halloween body", () => {
    expect(BOT_BODY_IDS).toEqual([...AGENT_SHAPE_IDS, ...MASCOT_BODY_IDS, ...HALLOWEEN_BODY_IDS]);
    for (const id of BOT_BODY_IDS) expect(botBodySchema.safeParse(id).success).toBe(true);
  });

  it("falls back to the default shape for anything it does not know", () => {
    expect(botBodyId("pumpkin")).toBe("pumpkin");
    expect(botBodyId("star")).toBe("star");
    expect(botBodyId("hexagram")).toBe(DEFAULT_AGENT_SHAPE);
    expect(botBodyId(undefined)).toBe(DEFAULT_AGENT_SHAPE);
  });

  it("tells the Halloween bodies apart", () => {
    expect(isHalloweenBody("ghost")).toBe(true);
    expect(isHalloweenBody("cursor")).toBe(false);
    expect(isHalloweenBody(null)).toBe(false);
  });

  it("gives every bot colour but silver and chrome its own costume", () => {
    const dressed = MAUS_COLOR_NAMES.filter((color) => color !== "silver" && color !== "chrome");
    expect(Object.keys(COSTUME_FOR_COLOR).sort()).toEqual([...dressed].sort());
    expect(new Set(Object.values(COSTUME_FOR_COLOR)).size).toBe(dressed.length);
    for (const body of Object.values(COSTUME_FOR_COLOR)) expect(isHalloweenBody(body)).toBe(true);
  });
});
