import type { TextEditorPosition } from "@tinyide/plugin-api";

export function textPositionAtOffset(source: string, rawOffset: number): TextEditorPosition {
  const offset = Math.max(0, Math.min(source.length, Math.trunc(rawOffset)));
  const before = source.slice(0, offset);
  const lineStart = before.lastIndexOf("\n") + 1;
  return {
    line: before.split("\n").length,
    column: offset - lineStart + 1,
  };
}

export function textOffsetAtPosition(source: string, position: TextEditorPosition): number {
  const targetLine = Math.max(1, Math.trunc(position.line));
  const targetColumn = Math.max(1, Math.trunc(position.column));
  let offset = 0;
  let line = 1;
  while (line < targetLine) {
    const nextBreak = source.indexOf("\n", offset);
    if (nextBreak < 0) return source.length;
    offset = nextBreak + 1;
    line += 1;
  }
  const lineEnd = source.indexOf("\n", offset);
  return Math.min(lineEnd < 0 ? source.length : lineEnd, offset + targetColumn - 1);
}
