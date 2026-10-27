import type { Bot } from "@/state/store";
import type { LocaleKey } from "@/locales";

export const BASIC_STEPS = ["identity", "permissions", "essence", "summary"] as const;
export const ADVANCED_STEPS = ["skills", "memory", "routines", "access", "model", "voice"] as const;

export type BasicStep = (typeof BASIC_STEPS)[number];
export type AdvancedStep = (typeof ADVANCED_STEPS)[number];
export type NewBotStep = BasicStep | AdvancedStep;

export type RequiredField = "name";

/** A title and instructions stay optional: a blank bot is shaped later with /setup. */
export const REQUIRED_FIELDS: ReadonlyArray<{ field: RequiredField; step: BasicStep }> = [
  { field: "name", step: "identity" },
];

export const STEP_LABEL: Record<NewBotStep, LocaleKey> = {
  identity: "botSettings.sections.identity",
  permissions: "botSettings.sections.permissions",
  essence: "botSettings.sections.soul",
  summary: "newBot.step.summary",
  skills: "botSettings.sections.skills",
  memory: "botSettings.sections.memory",
  routines: "botSettings.sections.routines",
  access: "botSettings.sections.access",
  model: "botSettings.sections.model",
  voice: "botSettings.sections.voice",
};

export const STEP_SUBTITLE: Record<NewBotStep, LocaleKey> = {
  identity: "newBot.step.identity.subtitle",
  permissions: "newBot.step.permissions.subtitle",
  essence: "newBot.step.essence.subtitle",
  summary: "newBot.step.summary.subtitle",
  skills: "newBot.step.skills.subtitle",
  memory: "newBot.step.memory.subtitle",
  routines: "newBot.step.routines.subtitle",
  access: "newBot.step.access.subtitle",
  model: "newBot.step.model.subtitle",
  voice: "newBot.step.voice.subtitle",
};

type Profile = Pick<Bot, "name">;

const filled = (bot: Profile, field: RequiredField): boolean => bot[field].trim() !== "";

export const stepOfField = (field: RequiredField): BasicStep => REQUIRED_FIELDS.find((item) => item.field === field)!.step;

export const missingFields = (bot: Profile): RequiredField[] =>
  REQUIRED_FIELDS.filter(({ field }) => !filled(bot, field)).map(({ field }) => field);

export const missingIn = (step: NewBotStep, bot: Profile): RequiredField[] =>
  REQUIRED_FIELDS.filter((item) => item.step === step && !filled(bot, item.field)).map(({ field }) => field);

export const advancedSteps = (withModel: boolean): AdvancedStep[] =>
  ADVANCED_STEPS.filter((step) => step !== "model" || withModel);

export type StepFlow = "basic" | "advanced";

/** Editing the defaults for new bots has nothing to create or review, so every section is one run of steps. */
export function stepsFor(flow: StepFlow, options: { withModel: boolean; defaultsMode: boolean }): NewBotStep[] {
  const advanced = advancedSteps(options.withModel);
  if (options.defaultsMode) return [...BASIC_STEPS.filter((step) => step !== "summary"), ...advanced];
  return flow === "basic" ? [...BASIC_STEPS] : advanced;
}

/** A step is checked only once the person has been on it and moved on, and, in the basic flow, only when it lacks nothing required. */
export const stepDone = (options: { showBadges: boolean; defaultsMode: boolean; lacking: number; seen: boolean }): boolean =>
  options.seen && !options.defaultsMode && (!options.showBadges || options.lacking === 0);

export const flowOf = (step: NewBotStep): StepFlow => (ADVANCED_STEPS as readonly string[]).includes(step) ? "advanced" : "basic";

/** The first step that still lacks a required field before `target`, or null when `target` can be opened. */
export function blockingStep(target: NewBotStep, steps: readonly NewBotStep[], bot: Profile): BasicStep | null {
  const upTo = steps.indexOf(target);
  for (const step of steps.slice(0, Math.max(0, upTo))) {
    if (missingIn(step, bot).length) return step as BasicStep;
  }
  return null;
}

export function departmentsOf(sections: readonly string[] | undefined, bots: ReadonlyArray<Pick<Bot, "section">>): string[] {
  return [...new Set([...(sections ?? []), ...bots.map((bot) => bot.section ?? "")])].filter(Boolean);
}
