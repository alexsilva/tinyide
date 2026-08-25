import type { WorkspaceEditorSettings } from "./workspace-settings";

export interface ResolvedEditorSettings {
  readonly lineNumbers: boolean;
}

export const DEFAULT_EDITOR_SETTINGS: ResolvedEditorSettings = {
  lineNumbers: true,
};

export const EDITOR_DEFAULT_LINE_HEIGHT = 21.45;
export const EDITOR_CONTENT_PADDING = 18;

export function resolveEditorSettings(
  userSettings?: WorkspaceEditorSettings,
): ResolvedEditorSettings {
  return {
    lineNumbers: userSettings?.lineNumbers ?? true,
  };
}

export function editorLineNumbers(source: string): readonly string[] {
  const count = editorDocumentMetrics(source).lineCount;
  const width = Math.max(2, String(count).length);
  return Array.from({ length: count }, (_, index) => String(index + 1).padStart(width, "0"));
}

export function editorGutterWidth(source: string): number {
  return editorDocumentMetrics(source).gutterWidth;
}

export interface EditorDocumentMetrics {
  readonly lineCount: number;
  readonly lineNumberWidth: number;
  readonly gutterWidth: number;
}

export interface EditorDocumentIndex extends EditorDocumentMetrics {
  readonly lineStarts?: readonly number[];
  readonly widthGuard?: string;
}

/**
 * Indexa métricas, offsets de linha e linha mais larga em uma única passagem. O editor de arquivos
 * grandes precisa dos três valores; calculá-los separadamente fazia 2-3 varreduras completas a
 * cada alteração de conteúdo.
 */
export function editorDocumentIndex(source: string, materializeLineStarts = false): EditorDocumentIndex {
  let lineCount = 1;
  let lineStart = 0;
  let longestStart = 0;
  let longestLength = 0;
  let longestColumns = -1;
  let lineColumns = 0;
  const lineStarts = materializeLineStarts ? [0] : undefined;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    if (code !== 10) {
      lineColumns += code === 9 ? 4 - (lineColumns % 4) : code >= 0x1100 ? 2 : 1;
      continue;
    }
    const lineLength = index - lineStart;
    if (lineColumns > longestColumns) {
      longestStart = lineStart;
      longestLength = lineLength;
      longestColumns = lineColumns;
    }
    lineStart = index + 1;
    lineColumns = 0;
    lineCount += 1;
    lineStarts?.push(lineStart);
  }
  const finalLength = source.length - lineStart;
  if (lineColumns > longestColumns) {
    longestStart = lineStart;
    longestLength = finalLength;
  }
  const lineNumberWidth = Math.max(2, String(lineCount).length);
  return {
    lineCount,
    lineNumberWidth,
    gutterWidth: Math.max(52, 30 + lineNumberWidth * 8),
    ...(lineStarts ? { lineStarts, widthGuard: source.slice(longestStart, longestStart + longestLength) } : {}),
  };
}

export function editorDocumentMetrics(source: string): EditorDocumentMetrics {
  const { lineCount, lineNumberWidth, gutterWidth } = editorDocumentIndex(source);
  return { lineCount, lineNumberWidth, gutterWidth };
}

export interface EditorVisibleLineRange {
  readonly start: number;
  readonly end: number;
}

export function editorVisibleLineRange(
  lineCount: number,
  scrollTop: number,
  viewportHeight: number,
  overscan = 12,
  lineHeight = EDITOR_DEFAULT_LINE_HEIGHT,
  contentPadding = EDITOR_CONTENT_PADDING,
): EditorVisibleLineRange {
  const firstVisible = Math.floor(Math.max(0, scrollTop - contentPadding) / lineHeight) + 1;
  const lastVisible = Math.ceil(Math.max(0, scrollTop + viewportHeight - contentPadding) / lineHeight) + 1;
  return {
    start: Math.max(1, firstVisible - overscan),
    end: Math.min(Math.max(1, lineCount), lastVisible + overscan),
  };
}
