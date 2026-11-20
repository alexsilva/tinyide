// @vitest-environment jsdom
import { act } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkbenchTitlebar, type WorkbenchTitlebarProps } from "./WorkbenchTitlebar";
import type { WorkbenchStateApi } from "@tinyide/plugin-api";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

describe("WorkbenchTitlebar project menu", () => {
  it("always offers an empty project and dispatches the selected active provider", () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const onCreateProject = vi.fn();
    const props = {
      workspaceName: "Workspace",
      recentProjects: [],
      fileCreationOptions: [],
      profiles: { profiles: [], selectedId: undefined },
      selectedProfile: undefined,
      selectedProfileRunning: false,
      selectedProfileDebuggable: false,
      selectedProfileDebugging: false,
      busy: false,
      pageReloading: false,
      contributions: [],
      workbenchState: {} as WorkbenchStateApi,
      projectTypes: [{ id: "react", name: "React", description: "Vite", scaffold: async () => undefined }],
      onProjectMenuOpen: vi.fn(),
      onCreateProject,
      onOpenProject: vi.fn(),
      onOpenRecentProject: vi.fn(),
      onNewDocument: vi.fn(),
      onOpenFile: vi.fn(),
      onSave: vi.fn(),
      canFormatDocument: false,
      onFormatDocument: vi.fn(),
      onOpenSettings: vi.fn(),
      onOpenAbout: vi.fn(),
      onSelectProfile: vi.fn(),
      onManageProfiles: vi.fn(),
      onRunProfile: vi.fn(),
      onDebugProfile: vi.fn(),
      onReload: vi.fn(),
    } as unknown as WorkbenchTitlebarProps;

    act(() => root?.render(
      <Tooltip.Provider><WorkbenchTitlebar {...props} /></Tooltip.Provider>,
    ));
    const projectTrigger = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Projeto"));
    expect(projectTrigger).toBeDefined();
    act(() => projectTrigger?.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true})));

    const createTrigger = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .find((item) => item.textContent?.includes("Criar projeto"));
    expect(createTrigger).toBeDefined();
    act(() => createTrigger?.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowRight", bubbles: true})));

    const submenuItems = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    expect(submenuItems.map((item) => item.textContent?.trim())).toContain("Projeto vazio");
    expect(submenuItems.map((item) => item.textContent?.trim())).toContain("React");
    act(() => submenuItems.find((item) => item.textContent?.trim() === "Projeto vazio")?.click());
    expect(onCreateProject).toHaveBeenCalledWith(undefined);
  });
});
