/**
 * Recorte do documento entregue ao realçador quando só a janela visível é materializada.
 *
 * Realçar o arquivo inteiro a cada tecla é o trabalho mais caro do editor em arquivos grandes:
 * o tokenizador percorre centenas de milhares de caracteres para pintar as ~80 linhas que o
 * usuário tem na tela. Recortar só é seguro se o pedaço entregue começar num ponto em que o
 * tokenizador estaria em estado neutro — fora de docstring, comentário de bloco, cerca de código
 * ou template literal. Começar dentro de uma delas inverte a leitura do arquivo: o delimitador de
 * fechamento vira abertura e a tela inteira se pinta como string.
 *
 * Adivinhar esse estado por paridade de delimitadores a partir de um ponto arbitrário não
 * funciona — foi o que produziu exatamente essa falha em arquivos Python reais, onde uma crase de
 * prosa dentro de uma docstring bastava para recuar o recorte para o meio dela. Aqui o estado é
 * apurado por varredura léxica desde o início do documento, que é o único ponto sabidamente
 * neutro. A varredura é rasa — não produz tokens, só acompanha aberturas e fechamentos, e salta
 * de delimitador em delimitador com `indexOf`: 0,9 ms num arquivo Python de 548 KB, contra as
 * dezenas de milissegundos que o tokenizador gastaria para ler o mesmo texto.
 */

export interface SyntaxSlice {
  readonly start: number;
  readonly end: number;
}

/** Conjunto de regras léxicas que decide o que atravessa linhas no arquivo aberto. */
export type SyntaxDialect =
  | "python"
  | "c-like"
  | "stylesheet"
  | "markup"
  | "markdown"
  | "hash"
  | "generic";

interface LineComment {
  readonly token: string;
  /** `#` só inicia comentário na indentação: no realce genérico ele também vale só ali. */
  readonly afterIndentOnly?: boolean;
}

interface MultilineDelimiter {
  readonly open: string;
  readonly close: string;
  /** Barras invertidas escapam o fechamento em strings, mas não em comentários. */
  readonly escapes: boolean;
  /**
   * Aspa de linha única que chegou à quebra escapada: `f"texto \` continua na linha seguinte e,
   * até fechar, o início de linha não é ponto neutro.
   */
  readonly continuation?: boolean;
}

interface DialectRules {
  readonly lineComments: readonly LineComment[];
  readonly multiline: readonly MultilineDelimiter[];
  /** Aspas que fecham no delimitador ou, no máximo, no fim da própria linha. */
  readonly lineStrings: readonly string[];
}

const BLOCK_COMMENT: MultilineDelimiter = { open: "/*", close: "*/", escapes: false };
const MARKUP_COMMENT: MultilineDelimiter = { open: "<!--", close: "-->", escapes: false };
const QUOTES = ['"', "'"] as const;

const DIALECT_RULES: Readonly<Record<SyntaxDialect, DialectRules>> = {
  python: {
    lineComments: [{ token: "#" }],
    multiline: [
      { open: '"""', close: '"""', escapes: true },
      { open: "'''", close: "'''", escapes: true },
    ],
    lineStrings: QUOTES,
  },
  "c-like": {
    lineComments: [{ token: "//" }],
    multiline: [BLOCK_COMMENT, { open: "`", close: "`", escapes: true }],
    lineStrings: QUOTES,
  },
  stylesheet: {
    lineComments: [{ token: "//" }],
    multiline: [BLOCK_COMMENT],
    lineStrings: QUOTES,
  },
  markup: {
    lineComments: [],
    multiline: [MARKUP_COMMENT],
    lineStrings: QUOTES,
  },
  markdown: {
    lineComments: [],
    multiline: [
      MARKUP_COMMENT,
      { open: "```", close: "```", escapes: false },
      { open: "~~~", close: "~~~", escapes: false },
    ],
    // Prosa é cheia de apóstrofos e aspas soltas: tratá-los como string atrapalharia mais do que
    // ajuda, e nenhum deles atravessa linhas no realce de markdown.
    lineStrings: [],
  },
  hash: {
    lineComments: [{ token: "#" }],
    multiline: [],
    lineStrings: QUOTES,
  },
  generic: {
    lineComments: [{ token: "//" }, { token: "#", afterIndentOnly: true }],
    multiline: [BLOCK_COMMENT, { open: "`", close: "`", escapes: true }],
    lineStrings: QUOTES,
  },
};

/**
 * O recorte pode crescer para trás sem limite quando um construto abre muito acima: entregar
 * menos contexto do que o necessário pinta a tela inteira errado, e o custo de um construto
 * gigantesco é o mesmo que o editor pagava antes de existir janela. Para frente vale um teto: o
 * pior caso ali é um comentário enorme ficar sem cor, não o arquivo mudar de cor.
 */
const MAX_TRAILING_CONTEXT = 64 * 1024;

interface OpenConstruct {
  readonly opensAt: number;
  readonly delimiter: MultilineDelimiter;
}

const MATCHERS = new Map<SyntaxDialect, RegExp>();

function matcherFor(dialect: SyntaxDialect): RegExp {
  const cached = MATCHERS.get(dialect);
  if (cached) return cached;
  const rules = DIALECT_RULES[dialect];
  const tokens = [
    ...rules.lineComments.map((comment) => comment.token),
    ...rules.multiline.map((delimiter) => delimiter.open),
    ...rules.lineStrings,
  ]
    // Alternativas mais longas primeiro: `"""` precisa ganhar de `"`.
    .sort((left, right) => right.length - left.length)
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const matcher = new RegExp(tokens.join("|"), "g");
  MATCHERS.set(dialect, matcher);
  return matcher;
}

function lineStartAt(source: string, offset: number): number {
  if (offset <= 0) return 0;
  return source.lastIndexOf("\n", offset - 1) + 1;
}

function lineEndAt(source: string, offset: number): number {
  const lineBreak = source.indexOf("\n", offset);
  return lineBreak === -1 ? source.length : lineBreak + 1;
}

function isEscaped(source: string, offset: number): boolean {
  let backslashes = 0;
  while (offset - backslashes > 0 && source[offset - backslashes - 1] === "\\") backslashes += 1;
  return backslashes % 2 === 1;
}

/** Fim de uma string de linha única: o fechamento, a quebra de linha ou o fim do documento. */
function lineStringEndFrom(source: string, cursor: number, quote: string): number {
  let index = cursor;
  while (index < source.length) {
    const char = source[index];
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === "\n") return index;
    if (char === quote) return index + quote.length;
    index += 1;
  }
  return source.length;
}

/** Fim (exclusivo) do fechamento de `delimiter` a partir de `from`, ou -1 quando não fecha. */
function closeOf(source: string, delimiter: MultilineDelimiter, from: number): number {
  if (delimiter.continuation) return lineStringEndFrom(source, from, delimiter.close);
  let at = source.indexOf(delimiter.close, from);
  while (at !== -1) {
    if (!delimiter.escapes || !isEscaped(source, at)) return at + delimiter.close.length;
    at = source.indexOf(delimiter.close, at + 1);
  }
  return -1;
}

const CONTINUED_STRINGS = new Map<string, MultilineDelimiter>();

function continuedString(quote: string): MultilineDelimiter {
  const cached = CONTINUED_STRINGS.get(quote);
  if (cached) return cached;
  const delimiter: MultilineDelimiter = { open: quote, close: quote, escapes: true, continuation: true };
  CONTINUED_STRINGS.set(quote, delimiter);
  return delimiter;
}

function onlyIndentBefore(source: string, offset: number): boolean {
  for (let index = lineStartAt(source, offset); index < offset; index += 1) {
    const char = source[index];
    if (char !== " " && char !== "\t") return false;
  }
  return true;
}

/**
 * Estado léxico em `to`, partindo de `from` com `initial` (que precisa ser o estado real ali).
 * Devolve o construto multi-linha aberto, ou `undefined` quando o ponto é neutro.
 */
function scanTo(
  source: string,
  from: number,
  to: number,
  initial: OpenConstruct | undefined,
  dialect: SyntaxDialect,
): OpenConstruct | undefined {
  const rules = DIALECT_RULES[dialect];
  const matcher = matcherFor(dialect);
  let open = initial;
  let index = from;
  while (index < to) {
    if (open) {
      const closesAt = closeOf(source, open.delimiter, index);
      if (closesAt < 0 || closesAt > to) return open;
      index = closesAt;
      open = undefined;
      continue;
    }
    matcher.lastIndex = index;
    const match = matcher.exec(source);
    if (!match || match.index >= to) return undefined;
    const at = match.index;
    const value = match[0];
    const lineComment = rules.lineComments.find((comment) => comment.token === value);
    if (lineComment) {
      if (lineComment.afterIndentOnly && !onlyIndentBefore(source, at)) {
        index = at + value.length;
        continue;
      }
      index = lineEndAt(source, at);
      continue;
    }
    const delimiter = rules.multiline.find((candidate) => candidate.open === value);
    if (delimiter) {
      open = { opensAt: at, delimiter };
      index = at + value.length;
      continue;
    }
    const stringEnd = lineStringEndFrom(source, at + value.length, value);
    if (stringEnd > to) return { opensAt: at, delimiter: continuedString(value) };
    index = stringEnd;
  }
  return open;
}

/**
 * Expande `[windowStart, windowEnd)` até bordas em que o tokenizador pode começar e parar sem
 * interpretar mal o texto. Devolve o documento inteiro quando a janela já o cobre.
 */
export function resolveSyntaxSlice(
  source: string,
  windowStart: number,
  windowEnd: number,
  dialect: SyntaxDialect = "generic",
): SyntaxSlice {
  const requestedStart = Math.max(0, Math.min(source.length, windowStart));
  const requestedEnd = Math.max(requestedStart, Math.min(source.length, windowEnd));
  if (requestedStart <= 0 && requestedEnd >= source.length) return { start: 0, end: source.length };

  // A âncora é o início da linha: comentários de linha não atravessam a quebra, então ali o estado
  // só pode ser "dentro de um construto multi-linha" ou neutro.
  const anchor = lineStartAt(source, requestedStart);
  if (DIALECT_RULES[dialect].multiline.length === 0) {
    return { start: anchor, end: Math.max(lineEndAt(source, requestedEnd), requestedEnd) };
  }

  const openAtStart = scanTo(source, 0, anchor, undefined, dialect);
  const start = openAtStart ? lineStartAt(source, openAtStart.opensAt) : anchor;

  const windowLimit = lineEndAt(source, requestedEnd);
  const openAtEnd = scanTo(source, anchor, windowLimit, openAtStart, dialect);
  let end = windowLimit;
  if (openAtEnd) {
    const ceiling = Math.min(source.length, requestedEnd + MAX_TRAILING_CONTEXT);
    const closesAt = closeOf(source, openAtEnd.delimiter, Math.max(windowLimit, openAtEnd.opensAt + openAtEnd.delimiter.open.length));
    end = closesAt < 0 || closesAt > ceiling ? ceiling : Math.max(end, lineEndAt(source, closesAt));
  }

  return { start, end: Math.max(end, requestedEnd) };
}
