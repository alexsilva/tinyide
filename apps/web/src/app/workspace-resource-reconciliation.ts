import {
  readFileDocument,
  resolveFileHandle,
  type BrowserDirectoryHandle,
  type OpenDocument,
} from "../browser-filesystem";
import { replaceWorkspacePathPrefix, workspacePathName } from "./explorer";

export function isSafeWorkspaceResourcePath(path: string): boolean {
  if (!path || path.includes("\\")) return false;
  const segments = path.split("/");
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

export function assertWorkspaceResourcePath(path: string): void {
  if (!isSafeWorkspaceResourcePath(path)) {
    throw new Error("Caminho de recurso inválido.");
  }
}

export interface WorkspaceResourceRename {
  readonly from: string;
  readonly to: string;
}

export interface OpenDocumentResourceReconciliation {
  readonly documents: readonly OpenDocument[];
  readonly removedIds: readonly string[];
  readonly remappedIds: readonly {
    readonly from: string;
    readonly to: string;
  }[];
  readonly externalChanges: readonly {
    readonly id: string;
    readonly path: string;
    readonly kind: "reloaded" | "conflict";
  }[];
}

function renamedWorkspacePath(path: string, renames: readonly WorkspaceResourceRename[]): string {
  let current = path;
  for (let pass = 0; pass < renames.length; pass += 1) {
    const rename = renames.find(({ from }) => current === from || current.startsWith(`${from}/`));
    if (!rename) break;
    const next = replaceWorkspacePathPrefix(current, rename.from, rename.to);
    if (next === current) break;
    current = next;
  }
  return current;
}

function mergeDiskDocument(
  current: OpenDocument,
  disk: OpenDocument,
  path: string,
): OpenDocument {
  const clean = current.content === current.savedContent;
  if (clean) {
    return {
      ...disk,
      id: path,
      path,
      name: workspacePathName(path),
      selectionStart: Math.min(current.selectionStart, disk.content.length),
      selectionEnd: Math.min(current.selectionEnd, disk.content.length),
      scrollTop: current.scrollTop,
      scrollLeft: current.scrollLeft,
    };
  }
  return {
    ...current,
    id: path,
    path,
    name: workspacePathName(path),
    ...(disk.handle ? {handle: disk.handle} : {}),
    kind: disk.kind,
    mediaType: disk.mediaType,
    size: disk.size,
    savedContent: disk.content,
  };
}

export async function reconcileOpenDocumentsAfterWorkspaceChange(options: {
  readonly documents: readonly OpenDocument[];
  readonly workspaceHandle: BrowserDirectoryHandle;
  readonly workspaceRoot?: string;
  readonly renames?: readonly WorkspaceResourceRename[];
}): Promise<OpenDocumentResourceReconciliation> {
  const renames = options.renames ?? [];
  const removedIds: string[] = [];
  const remappedIds: Array<{from: string; to: string}> = [];
  const externalChanges: Array<{id: string; path: string; kind: "reloaded" | "conflict"}> = [];
  const resolved: OpenDocument[] = [];

  for (const document of options.documents) {
    if (!document.path) {
      resolved.push(document);
      continue;
    }
    const path = renamedWorkspacePath(document.path, renames);
    try {
      const handle = await resolveFileHandle(options.workspaceHandle, path);
      const disk = await readFileDocument(handle, path, options.workspaceRoot);
      const changedOnDisk = disk.kind !== document.kind
        || disk.mediaType !== document.mediaType
        || disk.size !== document.size
        || disk.content !== document.savedContent;
      const clean = document.content === document.savedContent;
      const next = mergeDiskDocument(document, disk, path);
      resolved.push(next);
      if (document.id !== next.id) remappedIds.push({from: document.id, to: next.id});
      if (changedOnDisk) {
        externalChanges.push({
          id: next.id,
          path,
          kind: clean ? "reloaded" : "conflict",
        });
      }
    } catch {
      removedIds.push(document.id);
    }
  }

  const order = new Map(options.documents.map((document, index) => [document.id, index]));
  resolved.sort((left, right) => {
    const leftSource = remappedIds.find((item) => item.to === left.id)?.from ?? left.id;
    const rightSource = remappedIds.find((item) => item.to === right.id)?.from ?? right.id;
    return (order.get(leftSource) ?? Number.MAX_SAFE_INTEGER) - (order.get(rightSource) ?? Number.MAX_SAFE_INTEGER);
  });

  return {documents: resolved, removedIds, remappedIds, externalChanges};
}
