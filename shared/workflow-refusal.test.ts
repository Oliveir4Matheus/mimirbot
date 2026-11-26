import { describe, expect, it } from "vitest";

import {
  WORKFLOW_REFUSAL_ISSUES_MAX,
  authoringRefusal,
  parseWorkflowRefusal,
  workflowRefusal,
} from "./workflow-refusal.ts";
import type { AuthoringIssue } from "./workflow-authoring.ts";

const issue = (index: number): AuthoringIssue => ({ path: `steps.${index}.mode`, message: `problem ${index}` });

describe("the WorkflowRefusal contract", () => {
  it("keeps every issue and a summary that names its path", () => {
    const refusal = authoringRefusal([issue(0), issue(1)], [{ path: "steps.0.inputs", message: "advice" }]);
    expect(refusal.code).toBe("authoringErrors");
    expect(refusal.authoring).toEqual({ errors: [issue(0), issue(1)], warnings: [{ path: "steps.0.inputs", message: "advice" }] });
    expect(refusal.error).toContain("steps.0.mode: problem 0");
    expect(refusal.error).toContain("steps.1.mode: problem 1");
  });

  it("caps the issues and counts the rest in both fields", () => {
    const many = Array.from({ length: WORKFLOW_REFUSAL_ISSUES_MAX + 3 }, (_value, index) => issue(index));
    const refusal = authoringRefusal(many);
    expect(refusal.authoring?.errors).toHaveLength(WORKFLOW_REFUSAL_ISSUES_MAX);
    expect(refusal.authoring?.truncated).toBe(3);
    expect(refusal.error).toContain("3 more problems were not shown");
  });

  it("reads a body that follows the contract and refuses one that does not", () => {
    const refusal = authoringRefusal([issue(0)]);
    expect(parseWorkflowRefusal(refusal)).toEqual(refusal);
    expect(parseWorkflowRefusal(workflowRefusal("needsConfirmation", "confirm first"))).toEqual({
      code: "needsConfirmation",
      error: "confirm first",
    });
    expect(parseWorkflowRefusal({ error: "no contract here" })).toBeUndefined();
    expect(parseWorkflowRefusal({ code: "other", error: "x" })).toBeUndefined();
    expect(parseWorkflowRefusal({ code: "authoringErrors", error: "x", authoring: { errors: [{ path: 1 }], warnings: [] } })).toBeUndefined();
    expect(parseWorkflowRefusal({ code: "authoringErrors", error: "x", authoring: { errors: [], warnings: [], truncated: -1 } })).toBeUndefined();
  });

  it("names a failed rehearsal as its own gate and no longer accepts an acknowledgement", () => {
    expect(parseWorkflowRefusal(workflowRefusal("needsRehearsal", "run the rehearsal first"))).toEqual({
      code: "needsRehearsal",
      error: "run the rehearsal first",
    });
    expect(parseWorkflowRefusal({ code: "needsAcknowledgement", error: "old body" })).toBeUndefined();
  });
});
