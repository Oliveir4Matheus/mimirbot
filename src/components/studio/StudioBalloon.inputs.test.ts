// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WorkflowStep } from "../../../shared/workflow";
import { StudioBalloon, formatPreparedAt, type BalloonEnvironment } from "./StudioBalloon";
import { createStep, newDraft, updateStep, type StudioDraft } from "./studio-model";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const anchor = { left: 100, top: 100, width: 240, height: 112, right: 340, bottom: 212 } as DOMRect;

let roots: Root[] = [];

function script(id: string, outputs: Array<{ path: string; required: boolean }>): WorkflowStep {
  return {
    id, kind: "script", name: "Preparar", run: `${id}.mjs`, timeoutMs: 60_000, mode: "auto", modules: [],
    inputs: [], parameters: [], outputs, onSuccess: null,
  } as WorkflowStep;
}

function botStep(id: string, parameters: unknown[] = []): WorkflowStep {
  return {
    id, kind: "bot", name: "Montar", botId: "bot-a", timeoutMs: 0, mode: "auto",
    instructions: "Monte o material.", inputs: [], parameters, outputs: [{ path: "result.txt", required: true }], onSuccess: null,
  } as WorkflowStep;
}

function draw(draft: StudioDraft, step: WorkflowStep, branch: Parameters<typeof StudioBalloon>[0]["branch"], extra: Partial<Parameters<typeof StudioBalloon>[0]> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const onChange = vi.fn();
  const onOpenInputs = vi.fn();
  const onPrepareEnvironment = vi.fn();
  act(() => {
    root.render(createElement(StudioBalloon, {
      draft,
      step,
      branch,
      anchor,
      bots: [{ id: "bot-a", name: "A" }],
      scripts: {},
      onChange,
      onScript: () => {},
      onRenameScript: () => {},
      onToast: () => {},
      onDisconnect: () => {},
      onOpenInputs,
      onClose: () => {},
      onPrepareEnvironment,
      ...extra,
    }));
  });
  return { container, onChange, onOpenInputs, onPrepareEnvironment };
}

const click = (node: Element) => {
  act(() => { node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); });
};

const change = (node: HTMLInputElement, value: string) => {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  roots = [];
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("the Inputs balloon", () => {
  it("shows documents and parameters in one balloon and blocks a document read by a parameter", () => {
    let draft = { ...newDraft("Financeiro"), name: "Fluxo" };
    draft = createStep(draft, "script", { x: 100, y: 100 }).draft;
    const source = draft.steps[0]!;
    draft = updateStep(draft, source.id, { outputs: [{ path: "trechos.json", required: true, shape: { type: "object" } }] } as never);
    draft = createStep(draft, "agent", { x: 600, y: 100 }, "bot-a").draft;
    const consumer = draft.steps[1]!;
    draft = updateStep(draft, consumer.id, {
      parameters: [{ name: "clips", type: "string", list: false, required: true, from: { step: source.id, output: "trechos.json", field: "clips" } }],
    } as never);

    const { container } = draw(draft, draft.steps[1]!, "context");
    const text = container.textContent ?? "";
    expect(text).toContain("Documents");
    expect(text).toContain("Parameters");
    expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Inputs");

    const documentCheckbox = container.querySelector<HTMLInputElement>(".studio-doc-list input[type=checkbox]")!;
    expect(documentCheckbox.disabled).toBe(true);
    expect(text).toContain("Already read by the parameter “clips” in this step");
    expect(container.querySelector(".studio-doc-list label")?.getAttribute("title"))
      .toBe("One value travels as a document or as a parameter, never both.");

    expect(container.querySelector<HTMLInputElement>('[data-studio-field="parameters.0.name"]')?.value).toBe("clips");
    expect(container.querySelector<HTMLSelectElement>('[data-studio-field="parameters.0.from.step"]')?.value).toBe(source.id);
    expect(container.querySelector<HTMLSelectElement>('[data-studio-field="parameters.0.from.output"]')?.value).toBe("trechos.json");
    expect(container.querySelector<HTMLInputElement>('[data-studio-field="parameters.0.from.field"]')?.value).toBe("clips");
    expect(container.querySelector('[data-studio-field="parameters.0.origin"]')?.getAttribute("aria-pressed")).toBe("true");

    const controls = [...container.querySelectorAll<HTMLElement>("input,select,textarea,button")];
    const position = (selector: string) => controls.indexOf(container.querySelector<HTMLElement>(selector)!);
    expect(position(".studio-doc-list input")).toBeLessThan(position('[data-studio-field="parameters.add"]'));
    expect(position('[data-studio-field="parameters.add"]')).toBeLessThan(position('[data-studio-field="parameters.0.name"]'));
    expect(position('[data-studio-field="parameters.0.name"]')).toBeLessThan(position('[data-studio-field="parameters.0.type"]'));
    expect(position('[data-studio-field="parameters.0.type"]')).toBeLessThan(position('[data-studio-field="parameters.0.list"]'));
    expect(position('[data-studio-field="parameters.0.list"]')).toBeLessThan(position('[data-studio-field="parameters.0.origin"]'));
    expect(position('[data-studio-field="parameters.0.origin"]')).toBeLessThan(position('[data-studio-field="parameters.0.from.step"]'));
  });

  it("adds a parameter and focuses its name", () => {
    const draft = { ...newDraft("Financeiro"), name: "Fluxo" };
    const step = botStep("montar");
    const withStep = { ...draft, steps: [step] };
    const { container, onChange } = draw(withStep, step, "context");
    click(container.querySelector('[data-studio-field="parameters.add"]')!);
    expect(onChange).toHaveBeenCalledWith({ parameters: [expect.objectContaining({ name: "valor", type: "string", required: true })] });

    const updated = { ...withStep, steps: [{ ...step, parameters: [{ name: "valor", type: "string", list: false, required: true }] } as WorkflowStep] };
    const focused = draw(updated, updated.steps[0]!, "context", { focus: { field: "parameters.0.name", token: 1 } });
    expect(document.activeElement).toBe(focused.container.querySelector('[data-studio-field="parameters.0.name"]'));
    expect(document.activeElement?.classList.contains("studio-field-focus")).toBe(true);
  });

  it("labels the input error with aria-describedby and reports a repeated name", () => {
    const draft = { ...newDraft("Financeiro"), name: "Fluxo" };
    const step = botStep("montar", [
      { name: "total", type: "integer", list: false, required: true },
      { name: "total", type: "string", list: false, required: true },
    ]);
    const withStep = { ...draft, steps: [step] };
    const { container } = draw(withStep, step, "context");
    const input = container.querySelector<HTMLInputElement>('[data-studio-field="parameters.1.name"]')!;
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const describedBy = input.getAttribute("aria-describedby")!;
    expect(container.querySelector(`#${describedBy}`)?.textContent).toContain("Name repeated.");
  });
});

describe("the condition balloon", () => {
  it("picks the source step and its .json output, so an authoring error can land on a control", () => {
    let draft = { ...newDraft("Financeiro"), name: "Fluxo" };
    draft = createStep(draft, "script", { x: 100, y: 100 }).draft;
    const source = draft.steps[0]!;
    draft = updateStep(draft, source.id, { name: "Preparar", outputs: [{ path: "dados.json", required: true, shape: { type: "object" } }] } as never);
    draft = createStep(draft, "condition", { x: 600, y: 100 }).draft;
    const condition = draft.steps[1]!;

    const { container, onChange } = draw(draft, condition, "condition");
    const stepSelect = container.querySelector<HTMLSelectElement>('[data-studio-field="from"]')!;
    expect([...stepSelect.options].map((option) => option.textContent)).toContain("Preparar");
    act(() => {
      stepSelect.value = source.id;
      stepSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith({ from: { step: source.id, output: "dados.json" } });

    const updated = updateStep(draft, condition.id, { from: { step: source.id, output: "dados.json" } } as never);
    const focused = draw(updated, updated.steps[1]!, "condition", { focus: { field: "from.output", token: 1 } });
    expect(document.activeElement).toBe(focused.container.querySelector('[data-studio-field="from.output"]'));
  });
});

describe("the manual step in the Run balloon", () => {
  it("warns when the step collects nothing and creates the collected parameter", () => {
    const draft = { ...newDraft("Financeiro"), name: "Fluxo" };
    const step = { ...botStep("montar"), mode: "manual" } as WorkflowStep;
    const withStep = { ...draft, steps: [step] };
    const { container, onChange, onOpenInputs } = draw(withStep, step, "run");

    expect(container.textContent).toContain("This manual step collects no value");
    expect(container.textContent).toContain("Manual means receiving a value from the person before it runs.");
    expect(container.querySelector('[data-studio-field="mode"]')?.getAttribute("aria-describedby")).toBe("studio-manual-warning");

    click(container.querySelector(".studio-callout-action")!);
    expect(onChange).toHaveBeenCalledWith({
      parameters: [expect.objectContaining({ collectedBy: "montar", required: true })],
    });
    expect(onOpenInputs).toHaveBeenCalledWith("parameters.0.name");
  });

  it("hides the warning once the step collects a parameter", () => {
    const draft = { ...newDraft("Financeiro"), name: "Fluxo" };
    const step = {
      ...botStep("montar", [{ name: "valor", type: "string", list: false, required: true, collectedBy: "montar" }]),
      mode: "manual",
    } as WorkflowStep;
    const withStep = { ...draft, steps: [step] };
    const { container } = draw(withStep, step, "run");
    expect(container.textContent).not.toContain("This manual step collects no value");
  });
});

describe("outputs", () => {
  it("reports a missing extension, applies the suggestion and toggles required", () => {
    const draft = { ...newDraft("Financeiro"), name: "Fluxo" };
    const step = script("preparar", [{ path: "link", required: true }]);
    const withStep = { ...draft, steps: [step] };
    const { container, onChange } = draw(withStep, step, "output");

    expect(container.textContent).toContain("“link” is missing an extension.");
    const input = container.querySelector<HTMLInputElement>('[data-studio-field="outputs.0.path"]')!;
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).not.toBeNull();

    click(container.querySelector(".studio-suggestion")!);
    expect(onChange).toHaveBeenCalledWith({ outputs: [{ path: "link.txt", required: true }] });

    const required = container.querySelector<HTMLInputElement>('[data-studio-field="outputs.0.required"]')!;
    expect(required.checked).toBe(true);
    click(required);
    expect(onChange).toHaveBeenCalledWith({ outputs: [{ path: "link", required: false }] });
  });

  it("opens the shape disclosure for a .json and warns when a later step reads it without one", () => {
    const draft = { ...newDraft("Financeiro"), name: "Fluxo" };
    const step = script("preparar", [{ path: "trechos.json", required: true }]);
    const withStep = { ...draft, steps: [step] };
    const consumed = new Set([`preparar\u0000trechos.json`]);
    const { container } = draw(withStep, step, "output", { consumed });

    expect(container.querySelector<HTMLDetailsElement>(".studio-shape")?.open).toBe(true);
    expect(container.textContent).toContain("This file is read later and still declares no shape.");
  });

  it("changes a path in place", () => {
    const draft = { ...newDraft("Financeiro"), name: "Fluxo" };
    const step = script("preparar", [{ path: "link.txt", required: true }]);
    const withStep = { ...draft, steps: [step] };
    const { container, onChange } = draw(withStep, step, "output");
    change(container.querySelector<HTMLInputElement>('[data-studio-field="outputs.0.path"]')!, "link.md");
    expect(onChange).toHaveBeenCalledWith({ outputs: [{ path: "link.md", required: true }] });
  });
});

describe("modules and the environment badge", () => {
  const moduleDraft = () => {
    const draft = { ...newDraft("Financeiro"), name: "Fluxo" };
    const step = { ...script("preparar", [{ path: "result.txt", required: true }]), modules: [{ name: "faster-whisper", runtime: "python", version: "1.2.1" }] } as WorkflowStep;
    const withStep = { ...draft, steps: [step] };
    return { withStep, step };
  };

  it("edits a module's runtime and version", () => {
    const { withStep, step } = moduleDraft();
    const { container, onChange } = draw(withStep, step, "script");
    expect(container.querySelector<HTMLInputElement>('[data-studio-field="modules.0.version"]')?.value).toBe("1.2.1");
    const runtime = container.querySelector<HTMLSelectElement>('[data-studio-field="modules.0.runtime"]')!;
    act(() => {
      runtime.value = "bin";
      runtime.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith({ modules: [{ name: "faster-whisper", runtime: "bin" }] });
  });

  it("reflects each environment state and prepares from the badge", () => {
    const { withStep, step } = moduleDraft();
    const notPrepared: BalloonEnvironment = { prepared: false, stale: false, changed: 0, declared: 1 };
    const first = draw(withStep, step, "script", { environment: notPrepared });
    expect(first.container.textContent).toContain("Environment not prepared");
    click(first.container.querySelector(".studio-env-action")!);
    expect(first.onPrepareEnvironment).toHaveBeenCalledOnce();

    const prepared: BalloonEnvironment = { prepared: true, stale: false, preparedAt: new Date(2026, 10, 16, 9, 5).getTime(), changed: 0, declared: 1 };
    const second = draw(withStep, step, "script", { environment: prepared });
    expect(second.container.textContent).toContain("Prepared on 16/11 · 09:05");
    expect(second.container.querySelector(".studio-env-action")).toBeNull();

    const stale: BalloonEnvironment = { ...prepared, stale: true, changed: 2 };
    const third = draw(withStep, step, "script", { environment: stale });
    expect(third.container.textContent).toContain("2 modules changed");

    const fourth = draw(withStep, step, "script", { environment: prepared, preparingEnvironment: true });
    expect(fourth.container.textContent).toContain("Preparing…");
  });

  it("formats the prepared date as DD/MM · HH:MM", () => {
    expect(formatPreparedAt(new Date(2026, 10, 16, 9, 5).getTime())).toBe("16/11 · 09:05");
    expect(formatPreparedAt(new Date(2026, 0, 2, 23, 59).getTime())).toBe("02/01 · 23:59");
  });
});
