import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");
const textareaSource = readFileSync(resolve(__dirname, "CodeEditorTextarea.tsx"), "utf8");
const popupSource = readFileSync(resolve(__dirname, "CompletionPopup.tsx"), "utf8");

describe("editor completion UI wiring", () => {
  it("requests completions from editor typing instead of only defining providers", () => {
    expect(appSource).toContain("buildCompletionSession(textarea");
    expect(appSource).toContain("platform.capabilities.getAll<TextEditorCompletionProvider>(\"textEditor.completion\")");
    expect(appSource).toContain("onChange={handleEditorChange}");
    expect(textareaSource).toContain("onChange={onChange}");
    expect(textareaSource).toContain("onKeyDown={onKeyDown}");
    expect(appSource).not.toContain("onChange={(event) => updateDocument(event.currentTarget)}");
  });

  it("lets keyboard and mouse commit completion items", () => {
    expect(appSource).toContain("applyCompletionItem(textarea, completionSession, item)");
    expect(appSource).toContain("event.key === \"Enter\" || event.key === \"Tab\"");
    expect(appSource).toContain("event.key === \".\"");
    expect(appSource).toContain("requestCompletions(activeDocument, event.currentTarget, { immediate: true })");
    expect(appSource).toContain("<CompletionPopup");
    expect(popupSource).toContain("className=\"editor-completion-popup\"");
  });
});
