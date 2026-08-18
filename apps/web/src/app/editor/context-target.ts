export interface EditorTextRange {
  readonly start: number;
  readonly end: number;
}

const WORD_CHARACTER = /[\p{L}\p{N}_$]/u;

function isWordCharacter(character: string | undefined): boolean {
  return WORD_CHARACTER.test(character ?? "");
}

export function editorWordRangeAtOffset(source: string, rawOffset: number): EditorTextRange {
  const offset = Math.max(0, Math.min(source.length, Math.trunc(rawOffset)));
  const candidate = offset < source.length && isWordCharacter(source[offset])
    ? offset
    : offset > 0 && isWordCharacter(source[offset - 1])
      ? offset - 1
      : -1;
  if (candidate < 0) return { start: offset, end: Math.min(source.length, offset + 1) };
  let start = candidate;
  let end = candidate + 1;
  while (start > 0 && isWordCharacter(source[start - 1])) start -= 1;
  while (end < source.length && isWordCharacter(source[end])) end += 1;
  return { start, end };
}

/**
 * Faixa a realçar como alvo do menu de contexto do editor: a palavra sob o ponteiro, que é o que
 * os providers usam para decidir os itens ("Encontrar usos", "Executar com pytest") e o que nada
 * na tela indicava. Com uma seleção ativa o alvo já é ela — o realce nativo basta e empilhar outro
 * por cima só suja. Fora de uma palavra não há alvo.
 */
export function editorContextMenuTargetRange(
  source: string,
  rawSelectionStart: number,
  rawSelectionEnd: number,
): EditorTextRange | undefined {
  const selectionStart = Math.max(0, Math.min(source.length, Math.trunc(rawSelectionStart)));
  const selectionEnd = Math.max(selectionStart, Math.min(source.length, Math.trunc(rawSelectionEnd)));
  if (selectionEnd > selectionStart) return undefined;
  const onWord = isWordCharacter(source[selectionStart]) || (selectionStart > 0 && isWordCharacter(source[selectionStart - 1]));
  if (!onWord) return undefined;
  return editorWordRangeAtOffset(source, selectionStart);
}
