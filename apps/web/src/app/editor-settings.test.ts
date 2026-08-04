import { describe, expect, it } from "vitest";
import {
  editorDocumentMetrics,
  editorGutterWidth,
  editorLineNumbers,
  editorVisibleLineRange,
  resolveEditorSettings,
} from "./editor-settings";

describe("editor settings", () => {
  it("enables line numbers by default", () => {
    expect(resolveEditorSettings({ version: 1 })).toEqual({ lineNumbers: true });
  });

  it("respects an explicit workspace override", () => {
    expect(resolveEditorSettings({ version: 1, editor: { lineNumbers: false } }))
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

  it("limits the ruler to visible lines plus overscan", () => {
    expect(editorVisibleLineRange(7_008, 50_000, 800)).toEqual({ start: 2_319, end: 2_381 });
    expect(editorVisibleLineRange(7_008, 0, 800)).toEqual({ start: 1, end: 50 });
  });
});
