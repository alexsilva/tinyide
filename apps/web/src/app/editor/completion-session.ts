import type {
  TextEditorCompletionItem,
  TextEditorCompletionProvider,
  TextEditorDocumentSnapshot,
} from "@tinyide/plugin-api";
import { extractCompletionPrefix, resolveTextEditorCompletions } from "./completion";
import { textPositionAtOffset } from "./text-position";

export type CompletionSession = {
  items: readonly TextEditorCompletionItem[];
  selectedIndex: number;
  prefix: string;
  replaceStart: number;
  replaceEnd: number;
  top: number;
  left: number;
};

/** Posição aproximada do caret em coordenadas do viewport (para o popup). */
export function estimateCaretScreenPosition(
  textarea: HTMLTextAreaElement,
  offset: number,
): { top: number; left: number; lineHeight: number } {
  const style = window.getComputedStyle(textarea);
  const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.65 || 21;
  const paddingTop = Number.parseFloat(style.paddingTop) || 0;
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
  const fontSize = Number.parseFloat(style.fontSize) || 13;
  const charWidth = fontSize * 0.6;
  const before = textarea.value.slice(0, offset);
  const lines = before.split("\n");
  const lineIndex = lines.length - 1;
  const column = lines[lineIndex]?.length ?? 0;
  const bounds = textarea.getBoundingClientRect();
  const scrollTop = textarea.scrollTop;
  const scrollLeft = textarea.scrollLeft;
  return {
    top: bounds.top + paddingTop + lineIndex * lineHeight - scrollTop,
    left: bounds.left + paddingLeft + column * charWidth - scrollLeft,
    lineHeight,
  };
}

export type RequestCompletionsDeps = {
  providers: readonly TextEditorCompletionProvider[];
  documentSnapshot: TextEditorDocumentSnapshot;
  environmentExecutable?: string;
  signal: AbortSignal;
  maxItems?: number;
};

export function shouldAutoRequestCompletion(textarea: HTMLTextAreaElement, minPrefix = 3): boolean {
  if (textarea.selectionStart !== textarea.selectionEnd) return false;
  return extractCompletionPrefix(textarea.value, textarea.selectionStart).length >= minPrefix;
}

export async function buildCompletionSession(
  textarea: HTMLTextAreaElement,
  deps: RequestCompletionsDeps,
  options: { triggerCharacter?: string; minPrefix?: number } = {},
): Promise<CompletionSession | undefined> {
  const offset = textarea.selectionStart;
  const prefix = extractCompletionPrefix(textarea.value, offset);
  const minPrefix = options.minPrefix ?? 2;
  if (prefix.length < minPrefix && !options.triggerCharacter) {
    return undefined;
  }
  if (!deps.providers.length) return undefined;

  const context = {
    document: {
      ...deps.documentSnapshot,
      content: textarea.value,
    },
    position: textPositionAtOffset(textarea.value, offset),
    offset,
    prefix,
    ...(options.triggerCharacter ? { triggerCharacter: options.triggerCharacter } : {}),
    ...(deps.environmentExecutable ? { environmentExecutable: deps.environmentExecutable } : {}),
    signal: deps.signal,
  };

  const items = await resolveTextEditorCompletions(deps.providers, context, {
    maxItems: deps.maxItems ?? 20,
  });
  if (deps.signal.aborted || !items.length) return undefined;

  const coords = estimateCaretScreenPosition(textarea, offset);
  return {
    items,
    selectedIndex: 0,
    prefix,
    replaceStart: offset - prefix.length,
    replaceEnd: offset,
    top: coords.top + coords.lineHeight,
    left: coords.left,
  };
}

/**
 * Reaproveita uma lista já obtida enquanto o usuário continua digitando o mesmo
 * identificador. Evita uma nova chamada semântica a cada tecla.
 */
export function refineCompletionSession(
  textarea: HTMLTextAreaElement,
  session: CompletionSession,
): CompletionSession | undefined {
  if (textarea.selectionStart !== textarea.selectionEnd) return undefined;
  const offset = textarea.selectionStart;
  const prefix = extractCompletionPrefix(textarea.value, offset);
  const replaceStart = offset - prefix.length;
  if (replaceStart !== session.replaceStart) return undefined;
  if (!prefix.toLocaleLowerCase().startsWith(session.prefix.toLocaleLowerCase())) return undefined;

  const normalizedPrefix = prefix.toLocaleLowerCase();
  const items = session.items.filter((item) => (
    item.filterText ?? item.insertText ?? item.label
  ).toLocaleLowerCase().startsWith(normalizedPrefix));
  if (!items.length) return undefined;

  const coords = estimateCaretScreenPosition(textarea, offset);
  return {
    ...session,
    items,
    selectedIndex: Math.min(session.selectedIndex, items.length - 1),
    prefix,
    replaceEnd: offset,
    top: coords.top + coords.lineHeight,
    left: coords.left,
  };
}

export function applyCompletionItem(
  textarea: HTMLTextAreaElement,
  session: CompletionSession,
  item: TextEditorCompletionItem,
): { content: string; caret: number } {
  const insert = item.insertText ?? item.label;
  const before = textarea.value.slice(0, session.replaceStart);
  const after = textarea.value.slice(session.replaceEnd);
  const content = `${before}${insert}${after}`;
  const caret = session.replaceStart + insert.length;
  return { content, caret };
}
