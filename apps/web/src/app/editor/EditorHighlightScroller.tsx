import { useState, type ReactNode, type Ref } from "react";
import type { TextDiagnostic } from "@tinyide/plugin-api";
import type { SyntaxHighlighter } from "../generic-syntax";
import { DiagnosticLayer, HighlightedSource } from "./editor-components";
import { WindowedHighlightedSource } from "./WindowedHighlightedSource";
import type { EditorViewportStore } from "./editor-viewport";

interface HighlightRange {
  readonly start: number;
  readonly end: number;
}

export interface EditorHighlightScrollerProps {
  readonly scrollRef: Ref<HTMLDivElement>;
  readonly syntaxLayerRef: Ref<HTMLPreElement>;
  readonly inlineRuler: boolean;
  readonly ruler: ReactNode;
  readonly executionLayers: ReactNode;
  readonly provider: SyntaxHighlighter | undefined;
  readonly source: string;
  readonly lineStarts: readonly number[] | undefined;
  readonly viewportStore: EditorViewportStore;
  readonly lineCount: number;
  readonly lineHeight: number;
  readonly contentPadding: number;
  readonly widthGuard: string | undefined;
  readonly searchHighlight: HighlightRange | undefined;
  readonly contextTarget: HighlightRange | undefined;
  readonly diagnostics: readonly TextDiagnostic[];
  readonly folded: boolean;
  readonly foldSelectionRef: Ref<HTMLDivElement>;
  readonly foldCaretRef: Ref<HTMLSpanElement>;
  readonly onScroll: (target: HTMLDivElement) => void;
  readonly children: ReactNode;
}

/**
 * Superfície rolável do editor com realce de sintaxe: empilha camadas de execução, sintaxe,
 * diagnósticos e a projeção de fold sob o textarea, e é dona do hover de diagnóstico para que
 * mover o mouse não re-renderize a árvore do App.
 */
export function EditorHighlightScroller({
  scrollRef,
  syntaxLayerRef,
  inlineRuler,
  ruler,
  executionLayers,
  provider,
  source,
  lineStarts,
  viewportStore,
  lineCount,
  lineHeight,
  contentPadding,
  widthGuard,
  searchHighlight,
  contextTarget,
  diagnostics,
  folded,
  foldSelectionRef,
  foldCaretRef,
  onScroll,
  children,
}: EditorHighlightScrollerProps) {
  const [hoveredDiagnosticLine, setHoveredDiagnosticLine] = useState<number>();
  const highlightProps: {
    source: string;
    provider?: SyntaxHighlighter;
    highlight?: HighlightRange;
    contextTarget?: HighlightRange;
  } = {
    source,
    ...(provider ? { provider } : {}),
    ...(searchHighlight ? { highlight: searchHighlight } : {}),
    ...(contextTarget ? { contextTarget } : {}),
  };

  return (
    <div
      ref={scrollRef}
      className={`highlight-editor${inlineRuler ? " has-inline-ruler" : ""}`}
      onMouseMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const contentY = event.clientY - bounds.top + event.currentTarget.scrollTop - contentPadding;
        const line = Math.floor(contentY / lineHeight) + 1;
        const nextLine = diagnostics.some((diagnostic) => diagnostic.line === line)
          ? line
          : undefined;
        setHoveredDiagnosticLine((current) => current === nextLine ? current : nextLine);
      }}
      onMouseLeave={() => setHoveredDiagnosticLine(undefined)}
      onScroll={(event) => onScroll(event.currentTarget)}
    >
      {inlineRuler ? ruler : null}
      <div className="highlight-editor__content">
        {executionLayers}
        <pre
          ref={syntaxLayerRef}
          className="syntax-layer"
          data-syntax-provider={provider?.id}
          data-syntax-origin={provider?.origin}
        >
          {lineStarts ? (
            <WindowedHighlightedSource
              viewportStore={viewportStore}
              lineStarts={lineStarts}
              lineCount={lineCount}
              lineHeight={lineHeight}
              contentPadding={contentPadding}
              widthGuard={widthGuard}
              {...highlightProps}
            />
          ) : (
            <HighlightedSource {...highlightProps} />
          )}
        </pre>
        <DiagnosticLayer
          diagnostics={diagnostics}
          source={source}
          hoveredLine={hoveredDiagnosticLine}
        />
        {children}
        {folded ? (
          <>
            <div
              ref={foldSelectionRef}
              className="editor-projected-selection"
              aria-hidden="true"
              hidden
            />
            <span
              ref={foldCaretRef}
              className="editor-projected-caret"
              aria-hidden="true"
              hidden
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
