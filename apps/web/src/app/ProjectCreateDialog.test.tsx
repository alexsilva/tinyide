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
  it("exibe o tipo selecionado como contexto imutável", () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => root?.render(
      <ProjectCreateDialog
        name="meu-projeto"
        location="/workspace/projects"
        locationEditable={false}
        projectTypes={[{ id: "react", name: "React", description: "Vite", scaffold: async () => undefined }]}
        selectedTypeId="react"
        target="current"
        rememberChoice={false}
        desktop={false}
        busy={false}
        onNameChange={() => undefined}
        onLocationChange={() => undefined}
        onTargetChange={() => undefined}
        onRememberChoiceChange={() => undefined}
        onCreate={() => undefined}
        onClose={() => undefined}
      />,
    ));
    expect(host.textContent).toContain("React");
    expect(host.textContent).toContain("Vite");
  });

  it("exibe 'Projeto vazio' quando nenhum tipo é selecionado", () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => root?.render(
      <ProjectCreateDialog
        name="meu-projeto"
        location="/workspace/projects"
        locationEditable={false}
        projectTypes={[]}
        selectedTypeId={undefined}
        target="current"
        rememberChoice={false}
        desktop={false}
        busy={false}
        onNameChange={() => undefined}
        onLocationChange={() => undefined}
        onTargetChange={() => undefined}
        onRememberChoiceChange={() => undefined}
        onCreate={() => undefined}
        onClose={() => undefined}
      />,
    ));
    expect(host.textContent).toContain("Projeto vazio");
  });

  it("não confunde um provider removido com a opção de projeto vazio", () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => root?.render(
      <ProjectCreateDialog
        name="meu-projeto"
        location="/workspace/projects"
        locationEditable={false}
        projectTypes={[]}
        selectedTypeId="react"
        target="current"
        rememberChoice={false}
        desktop={false}
        busy={false}
        onNameChange={() => undefined}
        onLocationChange={() => undefined}
        onTargetChange={() => undefined}
        onRememberChoiceChange={() => undefined}
        onCreate={() => undefined}
        onClose={() => undefined}
      />,
    ));
    expect(host.textContent).toContain("Tipo indisponível");
    expect(host.textContent).not.toContain("Projeto vazio");
  });

  it("permite informar a pasta de destino no host runtime", () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const onLocationChange = vi.fn();
    act(() => root?.render(
      <ProjectCreateDialog
        name="meu-projeto"
        location="/mnt/projetos"
        locationEditable
        projectTypes={[]}
        target="current"
        rememberChoice={false}
        desktop={false}
        busy={false}
        onNameChange={() => undefined}
        onLocationChange={onLocationChange}
        onTargetChange={() => undefined}
        onRememberChoiceChange={() => undefined}
        onCreate={() => undefined}
        onClose={() => undefined}
      />,
    ));
    const input = host.querySelector<HTMLInputElement>(".project-create-dialog__location input");
    expect(input?.value).toBe("/mnt/projetos");
    act(() => {
      if (!input) throw new Error("Campo de destino não encontrado");
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "/mnt/outro-local");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onLocationChange).toHaveBeenCalled();
  });

  it("exige uma pasta de destino quando o host runtime permite escolher o caminho", () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => root?.render(
      <ProjectCreateDialog
        name="meu-projeto"
        location=" "
        locationEditable
        projectTypes={[]}
        target="current"
        rememberChoice={false}
        desktop={false}
        busy={false}
        onNameChange={() => undefined}
        onLocationChange={() => undefined}
        onTargetChange={() => undefined}
        onRememberChoiceChange={() => undefined}
        onCreate={() => undefined}
        onClose={() => undefined}
      />,
    ));
    expect(host.textContent).toContain("Informe a pasta de destino.");
    expect(host.querySelector<HTMLButtonElement>("button[type='submit']")?.disabled).toBe(true);
  });

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
        location="/workspace/projects"
        locationEditable={false}
        projectTypes={[]}
        selectedTypeId={undefined}
        target="current"
        rememberChoice={false}
        desktop
        busy={false}
        onNameChange={onNameChange}
        onLocationChange={() => undefined}
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

    expect(host.textContent).toContain("Projeto vazio");
    const targetRadios = host.querySelectorAll<HTMLInputElement>('input[name="project-create-target"]');
    act(() => targetRadios[1]?.click());
    expect(onTargetChange).toHaveBeenCalledWith("new");

    const checkbox = host.querySelector<HTMLInputElement>('input[type="checkbox"]');
    act(() => checkbox?.click());
    expect(onRememberChoiceChange).toHaveBeenCalledWith(true);
  });
});
