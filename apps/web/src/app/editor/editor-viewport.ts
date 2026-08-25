import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { editorVisibleLineRange, type EditorVisibleLineRange } from "../editor-settings";

export interface EditorViewport {
  readonly scrollTop: number;
  readonly height: number;
}

/**
 * Fonte de verdade do viewport do editor fora do estado React do App: a rolagem emite eventos a
 * cada frame e re-renderizar o App inteiro por evento enfileira renders — régua e sintaxe chegavam
 * sempre atrasadas. Consumidores virtualizados (régua, janela de sintaxe) assinam o store e
 * re-renderizam apenas a si mesmos, no mesmo tique do evento.
 */
export interface EditorViewportStore {
  get(): EditorViewport;
  set(scrollTop: number, height: number): void;
  subscribe(listener: () => void): () => void;
}

export function createEditorViewportStore(
  initial: EditorViewport = { scrollTop: 0, height: 800 },
): EditorViewportStore {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => snapshot,
    set: (scrollTop, height) => {
      if (snapshot.scrollTop === scrollTop && snapshot.height === height) return;
      snapshot = { scrollTop, height };
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * Faixa de linhas visíveis derivada do store. Só dispara re-render quando a faixa efetivamente
 * muda (uma vez por linha rolada), não a cada pixel.
 */
export function useEditorViewportLineRange(
  store: EditorViewportStore,
  lineCount: number,
  overscan: number,
  lineHeight: number,
  contentPadding: number,
  step = 1,
  sync = false,
): EditorVisibleLineRange {
  const compute = () => {
    const viewport = store.get();
    const range = editorVisibleLineRange(
      lineCount,
      viewport.scrollTop,
      viewport.height,
      overscan,
      lineHeight,
      contentPadding,
    );
    if (step <= 1) return range;
    // Quantiza para múltiplos de `step`: consumidores caros (a janela de sintaxe reflui o texto
    // do `pre` inteiro a cada mutação) só re-renderizam ao cruzar um bloco, não a cada linha —
    // o overscan cobre o intervalo entre blocos.
    return {
      start: Math.max(1, Math.floor((range.start - 1) / step) * step + 1),
      end: Math.min(lineCount, Math.ceil(range.end / step) * step),
    };
  };
  const [range, setRange] = useState(compute);
  const rangeRef = useRef(range);
  rangeRef.current = range;
  useEffect(() => {
    const apply = (next: EditorVisibleLineRange) => setRange((current) => {
      const changed = current.start !== next.start || current.end !== next.end;
      return changed ? next : current;
    });
    apply(compute());
    // React trata scroll como prioridade contínua e adiaria o commit para depois do paint — num
    // salto de scrollbar isso pinta um frame com a janela velha (área em branco). Enquanto a
    // faixa materializada ainda cobre o visível (rolagem de roda), o commit fica assíncrono e a
    // folga absorve; quando não cobre (salto grande), flushSync descarrega no próprio evento.
    // Consumidores baratos (régua) passam `sync` e descarregam sempre no evento: sob rolagem
    // contínua o commit assíncrono pode atravessar vários frames e o atraso fica visível.
    return store.subscribe(() => {
      const next = compute();
      if (rangeRef.current.start === next.start && rangeRef.current.end === next.end) return;
      if (sync) {
        flushSync(() => apply(next));
        return;
      }
      const viewport = store.get();
      const visible = editorVisibleLineRange(
        lineCount,
        viewport.scrollTop,
        viewport.height,
        0,
        lineHeight,
        contentPadding,
      );
      const covered = rangeRef.current.start <= visible.start && rangeRef.current.end >= visible.end;
      if (covered) apply(next);
      else flushSync(() => apply(next));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, lineCount, overscan, lineHeight, contentPadding, step, sync]);
  return range;
}
