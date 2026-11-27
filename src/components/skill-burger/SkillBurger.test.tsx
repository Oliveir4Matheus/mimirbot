import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { BurgerLayer } from "../../../shared/skill-burger/layers";
import { SkillBurger } from "./SkillBurger";

const layers: BurgerLayer[] = [
  { id: "s1", messageId: "a1", kind: "shell", tool: "shell", words: "mkdir -p out", status: "done", read: false, replay: "exact" },
  { id: "s2", messageId: "a2", kind: "file", tool: "Write", words: "hello.txt", status: "done", read: false, replay: "exact" },
];

const render = () => renderToStaticMarkup(
  <SkillBurger run="t1:a1" layers={layers} summary="make a hello file" canSave botId="b1" threadId="t1" onDismiss={() => undefined} />,
);

describe("the chat's Skill Burger card", () => {
  it("shows the summary, the ordered steps and the save button", () => {
    const html = render();
    expect(html).toContain("make a hello file");
    expect(html).toContain("2 steps");
    expect(html).toContain("Run mkdir -p out");
    expect(html).toContain("Write hello.txt");
    expect(html).toContain("Save as skill");
    expect(html).toContain("Dismiss");
  });

  it("disables the save button when the run has a step this version can't repeat", () => {
    const html = renderToStaticMarkup(
      <SkillBurger run="t1:a1" layers={layers} summary="make a hello file" canSave={false} botId="b1" threadId="t1" onDismiss={() => undefined} />,
    );
    expect(html).toContain("disabled");
    expect(html).toContain("This run has steps this version can&#x27;t repeat.");
  });
});
