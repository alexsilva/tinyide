import type { ComponentProps } from "react";
import { HighlightedSource } from "./editor-components";
import { useEditorViewportLineRange, type EditorViewportStore } from "./editor-viewport";

const SYNTAX_WINDOW_OVERSCAN_LINES = 32;
const SYNTAX_WINDOW_STEP_LINES = 16;

export interface WindowedHighlightedSourceProps
  extends Omit<ComponentProps<typeof HighlightedSource>, "renderWindow" | "virtualWindow"> {
  readonly viewportStore: EditorViewportStore;
  readonly lineStarts: readonly number[];
  readonly lineCount: number;
  readonly lineHeight: number;
  readonly contentPadding: number;
  readonly widthGuard: string | undefined;
}

/**
 * Materializa spans apenas para a janela visível de arquivos grandes e mantém a assinatura do
 * viewport isolada da árvore principal do App.
 */
export function WindowedHighlightedSource({
  viewportStore,
  lineStarts,
  lineCount,
  lineHeight,
  contentPadding,
  widthGuard,
  ...highlightProps
}: WindowedHighlightedSourceProps) {
  const range = useEditorViewportLineRange(
    viewportStore,
    lineCount,
    SYNTAX_WINDOW_OVERSCAN_LINES,
    lineHeight,
    contentPadding,
    SYNTAX_WINDOW_STEP_LINES,
  );
  const { source } = highlightProps;
  const renderWindow = {
    start: lineStarts[range.start - 1] ?? 0,
    end: range.end < lineCount ? lineStarts[range.end] ?? source.length : source.length,
  };
  const virtualWindow = {
    leadHeight: (range.start - 1) * lineHeight,
    trailHeight: Math.max(0, lineCount - range.end) * lineHeight,
    startLine: range.start,
    lineCount: range.end - range.start + 1,
    ...(widthGuard !== undefined ? { widthGuard } : {}),
  };
  return (
    <HighlightedSource
      {...highlightProps}
      renderWindow={renderWindow}
      virtualWindow={virtualWindow}
    />
  );
}
