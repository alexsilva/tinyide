import type { WorkspaceSettings } from "./workspace-settings";

export interface ResolvedEditorSettings {
  readonly lineNumbers: boolean;
}

export const DEFAULT_EDITOR_SETTINGS: ResolvedEditorSettings = {
  lineNumbers: true,
};

export function resolveEditorSettings(settings: WorkspaceSettings): ResolvedEditorSettings {
  return {
    lineNumbers: settings.editor?.lineNumbers !== false,
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

export function editorDocumentMetrics(source: string): EditorDocumentMetrics {
  let lineCount = 1;
  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10) lineCount += 1;
  }
  const lineNumberWidth = Math.max(2, String(lineCount).length);
  return {
    lineCount,
    lineNumberWidth,
    gutterWidth: Math.max(52, 30 + lineNumberWidth * 8),
  };
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
): EditorVisibleLineRange {
  const lineHeight = 21.45;
  const contentPadding = 18;
  const firstVisible = Math.floor(Math.max(0, scrollTop - contentPadding) / lineHeight) + 1;
  const lastVisible = Math.ceil(Math.max(0, scrollTop + viewportHeight - contentPadding) / lineHeight) + 1;
  return {
    start: Math.max(1, firstVisible - overscan),
    end: Math.min(Math.max(1, lineCount), lastVisible + overscan),
  };
}
