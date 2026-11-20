// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecentProjectsManager } from "./RecentProjectsManager";
import type { RecentProject } from "./project-history";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

describe("RecentProjectsManager", () => {
  function makeProject(id: string, name: string, path?: string): RecentProject {
    return { id, name, kind: "project", ...(path ? { path } : {}), lastOpenedAt: 0 };
  }

  const baseProps = {
    busy: false,
    onOpenRecent: vi.fn(),
    onRemoveRecent: vi.fn(),
    onClose: vi.fn(),
  };

  it("renders dialog with search and list", () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const props = { ...baseProps, recentProjects: [
      makeProject("1", "Project A", "/home/user/project-a"),
      makeProject("2", "Project B", "/home/user/project-b"),
    ] };

    act(() => root?.render(<RecentProjectsManager {...props} />));
    expect(host.querySelector(".recent-projects-dialog")).toBeDefined();
    expect(host.querySelector("input[type='text']")).toBeDefined();
    expect(host.querySelectorAll(".recent-projects-item")).toHaveLength(2);
  });

  function setSearchValue(input: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  it("filters projects by name and path", () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const props = { ...baseProps, recentProjects: [
      makeProject("1", "Project Alpha", "/home/user/alpha"),
      makeProject("2", "Project Beta", "/home/user/beta"),
    ] };

    act(() => root?.render(<RecentProjectsManager {...props} />));
    const input = host.querySelector<HTMLInputElement>("input[type='text']");
    expect(input).toBeDefined();
    if (!input) return;

    act(() => setSearchValue(input, "alpha"));
    expect(host.querySelectorAll(".recent-projects-item")).toHaveLength(1);
  });

  it("shows empty state when no projects match search", () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const props = { ...baseProps, recentProjects: [
      makeProject("1", "Project A", "/home/user/a"),
    ] };

    act(() => root?.render(<RecentProjectsManager {...props} />));
    const input = host.querySelector<HTMLInputElement>("input[type='text']");
    expect(input).toBeDefined();
    if (!input) return;

    act(() => setSearchValue(input, "nonexistent"));
    expect(host.querySelectorAll(".recent-projects-item")).toHaveLength(0);
    expect(host.querySelector(".recent-projects-dialog__empty")).toBeDefined();
  });

  it("calls onRemoveRecent when remove button is clicked", () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const onRemoveRecent = vi.fn();
    const props = { ...baseProps, onRemoveRecent, recentProjects: [
      makeProject("1", "Project A", "/home/user/a"),
    ] };

    act(() => root?.render(<RecentProjectsManager {...props} />));
    const removeButton = host.querySelector<HTMLButtonElement>(".recent-projects-item__remove");
    expect(removeButton).toBeDefined();
    if (!removeButton) return;

    act(() => removeButton.click());
    expect(onRemoveRecent).toHaveBeenCalled();
  });

  it("calls onOpenRecent when main button is clicked", () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const onOpenRecent = vi.fn();
    const props = { ...baseProps, onOpenRecent, recentProjects: [
      makeProject("1", "Project A", "/home/user/a"),
    ] };

    act(() => root?.render(<RecentProjectsManager {...props} />));
    const mainButton = host.querySelector<HTMLButtonElement>(".recent-projects-item__main");
    expect(mainButton).toBeDefined();
    if (!mainButton) return;

    act(() => mainButton.click());
    expect(onOpenRecent).toHaveBeenCalled();
  });

  it("calls onClose when close button is clicked", () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const onClose = vi.fn();
    const props = { ...baseProps, recentProjects: [] as readonly RecentProject[], onClose };

    act(() => root?.render(<RecentProjectsManager {...props} />));
    const closeButton = host.querySelector<HTMLButtonElement>("[aria-label='Fechar']");
    expect(closeButton).toBeDefined();
    if (!closeButton) return;

    act(() => closeButton.click());
    expect(onClose).toHaveBeenCalled();
  });

  it("displays project name and path", () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const props = { ...baseProps, recentProjects: [
      makeProject("1", "My Project", "/very/long/path/to/project"),
    ] };

    act(() => root?.render(<RecentProjectsManager {...props} />));
    const item = host.querySelector(".recent-projects-item");
    expect(item).toBeDefined();
    if (!item) return;
    expect(item.textContent).toContain("My Project");
    expect(item.textContent).toContain("/very/long/path/to/project");
  });
});
