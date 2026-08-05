import { describe, expect, it } from "vitest";
import { htmlLanguageProvider, highlightHtml, provideHtmlFoldingRanges } from "./html-language";

describe("HTML language module", () => {
  it("owns the HTML file associations", () => {
    expect(htmlLanguageProvider.extensions).toEqual([".html", ".htm"]);
  });

  it("highlights tags, attributes and string values", () => {
    const source = '<main class="content">Hello</main>';
    const tokens = highlightHtml(source);

    expect(tokens).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: "keyword", start: 1, end: 5 }),
      expect.objectContaining({ scope: "builtin", start: 6, end: 11 }),
      expect.objectContaining({ scope: "string", start: 12, end: 21 }),
      expect.objectContaining({ scope: "keyword", start: 29, end: 33 }),
    ]));
  });

  it("computes HTML folds inside the HTML module", () => {
    const source = "<main>\n  <section>\n    text\n  </section>\n  <img src=\"x\">\n</main>";

    expect(provideHtmlFoldingRanges({ source })).toEqual([
      { startLine: 1, endLine: 6, kind: "code" },
      { startLine: 2, endLine: 4, kind: "code" },
    ]);
  });
});
