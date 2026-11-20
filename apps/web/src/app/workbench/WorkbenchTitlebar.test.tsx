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
      onManageRecentProjects: vi.fn(),
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

  it("shows at most 8 recent projects and a 'Ver todos os projetos' action when more exist", () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const manyProjects = Array.from({ length: 12 }, (_, index) => ({
      id: `p-${index}`,
      name: `Project ${index}`,
      kind: "project" as const,
      path: `/home/user/project-${index}`,
      lastOpenedAt: index,
    }));
    const props = {
      workspaceName: "Workspace",
      recentProjects: manyProjects,
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
      projectTypes: [],
      onProjectMenuOpen: vi.fn(),
      onCreateProject: vi.fn(),
      onOpenProject: vi.fn(),
      onOpenRecentProject: vi.fn(),
      onManageRecentProjects: vi.fn(),
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

    const menuItems = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .filter((item) => item.textContent?.includes("Project "));
    expect(menuItems).toHaveLength(8);
    expect(document.querySelector(".menu-recent-list")).toBeDefined();
    expect([...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].some((item) => item.textContent?.includes("Ver todos os projetos"))).toBe(true);
  });

  it("does not show 'Ver todos os projetos' when recent count is within the limit", () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const projects = Array.from({ length: 3 }, (_, index) => ({
      id: `p-${index}`,
      name: `Project ${index}`,
      kind: "project" as const,
      path: `/home/user/project-${index}`,
      lastOpenedAt: index,
    }));
    const props = {
      workspaceName: "Workspace",
      recentProjects: projects,
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
      projectTypes: [],
      onProjectMenuOpen: vi.fn(),
      onCreateProject: vi.fn(),
      onOpenProject: vi.fn(),
      onOpenRecentProject: vi.fn(),
      onManageRecentProjects: vi.fn(),
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

    const menuItems = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .filter((item) => item.textContent?.includes("Project "));
    expect(menuItems).toHaveLength(3);
    expect([...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].some((item) => item.textContent?.includes("Ver todos os projetos"))).toBe(false);
  });

  it("exposes full path in title attribute for tooltip accessibility", () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const longPath = "/home/user/very/long/path/to/project-directory";
    const projects = [{
      id: "p-1",
      name: "My Project",
      kind: "project" as const,
      path: longPath,
      lastOpenedAt: 1,
    }];
    const props = {
      workspaceName: "Workspace",
      recentProjects: projects,
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
      projectTypes: [],
      onProjectMenuOpen: vi.fn(),
      onCreateProject: vi.fn(),
      onOpenProject: vi.fn(),
      onOpenRecentProject: vi.fn(),
      onManageRecentProjects: vi.fn(),
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

    const pathSpan = document.querySelector<HTMLElement>(".menu-item__recent-path");
    expect(pathSpan).toBeDefined();
    if (pathSpan) {
      expect(pathSpan.getAttribute("title")).toBe(longPath);
    }
  });
});
