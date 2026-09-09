// @vitest-environment jsdom
import * as Tooltip from "@radix-ui/react-tooltip";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { TextDiagnostic } from "@tinyide/plugin-api";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditorViewportStore } from "./editor-viewport";
import { EditorHighlightScroller, type EditorHighlightScrollerProps } from "./EditorHighlightScroller";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

const SOURCE = "alpha\nbeta\ngamma\ndelta";

function diagnosticAt(line: number): TextDiagnostic {
  return { severity: "error", message: `problema na linha ${line}`, line, column: 1 };
}

function renderScroller(overrides: Partial<EditorHighlightScrollerProps> = {}) {
  host = window.document.createElement("div");
  window.document.body.append(host);
  root = createRoot(host);
  const onScroll = vi.fn();

  const props: EditorHighlightScrollerProps = {
    scrollRef: { current: null },
    syntaxLayerRef: { current: null },
    inlineRuler: false,
    ruler: <span data-testid="ruler" />,
    executionLayers: <span data-testid="execution-layers" />,
    provider: {
      id: "test.provider",
      name: "Test",
      origin: "generic",
      highlight: () => [],
    },
    source: SOURCE,
    lineStarts: undefined,
    viewportStore: createEditorViewportStore(),
    lineCount: 4,
    lineHeight: 20,
    contentPadding: 0,
    widthGuard: undefined,
    searchHighlight: undefined,
    contextTarget: undefined,
    diagnostics: [],
    folded: false,
    foldSelectionRef: { current: null },
    foldCaretRef: { current: null },
    onScroll,
    children: <textarea data-testid="editor-textarea" />,
    ...overrides,
  };

  act(() => {
    root?.render(
      <Tooltip.Provider>
        <EditorHighlightScroller {...props} />
      </Tooltip.Provider>,
    );
  });

  const scroller = host.querySelector<HTMLDivElement>(".highlight-editor");
  if (!scroller) throw new Error("scroller não renderizado");
  return { scroller, onScroll };
}

describe("EditorHighlightScroller", () => {
  it("empilha camadas de execução, sintaxe com metadados do provider e o textarea", () => {
    const { scroller } = renderScroller();
    const syntaxLayer = scroller.querySelector(".syntax-layer");
    expect(syntaxLayer?.getAttribute("data-syntax-provider")).toBe("test.provider");
    expect(syntaxLayer?.getAttribute("data-syntax-origin")).toBe("generic");
    expect(syntaxLayer?.textContent).toContain("gamma");
    expect(scroller.querySelector('[data-testid="execution-layers"]')).not.toBeNull();
    expect(scroller.querySelector('[data-testid="editor-textarea"]')).not.toBeNull();
    expect(scroller.querySelector('[data-testid="ruler"]')).toBeNull();
    expect(scroller.querySelector(".editor-projected-caret")).toBeNull();
  });

  it("usa a fonte janelada quando o índice de linhas está disponível", () => {
    const { scroller } = renderScroller({ lineStarts: [0, 6, 11, 17] });
    expect(scroller.querySelector("[data-syntax-window-start]")).not.toBeNull();
  });

  it("mostra a régua inline e a projeção de fold quando solicitadas", () => {
    const { scroller } = renderScroller({ inlineRuler: true, folded: true });
    expect(scroller.classList.contains("has-inline-ruler")).toBe(true);
    expect(scroller.querySelector('[data-testid="ruler"]')).not.toBeNull();
    expect(scroller.querySelector(".editor-projected-selection")).not.toBeNull();
    expect(scroller.querySelector(".editor-projected-caret")).not.toBeNull();
  });

  it("realça a linha do diagnóstico sob o mouse e limpa ao sair", () => {
    const { scroller } = renderScroller({ diagnostics: [diagnosticAt(2)] });
    const hoveredAt = (clientY: number) => {
      act(() => {
        scroller.dispatchEvent(new MouseEvent("mousemove", { clientY, bubbles: true }));
      });
      return scroller.querySelector(".diagnostic-line.is-hovered");
    };

    // linha 2 ocupa a faixa [20, 40) com lineHeight 20 e sem padding
    expect(hoveredAt(30)).not.toBeNull();
    // linha 1 não tem diagnóstico: hover é limpo
    expect(hoveredAt(5)).toBeNull();

    expect(hoveredAt(30)).not.toBeNull();
    act(() => {
      // React deriva onMouseLeave de mouseout com relatedTarget fora do elemento
      scroller.dispatchEvent(new MouseEvent("mouseout", {
        bubbles: true,
        relatedTarget: window.document.body,
      }));
    });
    expect(scroller.querySelector(".diagnostic-line.is-hovered")).toBeNull();
  });

  it("propaga a rolagem com o próprio contêiner como alvo", () => {
    const { scroller, onScroll } = renderScroller();
    act(() => {
      scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    expect(onScroll).toHaveBeenCalledWith(scroller);
  });
});
