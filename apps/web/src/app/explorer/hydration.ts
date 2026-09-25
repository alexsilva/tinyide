import { listDirectory, type BrowserDirectoryHandle, type WorkspaceEntry } from "../../browser-filesystem";
import { explorerAncestorDirectoryPaths, workspacePathParent } from "../explorer";

type DirectoryLister = (
  handle: BrowserDirectoryHandle,
  parentPath?: string,
) => Promise<readonly WorkspaceEntry[]>;

export async function hydrateExpandedEntries(
  entries: readonly WorkspaceEntry[],
  expanded: ReadonlySet<string>,
  list: DirectoryLister = listDirectory,
): Promise<readonly WorkspaceEntry[]> {
  return Promise.all(entries.map(async (entry) => {
    if (entry.kind !== "directory" || !entry.handle || !expanded.has(entry.path)) return entry;
    const children = await list(entry.handle as BrowserDirectoryHandle, entry.path);
    return { ...entry, children: await hydrateExpandedEntries(children, expanded, list) };
  }));
}

async function refreshExpandedBranches(
  entries: readonly WorkspaceEntry[],
  previousEntries: readonly WorkspaceEntry[],
  expanded: ReadonlySet<string>,
  refreshDirectories: ReadonlySet<string>,
  affectedBranches: ReadonlySet<string>,
  list: DirectoryLister,
): Promise<readonly WorkspaceEntry[]> {
  const previousByPath = new Map(previousEntries.map((entry) => [entry.path, entry] as const));
  return Promise.all(entries.map(async (entry) => {
    if (entry.kind !== "directory" || !entry.handle || !expanded.has(entry.path)) return entry;
    const previous = previousByPath.get(entry.path);
    const previousChildren = previous?.kind === "directory" ? previous.children : undefined;
    // Nem percorra ramos não afetados. Além de evitar I/O, isso preserva a
    // identidade dos filhos e impede rerenders desnecessários da subárvore.
    if (!affectedBranches.has(entry.path) && previousChildren) {
      return entry === previous ? entry : { ...entry, children: previousChildren };
    }
    const children = refreshDirectories.has(entry.path) || !previousChildren
      ? await list(entry.handle as BrowserDirectoryHandle, entry.path)
      : previousChildren;
    return {
      ...entry,
      children: await refreshExpandedBranches(
        children,
        previousChildren ?? [],
        expanded,
        refreshDirectories,
        affectedBranches,
        list,
      ),
    };
  }));
}

function knownDirectoryPaths(entries: readonly WorkspaceEntry[]): ReadonlySet<string> {
  const paths = new Set<string>([""]);
  const visit = (items: readonly WorkspaceEntry[]) => {
    for (const entry of items) {
      if (entry.kind !== "directory") continue;
      paths.add(entry.path);
      if (entry.children) visit(entry.children);
    }
  };
  visit(entries);
  return paths;
}

function nearestKnownParent(path: string, knownDirectories: ReadonlySet<string>): string {
  let parent = workspacePathParent(path);
  while (parent && !knownDirectories.has(parent)) parent = workspacePathParent(parent);
  return parent;
}

function affectedExpandedBranches(refreshDirectories: ReadonlySet<string>): ReadonlySet<string> {
  const affected = new Set<string>();
  for (const directory of refreshDirectories) {
    let current = directory;
    while (current) {
      affected.add(current);
      current = workspacePathParent(current);
    }
  }
  return affected;
}

/**
 * Atualiza a árvore depois de eventos conhecidos do watcher sem reler todos os
 * ramos expandidos. Um evento em "src/lib/a.ts" só pode alterar a listagem de
 * "src/lib"; os filhos já hidratados de "docs", "vendor" etc. continuam válidos.
 *
 * Se um diretório ainda não tinha filhos materializados, ele é hidratado como
 * fallback para preservar a correção mesmo com estado parcial/restaurado.
 */
export async function refreshExpandedEntriesAfterChanges(
  workspaceHandle: BrowserDirectoryHandle,
  entries: readonly WorkspaceEntry[],
  expanded: ReadonlySet<string>,
  paths: readonly string[],
  list: DirectoryLister = listDirectory,
): Promise<readonly WorkspaceEntry[]> {
  if (!paths.length) {
    const rootEntries = await list(workspaceHandle);
    return hydrateExpandedEntries(rootEntries, expanded, list);
  }
  const knownDirectories = knownDirectoryPaths(entries);
  const refreshDirectories = new Set<string>();
  for (const path of paths) {
    refreshDirectories.add(nearestKnownParent(path, knownDirectories));
    // Um evento sobre um diretório já conhecido pode significar o próprio
    // (criação/remoção, visível ao reler o pai) ou o conteúdo dele (emissores
    // que reportam só o diretório). Reler também o próprio cobre o segundo
    // caso; se ele tiver sido removido, a recursão nunca o alcança porque o
    // pai relido já não o lista.
    if (path && knownDirectories.has(path)) refreshDirectories.add(path);
  }
  const affectedBranches = affectedExpandedBranches(refreshDirectories);
  const rootEntries = refreshDirectories.has("")
    ? await list(workspaceHandle)
    : entries;
  return refreshExpandedBranches(
    rootEntries,
    entries,
    expanded,
    refreshDirectories,
    affectedBranches,
    list,
  );
}

/** Expands only the folders needed to reveal one resource, without rescanning other open branches. */
export async function hydrateExplorerPath(
  entries: readonly WorkspaceEntry[],
  path: string,
  list: DirectoryLister = listDirectory,
): Promise<readonly WorkspaceEntry[]> {
  const ancestors = new Set(explorerAncestorDirectoryPaths(path));
  return Promise.all(entries.map(async (entry) => {
    if (entry.kind !== "directory" || !entry.handle || !ancestors.has(entry.path)) return entry;
    const children = await list(entry.handle as BrowserDirectoryHandle, entry.path);
    return { ...entry, children: await hydrateExplorerPath(children, path, list) };
  }));
}
