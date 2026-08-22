import type { FoldProjection } from "./folding";
import { textOffsetAtPosition, textPositionAtOffset } from "./text-position";

const EDITOR_POINTER_FALLBACK_FONT_SIZE = 13;
const EDITOR_POINTER_FALLBACK_CHAR_WIDTH = 8;

export function cssPixelValue(value: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function editorLineHeight(style: CSSStyleDeclaration): number {
  const fontSize = cssPixelValue(style.fontSize, EDITOR_POINTER_FALLBACK_FONT_SIZE);
  return cssPixelValue(style.lineHeight, fontSize * 1.65);
}

function editorCharacterWidth(textarea: HTMLTextAreaElement, style: CSSStyleDeclaration): number {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return EDITOR_POINTER_FALLBACK_CHAR_WIDTH;
  context.font = style.font || `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const width = context.measureText("M").width || context.measureText("0").width;
  if (Number.isFinite(width) && width > 0) return width;
  const columns = textarea.cols > 0 ? textarea.cols : 80;
  return Math.max(1, textarea.clientWidth / columns);
}

function editorLineOffsetAtVisualColumn(
  line: string,
  rawVisualColumn: number,
  tabSize: number,
): number {
  const target = Math.max(0, rawVisualColumn);
  let visualColumn = 0;
  for (let offset = 0; offset < line.length; offset += 1) {
    const character = line[offset];
    const nextVisualColumn = character === "\t"
      ? visualColumn + Math.max(1, tabSize - (visualColumn % tabSize))
      : visualColumn + 1;
    if (target < (visualColumn + nextVisualColumn) / 2) return offset;
    visualColumn = nextVisualColumn;
  }
  return line.length;
}

function editorTextOffsetAtClientPoint(
  textarea: HTMLTextAreaElement,
  clientX: number,
  clientY: number,
  scrollElement: HTMLElement = textarea,
): number {
  const style = window.getComputedStyle(textarea);
  const bounds = textarea.getBoundingClientRect();
  const lineHeight = editorLineHeight(style);
  const charWidth = editorCharacterWidth(textarea, style);
  const scrollLeft = scrollElement === textarea ? textarea.scrollLeft : 0;
  const scrollTop = scrollElement === textarea ? textarea.scrollTop : 0;
  const contentX = clientX - bounds.left - cssPixelValue(style.paddingLeft, 0) + scrollLeft;
  const contentY = clientY - bounds.top - cssPixelValue(style.paddingTop, 0) + scrollTop;
  const lines = textarea.value.split("\n");
  const lineIndex = Math.max(0, Math.min(lines.length - 1, Math.floor(contentY / lineHeight)));
  const tabSize = Math.max(1, Math.round(cssPixelValue(style.tabSize, 4)));
  const visualColumn = Math.max(0, contentX / charWidth);
  const column = editorLineOffsetAtVisualColumn(lines[lineIndex] ?? "", visualColumn, tabSize);
  let offset = 0;
  for (let index = 0; index < lineIndex; index += 1) offset += (lines[index]?.length ?? 0) + 1;
  return offset + column;
}

export function editorProjectedTextOffsetAtClientPoint(
  textarea: HTMLTextAreaElement,
  projection: FoldProjection,
  clientX: number,
  clientY: number,
  scrollElement: HTMLElement = textarea,
): number {
  const style = window.getComputedStyle(textarea);
  const bounds = textarea.getBoundingClientRect();
  const lineHeight = editorLineHeight(style);
  const charWidth = editorCharacterWidth(textarea, style);
  const scrollLeft = scrollElement === textarea ? textarea.scrollLeft : 0;
  const scrollTop = scrollElement === textarea ? textarea.scrollTop : 0;
  const contentX = clientX - bounds.left - cssPixelValue(style.paddingLeft, 0) + scrollLeft;
  const contentY = clientY - bounds.top - cssPixelValue(style.paddingTop, 0) + scrollTop;
  const visibleLines = projection.content.split("\n");
  const sourceLines = textarea.value.split("\n");
  const visibleLineIndex = Math.max(0, Math.min(visibleLines.length - 1, Math.floor(contentY / lineHeight)));
  const visibleLine = visibleLineIndex + 1;
  const markerFoldId = projection.foldIdByMarkerVisibleLine.get(visibleLine);
  let fileLine = projection.fileLineByVisibleLine[visibleLineIndex] ?? visibleLine;
  if (markerFoldId) {
    fileLine = projection.fileLineByVisibleLine[Math.max(0, visibleLineIndex - 1)] ?? Math.max(1, fileLine - 1);
  }

  const sourceLineIndex = Math.max(0, Math.min(sourceLines.length - 1, fileLine - 1));
  const sourceLine = sourceLines[sourceLineIndex] ?? "";
  const tabSize = Math.max(1, Math.round(cssPixelValue(style.tabSize, 4)));
  const visualColumn = Math.max(0, contentX / charWidth);
  const column = markerFoldId
    ? sourceLine.length
    : editorLineOffsetAtVisualColumn(sourceLine, visualColumn, tabSize);
  let offset = 0;
  for (let index = 0; index < sourceLineIndex; index += 1) offset += (sourceLines[index]?.length ?? 0) + 1;
  return offset + column;
}

function syntaxMirrorBase(mirror: HTMLElement): {
  readonly element: HTMLElement;
  readonly windowed: boolean;
  readonly startOffset: number;
  readonly startLine: number;
} {
  const windowElement = mirror.querySelector<HTMLElement>("[data-syntax-window-start]");
  if (!windowElement) return { element: mirror, windowed: false, startOffset: 0, startLine: 1 };
  return {
    element: windowElement,
    windowed: true,
    startOffset: Number(windowElement.getAttribute("data-syntax-window-start")) || 0,
    startLine: Number(windowElement.getAttribute("data-syntax-window-line")) || 1,
  };
}

export function editorMirrorTextOffsetAtClientPoint(
  textarea: HTMLTextAreaElement,
  mirror: HTMLElement,
  clientX: number,
  clientY: number,
): number | undefined {
  const base = syntaxMirrorBase(mirror);
  const mirrorText = base.element.textContent ?? "";
  const ownerDocument = mirror.ownerDocument as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const previousPointerEvents = textarea.style.pointerEvents;
  textarea.style.pointerEvents = "none";
  try {
    let node: Node | undefined;
    let nodeOffset = 0;
    const caretPosition = ownerDocument.caretPositionFromPoint?.(clientX, clientY);
    if (caretPosition) {
      node = caretPosition.offsetNode;
      nodeOffset = caretPosition.offset;
    } else {
      const caretRange = ownerDocument.caretRangeFromPoint?.(clientX, clientY);
      if (caretRange) {
        node = caretRange.startContainer;
        nodeOffset = caretRange.startOffset;
      }
    }
    if (!node || !(node === mirror || mirror.contains(node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode))) {
      return undefined;
    }
    const target = node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode;
    if (base.windowed && target && !(node === base.element || base.element.contains(target))) {
      const position = base.element.compareDocumentPosition(node);
      return position & Node.DOCUMENT_POSITION_PRECEDING ? base.startOffset : base.startOffset + mirrorText.length;
    }
    const range = ownerDocument.createRange();
    range.selectNodeContents(base.element);
    range.setEnd(node, nodeOffset);
    return base.startOffset + Math.max(0, Math.min(mirrorText.length, range.toString().length));
  } catch {
    return undefined;
  } finally {
    textarea.style.pointerEvents = previousPointerEvents;
  }
}

export function editorSourceOffsetFromProjectedOffset(
  source: string,
  projection: FoldProjection,
  rawProjectedOffset: number,
): number {
  const projectedPosition = textPositionAtOffset(projection.content, rawProjectedOffset);
  const visibleLineIndex = Math.max(0, projectedPosition.line - 1);
  const markerFoldId = projection.foldIdByMarkerVisibleLine.get(projectedPosition.line);
  if (markerFoldId) {
    const headerVisibleLineIndex = Math.max(0, visibleLineIndex - 1);
    const headerFileLine = projection.fileLineByVisibleLine[headerVisibleLineIndex] ?? 1;
    return textOffsetAtPosition(source, {
      line: headerFileLine,
      column: (source.split("\n")[headerFileLine - 1]?.length ?? 0) + 1,
    });
  }
  const fileLine = projection.fileLineByVisibleLine[visibleLineIndex] ?? projectedPosition.line;
  return textOffsetAtPosition(source, {
    line: fileLine,
    column: projectedPosition.column,
  });
}

export function editorProjectedOffsetFromSourceOffset(
  source: string,
  projection: FoldProjection,
  rawSourceOffset: number,
): number {
  const sourcePosition = textPositionAtOffset(source, rawSourceOffset);
  let visibleLine = projection.visibleLineByFileLine[sourcePosition.line - 1] ?? sourcePosition.line;
  let visibleColumn = sourcePosition.column;
  if (projection.hiddenLineByFileLine[sourcePosition.line - 1]) {
    visibleLine = Math.max(1, visibleLine - 1);
    visibleColumn = (projection.content.split("\n")[visibleLine - 1]?.length ?? 0) + 1;
  }
  return textOffsetAtPosition(projection.content, {
    line: visibleLine,
    column: visibleColumn,
  });
}

export function editorMirrorCaretRectAtTextOffset(
  mirror: HTMLElement,
  rawOffset: number,
): { left: number; top: number; height: number } | undefined {
  const base = syntaxMirrorBase(mirror);
  const text = base.element.textContent ?? "";
  const localRawOffset = Math.trunc(rawOffset) - base.startOffset;
  if (base.windowed && (localRawOffset < 0 || localRawOffset > text.length)) return undefined;
  const offset = Math.max(0, Math.min(text.length, localRawOffset));
  const ownerDocument = mirror.ownerDocument;
  const position = textPositionAtOffset(text, offset);
  const lineStart = textOffsetAtPosition(text, { line: position.line, column: 1 });
  const lineBreak = text.indexOf("\n", lineStart);
  const lineEnd = lineBreak < 0 ? text.length : lineBreak;
  if (lineStart === lineEnd) {
    const style = ownerDocument.defaultView?.getComputedStyle(mirror);
    if (style) {
      const bounds = mirror.getBoundingClientRect();
      const lineHeight = editorLineHeight(style);
      const fontSize = cssPixelValue(style.fontSize, EDITOR_POINTER_FALLBACK_FONT_SIZE);
      const height = Math.min(lineHeight, Math.max(1, fontSize * 1.3));
      return {
        left: bounds.left + cssPixelValue(style.paddingLeft, 0),
        top: bounds.top
          + cssPixelValue(style.paddingTop, 0)
          + (base.startLine - 1 + position.line - 1) * lineHeight
          + Math.max(0, (lineHeight - height) / 2),
        height,
      };
    }
  }
  const walker = ownerDocument.createTreeWalker(base.element, NodeFilter.SHOW_TEXT);
  let consumed = 0;
  let node: Node | null;
  let lastTextNode: Text | undefined;
  while ((node = walker.nextNode())) {
    if (node.nodeType !== Node.TEXT_NODE) continue;
    const textNode = node as Text;
    const length = textNode.data.length;
    lastTextNode = textNode;
    if (offset > consumed + length) {
      consumed += length;
      continue;
    }
    const localOffset = Math.max(0, Math.min(length, offset - consumed));
    const collapsed = ownerDocument.createRange();
    collapsed.setStart(textNode, localOffset);
    collapsed.collapse(true);
    const collapsedRect = collapsed.getBoundingClientRect();
    if (collapsedRect.height > 0) {
      return { left: collapsedRect.left, top: collapsedRect.top, height: collapsedRect.height };
    }
    if (length > 0 && localOffset < length && textNode.data[localOffset] !== "\n") {
      const character = ownerDocument.createRange();
      character.setStart(textNode, localOffset);
      character.setEnd(textNode, localOffset + 1);
      const rect = character.getBoundingClientRect();
      if (rect.height > 0) return { left: rect.left, top: rect.top, height: rect.height };
    }
    if (length > 0 && localOffset > 0) {
      const previous = ownerDocument.createRange();
      previous.setStart(textNode, localOffset - 1);
      previous.setEnd(textNode, localOffset);
      const rect = previous.getBoundingClientRect();
      if (rect.height > 0) return { left: rect.right, top: rect.top, height: rect.height };
    }
    consumed += length;
  }
  if (lastTextNode?.data.length) {
    const range = ownerDocument.createRange();
    range.setStart(lastTextNode, lastTextNode.data.length - 1);
    range.setEnd(lastTextNode, lastTextNode.data.length);
    const rect = range.getBoundingClientRect();
    if (rect.height > 0) return { left: rect.right, top: rect.top, height: rect.height };
  }
  return undefined;
}

export function editorMirrorRectsAtTextRange(
  mirror: HTMLElement,
  rawStart: number,
  rawEnd: number,
): readonly DOMRect[] {
  const base = syntaxMirrorBase(mirror);
  const text = base.element.textContent ?? "";
  const start = Math.max(0, Math.min(text.length, Math.trunc(rawStart) - base.startOffset));
  const end = Math.max(start, Math.min(text.length, Math.trunc(rawEnd) - base.startOffset));
  if (start === end) return [];
  const ownerDocument = mirror.ownerDocument;
  const locate = (offset: number): { node: Text; offset: number } | undefined => {
    const walker = ownerDocument.createTreeWalker(base.element, NodeFilter.SHOW_TEXT);
    let consumed = 0;
    let node: Node | null;
    let last: Text | undefined;
    while ((node = walker.nextNode())) {
      if (node.nodeType !== Node.TEXT_NODE) continue;
      const textNode = node as Text;
      last = textNode;
      const length = textNode.data.length;
      if (offset <= consumed + length) {
        return { node: textNode, offset: Math.max(0, Math.min(length, offset - consumed)) };
      }
      consumed += length;
    }
    return last ? { node: last, offset: last.data.length } : undefined;
  };
  const startPosition = locate(start);
  const endPosition = locate(end);
  if (!startPosition || !endPosition) return [];
  const range = ownerDocument.createRange();
  range.setStart(startPosition.node, startPosition.offset);
  range.setEnd(endPosition.node, endPosition.offset);
  return Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
}

export function moveCollapsedEditorSelectionToPointer(
  textarea: HTMLTextAreaElement,
  clientX: number,
  clientY: number,
  scrollElement?: HTMLElement,
  mirror?: HTMLElement,
  projection?: FoldProjection,
): number {
  const mirrorOffset = mirror
    ? editorMirrorTextOffsetAtClientPoint(textarea, mirror, clientX, clientY)
    : undefined;
  const offset = projection
    ? mirrorOffset !== undefined
      ? editorSourceOffsetFromProjectedOffset(textarea.value, projection, mirrorOffset)
      : editorProjectedTextOffsetAtClientPoint(textarea, projection, clientX, clientY, scrollElement ?? textarea)
    : mirrorOffset !== undefined
      ? mirrorOffset
      : editorTextOffsetAtClientPoint(textarea, clientX, clientY, scrollElement ?? textarea);
  if (
    textarea.selectionEnd > textarea.selectionStart
    && offset >= textarea.selectionStart
    && offset <= textarea.selectionEnd
  ) return offset;
  textarea.setSelectionRange(offset, offset);
  return offset;
}
