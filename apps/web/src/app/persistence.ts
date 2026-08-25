import type { TextDiagnostic } from "@tinyide/plugin-api";
import {
  readApplicationSnapshot,
  readStoredState,
  writeStoredState,
  writeApplicationSnapshot,
} from "../session-store";
import type {
  BrowserDirectoryHandle,
  BrowserFileHandle,
  OpenDocument,
  WorkspaceEntry,
} from "../browser-filesystem";
import {
  isBrowserFileSystemAccessDenied,
  readFileDocument,
  resolveFileHandle,
} from "../browser-filesystem";
import {
  isActivityButtonPlacement,
  type ActivityButtonPlacements,
} from "./activity-layout";
import { projectSessionStateKey, projectWorkspaceStateKey } from "./project-session";
import { isVirtualDocumentId } from "./virtual-documents";

const SESSION_STATE_KEY = (workspaceRoot?: string) => workspaceRoot
  ? projectWorkspaceStateKey("ui-session", workspaceRoot)
  : Promise.resolve(projectSessionStateKey("ui-session"));

export type PersistedSidebarView = string;

export interface PersistedSidebarViewsBySide {
  readonly left?: PersistedSidebarView;
  readonly right?: PersistedSidebarView;
}

export interface LayoutState {
  readonly sidebarVisible: boolean;
  readonly sidebarWidth: number;
  readonly leftVerticalPanelWidth: number;
  readonly rightVerticalPanelWidth: number;
  readonly sidebarView: PersistedSidebarView;
  readonly panelVisible: boolean;
  readonly panelHeight: number;
  readonly panelTab: string;
  readonly problemsVisible: boolean;
  readonly problemsWidth: number;
  readonly toolWindowVisible: boolean;
  readonly toolWindowHeight: number;
  readonly activeToolWindowId?: string;
}

export interface SessionState extends LayoutState {
  readonly workspaceName: string;
  readonly workspaceRoot?: string;
  readonly activeDocumentId?: string;
  readonly expandedDirectories: readonly string[];
  readonly explorerShowHidden: boolean;
  readonly explorerShowIgnored: boolean;
  readonly selectedEnvironmentId?: string;
  readonly activityButtonPlacements: ActivityButtonPlacements;
  readonly sidebarViewsBySide: PersistedSidebarViewsBySide;
}

interface StoredWorkspaceEntry {
  readonly name: string;
  readonly path: string;
  readonly kind: "file" | "directory";
  readonly children?: readonly StoredWorkspaceEntry[];
}

interface StoredDocument {
  readonly id: string;
  readonly name: string;
  readonly path?: string;
  /** Rótulo de origem dos documentos fornecidos por plugin. */
  readonly origin?: string;
  readonly workspaceRoot?: string;
  readonly handle?: BrowserFileHandle;
  readonly kind?: OpenDocument["kind"];
  readonly mediaType?: string;
  readonly size?: number;
  readonly content: string;
  readonly savedContent: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  readonly scrollTop: number;
  readonly scrollLeft: number;
  readonly folds?: readonly StoredDocumentFold[];
}

export interface StoredDocumentFold {
  readonly id: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly hiddenText: string;
}

export interface ApplicationSnapshot {
  readonly version: 2;
  readonly workspaceName: string;
  readonly workspaceRoot?: string;
  readonly workspaceEntries: readonly StoredWorkspaceEntry[];
  readonly documents: readonly StoredDocument[];
  readonly diagnostics: readonly TextDiagnostic[];
  readonly output: readonly string[];
}

export const DEFAULT_LAYOUT: LayoutState = {
  sidebarVisible: true,
  sidebarWidth: 280,
  leftVerticalPanelWidth: 280,
  rightVerticalPanelWidth: 320,
  sidebarView: "explorer",
  panelVisible: false,
  panelHeight: 190,
  panelTab: "output",
  problemsVisible: false,
  problemsWidth: 320,
  toolWindowVisible: false,
  toolWindowHeight: 240,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function readSidebarViewsBySide(value: unknown): PersistedSidebarViewsBySide {
  if (!value || typeof value !== "object") return {};
  const candidate = value as Partial<Record<"left" | "right", unknown>>;
  return {
    ...(typeof candidate.left === "string" && candidate.left.trim()
      ? { left: candidate.left }
      : {}),
    ...(typeof candidate.right === "string" && candidate.right.trim()
      ? { right: candidate.right }
      : {}),
  };
}

function sidebarActivityKey(view: string): string {
  return view === "explorer" || view === "plugins" || view === "environments"
    ? `builtin:${view}`
    : `sidebar:${view}`;
}

function defaultSession(): SessionState {
  return {
    ...DEFAULT_LAYOUT,
    workspaceName: "Sem workspace",
    expandedDirectories: [],
    explorerShowHidden: false,
    explorerShowIgnored: false,
    activityButtonPlacements: {},
    sidebarViewsBySide: { left: DEFAULT_LAYOUT.sidebarView },
  };
}

export function normalizeSession(value: unknown): SessionState {
  try {
    if (!value || typeof value !== "object") return defaultSession();
    const parsed = value as Partial<SessionState>;
    const sidebarView = typeof parsed.sidebarView === "string" && parsed.sidebarView.trim()
      ? parsed.sidebarView
      : "explorer";
    const storedPanelTab = typeof parsed.panelTab === "string" && parsed.panelTab.trim()
      ? parsed.panelTab
      : "output";
    const panelTab = storedPanelTab === "problems" ? "output" : storedPanelTab;
    const activityButtonPlacements = parsed.activityButtonPlacements
      && typeof parsed.activityButtonPlacements === "object"
      ? Object.fromEntries(Object.entries(parsed.activityButtonPlacements)
        .filter((entry): entry is [string, ActivityButtonPlacements[string]] => (
          Boolean(entry[0]) && isActivityButtonPlacement(entry[1])
        )))
      : {};
    const hasStoredSidebarViews = Object.prototype.hasOwnProperty.call(parsed, "sidebarViewsBySide");
    const storedSidebarViews = readSidebarViewsBySide(parsed.sidebarViewsBySide);
    const legacySidebarSide = activityButtonPlacements[sidebarActivityKey(sidebarView)]?.side ?? "left";
    const candidateSidebarViews = hasStoredSidebarViews
      ? storedSidebarViews
      : parsed.sidebarVisible !== false
        ? { [legacySidebarSide]: sidebarView }
        : {};
    // Uma mesma view nunca pode ocupar os dois lados: mantém o lado do botão.
    const sidebarViewsBySide = candidateSidebarViews.left
      && candidateSidebarViews.left === candidateSidebarViews.right
      ? (activityButtonPlacements[sidebarActivityKey(candidateSidebarViews.left)]?.side === "right"
        ? { right: candidateSidebarViews.right }
        : { left: candidateSidebarViews.left })
      : candidateSidebarViews;
    return {
      sidebarVisible: Boolean(sidebarViewsBySide.left || sidebarViewsBySide.right),
      sidebarWidth: clamp(Number(parsed.sidebarWidth) || DEFAULT_LAYOUT.sidebarWidth, 180, 720),
      leftVerticalPanelWidth: clamp(
        Number(parsed.leftVerticalPanelWidth)
          || Number(parsed.sidebarWidth)
          || DEFAULT_LAYOUT.leftVerticalPanelWidth,
        180,
        720,
      ),
      rightVerticalPanelWidth: clamp(
        Number(parsed.rightVerticalPanelWidth)
          || Number(parsed.problemsWidth)
          || DEFAULT_LAYOUT.rightVerticalPanelWidth,
        180,
        720,
      ),
      sidebarView,
      panelVisible: parsed.panelVisible === true
        && panelTab !== "output"
        && !panelTab.startsWith("execution-profile:"),
      panelHeight: clamp(Number(parsed.panelHeight) || DEFAULT_LAYOUT.panelHeight, 96, 640),
      panelTab,
      problemsVisible: parsed.problemsVisible === true
        || (storedPanelTab === "problems" && parsed.panelVisible !== false),
      problemsWidth: clamp(Number(parsed.problemsWidth) || DEFAULT_LAYOUT.problemsWidth, 220, 640),
      toolWindowVisible: parsed.toolWindowVisible === true,
      toolWindowHeight: clamp(Number(parsed.toolWindowHeight) || DEFAULT_LAYOUT.toolWindowHeight, 120, 640),
      ...(typeof parsed.activeToolWindowId === "string" && parsed.activeToolWindowId.trim()
        ? { activeToolWindowId: parsed.activeToolWindowId }
        : {}),
      workspaceName: typeof parsed.workspaceName === "string" ? parsed.workspaceName : "Sem workspace",
      ...(typeof parsed.workspaceRoot === "string" ? { workspaceRoot: parsed.workspaceRoot } : {}),
      ...(typeof parsed.activeDocumentId === "string" ? { activeDocumentId: parsed.activeDocumentId } : {}),
      expandedDirectories: Array.isArray(parsed.expandedDirectories)
        ? parsed.expandedDirectories.filter((value): value is string => typeof value === "string")
        : [],
      explorerShowHidden: parsed.explorerShowHidden === true,
      explorerShowIgnored: parsed.explorerShowIgnored === true,
      ...(typeof parsed.selectedEnvironmentId === "string"
        ? { selectedEnvironmentId: parsed.selectedEnvironmentId }
        : {}),
      activityButtonPlacements,
      sidebarViewsBySide,
    };
  } catch {
    return defaultSession();
  }
}

export function readSession(): SessionState {
  return defaultSession();
}

export async function readPersistedSession(workspaceRoot?: string): Promise<SessionState> {
  try {
    const stored = await readStoredState(await SESSION_STATE_KEY(workspaceRoot));
    if (stored !== undefined) return normalizeSession(stored);
  } catch (error) {
    console.warn("Não foi possível restaurar a sessão visual persistente.", error);
  }
  return defaultSession();
}

export function writeSession(session: SessionState): void {
  void (async () => {
    const workspaceRoot = session.workspaceRoot?.trim();
    if (workspaceRoot) {
      await writeStoredState(await SESSION_STATE_KEY(workspaceRoot), session);
      // A chave da sessão mantém apenas o ponteiro necessário para restaurar o
      // último workspace desta janela. O layout completo nunca é reutilizado
      // como fallback de outro projeto.
      await writeStoredState(await SESSION_STATE_KEY(), {
        ...defaultSession(),
        workspaceName: session.workspaceName,
        workspaceRoot,
      });
      return;
    }
    await writeStoredState(await SESSION_STATE_KEY(), session);
  })().catch((error) => {
    console.warn("Não foi possível persistir a sessão visual.", error);
  });
}

function serializeEntries(entries: readonly WorkspaceEntry[]): readonly StoredWorkspaceEntry[] {
  return entries.map((entry) => ({
    name: entry.name,
    path: entry.path,
    kind: entry.kind,
    ...(entry.children ? { children: serializeEntries(entry.children) } : {}),
  }));
}

export function deserializeEntries(entries: readonly StoredWorkspaceEntry[]): readonly WorkspaceEntry[] {
  return entries.map((entry) => ({
    name: entry.name,
    path: entry.path,
    kind: entry.kind,
    ...(entry.children ? { children: deserializeEntries(entry.children) } : {}),
  }));
}

export async function readReactSnapshot(workspaceRoot?: string): Promise<ApplicationSnapshot | undefined> {
  const snapshot = await readApplicationSnapshot<ApplicationSnapshot>(workspaceRoot);
  return snapshot?.version === 2 ? snapshot : undefined;
}

export function workspaceDocumentsForSnapshot(
  documents: readonly OpenDocument[],
  workspaceRoot: string | undefined,
): readonly OpenDocument[] {
  if (!workspaceRoot) return [];
  return documents.filter((document) => (
    // Documentos de plugin não têm arquivo, mas a aba precisa sobreviver ao reload
    // como acontece com arquivos: quem os desenha é o provider, pelo mediaType.
    isVirtualDocumentId(document.id)
      || (Boolean(document.path) && document.workspaceRoot === workspaceRoot)
  ));
}

/** Reabre a aba de um documento de plugin sem tocar no sistema de arquivos. */
function restoreVirtualDocument(document: StoredDocument): OpenDocument {
  return {
    id: document.id,
    name: document.name,
    kind: "text",
    mediaType: document.mediaType ?? "text/plain",
    readOnly: true,
    ...(document.origin ? { origin: document.origin } : {}),
    size: document.size ?? 0,
    content: document.content ?? "",
    savedContent: document.savedContent ?? "",
    selectionStart: document.selectionStart ?? 0,
    selectionEnd: document.selectionEnd ?? 0,
    scrollTop: document.scrollTop ?? 0,
    scrollLeft: document.scrollLeft ?? 0,
  };
}

export async function restoreWorkspaceDocuments(
  documents: readonly StoredDocument[],
  workspaceRoot: string | undefined,
  workspaceHandle?: BrowserDirectoryHandle,
): Promise<readonly OpenDocument[]> {
  if (!workspaceRoot) return [];
  const restored = await Promise.all(documents.map(async (document): Promise<OpenDocument | undefined> => {
    if (isVirtualDocumentId(document.id)) return restoreVirtualDocument(document);
    if (!document.path) return undefined;
    if (document.workspaceRoot && document.workspaceRoot !== workspaceRoot) return undefined;
    if (!document.workspaceRoot && !workspaceHandle) return undefined;

    if (workspaceHandle) {
      try {
        const handle = await resolveFileHandle(workspaceHandle, document.path);
        const reopened = await readFileDocument(handle, document.path, workspaceRoot);
        return reopened.kind === "text"
          ? {
              ...reopened,
              content: document.content,
              savedContent: document.savedContent,
              selectionStart: document.selectionStart,
              selectionEnd: document.selectionEnd,
              scrollTop: document.scrollTop,
              scrollLeft: document.scrollLeft,
            }
          : reopened;
      } catch (cause) {
        if (isBrowserFileSystemAccessDenied(cause)) throw cause;
        return undefined;
      }
    }

    return {
      id: document.id,
      name: document.name,
      path: document.path,
      workspaceRoot,
      kind: document.kind ?? "text",
      mediaType: document.mediaType ?? "text/plain",
      size: document.size ?? new Blob([document.content]).size,
      content: document.content,
      savedContent: document.savedContent,
      selectionStart: document.selectionStart,
      selectionEnd: document.selectionEnd,
      scrollTop: document.scrollTop,
      scrollLeft: document.scrollLeft,
    };
  }));
  return restored.filter((document): document is OpenDocument => Boolean(document));
}

export async function writeReactSnapshot(input: {
  readonly workspaceName: string;
  readonly workspaceRoot?: string;
  readonly workspaceEntries: readonly WorkspaceEntry[];
  readonly documents: readonly OpenDocument[];
  readonly documentFolds?: ReadonlyMap<string, readonly StoredDocumentFold[]>;
  readonly diagnostics: readonly TextDiagnostic[];
  readonly output: readonly string[];
}): Promise<void> {
  const workspaceDocuments = workspaceDocumentsForSnapshot(input.documents, input.workspaceRoot);
  const base = {
    version: 2 as const,
    workspaceName: input.workspaceName,
    ...(input.workspaceRoot ? { workspaceRoot: input.workspaceRoot } : {}),
    workspaceEntries: serializeEntries(input.workspaceEntries),
    documents: workspaceDocuments.map((document) => ({
      id: document.id,
      name: document.name,
      ...(document.path ? { path: document.path } : {}),
      ...(document.origin ? { origin: document.origin } : {}),
      ...(document.workspaceRoot ? { workspaceRoot: document.workspaceRoot } : {}),
      kind: document.kind,
      mediaType: document.mediaType,
      size: document.size,
      content: document.content,
      savedContent: document.savedContent,
      selectionStart: document.selectionStart,
      selectionEnd: document.selectionEnd,
      scrollTop: document.scrollTop,
      scrollLeft: document.scrollLeft,
      ...((input.documentFolds?.get(document.id)?.length ?? 0) > 0
        ? { folds: input.documentFolds!.get(document.id)! }
        : {}),
    })),
    diagnostics: input.diagnostics,
    output: input.output,
  };

  // FileSystemHandle exige structured clone (IndexedDB). Como a persistência da
  // IDE agora é exclusivamente em arquivos do host, o snapshot deve ser JSON
  // serializável e nunca depender de browser storage.
  await writeApplicationSnapshot(base, input.workspaceRoot);
}
