import { textPositionAtOffset } from "./text-position";

/**
 * Projeção de dobras vista pela busca do editor. Só o suficiente para decidir se um match está
 * oculto e para traduzir a linha do arquivo na linha visível — o resto do modelo vive no App.
 */
export interface FoldSearchProjection {
  readonly hiddenLineByFileLine: readonly boolean[];
  readonly visibleLineByFileLine: readonly number[];
}

export interface FoldSearchRange {
  readonly startLine: number;
  readonly endLine: number;
}

export interface FoldSearchMatch {
  readonly start: number;
  readonly end: number;
}

/**
 * Remove as dobras que escondem `fileLine` (inclusive as aninhadas). A linha de cabeçalho continua
 * visível quando dobrada, então só contam as linhas `startLine + 1 .. endLine`.
 */
export function foldsRevealingFileLine<TFold extends FoldSearchRange>(
  folds: readonly TFold[],
  fileLine: number,
): readonly TFold[] {
  return folds.filter((fold) => fileLine <= fold.startLine || fileLine > fold.endLine);
}

export function foldSearchVisibleLine(
  projection: FoldSearchProjection | undefined,
  fileLine: number,
): number {
  return projection?.visibleLineByFileLine[fileLine - 1] ?? fileLine;
}

/**
 * Um match só pode ser realçado na camada visual quando nenhuma das suas pontas caiu dentro de um
 * bloco dobrado — offsets ocultos colapsam para o fim da linha visível anterior e a faixa some.
 */
export function foldSearchMatchVisible(
  source: string,
  projection: FoldSearchProjection | undefined,
  match: FoldSearchMatch | undefined,
): boolean {
  if (!match) return false;
  if (!projection) return true;
  const startLine = textPositionAtOffset(source, match.start).line;
  const endLine = textPositionAtOffset(source, match.end).line;
  return !projection.hiddenLineByFileLine[startLine - 1]
    && !projection.hiddenLineByFileLine[endLine - 1];
}
