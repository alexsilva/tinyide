import type { LanguageDocumentFormattingResult } from "@tinyide/plugin-api";

export interface GenericDocumentFormattingRequest {
  readonly content: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
}

const START_MARKER = "\uE000tinyide-format-start\uE001";
const END_MARKER = "\uE000tinyide-format-end\uE001";
const ASSIGNMENT_OPERATORS = ["===", "!==", "=>", "==", "!=", "<=", ">=", "+=", "-=", "*=", "/=", "%=", "&&", "||", "="] as const;

interface CodeShape {
  readonly braces: number;
  readonly semicolons: number;
}

function lineBreakFor(source: string): "\r\n" | "\n" {
  return source.includes("\r\n") ? "\r\n" : "\n";
}

function codeShape(source: string): CodeShape {
  let braces = 0;
  let semicolons = 0;
  let quote: "'" | '"' | "`" | undefined;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (char === "\\") {
        index += 1;
        continue;
      }
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{" || char === "}") braces += 1;
    if (char === ";") semicolons += 1;
  }
  return { braces, semicolons };
}

function genericWhitespaceFormat(source: string): string {
  const newline = lineBreakFor(source);
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  // Sem estrutura suficiente para inferir código com segurança, o formatter é conservador:
  // mantém o conteúdo e só remove whitespace em linhas completamente vazias.
  return lines.map((line) => line.trim() ? line : "").join(newline);
}

function formatBraceStructuredSource(source: string): string {
  const newline = lineBreakFor(source);
  const normalized = source.replaceAll("\r\n", "\n");
  const lines: string[] = [];
  let current = "";
  let indent = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let quote: "'" | '"' | "`" | undefined;
  let lineComment = false;
  let blockComment = false;
  let pendingSpace = false;

  const indentation = () => "  ".repeat(Math.max(0, indent));
  const currentTrimmed = () => current.trimEnd();
  const setCurrent = (value: string) => { current = value; };
  const ensureIndent = () => {
    if (!current) current = indentation();
  };
  const flushLine = () => {
    const value = currentTrimmed();
    if (value.trim()) lines.push(value);
    else if (lines.length && lines.at(-1) !== "") lines.push("");
    current = "";
    pendingSpace = false;
  };
  const append = (value: string, spaceBefore = false) => {
    ensureIndent();
    const trimmed = currentTrimmed() || indentation();
    const meaningful = trimmed.trim();
    if (spaceBefore && meaningful && !trimmed.endsWith(" ")) current = `${trimmed} `;
    else if (pendingSpace && meaningful && !/[([{.]$/.test(meaningful)) current = `${trimmed} `;
    else current = trimmed;
    current += value;
    pendingSpace = false;
  };
  const nextSignificant = (from: number) => {
    for (let index = from; index < normalized.length; index += 1) {
      if (!/\s/.test(normalized[index] ?? "")) return normalized[index];
    }
    return undefined;
  };

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];

    if (lineComment) {
      if (char === "\n") {
        lineComment = false;
        flushLine();
      } else {
        current += char;
      }
      continue;
    }

    if (blockComment) {
      ensureIndent();
      current += char;
      if (char === "*" && next === "/") {
        current += "/";
        index += 1;
        blockComment = false;
      } else if (char === "\n") {
        flushLine();
      }
      continue;
    }

    if (quote) {
      ensureIndent();
      current += char;
      if (char === "\\") {
        if (next !== undefined) {
          current += next;
          index += 1;
        }
        continue;
      }
      if (char === quote) quote = undefined;
      continue;
    }

    if (char === "/" && next === "/") {
      append("//", Boolean(current.trim()));
      index += 1;
      lineComment = true;
      continue;
    }
    if (char === "/" && next === "*") {
      append("/*", Boolean(current.trim()));
      index += 1;
      blockComment = true;
      continue;
    }
    if (char === "#" && !current.trim()) {
      ensureIndent();
      current += char;
      lineComment = true;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      append(char);
      quote = char;
      continue;
    }

    if (/\s/.test(char ?? "")) {
      if (char === "\n" && current.trim() && (lineComment || blockComment)) flushLine();
      else pendingSpace = Boolean(current.trim());
      continue;
    }

    if (char === "{") {
      append("{", Boolean(current.trim()));
      flushLine();
      indent += 1;
      continue;
    }
    if (char === "}") {
      if (current.trim()) flushLine();
      indent = Math.max(0, indent - 1);
      append("}");
      const following = nextSignificant(index + 1);
      if (following !== ";" && following !== "," && following !== ")" && following !== "]") flushLine();
      continue;
    }
    if (char === ";") {
      append(";");
      if (parenDepth === 0 && bracketDepth === 0) flushLine();
      else pendingSpace = true;
      continue;
    }
    if (char === ",") {
      append(",");
      pendingSpace = true;
      continue;
    }
    if (char === ":") {
      append(":");
      pendingSpace = true;
      continue;
    }
    if (char === "(") {
      append("(");
      parenDepth += 1;
      continue;
    }
    if (char === ")") {
      append(")");
      parenDepth = Math.max(0, parenDepth - 1);
      continue;
    }
    if (char === "[") {
      append("[");
      bracketDepth += 1;
      continue;
    }
    if (char === "]") {
      append("]");
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }

    const operator = ASSIGNMENT_OPERATORS.find((candidate) => normalized.startsWith(candidate, index));
    if (operator) {
      const trimmed = currentTrimmed();
      if (trimmed && !trimmed.endsWith(" ")) current = `${trimmed} `;
      current += operator;
      pendingSpace = true;
      index += operator.length - 1;
      continue;
    }

    append(char ?? "");
  }

  if (current.trim()) flushLine();
  while (lines.at(-1) === "") lines.pop();
  return lines.length ? `${lines.join(newline)}${newline}` : "";
}

export function formatGenericSource(source: string): string {
  const trimmed = source.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      return `${JSON.stringify(parsed, null, 2)}${lineBreakFor(source)}`;
    } catch {
      // Não é JSON: continua para as heurísticas conservadoras de código.
    }
  }
  const shape = codeShape(source);
  if (shape.braces >= 1 && shape.semicolons >= 1) {
    return formatBraceStructuredSource(source);
  }
  return genericWhitespaceFormat(source);
}

function uniqueMarker(base: string, source: string): string {
  let marker = base;
  while (source.includes(marker)) marker += "_";
  return marker;
}

export function formatGenericDocument(request: GenericDocumentFormattingRequest): LanguageDocumentFormattingResult {
  const selectionStart = Math.max(0, Math.min(request.selectionStart, request.content.length));
  const selectionEnd = Math.max(selectionStart, Math.min(request.selectionEnd, request.content.length));
  const startMarker = uniqueMarker(START_MARKER, request.content);
  const endMarker = uniqueMarker(END_MARKER, `${request.content}${startMarker}`);
  const marked = `${request.content.slice(0, selectionStart)}${startMarker}${request.content.slice(selectionStart, selectionEnd)}${endMarker}${request.content.slice(selectionEnd)}`;
  const formattedMarked = formatGenericSource(marked);
  const mappedStart = formattedMarked.indexOf(startMarker);
  const withoutStart = mappedStart >= 0
    ? `${formattedMarked.slice(0, mappedStart)}${formattedMarked.slice(mappedStart + startMarker.length)}`
    : formattedMarked;
  const mappedEnd = withoutStart.indexOf(endMarker);
  const content = mappedEnd >= 0
    ? `${withoutStart.slice(0, mappedEnd)}${withoutStart.slice(mappedEnd + endMarker.length)}`
    : withoutStart;

  return {
    content,
    selectionStart: mappedStart >= 0 ? mappedStart : Math.min(selectionStart, content.length),
    selectionEnd: mappedEnd >= 0 ? mappedEnd : Math.min(selectionEnd, content.length),
  };
}
