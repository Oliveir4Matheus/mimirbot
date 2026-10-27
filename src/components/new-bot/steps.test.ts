import { describe, expect, it } from "vitest";
import en from "@/locales/en.json";
import ptBr from "@/locales/pt-br.json";
import {
  ADVANCED_STEPS, BASIC_STEPS, REQUIRED_FIELDS, STEP_LABEL, STEP_SUBTITLE, advancedSteps, blockingStep, departmentsOf, flowOf, missingFields, missingIn,
  stepOfField, stepsFor,
} from "./steps";

const complete = { name: "Ada" };

describe("required fields", () => {
  it("asks only for a name, so a blank bot can still be shaped later with /setup", () => {
    expect(REQUIRED_FIELDS.map((item) => item.field)).toEqual(["name"]);
    expect(stepOfField("name")).toBe("identity");
  });

  it("names the field when it is blank or only whitespace", () => {
    expect(missingFields(complete)).toEqual([]);
    expect(missingFields({ name: "" })).toEqual(["name"]);
    expect(missingFields({ name: "  \n" })).toEqual(["name"]);
  });

  it("scopes the missing fields to one step", () => {
    expect(missingIn("identity", { name: "" })).toEqual(["name"]);
    expect(missingIn("essence", { name: "" })).toEqual([]);
    expect(missingIn("summary", { name: "" })).toEqual([]);
  });
});

describe("step order", () => {
  it("runs identity, permissions, soul, then a summary before anything advanced", () => {
    expect(stepsFor("basic", { withModel: true, defaultsMode: false })).toEqual([...BASIC_STEPS]);
    expect(stepsFor("advanced", { withModel: true, defaultsMode: false })).toEqual([...ADVANCED_STEPS]);
  });

  it("leaves the model step out of simple mode", () => {
    expect(advancedSteps(false)).not.toContain("model");
    expect(advancedSteps(true)).toContain("model");
    expect(stepsFor("advanced", { withModel: false, defaultsMode: false })).toEqual(["skills", "memory", "routines", "access", "voice"]);
  });

  it("chains every section, with no summary, when editing the defaults", () => {
    expect(stepsFor("basic", { withModel: false, defaultsMode: true })).toEqual(
      ["identity", "permissions", "essence", "skills", "memory", "routines", "access", "voice"],
    );
  });

  it("tells which flow a step belongs to", () => {
    expect(flowOf("summary")).toBe("basic");
    expect(flowOf("skills")).toBe("advanced");
    expect(flowOf("voice")).toBe("advanced");
  });
});

describe("opening a step ahead", () => {
  const steps = [...BASIC_STEPS];
  it("is blocked by the first earlier step that still lacks a field", () => {
    expect(blockingStep("summary", steps, { name: "" })).toBe("identity");
    expect(blockingStep("permissions", steps, { name: "" })).toBe("identity");
  });

  it("never blocks going back, staying put, or a complete draft", () => {
    expect(blockingStep("identity", steps, { name: "" })).toBeNull();
    expect(blockingStep("summary", steps, complete)).toBeNull();
  });
});

describe("departments", () => {
  it("merges the saved departments with the ones bots already sit in, without blanks or repeats", () => {
    expect(departmentsOf(["Sales", "Legal"], [{ section: "Legal" }, { section: "Ops" }, { section: "" }, {}])).toEqual(["Sales", "Legal", "Ops"]);
    expect(departmentsOf(undefined, [])).toEqual([]);
  });
});

describe("step copy", () => {
  it("exists in English and in Portuguese for every step", () => {
    for (const key of [...Object.values(STEP_LABEL), ...Object.values(STEP_SUBTITLE)]) {
      expect(en, key).toHaveProperty([key]);
      expect(ptBr, key).toHaveProperty([key]);
    }
  });
});
