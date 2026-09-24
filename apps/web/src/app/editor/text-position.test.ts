import { describe, expect, it, vi } from "vitest";
import { lineLengthsAt, textOffsetAtPosition, textPositionAtOffset } from "./text-position";

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

describe("comprimento de linhas avulsas", () => {
  it("mede apenas as linhas pedidas, com e sem CRLF", () => {
    const source = "alpha\r\nbeta\ngamma delta\nlast";
    expect([...lineLengthsAt(source, [1, 3, 4])]).toEqual([[1, 5], [3, 11], [4, 4]]);
  });

  it("ignora linhas fora do documento e pedidos inválidos", () => {
    const lengths = lineLengthsAt("one\ntwo", [0, 2, 9, Number.NaN]);
    expect(lengths.get(2)).toBe(3);
    expect(lengths.has(9)).toBe(false);
    expect(lengths.size).toBe(1);
  });

  it("para na última linha pedida em vez de varrer o documento", () => {
    const source = `${"x".repeat(80)}\n`.repeat(5_000);
    const indexOf = vi.spyOn(String.prototype, "indexOf");
    try {
      expect(lineLengthsAt(source, []).size).toBe(0);
      expect(indexOf, "sem linhas pedidas não há varredura").not.toHaveBeenCalled();
      lineLengthsAt(source, [3, 7]);
      expect(indexOf.mock.calls.length).toBeLessThanOrEqual(7);
    } finally {
      indexOf.mockRestore();
    }
  });
});
