import type { BrowserDirectoryHandle, WorkspaceEntry } from "../browser-filesystem";
import { readStoredState, removeStoredState, writeStoredState } from "../session-store";

const RECENT_PROJECTS_KEY = "recent-projects";
const PROJECT_OPEN_PREFERENCE_KEY = "project-open-preference";
const MAX_RECENT_PROJECTS = 20;
const PROJECT_MARKERS = new Set([
  ".git",
  ".idea",
  ".tinyide",
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "manage.py",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
]);

export type ProjectOpenTarget = "ask" | "current" | "new";

export interface RecentProject {
  readonly id: string;
  readonly name: string;
  readonly kind: "project" | "directory";
  readonly path?: string;
  readonly lastOpenedAt: number;
}

function normalizeRecentProjects(value: unknown): readonly RecentProject[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): RecentProject[] => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<RecentProject>;
    if (typeof candidate.id !== "string" || !candidate.id.trim()) return [];
    if (typeof candidate.name !== "string" || !candidate.name.trim()) return [];
    if (candidate.kind !== "project" && candidate.kind !== "directory") return [];
    return [{
      id: candidate.id,
      name: candidate.name,
      kind: candidate.kind,
      ...(typeof candidate.path === "string" && candidate.path.trim() ? { path: candidate.path } : {}),
      lastOpenedAt: Number.isFinite(candidate.lastOpenedAt) ? Number(candidate.lastOpenedAt) : 0,
    }];
  }).sort((left, right) => right.lastOpenedAt - left.lastOpenedAt).slice(0, MAX_RECENT_PROJECTS);
}

export function classifyOpenedDirectory(entries: readonly WorkspaceEntry[]): "project" | "directory" {
  return entries.some((entry) => PROJECT_MARKERS.has(entry.name)) ? "project" : "directory";
}

export async function readRecentProjects(): Promise<readonly RecentProject[]> {
  return normalizeRecentProjects(await readStoredState(RECENT_PROJECTS_KEY));
}

export async function rememberRecentProject(input: {
  readonly handle: BrowserDirectoryHandle;
  readonly path?: string;
  readonly kind: RecentProject["kind"];
}): Promise<RecentProject> {
  const recent = await readRecentProjects();
  const existing = input.path
    ? recent.find((item) => item.path === input.path)
    : recent.find((item) => item.name === input.handle.name && !item.path);
  const id = existing?.id ?? crypto.randomUUID();
  const project: RecentProject = {
    id,
    name: input.handle.name,
    kind: input.kind,
    ...(input.path ? { path: input.path } : {}),
    lastOpenedAt: Date.now(),
  };
  await writeStoredState(`recent-project-handle.${id}`, input.handle);
  await writeStoredState(RECENT_PROJECTS_KEY, [project, ...recent.filter((item) => item.id !== id)].slice(0, MAX_RECENT_PROJECTS));
  return project;
}

export async function recentProjectHandle(project: RecentProject): Promise<BrowserDirectoryHandle | undefined> {
  return readStoredState<BrowserDirectoryHandle>(`recent-project-handle.${project.id}`);
}

export async function removeRecentProject(id: string): Promise<void> {
  const recent = await readRecentProjects();
  await writeStoredState(RECENT_PROJECTS_KEY, recent.filter((item) => item.id !== id));
  await removeStoredState(`recent-project-handle.${id}`);
}

export async function readProjectOpenPreference(): Promise<ProjectOpenTarget> {
  const value = await readStoredState(PROJECT_OPEN_PREFERENCE_KEY);
  return value === "current" || value === "new" ? value : "ask";
}

export async function writeProjectOpenPreference(value: ProjectOpenTarget): Promise<void> {
  await writeStoredState(PROJECT_OPEN_PREFERENCE_KEY, value);
}

export const projectHistoryInternals = {
  normalizeRecentProjects,
};
