import type { ReactNode } from "react";
import type { WorkbenchResourceEditorProvider } from "@tinyide/plugin-api";
import type { OpenDocument } from "../../browser-filesystem";
import { ResourceEditorHost } from "../workbench-plugin-hosts";
import { NativeImageEditor, UnsupportedBinaryEditor } from "./resource-editors";

export interface EditorDocumentSurfaceProps {
  readonly document: OpenDocument | undefined;
  readonly resourceEditorProvider: WorkbenchResourceEditorProvider | undefined;
  readonly resourceEditorHostRef: { current: HTMLDivElement | null };
  readonly resourceTopLine: number | undefined;
  readonly onRevealResourceLine: (line: number) => void;
  readonly children: ReactNode;
}

/** Selects the editor implementation for the active document without owning document state. */
export function EditorDocumentSurface({
  document,
  resourceEditorProvider,
  resourceEditorHostRef,
  resourceTopLine,
  onRevealResourceLine,
  children,
}: EditorDocumentSurfaceProps) {
  if (document && resourceEditorProvider) {
    return (
      <ResourceEditorHost
        provider={resourceEditorProvider}
        document={document}
        hostRef={resourceEditorHostRef}
        {...(resourceTopLine !== undefined ? { topLine: resourceTopLine } : {})}
        onRevealLine={onRevealResourceLine}
      />
    );
  }
  if (document?.kind === "image") return <NativeImageEditor document={document} />;
  if (document?.kind === "binary") return <UnsupportedBinaryEditor document={document} />;
  return <>{children}</>;
}
