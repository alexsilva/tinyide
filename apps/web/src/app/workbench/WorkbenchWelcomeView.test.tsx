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
          projectTypes={[{ id: "react", name: "React", description: "Vite", scaffold: async () => undefined }]}
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

    // "Criar projeto" é um submenu (SubTrigger); "Abrir projeto" é item direto.
    const menuItems = [...document.querySelectorAll<HTMLElement>('.menu-content [role="menuitem"]')];
    expect(menuItems.map((item) => item.textContent?.trim())).toEqual(["Criar projeto", "Abrir projeto"]);

    // Abrir o submenu revela sempre o projeto vazio e os providers ativos.
    act(() => menuItems[0]?.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowRight", bubbles: true})));
    const submenuItems = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    expect(submenuItems.map((item) => item.textContent?.trim())).toContain("Projeto vazio");
    expect(submenuItems.map((item) => item.textContent?.trim())).toContain("React");
    act(() => submenuItems.find((item) => item.textContent?.trim() === "React")?.click());
    expect(onCreateProject).toHaveBeenCalledWith("react");

    // Reabre o menu principal e verifica a ação independente de abrir projeto.
    act(() => projectTrigger?.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true})));
    const reopenedItems = [...document.querySelectorAll<HTMLElement>('.menu-content [role="menuitem"]')];
    act(() => reopenedItems.find((item) => item.textContent?.trim() === "Abrir projeto")?.click());
    expect(onOpenProject).toHaveBeenCalledTimes(1);
  });
});
