import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");

describe("folded editor pointer mapping", () => {
  it("maps browser-resolved projected offsets back to source offsets", () => {
    expect(appSource).toContain("function editorSourceOffsetFromProjectedOffset(");
    expect(appSource).toContain("const projectedPosition = textPositionAtOffset(projection.content, rawProjectedOffset)");
    expect(appSource).toContain("function editorProjectedTextOffsetAtClientPoint(");
    expect(appSource).toContain("projection.fileLineByVisibleLine[visibleLineIndex]");
    expect(appSource).toContain("projection.foldIdByMarkerVisibleLine.get(projectedPosition.line)");
  });

  it("prefers the rendered syntax layer for both left click correction and context menus", () => {
    expect(appSource).toContain("onMouseUp={correctFoldedEditorPointerSelection}");
    expect(appSource).toContain("editorMirrorTextOffsetAtClientPoint(textarea, mirror, clientX, clientY)");
    expect(appSource).toContain("editorSourceOffsetFromProjectedOffset(textarea.value, projection, mirrorOffset)");
    expect(appSource).toContain("syntaxLayerRef.current ?? undefined,\n      activeFoldProjection,");
    expect(appSource).toContain("scrollContainer === textarea ? undefined : syntaxLayerRef.current ?? undefined,\n      activeFoldProjection,");
  });

  it("renders a projected caret instead of the native full-document caret while folded", () => {
    expect(appSource).toContain("function editorProjectedOffsetFromSourceOffset(");
    expect(appSource).toContain("function editorMirrorCaretRectAtTextOffset(");
    expect(appSource).toContain('className={`code-editor code-editor--highlighted${activeFoldProjection ? " code-editor--folded" : ""}`}');
    expect(appSource).toContain('className="editor-projected-caret"');
  });

  it("renders projected selections and resolves double-click words from the folded visual layer", () => {
    expect(appSource).toContain("function editorMirrorRectsAtTextRange(");
    expect(appSource).toContain('import { editorContextMenuTargetRange, editorWordRangeAtOffset } from "./editor/context-target"');
    expect(appSource).toContain("onDoubleClick={selectFoldedEditorWordAtPointer}");
    expect(appSource).toContain('className="editor-projected-selection"');
  });

  it("remaps folds after visible edits instead of clearing every fold", () => {
    expect(appSource).toContain("function remapDocumentFoldsAfterEdit(");
    expect(appSource).toContain("const remapped = remapDocumentFoldsAfterEdit(previous.content, content, currentFolds)");
    expect(appSource).not.toContain("if (documentFoldsRef.current.has(activeDocumentId)) clearDocumentFolds(activeDocumentId)");
  });

  it("positions the projected caret on empty visual lines instead of the previous line", () => {
    expect(appSource).toContain("if (lineStart === lineEnd) {");
    expect(appSource).toContain("(position.line - 1) * lineHeight");
    expect(appSource).toContain("Math.max(0, (lineHeight - height) / 2)");
  });

  it("reveals folded search matches and projects the highlight instead of dropping it", () => {
    expect(appSource).toContain("const projection = revealFoldsForFileLine(activeDocument.id, matchFileLine)");
    expect(appSource).toContain("scrollEditorToLine(foldSearchVisibleLine(projection, matchFileLine))");
    expect(appSource).toContain("const remainingFolds = foldsRevealingFileLine(currentFolds, fileLine)");
    expect(appSource).toContain("{...(activeEditorSearchHighlight ? { highlight: activeEditorSearchHighlight } : {})}");
    expect(appSource).not.toContain("activeEditorSearchMatch && !activeFoldProjection ? { highlight: activeEditorSearchMatch }");
  });

  it("projects the context menu target highlight through the folded layer", () => {
    expect(appSource).toContain("const range = editorContextMenuTargetRange(activeEditorContent, context.selectionStart, context.selectionEnd)");
    expect(appSource).toContain("if (!foldSearchMatchVisible(activeEditorContent, activeFoldProjection, range)) return undefined;");
    expect(appSource).toContain("{...(editorContextTargetHighlight ? { contextTarget: editorContextTargetHighlight } : {})}");
  });

  it("remaps folds for programmatic replacements such as line-diff undo", () => {
    expect(appSource).toContain("const remapped = remapDocumentFoldsAfterEdit(previousContent, request.content, currentFolds)");
    expect(appSource).not.toContain("O conteúdo veio de fora do editor: as dobras registradas não valem mais para este texto.");
  });
});
