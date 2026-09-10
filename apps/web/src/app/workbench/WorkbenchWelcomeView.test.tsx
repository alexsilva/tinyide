// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkbenchWelcomeView } from "./WorkbenchWelcomeView";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

describe("WorkbenchWelcomeView", () => {
  it("renders welcome screen and responds to click events", () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    const onNewDocument = vi.fn();
    const onOpenFile = vi.fn();
    const onCreateProject = vi.fn();
    const onOpenProject = vi.fn();

    act(() => {
      root?.render(
        <WorkbenchWelcomeView
          fileCreationOptions={[]}
          onNewDocument={onNewDocument}
          onOpenFile={onOpenFile}
          onCreateProject={onCreateProject}
          onOpenProject={onOpenProject}
        />,
      );
    });

    expect(host.querySelector(".welcome-screen")).not.toBeNull();
    expect(host.textContent).toContain("Bem-vindo");
    expect(host.textContent).toContain("tinyIde");
    expect(host.textContent).toContain("Crie, abra ou arraste um arquivo para começar.");

    const buttons = host.querySelectorAll<HTMLButtonElement>("button");
    expect(buttons.length).toBe(3);

    // Novo arquivo
    act(() => buttons[0]?.click());
    expect(onNewDocument).toHaveBeenCalledTimes(1);

    // Abrir arquivo
    act(() => buttons[1]?.click());
    expect(onOpenFile).toHaveBeenCalledTimes(1);

    // Projeto: um único gatilho de dropdown, como o de "Novo arquivo"
    const projectTrigger = buttons[2];
    expect(projectTrigger?.textContent).toContain("Projeto");
    expect(projectTrigger?.getAttribute("aria-haspopup")).toBe("menu");

    act(() => {
      projectTrigger?.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true}));
    });

    const menuItems = [...document.querySelectorAll<HTMLElement>('.menu-content [role="menuitem"]')];
    expect(menuItems.map((item) => item.textContent?.trim())).toEqual(["Criar projeto...", "Abrir projeto..."]);

    act(() => menuItems[0]?.click());
    expect(onCreateProject).toHaveBeenCalledTimes(1);

    act(() => {
      projectTrigger?.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true}));
    });
    act(() => document.querySelectorAll<HTMLElement>('.menu-content [role="menuitem"]')[1]?.click());
    expect(onOpenProject).toHaveBeenCalledTimes(1);
  });
});
