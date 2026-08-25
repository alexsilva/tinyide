import { findTextMatches, type TextSearchMatch, type TextSearchOptions } from "./text-search";

export interface RenderedTextSearchMatch extends TextSearchMatch {
  readonly rendered: true;
  readonly startPosition: RenderedTextPosition;
  readonly endPosition: RenderedTextPosition;
}

export interface RenderedTextPosition {
  readonly node: Text;
  readonly offset: number;
}

export interface RenderedTextSearchSnapshot {
  readonly root: HTMLElement;
  readonly source: string;
  readonly segments: readonly TextNodeSegment[];
}

interface TextNodeSegment {
  readonly node: Text;
  readonly start: number;
  readonly end: number;
}

const NON_RENDERED_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);
const BLOCK_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DD",
  "DETAILS",
  "DIALOG",
  "DIV",
  "DL",
  "DT",
  "FIELDSET",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "FORM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "TBODY",
  "TD",
  "TFOOT",
  "TH",
  "THEAD",
  "TR",
  "UL",
]);

function isHidden(element: Element): boolean {
  if (element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true") return true;
  const style = (element as HTMLElement).style;
  return style?.display === "none" || style?.visibility === "hidden";
}

function appendSeparator(parts: string[], state: { offset: number }): void {
  if (state.offset === 0 || parts.at(-1)?.endsWith("\n")) return;
  parts.push("\n");
  state.offset += 1;
}

function renderedText(root: HTMLElement): { readonly source: string; readonly segments: readonly TextNodeSegment[] } {
  const parts: string[] = [];
  const segments: TextNodeSegment[] = [];
  const state = { offset: 0 };

  const visit = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const textNode = node as Text;
      if (!textNode.data) return;
      const start = state.offset;
      parts.push(textNode.data);
      state.offset += textNode.data.length;
      segments.push({ node: textNode, start, end: state.offset });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as Element;
    if (NON_RENDERED_TAGS.has(element.tagName) || isHidden(element)) return;
    if (element.tagName === "BR") {
      appendSeparator(parts, state);
      return;
    }
    if (element.tagName === "IFRAME") {
      appendSeparator(parts, state);
      try {
        const body = (element as HTMLIFrameElement).contentDocument?.body;
        if (body) visit(body);
      } catch {
        // Sandboxed or cross-origin frames remain intentionally opaque.
      }
      appendSeparator(parts, state);
      return;
    }

    const block = BLOCK_TAGS.has(element.tagName) && element !== root;
    if (block) appendSeparator(parts, state);
    for (const child of element.childNodes) visit(child);
    if (block) appendSeparator(parts, state);
  };

  visit(root);
  return { source: parts.join(""), segments };
}

function rangeStartAt(segments: readonly TextNodeSegment[], offset: number): RenderedTextPosition | undefined {
  let low = 0;
  let high = segments.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    const segment = segments[middle];
    if (!segment || segment.end <= offset) low = middle + 1;
    else high = middle;
  }
  const segment = segments[low];
  if (!segment) return undefined;
  return { node: segment.node, offset: Math.max(0, offset - segment.start) };
}

function rangeEndAt(segments: readonly TextNodeSegment[], offset: number): RenderedTextPosition | undefined {
  let low = 0;
  let high = segments.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    const segment = segments[middle];
    if (segment && segment.start < offset) low = middle + 1;
    else high = middle;
  }
  const segment = segments[low - 1];
  if (!segment) return undefined;
  return { node: segment.node, offset: Math.min(segment.node.data.length, offset - segment.start) };
}

function rangeForMatch(match: RenderedTextSearchMatch): Range | undefined {
  const { startPosition: start, endPosition: end } = match;
  if (!start.node.isConnected || !end.node.isConnected) return undefined;
  if (start.node.ownerDocument !== end.node.ownerDocument) return undefined;
  const range = start.node.ownerDocument.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range.collapsed ? undefined : range;
}

interface HighlightRegistryLike {
  set(name: string, highlight: object): void;
  delete(name: string): boolean;
}

interface WindowWithHighlightApi extends Window {
  readonly CSS: {
    readonly highlights?: HighlightRegistryLike;
  };
  readonly Highlight?: new (...ranges: Range[]) => object;
}

const RENDERED_SEARCH_HIGHLIGHT_NAME = "tinyide-rendered-search-current";
const FRAME_HIGHLIGHT_STYLE_ATTRIBUTE = "data-tinyide-rendered-search-highlight";

function highlightApi(document: Document): {
  readonly registry: HighlightRegistryLike;
  readonly Highlight: new (...ranges: Range[]) => object;
} | undefined {
  const view = document.defaultView as WindowWithHighlightApi | null;
  const registry = view?.CSS?.highlights;
  const Highlight = view?.Highlight;
  return registry && Highlight ? { registry, Highlight } : undefined;
}

function accessibleDocuments(root: HTMLElement): readonly Document[] {
  const documents = new Set<Document>([root.ownerDocument]);
  for (const frame of Array.from(root.querySelectorAll("iframe"))) {
    try {
      if (frame.contentDocument) documents.add(frame.contentDocument);
    } catch {
      // Cross-origin frames cannot participate in DOM-backed search/highlighting.
    }
  }
  return [...documents];
}

function ensureHighlightStyle(document: Document): void {
  if (document.querySelector(`style[${FRAME_HIGHLIGHT_STYLE_ATTRIBUTE}]`)) return;
  const style = document.createElement("style");
  style.setAttribute(FRAME_HIGHLIGHT_STYLE_ATTRIBUTE, "");
  style.textContent = `::highlight(${RENDERED_SEARCH_HIGHLIGHT_NAME}) { background-color: #755d16; }`;
  (document.head ?? document.documentElement).append(style);
}

/**
 * Searches the text that a resource-editor provider actually rendered.
 *
 * The workbench owns this behavior instead of individual Markdown/HTML/etc. plugins so every
 * rendered resource editor gets the same in-file search contract automatically.
 */
export function createRenderedTextSearchSnapshot(root: HTMLElement | null): RenderedTextSearchSnapshot | undefined {
  if (!root) return undefined;
  const { source, segments } = renderedText(root);
  return { root, source, segments };
}

export function findRenderedTextMatches(
  snapshot: RenderedTextSearchSnapshot | undefined,
  query: string,
  options: TextSearchOptions = {},
): readonly RenderedTextSearchMatch[] {
  if (!snapshot || !query) return [];
  const { source, segments } = snapshot;
  if (!source || !segments.length) return [];
  return findTextMatches(source, query, options).flatMap((match) => {
    const startPosition = rangeStartAt(segments, match.start);
    const endPosition = rangeEndAt(segments, match.end);
    return startPosition && endPosition
      ? [{ ...match, rendered: true as const, startPosition, endPosition }]
      : [];
  });
}

export function isRenderedTextSearchMatch(match: TextSearchMatch): match is RenderedTextSearchMatch {
  return "rendered" in match && match.rendered === true;
}

export function revealRenderedTextMatch(root: HTMLElement | null, match: RenderedTextSearchMatch): void {
  if (!root) return;
  const range = rangeForMatch(match);
  if (!range) return;
  const document = match.startPosition.node.ownerDocument;
  const api = highlightApi(document);
  if (api) {
    ensureHighlightStyle(document);
    api.registry.set(RENDERED_SEARCH_HIGHLIGHT_NAME, new api.Highlight(range));
  }

  const startElement = match.startPosition.node.parentElement;
  startElement?.scrollIntoView({ block: "center", inline: "nearest" });
}

export function clearRenderedTextSearchHighlight(root: HTMLElement | null): void {
  if (!root) return;
  for (const document of accessibleDocuments(root)) {
    highlightApi(document)?.registry.delete(RENDERED_SEARCH_HIGHLIGHT_NAME);
  }
}
