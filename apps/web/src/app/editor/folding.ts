import type { TextDiagnostic, TextEditorFoldingRange } from "@tinyide/plugin-api";
import type { StoredDocumentFold } from "../persistence";
import { textOffsetAtPosition } from "./text-position";

export type FoldRange = TextEditorFoldingRange;
export interface DocumentFold extends StoredDocumentFold {}

export interface FoldProjection {
  readonly content: string;
  readonly fileLineByVisibleLine: readonly number[];
  readonly visibleLineByFileLine: readonly number[];
  readonly hiddenLineByFileLine: readonly boolean[];
  readonly foldIdByHeaderVisibleLine: ReadonlyMap<number, string>;
  readonly foldIdByMarkerVisibleLine: ReadonlyMap<number, string>;
  readonly hiddenTextByFoldId: ReadonlyMap<string, string>;
}

export function normalizeFoldRanges(
  ranges: readonly TextEditorFoldingRange[],
  lineCount: number,
): readonly FoldRange[] {
  const byKey = new Map<string, FoldRange>();
  const maximumLine = Math.max(1, Math.trunc(lineCount));

  for (const range of ranges) {
    const startLine = Math.trunc(range.startLine);
    const endLine = Math.min(maximumLine, Math.trunc(range.endLine));
    if (!Number.isFinite(startLine) || !Number.isFinite(endLine)) continue;
    if (startLine < 1 || startLine >= maximumLine || endLine <= startLine) continue;
    byKey.set(`${startLine}:${endLine}`, {
      startLine,
      endLine,
      ...(range.kind === undefined ? {} : { kind: range.kind }),
      ...(range.collapsedText === undefined ? {} : { collapsedText: range.collapsedText }),
    });
  }

  return [...byKey.values()].sort((left, right) =>
    left.startLine - right.startLine
    || right.endLine - left.endLine
  );
}

function foldMarker(id: string, hiddenLineCount: number): string {
  return `⋯ ${hiddenLineCount} linha(s) ocultas ⟦fold:${id}⟧ ⋯`;
}

export function collapseFolds(content: string, folds: readonly DocumentFold[]): FoldProjection {
  const lines = content.split("\n");
  const lineCount = lines.length;
  const validFolds = folds
    .map((fold) => ({
      ...fold,
      startLine: Math.trunc(fold.startLine),
      endLine: Math.trunc(fold.endLine),
    }))
    .filter((fold) => (
      fold.id
      && Number.isFinite(fold.startLine)
      && Number.isFinite(fold.endLine)
      && fold.startLine >= 1
      && fold.startLine < fold.endLine
      && fold.endLine <= lineCount
    ))
    .sort((left, right) => left.startLine - right.startLine || right.endLine - left.endLine);

  const output: string[] = [];
  const fileLineByVisibleLine: number[] = [];
  const visibleLineByFileLine = Array.from({ length: lineCount }, (_, index) => index + 1);
  const hiddenLineByFileLine = Array.from({ length: lineCount }, () => false);
  const foldIdByHeaderVisibleLine = new Map<number, string>();
  const foldIdByMarkerVisibleLine = new Map<number, string>();
  const hiddenTextByFoldId = new Map<string, string>();

  let foldIndex = 0;
  let fileLine = 1;
  while (fileLine <= lineCount) {
    while (foldIndex < validFolds.length && validFolds[foldIndex]!.startLine < fileLine) foldIndex += 1;
    const fold = validFolds[foldIndex];
    if (fold && fold.startLine === fileLine) {
      const headerVisibleLine = output.length + 1;
      output.push(lines[fileLine - 1] ?? "");
      fileLineByVisibleLine[headerVisibleLine - 1] = fileLine;
      visibleLineByFileLine[fileLine - 1] = headerVisibleLine;
      foldIdByHeaderVisibleLine.set(headerVisibleLine, fold.id);

      const hiddenText = lines.slice(fold.startLine, fold.endLine).join("\n");
      const markerVisibleLine = output.length + 1;
      const indent = (lines[fileLine - 1] ?? "").match(/^[ \t]*/)?.[0] ?? "";
      output.push(`${indent}${foldMarker(fold.id, fold.endLine - fold.startLine)}`);
      fileLineByVisibleLine[markerVisibleLine - 1] = fold.startLine + 1;
      foldIdByMarkerVisibleLine.set(markerVisibleLine, fold.id);
      hiddenTextByFoldId.set(fold.id, hiddenText);

      for (let hiddenLine = fold.startLine + 1; hiddenLine <= fold.endLine; hiddenLine += 1) {
        visibleLineByFileLine[hiddenLine - 1] = markerVisibleLine;
        hiddenLineByFileLine[hiddenLine - 1] = true;
      }

      fileLine = fold.endLine + 1;
      foldIndex += 1;
      while (foldIndex < validFolds.length && validFolds[foldIndex]!.startLine <= fold.endLine) foldIndex += 1;
      continue;
    }

    const visibleLine = output.length + 1;
    output.push(lines[fileLine - 1] ?? "");
    fileLineByVisibleLine[visibleLine - 1] = fileLine;
    visibleLineByFileLine[fileLine - 1] = visibleLine;
    fileLine += 1;
  }

  return {
    content: output.join("\n"),
    fileLineByVisibleLine,
    visibleLineByFileLine,
    hiddenLineByFileLine,
    foldIdByHeaderVisibleLine,
    foldIdByMarkerVisibleLine,
    hiddenTextByFoldId,
  };
}

export function foldedDiagnostics(
  diagnostics: readonly TextDiagnostic[],
  projection: FoldProjection,
): readonly TextDiagnostic[] {
  const seen = new Set<string>();
  const result: TextDiagnostic[] = [];
  for (const diagnostic of diagnostics) {
    const line = projection.visibleLineByFileLine[diagnostic.line - 1] ?? diagnostic.line;
    const hidden = projection.hiddenLineByFileLine[diagnostic.line - 1] === true;
    const endLine = diagnostic.endLine === undefined
      ? undefined
      : projection.visibleLineByFileLine[diagnostic.endLine - 1] ?? diagnostic.endLine;
    const mapped: TextDiagnostic = {
      severity: diagnostic.severity,
      message: hidden ? `${diagnostic.message} (bloco dobrado)` : diagnostic.message,
      line,
      column: hidden ? 1 : diagnostic.column,
      ...(diagnostic.code === undefined ? {} : { code: diagnostic.code }),
      ...(endLine === undefined ? {} : { endLine }),
      ...(hidden || diagnostic.endColumn === undefined ? {} : { endColumn: diagnostic.endColumn }),
    };
    const key = `${mapped.severity}:${mapped.line}:${mapped.column}:${mapped.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(mapped);
  }
  return result;
}

function lineStartOffset(source: string, line: number): number {
  return textOffsetAtPosition(source, { line, column: 1 });
}

export function remapDocumentFoldsAfterEdit(
  previousSource: string,
  nextSource: string,
  folds: readonly DocumentFold[],
): readonly DocumentFold[] {
  if (!folds.length || previousSource === nextSource) return folds;
  let prefix = 0;
  const commonLength = Math.min(previousSource.length, nextSource.length);
  while (prefix < commonLength && previousSource[prefix] === nextSource[prefix]) prefix += 1;
  let previousSuffix = previousSource.length;
  let nextSuffix = nextSource.length;
  while (
    previousSuffix > prefix
    && nextSuffix > prefix
    && previousSource[previousSuffix - 1] === nextSource[nextSuffix - 1]
  ) {
    previousSuffix -= 1;
    nextSuffix -= 1;
  }
  const removed = previousSource.slice(prefix, previousSuffix);
  const inserted = nextSource.slice(prefix, nextSuffix);
  const lineDelta = (inserted.match(/\n/g)?.length ?? 0) - (removed.match(/\n/g)?.length ?? 0);
  const insertedHasLineBreak = inserted.includes("\n") || removed.includes("\n");

  return folds.flatMap((fold) => {
    const headerStart = lineStartOffset(previousSource, fold.startLine);
    const hiddenStart = lineStartOffset(previousSource, fold.startLine + 1);
    const afterFold = fold.endLine < previousSource.split("\n").length
      ? lineStartOffset(previousSource, fold.endLine + 1)
      : previousSource.length;

    const touchesHidden = previousSuffix > prefix
      ? prefix < afterFold && previousSuffix > hiddenStart
      : prefix >= hiddenStart && prefix < afterFold;
    if (touchesHidden) return [];
    if (prefix < hiddenStart && previousSuffix > headerStart && insertedHasLineBreak) return [];

    if (previousSuffix <= headerStart && lineDelta !== 0) {
      return [{ ...fold, startLine: fold.startLine + lineDelta, endLine: fold.endLine + lineDelta }];
    }
    if (previousSuffix <= hiddenStart && lineDelta !== 0) {
      return [{ ...fold, endLine: fold.endLine + lineDelta }];
    }
    return [fold];
  });
}
