import * as Tabs from "@radix-ui/react-tabs";
import { File, FileWarning, Image as ImageIcon, X } from "lucide-react";
import type { OpenDocument } from "../../browser-filesystem";
import { workspaceAbsolutePath } from "../explorer";

export interface WorkbenchEditorTabsProps {
  /** Lista de documentos atualmente abertos no editor. */
  readonly documents: readonly OpenDocument[];
  /** ID do documento ativo selecionado no momento. */
  readonly activeDocumentId: string | undefined;
  /** Raiz do workspace ativo para cálculo de caminhos absolutos no tooltip. */
  readonly workspaceRoot?: string;
  /** ID do documento sendo arrastado atualmente (para estilo visual). */
  readonly draggingDocumentId?: string;
  /** ID do documento alvo do drop (para estilo visual de indicação). */
  readonly dropTargetDocumentId?: string;
  /** Callback para selecionar documento ao clicar na aba. */
  readonly onSelectDocument: (id: string) => void;
  /** Callback para fechar documento. */
  readonly onCloseDocument: (id: string) => void;
  /** Callback para reordenar documentos ao soltar uma aba sobre outra. */
  readonly onReorderDocuments: (sourceId: string, targetId: string) => void;
  /** Callback disparado no menu de contexto (clique com botão direito) da aba. */
  readonly onOpenContextMenu: (document: OpenDocument, x: number, y: number) => void;
  /** Callback para atualizar o estado de arrasto da aba. */
  readonly onDragStateChange: (draggingId: string | undefined, dropTargetId: string | undefined) => void;
}

/** Retorna o ícone apropriado para o tipo de documento exibido na aba. */
function DocumentTabIcon({ kind }: { readonly kind: OpenDocument["kind"] }) {
  if (kind === "image") return <ImageIcon size={14} />;
  if (kind === "binary") return <FileWarning size={14} />;
  return <File size={14} />;
}

/**
 * Barra superior de abas de documentos do editor.
 * Gerencia visualmente as abas abertas, suporte a drag-and-drop para reordenação,
 * indicador de arquivo modificado (dirty-dot), ícone por tipo de mídia e fechamento.
 */
export function WorkbenchEditorTabs({
  documents,
  activeDocumentId,
  workspaceRoot,
  draggingDocumentId,
  dropTargetDocumentId,
  onSelectDocument,
  onCloseDocument,
  onReorderDocuments,
  onOpenContextMenu,
  onDragStateChange,
}: WorkbenchEditorTabsProps) {
  if (!documents.length) return null;

  return (
    <Tabs.Root className="document-tabs" value={activeDocumentId ?? ""} onValueChange={onSelectDocument}>
      <Tabs.List className="tabs-list">
        {documents.map((document) => {
          const isDragging = draggingDocumentId === document.id;
          const isDropTarget = dropTargetDocumentId === document.id;
          const isDirty = document.kind === "text" && document.content !== document.savedContent;
          const tooltip = document.origin
            ?? workspaceAbsolutePath(document.workspaceRoot ?? workspaceRoot, document.path)
            ?? document.path
            ?? document.name;

          return (
            <Tabs.Trigger
              className={`tab-trigger${isDragging ? " is-dragging" : ""}${isDropTarget ? " is-drop-target" : ""}`}
              key={document.id}
              value={document.id}
              title={tooltip}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("application/x-tinyide-document-id", document.id);
                onDragStateChange(document.id, undefined);
              }}
              onDragEnd={() => {
                onDragStateChange(undefined, undefined);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = "move";
                onDragStateChange(draggingDocumentId, document.id);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  onDragStateChange(draggingDocumentId, undefined);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const encodedId = event.dataTransfer.getData("application/x-tinyide-document-id");
                onDragStateChange(undefined, undefined);
                if (encodedId) {
                  onReorderDocuments(encodedId, document.id);
                }
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                onOpenContextMenu(document, event.clientX, event.clientY);
              }}
            >
              <DocumentTabIcon kind={document.kind} />
              <span>{document.name}</span>
              {isDirty ? <span className="dirty-dot">●</span> : null}
              <span
                role="button"
                tabIndex={0}
                className="tab-close"
                onClick={(event) => {
                  event.stopPropagation();
                  onCloseDocument(document.id);
                }}
              >
                <X size={13} />
              </span>
            </Tabs.Trigger>
          );
        })}
      </Tabs.List>
    </Tabs.Root>
  );
}
