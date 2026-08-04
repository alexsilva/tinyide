import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const workbenchStyles = readFileSync(new URL("../styles/workbench.css", import.meta.url), "utf8");

describe("editor shortcuts", () => {
  it("focuses and selects the active file search with Ctrl+F", () => {
    expect(appSource).toContain("const openEditorSearch = useCallback(");
    expect(appSource.match(/key === "f" && !event\.shiftKey && !event\.altKey/g)).toHaveLength(1);
    expect(appSource.match(/if \(openEditorSearch\(value\.slice\(selectionStart, selectionEnd\)\)\) event\.preventDefault\(\);/g)).toHaveLength(1);
    expect(appSource).toContain("input?.focus({ preventScroll: true });");
    expect(appSource).toContain("input?.select();");
    expect(appSource).toContain("event.currentTarget.select();");
    expect(appSource).toContain("openEditorSearch(value.slice(selectionStart, selectionEnd))");
    expect(appSource).toContain("if (selectedText) {");
    expect(appSource).toContain("onClick={() => openEditorSearch()}");
  });

  it("opens local replacement with Ctrl+H", () => {
    expect(appSource).toContain("const openEditorReplace = useCallback(");
    expect(appSource.match(/key === "h" && !event\.shiftKey && !event\.altKey/g)).toHaveLength(1);
    expect(appSource).toContain("if (openEditorReplace()) event.preventDefault();");
    expect(appSource).toContain("editor-search__replace-row");
  });

  it("floats replacement below search without increasing the toolbar height", () => {
    expect(workbenchStyles).toMatch(/\.editor-search\s*\{[^}]*position:\s*relative/);
    expect(workbenchStyles).toMatch(/\.editor-search__replace-row\s*\{[^}]*position:\s*absolute/);
    expect(workbenchStyles).toMatch(/\.editor-search__replace-row\s*\{[^}]*top:\s*calc\(100% \+ 4px\)/);
  });
});
