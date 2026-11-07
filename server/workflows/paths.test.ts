import { describe, expect, it } from "vitest";

import {
  WORKFLOWS_ROOT_ENV,
  WORKFLOW_RUN_ID,
  departmentFolder,
  newWorkflowRunId,
  workflowRunPaths,
  workflowsRoot,
  stepDir,
  stepInputDir,
  stepOutputDir,
} from "./paths.ts";

const HOME = "/home/ana";
const WORKFLOW_ID = "8a5b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d";

describe("workflowsRoot", () => {
  it("is ~/MimirBot under the person's home", () => {
    expect(workflowsRoot({ home: HOME, env: {} })).toBe("/home/ana/MimirBot");
  });

  it("lets OMB_PROCESSES_ROOT win for tests and unusual installs", () => {
    expect(workflowsRoot({ home: HOME, env: { [WORKFLOWS_ROOT_ENV]: " /tmp/omb-runs " } })).toBe("/tmp/omb-runs");
  });

  it("ignores a blank override", () => {
    expect(workflowsRoot({ home: HOME, env: { [WORKFLOWS_ROOT_ENV]: "   " } })).toBe("/home/ana/MimirBot");
  });
});

describe("departmentFolder", () => {
  it("keeps an ordinary department name as its folder", () => {
    expect(departmentFolder("Financeiro")).toBe("Financeiro");
    expect(departmentFolder("General")).toBe("General");
  });

  it("keeps a name with spaces and accents as its folder", () => {
    expect(departmentFolder("Pesquisa & Desenvolvimento")).toBe("Pesquisa & Desenvolvimento");
    expect(departmentFolder("Operações")).toBe("Operações");
  });

  it("slugs a name the filesystem would refuse, with a hash of the original", () => {
    expect(departmentFolder("A/B")).toMatch(/^a-b-[0-9a-f]{8}$/);
    expect(departmentFolder("CON")).toMatch(/^con-[0-9a-f]{8}$/);
  });

  it("never lets two odd names share a folder", () => {
    expect(departmentFolder("A/B")).not.toBe(departmentFolder("A\\B"));
    expect(departmentFolder("...")).not.toBe(departmentFolder(".."));
  });

  it("refuses the names Windows reserves and trailing dots or spaces", () => {
    for (const name of ["CON", "con", "NUL", "COM1", "LPT9", ".", "..", "time.", "time "]) {
      expect(departmentFolder(name)).not.toBe(name);
    }
  });

  it("trims the name it keeps", () => {
    expect(departmentFolder("  Financeiro  ")).toBe("Financeiro");
  });
});

describe("newWorkflowRunId", () => {
  it("is sortable and matches the run id shape", () => {
    const id = newWorkflowRunId(new Date("2026-11-03T12:34:56.000Z").getTime(), "abcdef12-0000");
    expect(id).toBe("20261103-123456-abcdef");
    expect(WORKFLOW_RUN_ID.test(id)).toBe(true);
  });

  it("keeps two runs in the same second apart", () => {
    const now = new Date("2026-11-03T12:34:56.000Z").getTime();
    expect(newWorkflowRunId(now, "aaaaaa")).not.toBe(newWorkflowRunId(now, "bbbbbb"));
  });
});

describe("workflowRunPaths", () => {
  it("puts the run under the department, the workflow and the run id", () => {
    const paths = workflowRunPaths({
      home: HOME,
      env: {},
      department: "Financeiro",
      workflowId: WORKFLOW_ID,
      runId: "20261103-123456-abcdef",
    });
    expect(paths.departmentDir).toBe("/home/ana/MimirBot/Financeiro");
    expect(paths.workflowDir).toBe(`/home/ana/MimirBot/Financeiro/workflows/${WORKFLOW_ID}`);
    expect(paths.runsDir).toBe(`/home/ana/MimirBot/Financeiro/workflows/${WORKFLOW_ID}/runs`);
    expect(paths.runDir).toBe(`/home/ana/MimirBot/Financeiro/workflows/${WORKFLOW_ID}/runs/20261103-123456-abcdef`);
  });

  it("slugs a department folder the same way in every run", () => {
    const one = workflowRunPaths({ home: HOME, env: {}, department: "A/B", workflowId: WORKFLOW_ID, runId: "20261103-123456-abcdef" });
    const two = workflowRunPaths({ home: HOME, env: {}, department: "A/B", workflowId: WORKFLOW_ID, runId: "20261103-123457-abcdef" });
    expect(one.departmentDir).toBe(two.departmentDir);
  });

  it("keeps one folder for a uuid in either case", () => {
    const lower = workflowRunPaths({ home: HOME, env: {}, department: "General", workflowId: WORKFLOW_ID, runId: "20261103-123456-abcdef" });
    const upper = workflowRunPaths({ home: HOME, env: {}, department: "General", workflowId: WORKFLOW_ID.toUpperCase(), runId: "20261103-123457-abcdef" });
    expect(upper.workflowDir).toBe(lower.workflowDir);
  });

  it("refuses a workflow id or run id that could leave the folder", () => {
    for (const workflowId of ["../x", "a/b", "A B", "", "contrato-mensal"]) {
      expect(() => workflowRunPaths({ department: "General", workflowId, runId: "20261103-123456-abcdef" })).toThrow();
    }
    for (const runId of ["../escape", "run", "20261103-123456", "20261103-123456-ABCDEF"]) {
      expect(() => workflowRunPaths({ department: "General", workflowId: WORKFLOW_ID, runId })).toThrow();
    }
  });
});

describe("step folders", () => {
  it("numbers steps from one in workflow order", () => {
    expect(stepDir("/runs/one", 1)).toBe("/runs/one/step-1");
    expect(stepInputDir("/runs/one", 2)).toBe("/runs/one/step-2/input");
    expect(stepOutputDir("/runs/one", 2)).toBe("/runs/one/step-2/output");
  });

  it("refuses a number no workflow can have", () => {
    for (const number of [0, -1, 41, 1.5]) expect(() => stepDir("/runs/one", number)).toThrow();
  });
});
