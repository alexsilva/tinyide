// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { WorkspaceEntry } from "../../browser-filesystem";
import { EntryTree } from "./ExplorerTree";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

function files(count: number): WorkspaceEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `file-${String(index).padStart(5, "0")}.txt`,
    path: `many/file-${String(index).padStart(5, "0")}.txt`,
    kind: "file" as const,
  }));
}

function renderTree(entries: readonly WorkspaceEntry[], selectedPath?: string) {
  host = document.createElement("div");
  host.style.height = "400px";
  host.style.overflowY = "auto";
  document.body.append(host);
  root = createRoot(host);
  const noop = () => undefined;
  act(() => root?.render(
    <EntryTree
      entries={entries}
      parentPath="many"
      expanded={new Set()}
      showHidden
      showIgnored
      ignoredPaths={new Set()}
      revealHidden
      revealedHiddenPaths={new Set()}
      filterVisiblePaths={undefined}
      highlightedPath={undefined}
      selectedPath={selectedPath}
      selectedPaths={selectedPath ? new Set([selectedPath]) : new Set()}
      resourceDecorations={new Map()}
      onToggle={noop}
      onSelect={noop}
      onOpen={noop}
      onContextMenu={noop}
      onMove={noop}
      draggingPaths={new Set()}
      dropTargetPath={undefined}
      onDraggingPathChange={noop}
      onDropTargetPathChange={noop}
      onShowHiddenDirectory={noop}
      onShowIgnoredEntries={noop}
      renamePath={undefined}
      renameName=""
      renameError={undefined}
      onRenameNameChange={noop}
      onRenameSubmit={noop}
      onRenameCancel={noop}
      creationKind={undefined}
      creationParentPath=""
      creationName=""
      creationError={undefined}
      onCreationNameChange={noop}
      onCreationSubmit={noop}
      onCreationCancel={noop}
      workspaceName="perf"
    />,
  ));
  return host;
}

describe("Explorer large directory virtualization", () => {
  it("does not materialize thousands of flat file rows", () => {
    const container = renderTree(files(5_000));
    expect(container.querySelectorAll(".tree-entry-row").length).toBeLessThan(200);
    expect(container.querySelector("[data-explorer-virtual-spacer]")).not.toBeNull();
  });

  it("materializes a selected offscreen file so reveal can scroll to it", () => {
    const target = "many/file-04999.txt";
    const container = renderTree(files(5_000), target);
    expect(container.querySelector(`[data-explorer-path="${target}"]`)).not.toBeNull();
    expect(container.querySelectorAll(".tree-entry-row").length).toBeLessThan(200);
  });
});
