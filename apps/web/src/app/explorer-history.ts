export interface ExplorerRelocationHistoryEntry {
  readonly id: string;
  readonly kind: "relocate";
  readonly label: string;
  readonly fromPath: string;
  readonly toPath: string;
}

export type ExplorerHistoryEntry = ExplorerRelocationHistoryEntry;

export interface ExplorerHistoryState {
  readonly undo: readonly ExplorerHistoryEntry[];
  readonly redo: readonly ExplorerHistoryEntry[];
}

export interface ExplorerHistoryTransition {
  readonly entry: ExplorerHistoryEntry;
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly state: ExplorerHistoryState;
}

export function createExplorerHistoryState(): ExplorerHistoryState {
  return { undo: [], redo: [] };
}

export function recordExplorerHistory(
  state: ExplorerHistoryState,
  entry: ExplorerHistoryEntry,
  limit = 100,
): ExplorerHistoryState {
  const undo = [...state.undo, entry];
  return {
    undo: undo.length > limit ? undo.slice(undo.length - limit) : undo,
    redo: [],
  };
}

export function beginExplorerUndo(state: ExplorerHistoryState): ExplorerHistoryTransition | undefined {
  const entry = state.undo.at(-1);
  if (!entry) return undefined;
  return {
    entry,
    sourcePath: entry.toPath,
    targetPath: entry.fromPath,
    state: {
      undo: state.undo.slice(0, -1),
      redo: [...state.redo, entry],
    },
  };
}

export function beginExplorerRedo(state: ExplorerHistoryState): ExplorerHistoryTransition | undefined {
  const entry = state.redo.at(-1);
  if (!entry) return undefined;
  return {
    entry,
    sourcePath: entry.fromPath,
    targetPath: entry.toPath,
    state: {
      undo: [...state.undo, entry],
      redo: state.redo.slice(0, -1),
    },
  };
}

export function explorerUndoLabel(state: ExplorerHistoryState): string | undefined {
  const entry = state.undo.at(-1);
  return entry ? `Desfazer: ${entry.label}` : undefined;
}

export function explorerRedoLabel(state: ExplorerHistoryState): string | undefined {
  const entry = state.redo.at(-1);
  return entry ? `Refazer: ${entry.label}` : undefined;
}
