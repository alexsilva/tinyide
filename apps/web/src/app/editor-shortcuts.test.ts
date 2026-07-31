import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

describe("editor shortcuts", () => {
  it("opens the active file search with Ctrl+F only when the editor has focus", () => {
    expect(appSource).toContain("const openEditorSearch = useCallback(");
    expect(appSource.match(/key === "f" && !event\.shiftKey && !event\.altKey/g)).toHaveLength(1);
    expect(appSource.match(/if \(openEditorSearch\(\)\) event\.preventDefault\(\);/g)).toHaveLength(1);
    expect(appSource).toContain("onClick={openEditorSearch}");
  });
});
