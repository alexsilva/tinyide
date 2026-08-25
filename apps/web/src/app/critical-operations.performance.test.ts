import { describe, expect, it } from "vitest";
import { editorDocumentIndex } from "./editor-settings";
import { findTextMatches, replaceTextMatches } from "./editor/text-search";

describe("critical editor operation performance", () => {
  it("replaces 10,000 matches in a 1 MB document within the interactive budget", () => {
    const source = "target abcdefghijklmnopqrstuvwxyz\n".repeat(30_000);
    const matches = findTextMatches(source, "target", { caseSensitive: true });

    const startedAt = performance.now();
    const result = replaceTextMatches(source, matches, "replacement");
    const duration = performance.now() - startedAt;

    expect(matches).toHaveLength(10_000);
    expect(result.length).toBe(1_070_000);
    expect(duration).toBeLessThan(100);
  });

  it("indexes a 6 MB document in one pass within the interactive budget", () => {
    const source = "export function value(input) { return input * 2; } // benchmark\n".repeat(100_000);

    const startedAt = performance.now();
    const index = editorDocumentIndex(source, true);
    const duration = performance.now() - startedAt;

    expect(index.lineCount).toBe(100_001);
    expect(index.lineStarts).toHaveLength(100_001);
    expect(duration).toBeLessThan(150);
  });
});
