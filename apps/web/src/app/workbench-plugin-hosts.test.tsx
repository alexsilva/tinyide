// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  WorkbenchExecutionViewProvider,
  WorkbenchExecutionViewTarget,
  WorkbenchSidebarContribution,
  WorkbenchStateApi,
  WorkbenchToolWindowContribution,
} from "@tinyide/plugin-api";
import {
  ExecutionViewHost,
  WorkbenchSidebarHost,
  WorkbenchToolWindowHost,
} from "./workbench-plugin-hosts";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;

const state = {} as WorkbenchStateApi;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

function render(element: React.ReactNode): void {
  if (!host) {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  }
  act(() => root?.render(element));
}

describe("workbench plugin hosts", () => {
  it("keeps sidebar plugin content mounted when only onClose changes", () => {
    const dispose = vi.fn();
    const mount = vi.fn(({ container }: { container: HTMLElement }) => {
      const input = document.createElement("input");
      input.value = "estado do plugin";
      container.append(input);
      return { dispose };
    });
    const provider = {
      id: "plugin.sidebar",
      pluginId: "plugin",
      label: "Plugin",
      mount,
    } as WorkbenchSidebarContribution;

    render(<WorkbenchSidebarHost provider={provider} state={state} onClose={() => undefined} />);
    const input = host?.querySelector("input");
    input?.focus();
    render(<WorkbenchSidebarHost provider={provider} state={state} onClose={() => undefined} />);

    expect(mount).toHaveBeenCalledTimes(1);
    expect(host?.querySelector("input")).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(dispose).not.toHaveBeenCalled();
  });

  it("keeps tool window mounted when callbacks change and disposes once on unmount", () => {
    const dispose = vi.fn();
    const mount = vi.fn(({ container }: { container: HTMLElement }) => {
      const marker = document.createElement("span");
      marker.textContent = "terminal persistente";
      container.append(marker);
      return { dispose };
    });
    const provider = {
      id: "plugin.tool-window",
      pluginId: "plugin",
      label: "Terminal",
      mount,
    } as WorkbenchToolWindowContribution;

    render(
      <WorkbenchToolWindowHost
        provider={provider}
        state={state}
        visible
        height={240}
        onClose={() => undefined}
        onResize={() => undefined}
        onResetHeight={() => undefined}
      />,
    );
    const marker = host?.querySelector("span");
    render(
      <WorkbenchToolWindowHost
        provider={provider}
        state={state}
        visible
        height={260}
        onClose={() => undefined}
        onResize={() => undefined}
        onResetHeight={() => undefined}
      />,
    );

    expect(mount).toHaveBeenCalledTimes(1);
    expect(host?.querySelector("span")).toBe(marker);
    act(() => root?.unmount());
    root = undefined;
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("keeps an execution tab view mounted while the same profile tab stays open", () => {
    const dispose = vi.fn();
    const mount = vi.fn(({ container }: { container: HTMLElement }) => {
      const marker = document.createElement("span");
      marker.textContent = "árvore de testes";
      container.append(marker);
      return { dispose };
    });
    const provider = {
      id: "pytest-execution-view",
      pluginId: "tinyide.pytest",
      canRender: () => true,
      mount,
    } as unknown as WorkbenchExecutionViewProvider;
    const target: WorkbenchExecutionViewTarget = { profileId: "pytest", profileName: "Pytest", mode: "run" };

    render(<ExecutionViewHost provider={provider} target={target} state={state} />);
    const marker = host?.querySelector("span");
    // Nova identidade do target a cada render do App não deve remontar a visão.
    render(<ExecutionViewHost provider={provider} target={{ ...target }} state={state} />);

    expect(mount).toHaveBeenCalledTimes(1);
    expect(host?.querySelector("span")).toBe(marker);
    expect(host?.querySelector("[data-execution-view-provider='pytest-execution-view']")).not.toBeNull();

    render(<ExecutionViewHost provider={provider} target={{ ...target, profileId: "outro" }} state={state} />);
    expect(mount).toHaveBeenCalledTimes(2);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
