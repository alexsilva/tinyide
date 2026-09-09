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
    expect(buttons.length).toBe(4);

    // Novo arquivo
    act(() => buttons[0]?.click());
    expect(onNewDocument).toHaveBeenCalledTimes(1);

    // Abrir arquivo
    act(() => buttons[1]?.click());
    expect(onOpenFile).toHaveBeenCalledTimes(1);

    // Criar projeto
    act(() => buttons[2]?.click());
    expect(onCreateProject).toHaveBeenCalledTimes(1);

    // Abrir projeto
    act(() => buttons[3]?.click());
    expect(onOpenProject).toHaveBeenCalledTimes(1);
  });
});
