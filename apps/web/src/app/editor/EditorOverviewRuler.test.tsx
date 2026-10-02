// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TextEditorLineDecoration } from "@tinyide/plugin-api";
import { EDITOR_OVERVIEW_SNAP_PX, EditorOverviewRuler, editorOverviewMarks } from "./EditorOverviewRuler";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

const lines = (kind: TextEditorLineDecoration["kind"], from: number, to: number, tooltip?: string) => (
  Array.from({ length: to - from + 1 }, (_, index) => ({
    line: from + index,
    kind,
    ...(tooltip ? { tooltip } : {}),
  }))
);

describe("editorOverviewMarks", () => {
  it("funde linhas consecutivas do mesmo kind num único bloco", () => {
    expect(editorOverviewMarks([
      ...lines("modified", 10, 14, "Bloco alterado (linhas 10-14)"),
      ...lines("added", 40, 41),
    ])).toEqual([
      { kind: "modified", startLine: 10, endLine: 14, label: "Bloco alterado (linhas 10-14)" },
      { kind: "added", startLine: 40, endLine: 41 },
    ]);
  });

  it("separa blocos do mesmo kind interrompidos por uma linha sem decoração", () => {
    expect(editorOverviewMarks([...lines("added", 1, 2), ...lines("added", 4, 4)]).map((mark) => [mark.startLine, mark.endLine]))
      .toEqual([[1, 2], [4, 4]]);
  });

  it("não depende da ordem em que o provider publica as linhas", () => {
    expect(editorOverviewMarks([...lines("added", 5, 7)].reverse()))
      .toEqual([{ kind: "added", startLine: 5, endLine: 7 }]);
  });

  it("mantém kinds diferentes na mesma linha como marcas independentes", () => {
    expect(editorOverviewMarks([
      ...lines("modified", 3, 4),
      { line: 4, kind: "error", label: "Nome indefinido" },
    ])).toEqual([
      { kind: "modified", startLine: 3, endLine: 4 },
      { kind: "error", startLine: 4, endLine: 4, label: "Nome indefinido" },
    ]);
  });

  it("não funde remoções em linhas vizinhas: cada uma é um ponto entre duas linhas", () => {
    expect(editorOverviewMarks([
      { line: 8, kind: "deleted", deletedLineCount: 2 },
      { line: 9, kind: "deleted", deletedLineCount: 1 },
    ]).map((mark) => mark.startLine)).toEqual([8, 9]);
  });

  it("ignora linhas inválidas", () => {
    expect(editorOverviewMarks([
      { line: 0, kind: "added" },
      { line: 2.5, kind: "added" },
      { line: Number.NaN, kind: "added" },
    ])).toEqual([]);
  });
});

function renderRuler(props: Partial<Parameters<typeof EditorOverviewRuler>[0]> = {}) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const onNavigate = vi.fn();
  act(() => {
    root?.render(
      <EditorOverviewRuler
        marks={[]}
        lineCount={100}
        visibleLineByFileLine={undefined}
        onNavigate={onNavigate}
        {...props}
      />,
    );
  });
  return { onNavigate, marks: [...host.querySelectorAll<HTMLButtonElement>(".editor-overview-ruler__mark")] };
}

describe("EditorOverviewRuler", () => {
  it("posiciona cada marca na altura proporcional do bloco e navega para a primeira linha", () => {
    const { onNavigate, marks } = renderRuler({
      marks: [{ kind: "modified", startLine: 51, endLine: 60, label: "Bloco alterado (linhas 51-60)" }],
    });

    expect(marks).toHaveLength(1);
    const [mark] = marks;
    expect(mark?.className).toContain("is-modified");
    expect(mark?.style.top).toBe("50%");
    expect(mark?.style.height).toBe("10%");
    expect(mark?.title).toBe("Bloco alterado (linhas 51-60)\nLinhas 51-60");
    expect(mark?.getAttribute("aria-label")).toBe("Ir para linhas 51-60: Bloco alterado (linhas 51-60)");

    act(() => mark?.click());
    expect(onNavigate).toHaveBeenCalledWith(51);
  });

  it("projeta a posição pelas linhas visíveis quando há dobras, mas navega pela linha do arquivo", () => {
    // Arquivo de 10 linhas com 2-5 dobradas: a linha 8 do arquivo é a 5ª visível de 7.
    const visibleLineByFileLine = [1, 2, 2, 2, 2, 3, 4, 5, 6, 7];
    const { onNavigate, marks } = renderRuler({
      marks: [{ kind: "added", startLine: 8, endLine: 8 }],
      lineCount: 7,
      visibleLineByFileLine,
    });

    expect(Number.parseFloat(marks[0]?.style.top ?? "")).toBeCloseTo((4 / 7) * 100);
    act(() => marks[0]?.click());
    expect(onNavigate).toHaveBeenCalledWith(8);
  });

  it("remoção é um ponto sem altura proporcional", () => {
    const { marks } = renderRuler({ marks: [{ kind: "deleted", startLine: 26, endLine: 26 }] });
    expect(marks[0]?.style.top).toBe("25%");
    expect(marks[0]?.style.height).toBe("");
  });

  it("decoração além do fim do documento fica presa na última linha", () => {
    const { marks } = renderRuler({ marks: [{ kind: "deleted", startLine: 130, endLine: 130 }] });
    expect(marks[0]?.style.top).toBe("99%");
  });

  it("não tira o foco do editor no mousedown", () => {
    const { marks } = renderRuler({ marks: [{ kind: "added", startLine: 1, endLine: 1 }] });
    const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    marks[0]?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  describe("alvo do ponteiro", () => {
    /** jsdom não faz layout: cada marca recebe o retângulo vertical que teria na tela. */
    function placeMarks(marks: HTMLButtonElement[], rects: Array<[top: number, bottom: number]>) {
      marks.forEach((mark, index) => {
        const [top, bottom] = rects[index] ?? [0, 0];
        mark.getBoundingClientRect = () => ({ top, bottom, left: 0, right: 14, width: 14, height: bottom - top, x: 0, y: top, toJSON: () => ({}) });
      });
    }
    const pointer = (type: string, clientY: number) => new MouseEvent(type, { bubbles: true, cancelable: true, clientY });
    const ruler = () => host?.querySelector<HTMLDivElement>(".editor-overview-ruler");

    it("clique no vão perto de uma marca vai para ela; longe demais não navega", () => {
      const { onNavigate, marks } = renderRuler({ marks: [{ kind: "added", startLine: 40, endLine: 40 }] });
      placeMarks(marks, [[200, 204]]);

      act(() => ruler()?.dispatchEvent(pointer("click", 204 + EDITOR_OVERVIEW_SNAP_PX)));
      expect(onNavigate).toHaveBeenCalledWith(40);

      onNavigate.mockClear();
      act(() => ruler()?.dispatchEvent(pointer("click", 200 - EDITOR_OVERVIEW_SNAP_PX - 1)));
      expect(onNavigate).not.toHaveBeenCalled();
    });

    it("entre duas marcas, vence a mais próxima do ponteiro", () => {
      const { onNavigate, marks } = renderRuler({
        marks: [
          { kind: "added", startLine: 10, endLine: 10 },
          { kind: "deleted", startLine: 14, endLine: 14 },
        ],
      });
      placeMarks(marks, [[100, 104], [116, 120]]);

      act(() => ruler()?.dispatchEvent(pointer("click", 108)));
      expect(onNavigate).toHaveBeenLastCalledWith(10);
      act(() => ruler()?.dispatchEvent(pointer("click", 112)));
      expect(onNavigate).toHaveBeenLastCalledWith(14);
    });

    it("destaca a marca que o clique alcançaria e limpa ao sair da faixa", () => {
      const { marks } = renderRuler({
        marks: [{ kind: "modified", startLine: 51, endLine: 60, label: "Bloco alterado (linhas 51-60)" }],
      });
      placeMarks(marks, [[300, 330]]);

      act(() => ruler()?.dispatchEvent(pointer("mousemove", 336)));
      expect(marks[0]?.classList.contains("is-hot")).toBe(true);
      expect(ruler()?.classList.contains("is-pointing")).toBe(true);
      expect(ruler()?.title).toBe("Bloco alterado (linhas 51-60)\nLinhas 51-60");

      act(() => ruler()?.dispatchEvent(pointer("mousemove", 360)));
      expect(marks[0]?.classList.contains("is-hot")).toBe(false);
      expect(ruler()?.classList.contains("is-pointing")).toBe(false);

      act(() => ruler()?.dispatchEvent(pointer("mousemove", 310)));
      act(() => ruler()?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body })));
      expect(marks[0]?.classList.contains("is-hot")).toBe(false);
      expect(ruler()?.hasAttribute("title")).toBe(false);
    });
  });
});
