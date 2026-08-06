import { describe, expect, it } from "vitest";
import {
  applyVirtualDocumentChanges,
  createVirtualDocument,
  isVirtualDocumentId,
  upsertDocument,
  virtualDocumentId,
} from "./virtual-documents";
import { workspaceDocumentsForSnapshot } from "./persistence";
import type { OpenDocument } from "../browser-filesystem";

const request = {
  key: "tinyide.database/conexao/tabela",
  name: "clientes",
  mediaType: "application/x-tinyide-db-table",
  origin: "producao",
};

describe("virtual documents", () => {
  it("builds a tab that has no file behind it", () => {
    const document = createVirtualDocument(request);
    expect(document.id).toBe("virtual:tinyide.database/conexao/tabela");
    expect(document.name).toBe("clientes");
    expect(document.mediaType).toBe("application/x-tinyide-db-table");
    expect(document.origin).toBe("producao");
    expect(document.readOnly).toBe(true);
    // Sem caminho nem handle o host não tenta ler nem salvar o documento.
    expect(document.path).toBeUndefined();
    expect(document.handle).toBeUndefined();
    expect(document.content).toBe(document.savedContent);
  });

  it("rejects an empty key", () => {
    expect(() => virtualDocumentId("   ")).toThrow(/chave/i);
  });

  it("recognises its own identifiers", () => {
    expect(isVirtualDocumentId(createVirtualDocument(request).id)).toBe(true);
    expect(isVirtualDocumentId("src/main.py")).toBe(false);
  });

  it("keeps the caret and scroll position when the same document is reopened", () => {
    const first: OpenDocument = {
      ...createVirtualDocument(request),
      selectionStart: 12,
      selectionEnd: 20,
      scrollTop: 140,
      scrollLeft: 8,
    };
    const reopened = createVirtualDocument({ ...request, content: "novo" }, first);
    expect(reopened.id).toBe(first.id);
    expect(reopened.selectionStart).toBe(12);
    expect(reopened.scrollTop).toBe(140);
    expect(reopened.content).toBe("novo");
  });

  it("updates name and content without marking the document dirty", () => {
    const document = createVirtualDocument({ ...request, content: "antigo" });
    const updated = applyVirtualDocumentChanges(document, { name: "pedidos", content: "novo conteúdo" });
    expect(updated.name).toBe("pedidos");
    expect(updated.content).toBe("novo conteúdo");
    // savedContent acompanha o conteúdo: a aba nunca aparece como não salva.
    expect(updated.savedContent).toBe("novo conteúdo");
    expect(updated.size).toBe("novo conteúdo".length);
  });

  it("replaces the existing tab instead of duplicating it", () => {
    const document = createVirtualDocument(request);
    const other: OpenDocument = { ...createVirtualDocument({ ...request, key: "outro" }), name: "outro" };
    const documents = upsertDocument(upsertDocument([], document), other);
    expect(documents).toHaveLength(2);
    const replaced = upsertDocument(documents, applyVirtualDocumentChanges(document, { name: "renomeado" }));
    expect(replaced).toHaveLength(2);
    expect(replaced[0]?.name).toBe("renomeado");
    expect(replaced[1]?.name).toBe("outro");
  });

  it("is never written to the session snapshot", () => {
    const virtualDocument = createVirtualDocument(request);
    const fileDocument: OpenDocument = {
      id: "src/main.py",
      name: "main.py",
      path: "src/main.py",
      workspaceRoot: "/workspace",
      kind: "text",
      mediaType: "text/x-python",
      size: 4,
      content: "code",
      savedContent: "code",
      selectionStart: 0,
      selectionEnd: 0,
      scrollTop: 0,
      scrollLeft: 0,
    };
    const persisted = workspaceDocumentsForSnapshot([virtualDocument, fileDocument], "/workspace");
    expect(persisted.map((document) => document.id)).toEqual(["src/main.py"]);
  });
});
