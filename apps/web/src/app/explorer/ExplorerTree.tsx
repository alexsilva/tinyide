import { Check, ChevronDown, ChevronRight, X } from "lucide-react";
import { WorkbenchIcon } from "../workbench/activity-components";
import { fileIconIdFor, hasWorkbenchIcon } from "../workbench/icon-manager";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ResourceDecoration } from "@tinyide/plugin-api";
import type { WorkspaceEntry } from "../../browser-filesystem";
import {
  explorerEntryVisible,
  explorerCreationInsertionIndex,
  explorerDirectoryEmptyState,
  hiddenExplorerEntryCount,
  ignoredExplorerEntryCount,
} from "../explorer";
import { resourceIconFor } from "../runtime";

const EXPLORER_VIRTUALIZE_THRESHOLD = 400;
const EXPLORER_ROW_HEIGHT = 27;
const EXPLORER_VIRTUAL_OVERSCAN = 24;

interface ExplorerVirtualRange {
  readonly start: number;
  readonly end: number;
}

function explorerScrollParent(element: HTMLElement): HTMLElement | undefined {
  let parent = element.parentElement;
  while (parent) {
    const style = window.getComputedStyle(parent);
    if (/(auto|scroll)/.test(`${style.overflowY} ${style.overflow}`)) return parent;
    parent = parent.parentElement;
  }
  return undefined;
}

function useExplorerVirtualRange(
  enabled: boolean,
  itemCount: number,
  focusIndex: number,
): { readonly ref: React.RefObject<HTMLDivElement | null>; readonly range: ExplorerVirtualRange } {
  const ref = useRef<HTMLDivElement>(null);
  const initialEnd = enabled ? Math.min(itemCount, EXPLORER_VIRTUAL_OVERSCAN * 3) : itemCount;
  const [range, setRange] = useState<ExplorerVirtualRange>({ start: 0, end: initialEnd });

  useLayoutEffect(() => {
    if (!enabled) {
      setRange((current) => current.start === 0 && current.end === itemCount ? current : { start: 0, end: itemCount });
      return;
    }
    const tree = ref.current;
    if (!tree) return;
    const scrollParent = explorerScrollParent(tree);
    const update = () => {
      const treeRect = tree.getBoundingClientRect();
      const viewportRect = scrollParent?.getBoundingClientRect() ?? {
        top: 0,
        bottom: window.innerHeight,
      };
      const visibleTop = Math.max(0, viewportRect.top - treeRect.top);
      const visibleBottom = Math.max(visibleTop, viewportRect.bottom - treeRect.top);
      let start = Math.max(0, Math.floor(visibleTop / EXPLORER_ROW_HEIGHT) - EXPLORER_VIRTUAL_OVERSCAN);
      let end = Math.min(itemCount, Math.ceil(visibleBottom / EXPLORER_ROW_HEIGHT) + EXPLORER_VIRTUAL_OVERSCAN);
      if (end <= start) end = Math.min(itemCount, start + EXPLORER_VIRTUAL_OVERSCAN * 3);
      if (focusIndex >= 0 && (focusIndex < start || focusIndex >= end)) {
        start = Math.max(0, focusIndex - EXPLORER_VIRTUAL_OVERSCAN);
        end = Math.min(itemCount, focusIndex + EXPLORER_VIRTUAL_OVERSCAN + 1);
      }
      setRange((current) => current.start === start && current.end === end ? current : { start, end });
    };
    update();
    scrollParent?.addEventListener("scroll", update, { passive: true });
    const resizeObserver = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(update);
    if (scrollParent) resizeObserver?.observe(scrollParent);
    return () => {
      scrollParent?.removeEventListener("scroll", update);
      resizeObserver?.disconnect();
    };
  }, [enabled, focusIndex, itemCount]);

  return { ref, range };
}

export function ExplorerCreationRow({
  kind,
  name,
  error,
  onNameChange,
  onSubmit,
  onCancel,
}: {
  readonly kind: "file" | "directory";
  readonly name: string;
  readonly error: string | undefined;
  readonly onNameChange: (name: string) => void;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
}) {
  const label = kind === "directory" ? "Nome da nova pasta" : "Nome do novo arquivo";
  const rowRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
      rowRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      ref={rowRef}
      className="tree-entry-row tree-entry-row--creation"
      data-explorer-creation-row
    >
      <form
        className={`tree-entry tree-entry--${kind} tree-entry--creation${error ? " has-error" : ""}`}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        {kind === "directory"
          ? <WorkbenchIcon icon="folder" size={14} className="tree-entry__icon tree-entry__icon--directory" />
          : <WorkbenchIcon icon="file" size={14} className="tree-entry__icon tree-entry__icon--file" />}
        <input
          ref={inputRef}
          autoFocus
          value={name}
          aria-label={label}
          placeholder={label}
          aria-invalid={Boolean(error)}
          onChange={(event) => onNameChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onCancel();
          }}
        />
        <button className="icon-button small" type="submit" aria-label="Confirmar criação"><Check size={13} /></button>
        <button className="icon-button small" type="button" aria-label="Cancelar criação" onClick={onCancel}><X size={13} /></button>
        {error ? <span className="tree-entry-rename-error" role="alert">{error}</span> : null}
      </form>
    </div>
  );
}

export function EntryTree({
  entries,
  parentPath,
  expanded,
  showHidden,
  showIgnored,
  ignoredPaths,
  revealHidden,
  revealedHiddenPaths,
  filterVisiblePaths,
  highlightedPath,
  selectedPath,
  selectedPaths,
  resourceDecorations,
  onToggle,
  onSelect,
  onOpen,
  onContextMenu,
  onMove,
  draggingPaths,
  dropTargetPath,
  onDraggingPathChange,
  onDropTargetPathChange,
  onShowHiddenDirectory,
  onShowIgnoredEntries,
  renamePath,
  renameName,
  renameError,
  onRenameNameChange,
  onRenameSubmit,
  onRenameCancel,
  creationKind,
  creationParentPath,
  creationName,
  creationError,
  onCreationNameChange,
  onCreationSubmit,
  onCreationCancel,
  workspaceName,
  workspaceRoot,
}: {
  readonly entries: readonly WorkspaceEntry[];
  readonly parentPath: string;
  readonly expanded: ReadonlySet<string>;
  readonly showHidden: boolean;
  readonly showIgnored: boolean;
  readonly ignoredPaths: ReadonlySet<string>;
  readonly revealHidden: boolean;
  readonly revealedHiddenPaths: ReadonlySet<string>;
  readonly filterVisiblePaths: ReadonlySet<string> | undefined;
  readonly highlightedPath: string | undefined;
  readonly selectedPath: string | undefined;
  readonly selectedPaths: ReadonlySet<string>;
  readonly resourceDecorations: ReadonlyMap<string, ResourceDecoration>;
  readonly onToggle: (entry: WorkspaceEntry) => void;
  readonly onSelect: (entry: WorkspaceEntry, additive: boolean) => void;
  readonly onOpen: (entry: WorkspaceEntry) => void;
  readonly onContextMenu: (entry: WorkspaceEntry, x: number, y: number) => void;
  readonly onMove: (sourcePaths: readonly string[], targetDirectoryPath: string) => void;
  readonly draggingPaths: ReadonlySet<string>;
  readonly dropTargetPath: string | undefined;
  readonly onDraggingPathChange: (path: string | undefined) => void;
  readonly onDropTargetPathChange: (path: string | undefined) => void;
  readonly onShowHiddenDirectory: (path: string) => void;
  readonly onShowIgnoredEntries: () => void;
  readonly renamePath: string | undefined;
  readonly renameName: string;
  readonly renameError: string | undefined;
  readonly onRenameNameChange: (name: string) => void;
  readonly onRenameSubmit: () => void;
  readonly onRenameCancel: () => void;
  readonly creationKind: "file" | "directory" | undefined;
  readonly creationParentPath: string;
  readonly creationName: string;
  readonly creationError: string | undefined;
  readonly onCreationNameChange: (name: string) => void;
  readonly onCreationSubmit: () => void;
  readonly onCreationCancel: () => void;
  readonly workspaceName: string;
  readonly workspaceRoot?: string;
}) {
  const filteredEntries = filterVisiblePaths
    ? entries.filter((entry) => filterVisiblePaths.has(entry.path))
    : entries;
  const visibleEntries = filteredEntries.filter((entry) => (
    explorerEntryVisible(entry, revealHidden, showIgnored, ignoredPaths)
  ));
  const creationIndex = creationKind && creationParentPath === parentPath
    ? explorerCreationInsertionIndex(visibleEntries, creationKind, creationName.trim())
    : -1;
  const creationRow = creationKind && creationParentPath === parentPath ? (
    <ExplorerCreationRow
      kind={creationKind}
      name={creationName}
      error={creationError}
      onNameChange={onCreationNameChange}
      onSubmit={onCreationSubmit}
      onCancel={onCreationCancel}
    />
  ) : null;
  const treeItems: Array<
    | { readonly type: "creation" }
    | { readonly type: "entry"; readonly entry: WorkspaceEntry }
  > = visibleEntries.map((entry) => ({ type: "entry", entry }));
  if (creationRow) treeItems.splice(creationIndex, 0, { type: "creation" });
  // Diretórios com milhares de arquivos eram materializados integralmente no DOM: 5 mil arquivos
  // custavam >1,5 s só para montar o Explorer. Listas planas de arquivos têm altura fixa e podem
  // ser virtualizadas sem afetar diretórios expandidos ou a semântica da árvore.
  const virtualized = !creationRow
    && treeItems.length >= EXPLORER_VIRTUALIZE_THRESHOLD
    && visibleEntries.every((entry) => entry.kind === "file");
  const focusPath = renamePath ?? selectedPath ?? highlightedPath;
  const focusIndex = virtualized && focusPath
    ? visibleEntries.findIndex((entry) => entry.path === focusPath)
    : -1;
  const { ref: treeRef, range: virtualRange } = useExplorerVirtualRange(virtualized, treeItems.length, focusIndex);
  const renderedTreeItems = virtualized
    ? treeItems.slice(virtualRange.start, virtualRange.end)
    : treeItems;

  return (
    <div ref={treeRef} className="tree" data-explorer-directory-path={parentPath}>
      {virtualized && virtualRange.start > 0 ? (
        <div aria-hidden="true" data-explorer-virtual-spacer style={{ height: virtualRange.start * EXPLORER_ROW_HEIGHT }} />
      ) : null}
      {renderedTreeItems.map((item) => {
        if (item.type === "creation") {
          return <div key="explorer-creation-entry">{creationRow}</div>;
        }
        const { entry } = item;
        const contributedIcon = entry.kind === "file"
          ? resourceIconFor({
              kind: "file",
              name: entry.name,
              path: entry.path,
              ...(workspaceName !== "Sem workspace" ? { workspaceName } : {}),
              ...(workspaceRoot ? { workspaceRoot } : {}),
            })
          : undefined;
        const decoration = resourceDecorations.get(entry.path);
        const childEmptyState = entry.kind === "directory" && expanded.has(entry.path)
          ? explorerDirectoryEmptyState(
              entry.children,
              showHidden || revealedHiddenPaths.has(entry.path),
              showIgnored,
              ignoredPaths,
            )
          : undefined;
        return <div key={entry.path}>
          <div className="tree-entry-row">
            {renamePath === entry.path ? (
              <form className={`tree-entry tree-entry--${entry.kind} tree-entry--rename${renameError ? " has-error" : ""}`} onSubmit={(event) => { event.preventDefault(); onRenameSubmit(); }}>
                {entry.kind === "directory" ? <WorkbenchIcon icon="folder" size={14} className="tree-entry__icon tree-entry__icon--directory" /> : <WorkbenchIcon icon="file" size={14} className="tree-entry__icon tree-entry__icon--file" />}
                <input
                  autoFocus
                  value={renameName}
                  aria-label={`Renomear ${entry.name}`}
                  aria-invalid={Boolean(renameError)}
                  onChange={(event) => onRenameNameChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") onRenameCancel();
                  }}
                />
                <button className="icon-button small" type="submit" aria-label="Confirmar renomeação"><Check size={13} /></button>
                <button className="icon-button small" type="button" aria-label="Cancelar renomeação" onClick={onRenameCancel}><X size={13} /></button>
                {renameError ? <span className="tree-entry-rename-error" role="alert">{renameError}</span> : null}
              </form>
            ) : (
              <button
                type="button"
                data-explorer-path={entry.path}
                data-explorer-kind={entry.kind}
                draggable
                className={`tree-entry tree-entry--${entry.kind}${highlightedPath === entry.path ? " is-new" : ""}${selectedPaths.has(entry.path) ? " is-selected" : ""}${draggingPaths.has(entry.path) ? " is-dragging" : ""}${dropTargetPath === entry.path ? " is-drop-target" : ""}`}
                onDragStart={(event) => {
                  const sourcePaths = selectedPaths.has(entry.path) ? [...selectedPaths] : [entry.path];
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("application/x-tinyide-workspace-paths", JSON.stringify(sourcePaths));
                  onDraggingPathChange(entry.path);
                }}
                onDragEnd={() => {
                  onDraggingPathChange(undefined);
                  onDropTargetPathChange(undefined);
                }}
                onDragOver={(event) => {
                  if (entry.kind !== "directory") return;
                  event.preventDefault();
                  event.stopPropagation();
                  event.dataTransfer.dropEffect = "move";
                  onDropTargetPathChange(entry.path);
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onDropTargetPathChange(undefined);
                }}
                onDrop={(event) => {
                  if (entry.kind !== "directory") return;
                  event.preventDefault();
                  event.stopPropagation();
                  const encodedPaths = event.dataTransfer.getData("application/x-tinyide-workspace-paths");
                  onDropTargetPathChange(undefined);
                  try {
                    const sourcePaths = JSON.parse(encodedPaths) as unknown;
                    if (Array.isArray(sourcePaths) && sourcePaths.every((path) => typeof path === "string")) {
                      onMove(sourcePaths, entry.path);
                    }
                  } catch {
                    // Ignore drops from outside the Explorer.
                  }
                }}
                onClick={(event) => {
                  const additive = event.ctrlKey || event.metaKey;
                  if (entry.kind === "directory") {
                    onSelect(entry, additive);
                    if (!additive) onToggle(entry);
                    return;
                  }
                  if (!additive && selectedPath === entry.path && selectedPaths.size === 1) {
                    onOpen(entry);
                    return;
                  }
                  onSelect(entry, additive);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  const needsSelection = !selectedPaths.has(entry.path);
                  if (needsSelection) {
                    // Abra o menu antes de atualizar a seleção: selecionar uma
                    // linha pode rerenderizar uma árvore grande e atrasar
                    // perceptivelmente o primeiro frame do popup. O host do menu
                    // já resolve o item clicado sem depender da seleção nova.
                    onContextMenu(entry, event.clientX, event.clientY);
                    window.requestAnimationFrame(() => onSelect(entry, false));
                    return;
                  }
                  if (needsSelection) onSelect(entry, false);
                  onContextMenu(entry, event.clientX, event.clientY);
                }}
              >
              {entry.kind === "directory" ? (
                expanded.has(entry.path) ? <ChevronDown size={14} /> : <ChevronRight size={14} />
              ) : (
                <span className="tree-spacer" />
              )}
              {entry.kind === "directory" ? (
                expanded.has(entry.path)
                  ? <WorkbenchIcon icon="folder-open" size={14} className="tree-entry__icon tree-entry__icon--directory" />
                  : <WorkbenchIcon icon="folder" size={14} className="tree-entry__icon tree-entry__icon--directory" />
              ) : (() => {
                const typedId = fileIconIdFor(entry.name);
                if (typedId !== "file" && hasWorkbenchIcon(typedId)) {
                  return <WorkbenchIcon icon={typedId} size={14} className="tree-entry__icon tree-entry__icon--file" />;
                }
                if (contributedIcon) {
                  return (
                    <span
                      className="resource-icon"
                      title={contributedIcon.title}
                      style={{
                        color: contributedIcon.foreground ?? "currentColor",
                        background: contributedIcon.background ?? "transparent",
                      }}
                    >{contributedIcon.label}</span>
                  );
                }
                return <WorkbenchIcon icon="file" size={14} className="tree-entry__icon tree-entry__icon--file" />;
              })()}
              <span
                className="tree-entry__name"
                title={decoration?.tooltip}
                style={decoration?.foreground ? { color: decoration.foreground } : undefined}
              >{entry.name}</span>
              {decoration?.badge ? <span className="tree-entry__badge">{decoration.badge}</span> : null}
              </button>
            )}
          </div>
          {entry.kind === "directory" && expanded.has(entry.path) && (entry.children || creationParentPath === entry.path) ? (
            <div className="tree-children">
              {creationKind && creationParentPath === entry.path ? (
                <EntryTree
                  entries={entry.children ?? []}
                  parentPath={entry.path}
                  expanded={expanded}
                  showHidden={showHidden}
                  showIgnored={showIgnored}
                  ignoredPaths={ignoredPaths}
                  revealHidden={showHidden || revealedHiddenPaths.has(entry.path)}
                  revealedHiddenPaths={revealedHiddenPaths}
                  filterVisiblePaths={filterVisiblePaths}
                  highlightedPath={highlightedPath}
                  selectedPath={selectedPath}
                  selectedPaths={selectedPaths}
                  resourceDecorations={resourceDecorations}
                  onToggle={onToggle}
                  onSelect={onSelect}
                  onOpen={onOpen}
                  onContextMenu={onContextMenu}
                  onMove={onMove}
                  draggingPaths={draggingPaths}
                  dropTargetPath={dropTargetPath}
                  onDraggingPathChange={onDraggingPathChange}
                  onDropTargetPathChange={onDropTargetPathChange}
                  onShowHiddenDirectory={onShowHiddenDirectory}
                  onShowIgnoredEntries={onShowIgnoredEntries}
                  renamePath={renamePath}
                  renameName={renameName}
                  renameError={renameError}
                  onRenameNameChange={onRenameNameChange}
                  onRenameSubmit={onRenameSubmit}
                  onRenameCancel={onRenameCancel}
                  creationKind={creationKind}
                  creationParentPath={creationParentPath}
                  creationName={creationName}
                  creationError={creationError}
                  onCreationNameChange={onCreationNameChange}
                  onCreationSubmit={onCreationSubmit}
                  onCreationCancel={onCreationCancel}
                  workspaceName={workspaceName}
                  {...(workspaceRoot ? { workspaceRoot } : {})}
                />
              ) : childEmptyState === "hidden-only" ? (
                <button className="tree-empty-state tree-empty-state--action" type="button" onClick={() => onShowHiddenDirectory(entry.path)}>
                  Contém {hiddenExplorerEntryCount(entry.children)} {hiddenExplorerEntryCount(entry.children) === 1 ? "arquivo oculto" : "arquivos ocultos"}. Exibir?
                </button>
              ) : childEmptyState === "ignored-only" ? (
                <button className="tree-empty-state tree-empty-state--action" type="button" onClick={onShowIgnoredEntries}>
                  Contém {ignoredExplorerEntryCount(entry.children, ignoredPaths)} {ignoredExplorerEntryCount(entry.children, ignoredPaths) === 1 ? "item ignorado" : "itens ignorados"}. Exibir?
                </button>
              ) : childEmptyState === "filtered-only" ? (
                <button className="tree-empty-state tree-empty-state--action" type="button" onClick={() => { onShowHiddenDirectory(entry.path); onShowIgnoredEntries(); }}>
                  Contém apenas itens ocultos ou ignorados. Exibir?
                </button>
              ) : childEmptyState === "empty" ? (
                <div className="tree-empty-state">Pasta vazia</div>
              ) : (
                <EntryTree
                  entries={entry.children ?? []}
                  parentPath={entry.path}
                  expanded={expanded}
                  showHidden={showHidden}
                  showIgnored={showIgnored}
                  ignoredPaths={ignoredPaths}
                  revealHidden={showHidden || revealedHiddenPaths.has(entry.path)}
                  revealedHiddenPaths={revealedHiddenPaths}
                  filterVisiblePaths={filterVisiblePaths}
                  highlightedPath={highlightedPath}
                  selectedPath={selectedPath}
                  selectedPaths={selectedPaths}
                  resourceDecorations={resourceDecorations}
                  onToggle={onToggle}
                  onSelect={onSelect}
                  onOpen={onOpen}
                  onContextMenu={onContextMenu}
                  onMove={onMove}
                  draggingPaths={draggingPaths}
                  dropTargetPath={dropTargetPath}
                  onDraggingPathChange={onDraggingPathChange}
                  onDropTargetPathChange={onDropTargetPathChange}
                  onShowHiddenDirectory={onShowHiddenDirectory}
                  onShowIgnoredEntries={onShowIgnoredEntries}
                  renamePath={renamePath}
                  renameName={renameName}
                  renameError={renameError}
                  onRenameNameChange={onRenameNameChange}
                  onRenameSubmit={onRenameSubmit}
                  onRenameCancel={onRenameCancel}
                  creationKind={creationKind}
                  creationParentPath={creationParentPath}
                  creationName={creationName}
                  creationError={creationError}
                  onCreationNameChange={onCreationNameChange}
                  onCreationSubmit={onCreationSubmit}
                  onCreationCancel={onCreationCancel}
                  workspaceName={workspaceName}
                  {...(workspaceRoot ? { workspaceRoot } : {})}
                />
              )}
            </div>
          ) : null}
        </div>;
      })}
      {virtualized && virtualRange.end < treeItems.length ? (
        <div
          aria-hidden="true"
          data-explorer-virtual-spacer
          style={{ height: (treeItems.length - virtualRange.end) * EXPLORER_ROW_HEIGHT }}
        />
      ) : null}
    </div>
  );
}
