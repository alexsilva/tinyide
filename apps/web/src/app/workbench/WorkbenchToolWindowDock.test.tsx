// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type {
  WorkbenchStateApi,
  WorkbenchToolWindowContribution,
} from "@tinyide/plugin-api";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkbenchToolWindowDock } from "./WorkbenchToolWindowDock";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = {} as WorkbenchStateApi;
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

function contribution(id: string, label: string, dispose: () => void): WorkbenchToolWindowContribution {
  return {
    id,
    pluginId: "test.plugin",
    label,
    mount({ container }) {
      const marker = document.createElement("span");
      marker.textContent = `${label} mounted`;
      container.append(marker);
      return { dispose };
    },
  };
}

function renderDock({
  mountedIds,
  visible = true,
  activeId = "terminal",
  canDetach = true,
}: {
  mountedIds: ReadonlySet<string>;
  visible?: boolean;
  activeId?: string;
  canDetach?: boolean;
}) {
  host ??= document.createElement("div");
  if (!host.isConnected) document.body.append(host);
  root ??= createRoot(host);
  const terminalDispose = vi.fn(() => undefined);
  const gitDispose = vi.fn(() => undefined);
  const terminal = contribution("terminal", "Terminal", terminalDispose);
  const git = contribution("git", "Git", gitDispose);
  const onDetach = vi.fn();
  const onClose = vi.fn();

  act(() => root?.render(
    <WorkbenchToolWindowDock
      toolWindows={[terminal, git]}
      mountedIds={mountedIds}
      state={state}
      visible={visible}
      activeId={activeId}
      height={240}
      viewRequest={undefined}
      canDetach={canDetach}
      onClose={onClose}
      onDetach={onDetach}
      onResize={() => undefined}
      onResetHeight={() => undefined}
    />,
  ));

  return { terminal, git, terminalDispose, gitDispose, onDetach, onClose };
}

describe("WorkbenchToolWindowDock", () => {
  it("mounts only retained tool windows and keeps inactive ones mounted but hidden", () => {
    renderDock({ mountedIds: new Set(["terminal", "git"]), activeId: "terminal" });

    const terminal = host?.querySelector<HTMLElement>('[data-tool-window-id="terminal"]');
    const git = host?.querySelector<HTMLElement>('[data-tool-window-id="git"]');
    expect(terminal).not.toBeNull();
    expect(git).not.toBeNull();
    expect(terminal?.classList.contains("tool-window-panel--hidden")).toBe(false);
    expect(git?.classList.contains("tool-window-panel--hidden")).toBe(true);
    expect(host?.textContent).toContain("Terminal mounted");
    expect(host?.textContent).toContain("Git mounted");
  });

  it("disposes only the released tool window and delegates detach with the exact provider", () => {
    const first = renderDock({ mountedIds: new Set(["terminal", "git"]), activeId: "terminal" });
    const detach = host?.querySelector<HTMLButtonElement>('[aria-label="Abrir Terminal em janela separada"]');

    act(() => detach?.click());
    expect(first.onDetach).toHaveBeenCalledWith(first.terminal);

    act(() => root?.render(
      <WorkbenchToolWindowDock
        toolWindows={[first.terminal, first.git]}
        mountedIds={new Set(["git"])}
        state={state}
        visible
        activeId="git"
        height={240}
        viewRequest={undefined}
        canDetach
        onClose={first.onClose}
        onDetach={first.onDetach}
        onResize={() => undefined}
        onResetHeight={() => undefined}
      />,
    ));

    expect(host?.querySelector('[data-tool-window-id="terminal"]')).toBeNull();
    expect(host?.querySelector('[data-tool-window-id="git"]')).not.toBeNull();
    expect(first.terminalDispose).toHaveBeenCalledOnce();
    expect(first.gitDispose).not.toHaveBeenCalled();
  });

  it("keeps retained plugin DOM mounted when only dock visibility changes", () => {
    const first = renderDock({ mountedIds: new Set(["terminal"]), visible: true });
    const marker = host?.querySelector('[data-panel-id="terminal"] span');

    act(() => root?.render(
      <WorkbenchToolWindowDock
        toolWindows={[first.terminal]}
        mountedIds={new Set(["terminal"])}
        state={state}
        visible={false}
        activeId="terminal"
        height={240}
        viewRequest={undefined}
        canDetach
        onClose={first.onClose}
        onDetach={first.onDetach}
        onResize={() => undefined}
        onResetHeight={() => undefined}
      />,
    ));

    expect(host?.querySelector('[data-panel-id="terminal"] span')).toBe(marker);
    expect(host?.querySelector('[data-tool-window-id="terminal"]')?.classList.contains("tool-window-panel--hidden")).toBe(true);
    expect(first.terminalDispose).not.toHaveBeenCalled();
  });
});
