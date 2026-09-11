import { ChevronDown, ChevronUp, Equal, X } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import type { WorkbenchExplorerFilterProvider } from "@tinyide/plugin-api";
import type { WorkspaceEntry } from "../../browser-filesystem";
import { explorerDropTargetDirectory, workspacePathParent } from "../explorer";
import { WorkbenchIcon } from "../workbench/activity-components";

export interface ExplorerFilterResultState {
  readonly query: string;
  readonly visiblePaths: ReadonlySet<string>;
  readonly expandedPaths: ReadonlySet<string>;
  readonly matchCount: number;
  readonly truncated: boolean;
  readonly error?: string;
}

export interface ExplorerSidebarContentProps {
  readonly workspace: {
    readonly name: string;
    readonly access: "ready" | "permission-required" | "missing";
    readonly available: boolean;
    readonly selected: boolean;
    readonly canCollapse: boolean;
  };
  readonly filter: {
    readonly provider: Pick<
      WorkbenchExplorerFilterProvider,
      "id" | "placeholder" | "supportsExactMatch" | "supportsCaseSensitive"
    > | undefined;
    readonly open: boolean;
    readonly query: string;
    readonly exact: boolean;
    readonly caseSensitive: boolean;
    readonly result: ExplorerFilterResultState | undefined;
    readonly inputRef: RefObject<HTMLInputElement | null>;
    readonly onOpen: () => void;
    readonly onClose: () => void;
    readonly onQueryChange: (query: string) => void;
    readonly onExactChange: (exact: boolean) => void;
    readonly onCaseSensitiveChange: (caseSensitive: boolean) => void;
  };
  readonly dropTargetPath: string | undefined;
  readonly loadingCursorVisible: boolean;
  readonly directoryLoading: boolean;
  readonly hasEntries: boolean;
  readonly onDropTargetChange: (path: string | undefined) => void;
  readonly onMove: (sourcePath: string, targetPath: string) => void;
  readonly onSelectRoot: () => void;
  readonly onRootContextMenu: (x: number, y: number) => void;
  readonly onExpand: () => void;
  readonly onCollapse: () => void;
  readonly onReconnect: () => void;
  readonly onOpenProject: () => void;
  readonly children: ReactNode;
}

/** Hospeda a árvore existente e cuida de filtro, raiz, acesso e drop fora dos nós. */
export function ExplorerSidebarContent({
  workspace, filter, dropTargetPath, loadingCursorVisible, directoryLoading,
  hasEntries, onDropTargetChange, onMove, onSelectRoot, onRootContextMenu,
  onExpand, onCollapse, onReconnect, onOpenProject, children,
}: ExplorerSidebarContentProps) {
  return (
    <div
      className={`sidebar-content explorer-content${dropTargetPath === "" ? " is-root-drop-target" : ""}${loadingCursorVisible ? " is-directory-loading" : ""}`}
      tabIndex={-1}
      aria-label="Arquivos do Explorer"
      aria-busy={directoryLoading}
      onPointerDown={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("input, textarea, select, button, [contenteditable='true']")) return;
        event.currentTarget.focus({ preventScroll: true });
      }}
      onKeyDown={(event) => {
        if (!filter.provider || !workspace.available) return;
        const target = event.target as HTMLElement;
        const isTextControl = target.matches("input, textarea, [contenteditable='true']");
        if (isTextControl || event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.key === "Escape" && filter.open) {
          event.preventDefault();
          filter.onClose();
          return;
        }
        if (event.key.length !== 1 || event.key.trim() === "") return;
        event.preventDefault();
        filter.onOpen();
        filter.onQueryChange(`${filter.query}${event.key}`);
      }}
      onDragOver={(event) => {
        const target = (event.target as Element).closest<HTMLElement>("[data-explorer-path]");
        if (target?.dataset.explorerKind === "directory") return;
        const containingDirectoryPath = (event.target as Element)
          .closest<HTMLElement>("[data-explorer-directory-path]")
          ?.dataset.explorerDirectoryPath ?? "";
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        onDropTargetChange(explorerDropTargetDirectory(
          target?.dataset.explorerPath,
          target?.dataset.explorerKind as WorkspaceEntry["kind"] | undefined,
          containingDirectoryPath,
        ));
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onDropTargetChange(undefined);
      }}
      onDrop={(event) => {
        const target = (event.target as Element).closest<HTMLElement>("[data-explorer-path]");
        if (target?.dataset.explorerKind === "directory") return;
        const containingDirectoryPath = (event.target as Element)
          .closest<HTMLElement>("[data-explorer-directory-path]")
          ?.dataset.explorerDirectoryPath ?? "";
        event.preventDefault();
        const sourcePath = event.dataTransfer.getData("application/x-tinyide-workspace-path");
        const targetDirectoryPath = explorerDropTargetDirectory(
          target?.dataset.explorerPath,
          target?.dataset.explorerKind as WorkspaceEntry["kind"] | undefined,
          containingDirectoryPath,
        );
        onDropTargetChange(undefined);
        if (sourcePath && workspacePathParent(sourcePath) !== targetDirectoryPath) {
          onMove(sourcePath, targetDirectoryPath);
        }
      }}
    >
      {filter.provider && workspace.available && filter.open ? (
        <div className="explorer-filter" data-explorer-filter={filter.provider.id}>
          <WorkbenchIcon icon="search" size={13} className="explorer-filter__icon" />
          <input
            ref={filter.inputRef}
            className="explorer-filter__input"
            type="search"
            value={filter.query}
            aria-label="Filtrar arquivos do Explorer"
            placeholder={filter.provider.placeholder ?? "Filtrar arquivos"}
            onChange={(event) => filter.onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                filter.onClose();
              }
            }}
          />
          {filter.provider.supportsCaseSensitive ? (
            <button
              className="explorer-filter__toggle"
              type="button"
              aria-label="Diferenciar maiúsculas de minúsculas"
              aria-pressed={filter.caseSensitive}
              title="Diferenciar maiúsculas de minúsculas"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                filter.onCaseSensitiveChange(!filter.caseSensitive);
                filter.inputRef.current?.focus({ preventScroll: true });
              }}
            >Aa</button>
          ) : null}
          {filter.provider.supportsExactMatch ? (
            <button
              className="explorer-filter__toggle explorer-filter__exact"
              type="button"
              aria-label="Correspondência exata"
              aria-pressed={filter.exact}
              title="Correspondência exata (desativa a busca difusa)"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                filter.onExactChange(!filter.exact);
                filter.inputRef.current?.focus({ preventScroll: true });
              }}
            ><Equal size={12} /></button>
          ) : null}
          <button
            className="icon-button small"
            type="button"
            aria-label="Fechar busca do Explorer"
            onClick={() => {
              filter.onClose();
            }}
          ><X size={12} /></button>
        </div>
      ) : null}
      {filter.result ? (
        <div className="explorer-filter-summary" role="status">
          {filter.result.error
            ? filter.result.error
            : filter.result.matchCount === 0
              ? "Nenhum arquivo corresponde ao filtro."
              : `${filter.result.matchCount} ${filter.result.matchCount === 1 ? "arquivo" : "arquivos"}${filter.result.truncated ? " (parcial)" : ""}`}
        </div>
      ) : null}
      {workspace.name !== "Sem workspace" ? (
        <div
          className={`workspace-name${workspace.selected ? " is-selected" : ""}`}
          data-explorer-root
          role="treeitem"
          tabIndex={0}
          aria-selected={workspace.selected}
          onClick={(event) => {
            if ((event.target as Element).closest("button")) return;
            onSelectRoot();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            onSelectRoot();
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            onSelectRoot();
            onRootContextMenu(event.clientX, event.clientY);
          }}
        >
          <span className="workspace-name__label"><WorkbenchIcon icon="folder" size={14} /> {workspace.name}</span>
          <span className="workspace-name__actions">
            <button
              className="icon-button small"
              type="button"
              aria-label="Expandir próximo nível"
              disabled={!workspace.available}
              onClick={onExpand}
            ><ChevronDown size={14} /></button>
            <button
              className="icon-button small"
              type="button"
              aria-label="Recolher nível mais profundo"
              disabled={!workspace.canCollapse}
              onClick={onCollapse}
            ><ChevronUp size={14} /></button>
          </span>
        </div>
      ) : null}
      {workspace.access !== "ready" ? (
        <div className="empty-sidebar">
          <p>{workspace.access === "permission-required"
            ? "O acesso ao workspace precisa ser restaurado."
            : "O workspace salvo não está mais disponível."}</p>
          {workspace.access === "permission-required" && workspace.available
            ? <button className="button primary compact" type="button" onClick={onReconnect}>Reconectar projeto</button>
            : null}
          {workspace.access === "missing"
            ? <button className="button primary compact" type="button" onClick={onOpenProject}>Reabrir projeto</button>
            : null}
        </div>
      ) : hasEntries ? children : (
        <div className="empty-sidebar">
          <p>Nenhum projeto aberto.</p>
        </div>
      )}
    </div>
  );
}
