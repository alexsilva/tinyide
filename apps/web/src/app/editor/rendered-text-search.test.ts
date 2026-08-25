// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  clearRenderedTextSearchHighlight,
  createRenderedTextSearchSnapshot,
  findRenderedTextMatches,
  revealRenderedTextMatch,
} from "./rendered-text-search";

let root: HTMLDivElement | undefined;

afterEach(() => {
  root?.remove();
  root = undefined;
  document.getSelection()?.removeAllRanges();
});

function render(markup: string): HTMLDivElement {
  root = document.createElement("div");
  root.innerHTML = markup;
  document.body.append(root);
  return root;
}

function find(host: HTMLDivElement, query: string, options: { caseSensitive?: boolean; regex?: boolean } = {}) {
  return findRenderedTextMatches(createRenderedTextSearchSnapshot(host), query, options);
}

function rangeText(match: ReturnType<typeof find>[number]): string {
  const range = document.createRange();
  range.setStart(match.startPosition.node, match.startPosition.offset);
  range.setEnd(match.endPosition.node, match.endPosition.offset);
  return range.toString();
}

describe("rendered text search", () => {
  it("encontra texto renderizado e mantém as posições DOM da ocorrência sem criar Range por match", () => {
    const host = render("<h1>Documentação</h1><p>Ajuste financeiro do pedido</p>");
    const matches = find(host, "ajuste financeiro");

    expect(matches).toHaveLength(1);
    expect(matches[0] && rangeText(matches[0])).toBe("Ajuste financeiro");
    expect(matches[0]).not.toHaveProperty("range");
  });

  it("encontra uma frase mesmo quando a renderização a divide em elementos inline", () => {
    const host = render("<p>Busca <strong>também funciona</strong> em preview.</p>");
    const matches = find(host, "Busca também funciona");

    expect(matches).toHaveLength(1);
    expect(matches[0] && rangeText(matches[0])).toBe("Busca também funciona");
  });

  it("não concatena parágrafos como se fossem uma única palavra", () => {
    const host = render("<p>primeira</p><p>segunda</p>");

    expect(find(host, "primeirasegunda")).toHaveLength(0);
    expect(find(host, "segunda")).toHaveLength(1);
  });

  it("ignora conteúdo explicitamente não renderizado", () => {
    const host = render(`
      <p>visível</p>
      <p hidden>segredo hidden</p>
      <p aria-hidden="true">segredo aria</p>
      <p style="display: none">segredo display</p>
      <script>segredo script</script>
    `);

    expect(find(host, "visível")).toHaveLength(1);
    expect(find(host, "segredo")).toHaveLength(0);
  });

  it("mantém as opções de case-sensitive e regex do buscador do editor", () => {
    const host = render("<p>Alpha alpha ALPHA</p>");

    expect(find(host, "alpha", { caseSensitive: true })).toHaveLength(1);
    expect(find(host, "A[a-z]+", { regex: true, caseSensitive: true })).toHaveLength(1);
  });

  it("busca texto dentro de iframe renderizado quando o documento é acessível", () => {
    const host = render("<iframe></iframe>");
    const iframe = host.querySelector("iframe");
    expect(iframe?.contentDocument?.body).toBeDefined();
    if (!iframe?.contentDocument?.body) return;
    iframe.contentDocument.body.innerHTML = "<p>Prévia HTML com <strong>texto pesquisável</strong>.</p>";

    const matches = find(host, "texto pesquisável");

    expect(matches).toHaveLength(1);
    expect(matches[0] && rangeText(matches[0])).toBe("texto pesquisável");
    expect(matches[0]?.startPosition.node.ownerDocument).toBe(iframe.contentDocument);
  });

  it("revela a ocorrência sem roubar foco nem alterar a seleção do documento", () => {
    const host = render("<p>um <strong>resultado</strong> aqui</p>");
    const match = find(host, "resultado")[0];
    expect(match).toBeDefined();
    if (!match) return;
    Object.defineProperty(match.startPosition.node.parentElement, "scrollIntoView", {
      configurable: true,
      value: () => undefined,
    });

    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    const selectionCountBefore = document.getSelection()?.rangeCount;
    const selectionTextBefore = document.getSelection()?.toString();

    revealRenderedTextMatch(host, match);
    expect(document.activeElement).toBe(input);
    expect(document.getSelection()?.rangeCount).toBe(selectionCountBefore);
    expect(document.getSelection()?.toString()).toBe(selectionTextBefore);

    clearRenderedTextSearchHighlight(host);
    expect(document.activeElement).toBe(input);
    expect(document.getSelection()?.rangeCount).toBe(selectionCountBefore);
    expect(document.getSelection()?.toString()).toBe(selectionTextBefore);
    input.remove();
  });
});
