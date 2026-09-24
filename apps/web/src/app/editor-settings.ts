import type { WorkspaceEditorSettings } from "./workspace-settings";

export interface ResolvedEditorSettings {
  readonly lineNumbers: boolean;
}

export const DEFAULT_EDITOR_SETTINGS: ResolvedEditorSettings = {
  lineNumbers: true,
};

export const EDITOR_LINE_HEIGHT_FACTOR = 1.65;

/**
 * Altura de linha do editor em px inteiros. O motor de layout quantiza cada line box no grid
 * interno (1/64px no Blink), então um line-height fracionário (13px × 1.65 = 21.45px) renderiza
 * 21.4375px por linha enquanto espaçadores e overlays multiplicam o valor nominal — o desvio de
 * ~0.0125px/linha soma ~12px a cada mil linhas e desalinha caret, régua e sintaxe em arquivos
 * grandes. Valores inteiros são exatos no grid e mantêm texto e aritmética JS coincidentes.
 */
export function editorLineHeightPx(fontSize: number): number {
  return Math.round(fontSize * EDITOR_LINE_HEIGHT_FACTOR);
}

export const EDITOR_DEFAULT_LINE_HEIGHT = editorLineHeightPx(13);
export const EDITOR_CONTENT_PADDING = 18;

export function resolveEditorSettings(
  userSettings?: WorkspaceEditorSettings,
): ResolvedEditorSettings {
  return {
    lineNumbers: userSettings?.lineNumbers ?? true,
  };
}

export function editorLineNumbers(source: string): readonly string[] {
  const count = editorDocumentMetrics(source).lineCount;
  const width = Math.max(2, String(count).length);
  return Array.from({ length: count }, (_, index) => String(index + 1).padStart(width, "0"));
}

export function editorGutterWidth(source: string): number {
  return editorDocumentMetrics(source).gutterWidth;
}

export interface EditorDocumentMetrics {
  readonly lineCount: number;
  readonly lineNumberWidth: number;
  readonly gutterWidth: number;
}

export interface EditorDocumentIndex extends EditorDocumentMetrics {
  readonly lineStarts?: readonly number[];
  readonly widthGuard?: string;
}

/**
 * A partir deste tamanho a camada de sintaxe materializa apenas a janela visível. O limiar é
 * pouco acima do que cabe numa tela: abaixo dele a janela cobriria o arquivo inteiro e a
 * virtualização não pagaria o próprio custo. Acima, cada tecla reescrevia o `pre` inteiro —
 * um arquivo de 2.000 linhas gastava centenas de milissegundos por tecla só removendo e
 * recriando spans que o usuário nem tinha na tela.
 */
export const SYNTAX_WINDOW_MIN_SOURCE_LENGTH = 4_000;

/**
 * Teto do realce **sem** janela: aí o tokenizador lê o documento inteiro a cada tecla e o custo
 * cresce com o arquivo. Com a janela ativa ele recebe só o recorte visível, então o tamanho do
 * arquivo deixa de decidir — por isso o teto vive acima do limiar da janela e nunca desliga o
 * realce de um arquivo grande. Um teto global aplicado a todo documento (o que existia antes da
 * janela) apagava o realce de arquivos legítimos, como um módulo Python de 14 mil linhas.
 */
export const MAX_UNWINDOWED_SYNTAX_SOURCE_LENGTH = 500_000;

export interface SyntaxHighlightPlan {
  /** O realçador recebe só o recorte da janela visível. */
  readonly windowed: boolean;
  /** Há realce; falso apenas para documentos grandes demais para serem realçados por inteiro. */
  readonly enabled: boolean;
}

/**
 * Decide, pelo tamanho do texto que chega à camada de sintaxe, se o realce é janelado e se cabe.
 * O comprimento avaliado é o do conteúdo exibido (com blocos dobrados, o texto projetado), que é
 * exatamente o que o realçador vai ler.
 */
export function syntaxHighlightPlan(displayedLength: number): SyntaxHighlightPlan {
  const windowed = displayedLength > SYNTAX_WINDOW_MIN_SOURCE_LENGTH;
  return { windowed, enabled: windowed || displayedLength <= MAX_UNWINDOWED_SYNTAX_SOURCE_LENGTH };
}

/**
 * Conta linhas sem materializar nenhuma delas. `split("\n").length` aloca um array com o arquivo
 * inteiro recortado só para ler `length` — caro o bastante para aparecer no caminho de digitação.
 */
export function countLines(source: string): number {
  let lines = 1;
  let at = source.indexOf("\n");
  while (at !== -1) {
    lines += 1;
    at = source.indexOf("\n", at + 1);
  }
  return lines;
}

/**
 * Indexa métricas, offsets de linha e linha mais larga em uma única passagem. O editor de arquivos
 * grandes precisa dos três valores; calculá-los separadamente fazia 2-3 varreduras completas a
 * cada alteração de conteúdo.
 */
export function editorDocumentIndex(source: string, materializeLineStarts = false): EditorDocumentIndex {
  let lineCount = 1;
  let lineStart = 0;
  let longestStart = 0;
  let longestLength = 0;
  let longestColumns = -1;
  let lineColumns = 0;
  const lineStarts = materializeLineStarts ? [0] : undefined;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    if (code !== 10) {
      lineColumns += code === 9 ? 4 - (lineColumns % 4) : code >= 0x1100 ? 2 : 1;
      continue;
    }
    const lineLength = index - lineStart;
    if (lineColumns > longestColumns) {
      longestStart = lineStart;
      longestLength = lineLength;
      longestColumns = lineColumns;
    }
    lineStart = index + 1;
    lineColumns = 0;
    lineCount += 1;
    lineStarts?.push(lineStart);
  }
  const finalLength = source.length - lineStart;
  if (lineColumns > longestColumns) {
    longestStart = lineStart;
    longestLength = finalLength;
  }
  const lineNumberWidth = Math.max(2, String(lineCount).length);
  return {
    lineCount,
    lineNumberWidth,
    gutterWidth: Math.max(52, 30 + lineNumberWidth * 8),
    ...(lineStarts ? { lineStarts, widthGuard: source.slice(longestStart, longestStart + longestLength) } : {}),
  };
}

export function editorDocumentMetrics(source: string): EditorDocumentMetrics {
  const { lineCount, lineNumberWidth, gutterWidth } = editorDocumentIndex(source);
  return { lineCount, lineNumberWidth, gutterWidth };
}

export interface EditorVisibleLineRange {
  readonly start: number;
  readonly end: number;
}

export function editorVisibleLineRange(
  lineCount: number,
  scrollTop: number,
  viewportHeight: number,
  overscan = 12,
  lineHeight = EDITOR_DEFAULT_LINE_HEIGHT,
  contentPadding = EDITOR_CONTENT_PADDING,
): EditorVisibleLineRange {
  const firstVisible = Math.floor(Math.max(0, scrollTop - contentPadding) / lineHeight) + 1;
  const lastVisible = Math.ceil(Math.max(0, scrollTop + viewportHeight - contentPadding) / lineHeight) + 1;
  return {
    start: Math.max(1, firstVisible - overscan),
    end: Math.min(Math.max(1, lineCount), lastVisible + overscan),
  };
}
