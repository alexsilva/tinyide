import type { WorkbenchVirtualDocumentRequest } from "@tinyide/plugin-api";
import type { OpenDocument } from "../browser-filesystem";

const VIRTUAL_DOCUMENT_PREFIX = "virtual:";

/** Identificador de aba para um documento fornecido por plugin. */
export function virtualDocumentId(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) throw new Error("Informe a chave do documento.");
  return `${VIRTUAL_DOCUMENT_PREFIX}${trimmed}`;
}

export function isVirtualDocumentId(id: string): boolean {
  return id.startsWith(VIRTUAL_DOCUMENT_PREFIX);
}

/**
 * Monta a aba de um documento que não existe no disco. Sem `path` e sem `handle`, o
 * host não tenta lê-lo nem salvá-lo, e a persistência de sessão o ignora; a
 * renderização fica a cargo do provider de editor que aceitar o `mediaType`.
 */
export function createVirtualDocument(
  request: WorkbenchVirtualDocumentRequest,
  existing?: OpenDocument,
): OpenDocument {
  const content = request.content ?? "";
  return {
    id: virtualDocumentId(request.key),
    name: request.name,
    kind: "text",
    mediaType: request.mediaType,
    readOnly: true,
    ...(request.origin === undefined ? {} : { origin: request.origin }),
    size: content.length,
    content,
    savedContent: content,
    selectionStart: existing?.selectionStart ?? 0,
    selectionEnd: existing?.selectionEnd ?? 0,
    scrollTop: existing?.scrollTop ?? 0,
    scrollLeft: existing?.scrollLeft ?? 0,
  };
}

export function applyVirtualDocumentChanges(
  document: OpenDocument,
  changes: Partial<Pick<WorkbenchVirtualDocumentRequest, "name" | "content">>,
): OpenDocument {
  const content = changes.content ?? document.content;
  return {
    ...document,
    ...(changes.name === undefined ? {} : { name: changes.name }),
    content,
    savedContent: content,
    size: content.length,
  };
}

/** Substitui a aba existente ou acrescenta a nova, preservando a ordem das abas. */
export function upsertDocument(
  documents: readonly OpenDocument[],
  document: OpenDocument,
): readonly OpenDocument[] {
  const index = documents.findIndex((item) => item.id === document.id);
  return index === -1
    ? [...documents, document]
    : documents.map((item) => item.id === document.id ? document : item);
}
