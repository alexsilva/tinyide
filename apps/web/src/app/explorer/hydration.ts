import { listDirectory, type BrowserDirectoryHandle, type WorkspaceEntry } from "../../browser-filesystem";
import { explorerAncestorDirectoryPaths } from "../explorer";

export async function hydrateExpandedEntries(
  entries: readonly WorkspaceEntry[],
  expanded: ReadonlySet<string>,
): Promise<readonly WorkspaceEntry[]> {
  return Promise.all(entries.map(async (entry) => {
    if (entry.kind !== "directory" || !entry.handle || !expanded.has(entry.path)) return entry;
    const children = await listDirectory(entry.handle as BrowserDirectoryHandle, entry.path);
    return { ...entry, children: await hydrateExpandedEntries(children, expanded) };
  }));
}

/** Expands only the folders needed to reveal one resource, without rescanning other open branches. */
export async function hydrateExplorerPath(
  entries: readonly WorkspaceEntry[],
  path: string,
): Promise<readonly WorkspaceEntry[]> {
  const ancestors = new Set(explorerAncestorDirectoryPaths(path));
  return Promise.all(entries.map(async (entry) => {
    if (entry.kind !== "directory" || !entry.handle || !ancestors.has(entry.path)) return entry;
    const children = await listDirectory(entry.handle as BrowserDirectoryHandle, entry.path);
    return { ...entry, children: await hydrateExplorerPath(children, path) };
  }));
}
