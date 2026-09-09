import type { WorkbenchStateApi, WorkbenchStatusbarContribution } from "@tinyide/plugin-api";
import type { OpenDocument } from "../../browser-filesystem";
import { WorkspaceExternalSyncIndicator, type WorkspaceExternalSyncState } from "../editor/ExternalFileNotice";
import { WorkbenchStatusbarHost } from "../workbench-plugin-hosts";
import { WorkbenchIcon } from "./activity-components";

export function documentStatusLabel(document: OpenDocument | undefined): string {
  if (document?.readOnly) return "Somente leitura";
  if (document?.kind === "text" && document.content !== document.savedContent) return "Modificado";
  return "Salvo";
}

export function documentTypeLabel(
  document: OpenDocument | undefined,
  resourceEditorId?: string,
  syntaxName?: string,
): string {
  if (resourceEditorId !== undefined) return resourceEditorId;
  if (syntaxName !== undefined) return syntaxName;
  if (document?.kind === "image") return "Imagem";
  if (document?.kind === "binary") return "Binário";
  return "Texto";
}

export function WorkbenchStatusBar({
  pluginCount,
  externalSync,
  contributions,
  state,
  document,
  resourceEditorId,
  syntaxName,
  onOpenFile,
}: {
  readonly pluginCount: number;
  readonly externalSync?: WorkspaceExternalSyncState;
  readonly contributions: readonly WorkbenchStatusbarContribution[];
  readonly state: WorkbenchStateApi;
  readonly document: OpenDocument | undefined;
  readonly resourceEditorId?: string;
  readonly syntaxName?: string;
  readonly onOpenFile: () => void;
}) {
  return (
    <footer className="statusbar">
      <button type="button" onClick={onOpenFile}><WorkbenchIcon icon="file" size={13} /> Abrir arquivo</button>
      <span>{pluginCount} plugin(s)</span>
      {externalSync ? <WorkspaceExternalSyncIndicator state={externalSync} /> : null}
      {contributions.map((provider) => <WorkbenchStatusbarHost key={provider.id} provider={provider} state={state} />)}
      <span className="status-spacer" />
      <span>{documentStatusLabel(document)}</span>
      <span>{document?.kind === "text" ? "UTF-8" : document?.mediaType ?? ""}</span>
      <span>{documentTypeLabel(document, resourceEditorId, syntaxName)}</span>
    </footer>
  );
}
