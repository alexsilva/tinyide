// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExplorerDeletionDialog, type ExplorerDeletionEntry } from "./ExplorerDeletionDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

function renderDialog(entries: readonly ExplorerDeletionEntry[]) {
  host = window.document.createElement("div");
  window.document.body.append(host);
  root = createRoot(host);
  const onCancel = vi.fn();
  const onConfirm = vi.fn();

  act(() => {
    root?.render(<ExplorerDeletionDialog entries={entries} onCancel={onCancel} onConfirm={onConfirm} />);
  });

  return { onCancel, onConfirm };
}

describe("ExplorerDeletionDialog", () => {
  it("descreve a exclusão de um arquivo único pelo nome", () => {
    renderDialog([{ name: "main.py", kind: "file" }]);
    expect(window.document.querySelector("h3")?.textContent).toBe("Excluir arquivo?");
    expect(window.document.body.textContent).toContain("main.py será removido do workspace.");
  });

  it("avisa que pastas levam o conteúdo interno junto", () => {
    renderDialog([{ name: "src", kind: "directory" }]);
    expect(window.document.querySelector("h3")?.textContent).toBe("Excluir pasta?");
    expect(window.document.body.textContent).toContain("src será removido do workspace com todo o conteúdo interno.");
  });

  it("agrega múltiplas entradas na mensagem plural", () => {
    renderDialog([
      { name: "a.txt", kind: "file" },
      { name: "b.txt", kind: "file" },
      { name: "docs", kind: "directory" },
    ]);
    expect(window.document.querySelector("h3")?.textContent).toBe("Excluir 3 itens?");
    expect(window.document.body.textContent).toContain("Os 3 itens selecionados serão removidos do workspace.");
  });

  it("encaminha confirmação e cancelamento", () => {
    const { onCancel, onConfirm } = renderDialog([{ name: "main.py", kind: "file" }]);
    const buttons = [...window.document.querySelectorAll("button")];

    act(() => {
      buttons.find((button) => button.textContent === "Excluir")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onConfirm).toHaveBeenCalledOnce();

    act(() => {
      buttons.find((button) => button.textContent === "Cancelar")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
