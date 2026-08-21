import type {
  WorkbenchIconDefinition,
  WorkbenchIconPackDefinition,
  WorkbenchIconProvider,
} from "@tinyide/plugin-api";
import type { TinyIdePlatform } from "../platform";

const ICON_PACK_STORAGE_KEY = "tinyide.appearance.icon-pack.v1";
const DESKTOP_ICON_PACK_STATE_KEY = "appearance-icon-pack";
const DEFAULT_ICON_PACK_ID = "tinyide.default";
const FALLBACK_ICON_ID = "box";

let activeIconMap = new Map<string, WorkbenchIconDefinition>();
const listeners = new Set<() => void>();

export function workbenchIconPacks(platform: TinyIdePlatform): readonly WorkbenchIconPackDefinition[] {
  const providers = platform.capabilities
    .getAll<WorkbenchIconProvider>("workbench.icon")
    .slice()
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0) || left.id.localeCompare(right.id));
  const selected = new Map<string, { pack: WorkbenchIconPackDefinition; priority: number }>();
  for (const provider of providers) {
    const priority = provider.priority ?? 0;
    for (const pack of provider.packs()) {
      const previous = selected.get(pack.id);
      if (!previous || priority > previous.priority) selected.set(pack.id, { pack, priority });
    }
  }
  return [...selected.values()]
    .map(({ pack }) => pack)
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.label.localeCompare(right.label));
}

export function readIconPackPreference(storage: Pick<Storage, "getItem"> = localStorage): string {
  try {
    const value = storage.getItem(ICON_PACK_STORAGE_KEY)?.trim();
    return value || DEFAULT_ICON_PACK_ID;
  } catch {
    return DEFAULT_ICON_PACK_ID;
  }
}

export function writeIconPackPreference(
  packId: string,
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  storage.setItem(ICON_PACK_STORAGE_KEY, packId);
}

export async function readPersistedIconPackPreference(): Promise<string> {
  const desktop = typeof window === "undefined" ? undefined : window.tinyideDesktop;
  if (desktop?.readState) {
    try {
      const value = await desktop.readState(DESKTOP_ICON_PACK_STATE_KEY);
      if (typeof value === "string" && value.trim()) return value;
    } catch (error) {
      console.warn("Não foi possível restaurar o pacote de ícones da aplicação.", error);
    }
  }
  return readIconPackPreference();
}

export async function persistIconPackPreference(packId: string): Promise<void> {
  writeIconPackPreference(packId);
  const desktop = typeof window === "undefined" ? undefined : window.tinyideDesktop;
  if (!desktop?.writeState) return;
  try {
    await desktop.writeState(DESKTOP_ICON_PACK_STATE_KEY, packId);
  } catch (error) {
    console.warn("Não foi possível persistir o pacote de ícones no desktop.", error);
  }
}

export function resolveIconPack(
  packs: readonly WorkbenchIconPackDefinition[],
  preferredPackId: string,
): WorkbenchIconPackDefinition | undefined {
  return packs.find((pack) => pack.id === preferredPackId)
    ?? packs.find((pack) => pack.id === DEFAULT_ICON_PACK_ID)
    ?? packs[0];
}

export function applyWorkbenchIconPack(pack: WorkbenchIconPackDefinition | undefined): void {
  activeIconMap = new Map((pack?.icons ?? []).map((icon) => [icon.id, icon]));
  for (const listener of listeners) listener();
}

export function resolveWorkbenchIcon(iconId: string | undefined): WorkbenchIconDefinition | undefined {
  if (!iconId) return activeIconMap.get(FALLBACK_ICON_ID);
  return activeIconMap.get(iconId) ?? activeIconMap.get(FALLBACK_ICON_ID);
}

export function hasWorkbenchIcon(iconId: string): boolean {
  return activeIconMap.has(iconId);
}

/** Mapeia nome de arquivo → id semântico do pack (plugins podem sobrescrever via ResourceIcon). */
const FILE_ICON_BY_EXTENSION: Readonly<Record<string, string>> = {
  ".py": "python",
  ".pyw": "python",
  ".pyi": "python",
  ".js": "nodejs",
  ".mjs": "nodejs",
  ".cjs": "nodejs",
  ".jsx": "nodejs",
  ".ts": "nodejs",
  ".tsx": "nodejs",
  ".mts": "nodejs",
  ".cts": "nodejs",
  ".json": "package",
  ".jsonc": "package",
  ".lock": "package",
  ".md": "file",
  ".mdx": "file",
  ".markdown": "file",
  ".sql": "database",
  ".sqlite": "database",
  ".db": "database",
  ".yml": "settings",
  ".yaml": "settings",
  ".toml": "settings",
  ".ini": "settings",
  ".env": "settings",
  ".sh": "terminal",
  ".bash": "terminal",
  ".zsh": "terminal",
  ".ps1": "terminal",
  ".dockerfile": "docker",
  ".gitignore": "git",
  ".gitattributes": "git",
  ".gitmodules": "git",
};

const FILE_ICON_BY_BASENAME: Readonly<Record<string, string>> = {
  "dockerfile": "docker",
  "docker-compose.yml": "docker",
  "docker-compose.yaml": "docker",
  "compose.yml": "docker",
  "compose.yaml": "docker",
  "package.json": "nodejs",
  "package-lock.json": "nodejs",
  "pnpm-lock.yaml": "nodejs",
  "yarn.lock": "nodejs",
  "tsconfig.json": "nodejs",
  "jsconfig.json": "nodejs",
  ".gitignore": "git",
  ".gitattributes": "git",
  "makefile": "terminal",
  "cmakelists.txt": "settings",
};

export function fileIconIdFor(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  const lower = base.toLowerCase();
  if (FILE_ICON_BY_BASENAME[lower]) return FILE_ICON_BY_BASENAME[lower]!;
  const dot = lower.lastIndexOf(".");
  if (dot >= 0) {
    const ext = lower.slice(dot);
    if (FILE_ICON_BY_EXTENSION[ext]) return FILE_ICON_BY_EXTENSION[ext]!;
  }
  // multi-dot: file.config.js
  for (const [ext, id] of Object.entries(FILE_ICON_BY_EXTENSION)) {
    if (lower.endsWith(ext)) return id;
  }
  return "file";
}

export function subscribeWorkbenchIcons(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const workbenchIconDefaults = {
  storageKey: ICON_PACK_STORAGE_KEY,
  packId: DEFAULT_ICON_PACK_ID,
  fallbackIconId: FALLBACK_ICON_ID,
} as const;
