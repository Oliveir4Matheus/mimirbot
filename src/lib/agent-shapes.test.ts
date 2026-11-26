import { describe, expect, it } from "vitest";
import { AGENT_SHAPE_STROKE_WIDTH, thickenAgentShapeSvg } from "./agent-shapes";

const sample = '<svg color="#000000"><path fill="currentColor" fill-rule="evenodd" d="M0 0Z"/></svg>';

describe("agent shape stroke", () => {
  it("adds the +4 outline stroke and keeps the even-odd fill", () => {
    const thick = thickenAgentShapeSvg(sample);
    expect(AGENT_SHAPE_STROKE_WIDTH).toBe(4);
    expect(thick).toContain('stroke="currentColor"');
    expect(thick).toContain('stroke-width="4"');
    expect(thick).toContain('stroke-linejoin="round"');
    expect(thick).toContain('fill="currentColor"');
    expect(thick).toContain('fill-rule="evenodd"');
    expect(thick).toContain('d="M0 0Z"');
  });

  it("does not add a second stroke when it is applied again", () => {
    const once = thickenAgentShapeSvg(sample);
    expect(thickenAgentShapeSvg(once)).toBe(once);
  });
});
