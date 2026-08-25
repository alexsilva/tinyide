import type {
  ResourceContext,
  ResourceContextMenuItem,
  ResourceContextMenuProvider,
} from "@tinyide/plugin-api";
import type { OpenDocument, WorkspaceEntry } from "../../browser-filesystem";

export interface ResourceContextWorkspace {
  readonly workspaceName: string;
  readonly workspaceRoot?: string;
}

function workspaceFields(workspace: ResourceContextWorkspace) {
  return {
    ...(workspace.workspaceName !== "Sem workspace" ? { workspaceName: workspace.workspaceName } : {}),
    ...(workspace.workspaceRoot ? { workspaceRoot: workspace.workspaceRoot } : {}),
  };
}

export function resourceContextForEntry(
  entry: WorkspaceEntry,
  documents: readonly OpenDocument[],
  workspace: ResourceContextWorkspace,
): ResourceContext {
  const document = entry.kind === "file"
    ? documents.find((candidate) => candidate.path === entry.path)
    : undefined;
  return {
    kind: entry.kind,
    name: entry.name,
    path: entry.path,
    ...(document ? { documentId: document.id } : {}),
    ...workspaceFields(workspace),
    ...(document?.kind === "text" ? { isDirty: document.content !== document.savedContent } : {}),
  };
}

export function resourceContextForRoot(workspace: ResourceContextWorkspace): ResourceContext {
  return {
    kind: "directory",
    name: workspace.workspaceName,
    path: "",
    ...workspaceFields(workspace),
  };
}

export function resourceContextForDocument(
  document: OpenDocument,
  workspace: ResourceContextWorkspace,
): ResourceContext {
  return {
    kind: "file",
    name: document.name,
    path: document.path ?? document.name,
    documentId: document.id,
    ...workspaceFields(workspace),
    ...(document.kind === "text" ? { isDirty: document.content !== document.savedContent } : {}),
  };
}

export function sortContextMenuItems(
  items: readonly ResourceContextMenuItem[],
  groupOrder: Readonly<Record<string, number>>,
): readonly ResourceContextMenuItem[] {
  return items
    .filter((item) => item.enabled !== false)
    .slice()
    .sort((left, right) => (groupOrder[left.group ?? ""] ?? 1000) - (groupOrder[right.group ?? ""] ?? 1000)
      || (left.order ?? 0) - (right.order ?? 0));
}

/**
 * Resolve contribuições de plugins sem permitir que a falha de um provider
 * derrube o menu inteiro. O host decide quando aguardar este trabalho; menus
 * responsivos devem renderizar as ações nativas antes de chamar esta função.
 */
export async function resourceContextMenuContributions(
  providers: readonly ResourceContextMenuProvider[],
  resource: ResourceContext,
): Promise<readonly ResourceContextMenuItem[]> {
  const contributed = await Promise.all(providers.map(async (provider) => {
    try {
      return await provider.provideItems(resource);
    } catch (cause) {
      console.warn(`Falha ao obter itens do menu de contexto pelo provider '${provider.id}'.`, cause);
      return [];
    }
  }));
  return contributed.flat();
}
