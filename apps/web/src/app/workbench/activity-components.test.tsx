// @vitest-environment jsdom
import * as Tooltip from "@radix-ui/react-tooltip";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityDropTarget } from "../activity-layout";
import { FixedActivitySlot, MovableActivityButton, type PluginActivityButton } from "./activity-components";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * A activity bar reordena por pointer events justamente para nunca abrir uma
 * sessão de arrasto nativa (ver `useActivityReorder`). Estes testes exercitam
 * o gesto completo com eventos de ponteiro reais do DOM: clique continua
 * clique, arrasto só começa depois do limiar, o destino é lido do DOM e o
 * cancelamento não dispara o botão.
 */

const terminal: PluginActivityButton = {
  key: "toolWindow:terminal",
  defaultOrder: 3_000,
  movable: true,
  id: "terminal",
  kind: "toolWindow",
  label: "Terminal",
};

const docker: PluginActivityButton = {
  key: "toolWindow:docker",
  defaultOrder: 2_000,
  movable: true,
  id: "docker",
  kind: "toolWindow",
  label: "Docker",
};

interface Harness {
  readonly root: ReturnType<typeof createRoot>;
  readonly host: HTMLDivElement;
  readonly onActivate: ReturnType<typeof vi.fn>;
  readonly onMove: ReturnType<typeof vi.fn>;
  readonly onDragStateChange: ReturnType<typeof vi.fn>;
  render(state?: { draggingKey?: string; dropTarget?: ActivityDropTarget }): void;
}

let harness: Harness | undefined;

const capture = {
  captured: new Map<Element, number>(),
};

function installPointerCapture() {
  Object.defineProperty(Element.prototype, "setPointerCapture", {
    configurable: true,
    value(this: Element, pointerId: number) { capture.captured.set(this, pointerId); },
  });
  Object.defineProperty(Element.prototype, "hasPointerCapture", {
    configurable: true,
    value(this: Element, pointerId: number) { return capture.captured.get(this) === pointerId; },
  });
  Object.defineProperty(Element.prototype, "releasePointerCapture", {
    configurable: true,
    value(this: Element, pointerId: number) {
      if (capture.captured.get(this) !== pointerId) return;
      capture.captured.delete(this);
      this.dispatchEvent(new Event("lostpointercapture", { bubbles: true }));
    },
  });
}

function pointer(type: string, target: Element, init: { x: number; y: number; button?: number; pointerId?: number }) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.x,
    clientY: init.y,
    button: init.button ?? 0,
    buttons: type === "pointerup" ? 0 : 1,
  });
  Object.defineProperty(event, "pointerId", { value: init.pointerId ?? 1 });
  Object.defineProperty(event, "isPrimary", { value: true });
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

function click(target: Element) {
  act(() => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
  });
}

function createHarness(): Harness {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onActivate = vi.fn();
  const onMove = vi.fn();
  const onDragStateChange = vi.fn();
  const render = (state: { draggingKey?: string; dropTarget?: ActivityDropTarget } = {}) => {
    act(() => {
      root.render(
        <Tooltip.Provider>
        <aside data-activity-bar="left">
          <MovableActivityButton
            item={docker}
            side="left"
            active={false}
            dragging={state.draggingKey === docker.key}
            dragActive={Boolean(state.draggingKey)}
            {...(state.dropTarget ? { dropTarget: state.dropTarget } : {})}
            onActivate={() => {}}
            onMove={onMove}
            onDragStateChange={onDragStateChange}
          />
          <MovableActivityButton
            item={terminal}
            side="left"
            active={false}
            dragging={state.draggingKey === terminal.key}
            dragActive={Boolean(state.draggingKey)}
            {...(state.dropTarget ? { dropTarget: state.dropTarget } : {})}
            onActivate={onActivate}
            onMove={onMove}
            onDragStateChange={onDragStateChange}
          />
          <FixedActivitySlot
            itemKey="builtin:left-spacer"
            side="left"
            spacer
            {...(state.draggingKey ? { draggingKey: state.draggingKey } : {})}
            {...(state.dropTarget ? { dropTarget: state.dropTarget } : {})}
            onMove={onMove}
            onDragStateChange={onDragStateChange}
          />
        </aside>
        </Tooltip.Provider>,
      );
    });
  };
  render();
  return { root, host, onActivate, onMove, onDragStateChange, render };
}

function slot(key: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-activity-key="${key}"]`);
  if (!element) throw new Error(`slot ${key} não renderizado`);
  return element;
}

function button(key: string): HTMLButtonElement {
  const element = slot(key).querySelector<HTMLButtonElement>("button");
  if (!element) throw new Error(`botão ${key} não renderizado`);
  return element;
}

function placeSlotsVertically() {
  const keys = ["toolWindow:docker", "toolWindow:terminal", "builtin:left-spacer"];
  keys.forEach((key, index) => {
    const top = index * 36;
    slot(key).getBoundingClientRect = () => ({
      x: 0, y: top, top, left: 0, width: 36, height: 36, right: 36, bottom: top + 36, toJSON() {},
    }) as DOMRect;
  });
  document.elementFromPoint = (x: number, y: number) => {
    if (x < 0 || x > 36 || y < 0) return null;
    const index = Math.floor(y / 36);
    const key = keys[index];
    return key ? slot(key) : document.querySelector("[data-activity-bar]");
  };
}

beforeEach(() => {
  installPointerCapture();
  harness = createHarness();
  placeSlotsVertically();
});

afterEach(() => {
  act(() => harness?.root.unmount());
  harness?.host.remove();
  harness = undefined;
  capture.captured.clear();
});

describe("activity bar reorder by pointer", () => {
  it("renders slots without native drag and with the attributes the gesture reads", () => {
    const element = slot(terminal.key);
    expect(element.getAttribute("draggable")).toBeNull();
    expect(element.dataset.activitySide).toBe("left");
    expect(document.querySelector("[data-activity-bar='left']")).not.toBeNull();
  });

  it("keeps a click (even a trembling one) as a click and never reports a drag", () => {
    const target = button(terminal.key);
    pointer("pointerdown", target, { x: 18, y: 54 });
    pointer("pointermove", target, { x: 20, y: 57 });
    pointer("pointerup", target, { x: 20, y: 57 });
    click(target);
    expect(harness?.onActivate).toHaveBeenCalledTimes(1);
    expect(harness?.onDragStateChange).not.toHaveBeenCalled();
    expect(harness?.onMove).not.toHaveBeenCalled();
    expect(capture.captured.size).toBe(0);
  });

  it("starts the drag past the threshold, captures the pointer and reports the target under it", () => {
    const target = button(terminal.key);
    pointer("pointerdown", target, { x: 18, y: 54 });
    pointer("pointermove", target, { x: 18, y: 20 });
    expect(capture.captured.get(slot(terminal.key))).toBe(1);
    expect(harness?.onDragStateChange).toHaveBeenLastCalledWith(terminal.key, {
      side: "left",
      key: docker.key,
      placeAfter: true,
    });

    harness?.render({ draggingKey: terminal.key, dropTarget: { side: "left", key: docker.key, placeAfter: true } });
    expect(slot(terminal.key).classList.contains("is-dragging")).toBe(true);
    expect(slot(docker.key).classList.contains("is-drop-after")).toBe(true);

    // Mesmo destino: nenhum novo relato; metade de cima do docker: antes dele.
    const calls = harness?.onDragStateChange.mock.calls.length ?? 0;
    pointer("pointermove", slot(terminal.key), { x: 18, y: 30 });
    expect(harness?.onDragStateChange.mock.calls.length).toBe(calls);
    pointer("pointermove", slot(terminal.key), { x: 18, y: 10 });
    expect(harness?.onDragStateChange).toHaveBeenLastCalledWith(terminal.key, {
      side: "left",
      key: docker.key,
      placeAfter: false,
    });

    pointer("pointerup", slot(terminal.key), { x: 18, y: 10 });
    expect(harness?.onMove).toHaveBeenCalledWith(terminal.key, "left", docker.key, false);
    expect(harness?.onDragStateChange).toHaveBeenLastCalledWith();
    expect(capture.captured.size).toBe(0);

    // O clique que o navegador sintetiza nasce no slot capturado, não no botão.
    click(slot(terminal.key));
    expect(harness?.onActivate).not.toHaveBeenCalled();
  });

  it("drops on the spacer as a move relative to it and on empty bar space as the end of that bar", () => {
    const target = button(terminal.key);
    pointer("pointerdown", target, { x: 18, y: 54 });
    pointer("pointermove", target, { x: 18, y: 80 });
    pointer("pointerup", slot(terminal.key), { x: 18, y: 100 });
    expect(harness?.onMove).toHaveBeenLastCalledWith(terminal.key, "left", "builtin:left-spacer", true);

    pointer("pointerdown", target, { x: 18, y: 54 });
    pointer("pointermove", target, { x: 18, y: 80 });
    pointer("pointerup", slot(terminal.key), { x: 18, y: 500 });
    expect(harness?.onMove).toHaveBeenLastCalledWith(terminal.key, "left", undefined, true);
  });

  it("cancels when released outside any bar, on pointercancel and on lost capture", () => {
    const target = button(terminal.key);
    pointer("pointerdown", target, { x: 18, y: 54 });
    pointer("pointermove", target, { x: 18, y: 80 });
    pointer("pointerup", slot(terminal.key), { x: 400, y: 80 });
    expect(harness?.onMove).not.toHaveBeenCalled();
    expect(harness?.onDragStateChange).toHaveBeenLastCalledWith();

    pointer("pointerdown", target, { x: 18, y: 54 });
    pointer("pointermove", target, { x: 18, y: 80 });
    pointer("pointercancel", slot(terminal.key), { x: 18, y: 80 });
    expect(harness?.onMove).not.toHaveBeenCalled();
    expect(harness?.onDragStateChange).toHaveBeenLastCalledWith();
    expect(capture.captured.size).toBe(0);

    pointer("pointerdown", target, { x: 18, y: 54 });
    pointer("pointermove", target, { x: 18, y: 80 });
    capture.captured.clear();
    pointer("lostpointercapture", slot(terminal.key), { x: 18, y: 80 });
    expect(harness?.onMove).not.toHaveBeenCalled();
    expect(harness?.onDragStateChange).toHaveBeenLastCalledWith();
  });

  it("cancels with Escape while keeping the pointer captured so the release never activates the button", () => {
    const target = button(terminal.key);
    pointer("pointerdown", target, { x: 18, y: 54 });
    pointer("pointermove", target, { x: 18, y: 80 });
    harness?.render({ draggingKey: terminal.key, dropTarget: { side: "left", key: "builtin:left-spacer", placeAfter: true } });

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    expect(harness?.onDragStateChange).toHaveBeenLastCalledWith();
    expect(capture.captured.get(slot(terminal.key))).toBe(1);

    pointer("pointermove", slot(terminal.key), { x: 18, y: 10 });
    pointer("pointerup", slot(terminal.key), { x: 18, y: 10 });
    click(slot(terminal.key));
    expect(harness?.onMove).not.toHaveBeenCalled();
    expect(harness?.onActivate).not.toHaveBeenCalled();
    expect(capture.captured.size).toBe(0);
  });

  it("ignores secondary buttons and spacer slots as drag sources", () => {
    pointer("pointerdown", button(terminal.key), { x: 18, y: 54, button: 2 });
    pointer("pointermove", button(terminal.key), { x: 18, y: 90 });
    pointer("pointerdown", slot("builtin:left-spacer"), { x: 18, y: 80 });
    pointer("pointermove", slot("builtin:left-spacer"), { x: 18, y: 10 });
    expect(harness?.onDragStateChange).not.toHaveBeenCalled();
    expect(capture.captured.size).toBe(0);
  });

  it("still reorders by keyboard with Alt and the arrows", () => {
    const target = button(terminal.key);
    act(() => {
      target.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", altKey: true, bubbles: true, cancelable: true }));
    });
    expect(harness?.onMove).toHaveBeenLastCalledWith(terminal.key, "left", docker.key, false);
    act(() => {
      target.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", altKey: true, bubbles: true, cancelable: true }));
    });
    expect(harness?.onMove).toHaveBeenLastCalledWith(terminal.key, "right");
  });
});
