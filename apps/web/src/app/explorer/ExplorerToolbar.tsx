import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronRight, LocateFixed, MoreVertical, Redo2 } from "lucide-react";
import type { WorkspaceFileCreationOption } from "@tinyide/plugin-api";
import { FileCreationMenuItems } from "../workbench/FileCreationMenuItems";
import { WorkbenchIcon } from "../workbench/activity-components";

export interface ExplorerToolbarProps {
  readonly filterOpen: boolean;
  readonly canFilter: boolean;
  readonly canRevealFile: boolean;
  readonly workspaceAvailable: boolean;
  readonly creationOptions: readonly WorkspaceFileCreationOption[];
  readonly undoLabel: string | undefined;
  readonly redoLabel: string | undefined;
  readonly specialEntriesVisible: boolean;
  readonly onOpenFilter: () => void;
  readonly onRevealFile: () => void;
  readonly onCreate: (kind: "file" | "directory", option?: WorkspaceFileCreationOption) => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onRefresh: () => void;
  readonly onToggleSpecialEntries: () => void;
}

/** Ações do Explorer, compartilhadas pelos docks esquerdo e direito. */
export function ExplorerToolbar({
  filterOpen,
  canFilter,
  canRevealFile,
  workspaceAvailable,
  creationOptions,
  undoLabel,
  redoLabel,
  specialEntriesVisible,
  onOpenFilter,
  onRevealFile,
  onCreate,
  onUndo,
  onRedo,
  onRefresh,
  onToggleSpecialEntries,
}: ExplorerToolbarProps) {
  return (
    <>
      <button
        className="icon-button small"
        type="button"
        aria-label="Buscar arquivos no Explorer"
        aria-pressed={filterOpen}
        disabled={!canFilter}
        onClick={onOpenFilter}
      ><WorkbenchIcon icon="search" size={15} /></button>
      <button
        className="icon-button small"
        type="button"
        aria-label="Localizar arquivo aberto no Explorer"
        disabled={!canRevealFile}
        onClick={onRevealFile}
      ><LocateFixed size={15} /></button>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="icon-button small" type="button" aria-label="Ações do Explorer"><MoreVertical size={15} /></button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="menu-content" align="end" sideOffset={6}>
            {creationOptions.length ? (
              <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger className="menu-item" disabled={!workspaceAvailable}>
                  <WorkbenchIcon icon="plus" size={15} /> Novo arquivo <ChevronRight className="menu-item__submenu-arrow" size={14} />
                </DropdownMenu.SubTrigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.SubContent className="menu-content" sideOffset={6} alignOffset={-5}>
                    <FileCreationMenuItems options={creationOptions} onSelect={(option) => onCreate("file", option)} />
                  </DropdownMenu.SubContent>
                </DropdownMenu.Portal>
              </DropdownMenu.Sub>
            ) : (
              <DropdownMenu.Item className="menu-item" disabled={!workspaceAvailable} onSelect={() => onCreate("file")}>
                <WorkbenchIcon icon="plus" size={15} /> Novo arquivo
              </DropdownMenu.Item>
            )}
            <DropdownMenu.Item className="menu-item" disabled={!workspaceAvailable} onSelect={() => onCreate("directory")}>
              <WorkbenchIcon icon="folder-open" size={15} /> Nova pasta
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="menu-separator" />
            <DropdownMenu.Item className="menu-item" disabled={!undoLabel} onSelect={onUndo}>
              <WorkbenchIcon icon="undo" size={15} /> {undoLabel ?? "Desfazer"}
            </DropdownMenu.Item>
            <DropdownMenu.Item className="menu-item" disabled={!redoLabel} onSelect={onRedo}>
              <Redo2 size={15} /> {redoLabel ?? "Refazer"}
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="menu-separator" />
            <DropdownMenu.Item className="menu-item" disabled={!workspaceAvailable} onSelect={onRefresh}>
              <WorkbenchIcon icon="refresh" size={15} /> Atualizar
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="menu-separator" />
            <DropdownMenu.Item className="menu-item" onSelect={onToggleSpecialEntries}>
              <WorkbenchIcon icon="preview" size={15} />
              {specialEntriesVisible ? "Ocultar arquivos ignorados" : "Exibir arquivos ocultos"}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </>
  );
}
