// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkbenchProblemsDock } from "./WorkbenchProblemsDock";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

function renderDock(visible: boolean, side: "left" | "right" = "right") {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const onResize = vi.fn();
  const onResetWidth = vi.fn();
  const onClose = vi.fn();

  act(() => {
    root?.render(
      <WorkbenchProblemsDock
        visible={visible}
        side={side}
        diagnostics={[{ line: 3, column: 5, message: "Falha", severity: "error" }]}
        onResize={onResize}
        onResetWidth={onResetWidth}
        onClose={onClose}
      />,
    );
  });

  return { onResize, onResetWidth, onClose };
}

describe("WorkbenchProblemsDock", () => {
  it("does not mount either grid participant while hidden", () => {
    renderDock(false);
    expect(host?.querySelector('[role="separator"]')).toBeNull();
    expect(host?.querySelector('[aria-label="Problemas"]')).toBeNull();
  });

  it("keeps the resize handle and panel coupled on the selected side", () => {
    const { onResize, onResetWidth, onClose } = renderDock(true, "left");
    const separator = host?.querySelector<HTMLElement>('[role="separator"]');
    const close = host?.querySelector<HTMLButtonElement>('[aria-label="Fechar problemas"]');

    expect(separator?.className).toContain("resize-handle--sidebar");
    expect(host?.querySelector(".problems-panel--left")).not.toBeNull();
    expect(host?.textContent).toContain("Falha");

    act(() => {
      separator?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      separator?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      close?.click();
    });

    expect(onResize).toHaveBeenCalledOnce();
    expect(onResetWidth).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
