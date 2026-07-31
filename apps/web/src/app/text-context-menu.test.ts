import { describe, expect, it } from "vitest";
import { selectedTextAtTarget } from "./text-context-menu";

describe("selectedTextAtTarget", () => {
  it("reads the exact selection from text controls", () => {
    expect(selectedTextAtTarget({
      value: "antes texto depois",
      selectionStart: 6,
      selectionEnd: 11,
    } as unknown as EventTarget, null)).toBe("texto");
  });

  it("uses the document selection for generic plugin content", () => {
    const selection = { toString: () => "texto do plugin" } as Selection;
    expect(selectedTextAtTarget({} as EventTarget, selection)).toBe("texto do plugin");
  });

  it("does not expose an empty text-control selection", () => {
    expect(selectedTextAtTarget({
      value: "texto",
      selectionStart: 2,
      selectionEnd: 2,
    } as unknown as EventTarget, null)).toBe("");
  });
});
