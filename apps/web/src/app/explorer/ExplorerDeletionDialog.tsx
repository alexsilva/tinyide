import type { WorkspaceEntry } from "../../browser-filesystem";
import { ConfirmationDialog } from "../workbench/ConfirmationDialog";

export type ExplorerDeletionEntry = Pick<WorkspaceEntry, "name" | "kind">;

export interface ExplorerDeletionDialogProps {
  readonly entries: readonly ExplorerDeletionEntry[];
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

/** Confirmação destrutiva de exclusão de entradas do Explorer, com mensagem singular ou plural. */
export function ExplorerDeletionDialog({ entries, onCancel, onConfirm }: ExplorerDeletionDialogProps) {
  const single = entries.length === 1 ? entries[0] : undefined;
  return (
    <ConfirmationDialog
      titleId="explorer-removal-title"
      title={<>Excluir {single
        ? single.kind === "directory" ? "pasta" : "arquivo"
        : `${entries.length} itens`}?</>}
      confirmLabel="Excluir"
      onCancel={onCancel}
      onConfirm={onConfirm}
    >
      <p>
        {single ? (
          <><strong>{single.name}</strong> será removido do workspace
          {single.kind === "directory" ? " com todo o conteúdo interno." : "."}</>
        ) : (
          <>Os <strong>{entries.length} itens selecionados</strong> serão removidos do workspace. Pastas incluem todo o conteúdo interno.</>
        )}
      </p>
    </ConfirmationDialog>
  );
}
