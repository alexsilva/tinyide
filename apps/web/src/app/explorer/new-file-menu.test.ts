import { describe, expect, it } from "vitest";
import { decodeNewFileOption, encodeNewFileCommand, newFileContextMenuItems } from "./new-file-menu";

describe("new-file-menu", () => {
  it("round-trips a typed new-file command", () => {
    const command = encodeNewFileCommand({ extension: ".py", suggestedName: "main" });
    expect(command).toMatch(/^core\.resource\.newFile:/);
    expect(decodeNewFileOption(command)).toEqual({ extension: ".py", suggestedName: "main" });
  });

  it("rejects malformed or unrelated commands", () => {
    expect(decodeNewFileOption("core.resource.open")).toBeUndefined();
    expect(decodeNewFileOption("core.resource.newFile:%7Bbad")).toBeUndefined();
    expect(decodeNewFileOption(encodeNewFileCommand({ extension: ".ts" }))).toEqual({ extension: ".ts" });
  });

  it("builds a text fallback or provider-specific creation items", () => {
    expect(newFileContextMenuItems([])).toEqual([expect.objectContaining({
      id: "core.newFile",
      label: "Novo arquivo",
      group: "creation",
    })]);
    const contributed = newFileContextMenuItems([
      { id: "python", label: "Python", extension: ".py" },
      { id: "javascript", label: "JavaScript", extension: ".js" },
    ]);
    expect(contributed.map((item) => item.id)).toEqual([
      "core.newFile.core.text",
      "core.newFile.python",
      "core.newFile.javascript",
    ]);
    expect(contributed[1]).toEqual(expect.objectContaining({ label: "Python (.py)", order: 1 }));
    expect(contributed[2]).toEqual(expect.objectContaining({ label: "JavaScript (.js)", order: 2 }));
  });
});
