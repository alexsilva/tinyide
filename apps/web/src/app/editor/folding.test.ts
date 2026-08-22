import { describe, expect, it } from "vitest";
import {
  collapseFolds,
  foldedDiagnostics,
  normalizeFoldRanges,
  remapDocumentFoldsAfterEdit,
  type DocumentFold,
} from "./folding";

const fold = (overrides: Partial<DocumentFold> = {}): DocumentFold => ({
  id: "fold-1",
  startLine: 2,
  endLine: 4,
  hiddenText: "    one\n    two",
  ...overrides,
});

describe("editor folding", () => {
  it("normalizes duplicate and invalid provider ranges", () => {
    expect(normalizeFoldRanges([
      { startLine: 2, endLine: 5, kind: "code" },
      { startLine: 2, endLine: 5, kind: "comment" },
      { startLine: 5, endLine: 5 },
      { startLine: 0, endLine: 2 },
      { startLine: 7, endLine: 99 },
    ], 8)).toEqual([
      { startLine: 2, endLine: 5, kind: "comment" },
      { startLine: 7, endLine: 8 },
    ]);
  });

  it("collapses hidden lines while keeping file/visible line mappings", () => {
    const source = "head\nif ready:\n    one\n    two\ntail";
    const projection = collapseFolds(source, [fold()]);

    expect(projection.content).toContain("if ready:\n⋯ 2 linha(s) ocultas");
    expect(projection.content).toContain("tail");
    expect(projection.fileLineByVisibleLine).toEqual([1, 2, 3, 5]);
    expect(projection.visibleLineByFileLine).toEqual([1, 2, 3, 3, 4]);
    expect(projection.hiddenLineByFileLine).toEqual([false, false, true, true, false]);
    expect(projection.foldIdByHeaderVisibleLine.get(2)).toBe("fold-1");
    expect(projection.foldIdByMarkerVisibleLine.get(3)).toBe("fold-1");
  });

  it("maps diagnostics inside collapsed blocks to the fold marker", () => {
    const projection = collapseFolds("head\nif ready:\n    one\n    two\ntail", [fold()]);
    const diagnostics = foldedDiagnostics([
      { severity: "error", message: "broken", line: 4, column: 5 },
    ], projection);

    expect(diagnostics).toEqual([
      { severity: "error", message: "broken (bloco dobrado)", line: 3, column: 1 },
    ]);
  });

  it("moves a fold when lines are inserted before it and drops it when hidden text changes", () => {
    const source = "head\nif ready:\n    one\n    two\ntail";
    expect(remapDocumentFoldsAfterEdit(source, `intro\n${source}`, [fold()])).toEqual([
      fold({ startLine: 3, endLine: 5 }),
    ]);

    expect(remapDocumentFoldsAfterEdit(source, source.replace("one", "changed"), [fold()])).toEqual([]);
  });
});
