// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { createEditorViewportStore, useEditorViewportLineRange, type EditorViewportStore } from "./editor-viewport";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LINE_HEIGHT = 20;
const PADDING = 0;

let rangeChanges = 0;
let lastRange: unknown;

function RangeProbe({ store, lineCount, step }: { readonly store: EditorViewportStore; readonly lineCount: number; readonly step?: number }) {
  const range = useEditorViewportLineRange(store, lineCount, 2, LINE_HEIGHT, PADDING, step);
  if (range !== lastRange) {
    lastRange = range;
    rangeChanges += 1;
  }
  return <output>{range.start}:{range.end}</output>;
}

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

function renderProbe(store: EditorViewportStore, lineCount: number, step?: number): HTMLDivElement {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(<RangeProbe store={store} lineCount={lineCount} {...(step === undefined ? {} : { step })} />));
  return host;
}

describe("editor viewport store", () => {
  it("notifies subscribers only when the viewport actually changes", () => {
    const store = createEditorViewportStore();
    let notified = 0;
    store.subscribe(() => { notified += 1; });
    store.set(100, 800);
    store.set(100, 800);
    expect(notified).toBe(1);
    expect(store.get()).toEqual({ scrollTop: 100, height: 800 });
  });

  it("re-renders the consumer immediately on scroll, without an App render", () => {
    const store = createEditorViewportStore({ scrollTop: 0, height: 100 });
    const view = renderProbe(store, 1000);
    expect(view.querySelector("output")?.textContent).toBe("1:8");
    act(() => store.set(400, 100));
    expect(view.querySelector("output")?.textContent).toBe("19:28");
  });

  it("keeps the same range while the visible lines are unchanged", () => {
    const store = createEditorViewportStore({ scrollTop: 10, height: 100 });
    renderProbe(store, 1000);
    rangeChanges = 0;
    // Deslocamentos dentro da mesma linha: mesma faixa, mesma referência (nenhum trabalho novo).
    act(() => store.set(12, 100));
    act(() => store.set(15, 100));
    expect(rangeChanges).toBe(0);
    act(() => store.set(400, 100));
    expect(rangeChanges).toBeGreaterThan(0);
  });

  it("quantizes the range in blocks so expensive consumers re-render per block, not per line", () => {
    // viewport de 100px = 5 linhas; overscan 2; step 10 → blocos [1..10], [11..20]…
    const store = createEditorViewportStore({ scrollTop: 0, height: 100 });
    const view = renderProbe(store, 1000, 10);
    expect(view.querySelector("output")?.textContent).toBe("1:10");
    rangeChanges = 0;
    // rola linha a linha dentro do mesmo bloco: mesma referência, nenhum re-render do consumidor
    act(() => store.set(LINE_HEIGHT, 100));
    expect(rangeChanges).toBe(0);
    // cruzou o bloco: a faixa anda em múltiplos do passo e sempre cobre a faixa crua
    act(() => store.set(LINE_HEIGHT * 5, 100));
    expect(view.querySelector("output")?.textContent).toBe("1:20");
    act(() => store.set(LINE_HEIGHT * 500, 100));
    const [start = 0, end = 0] = (view.querySelector("output")?.textContent ?? "").split(":").map(Number);
    expect(start).toBeLessThanOrEqual(499);
    expect(end).toBeGreaterThanOrEqual(508);
    expect((start - 1) % 10).toBe(0);
    expect(end % 10).toBe(0);
  });
});

describe("App wiring", () => {
  // Em ambiente jsdom o import.meta.url não é file://; o cwd varia entre apps/web e a raiz.
  const appSource = readFileSync(
    ["src/app/App.tsx", "apps/web/src/app/App.tsx"].find((path) => existsSync(path)) ?? "src/app/App.tsx",
    "utf8",
  );

  it("publishes scroll events to the viewport store instead of re-rendering the App per tick", () => {
    expect(appSource).toContain("editorViewportStore.set(element.scrollTop, element.clientHeight)");
    expect(appSource).not.toContain("EDITOR_VIEWPORT_SYNC_LINE_SLACK");
  });

  it("keeps ruler and syntax window subscribed to the store", () => {
    const rulerSource = readFileSync(
      ["src/app/editor/EditorLineRuler.tsx", "apps/web/src/app/editor/EditorLineRuler.tsx"].find((path) => existsSync(path)) ?? "src/app/editor/EditorLineRuler.tsx",
      "utf8",
    );
    const syntaxWindowSource = readFileSync(
      ["src/app/editor/WindowedHighlightedSource.tsx", "apps/web/src/app/editor/WindowedHighlightedSource.tsx"].find((path) => existsSync(path)) ?? "src/app/editor/WindowedHighlightedSource.tsx",
      "utf8",
    );
    expect(appSource).toContain("<EditorLineRuler");
    expect(appSource).toContain("<WindowedHighlightedSource");
    expect(rulerSource).toContain("useEditorViewportLineRange(");
    expect(syntaxWindowSource).toContain("useEditorViewportLineRange(");
  });
});
