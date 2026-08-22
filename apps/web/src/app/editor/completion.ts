import type {
  TextEditorCompletionContext,
  TextEditorCompletionItem,
  TextEditorCompletionList,
  TextEditorCompletionProvider,
} from "@tinyide/plugin-api";

const WORD_CHAR = /[\p{L}\p{N}_]/u;

/** Extrai o prefixo da palavra imediatamente à esquerda do offset. */
export function extractCompletionPrefix(content: string, offset: number): string {
  const clamped = Math.max(0, Math.min(content.length, offset));
  let start = clamped;
  while (start > 0 && WORD_CHAR.test(content[start - 1]!)) {
    start -= 1;
  }
  return content.slice(start, clamped);
}

function normalizeItems(
  result: TextEditorCompletionList | readonly TextEditorCompletionItem[] | undefined | null,
): TextEditorCompletionItem[] {
  if (!result) return [];
  if (Array.isArray(result)) return [...result];
  const list = result as TextEditorCompletionList;
  return Array.isArray(list.items) ? [...list.items] : [];
}

function itemKey(item: TextEditorCompletionItem): string {
  return (item.insertText ?? item.label).toLocaleLowerCase();
}

/**
 * Consulta providers ordenados por prioridade (maior primeiro).
 *
 * Performance:
 * - Para no primeiro provider de linguagem (priority >= 0) que devolver itens.
 * - Providers genéricos (priority negativa) só entram como fallback quando a linguagem
 *   não retornou nada.
 */
export async function resolveTextEditorCompletions(
  providers: readonly TextEditorCompletionProvider[],
  context: TextEditorCompletionContext,
  options: { maxItems?: number } = {},
): Promise<TextEditorCompletionItem[]> {
  const maxItems = options.maxItems ?? 20;
  if (context.signal?.aborted) return [];

  const candidates = providers
    .filter((provider) => {
      try {
        return provider.canComplete(context.document);
      } catch {
        return false;
      }
    })
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0));

  let fallback: TextEditorCompletionItem[] = [];

  for (const provider of candidates) {
    if (context.signal?.aborted) break;

    let result: TextEditorCompletionList | readonly TextEditorCompletionItem[] | undefined;
    try {
      result = await provider.provideCompletions(context);
    } catch {
      continue;
    }
    if (context.signal?.aborted) break;

    const items = normalizeItems(result).filter((item) => item?.label);
    if (items.length === 0) continue;

    if ((provider.priority ?? 0) >= 0) {
      return dedupeAndLimit(items, maxItems);
    }

    if (fallback.length === 0) {
      fallback = items;
    }
  }

  return dedupeAndLimit(fallback, maxItems);
}

function dedupeAndLimit(
  items: readonly TextEditorCompletionItem[],
  maxItems: number,
): TextEditorCompletionItem[] {
  const seen = new Set<string>();
  const out: TextEditorCompletionItem[] = [];
  for (const item of items) {
    const key = itemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= maxItems) break;
  }
  return out;
}
