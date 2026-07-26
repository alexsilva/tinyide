import { describe, expect, it } from "vitest";
import {
  beginExplorerRedo,
  beginExplorerUndo,
  createExplorerHistoryState,
  explorerRedoLabel,
  explorerUndoLabel,
  recordExplorerHistory,
} from "./explorer-history";

const renameEntry = {
  id: "rename-1",
  kind: "relocate" as const,
  label: "Renomear src/old.ts para src/new.ts",
  fromPath: "src/old.ts",
  toPath: "src/new.ts",
};

describe("explorer history", () => {
  it("records an operation and clears redo", () => {
    const state = recordExplorerHistory({ undo: [], redo: [renameEntry] }, renameEntry);
    expect(state.undo).toEqual([renameEntry]);
    expect(state.redo).toEqual([]);
  });

  it("produces inverse and forward transitions", () => {
    const recorded = recordExplorerHistory(createExplorerHistoryState(), renameEntry);
    const undo = beginExplorerUndo(recorded);
    expect(undo).toMatchObject({ sourcePath: "src/new.ts", targetPath: "src/old.ts" });
    expect(undo?.state.undo).toEqual([]);
    expect(undo?.state.redo).toEqual([renameEntry]);

    const redo = beginExplorerRedo(undo!.state);
    expect(redo).toMatchObject({ sourcePath: "src/old.ts", targetPath: "src/new.ts" });
    expect(redo?.state.undo).toEqual([renameEntry]);
    expect(redo?.state.redo).toEqual([]);
  });

  it("exposes labels and honors the history limit", () => {
    let state = createExplorerHistoryState();
    state = recordExplorerHistory(state, renameEntry, 1);
    state = recordExplorerHistory(state, { ...renameEntry, id: "rename-2", label: "Mover arquivo" }, 1);
    expect(state.undo).toHaveLength(1);
    expect(explorerUndoLabel(state)).toBe("Desfazer: Mover arquivo");
    const undone = beginExplorerUndo(state)!;
    expect(explorerRedoLabel(undone.state)).toBe("Refazer: Mover arquivo");
  });
});
