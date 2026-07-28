import { describe, expect, it } from "vitest";
import { findTextMatches } from "./text-search";

describe("editor text search", () => {
  it("finds literal matches without considering case", () => {
    expect(findTextMatches("Alpha alpha ALPHA", "alpha")).toEqual([
      { start: 0, end: 5 },
      { start: 6, end: 11 },
      { start: 12, end: 17 },
    ]);
  });

  it("does not search for an empty query", () => {
    expect(findTextMatches("content", "")).toEqual([]);
  });

  it("supports case-sensitive searches", () => {
    expect(findTextMatches("Alpha alpha ALPHA", "Alpha", { caseSensitive: true })).toEqual([
      { start: 0, end: 5 },
    ]);
  });

  it("supports regular expressions", () => {
    expect(findTextMatches("one 12 two 345", "\\d+", { regex: true })).toEqual([
      { start: 4, end: 6 },
      { start: 11, end: 14 },
    ]);
  });

  it("reports invalid regular expressions", () => {
    expect(() => findTextMatches("content", "([", { regex: true })).toThrow(SyntaxError);
  });
});
