import { describe, expect, it } from "vitest";
import { textOffsetAtPosition, textPositionAtOffset } from "./text-position";

describe("editor text positions", () => {
  it("converts offsets to one-based positions", () => {
    expect(textPositionAtOffset("one\ntwo", 5)).toEqual({ line: 2, column: 2 });
    expect(textPositionAtOffset("one", 99)).toEqual({ line: 1, column: 4 });
  });

  it("converts one-based positions to bounded offsets", () => {
    expect(textOffsetAtPosition("one\ntwo", { line: 2, column: 2 })).toBe(5);
    expect(textOffsetAtPosition("one\ntwo", { line: 2, column: 99 })).toBe(7);
    expect(textOffsetAtPosition("one", { line: 99, column: 1 })).toBe(3);
  });
});
