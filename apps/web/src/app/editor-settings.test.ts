import { describe, expect, it } from "vitest";
import {
  editorDocumentIndex,
  editorDocumentMetrics,
  editorGutterWidth,
  editorLineNumbers,
  editorVisibleLineRange,
  resolveEditorSettings,
  syntaxHighlightPlan,
} from "./editor-settings";

describe("editor settings", () => {
  it("enables line numbers by default", () => {
    expect(resolveEditorSettings()).toEqual({ lineNumbers: true });
  });

  it("respects an explicit user preference", () => {
    expect(resolveEditorSettings({ lineNumbers: false }))
      .toEqual({ lineNumbers: false });
  });

  it("creates one ruler entry for every editor line", () => {
    expect(editorLineNumbers("")).toEqual(["01"]);
    expect(editorLineNumbers("first\nsecond\n")).toEqual(["01", "02", "03"]);
  });

  it("expands the zero-padded width for larger files", () => {
    const source = Array.from({ length: 100 }, () => "line").join("\n");
    const numbers = editorLineNumbers(source);
    expect(numbers[0]).toBe("001");
    expect(numbers[8]).toBe("009");
    expect(numbers[99]).toBe("100");
  });

  it("widens the gutter when line numbers have four or more digits", () => {
    expect(editorGutterWidth("line\n".repeat(999))).toBe(62);
    expect(editorGutterWidth("line\n".repeat(9_999))).toBe(70);
  });

  it("computes large-file metrics without materializing every line", () => {
    expect(editorDocumentMetrics("first\nsecond\n")).toEqual({
      lineCount: 3,
      lineNumberWidth: 2,
      gutterWidth: 52,
    });
    expect(editorDocumentMetrics("line\n".repeat(9_999))).toEqual({
      lineCount: 10_000,
      lineNumberWidth: 5,
      gutterWidth: 70,
    });
  });

  it("indexes line offsets and the visually widest line in the same pass", () => {
    expect(editorDocumentIndex("a\n\twide\n界界\n", true)).toMatchObject({
      lineCount: 4,
      lineStarts: [0, 2, 8, 11],
      widthGuard: "\twide",
    });
  });

  it("limits the ruler to visible lines plus overscan", () => {
    expect(editorVisibleLineRange(7_008, 50_000, 800)).toEqual({ start: 2_369, end: 2_432 });
    expect(editorVisibleLineRange(7_008, 0, 800)).toEqual({ start: 1, end: 51 });
  });
});

describe("plano de realce de sintaxe", () => {
  it("realça documentos pequenos por inteiro", () => {
    expect(syntaxHighlightPlan(0)).toEqual({ windowed: false, enabled: true });
    expect(syntaxHighlightPlan(3_999)).toEqual({ windowed: false, enabled: true });
  });

  it("janela a partir do limiar", () => {
    expect(syntaxHighlightPlan(4_001)).toEqual({ windowed: true, enabled: true });
  });

  /**
   * Um módulo Python de 14 mil linhas (~550 KB) abria sem realce nenhum: o teto global de 500 KB
   * datava de quando cada tecla realçava o arquivo inteiro. Com a janela, o tamanho não decide.
   */
  it("mantém o realce em arquivos acima do antigo teto global", () => {
    expect(syntaxHighlightPlan(550_000)).toEqual({ windowed: true, enabled: true });
    expect(syntaxHighlightPlan(50_000_000)).toEqual({ windowed: true, enabled: true });
  });
});
