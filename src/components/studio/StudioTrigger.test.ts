// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioTriggerCard, StudioTriggerInspector } from "./StudioTrigger";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let roots: Root[] = [];

function draw(node: ReturnType<typeof createElement>) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => { root.render(node); });
  return container;
}

const click = (node: Element) => {
  act(() => { node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); });
};

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  roots = [];
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("the trigger card", () => {
  it("names the trigger, its kind and opens the inspector", () => {
    const onOpen = vi.fn();
    const container = draw(createElement(StudioTriggerCard, {
      trigger: { id: "manual", kind: "manual", name: "Manual" },
      point: { x: 0, y: 0 },
      selected: false,
      invalid: false,
      onOpen,
    }));
    const card = container.querySelector<HTMLButtonElement>(".studio-trigger-card")!;
    expect(card.getAttribute("aria-label")).toContain("Manual");
    expect(card.textContent).toContain("Manual");
    click(card);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("marks a webhook without configuration and a configured routine", () => {
    const webhook = draw(createElement(StudioTriggerCard, {
      trigger: { id: "hook", kind: "webhook", name: "Pedidos" },
      point: { x: 0, y: 0 },
      selected: false,
      invalid: true,
      onOpen: () => {},
    }));
    expect(webhook.querySelector(".studio-trigger-chip")?.textContent).toBe("Set up");
    expect(webhook.querySelector(".studio-trigger-node-invalid")).not.toBeNull();

    const routine = draw(createElement(StudioTriggerCard, {
      trigger: { id: "daily", kind: "routine", name: "Diária", routineId: "rtn-1" },
      point: { x: 0, y: 0 },
      selected: true,
      invalid: false,
      onOpen: () => {},
    }));
    expect(routine.querySelector(".studio-trigger-chip")?.textContent).toBe("Configured");
    expect(routine.querySelector(".studio-trigger-node-selected")).not.toBeNull();
  });

  it("shows a configured webhook and its pinned version beside the current one", () => {
    const container = draw(createElement(StudioTriggerCard, {
      trigger: { id: "hook", kind: "webhook", name: "Pedidos" },
      point: { x: 0, y: 0 },
      selected: false,
      invalid: false,
      currentVersion: 5,
      runtime: {
        id: "trigger-1", workflowId: "wf", workflowVersion: 3, workflowName: "Pedidos", department: "Financeiro",
        name: "Pedidos pagos", endpointId: "wfw_aaaaaaaaaaaaaaaa", inputs: {}, enabled: true, deliveryCount: 0,
        createdAt: 1, updatedAt: 1,
      },
      onOpen: () => {},
    }));
    expect(container.querySelector(".studio-trigger-chip")?.textContent).toBe("Configured");
    expect(container.querySelector(".studio-trigger-kind")?.textContent).toContain("v3 → v5");
  });
});

describe("the trigger inspector", () => {
  const trigger = { id: "hook", kind: "webhook" as const, name: "Pedidos" };

  it("renames and switches the segmented type", () => {
    const onChange = vi.fn();
    const container = draw(createElement(StudioTriggerInspector, {
      trigger,
      count: 2,
      onChange,
      onDelete: () => {},
      onClose: () => {},
    }));
    const input = container.querySelector<HTMLInputElement>(".studio-input")!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "Pedidos pagos");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith({ name: "Pedidos pagos" });
    const routine = [...container.querySelectorAll<HTMLButtonElement>(".studio-trigger-segment-item")].find((button) => button.textContent?.includes("Routine"))!;
    expect(routine.getAttribute("aria-pressed")).toBe("false");
    click(routine);
    expect(onChange).toHaveBeenCalledWith({ kind: "routine" });
  });

  it("disables deletion of the last trigger and explains it", () => {
    const onDelete = vi.fn();
    const container = draw(createElement(StudioTriggerInspector, {
      trigger,
      count: 1,
      onChange: () => {},
      onDelete,
      onClose: () => {},
    }));
    const remove = container.querySelector<HTMLButtonElement>(".studio-trigger-delete")!;
    expect(remove.disabled).toBe(true);
    const describedBy = remove.getAttribute("aria-describedby")!;
    expect(container.querySelector(`#${describedBy}`)?.textContent).toContain("at least one trigger");
    click(remove);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("opens the webhook form, or explains that the Workflow needs a first save", () => {
    const container = draw(createElement(StudioTriggerInspector, {
      trigger,
      count: 2,
      onChange: () => {},
      onDelete: () => {},
      onClose: () => {},
    }));
    const configure = container.querySelector<HTMLButtonElement>(".studio-trigger-config-ready")!;
    expect(configure.disabled).toBe(false);
    click(configure);
    expect(container.querySelector(".studio-wfw-panel")?.textContent).toContain("Save the Workflow once");
  });

  it("deletes a trigger that is not the last one", () => {
    const onDelete = vi.fn();
    const container = draw(createElement(StudioTriggerInspector, {
      trigger,
      count: 2,
      onChange: () => {},
      onDelete,
      onClose: () => {},
    }));
    click(container.querySelector(".studio-trigger-delete")!);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
