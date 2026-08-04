import type { LanguageProvider, SyntaxToken } from "@tinyide/plugin-api";

export type GenericSyntaxKind =
  | "source"
  | "markup"
  | "stylesheet"
  | "data"
  | "config"
  | "shell"
  | "markdown"
  | "plain";

export interface SyntaxHighlightContext {
  readonly fileName: string;
  readonly mediaType?: string;
  readonly source: string;
}

export interface SyntaxHighlighter {
  readonly id: string;
  readonly name: string;
  readonly origin: "plugin" | "generic";
  highlight(source: string): readonly SyntaxToken[];
}

interface Candidate extends SyntaxToken {
  readonly priority: number;
}

const SOURCE_EXTENSIONS = new Set([
  ".c", ".cc", ".cpp", ".cs", ".dart", ".ex", ".exs", ".go", ".groovy", ".h", ".hpp",
  ".java", ".js", ".jsx", ".kt", ".kts", ".lua", ".m", ".php", ".pl", ".py", ".r",
  ".rb", ".rs", ".scala", ".sql", ".swift", ".ts", ".tsx", ".vb",
]);
const MARKUP_EXTENSIONS = new Set([".astro", ".svg", ".vue", ".xhtml", ".xml"]);
const STYLESHEET_EXTENSIONS = new Set([".css", ".less", ".sass", ".scss", ".styl"]);
const DATA_EXTENSIONS = new Set([".json", ".json5", ".jsonc", ".yaml", ".yml"]);
const CONFIG_EXTENSIONS = new Set([
  ".cfg", ".conf", ".config", ".editorconfig", ".env", ".gitignore", ".ini", ".properties", ".toml",
]);
const SHELL_EXTENSIONS = new Set([".bash", ".bat", ".cmd", ".fish", ".ps1", ".sh", ".zsh"]);
const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx", ".markdown"]);
const SOURCE_KEYWORDS = [
  "abstract", "and", "as", "async", "await", "break", "case", "catch", "class", "const", "continue",
  "def", "default", "delete", "do", "else", "enum", "export", "extends", "finally", "for", "from",
  "function", "if", "implements", "import", "in", "interface", "is", "let", "namespace", "new", "not",
  "of", "or", "package", "private", "protected", "public", "raise", "return", "static", "struct", "switch",
  "throw", "trait", "try", "type", "typeof", "using", "var", "while", "with", "yield",
  "select", "insert", "update", "into", "values", "where", "join", "on", "group", "order", "by", "having",
  "create", "alter", "drop", "table", "view", "index", "begin", "end",
];
const SHELL_KEYWORDS = [
  "case", "do", "done", "elif", "else", "esac", "fi", "for", "function", "if", "in", "select", "then",
  "time", "until", "while",
];
const BUILTIN_VALUES = ["false", "nil", "none", "null", "off", "on", "true", "undefined", "yes", "no"];

function escapedAlternation(values: readonly string[]): string {
  return values.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
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

function addCommonLiterals(candidates: Candidate[], source: string): void {
  addMatches(candidates, source, /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g, "string", 90);
  addMatches(candidates, source, /\b(?:0x[\da-f]+|0b[01]+|(?:\d+\.\d+|\d+)(?:e[+-]?\d+)?)\b/gi, "number", 55);
  addMatches(candidates, source, /(?:===|!==|==|!=|=>|<=|>=|\+\+|--|&&|\|\||\?\?|\+=|-=|\*=|\/=|[+*/%=!<>|&^~?:-])/g, "operator", 15);
}

function addCommonSourceTokens(candidates: Candidate[], source: string): void {
  const keywordPattern = new RegExp(`\\b(?:${escapedAlternation(SOURCE_KEYWORDS)})\\b`, "gi");
  const builtinPattern = new RegExp(`\\b(?:${escapedAlternation(BUILTIN_VALUES)})\\b`, "gi");
  addMatches(candidates, source, keywordPattern, "keyword", 65);
  addMatches(candidates, source, builtinPattern, "builtin", 62);
  addMatches(candidates, source, /@[A-Za-z_$][\w$.-]*/g, "decorator", 70);
  addMatches(candidates, source, /\b[A-Za-z_$][\w$]*(?=\s*\()/g, "function", 58);
  addMatches(candidates, source, /\b(?:class|interface|enum|struct|trait|type)\s+([A-Za-z_$][\w$]*)/gi, "class", 72, 1);
}

function highlightSource(source: string): readonly SyntaxToken[] {
  const candidates: Candidate[] = [];
  addMatches(candidates, source, /\/\*[\s\S]*?\*\//g, "comment", 110);
  addMatches(candidates, source, /(^|[^:])\/\/[^\n]*/gm, "comment", 105);
  addMatches(candidates, source, /^\s*(?:#|--)[^\n]*/gm, "comment", 105);
  addCommonLiterals(candidates, source);
  addCommonSourceTokens(candidates, source);
  return resolveCandidates(candidates);
}

function highlightMarkup(source: string): readonly SyntaxToken[] {
  const candidates: Candidate[] = [];
  addMatches(candidates, source, /<!--[\s\S]*?-->/g, "comment", 110);
  addMatches(candidates, source, /<!DOCTYPE\b[^>]*>/gi, "decorator", 100);
  addCommonLiterals(candidates, source);
  addMatches(candidates, source, /<\/?\s*([A-Za-z][\w:-]*)/g, "keyword", 75, 1);
  addMatches(candidates, source, /\s([A-Za-z_:][\w:.-]*)(?=\s*(?:=|\/?>))/g, "builtin", 60, 1);
  addMatches(candidates, source, /&(?:#\d+|#x[\da-f]+|[A-Za-z][\w-]*);/gi, "builtin", 58);
  addMatches(candidates, source, /<\/?|\/?>/g, "operator", 20);
  return resolveCandidates(candidates);
}

function highlightStylesheet(source: string): readonly SyntaxToken[] {
  const candidates: Candidate[] = [];
  addMatches(candidates, source, /\/\*[\s\S]*?\*\//g, "comment", 110);
  addMatches(candidates, source, /\/\/[^\n]*/g, "comment", 105);
  addCommonLiterals(candidates, source);
  addMatches(candidates, source, /@[A-Za-z-]+/g, "decorator", 75);
  addMatches(candidates, source, /(?:--)?[A-Za-z-]+(?=\s*:)/g, "builtin", 64);
  addMatches(candidates, source, /(?:\.|#)[A-Za-z_][\w-]*/g, "class", 58);
  addMatches(candidates, source, /\b[A-Za-z-]+(?=\s*\()/g, "function", 56);
  return resolveCandidates(candidates);
}

function highlightData(source: string, allowComments: boolean): readonly SyntaxToken[] {
  const candidates: Candidate[] = [];
  if (allowComments) {
    addMatches(candidates, source, /\/\*[\s\S]*?\*\//g, "comment", 110);
    addMatches(candidates, source, /\/\/[^\n]*|^\s*#[^\n]*/gm, "comment", 105);
  }
  addCommonLiterals(candidates, source);
  addMatches(candidates, source, /^\s*([A-Za-z_][\w.-]*)(?=\s*:)/gm, "builtin", 68, 1);
  addMatches(candidates, source, /\b(?:false|null|true)\b/gi, "builtin", 62);
  addMatches(candidates, source, /[{}[\],]/g, "operator", 20);
  return resolveCandidates(candidates);
}

function highlightConfig(source: string): readonly SyntaxToken[] {
  const candidates: Candidate[] = [];
  addMatches(candidates, source, /^\s*(?:#|;)[^\n]*/gm, "comment", 110);
  addCommonLiterals(candidates, source);
  addMatches(candidates, source, /^\s*\[([^\]\n]+)]/gm, "class", 72, 1);
  addMatches(candidates, source, /^\s*([A-Za-z_][\w.-]*)(?=\s*(?:=|:))/gm, "builtin", 68, 1);
  addMatches(candidates, source, /\$\{[^}\n]+}|\$[A-Za-z_][\w]*/g, "builtin", 70);
  addMatches(candidates, source, new RegExp(`\\b(?:${escapedAlternation(BUILTIN_VALUES)})\\b`, "gi"), "builtin", 62);
  return resolveCandidates(candidates);
}

function highlightShell(source: string): readonly SyntaxToken[] {
  const candidates: Candidate[] = [];
  addMatches(candidates, source, /^#![^\n]*/gm, "decorator", 115);
  addMatches(candidates, source, /(^|\s)#[^\n]*/gm, "comment", 108);
  addCommonLiterals(candidates, source);
  addMatches(candidates, source, /\$\{[^}\n]+}|\$[A-Za-z_][\w]*|\$[0-9@*#?$!-]/g, "builtin", 72);
  addMatches(candidates, source, new RegExp(`\\b(?:${escapedAlternation(SHELL_KEYWORDS)})\\b`, "g"), "keyword", 66);
  addMatches(candidates, source, /\b[A-Za-z_][\w-]*(?=\s*\(\s*\))/g, "function", 62);
  return resolveCandidates(candidates);
}

function highlightMarkdown(source: string): readonly SyntaxToken[] {
  const candidates: Candidate[] = [];
  addMatches(candidates, source, /^```[^\n]*$|^~~~[^\n]*$/gm, "decorator", 110);
  addMatches(candidates, source, /^#{1,6}\s+[^\n]*$/gm, "class", 80);
  addMatches(candidates, source, /`[^`\n]+`/g, "string", 90);
  addMatches(candidates, source, /!?(?:\[[^\]\n]*])\([^\s)]+(?:\s+"[^"]*")?\)/g, "builtin", 70);
  addMatches(candidates, source, /^\s*>[^\n]*/gm, "comment", 55);
  addMatches(candidates, source, /(?:\*\*|__|~~|[*_])/g, "operator", 20);
  return resolveCandidates(candidates);
}

function extensionOf(fileName: string): string {
  const baseName = fileName.toLocaleLowerCase().split(/[\\/]/).at(-1) ?? "";
  const dot = baseName.lastIndexOf(".");
  return dot > 0 ? baseName.slice(dot) : baseName.startsWith(".") ? baseName : "";
}

export function genericSyntaxKindFor(context: Pick<SyntaxHighlightContext, "fileName" | "mediaType">): GenericSyntaxKind {
  const lowerName = context.fileName.toLocaleLowerCase().split(/[\\/]/).at(-1) ?? "";
  const extension = extensionOf(lowerName);
  const mediaType = context.mediaType?.toLocaleLowerCase() ?? "";

  if (lowerName === "dockerfile" || lowerName === "makefile" || lowerName.endsWith(".dockerfile")) return "shell";
  if (lowerName === ".env" || lowerName.startsWith(".env.")) return "config";
  if (MARKUP_EXTENSIONS.has(extension) || mediaType.includes("xml") || mediaType.includes("svg")) return "markup";
  if (STYLESHEET_EXTENSIONS.has(extension) || mediaType.includes("css")) return "stylesheet";
  if (MARKDOWN_EXTENSIONS.has(extension) || mediaType.includes("markdown")) return "markdown";
  if (DATA_EXTENSIONS.has(extension) || mediaType.includes("json") || mediaType.includes("yaml")) return "data";
  if (CONFIG_EXTENSIONS.has(extension) || mediaType.includes("toml") || mediaType.includes("ini")) return "config";
  if (SHELL_EXTENSIONS.has(extension) || mediaType.includes("shell")) return "shell";
  if (SOURCE_EXTENSIONS.has(extension) || mediaType.includes("javascript") || mediaType.includes("typescript")) return "source";
  return "plain";
}

export function highlightGenericSyntax(context: SyntaxHighlightContext): readonly SyntaxToken[] {
  const kind = genericSyntaxKindFor(context);
  switch (kind) {
    case "markup": return highlightMarkup(context.source);
    case "stylesheet": return highlightStylesheet(context.source);
    case "data": return highlightData(context.source, /(?:json5|jsonc|yaml|yml)$/i.test(context.fileName));
    case "config": return highlightConfig(context.source);
    case "shell": return highlightShell(context.source);
    case "markdown": return highlightMarkdown(context.source);
    case "source": return highlightSource(context.source);
    case "plain": return highlightSource(context.source);
  }
}

function matchingExtension(provider: LanguageProvider, fileName: string): string | undefined {
  const lowerName = fileName.toLocaleLowerCase();
  return provider.extensions
    .map((extension) => extension.toLocaleLowerCase())
    .filter((extension) => lowerName.endsWith(extension))
    .sort((left, right) => right.length - left.length)[0];
}

export function pluginLanguageProviderFor(
  context: Pick<SyntaxHighlightContext, "fileName">,
  providers: readonly LanguageProvider[],
): LanguageProvider | undefined {
  return providers
    .map((provider, index) => ({ provider, index, extension: matchingExtension(provider, context.fileName) }))
    .filter((item): item is { provider: LanguageProvider; index: number; extension: string } => Boolean(item.extension))
    .sort((left, right) =>
      (right.provider.priority ?? 0) - (left.provider.priority ?? 0)
      || right.extension.length - left.extension.length
      || left.index - right.index
    )[0]?.provider;
}

const GENERIC_NAMES: Readonly<Record<GenericSyntaxKind, string>> = {
  source: "Sintaxe genérica",
  markup: "Marcação genérica",
  stylesheet: "Estilos genéricos",
  data: "Dados estruturados",
  config: "Configuração genérica",
  shell: "Script genérico",
  markdown: "Markdown genérico",
  plain: "Texto com realce genérico",
};

export function resolveSyntaxHighlighter(
  context: SyntaxHighlightContext,
  providers: readonly LanguageProvider[],
): SyntaxHighlighter {
  const pluginProvider = pluginLanguageProviderFor(context, providers);
  if (pluginProvider) {
    return {
      id: pluginProvider.id,
      name: pluginProvider.name,
      origin: "plugin",
      highlight: (source) => pluginProvider.highlight(source),
    };
  }
  const kind = genericSyntaxKindFor(context);
  return {
    id: `generic.${kind}`,
    name: GENERIC_NAMES[kind],
    origin: "generic",
    highlight: (source) => highlightGenericSyntax({ ...context, source }),
  };
}
