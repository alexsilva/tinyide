export interface TextSearchMatch {
  readonly start: number;
  readonly end: number;
}

const MAX_TEXT_SEARCH_MATCHES = 10_000;

export interface TextSearchOptions {
  readonly caseSensitive?: boolean;
  readonly regex?: boolean;
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Finds local matches without doing any workspace lookup. */
export function findTextMatches(
  source: string,
  query: string,
  options: TextSearchOptions = {},
): readonly TextSearchMatch[] {
  if (!query) return [];
  const expression = new RegExp(
    options.regex ? query : escapeRegularExpression(query),
    options.caseSensitive ? "g" : "gi",
  );
  const matches: TextSearchMatch[] = [];
  while (matches.length < MAX_TEXT_SEARCH_MATCHES) {
    const match = expression.exec(source);
    if (!match) break;
    const length = Math.max(1, match[0].length);
    matches.push({ start: match.index, end: Math.min(source.length, match.index + length) });
    if (!match[0].length) expression.lastIndex = match.index + 1;
  }
  return matches;
}

/** Replaces one already-resolved search match without reinterpreting the replacement text. */
export function replaceTextMatch(source: string, match: TextSearchMatch, replacement: string): string {
  return `${source.slice(0, match.start)}${replacement}${source.slice(match.end)}`;
}

/** Replaces matches from the end so offsets remain valid for every earlier match. */
export function replaceTextMatches(
  source: string,
  matches: readonly TextSearchMatch[],
  replacement: string,
): string {
  return [...matches].reverse().reduce(
    (content, match) => replaceTextMatch(content, match, replacement),
    source,
  );
}
