import type { TextEditorDocumentSnapshot } from "@tinyide/plugin-api";
import type { OpenDocument } from "../../browser-filesystem";

/**
 * Materializa o contrato público do editor a partir do documento interno.
 * Mantém plugins desacoplados da representação completa de OpenDocument.
 */
export function textEditorDocumentSnapshot(document: OpenDocument): TextEditorDocumentSnapshot {
  return {
    id: document.id,
    name: document.name,
    ...(document.path ? { path: document.path } : {}),
    ...(document.workspaceRoot ? { workspaceRoot: document.workspaceRoot } : {}),
    mediaType: document.mediaType,
    content: document.content,
    isDirty: document.content !== document.savedContent,
  };
}
