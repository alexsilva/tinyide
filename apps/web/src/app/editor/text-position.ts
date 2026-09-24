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

/**
 * Comprimento apenas das linhas pedidas, numa varredura que para na última delas. Quem precisa
 * disso — a camada de diagnósticos — quer meia dúzia de linhas, e `source.split(/\r?\n/)` recortava
 * o arquivo inteiro a cada tecla para respondê-las: em um módulo de 500 KB são 14 mil strings
 * alocadas por caractere digitado. Sem diagnósticos, não há varredura nenhuma.
 */
export function lineLengthsAt(source: string, lines: Iterable<number>): ReadonlyMap<number, number> {
  const wanted = new Set<number>();
  let lastWanted = 0;
  for (const line of lines) {
    if (!Number.isFinite(line) || line < 1) continue;
    const target = Math.trunc(line);
    wanted.add(target);
    lastWanted = Math.max(lastWanted, target);
  }
  const lengths = new Map<number, number>();
  let line = 1;
  let start = 0;
  while (line <= lastWanted) {
    const lineBreak = source.indexOf("\n", start);
    const end = lineBreak < 0 ? source.length : lineBreak;
    // O `\r` de uma quebra CRLF não é coluna do texto.
    if (wanted.has(line)) {
      lengths.set(line, end > start && source.charCodeAt(end - 1) === 13 ? end - start - 1 : end - start);
    }
    if (lineBreak < 0) break;
    start = lineBreak + 1;
    line += 1;
  }
  return lengths;
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
