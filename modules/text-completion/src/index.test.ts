import { describe, expect, it, vi } from "vitest";
import type { ModuleContext, TextEditorCompletionContext, TextEditorDocumentSnapshot } from "@tinyide/plugin-api";
import {
  DEFAULT_TEXT_COMPLETION_LIMIT,
  documentWordCompletions,
  isTextCompletionDocument,
  stripMarkdownCode,
  textCompletionModule,
  textCompletionProvider,
} from "./index";

function document(overrides: Partial<TextEditorDocumentSnapshot> = {}): TextEditorDocumentSnapshot {
  return {
    id: "doc",
    name: "notes.md",
    path: "notes.md",
    mediaType: "text/markdown",
    content: "",
    ...overrides,
  };
}

function context(
  source: string,
  prefix: string,
  overrides: Partial<TextEditorDocumentSnapshot> = {},
): TextEditorCompletionContext {
  return {
    document: document({ content: source, ...overrides }),
    position: { line: 1, column: source.length + 1 },
    offset: source.length,
    prefix,
  };
}

describe("text completion module", () => {
  it("only activates for plain text and documentation-like files", () => {
    expect(isTextCompletionDocument(document({ name: "README", path: "README" }))).toBe(true);
    expect(isTextCompletionDocument(document({ name: "notes.txt", path: "notes.txt", mediaType: "text/plain" }))).toBe(true);
    expect(isTextCompletionDocument(document({ name: "docs.md", path: "docs.md", mediaType: "text/markdown" }))).toBe(true);
    expect(isTextCompletionDocument(document({ name: "main.py", path: "main.py", mediaType: "text/x-python" }))).toBe(false);
    expect(isTextCompletionDocument(document({ name: "app.ts", path: "src/app.ts", mediaType: "text/typescript" }))).toBe(false);
  });

  it("suggests words already present in the document without a global dictionary", () => {
    const items = documentWordCompletions(context(
      "Integração marketplace marketplace relatório margem marcador",
      "mar",
    ));
    expect(items.map((item) => item.label)).toEqual(["marketplace", "marcador", "margem"]);
    expect(items.every((item) => item.kind === "text" && item.detail === "texto do documento")).toBe(true);
  });

  it("deduplicates by normalized word and ignores the completed prefix itself", () => {
    const items = documentWordCompletions(context(
      "Configuração configuracao configurar config",
      "config",
    ));
    expect(items.map((item) => item.label)).toEqual(["Configuração", "configurar"]);
  });

  it("ignores fenced and inline Markdown code when collecting text words", () => {
    const stripped = stripMarkdownCode([
      "Texto normal documentação",
      "```python",
      "documentacao_codigo = True",
      "```",
      "Outra `documentacao_inline` palavra",
    ].join("\n"));
    expect(stripped).toContain("documentação");
    expect(stripped).not.toContain("documentacao_codigo");
    expect(stripped).not.toContain("documentacao_inline");

    const items = documentWordCompletions(context(stripped, "doc"));
    expect(items.map((item) => item.label)).toEqual(["documentação"]);
  });

  it("respects AbortSignal and result limit", () => {
    const controller = new AbortController();
    controller.abort();
    expect(documentWordCompletions({ ...context("alpha alfabetico alameda", "al"), signal: controller.signal })).toEqual([]);

    const limited = documentWordCompletions(context("alfa beta alfaico alameda aluminio altura", "al"), 2);
    expect(limited).toHaveLength(2);
    expect(DEFAULT_TEXT_COMPLETION_LIMIT).toBeGreaterThan(2);
  });

  it("registers the provider through the public completion contract", () => {
    const dispose = vi.fn();
    const registerTextEditorCompletionProvider = vi.fn(() => ({ dispose }));
    const context = {
      extensions: { registerTextEditorCompletionProvider },
      subscriptions: [],
    } as unknown as ModuleContext;
    textCompletionModule.init(context);
    expect(registerTextEditorCompletionProvider).toHaveBeenCalledWith(textCompletionProvider);
    expect(context.subscriptions).toHaveLength(1);
    expect(textCompletionProvider.priority).toBeLessThan(0);
  });
});
