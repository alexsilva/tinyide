import type { TextEditorContextMenuContext } from "@tinyide/plugin-api";
import type { OpenDocument, WorkspaceEntry } from "../../browser-filesystem";

export type WorkbenchContextMenuTarget =
  | { readonly kind: "root" }
  | { readonly kind: "entry"; readonly entry: WorkspaceEntry }
  | { readonly kind: "document"; readonly document: OpenDocument }
  | { readonly kind: "editor"; readonly context: TextEditorContextMenuContext }
  | { readonly kind: "text"; readonly text: string };

export function workbenchContextMenuAriaLabel(
  target: WorkbenchContextMenuTarget,
  workspaceName: string,
): string {
  const label = target.kind === "root"
    ? workspaceName
    : target.kind === "entry"
      ? target.entry.name
      : target.kind === "document"
        ? target.document.name
        : target.kind === "editor"
          ? target.context.document.name
          : "texto selecionado";
  return `Ações de ${label}`;
}
