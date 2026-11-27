import { useEffect, useRef, useState } from "react";

import type { Workflow } from "../../../shared/skill-burger/format";
import { t } from "@/lib/i18n";
import { readBurger, runBurger, type BurgerRunResult, type SavedWorkflow } from "@/lib/skill-burger";
import { Dialog, DIALOG_BUTTON, PrimaryButton } from "../workflows/Dialog";

const FIELD = "mt-1 w-full rounded-lg border border-hairline bg-control px-2 py-1.5 text-[12px] text-ink disabled:opacity-60";

const defaultText = (value: unknown): string => (typeof value === "string" ? value : value === undefined || value === null ? "" : JSON.stringify(value));

const preview = (value: unknown): string => {
  if (value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 240 ? `${text.slice(0, 239)}…` : text;
};

type Phase =
  | { state: "loading" }
  | { state: "form"; workflow: Workflow }
  | { state: "running"; workflow: Workflow }
  | { state: "done"; workflow: Workflow; result: BurgerRunResult }
  | { state: "error"; message: string };

/** Run: a small dialog over a saved burger's args, prefilled from the run it was saved from. With no args it starts at
 * once, so one click runs it. The result lists each step and where it stopped. */
export function RunBurger({ skill, botId, threadId, onClose }: {
  skill: SavedWorkflow;
  botId: string;
  threadId: string;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ state: "loading" });
  const [values, setValues] = useState<Record<string, string>>({});
  const started = useRef(false);

  useEffect(() => {
    let current = true;
    void readBurger(skill.name).then((found) => {
      if (!current) return;
      if (!found) {
        setPhase({ state: "error", message: t("skillBurger.run.missing") });
        return;
      }
      setValues(Object.fromEntries(Object.entries(found.workflow.args).map(([name, arg]) => [name, defaultText(arg.default)])));
      setPhase({ state: "form", workflow: found.workflow });
    });
    return () => { current = false; };
  }, [skill.name]);

  const submit = async (workflow: Workflow) => {
    setPhase({ state: "running", workflow });
    try {
      const result = await runBurger(skill.name, { botId, threadId, args: values });
      setPhase({ state: "done", workflow, result });
    } catch (cause) {
      setPhase({ state: "error", message: cause instanceof Error && cause.message ? cause.message : t("skillBurger.run.failed") });
    }
  };

  const empty = phase.state === "form" && Object.keys(phase.workflow.args).length === 0;
  useEffect(() => {
    if (phase.state !== "form" || started.current || Object.keys(phase.workflow.args).length > 0) return;
    started.current = true;
    const workflow = phase.workflow;
    const args = Object.fromEntries(Object.entries(workflow.args).map(([name, arg]) => [name, defaultText(arg.default)]));
    setPhase({ state: "running", workflow });
    void runBurger(skill.name, { botId, threadId, args })
      .then((result) => setPhase({ state: "done", workflow, result }))
      .catch((cause: unknown) => setPhase({ state: "error", message: cause instanceof Error && cause.message ? cause.message : t("skillBurger.run.failed") }));
  }, [phase, skill.name, botId, threadId]);

  const title = t("skillBurger.run.title", { name: skill.summary });
  const busy = phase.state === "loading" || phase.state === "running";

  return (
    <Dialog
      title={title}
      onClose={busy ? () => undefined : onClose}
      actions={<button type="button" className={DIALOG_BUTTON} onClick={onClose} disabled={phase.state === "running"}>{t("common.close")}</button>}
    >
      {phase.state === "loading" && <p role="status">{t("skills.loading")}</p>}
      {phase.state === "error" && <p role="alert" className="text-danger">{phase.message}</p>}
      {phase.state === "running" && <p role="status">{t("skillBurger.run.running")}</p>}
      {phase.state === "form" && (
        <>
          <p>{t("skillBurger.run.hint")}</p>
          {Object.entries(phase.workflow.args).map(([name, arg]) => (
            <label key={name} htmlFor={`burger-arg-${name}`} className="mt-3 block">
              <span className="block text-[11px] font-semibold text-ink-secondary">{arg.label ?? name}</span>
              <input
                id={`burger-arg-${name}`}
                value={values[name] ?? ""}
                onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))}
                className={FIELD}
              />
            </label>
          ))}
          {!empty && (
            <div className="mt-6 flex justify-end">
              <PrimaryButton onClick={() => void submit(phase.workflow)}>{t("skillBurger.run.button")}</PrimaryButton>
            </div>
          )}
        </>
      )}
      {phase.state === "done" && (
        <>
          <p role="status" className={phase.result.ok ? "text-success" : "text-danger"}>
            {phase.result.ok ? t("skillBurger.run.done") : phase.result.error?.message ?? t("skillBurger.run.failed")}
          </p>
          <ol aria-label={t("skillBurger.layers")} className="mt-3 space-y-1.5">
            {phase.result.steps.map((step) => (
              <li key={step.id} data-run-step={step.state} className="rounded-lg border border-hairline/40 px-2.5 py-1.5">
                <span className="flex items-center gap-2 text-[12px] font-medium">
                  <span className={step.state === "done" ? "text-success" : step.state === "failed" ? "text-danger" : "text-ink-tertiary"}>
                    {step.state === "done" ? "✓" : step.state === "failed" ? "✕" : "–"}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{step.label}</span>
                </span>
                {step.error && <p className="mt-0.5 truncate text-[11px] text-danger" title={step.error}>{step.error}</p>}
                {step.output !== undefined && <p className="mt-0.5 truncate font-mono text-[11px] text-ink-tertiary" title={preview(step.output)}>{preview(step.output)}</p>}
              </li>
            ))}
          </ol>
        </>
      )}
    </Dialog>
  );
}
