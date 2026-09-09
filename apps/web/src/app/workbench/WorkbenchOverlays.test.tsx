// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { WorkbenchConfirmRequest } from "@tinyide/plugin-api";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkbenchSharedOverlays, type WorkbenchSharedOverlaysProps } from "./WorkbenchOverlays";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

function renderOverlays(overrides: Partial<WorkbenchSharedOverlaysProps> = {}) {
  host = window.document.createElement("div");
  window.document.body.append(host);
  root = createRoot(host);
  const handlers = {
    onDialogChange: vi.fn(),
    onContextMenuDismiss: vi.fn(),
    onContextMenuExecute: vi.fn(),
    onDismissPluginNotification: vi.fn(),
    onDismissError: vi.fn(),
    onResolveConfirm: vi.fn(),
  };

  act(() => {
    root?.render(
      <WorkbenchSharedOverlays
        dialog={undefined}
        contextMenuRef={{ current: null }}
        workspaceName="workspace"
        contextMenuDisabled={false}
        pluginNotification={undefined}
        error={undefined}
        confirmRequest={undefined}
        {...handlers}
        {...overrides}
      />,
    );
  });

  return handlers;
}

describe("WorkbenchSharedOverlays", () => {
  it("fica inerte quando nenhum overlay está ativo", () => {
    renderOverlays();
    expect(window.document.querySelector(".error-toast")).toBeNull();
    expect(window.document.querySelector(".profile-removal-dialog")).toBeNull();
  });

  it("distingue o toast de notificação de plugin do toast de erro genérico", () => {
    const { onDismissError, onDismissPluginNotification } = renderOverlays({
      pluginNotification: "plugin falhou",
      error: "erro geral",
    });

    const toasts = [...window.document.querySelectorAll(".error-toast")];
    expect(toasts).toHaveLength(2);
    const pluginToast = window.document.querySelector('.error-toast[data-source="plugin-notification"]');
    expect(pluginToast?.textContent).toContain("plugin falhou");

    act(() => {
      pluginToast?.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onDismissPluginNotification).toHaveBeenCalledOnce();
    expect(onDismissError).not.toHaveBeenCalled();
  });

  it("encaminha a resolução da confirmação de plugin", () => {
    const request: WorkbenchConfirmRequest = { title: "Continuar?", message: "Ação irreversível." };
    const { onResolveConfirm } = renderOverlays({ confirmRequest: request });

    const dialog = window.document.querySelector(".profile-removal-dialog");
    expect(dialog?.textContent).toContain("Ação irreversível.");

    const confirm = [...dialog?.querySelectorAll("button") ?? []]
      .find((button) => button.textContent === "Confirmar");
    act(() => {
      confirm?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onResolveConfirm).toHaveBeenCalledWith(true);
  });
});
