import { describe, expect, it } from "vitest";
import type { OpenDocument } from "../../browser-filesystem";
import { textEditorDocumentSnapshot } from "./document-snapshot";

function document(content = "const value = 1;", savedContent = content): OpenDocument {
  return {
    id: "src/main.ts",
    name: "main.ts",
    path: "src/main.ts",
    workspaceRoot: "/workspace/project",
    kind: "text",
    mediaType: "text/typescript",
    size: content.length,
    content,
    savedContent,
    selectionStart: 0,
    selectionEnd: 0,
    scrollTop: 0,
    scrollLeft: 0,
  };
}

describe("textEditorDocumentSnapshot", () => {
  it("exposes only the plugin-facing document contract", () => {
    expect(textEditorDocumentSnapshot(document())).toEqual({
      id: "src/main.ts",
      name: "main.ts",
      path: "src/main.ts",
      workspaceRoot: "/workspace/project",
      mediaType: "text/typescript",
      content: "const value = 1;",
      isDirty: false,
    });
  });

  it("marks unsaved content as dirty", () => {
    expect(textEditorDocumentSnapshot(document("changed", "saved")).isDirty).toBe(true);
  });
});
