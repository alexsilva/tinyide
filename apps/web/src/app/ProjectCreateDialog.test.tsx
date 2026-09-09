// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectCreateDialog } from "./ProjectCreateDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

describe("ProjectCreateDialog", () => {
  it("valida o nome e encaminha as escolhas de criação", () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const onNameChange = vi.fn();
    const onTargetChange = vi.fn();
    const onRememberChoiceChange = vi.fn();
    const onCreate = vi.fn();

    const render = (name: string) => act(() => root?.render(
      <ProjectCreateDialog
        name={name}
        target="current"
        rememberChoice={false}
        desktop
        busy={false}
        onNameChange={onNameChange}
        onTargetChange={onTargetChange}
        onRememberChoiceChange={onRememberChoiceChange}
        onCreate={onCreate}
        onClose={() => undefined}
      />,
    ));

    render("");
    const submit = host.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(submit?.disabled).toBe(true);

    render("pasta/inválida");
    expect(host.textContent).toContain("caracteres que não podem ser usados");

    render("meu-projeto");
    expect(submit?.disabled).toBe(false);
    act(() => submit?.click());
    expect(onCreate).toHaveBeenCalledTimes(1);

    const radios = host.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    act(() => radios[1]?.click());
    expect(onTargetChange).toHaveBeenCalledWith("new");

    const checkbox = host.querySelector<HTMLInputElement>('input[type="checkbox"]');
    act(() => checkbox?.click());
    expect(onRememberChoiceChange).toHaveBeenCalledWith(true);
  });
});
