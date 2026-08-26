import { readHostState, removeHostState, writeHostState } from "../session-store";

/**
 * Qual projeto este host reabre quando uma janela nasce sem escopo na URL.
 *
 * O ponteiro é por host (desktop ou navegador) e guarda apenas o caminho — nunca
 * layout, abas ou snapshot. Isso é o que impede o sintoma original: uma aba de
 * navegador gravava o ponteiro global e o app compilado, ao recarregar, abria o
 * projeto dela. Com escopo na URL o ponteiro só é consultado no caso em que
 * realmente não há resposta melhor: uma janela nova, sem projeto declarado.
 */

const LAST_WORKSPACE_KEY = "last-workspace";

export interface HostWorkspacePointer {
  readonly path: string;
  readonly name: string;
}

function normalizePointer(value: unknown): HostWorkspacePointer | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<HostWorkspacePointer>;
  if (typeof candidate.path !== "string" || !candidate.path.trim()) return undefined;
  return {
    path: candidate.path,
    name: typeof candidate.name === "string" && candidate.name.trim()
      ? candidate.name
      : candidate.path.split(/[\\/]/).filter(Boolean).at(-1) ?? candidate.path,
  };
}

export async function readHostWorkspacePointer(): Promise<HostWorkspacePointer | undefined> {
  try {
    return normalizePointer(await readHostState(LAST_WORKSPACE_KEY));
  } catch {
    return undefined;
  }
}

export async function writeHostWorkspacePointer(pointer: HostWorkspacePointer): Promise<void> {
  await writeHostState(LAST_WORKSPACE_KEY, pointer).catch(() => undefined);
}

export async function clearHostWorkspacePointer(): Promise<void> {
  await removeHostState(LAST_WORKSPACE_KEY).catch(() => undefined);
}
