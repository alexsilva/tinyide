// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExecutionProfile } from "@tinyide/plugin-api";
import { ProfileDialog } from "./ProfileDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

function profileFixture(step: Partial<ExecutionProfile["steps"][number]> = {}): ExecutionProfile {
  return {
    id: "profile-teste",
    name: "Servidor",
    environment: { mode: "none" },
    saveBeforeRun: true,
    steps: [{
      id: "step-1",
      name: "Executar",
      executable: "node",
      command: "servidor.js",
      parameters: [],
      workingDirectory: "${workspaceRoot}",
      ...step,
    }],
  };
}

function renderDialog(profile: ExecutionProfile, callbacks: {
  readonly onChange?: (profiles: readonly ExecutionProfile[], selectedId?: string) => void;
  readonly onOpenChange?: (open: boolean) => void;
} = {}) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      <ProfileDialog
        open
        onOpenChange={callbacks.onOpenChange ?? (() => undefined)}
        profiles={[profile]}
        selectedId={profile.id}
        environments={[]}
        executableOptions={[]}
        presets={[]}
        targetKinds={[]}
        onBrowseCommand={async () => undefined}
        onChange={callbacks.onChange ?? (() => undefined)}
      />,
    );
  });
}

function environmentTextarea(): HTMLTextAreaElement {
  const textarea = document.querySelector<HTMLTextAreaElement>(
    'textarea[placeholder="Uma por linha. Ex.: DEBUG=1"]',
  );
  expect(textarea, "textarea de variáveis de ambiente ausente").not.toBeNull();
  return textarea!;
}

const setTextareaValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;

/** Digita caractere a caractere, como um usuário: cada tecla dispara um input próprio. */
function typeInto(element: HTMLTextAreaElement, text: string) {
  for (const character of text) {
    act(() => {
      setTextareaValue?.call(element, element.value + character);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
}

function replaceValue(element: HTMLTextAreaElement, text: string) {
  act(() => {
    setTextareaValue?.call(element, text);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function clickSave() {
  const button = [...document.querySelectorAll("button")]
    .find((candidate) => candidate.textContent?.includes("Salvar alterações"));
  expect(button, "botão de salvar ausente").not.toBeNull();
  act(() => button?.click());
}

describe("ProfileDialog: checkboxes do perfil", () => {
  it("usa o tamanho médio da IDE (checkbox-md), o mesmo do painel de execução", () => {
    renderDialog(profileFixture());
    const checkboxes = [...document.querySelectorAll('input[type="checkbox"]')];
    expect(checkboxes).toHaveLength(2);
    for (const checkbox of checkboxes) expect(checkbox.className).toBe("checkbox-md");
  });

  it("mostra 'Salvar arquivos alterados antes de executar' ligado quando o perfil não tem a flag gravada", () => {
    const { saveBeforeRun: _absent, ...legacyProfile } = profileFixture();
    renderDialog(legacyProfile as ExecutionProfile);
    const label = [...document.querySelectorAll("label")]
      .find((candidate) => candidate.textContent?.includes("Salvar arquivos alterados antes de executar"));
    const checkbox = label?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(checkbox?.checked).toBe(true);
  });
});

describe("ProfileDialog: variáveis de ambiente", () => {
  it("aceita digitação tecla a tecla mesmo enquanto a linha ainda é inválida", () => {
    renderDialog(profileFixture());
    const textarea = environmentTextarea();
    typeInto(textarea, "DEBUG=1");
    expect(textarea.value).toBe("DEBUG=1");
  });

  it("salva as variáveis digitadas no primeiro step, ignorando comentários e linhas vazias", () => {
    const onChange = vi.fn();
    const onOpenChange = vi.fn();
    renderDialog(profileFixture(), { onChange, onOpenChange });
    typeInto(environmentTextarea(), "# só para desenvolvimento\nDEBUG=1\n\nPORT=9765");
    clickSave();
    expect(onChange).toHaveBeenCalledTimes(1);
    const [saved] = onChange.mock.calls[0]! as [readonly ExecutionProfile[]];
    expect(saved[0]?.steps[0]?.environmentVariables).toEqual({ DEBUG: "1", PORT: "9765" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("mostra o erro no campo e mantém o diálogo aberto quando uma linha é inválida", () => {
    const onChange = vi.fn();
    const onOpenChange = vi.fn();
    renderDialog(profileFixture(), { onChange, onOpenChange });
    typeInto(environmentTextarea(), "INVALIDO");
    clickSave();
    expect(onChange).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    const error = document.querySelector(".field-error");
    expect(error?.textContent).toContain("Variável de ambiente inválida: INVALIDO");
  });

  it("remove as variáveis do step quando o texto é apagado", () => {
    const onChange = vi.fn();
    renderDialog(profileFixture({ environmentVariables: { DEBUG: "1" } }), { onChange });
    const textarea = environmentTextarea();
    expect(textarea.value).toBe("DEBUG=1");
    replaceValue(textarea, "");
    clickSave();
    const [saved] = onChange.mock.calls[0]! as [readonly ExecutionProfile[]];
    expect(saved[0]?.steps[0]?.environmentVariables).toBeUndefined();
  });
});
