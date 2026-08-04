import type { LanguageProvider, SyntaxToken } from "@tinyide/plugin-api";

interface Candidate extends SyntaxToken {
  readonly priority: number;
}

function addMatches(
  candidates: Candidate[],
  source: string,
  pattern: RegExp,
  scope: SyntaxToken["scope"],
  priority: number,
  capture = 0,
): void {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const regex = new RegExp(pattern.source, flags);
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source))) {
    const value = match[capture];
    if (!value) {
      if (match[0].length === 0) regex.lastIndex += 1;
      continue;
    }
    const offset = capture === 0 ? 0 : match[0].lastIndexOf(value);
    const start = match.index + Math.max(0, offset);
    candidates.push({ start, end: start + value.length, scope, priority });
    if (match[0].length === 0) regex.lastIndex += 1;
  }
}

function resolveCandidates(candidates: readonly Candidate[]): readonly SyntaxToken[] {
  const accepted: Candidate[] = [];
  const ordered = candidates
    .filter((token) => token.start >= 0 && token.end > token.start)
    .slice()
    .sort((left, right) => right.priority - left.priority || (right.end - right.start) - (left.end - left.start) || left.start - right.start);
  const occupied = new Uint8Array(ordered.reduce((maximum, token) => Math.max(maximum, token.end), 0));
  for (const candidate of ordered) {
    let overlaps = false;
    for (let index = candidate.start; index < candidate.end; index += 1) {
      if (occupied[index]) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) continue;
    accepted.push(candidate);
    occupied.fill(1, candidate.start, candidate.end);
  }
  return accepted
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .map(({ priority: _priority, ...token }) => token);
}

export function highlightHtml(source: string): readonly SyntaxToken[] {
  const candidates: Candidate[] = [];
  addMatches(candidates, source, /<!--[\s\S]*?-->/g, "comment", 110);
  addMatches(candidates, source, /<!DOCTYPE\b[^>]*>/gi, "decorator", 100);
  addMatches(candidates, source, /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, "string", 90);
  addMatches(candidates, source, /<\/?\s*([A-Za-z][\w:-]*)/g, "keyword", 75, 1);
  addMatches(candidates, source, /\s([A-Za-z_:][\w:.-]*)(?=\s*(?:=|\/?>))/g, "builtin", 60, 1);
  addMatches(candidates, source, /&(?:#\d+|#x[\da-f]+|[A-Za-z][\w-]*);/gi, "builtin", 58);
  addMatches(candidates, source, /<\/?|\/?>/g, "operator", 20);
  return resolveCandidates(candidates);
}

export const htmlLanguageProvider: LanguageProvider = {
  id: "module.html.language",
  name: "HTML",
  extensions: [".html", ".htm"],
  priority: -1000,
  highlight: highlightHtml,
  async lint() {
    return [];
  },
};
