import { describe, expect, it } from "vitest";

import { authoringIssues, proposalErrorMessage, rehearsalIssues } from "./proposal-errors";

describe("proposal error messages", () => {
  it("keeps every authoring path and message", () => {
    expect(authoringIssues([
      { path: "steps.0.mode", message: "a manual step must collect a value" },
      { path: "steps.1.outputs.0.path", message: "needs a file extension" },
    ])).toEqual([
      { path: "steps.0.mode", message: "a manual step must collect a value" },
      { path: "steps.1.outputs.0.path", message: "needs a file extension" },
    ]);
  });

  it("turns only diverged rehearsal steps into issues, keeping the real detail", () => {
    expect(rehearsalIssues({
      at: 1,
      status: "diverged",
      steps: [
        { id: "baixar", name: "Baixar", label: "diverged", detail: "exit 1 · TypeError: boom" },
        { id: "revisar", name: "Revisar", label: "untested", detail: "needs the bot engine" },
      ],
    })).toEqual([{ path: "steps.0", message: "Baixar: exit 1 · TypeError: boom" }]);
    expect(rehearsalIssues({ at: 1, status: "passed", steps: [] })).toEqual([]);
    expect(rehearsalIssues(undefined)).toEqual([]);
  });

  it("builds the message the bot receives from the real list, never an example", () => {
    const message = proposalErrorMessage("authoring", "Cobrança mensal", [
      { path: "steps.0.mode", message: "a manual step must collect a value" },
    ]);
    expect(message).toContain("Cobrança mensal");
    expect(message).toContain("- steps.0.mode: a manual step must collect a value");
    expect(message).not.toContain("example");
  });
});
