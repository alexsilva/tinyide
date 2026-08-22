// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { SyntaxToken } from "@tinyide/plugin-api";
import { HighlightedSource } from "./editor-components";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLPreElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

function render(element: ReactElement): HTMLPreElement {
  host = document.createElement("pre");
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(element));
  return host;
}

/** Marca cada palavra como keyword — um token por palavra, em qualquer posição do texto. */
const wordProvider = {
  highlight(source: string): readonly SyntaxToken[] {
    const tokens: SyntaxToken[] = [];
    const pattern = /\w+/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source))) {
      tokens.push({ start: match.index, end: match.index + match[0].length, scope: "keyword" });
    }
    return tokens;
  },
};

describe("HighlightedSource com renderWindow", () => {
  const lines = Array.from({ length: 100 }, (_, index) => `linha palavra${index}`);
  const source = lines.join("\n");

  it("sem janela, gera spans para o texto inteiro (comportamento original)", () => {
    const container = render(<HighlightedSource source={source} provider={wordProvider} />);
    expect(container.querySelectorAll("span.syntax-keyword").length).toBe(200);
    expect(container.textContent).toBe(`${source}\n`);
  });

  it("gera spans apenas dentro da janela e preserva o texto completo do layout", () => {
    const start = source.indexOf("palavra40");
    const end = source.indexOf("palavra60");
    const container = render(
      <HighlightedSource source={source} provider={wordProvider} renderWindow={{ start, end }} />,
    );
    const spans = [...container.querySelectorAll("span.syntax-keyword")];
    // 20 linhas dentro da janela (palavra40..palavra59 + "linha" seguintes), nada fora dela.
    expect(spans.length).toBeGreaterThan(0);
    expect(spans.length).toBeLessThan(50);
    expect(spans.some((span) => span.textContent === "palavra40")).toBe(true);
    expect(spans.some((span) => span.textContent === "palavra0")).toBe(false);
    expect(spans.some((span) => span.textContent === "palavra99")).toBe(false);
    // O texto integral permanece — o que fica fora da janela vira texto puro.
    expect(container.textContent).toBe(`${source}\n`);
  });

  it("recorta tokens que cruzam a borda da janela sem perder texto", () => {
    const boundary = source.indexOf("palavra40") + 4;
    const container = render(
      <HighlightedSource source={source} provider={wordProvider} renderWindow={{ start: boundary, end: source.length }} />,
    );
    // O pedaço visível do token cortado continua realçado.
    const spans = [...container.querySelectorAll("span.syntax-keyword")];
    expect(spans.some((span) => span.textContent === "vra40")).toBe(true);
    expect(container.textContent).toBe(`${source}\n`);
  });

  it("recorta o realce de busca à janela mantendo offsets absolutos", () => {
    const start = source.indexOf("palavra40");
    const matchStart = source.indexOf("palavra50");
    const container = render(
      <HighlightedSource
        source={source}
        provider={wordProvider}
        renderWindow={{ start, end: source.length }}
        highlight={{ start: matchStart, end: matchStart + "palavra50".length }}
      />,
    );
    const match = container.querySelector("span.editor-search-match");
    expect(match?.textContent).toBe("palavra50");
  });
});

describe("HighlightedSource com virtualWindow (espaçadores)", () => {
  const lines = Array.from({ length: 100 }, (_, index) => `linha palavra${index}`);
  const source = lines.join("\n");
  const lineStarts = [0, ...[...source.matchAll(/\n/g)].map((match) => match.index + 1)];
  const lineHeight = 21.45;

  function renderVirtual(startLine: number, endLine: number): HTMLPreElement {
    const start = lineStarts[startLine - 1] ?? 0;
    const end = endLine < lines.length ? lineStarts[endLine] ?? source.length : source.length;
    return render(
      <HighlightedSource
        source={source}
        provider={wordProvider}
        renderWindow={{ start, end }}
        virtualWindow={{
          leadHeight: (startLine - 1) * lineHeight,
          trailHeight: (lines.length - endLine) * lineHeight,
          startLine,
          lineCount: endLine - startLine + 1,
          widthGuard: lines[0] ?? "",
        }}
      />,
    );
  }

  it("substitui o texto fora da janela por espaçadores de altura fixa", () => {
    const container = renderVirtual(41, 60);
    const spacers = [...container.querySelectorAll("[data-syntax-spacer]")] as HTMLElement[];
    expect(spacers.length).toBe(2);
    expect(spacers[0]?.style.height).toBe(`${40 * lineHeight}px`);
    expect(spacers[1]?.style.height).toBe(`${40 * lineHeight}px`);
    // O texto materializado é só a janela (+ a linha-guarda de largura).
    const windowElement = container.querySelector("[data-syntax-window-start]");
    expect(windowElement?.textContent).toBe(`${lines.slice(40, 60).join("\n")}\n`);
    expect(container.querySelector("[data-syntax-guard]")?.textContent).toBe(lines[0]);
    const spans = [...container.querySelectorAll("span.syntax-keyword")];
    expect(spans.some((span) => span.textContent === "palavra40")).toBe(true);
    expect(spans.some((span) => span.textContent === "palavra0")).toBe(false);
  });

  it("expõe offset e linha absolutos da janela para os walkers de mirror", () => {
    const container = renderVirtual(41, 60);
    const windowElement = container.querySelector("[data-syntax-window-start]");
    expect(windowElement?.getAttribute("data-syntax-window-start")).toBe(`${lineStarts[40]}`);
    expect(windowElement?.getAttribute("data-syntax-window-line")).toBe("41");
    expect(windowElement?.getAttribute("data-syntax-window-lines")).toBe("20");
  });

  it("na última linha do arquivo, fecha a janela com quebra final como no layout original", () => {
    const container = renderVirtual(81, 100);
    const windowElement = container.querySelector("[data-syntax-window-start]");
    expect(windowElement?.textContent).toBe(`${lines.slice(80).join("\n")}\n`);
    const spacers = [...container.querySelectorAll("[data-syntax-spacer]")] as HTMLElement[];
    expect(spacers[1]?.style.height).toBe("0px");
  });
});
