// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PluginRemovalDialog } from "./PluginRemovalDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

function renderDialog() {
  host = window.document.createElement("div");
  window.document.body.append(host);
  root = createRoot(host);
  const onCancel = vi.fn();
  const onConfirm = vi.fn();

  act(() => {
    root?.render(
      <PluginRemovalDialog pluginName="Realce Python" onCancel={onCancel} onConfirm={onConfirm} />,
    );
  });

  return { onCancel, onConfirm };
}

function buttonByLabel(label: string): HTMLButtonElement | undefined {
  return [...window.document.querySelectorAll("button")].find((button) => button.textContent === label);
}

describe("PluginRemovalDialog", () => {
  it("destaca o nome do plugin na mensagem de remoção", () => {
    renderDialog();
    expect(window.document.querySelector("strong")?.textContent).toBe("Realce Python");
    expect(window.document.body.textContent).toContain("será desativado e removido da aplicação");
  });

  it("encaminha confirmação e cancelamento", () => {
    const { onCancel, onConfirm } = renderDialog();
    act(() => {
      buttonByLabel("Remover")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onConfirm).toHaveBeenCalledOnce();

    act(() => {
      buttonByLabel("Cancelar")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
