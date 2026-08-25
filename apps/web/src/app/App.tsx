import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Tabs from "@radix-ui/react-tabs";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  ArrowLeft,
  Bug,
  ArrowRight,
  ArrowUpCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  Code2,
  Eye,
  EyeOff,
  File,
  FileWarning,
  FilePlus2,
  Files,
  Folder,
  FolderOpen,
  FolderRoot,
  Hash,
  History,
  Image as ImageIcon,
  LocateFixed,
  MoreVertical,
  Package,
  PackageCheck,
  Palette,
  Pause,
  Play,
  Plug,
  Plus,
  RotateCw,
  RefreshCw,
  Redo2,
  Save,
  Search,
  Settings2,
  Square,
  StepForward,
  CornerDownRight,
  CornerUpRight,
  Terminal,
  Trash2,
  Type,
  Undo2,
  UserRound,
  WrapText,
  Eraser,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { formatCommandLineArguments, parseCommandLineArguments } from "@tinyide/core";
import { WorkbenchDialogHost } from "./workbench-dialog-host";
import { ProjectOpenDialog } from "./ProjectOpenDialog";
import {
  ExecutionViewHost,
  readOpenDocumentBlob,
  ResourceEditorHost,
  WorkbenchPanelHost,
  WorkbenchSidebarHost,
  WorkbenchStatusbarHost,
  WorkbenchToolWindowHost,
  type WorkbenchToolWindowViewRequest,
} from "./workbench-plugin-hosts";
import { scrollOutputToEnd } from "./output-follow";
import {
  ExternalFileNotice,
  WorkspaceExternalSyncIndicator,
  type ExternalFileNoticeState,
  type WorkspaceExternalSyncState,
} from "./editor/ExternalFileNotice";
import {
  TEXT_EDITOR_DOCUMENT_CHANGED_EVENT,
  TEXT_EDITOR_DOCUMENT_SAVED_EVENT,
  TEXT_EDITOR_FORMAT_DOCUMENT_COMMAND,
  WORKSPACE_RESOURCES_CHANGED_EVENT,
} from "@tinyide/plugin-api";
import type {
  DebugAdapterCommand,
  DebugAdapterProvider,
  DebugBreakpoint,
  DebugSessionSnapshot,
  DebugVariable,
  ExecutionEnvironment,
  ExecutionEnvironmentDirectoryListing,
  ExecutionEnvironmentPackageInventory,
  ExecutionProfile,
  ExecutionProfileExecutableOption,
  ExecutionProfilePresetContribution,
  ExecutionProfileTargetKindOption,
  LanguageProvider,
  PluginSettingValue,
  PluginSettingValues,
  PluginSettingsProvider,
  ResourceContext,
  ResourceDecoration,
  ResourceContextMenuItem,
  ResourceContextMenuProvider,
  TextEditorContextMenuContext,
  TextEditorContextMenuProvider,
  TextEditorDocumentChangedEvent,
  TextEditorDocumentSnapshot,
  TextEditorDocumentSavedEvent,
  TextEditorFoldingRange,
  TextEditorCompletionProvider,
  TextEditorLineDecoration,
  TextEditorNavigationProvider,
  TextDiagnostic,
  WorkbenchDialogContribution,
  WorkbenchEditorToolbarItem,
  WorkbenchEditorToolbarProvider,
  WorkbenchExecutionProfileUpdateOptions,
  WorkbenchExecutionSnapshot,
  WorkbenchActivityIcon,
  WorkbenchPanelContribution,
  WorkbenchPanelHookContribution,
  WorkbenchTabApi,
  WorkbenchPanelHook,
  WorkbenchResourceEditorProvider,
  WorkbenchExecutionViewToolbarAction,
  WorkbenchExecutionViewTarget,
  WorkbenchSidebarContribution,
  WorkbenchSidebarHook,
  WorkbenchStateApi,
  WorkbenchStateSnapshot,
  WorkbenchExplorerFilterProvider,
  WorkbenchExplorerIgnoreProvider,
  WorkbenchConfirmRequest,
  WorkbenchVirtualDocumentRequest,
  WorkbenchWorkspaceResourceOpenRequest,
  WorkbenchToolWindowContribution,
  WorkbenchToolWindowHookContribution,
  WorkbenchToolWindowHook,
  WorkspaceFileCreationOption,
  WorkspaceFileCreationProvider,
  WorkspaceResourcesChangedEvent,
} from "@tinyide/plugin-api";
import {
  browserFileSystemAccessError,
  copyWorkspaceEntries,
  isBrowserFileSystemAccessDenied,
  listDirectory,
  moveWorkspaceEntry,
  readFileDocument,
  renameWorkspaceEntry,
  resolveDirectoryHandle,
  resolveFileHandle,
  removeWorkspaceEntry,
  writeFileDocument,
  type BrowserDirectoryHandle,
  type BrowserFileHandle,
  type OpenDocument,
  type WorkspaceEntry,
} from "../browser-filesystem";

type ExplorerClipboardEntry = Pick<WorkspaceEntry, "path" | "name" | "kind">;

function explorerPasteLabel(entries: readonly ExplorerClipboardEntry[]): string {
  if (entries.length === 1) {
    return `Colar ${entries[0]?.kind === "directory" ? "pasta" : "arquivo"}`;
  }
  return `Colar ${entries.length} itens`;
}

export function editorToolbarDocumentSnapshot(document: OpenDocument): TextEditorDocumentSnapshot {
  return {
    id: document.id,
    name: document.name,
    ...(document.path ? { path: document.path } : {}),
    ...(document.workspaceRoot ? { workspaceRoot: document.workspaceRoot } : {}),
    mediaType: document.mediaType,
    content: document.content,
    isDirty: document.content !== document.savedContent,
  };
}

import {
  collapseDeepestExplorerLevel,
  expandNextExplorerLevel,
  explorerAncestorDirectoryPaths,
  explorerDropTargetDirectory,
  explorerDirectoryEmptyState,
  explorerCreationInsertionIndex,
  hiddenExplorerEntryCount,
  explorerTargetDirectoryPath,
  explorerFilterView,
  findWorkspaceEntry,
  flattenVisibleEntries,
  joinWorkspacePath,
  nearestRemainingItemId,
  parentEntryPath,
  remapOpenDocumentResource,
  replaceWorkspacePathPrefix,
  workspaceAbsolutePath,
  workspacePathBelongsToResource,
  workspacePathName,
  workspacePathParent,
  workspacePathContainsHiddenSegment,
  topLevelWorkspacePaths,
} from "./explorer";
import {
  ensureFileCreationExtension,
  fileCreationOptions,
  nextUntitledFileName,
  TEXT_FILE_CREATION_OPTION,
} from "./file-creation";
import {
  beginExplorerRedo,
  beginExplorerUndo,
  createExplorerHistoryState,
  explorerRedoLabel,
  explorerUndoLabel,
  recordExplorerHistory,
  type ExplorerHistoryState,
} from "./explorer-history";
import {
  assertWorkspaceResourcePath,
  reconcileOpenDocumentsAfterWorkspaceChange,
} from "./workspace-resource-reconciliation";
import { platform } from "./platform";
import {
  moveActivityButton,
  orderedActivityButtons,
  type ActivityBarSide,
  type ActivityButtonDescriptor,
} from "./activity-layout";
import {
  DEFAULT_LAYOUT,
  deserializeEntries,
  readPersistedSession,
  readReactSnapshot,
  readSession,
  restoreWorkspaceDocuments,
  writeReactSnapshot,
  writeSession,
  type PersistedSidebarView,
} from "./persistence";
import { resolveSyntaxHighlighter, type SyntaxHighlighter } from "./generic-syntax";
import { resolveEnvironmentSelections, selectedEnvironmentForProvider } from "./environment-selection";
import {
  debugAdapterProviders,
  debugAdapterForProfile,
  environmentProviderById,
  environmentProviders,
  hostProcessOutputLines,
  languageProviderFor,
  lintDocument,
  loadEnvironments,
  loadProfileContributions,
  listHostProcesses,
  readHostContext,
  readHostProcess,
  readHostProcessOutput,
  updateHostProcessData,
  runExecutionProfile,
  sendDebugCommand,
  startDebugProfile,
  runScript,
  clearHostWorkspace,
  pluginSettingsProviders,
  resourceIconFor,
  resourceDecorationProviders,
  resourceEditorProviderFor,
  executionViewProviderFor,
  scriptExecutionFor,
  setHostWorkspace,
  stopHostProcess,
  textEditorLineDecorationProviders,
  workbenchResourceDescriptor,
} from "./runtime";
import { restoreActiveDebugSession, workspaceRelativeDebugPath } from "./debug-session-state";
import {
  DEFAULT_DEBUG_PANEL_LAYOUT,
  EMPTY_DEBUG_OUTPUT_OFFSETS,
  clampDebugInspectorWidth,
  debugOutputOffsetsFor,
  debugOutputSegments,
  filterDebugVariables,
  normalizeDebugPanelLayout,
  type DebugOutputOffsets,
} from "./debug-panel";
import {
  configureDesktopWorkspaceWatcher,
  copyWorkspaceResourcesToSystem,
  desktopWatcherDefaultIgnoredDirectories,
  openInSystemFileManager,
  openDesktopProjectWindow,
  isDesktopHost,
  pasteSystemResourcesIntoWorkspace,
  pickWorkspaceDirectory,
  restoreDesktopWorkspaceHandle,
  restoreLastDesktopWorkspaceHandle,
  runtimeWorkspaceHandle,
  supportsSystemResourceClipboard,
  workspaceRootHintForHandle,
} from "./workspace-host";
import {
  classifyOpenedDirectory,
  readProjectOpenPreference,
  readRecentProjects,
  rememberRecentProject,
  removeRecentProject,
  writeProjectOpenPreference,
  type ProjectOpenTarget,
  type RecentProject,
} from "./project-history";
import {
  createProjectSessionId,
  projectWindowUrl,
  requestedProjectReference,
} from "./project-session";
import {
  resolvePluginBooleanSettingValue,
  resolvePluginSettingValues,
  resolvePluginStringArraySettingValue,
  updatePluginSettingValue,
} from "./plugin-settings";
import {
  EDITOR_CONTENT_PADDING,
  EDITOR_DEFAULT_LINE_HEIGHT,
  editorDocumentMetrics,
  editorVisibleLineRange,
  resolveEditorSettings,
} from "./editor-settings";
import {
  closeSidebarForSide,
  maximumSidebarWidth,
  moveOpenSidebar,
  openSidebarViewForSide,
  reconcileToolWindowLayout,
  retainMountedToolWindows,
  sidebarActivityKey,
  sidebarViewFromActivityKey,
  sidebarWidthForView,
  toggleSidebarViewForSide,
  updateVerticalPanelWidth,
  type SidebarViewsBySide,
  type VerticalPanelWidths,
} from "./workbench-layout";
import {
  nextPanelTabAfterClosingProfile,
  openProfileExecutionTab,
  profileExecutionPanelTab,
  profileExecutionPanelTabId,
  profileExecutionOutput,
  profileExecutionStatusLabel,
  restoreProfileExecutions,
  restoredProfileExecutionTabIds,
  resumedProfileProcessOutput,
  type ProfileExecutionState,
  type ResumedProfileProcess,
} from "./profile-execution-state";
import {
  EMPTY_WORKSPACE_SETTINGS,
  readWorkspaceSettings,
  writeWorkspaceSettings,
  type WorkspaceExecutionProfiles,
  type WorkspaceSettings,
} from "./workspace-settings";
import {
  createEditorHistory,
  recordEditorHistory,
  redoEditorHistory,
  undoEditorHistory,
  type EditorHistory,
} from "./editor-history";
import { applyEditorTab } from "./editor-indentation";
import {
  applyCompletionItem,
  buildCompletionSession,
  refineCompletionSession,
  shouldAutoRequestCompletion,
  type CompletionSession,
} from "./editor/completion-session";
import { EntryTree } from "./explorer/ExplorerTree";
import { DebugVariableNode } from "./debug/DebugVariableNode";
import { DiagnosticLayer, EditorLineDiffPeek, HighlightedSource } from "./editor/editor-components";
import {
  collapseFolds,
  foldedDiagnostics,
  normalizeFoldRanges,
  remapDocumentFoldsAfterEdit,
  type DocumentFold,
  type FoldProjection,
  type FoldRange,
} from "./editor/folding";
import {
  editorMirrorCaretRectAtTextOffset,
  editorMirrorRectsAtTextRange,
  editorMirrorTextOffsetAtClientPoint,
  editorProjectedOffsetFromSourceOffset,
  editorProjectedTextOffsetAtClientPoint,
  editorSourceOffsetFromProjectedOffset,
  moveCollapsedEditorSelectionToPointer,
} from "./editor/pointer-mapping";
import { EditorLineRuler } from "./editor/EditorLineRuler";
import { hydrateExpandedEntries, hydrateExplorerPath } from "./explorer/hydration";
import { defaultLintSettings } from "./workspace/legacy-state";
import { WindowedHighlightedSource } from "./editor/WindowedHighlightedSource";
import {
  createEditorViewportStore,
} from "./editor/editor-viewport";
import { NativeImageEditor, UnsupportedBinaryEditor } from "./editor/resource-editors";
import { resolveTextEditorNavigation } from "./editor/navigation";
import {
  createEditorLocationHistory,
  navigateEditorLocationBack,
  navigateEditorLocationForward,
  recordEditorLocation,
  type EditorLocation,
  type EditorLocationHistory,
} from "./editor/location-history";
import { findTextMatches, replaceTextMatch, replaceTextMatches } from "./editor/text-search";
import { textOffsetAtPosition, textPositionAtOffset } from "./editor/text-position";
import { foldSearchMatchVisible, foldSearchVisibleLine, foldsRevealingFileLine } from "./editor/fold-search";
import { editorContextMenuTargetRange, editorWordRangeAtOffset } from "./editor/context-target";
import { ProfileDialog } from "./execution/ProfileDialog";
import { EnvironmentManagerSidebar } from "./execution/EnvironmentManagerSidebar";
import { EnvironmentBrowserDialog } from "./execution/EnvironmentBrowserDialog";
import { FollowedExecutionOutput } from "./execution/FollowedExecutionOutput";
import { appendExecutionOutput } from "./execution/execution-output-buffer";
import {
  TEXT_CONTEXT_MENU_EVENT,
  type TextContextMenuDetail,
} from "./text-context-menu";
import { ButtonTooltip, WorkbenchActivityIconView, WorkbenchIcon } from "./workbench/activity-components";
import { WorkbenchActivityBar } from "./workbench/WorkbenchActivityBar";
import { PluginManagerSidebar } from "./workbench/PluginManagerSidebar";
import { ProblemsPanel } from "./workbench/ProblemsPanel";
import { ConfirmationDialog } from "./workbench/ConfirmationDialog";
import { ResourceContextMenu } from "./workbench/ResourceContextMenu";
import { WorkbenchTitlebar } from "./workbench/WorkbenchTitlebar";
import { CompletionPopup } from "./editor/CompletionPopup";
import { useWorkbenchContributions } from "./workbench/useWorkbenchContributions";
import {
  applyWorkbenchTheme,
  resolveTheme,
  workbenchThemeDefaults,
  workbenchThemes,
} from "./workbench/theme-manager";
import {
  applyWorkbenchFonts,
  clampEditorFontSize,
  defaultFontPreferences,
  resolveFont,
  workbenchFontDefaults,
  workbenchFonts,
  workbenchFontsForTarget,
  type WorkbenchFontPreferences,
} from "./workbench/font-manager";
import {
  applyWorkbenchIconPack,
  resolveIconPack,
  workbenchIconDefaults,
  workbenchIconPacks,
} from "./workbench/icon-manager";
import {
  EMPTY_USER_SETTINGS,
  readUserSettings,
  writeUserSettings,
  type UserSettings,
} from "./user-settings";
import { nextDebugSession } from "./debug-session-updates";
import {
  applyVirtualDocumentChanges,
  createVirtualDocument,
  upsertDocument,
  virtualDocumentId,
} from "./virtual-documents";

import {
  collectExternalFileCandidates,
  dataTransferHasExternalFiles,
  openDocumentFromExternalFile,
} from "./external-file-open";

interface FoldPreviewState {
  readonly line: number;
  readonly text: string;
  readonly lineCount: number;
}

interface EditorLayoutMetrics {
  readonly lineHeight: number;
  readonly contentPadding: number;
}

interface ActiveFoldRangeState {
  readonly documentId: string;
  readonly providerId: string;
  readonly source: string;
  readonly ranges: readonly FoldRange[];
}

interface DebugCommandPendingState {
  readonly sessionId: string;
  readonly command: DebugAdapterCommand;
}

const FOLD_PREVIEW_MAX_HEIGHT = 520;
const FOLD_PREVIEW_MIN_HEIGHT = 140;
const FOLD_PREVIEW_MARGIN = 12;
// Medidas do popup em features.css: cabeçalho (padding 7px×2 + fonte 11px/1.2 + borda),
// <pre> com padding 10px×2 e fonte 12px/1.45, rodapé opcional e bordas externas.
const FOLD_PREVIEW_TITLE_HEIGHT = 28;
const FOLD_PREVIEW_CHROME_HEIGHT = FOLD_PREVIEW_TITLE_HEIGHT + 20 + 2;
const FOLD_PREVIEW_TEXT_LINE_HEIGHT = 17.4;
const FOLD_PREVIEW_FOOTER_HEIGHT = 24;

type SidebarView = PersistedSidebarView;

type StoredProfiles = WorkspaceExecutionProfiles;

type ContextMenuTarget =
  | { readonly kind: "root" }
  | { readonly kind: "entry"; readonly entry: WorkspaceEntry }
  | { readonly kind: "document"; readonly document: OpenDocument }
  | { readonly kind: "editor"; readonly context: TextEditorContextMenuContext }
  | { readonly kind: "text"; readonly text: string };

interface ContextMenuState {
  readonly target: ContextMenuTarget;
  readonly x: number;
  readonly y: number;
  readonly items: readonly ResourceContextMenuItem[];
}

const EXPLORER_FILTER_DEBOUNCE_MS = 40;
const MAX_SYNTAX_HIGHLIGHT_SOURCE_LENGTH = 500_000;
const SYNTAX_WINDOW_MIN_SOURCE_LENGTH = 100_000;
const EDITOR_FOLD_CONTROL_OVERSCAN_LINES = 60;
/**
 * Régua e janela de sintaxe assinam o viewport diretamente (editor-viewport.ts) e acompanham a
 * rolagem no próprio evento. O estado React do App (fold preview, virtualização dos toggles de
 * fold) só assenta depois que a rolagem para, para não enfileirar renders do App durante arrastes.
 */
const EDITOR_VIEWPORT_TRAILING_DELAY_MS = 120;
/**
 * Gravar rolagem/seleção no estado dos documentos é para restauração; debounced para não
 * re-renderizar durante o gesto. Maior que o trailing do viewport de propósito: na rolagem, quem
 * descarrega a captura é o próprio trailing (um render só); este timer cobre só seleção/teclado.
 */
const EDITOR_STATE_CAPTURE_DELAY_MS = 200;
const EDITOR_NAVIGATION_LOADING_DELAY_MS = 150;
const EDITOR_NAVIGATION_LOADING_MINIMUM_MS = 350;
const EDITOR_BUSY_MINIMUM_MS = 300;

interface ExplorerFilterResultState {
  readonly query: string;
  readonly visiblePaths: ReadonlySet<string>;
  readonly expandedPaths: ReadonlySet<string>;
  readonly matchCount: number;
  readonly truncated: boolean;
  readonly error?: string;
}

function encodedNewFileCommand(option?: Pick<WorkspaceFileCreationOption, "extension" | "suggestedName">): string {
  if (!option) return "core.resource.newFile";
  return `core.resource.newFile:${encodeURIComponent(JSON.stringify(option))}`;
}

function decodedNewFileOption(command: string | undefined): Pick<WorkspaceFileCreationOption, "extension" | "suggestedName"> | undefined {
  const prefix = "core.resource.newFile:";
  if (!command?.startsWith(prefix)) return undefined;
  try {
    const value = JSON.parse(decodeURIComponent(command.slice(prefix.length))) as Partial<WorkspaceFileCreationOption>;
    if (typeof value.extension !== "string" || !value.extension.startsWith(".")) return undefined;
    return {
      extension: value.extension as `.${string}`,
      ...(typeof value.suggestedName === "string" ? { suggestedName: value.suggestedName } : {}),
    };
  } catch {
    return undefined;
  }
}

function newFileContextMenuItems(options: readonly WorkspaceFileCreationOption[]): ResourceContextMenuItem[] {
  if (!options.length) {
    return [{
      id: "core.newFile",
      label: "Novo arquivo",
      command: encodedNewFileCommand(TEXT_FILE_CREATION_OPTION),
      group: "creation",
      order: 0,
      icon: "file",
    }];
  }
  return fileCreationOptions(options).map((option, index) => ({
    id: `core.newFile.${option.id}`,
    label: `${option.label} (${option.extension})`,
    command: encodedNewFileCommand(option),
    group: "creation",
    order: index,
    icon: "file",
  }));
}

interface ActiveWorkbenchDialog {
  readonly token: symbol;
  readonly contribution: WorkbenchDialogContribution;
  readonly size?: WorkbenchDialogContribution["size"];
}

export function App() {
  const initialSession = useMemo(() => readSession(), []);
  const [platformSnapshot, setPlatformSnapshot] = useState(() => platform.snapshot());
  const [sidebarView, setSidebarView] = useState<SidebarView>(initialSession.sidebarView);
  const [sidebarVisible, setSidebarVisible] = useState(initialSession.sidebarVisible);
  const [sidebarViewsBySide, setSidebarViewsBySide] = useState<SidebarViewsBySide>(
    initialSession.sidebarViewsBySide,
  );
  const [verticalPanelWidths, setVerticalPanelWidths] = useState<VerticalPanelWidths>({
    left: initialSession.leftVerticalPanelWidth,
    right: initialSession.rightVerticalPanelWidth,
  });
  const [panelVisible, setPanelVisible] = useState(initialSession.panelVisible);
  const [panelHeight, setPanelHeight] = useState(initialSession.panelHeight);
  const [panelTab, setPanelTab] = useState(initialSession.panelTab);
  const [problemsVisible, setProblemsVisible] = useState(initialSession.problemsVisible);
  const [toolWindowVisible, setToolWindowVisible] = useState(initialSession.toolWindowVisible);
  const [toolWindowHeight, setToolWindowHeight] = useState(initialSession.toolWindowHeight);
  const [activeToolWindowId, setActiveToolWindowId] = useState<string | undefined>(initialSession.activeToolWindowId);
  const [activityButtonPlacements, setActivityButtonPlacements] = useState(initialSession.activityButtonPlacements);
  const [draggingActivityButtonKey, setDraggingActivityButtonKey] = useState<string>();
  const [toolWindowViewRequest, setToolWindowViewRequest] = useState<WorkbenchToolWindowViewRequest>();
  const [mountedToolWindowIds, setMountedToolWindowIds] = useState<ReadonlySet<string>>(new Set());
  const toolWindowViewRequestSequenceRef = useRef(0);
  // A região inferior mostra apenas um painel horizontal por vez: abrir a saída de
  // execução/debug oculta a tool window ativa (e vice-versa).
  const revealExecutionPanel = useCallback((tabId?: string) => {
    setToolWindowVisible(false);
    if (tabId) setPanelTab(tabId);
    setPanelVisible(true);
  }, []);
  const [workspaceHandle, setWorkspaceHandle] = useState<BrowserDirectoryHandle>();
  const [workspaceName, setWorkspaceName] = useState(initialSession.workspaceName);
  const [workspaceRoot, setWorkspaceRoot] = useState<string | undefined>(initialSession.workspaceRoot);
  const [entries, setEntries] = useState<readonly WorkspaceEntry[]>([]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set(initialSession.expandedDirectories));
  const [explorerShowHidden, setExplorerShowHidden] = useState(initialSession.explorerShowHidden);
  const [explorerShowIgnored, setExplorerShowIgnored] = useState(initialSession.explorerShowIgnored);
  const [explorerRevealedHiddenPaths, setExplorerRevealedHiddenPaths] = useState<ReadonlySet<string>>(new Set());
  const [explorerIgnoredPaths, setExplorerIgnoredPaths] = useState<ReadonlySet<string>>(new Set());
  const [explorerIgnoreRevision, setExplorerIgnoreRevision] = useState(0);
  const [documents, setDocuments] = useState<readonly OpenDocument[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | undefined>(initialSession.activeDocumentId);
  const [editorBusyOperation, setEditorBusyOperation] = useState<{
    readonly token: symbol;
    readonly documentId: string;
    readonly label: string;
    readonly startedAt: number;
  }>();
  const [draggingDocumentId, setDraggingDocumentId] = useState<string>();
  const [dropTargetDocumentId, setDropTargetDocumentId] = useState<string>();
  const [output, setOutput] = useState<string[]>(["tinyIde React shell inicializado."]);
  const [diagnostics, setDiagnostics] = useState<readonly TextDiagnostic[]>([]);
  const [hoveredDiagnosticLine, setHoveredDiagnosticLine] = useState<number>();
  const [environments, setEnvironments] = useState<readonly ExecutionEnvironment[]>([]);
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<string | undefined>();
  const [environmentBusy, setEnvironmentBusy] = useState(false);
  const [environmentForm, setEnvironmentForm] = useState<"addExecutable" | "importEnvironment" | "createEnvironment" | "dependencies" | "edit">();
  const [editingEnvironmentId, setEditingEnvironmentId] = useState<string>();
  const [environmentPath, setEnvironmentPath] = useState("");
  const [environmentSearch, setEnvironmentSearch] = useState("");
  const [environmentManagerProviderId, setEnvironmentManagerProviderId] = useState<string>();
  const [packageManagerEnvironmentId, setPackageManagerEnvironmentId] = useState<string>();
  const [environmentBrowserMode, setEnvironmentBrowserMode] = useState<"directory" | "file">();
  const [environmentListing, setEnvironmentListing] = useState<ExecutionEnvironmentDirectoryListing>();
  const [environmentBrowserFilter, setEnvironmentBrowserFilter] = useState("");
  const [environmentBrowserHidden, setEnvironmentBrowserHidden] = useState(false);
  const [environmentBrowserSelection, setEnvironmentBrowserSelection] = useState<string>();
  const [environmentBrowserExecutableOnly, setEnvironmentBrowserExecutableOnly] = useState(false);
  const [executableOptions, setExecutableOptions] = useState<readonly ExecutionProfileExecutableOption[]>([]);
  const [profilePresets, setProfilePresets] = useState<readonly ExecutionProfilePresetContribution[]>([]);
  const [profileTargetKinds, setProfileTargetKinds] = useState<readonly ExecutionProfileTargetKindOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [pageReloading, setPageReloading] = useState(false);
  const [activeProcessId, setActiveProcessId] = useState<string>();
  const [resumedProcessId, setResumedProcessId] = useState<string>();
  const [profileExecutions, setProfileExecutions] = useState<Readonly<Record<string, ProfileExecutionState>>>({});
  const [profileOutputFollowing, setProfileOutputFollowing] = useState<Readonly<Record<string, boolean>>>({});
  const [openProfileTabIds, setOpenProfileTabIds] = useState<readonly string[]>([]);
  const [closingProfileTabIds, setClosingProfileTabIds] = useState<ReadonlySet<string>>(new Set());
  const [resumedProfileProcesses, setResumedProfileProcesses] = useState<readonly ResumedProfileProcess[]>([]);
  const [profilesState, setProfilesState] = useState<StoredProfiles>({ profiles: [] });
  const [debugBreakpoints, setDebugBreakpoints] = useState<readonly DebugBreakpoint[]>([]);
  const [debugSession, setDebugSession] = useState<DebugSessionSnapshot>();
  const [debugAdapter, setDebugAdapter] = useState<DebugAdapterProvider>();
  const [debugCommandPending, setDebugCommandPending] = useState<DebugCommandPendingState>();
  const [debugRestartingProfileId, setDebugRestartingProfileId] = useState<string>();
  const [restartingProfileId, setRestartingProfileId] = useState<string>();
  const [debugInspectorWidth, setDebugInspectorWidth] = useState<number>(DEFAULT_DEBUG_PANEL_LAYOUT.inspectorWidth);
  const [debugOutputWrap, setDebugOutputWrap] = useState<boolean>(DEFAULT_DEBUG_PANEL_LAYOUT.outputWrap);
  const [debugOutputFollowTail, setDebugOutputFollowTail] = useState<boolean>(DEFAULT_DEBUG_PANEL_LAYOUT.outputFollowTail);
  const [debugVariableQuery, setDebugVariableQuery] = useState("");
  const [debugOutputOffsets, setDebugOutputOffsets] = useState<Readonly<Record<string, DebugOutputOffsets>>>({});
  const [userSettings, setUserSettings] = useState<UserSettings>(EMPTY_USER_SETTINGS);
  const [workspaceSettings, setWorkspaceSettings] = useState<WorkspaceSettings>(EMPTY_WORKSPACE_SETTINGS);
  const [profilesOpen, setProfilesOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [lintSettingsOpen, setLintSettingsOpen] = useState(false);
  const [lintEnabledRuleIds, setLintEnabledRuleIds] = useState<readonly string[]>([]);
  const [pluginRemovalId, setPluginRemovalId] = useState<string>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSectionId, setSettingsSectionId] = useState("editor");
  const [preferredThemeId, setPreferredThemeId] = useState<string>(workbenchThemeDefaults.themeId);
  const [preferredIconPackId, setPreferredIconPackId] = useState<string>(workbenchIconDefaults.packId);
  const [fontPreferences, setFontPreferences] = useState<WorkbenchFontPreferences>(() => defaultFontPreferences());
  const [pluginSettingsDraft, setPluginSettingsDraft] = useState<PluginSettingValues>({});
  const [pluginStringArrayDrafts, setPluginStringArrayDrafts] = useState<Record<string, string>>({});
  const [watcherIgnoredDraft, setWatcherIgnoredDraft] = useState("");
  const [watcherDraftDirectories, setWatcherDraftDirectories] = useState<readonly string[]>([]);
  const [workbenchDialog, setWorkbenchDialog] = useState<ActiveWorkbenchDialog>();
  const [projectOpenDialog, setProjectOpenDialog] = useState(false);
  const [recentProjects, setRecentProjects] = useState<readonly RecentProject[]>([]);
  const [projectOpenTarget, setProjectOpenTarget] = useState<Exclude<ProjectOpenTarget, "ask">>("current");
  const [rememberProjectOpenTarget, setRememberProjectOpenTarget] = useState(false);
  const [projectOpenBusy, setProjectOpenBusy] = useState(false);
  const [editorLineDecorations, setEditorLineDecorations] = useState<readonly TextEditorLineDecoration[]>([]);
  const [selectedEditorLineDecoration, setSelectedEditorLineDecoration] = useState<TextEditorLineDecoration>();
  const [hoveredEditorChangeKey, setHoveredEditorChangeKey] = useState<string>();
  const editorDiffPeekHoverTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancelEditorDiffPeekHoverTimer = () => {
    if (editorDiffPeekHoverTimerRef.current === undefined) return;
    clearTimeout(editorDiffPeekHoverTimerRef.current);
    editorDiffPeekHoverTimerRef.current = undefined;
  };
  const openEditorDiffPeekOnHover = (decoration: TextEditorLineDecoration) => {
    cancelEditorDiffPeekHoverTimer();
    editorDiffPeekHoverTimerRef.current = setTimeout(() => setSelectedEditorLineDecoration(decoration), 140);
  };
  const scheduleEditorDiffPeekClose = () => {
    cancelEditorDiffPeekHoverTimer();
    editorDiffPeekHoverTimerRef.current = setTimeout(() => setSelectedEditorLineDecoration(undefined), 260);
  };
  const [editorDecorationRevision, setEditorDecorationRevision] = useState(0);
  const [resourceDecorations, setResourceDecorations] = useState<ReadonlyMap<string, ResourceDecoration>>(new Map());
  const [resourceDecorationRevision, setResourceDecorationRevision] = useState(0);
  const [restorationComplete, setRestorationComplete] = useState(false);
  const [error, setError] = useState<string>();
  const [externalDocumentNotices, setExternalDocumentNotices] = useState<ReadonlyMap<string, ExternalFileNoticeState>>(new Map());
  const [workspaceExternalSync, setWorkspaceExternalSync] = useState<WorkspaceExternalSyncState>();
  const [workspaceAccess, setWorkspaceAccess] = useState<"ready" | "permission-required" | "missing">("ready");
  const [explorerCreation, setExplorerCreation] = useState<"file" | "directory">();
  const [explorerCreationParentPath, setExplorerCreationParentPath] = useState("");
  const [explorerCreationName, setExplorerCreationName] = useState("");
  const [explorerCreationExtension, setExplorerCreationExtension] = useState<`.${string}`>();
  const [explorerCreationError, setExplorerCreationError] = useState<string>();
  const [workspaceFileCreationOptions, setWorkspaceFileCreationOptions] = useState<readonly WorkspaceFileCreationOption[]>([]);
  const [explorerRenamePath, setExplorerRenamePath] = useState<string>();
  const [explorerRenameName, setExplorerRenameName] = useState("");
  const [explorerRenameError, setExplorerRenameError] = useState<string>();
  const [explorerPendingDeletion, setExplorerPendingDeletion] = useState<readonly WorkspaceEntry[]>();
  const [explorerClipboard, setExplorerClipboard] = useState<readonly ExplorerClipboardEntry[] | undefined>(undefined);
  const [highlightedExplorerPath, setHighlightedExplorerPath] = useState<string>();
  const [selectedExplorerPath, setSelectedExplorerPath] = useState<string>();
  const [selectedExplorerPaths, setSelectedExplorerPaths] = useState<ReadonlySet<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState>();
  useEffect(() => {
    if (!contextMenu) return undefined;
    const closeContextMenuOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".resource-context-menu")) return;
      setContextMenu(undefined);
    };
    document.addEventListener("pointerdown", closeContextMenuOnOutsidePointer, true);
    return () => document.removeEventListener("pointerdown", closeContextMenuOnOutsidePointer, true);
  }, [contextMenu]);
  useEffect(() => {
    const openTextContextMenu = (event: Event) => {
      const { text, x, y } = (event as CustomEvent<TextContextMenuDetail>).detail;
      if (!text) return;
      setContextMenu({
        target: { kind: "text", text },
        x,
        y,
        items: [{
          id: "core.text.copy",
          label: "Copiar",
          command: "core.text.copy",
          group: "clipboard",
          icon: "copy",
        }],
      });
    };
    document.addEventListener(TEXT_CONTEXT_MENU_EVENT, openTextContextMenu);
    return () => document.removeEventListener(TEXT_CONTEXT_MENU_EVENT, openTextContextMenu);
  }, []);
  const [draggingExplorerPaths, setDraggingExplorerPaths] = useState<ReadonlySet<string>>(new Set());
  const [dropTargetExplorerPath, setDropTargetExplorerPath] = useState<string>();
  const [explorerHistory, setExplorerHistory] = useState<ExplorerHistoryState>(createExplorerHistoryState);
  const [externalFileDropActive, setExternalFileDropActive] = useState(false);
  const [explorerFilterOpen, setExplorerFilterOpen] = useState(false);
  const [explorerFilterQuery, setExplorerFilterQuery] = useState("");
  const [explorerFilterResult, setExplorerFilterResult] = useState<ExplorerFilterResultState>();
  const [explorerFilterRevision, setExplorerFilterRevision] = useState(0);
  const [editorSearchOpen, setEditorSearchOpen] = useState(false);
  const [editorSearchQuery, setEditorSearchQuery] = useState("");
  const [goToLineOpen, setGoToLineOpen] = useState(false);
  const [goToLineValue, setGoToLineValue] = useState("");
  const [editorSearchReplaceOpen, setEditorSearchReplaceOpen] = useState(false);
  const [editorSearchReplacement, setEditorSearchReplacement] = useState("");
  const [editorSearchMatchIndex, setEditorSearchMatchIndex] = useState(0);
  const [editorSearchCaseSensitive, setEditorSearchCaseSensitive] = useState(false);
  const [editorSearchRegex, setEditorSearchRegex] = useState(false);
  const [editorNavigationLoading, setEditorNavigationLoading] = useState(false);
  const [completionSession, setCompletionSession] = useState<CompletionSession | undefined>(undefined);
  const [editorLocationHistory, setEditorLocationHistory] = useState(createEditorLocationHistory);
  const [editorViewport, setEditorViewport] = useState({ scrollTop: 0, height: 800 });
  const [editorViewportStore] = useState(createEditorViewportStore);
  const editorViewportSyncRef = useRef<{ trailingTimer: number | undefined }>({ trailingTimer: undefined });
  const completionAbortRef = useRef<AbortController | undefined>(undefined);
  const completionTimerRef = useRef<number | undefined>(undefined);
  const editorStateCaptureRef = useRef<{
    documentId: string;
    selectionStart: number;
    selectionEnd: number;
    scrollTop: number;
    scrollLeft: number;
    timer: number;
  } | undefined>(undefined);
  const [editorLayoutMetrics, setEditorLayoutMetrics] = useState<EditorLayoutMetrics>({
    lineHeight: EDITOR_DEFAULT_LINE_HEIGHT,
    contentPadding: EDITOR_CONTENT_PADDING,
  });
  /** Estado visual de blocos recolhidos. Não altera `document.content`. */
  const [documentFolds, setDocumentFolds] = useState<ReadonlyMap<string, readonly DocumentFold[]>>(new Map());
  const [activeFoldRangeState, setActiveFoldRangeState] = useState<ActiveFoldRangeState>();
  const [hoveredFoldLine, setHoveredFoldLine] = useState<number | undefined>(undefined);
  const [foldPreviewLine, setFoldPreviewLine] = useState<number | undefined>(undefined);
  const foldPreviewCloseTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancelFoldPreviewClose = () => {
    if (foldPreviewCloseTimerRef.current === undefined) return;
    clearTimeout(foldPreviewCloseTimerRef.current);
    foldPreviewCloseTimerRef.current = undefined;
  };
  const openFoldPreview = (line: number) => {
    cancelFoldPreviewClose();
    setFoldPreviewLine(line);
  };
  const scheduleFoldPreviewClose = () => {
    cancelFoldPreviewClose();
    foldPreviewCloseTimerRef.current = setTimeout(() => setFoldPreviewLine(undefined), 600);
  };
  const documentFoldsRef = useRef<ReadonlyMap<string, readonly DocumentFold[]>>(documentFolds);
  documentFoldsRef.current = documentFolds;
  const foldIdCounterRef = useRef(0);
  const editorFoldOverlayRef = useRef<HTMLDivElement>(null);
  const explorerFilterInputRef = useRef<HTMLInputElement>(null);
  const editorSearchInputRef = useRef<HTMLInputElement>(null);
  const goToLineInputRef = useRef<HTMLInputElement>(null);
  const editorSearchReplaceInputRef = useRef<HTMLInputElement>(null);
  const syntaxLayerRef = useRef<HTMLPreElement>(null);
  const foldedEditorCaretRef = useRef<HTMLSpanElement>(null);
  const foldedEditorSelectionRef = useRef<HTMLDivElement>(null);
  const editorNavigationLoadingRef = useRef(false);
  const editorLocationHistoryRef = useRef<EditorLocationHistory>(editorLocationHistory);
  editorLocationHistoryRef.current = editorLocationHistory;
  useEffect(() => {
    const empty = createEditorLocationHistory();
    editorLocationHistoryRef.current = empty;
    setEditorLocationHistory(empty);
  }, [workspaceName, workspaceRoot]);
  const restoredRef = useRef(false);
  const openWorkspaceResourceRef = useRef<
    (request: WorkbenchWorkspaceResourceOpenRequest) => Promise<void>
  >(async () => undefined);
  const [pluginConfirm, setPluginConfirm] = useState<WorkbenchConfirmRequest | undefined>(undefined);
  const pluginConfirmResolveRef = useRef<((value: boolean) => void) | undefined>(undefined);
  const virtualDocumentRef = useRef<{
    open: (request: WorkbenchVirtualDocumentRequest) => Promise<string>;
    update: (
      id: string,
      changes: Partial<Pick<WorkbenchVirtualDocumentRequest, "name" | "content">>,
    ) => Promise<void>;
    close: (id: string) => Promise<void>;
  }>({
    open: async () => { throw new Error("O editor ainda não está disponível."); },
    update: async () => undefined,
    close: async () => undefined,
  });
  const explorerFilterExpansionBackupRef = useRef<ReadonlySet<string> | undefined>(undefined);
  const snapshotTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const workspaceExternalSyncTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const explorerHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const explorerHistoryRef = useRef<ExplorerHistoryState>(createExplorerHistoryState());
  const explorerClipboardRef = useRef<readonly ExplorerClipboardEntry[] | undefined>(undefined);
  explorerClipboardRef.current = explorerClipboard;
  const browserResolverRef = useRef<((path: string | undefined) => void) | undefined>(undefined);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightedEditorScrollRef = useRef<HTMLDivElement | null>(null);
  const editorLineRulerRef = useRef<HTMLPreElement | null>(null);
  const editorDebugCurrentLineRef = useRef<HTMLDivElement | null>(null);
  const editorBreakpointLinesRef = useRef<HTMLDivElement | null>(null);
  const editorHistoriesRef = useRef<Map<string, EditorHistory>>(new Map());
  const activeDocumentIdRef = useRef<string | undefined>(activeDocumentId);
  activeDocumentIdRef.current = activeDocumentId;
  const documentsRef = useRef<readonly OpenDocument[]>(documents);
  documentsRef.current = documents;
  const profilesStateRef = useRef<StoredProfiles>(profilesState);
  profilesStateRef.current = profilesState;
  const environmentsRef = useRef<readonly ExecutionEnvironment[]>(environments);
  environmentsRef.current = environments;
  const selectedEnvironmentIdRef = useRef<string | undefined>(selectedEnvironmentId);
  selectedEnvironmentIdRef.current = selectedEnvironmentId;
  useEffect(() => {
    completionAbortRef.current?.abort();
    completionAbortRef.current = undefined;
    if (completionTimerRef.current !== undefined) {
      window.clearTimeout(completionTimerRef.current);
      completionTimerRef.current = undefined;
    }
    setCompletionSession(undefined);
  }, [activeDocumentId]);
  const selectedEnvironmentIds = useMemo(() => {
    const legacySelectedId = selectedEnvironmentId ?? workspaceSettings.environment?.selectedId;
    return resolveEnvironmentSelections(
      environments,
      workspaceSettings.environment?.selectedByProvider ?? {},
      legacySelectedId ? { legacySelectedId } : {},
    );
  }, [environments, selectedEnvironmentId, workspaceSettings.environment]);
  const profileExecutionsRef = useRef(profileExecutions);
  profileExecutionsRef.current = profileExecutions;
  const debugSessionRef = useRef<DebugSessionSnapshot | undefined>(debugSession);
  debugSessionRef.current = debugSession;
  const openProfileTabIdsRef = useRef(openProfileTabIds);
  openProfileTabIdsRef.current = openProfileTabIds;
  const profileRunCancellationRef = useRef(new Map<string, { cancelled: boolean }>());
  const profileRunPromiseRef = useRef(new Map<string, Promise<void>>());
  const debugCommandPromiseRef = useRef<Promise<void> | undefined>(undefined);
  const debugRestartPromiseRef = useRef<Promise<void> | undefined>(undefined);
  const debugLayoutRef = useRef<HTMLDivElement | null>(null);
  const debugOutputRef = useRef<HTMLDivElement | null>(null);
  const userSettingsRef = useRef<UserSettings>(EMPTY_USER_SETTINGS);
  const userSettingsWriteQueueRef = useRef<Promise<UserSettings>>(Promise.resolve(EMPTY_USER_SETTINGS));
  const workspaceSettingsRef = useRef<WorkspaceSettings>(EMPTY_WORKSPACE_SETTINGS);
  const workspaceSettingsWriteQueueRef = useRef<Promise<WorkspaceSettings>>(Promise.resolve(EMPTY_WORKSPACE_SETTINGS));
  const settingsProviders = pluginSettingsProviders();
  const resolvedPluginSettings = useMemo(
    () => Object.fromEntries(settingsProviders.map((provider) => [
      provider.pluginId,
      resolvePluginSettingValues(
        provider,
        provider.scope === "user"
          ? userSettings.plugins?.[provider.pluginId]
          : workspaceSettings.plugins?.[provider.pluginId],
      ),
    ])),
    [settingsProviders, userSettings.plugins, workspaceSettings.plugins],
  );
  const workbenchStateRef = useRef<WorkbenchStateSnapshot>({
    workspaceName,
    ...(workspaceRoot ? { workspaceRoot } : {}),
    activeSidebarId: sidebarView,
    sidebarVisible,
    activePanelId: panelTab,
    panelVisible,
    ...(activeToolWindowId ? { activeToolWindowId } : {}),
    toolWindowVisible,
    ...(selectedEnvironmentId ? { selectedExecutionEnvironmentId: selectedEnvironmentId } : {}),
    ...(Object.keys(selectedEnvironmentIds).length
      ? { selectedExecutionEnvironmentIds: selectedEnvironmentIds }
      : {}),
    pluginSettings: resolvedPluginSettings,
  });
  const executionStateListenersRef = useRef(new Set<(snapshot: WorkbenchExecutionSnapshot) => void>());
  const updateProfilesRef = useRef<(
    profiles: readonly ExecutionProfile[],
    selectedId?: string,
  ) => void>(() => undefined);
  const runProfileRef = useRef<(profile: ExecutionProfile) => Promise<void>>(async () => {
    throw new Error("A execução de perfis ainda não está disponível.");
  });
  const debugProfileRef = useRef<(profile: ExecutionProfile) => Promise<DebugSessionSnapshot>>(async () => {
    throw new Error("A depuração de perfis ainda não está disponível.");
  });
  const stopProfileRef = useRef<(profileId: string) => Promise<void>>(async () => {
    throw new Error("A interrupção de perfis ainda não está disponível.");
  });

  const executionSnapshot = (): WorkbenchExecutionSnapshot => ({
    profiles: profilesStateRef.current.profiles.map((profile) => ({
      ...profile,
      environment: { ...profile.environment },
      steps: profile.steps.map((step) => ({
        ...step,
        ...(step.arguments ? { arguments: [...step.arguments] } : {}),
        parameters: [...step.parameters],
        ...(step.target ? { target: { ...step.target } } : {}),
        ...(step.environmentVariables
          ? { environmentVariables: { ...step.environmentVariables } }
          : {}),
      })),
    })),
    ...(profilesStateRef.current.selectedId
      ? { selectedProfileId: profilesStateRef.current.selectedId }
      : {}),
    environments: environmentsRef.current.map((environment) => ({ ...environment })),
    ...(selectedEnvironmentIdRef.current
      ? { selectedEnvironmentId: selectedEnvironmentIdRef.current }
      : {}),
    executions: Object.values(profileExecutionsRef.current).map((execution) => ({
      ...execution,
      ...(execution.profile ? { profile: {
        ...execution.profile,
        environment: { ...execution.profile.environment },
        steps: execution.profile.steps.map((step) => ({
          ...step,
          ...(step.arguments ? { arguments: [...step.arguments] } : {}),
          parameters: [...step.parameters],
          ...(step.target ? { target: { ...step.target } } : {}),
          ...(step.environmentVariables
            ? { environmentVariables: { ...step.environmentVariables } }
            : {}),
        })),
      } } : {}),
      output: [...execution.output],
      ...(execution.data ? { data: { ...execution.data } } : {}),
    })),
    ...(debugSessionRef.current ? { debugSession: debugSessionRef.current } : {}),
  });
  const workbenchStateListenersRef = useRef(new Set<(snapshot: WorkbenchStateSnapshot) => void>());
  const workbenchState = useMemo<WorkbenchStateApi>(() => ({
    snapshot: () => workbenchStateRef.current,
    subscribe: (listener) => {
      workbenchStateListenersRef.current.add(listener);
      return { dispose: () => workbenchStateListenersRef.current.delete(listener) };
    },
  }), []);

  const activeDocument = documents.find((document) => document.id === activeDocumentId);
  /** Conteúdo real do arquivo aberto. Fold é sempre estado visual derivado deste texto. */
  const activeEditorContent = activeDocument?.kind === "text" ? activeDocument.content : "";
  const activeExternalDocumentNotice = activeDocument
    ? externalDocumentNotices.get(activeDocument.id)
    : undefined;
  const [editorToolbarItems, setEditorToolbarItems] = useState<readonly WorkbenchEditorToolbarItem[]>([]);
  const [resourceEditorRevision, setResourceEditorRevision] = useState(0);
  const activeResourceEditorProvider = useMemo(
    () => resourceEditorProviderFor(
      activeDocument,
      workspaceSettings.plugins,
      { settingsResolved: restorationComplete },
    ),
    [activeDocument, platformSnapshot.plugins, resourceEditorRevision, restorationComplete, workspaceSettings.plugins],
  );
  const activeLanguageProvider = activeResourceEditorProvider ? undefined : languageProviderFor(activeDocument);
  const activeEditorBusyOperation = editorBusyOperation?.documentId === activeDocument?.id
    ? editorBusyOperation
    : undefined;
  const languageEnvironmentExecutable = (provider: LanguageProvider | undefined): string | undefined => {
    const selectedForProvider = selectedEnvironmentForProvider(
      environments,
      selectedEnvironmentIds,
      provider?.environmentProviderId,
    );
    if (selectedForProvider?.status === "ready" && selectedForProvider.executable) {
      return selectedForProvider.executable;
    }
    if (provider?.environmentProviderId) return undefined;
    return environments.find((environment) => environment.id === selectedEnvironmentId)?.executable;
  };
  const canFormatActiveDocument = Boolean(
    activeDocument?.kind === "text"
    && !activeResourceEditorProvider
    && !activeEditorBusyOperation,
  );
  const formatActiveDocument = async () => {
    if (!canFormatActiveDocument || !activeDocument || activeDocument.kind !== "text") return;
    const textarea = editorRef.current;
    const content = textarea?.value ?? activeDocument.content;
    const selectionStart = textarea?.selectionStart ?? activeDocument.selectionStart;
    const selectionEnd = textarea?.selectionEnd ?? activeDocument.selectionEnd;
    const beforeCursor = content.slice(0, selectionStart);
    const lineStart = beforeCursor.lastIndexOf("\n") + 1;
    const environmentExecutable = languageEnvironmentExecutable(activeLanguageProvider);
    const context: TextEditorContextMenuContext = {
      document: {
        ...editorToolbarDocumentSnapshot(activeDocument),
        content,
      },
      selectionStart,
      selectionEnd,
      ...(environmentExecutable ? { environmentExecutable } : {}),
      line: beforeCursor.split("\n").length,
      column: selectionStart - lineStart + 1,
    };
    await platform.commands.execute(TEXT_EDITOR_FORMAT_DOCUMENT_COMMAND, context);
  };
  const openEditorSearch = useCallback((selectedText = "") => {
    if (activeDocument?.kind !== "text" || activeResourceEditorProvider) return false;
    if (selectedText) {
      setEditorSearchQuery(selectedText);
      setEditorSearchMatchIndex(0);
    }
    setEditorSearchOpen(true);
    window.requestAnimationFrame(() => {
      const input = editorSearchInputRef.current;
      input?.focus({ preventScroll: true });
      input?.select();
    });
    return true;
  }, [activeDocument?.id, activeDocument?.kind, activeResourceEditorProvider]);
  const openEditorReplace = useCallback(() => {
    if (!openEditorSearch()) return false;
    setEditorSearchReplaceOpen(true);
    return true;
  }, [openEditorSearch]);
  const openGoToLine = useCallback(() => {
    if (activeDocument?.kind !== "text" || activeResourceEditorProvider) return false;
    setGoToLineOpen(true);
    window.requestAnimationFrame(() => goToLineInputRef.current?.focus({ preventScroll: true }));
    return true;
  }, [activeDocument?.id, activeDocument?.kind, activeResourceEditorProvider]);
  const editorSearchResult = useMemo(() => {
    if (!editorSearchOpen || activeDocument?.kind !== "text" || activeResourceEditorProvider) return { matches: [] };
    try {
      return {
        matches: findTextMatches(activeEditorContent, editorSearchQuery, {
          caseSensitive: editorSearchCaseSensitive,
          regex: editorSearchRegex,
        }),
      };
    } catch {
      return { matches: [], error: "Expressão regular inválida" };
    }
  }, [editorSearchOpen, editorSearchQuery, editorSearchCaseSensitive, editorSearchRegex, activeDocument?.id, activeDocument?.kind, activeEditorContent, activeResourceEditorProvider]);
  const editorSearchMatches = editorSearchResult.matches;
  const editorSearchError = "error" in editorSearchResult ? editorSearchResult.error : undefined;
  const activeEditorSearchMatch = editorSearchMatches[editorSearchMatchIndex];
  const activeSyntaxHighlighter = useMemo(() => {
    if (activeResourceEditorProvider || !activeDocument || activeDocument.kind !== "text") return undefined;
    if (activeEditorContent.length > MAX_SYNTAX_HIGHLIGHT_SOURCE_LENGTH) return undefined;
    return resolveSyntaxHighlighter({
      fileName: activeDocument.name,
      mediaType: activeDocument.mediaType,
      source: activeEditorContent,
    }, platform.capabilities.getAll<LanguageProvider>("language.provider"));
  }, [activeResourceEditorProvider, activeDocument?.id, activeDocument?.name, activeDocument?.mediaType, activeEditorContent, platformSnapshot.plugins]);

  useEffect(() => {
    const provider = activeLanguageProvider;
    if (
      activeResourceEditorProvider
      || !activeDocument
      || activeDocument.kind !== "text"
      || !provider?.provideFoldingRanges
    ) {
      setActiveFoldRangeState(undefined);
      return;
    }

    let cancelled = false;
    const source = activeEditorContent;
    const lineCount = source.split("\n").length;
    const document = editorToolbarDocumentSnapshot(activeDocument);

    void Promise.resolve(provider.provideFoldingRanges({ document, source }))
      .then((ranges: readonly TextEditorFoldingRange[]) => {
        if (cancelled) return;
        setActiveFoldRangeState({
          documentId: activeDocument.id,
          providerId: provider.id,
          source,
          ranges: normalizeFoldRanges(ranges, lineCount),
        });
      })
      .catch((cause) => {
        if (cancelled) return;
        setActiveFoldRangeState(undefined);
        setError(cause instanceof Error ? cause.message : String(cause));
      });

    return () => { cancelled = true; };
  }, [
    activeResourceEditorProvider,
    activeDocument?.id,
    activeDocument?.kind,
    activeDocument?.name,
    activeDocument?.path,
    activeDocument?.workspaceRoot,
    activeDocument?.mediaType,
    activeDocument?.content,
    activeDocument?.savedContent,
    activeEditorContent,
    activeLanguageProvider,
  ]);

  const {
    sidebars: workbenchSidebars,
    panels: workbenchPanels,
    toolWindows: workbenchToolWindows,
    activityButtons,
    titlebar: workbenchTitlebarContributions,
    statusbar: workbenchStatusbarContributions,
    explorerFilter: explorerFilterProvider,
    explorerIgnore: explorerIgnoreProviders,
  } = useWorkbenchContributions(platformSnapshot);
  const activePluginSidebar = workbenchSidebars.find((sidebar) => sidebar.id === sidebarView);
  useEffect(() => {
    let cancelled = false;
    if (!activeDocument || activeDocument.kind !== "text") {
      setEditorToolbarItems([]);
      return;
    }
    const snapshot = editorToolbarDocumentSnapshot(activeDocument);
    const providers = platform.capabilities.getAll<WorkbenchEditorToolbarProvider>("workbench.editorToolbar");
    void Promise.all(providers.map((provider) => provider.provideItems(snapshot))).then((items) => {
      if (cancelled) return;
      setEditorToolbarItems(items.flat().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
    });
    return () => { cancelled = true; };
    // Somente os campos do snapshot: rolagem/seleção não devem re-consultar os providers de toolbar.
  }, [
    activeDocument?.id,
    activeDocument?.kind,
    activeDocument?.name,
    activeDocument?.path,
    activeDocument?.workspaceRoot,
    activeDocument?.mediaType,
    activeDocument?.content,
    activeDocument?.savedContent,
    platformSnapshot,
    resourceEditorRevision,
  ]);
  const selectedProfile = profilesState.profiles.find((profile) => profile.id === profilesState.selectedId);
  const selectedProfileDebugAdapter = selectedProfile
    ? debugAdapterForProfile({
        profile: selectedProfile,
        ...(activeDocument ? { activeDocument } : {}),
        environments,
      })
    : undefined;
  const selectedProfileExecution = selectedProfile ? profileExecutions[selectedProfile.id] : undefined;
  const selectedProfileRunning = selectedProfileExecution?.status === "running";
  const debugSessionActive = Boolean(debugSession && !["stopped", "completed", "failed"].includes(debugSession.status));
  const activeDebugFrame = debugSession?.status === "paused"
    ? debugSession.frames.find((frame) => frame.id === debugSession.selectedFrameId) ?? debugSession.frames[0]
    : undefined;
  const activeDebugPath = workspaceRelativeDebugPath(activeDebugFrame?.path, workspaceRoot);
  const activeDebugLine = activeDebugFrame?.line;
  useEffect(() => {
    if (!debugSessionActive || !debugSession || !debugAdapter) return;
    if (!["starting", "running"].includes(debugSession.status)) return;
    let cancelled = false;
    let timer: number | undefined;
    let reading = false;
    const delay = debugSession.status === "starting" ? 250 : 750;
    const poll = async () => {
      if (cancelled || reading) return;
      reading = true;
      try {
        const snapshot = await debugAdapter.read(debugSession.id);
        if (!cancelled) {
          setDebugSession((current) => nextDebugSession(current, snapshot));
        }
      } catch {
        // A command or process transition may temporarily make a poll stale.
      } finally {
        reading = false;
        if (!cancelled) timer = window.setTimeout(poll, delay);
      }
    };
    timer = window.setTimeout(poll, delay);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [debugSessionActive, debugSession?.id, debugSession?.status, debugAdapter]);

  useEffect(() => {
    if (!debugOutputFollowTail || !debugSession) return;
    window.requestAnimationFrame(() => {
      const outputElement = debugOutputRef.current;
      if (outputElement) outputElement.scrollTop = outputElement.scrollHeight;
    });
  }, [debugSession?.stdout, debugSession?.stderr, debugSession?.error, debugOutputFollowTail]);
  const profileOutputTabs = openProfileTabIds.flatMap((tabId) => {
    const tab = profileExecutionPanelTab(tabId);
    if (!tab) return [];
    const configuredProfile = profilesState.profiles.find((candidate) => candidate.id === tab.profileId);
    const execution = tab.mode === "run" ? profileExecutions[tab.profileId] : undefined;
    const profile = configuredProfile ?? execution?.profile;
    const tabDebugSession = tab.mode === "debug" && debugSession?.profileId === tab.profileId
      ? debugSession
      : undefined;
    if (!profile && !execution && !tabDebugSession) return [];
    const name = profile?.name ?? execution?.profileName ?? tabDebugSession?.profileName ?? tab.profileId;
    const viewTarget: WorkbenchExecutionViewTarget = {
      profileId: tab.profileId,
      profileName: name,
      mode: tab.mode,
      ...(profile ? { profile } : {}),
    };
    return [{
      profileId: tab.profileId,
      mode: tab.mode,
      tabId,
      name,
      profile,
      execution,
      debugSession: tabDebugSession,
      viewTarget,
      viewProvider: tabDebugSession ? undefined : executionViewProviderFor(viewTarget),
    }];
  });
  const runningProfileOutputCount = profileOutputTabs.filter((tab) => (
    tab.execution?.status === "running"
    || Boolean(tab.debugSession && !["stopped", "completed", "failed"].includes(tab.debugSession.status))
  )).length;
  const executionViewToolbarIcon = (action: WorkbenchExecutionViewToolbarAction) => {
    switch (action.icon) {
      case "run":
        return <WorkbenchIcon icon="play" size={14} />;
      case "stop":
        return <WorkbenchIcon icon="stop" size={13} />;
      case "refresh":
        return <WorkbenchIcon icon="refresh" size={13} />;
      case "rerun":
      default:
        return <WorkbenchIcon icon="rerun" size={13} />;
    }
  };
  const activeExecutionTab = profileExecutionPanelTab(panelTab);
  const executionPanelActive = panelVisible
    && Boolean(activeExecutionTab && openProfileTabIds.includes(panelTab));
  const activityLayoutItems = useMemo<readonly ActivityButtonDescriptor[]>(() => [
    { key: "builtin:explorer", defaultOrder: 0, defaultSide: "left", movable: true },
    ...activityButtons.filter((item) => item.kind === "sidebar"),
    { key: "builtin:plugins", defaultOrder: 2_000, defaultSide: "left", movable: true },
    ...(environmentProviders().length
      ? [{ key: "builtin:environments", defaultOrder: 3_000, defaultSide: "left" as const, movable: true }]
      : []),
    { key: "builtin:left-spacer", defaultOrder: 10_000, defaultSide: "left" },
    ...(profileOutputTabs.length
      ? [{ key: "builtin:executions", defaultOrder: 11_000, defaultSide: "left" as const, movable: true }]
      : []),
    ...activityButtons.filter((item) => item.kind === "toolWindow"),
    { key: "builtin:right-spacer", defaultOrder: 10_000, defaultSide: "right" },
    { key: "builtin:problems", defaultOrder: 11_000, defaultSide: "right", movable: true },
  ], [activityButtons, platformSnapshot, profileOutputTabs.length]);
  const leftActivityItems = useMemo(
    () => orderedActivityButtons(activityLayoutItems, activityButtonPlacements, "left"),
    [activityLayoutItems, activityButtonPlacements],
  );
  const rightActivityItems = useMemo(
    () => orderedActivityButtons(activityLayoutItems, activityButtonPlacements, "right"),
    [activityLayoutItems, activityButtonPlacements],
  );
  const activitySideFor = (key: string): ActivityBarSide => (
    activityButtonPlacements[key]?.side
    ?? activityLayoutItems.find((item) => item.key === key)?.defaultSide
    ?? "left"
  );
  const problemsDockSide = activitySideFor("builtin:problems");
  const leftDockWidth = problemsVisible && problemsDockSide === "left"
    ? Math.min(640, Math.max(220, verticalPanelWidths.left))
    : sidebarViewsBySide.left
      ? sidebarWidthForView(verticalPanelWidths.left, sidebarViewsBySide.left)
      : 0;
  const rightDockWidth = problemsVisible && problemsDockSide === "right"
    ? Math.min(640, Math.max(220, verticalPanelWidths.right))
    : sidebarViewsBySide.right
      ? sidebarWidthForView(verticalPanelWidths.right, sidebarViewsBySide.right)
      : 0;
  const bottomPanelAvailable = profileOutputTabs.length > 0
    || Boolean(debugSession)
    || workbenchPanels.some((panel) => panel.id === panelTab);
  const availableThemes = useMemo(() => workbenchThemes(platform), [platformSnapshot]);
  const availableFonts = useMemo(() => workbenchFonts(platform), [platformSnapshot]);
  const availableEditorFonts = useMemo(() => workbenchFontsForTarget(availableFonts, "editor"), [availableFonts]);
  const availableInterfaceFonts = useMemo(() => workbenchFontsForTarget(availableFonts, "interface"), [availableFonts]);
  const activeEditorFont = useMemo(
    () => resolveFont(availableFonts, "editor", fontPreferences.editorFontId),
    [availableFonts, fontPreferences.editorFontId],
  );
  const activeInterfaceFont = useMemo(
    () => resolveFont(availableFonts, "interface", fontPreferences.interfaceFontId),
    [availableFonts, fontPreferences.interfaceFontId],
  );
  const activeTheme = useMemo(
    () => resolveTheme(availableThemes, preferredThemeId),
    [availableThemes, preferredThemeId],
  );

  const availableIconPacks = useMemo(
    () => workbenchIconPacks(platform),
    [platformSnapshot],
  );
  const activeIconPack = useMemo(
    () => resolveIconPack(availableIconPacks, preferredIconPackId),
    [availableIconPacks, preferredIconPackId],
  );
  const activePluginSettingsProvider = ["editor", "appearance", "fonts", "watcher"].includes(settingsSectionId)
    ? undefined
    : settingsProviders.find((provider) => provider.pluginId === settingsSectionId);
  const fileCreationTargetPath = explorerTargetDirectoryPath(entries, selectedExplorerPath);

  const resolveWorkspaceFileCreationOptions = useCallback(async (directoryPath: string) => {
    const providers = platform.capabilities.getAll<WorkspaceFileCreationProvider>("workspace.fileCreation");
    if (!providers.length) return [];
    const directoryEntry = directoryPath ? findWorkspaceEntry(entries, directoryPath) : undefined;
    const directory: ResourceContext = {
      kind: "directory",
      name: directoryEntry?.name ?? workspaceName,
      path: directoryPath,
      ...(workspaceName !== "Sem workspace" ? { workspaceName } : {}),
      ...(workspaceRoot ? { workspaceRoot } : {}),
    };
    const options = (await Promise.all(providers.map((provider) => provider.provideOptions(directory)))).flat();
    const seen = new Set<string>();
    return options
      .filter((option) => option.extension.startsWith(".") && option.extension.length > 1)
      .filter((option) => {
        const key = `${option.extension.toLocaleLowerCase()}\u0000${option.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((left, right) => (left.order ?? 100) - (right.order ?? 100) || left.label.localeCompare(right.label));
  }, [entries, platformSnapshot.plugins, workspaceName, workspaceRoot]);

  useEffect(() => {
    let cancelled = false;
    void resolveWorkspaceFileCreationOptions(fileCreationTargetPath).then((options) => {
      if (!cancelled) setWorkspaceFileCreationOptions(options);
    });
    return () => { cancelled = true; };
  }, [fileCreationTargetPath, resolveWorkspaceFileCreationOptions]);
  const editorSettings = resolveEditorSettings(userSettings.editor);
  const activeDocumentFolds = activeDocument ? (documentFolds.get(activeDocument.id) ?? []) : [];
  const activeFoldProjection = useMemo<FoldProjection | undefined>(() => (
    activeDocument?.kind === "text" && activeDocumentFolds.length
      ? collapseFolds(activeEditorContent, activeDocumentFolds)
      : undefined
  ), [activeDocument?.id, activeDocument?.kind, activeEditorContent, activeDocumentFolds]);
  const activeEditorDisplayContent = activeFoldProjection?.content ?? activeEditorContent;
  /**
   * O realce da busca é desenhado na camada visual, que com dobras usa o texto projetado. Os offsets
   * do match vêm do texto real, então precisam ser convertidos antes de virar faixa pintada.
   */
  const activeEditorSearchHighlight = useMemo<{ start: number; end: number } | undefined>(() => {
    if (!activeEditorSearchMatch) return undefined;
    if (!activeFoldProjection) return activeEditorSearchMatch;
    if (!foldSearchMatchVisible(activeEditorContent, activeFoldProjection, activeEditorSearchMatch)) return undefined;
    return {
      start: editorProjectedOffsetFromSourceOffset(activeEditorContent, activeFoldProjection, activeEditorSearchMatch.start),
      end: editorProjectedOffsetFromSourceOffset(activeEditorContent, activeFoldProjection, activeEditorSearchMatch.end),
    };
  }, [activeEditorSearchMatch, activeFoldProjection, activeEditorContent]);
  /**
   * Enquanto o menu de contexto do editor está aberto, o texto que o originou (a seleção ou a
   * palavra sob o ponteiro) fica realçado para deixar claro sobre o que as ações vão agir.
   */
  const editorContextTargetHighlight = useMemo<{ start: number; end: number } | undefined>(() => {
    if (contextMenu?.target.kind !== "editor") return undefined;
    const { context } = contextMenu.target;
    if (context.document.id !== activeDocument?.id) return undefined;
    const range = editorContextMenuTargetRange(activeEditorContent, context.selectionStart, context.selectionEnd);
    if (!range) return undefined;
    if (!activeFoldProjection) return range;
    if (!foldSearchMatchVisible(activeEditorContent, activeFoldProjection, range)) return undefined;
    return {
      start: editorProjectedOffsetFromSourceOffset(activeEditorContent, activeFoldProjection, range.start),
      end: editorProjectedOffsetFromSourceOffset(activeEditorContent, activeFoldProjection, range.end),
    };
  }, [contextMenu, activeDocument?.id, activeEditorContent, activeFoldProjection]);
  useLayoutEffect(() => {
    const caret = foldedEditorCaretRef.current;
    const selection = foldedEditorSelectionRef.current;
    const textarea = editorRef.current;
    const mirror = syntaxLayerRef.current;
    const content = mirror?.parentElement;
    if (
      !caret
      || !selection
      || !textarea
      || !mirror
      || !content
      || !activeFoldProjection
      || activeDocument?.kind !== "text"
    ) {
      if (caret) caret.hidden = true;
      if (selection) selection.hidden = true;
      return;
    }
    const contentRect = content.getBoundingClientRect();
    if (textarea.selectionStart !== textarea.selectionEnd) {
      caret.hidden = true;
      const projectedStart = editorProjectedOffsetFromSourceOffset(
        textarea.value,
        activeFoldProjection,
        textarea.selectionStart,
      );
      const projectedEnd = editorProjectedOffsetFromSourceOffset(
        textarea.value,
        activeFoldProjection,
        textarea.selectionEnd,
      );
      const rects = editorMirrorRectsAtTextRange(mirror, projectedStart, projectedEnd);
      selection.replaceChildren(...rects.map((rect) => {
        const highlight = document.createElement("span");
        highlight.className = "editor-projected-selection__rect";
        highlight.style.left = `${rect.left - contentRect.left}px`;
        highlight.style.top = `${rect.top - contentRect.top}px`;
        highlight.style.width = `${rect.width}px`;
        highlight.style.height = `${rect.height}px`;
        return highlight;
      }));
      selection.hidden = rects.length === 0;
      return;
    }
    selection.hidden = true;
    selection.replaceChildren();
    const projectedOffset = editorProjectedOffsetFromSourceOffset(
      textarea.value,
      activeFoldProjection,
      textarea.selectionStart,
    );
    const rect = editorMirrorCaretRectAtTextOffset(mirror, projectedOffset);
    if (!rect) {
      caret.hidden = true;
      return;
    }
    caret.style.left = `${rect.left - contentRect.left}px`;
    caret.style.top = `${rect.top - contentRect.top}px`;
    caret.style.height = `${rect.height}px`;
    caret.hidden = false;
    // Restart blink after navigation, matching native caret behavior.
    caret.style.animation = "none";
    void caret.offsetHeight;
    caret.style.animation = "";
  }, [
    activeDocument?.id,
    activeDocument?.kind,
    activeDocument?.selectionStart,
    activeDocument?.selectionEnd,
    activeFoldProjection,
    activeEditorDisplayContent,
  ]);
  const editorMetrics = useMemo(
    () => activeDocument?.kind === "text"
      ? editorDocumentMetrics(activeEditorDisplayContent)
      : { lineCount: 1, lineNumberWidth: 2, gutterWidth: 52 },
    [activeDocument?.id, activeDocument?.kind, activeEditorDisplayContent],
  );
  useLayoutEffect(() => {
    if (activeDocument?.kind !== "text") return;
    let cancelled = false;
    const measure = () => {
      const layer = syntaxLayerRef.current;
      if (!layer || cancelled) return;
      const computed = window.getComputedStyle(layer);
      const declaredLineHeight = Number.parseFloat(computed.lineHeight);
      const paddingTop = Number.parseFloat(computed.paddingTop);
      const paddingBottom = Number.parseFloat(computed.paddingBottom);
      const contentPadding = Number.isFinite(paddingTop) ? paddingTop : EDITOR_CONTENT_PADDING;
      // Com a janela virtualizada, o scrollHeight do layer inclui espaçadores derivados do próprio
      // lineHeight (circular); mede o bloco da janela, cujo texto tem layout real.
      const windowElement = layer.querySelector<HTMLElement>("[data-syntax-window-lines]");
      const windowLines = windowElement ? Number(windowElement.getAttribute("data-syntax-window-lines")) : 0;
      const windowLineHeight = windowElement && windowLines > 0
        ? windowElement.getBoundingClientRect().height / windowLines
        : Number.NaN;
      const measuredHeight = layer.scrollHeight - (Number.isFinite(paddingTop) ? paddingTop : 0) - (Number.isFinite(paddingBottom) ? paddingBottom : 0);
      const measuredLineHeight = Number.isFinite(windowLineHeight) && windowLineHeight > 8
        ? windowLineHeight
        : windowElement
          ? declaredLineHeight
          : editorMetrics.lineCount > 1 ? measuredHeight / editorMetrics.lineCount : declaredLineHeight;
      const lineHeight = Number.isFinite(measuredLineHeight) && measuredLineHeight > 8
        ? measuredLineHeight
        : Number.isFinite(declaredLineHeight) && declaredLineHeight > 8
          ? declaredLineHeight
          : EDITOR_DEFAULT_LINE_HEIGHT;
      setEditorLayoutMetrics((current) => (
        Math.abs(current.lineHeight - lineHeight) < 0.001
        && Math.abs(current.contentPadding - contentPadding) < 0.001
          ? current
          : { lineHeight, contentPadding }
      ));
    };
    const frame = window.requestAnimationFrame(measure);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [activeDocument?.id, activeDocument?.kind, activeEditorDisplayContent, editorMetrics.lineCount, activeEditorFont, fontPreferences.editorFontSize]);
  // Usado só pela virtualização dos toggles de fold; a régua deriva a própria faixa do store.
  const editorRulerRange = editorVisibleLineRange(
    editorMetrics.lineCount,
    editorViewport.scrollTop,
    editorViewport.height,
    EDITOR_FOLD_CONTROL_OVERSCAN_LINES,
    editorLayoutMetrics.lineHeight,
    editorLayoutMetrics.contentPadding,
  );
  // Offsets do início de cada linha; só materializados para fontes grandes, quando a janela de sintaxe é aplicada.
  const editorSyntaxLineStarts = useMemo(() => {
    if (activeEditorDisplayContent.length <= SYNTAX_WINDOW_MIN_SOURCE_LENGTH) return undefined;
    const offsets = [0];
    for (let index = 0; index < activeEditorDisplayContent.length; index += 1) {
      if (activeEditorDisplayContent.charCodeAt(index) === 10) offsets.push(index + 1);
    }
    return offsets;
  }, [activeEditorDisplayContent]);
  // Linha visualmente mais larga (tabs expandidos, caracteres largos ≈ 2 colunas): mantém a
  // largura rolável do `pre` quando o texto fora da janela vira espaçadores de altura fixa.
  const editorSyntaxWidthGuard = useMemo(() => {
    if (!editorSyntaxLineStarts) return undefined;
    const source = activeEditorDisplayContent;
    let bestStart = 0;
    let bestEnd = 0;
    let bestColumns = -1;
    for (let line = 0; line < editorSyntaxLineStarts.length; line += 1) {
      const start = editorSyntaxLineStarts[line] ?? 0;
      const boundary = editorSyntaxLineStarts[line + 1];
      const end = boundary === undefined ? source.length : boundary - 1;
      let columns = 0;
      for (let index = start; index < end; index += 1) {
        const code = source.charCodeAt(index);
        columns += code === 9 ? 4 - (columns % 4) : code >= 0x1100 ? 2 : 1;
      }
      if (columns > bestColumns) {
        bestColumns = columns;
        bestStart = start;
        bestEnd = end;
      }
    }
    return source.slice(bestStart, bestEnd);
  }, [activeEditorDisplayContent, editorSyntaxLineStarts]);
  /**
   * Linha real do arquivo para cada linha visível (índice 0 = linha 1). Com blocos dobrados a régua
   * continua mostrando a numeração do arquivo, e breakpoints/depuração seguem usando o arquivo real.
   */
  const fileLineByVisibleLine = activeFoldProjection?.fileLineByVisibleLine;
  const fileLineOf = (visibleLine: number) => fileLineByVisibleLine?.[visibleLine - 1] ?? visibleLine;
  const editorLineTop = (line: number) => (
    editorLayoutMetrics.contentPadding + (line - 1) * editorLayoutMetrics.lineHeight
  );
  const editorScrollTopForLine = (line: number) => Math.max(0, editorLineTop(line) - 120);
  const editorScrollTopForTopLine = (line: number) => Math.max(0, editorLineTop(line));
  const editorTopLineForScrollTop = (scrollTop: number) => (
    Math.max(1, (scrollTop - editorLayoutMetrics.contentPadding) / editorLayoutMetrics.lineHeight + 1)
  );
  const editorDecorationsByLine = useMemo(() => {
    const grouped = new Map<number, TextEditorLineDecoration[]>();
    const visibleLines = activeFoldProjection?.visibleLineByFileLine;
    for (const decoration of editorLineDecorations) {
      if (!Number.isInteger(decoration.line) || decoration.line < 1) continue;
      const line = visibleLines?.[decoration.line - 1] ?? decoration.line;
      const items = grouped.get(line) ?? [];
      items.push(line === decoration.line ? decoration : { ...decoration, line });
      grouped.set(line, items);
    }
    return grouped;
  }, [editorLineDecorations, activeFoldProjection]);
  /**
   * Breakpoints só fazem sentido quando algum debug adapter registrado suporta a
   * extensão do arquivo ativo; adapters sem `extensions` declaradas valem como curinga.
   */
  const activeDocumentDebuggable = useMemo(() => {
    if (!activeDocument?.path || activeDocument.kind !== "text") return false;
    const fileName = activeDocument.name.toLocaleLowerCase();
    return debugAdapterProviders().some((adapter) => (
      !adapter.extensions?.length
      || adapter.extensions.some((extension) => fileName.endsWith(extension.toLocaleLowerCase()))
    ));
  }, [activeDocument?.path, activeDocument?.kind, activeDocument?.name, platformSnapshot.plugins]);
  /**
   * Linhas visíveis (pós-fold) com breakpoint no documento ativo, para o realce de linha inteira.
   * Breakpoints dentro de blocos dobrados ficam sem faixa até o bloco ser revelado.
   */
  const breakpointVisibleLines = useMemo(() => {
    if (!activeDocument?.path) return [];
    const visibleLines = activeFoldProjection?.visibleLineByFileLine;
    const lines: number[] = [];
    for (const breakpoint of debugBreakpoints) {
      if (breakpoint.path !== activeDocument.path) continue;
      const line = visibleLines ? visibleLines[breakpoint.line - 1] : breakpoint.line;
      if (line !== undefined) lines.push(line);
    }
    return lines;
  }, [debugBreakpoints, activeDocument?.path, activeFoldProjection]);
  // Peeks de bloco ancoram na primeira linha do bloco (change.after), não na
  // linha do marcador que recebeu o hover — um bloco tem um único popup.
  const editorDiffPeekAnchorLine = (decoration: TextEditorLineDecoration): number => {
    const fileLine = decoration.change?.after?.[0]?.line;
    if (fileLine === undefined) return decoration.line;
    return activeFoldProjection?.visibleLineByFileLine?.[fileLine - 1] ?? fileLine;
  };
  const activeFoldRanges: readonly FoldRange[] = activeFoldRangeState
    && activeFoldRangeState.documentId === activeDocument?.id
    && activeFoldRangeState.providerId === activeLanguageProvider?.id
    && activeFoldRangeState.source === activeEditorContent
    ? activeFoldRangeState.ranges
    : [];
  const foldRangeByStartLine = useMemo(() => {
    if (activeDocument?.kind !== "text") return new Map<number, FoldRange>();
    return new Map(activeFoldRanges.map((range) => [range.startLine, range]));
  }, [activeDocument?.kind, activeFoldRanges]);
  const foldedHeaderLines = activeFoldProjection?.foldIdByHeaderVisibleLine ?? new Map<number, string>();
  const foldedMarkerLines = activeFoldProjection?.foldIdByMarkerVisibleLine ?? new Map<number, string>();
  const activeDebugVisibleLine = activeDocument?.kind === "text"
    && activeDocument.path === activeDebugPath
    && activeDebugLine
      ? activeFoldProjection?.visibleLineByFileLine[activeDebugLine - 1] ?? activeDebugLine
      : undefined;
  const foldPreview = useMemo<FoldPreviewState | undefined>(() => {
    if (activeDocument?.kind !== "text" || foldPreviewLine === undefined) return undefined;
    const foldedId = foldedHeaderLines.get(foldPreviewLine);
    if (!foldedId) return undefined;
    const hiddenText = activeFoldProjection?.hiddenTextByFoldId.get(foldedId);
    return hiddenText !== undefined
      ? { line: foldPreviewLine, text: hiddenText, lineCount: hiddenText.split("\n").length }
      : undefined;
  }, [activeDocument?.kind, activeFoldProjection, foldedHeaderLines, foldPreviewLine]);
  // Cabeçalho do popup centrado verticalmente na linha do botão de expandir.
  const foldPreviewRawTop = foldPreview
    ? editorLineTop(foldPreview.line) - editorViewport.scrollTop
      + (editorLayoutMetrics.lineHeight - FOLD_PREVIEW_TITLE_HEIGHT) / 2
    : FOLD_PREVIEW_MARGIN;
  // Só desloca para cima o necessário para caber a altura real do conteúdo, não o teto de 520px.
  const foldPreviewEstimatedHeight = foldPreview
    ? Math.min(
        FOLD_PREVIEW_MAX_HEIGHT,
        FOLD_PREVIEW_CHROME_HEIGHT
          + foldPreview.lineCount * FOLD_PREVIEW_TEXT_LINE_HEIGHT
          + (foldPreview.lineCount > 12 ? FOLD_PREVIEW_FOOTER_HEIGHT : 0),
      )
    : FOLD_PREVIEW_MAX_HEIGHT;
  const foldPreviewTop = foldPreview
    ? Math.min(
        Math.max(FOLD_PREVIEW_MARGIN, foldPreviewRawTop),
        Math.max(FOLD_PREVIEW_MARGIN, editorViewport.height - foldPreviewEstimatedHeight - FOLD_PREVIEW_MARGIN),
      )
    : FOLD_PREVIEW_MARGIN;
  const foldPreviewMaxHeight = foldPreview
    ? Math.max(
        FOLD_PREVIEW_MIN_HEIGHT,
        Math.min(FOLD_PREVIEW_MAX_HEIGHT, editorViewport.height - foldPreviewTop - FOLD_PREVIEW_MARGIN),
      )
    : FOLD_PREVIEW_MAX_HEIGHT;
  /** Floating fold controls: every folded header stays visible, the hovered header appears on demand. */
  const foldControlLines = useMemo(() => {
    if (activeDocument?.kind !== "text" || activeDocument.readOnly) return [] as { line: number; folded: boolean }[];
    const controls: { line: number; folded: boolean }[] = [];
    for (const line of foldedHeaderLines.keys()) {
      if (line >= editorRulerRange.start && line <= editorRulerRange.end) controls.push({ line, folded: true });
    }
    const hoveredFileLine = hoveredFoldLine === undefined ? undefined : fileLineOf(hoveredFoldLine);
    if (
      hoveredFoldLine !== undefined
      && hoveredFileLine !== undefined
      && !foldedHeaderLines.has(hoveredFoldLine)
      // A linha do marcador representa conteúdo já oculto; recolher ali não faz sentido.
      && !foldedMarkerLines.has(hoveredFoldLine)
      && foldRangeByStartLine.has(hoveredFileLine)
    ) controls.push({ line: hoveredFoldLine, folded: false });
    return controls;
  }, [
    activeDocument?.kind,
    activeDocument?.readOnly,
    foldedHeaderLines,
    foldedMarkerLines,
    foldRangeByStartLine,
    hoveredFoldLine,
    fileLineByVisibleLine,
    editorRulerRange.start,
    editorRulerRange.end,
  ]);
  const trackFoldHover = (event: React.MouseEvent<HTMLElement>) => {
    if (activeDocument?.kind !== "text" || activeDocument.readOnly) return;
    if (event.target instanceof Element && event.target.closest(".editor-fold-preview")) return;
    const scroller = highlightedEditorScrollRef.current ?? editorRef.current;
    const bounds = event.currentTarget.getBoundingClientRect();
    const contentY = event.clientY - bounds.top + (scroller?.scrollTop ?? 0) - editorLayoutMetrics.contentPadding;
    const line = Math.floor(contentY / editorLayoutMetrics.lineHeight) + 1;
    const fileLine = fileLineOf(line);
    const next = !foldedMarkerLines.has(line) && (foldRangeByStartLine.has(fileLine) || foldedHeaderLines.has(line))
      ? line
      : undefined;
    setHoveredFoldLine((current) => current === next ? current : next);
  };
  /**
   * Abre as dobras que escondem uma linha do arquivo e devolve a projeção resultante já atualizada
   * (o estado só chega no próximo render, mas quem revela precisa posicionar agora).
   */
  const revealFoldsForFileLine = (documentId: string, fileLine: number): FoldProjection | undefined => {
    const currentFolds = documentFoldsRef.current.get(documentId) ?? [];
    if (!currentFolds.length) return undefined;
    const remainingFolds = foldsRevealingFileLine(currentFolds, fileLine);
    if (remainingFolds.length === currentFolds.length) return activeFoldProjection;
    const nextFolds = new Map(documentFoldsRef.current);
    if (remainingFolds.length) nextFolds.set(documentId, remainingFolds);
    else nextFolds.delete(documentId);
    documentFoldsRef.current = nextFolds;
    setDocumentFolds(nextFolds);
    setFoldPreviewLine(undefined);
    return remainingFolds.length ? collapseFolds(activeEditorContent, remainingFolds) : undefined;
  };
  const toggleFold = (line: number) => {
    if (!activeDocument || activeDocument.kind !== "text" || activeDocument.readOnly) return;
    const documentId = activeDocument.id;
    const existingFoldId = foldedHeaderLines.get(line);
    if (existingFoldId) {
      const nextFolds = new Map(documentFoldsRef.current);
      nextFolds.set(documentId, (nextFolds.get(documentId) ?? []).filter((fold) => fold.id !== existingFoldId));
      if (!nextFolds.get(documentId)?.length) nextFolds.delete(documentId);
      documentFoldsRef.current = nextFolds;
      setDocumentFolds(nextFolds);
      setFoldPreviewLine(undefined);
      return;
    }
    const fileLine = fileLineOf(line);
    const range = foldRangeByStartLine.get(fileLine);
    if (!range) return;
    const lines = activeEditorContent.split("\n");
    const hiddenText = lines.slice(range.startLine, range.endLine).join("\n");
    foldIdCounterRef.current += 1;
    const id = `f${foldIdCounterRef.current}`;
    const nextFolds = new Map(documentFoldsRef.current);
    nextFolds.set(documentId, [...(nextFolds.get(documentId) ?? []), {
      id,
      startLine: range.startLine,
      endLine: range.endLine,
      hiddenText,
    }]);
    documentFoldsRef.current = nextFolds;
    setDocumentFolds(nextFolds);
  };
  const clearDocumentFolds = (documentId: string) => {
    if (documentFoldsRef.current.has(documentId)) {
      const next = new Map(documentFoldsRef.current);
      next.delete(documentId);
      documentFoldsRef.current = next;
      setDocumentFolds(next);
    }
  };
  const showEditorGutter = activeDocument?.kind === "text"
    && !activeResourceEditorProvider
    && (
      editorSettings.lineNumbers
      || editorLineDecorations.length > 0
      || debugBreakpoints.some((breakpoint) => breakpoint.path === activeDocument.path)
      || activeDebugVisibleLine !== undefined
    );

  useEffect(() => {
    const snapshot: WorkbenchStateSnapshot = {
      workspaceName,
      ...(workspaceRoot ? { workspaceRoot } : {}),
      activeSidebarId: sidebarView,
      sidebarVisible,
      activePanelId: panelTab,
      panelVisible,
      ...(activeToolWindowId ? { activeToolWindowId } : {}),
      toolWindowVisible,
      ...(selectedEnvironmentId ? { selectedExecutionEnvironmentId: selectedEnvironmentId } : {}),
      ...(Object.keys(selectedEnvironmentIds).length
        ? { selectedExecutionEnvironmentIds: selectedEnvironmentIds }
        : {}),
      pluginSettings: resolvedPluginSettings,
    };
    workbenchStateRef.current = snapshot;
    for (const listener of workbenchStateListenersRef.current) listener(snapshot);
  }, [workspaceName, workspaceRoot, sidebarView, sidebarVisible, panelTab, panelVisible, activeToolWindowId, toolWindowVisible, selectedEnvironmentId, selectedEnvironmentIds, resolvedPluginSettings]);

  useEffect(() => {
    const snapshot = executionSnapshot();
    for (const listener of executionStateListenersRef.current) listener(snapshot);
  }, [profilesState, environments, selectedEnvironmentId, profileExecutions, debugSession]);

  useEffect(() => {
    if (!restorationComplete) return;
    for (const document of documentsRef.current) {
      if (document.kind !== "text" || !document.path || document.content === document.savedContent) continue;
      void platform.events.emit<TextEditorDocumentChangedEvent>(TEXT_EDITOR_DOCUMENT_CHANGED_EVENT, {
        document: {
          id: document.id,
          name: document.name,
          path: document.path,
          ...(document.workspaceRoot ? { workspaceRoot: document.workspaceRoot } : {}),
          content: document.content,
          isDirty: true,
        },
        previousContent: document.savedContent,
        reason: "edit",
        isDirty: true,
      });
    }
  }, [platformSnapshot.plugins, restorationComplete]);

  useEffect(() => platform.workbench.bind({
    openSidebar(id) {
      if (!workbenchSidebars.some((sidebar) => sidebar.id === id)) {
        throw new Error(`Sidebar não registrada: ${id}`);
      }
      const side = activitySideFor(`sidebar:${id}`);
      setSidebarViewsBySide((current) => openSidebarViewForSide(current, side, id));
      setSidebarView(id);
      setSidebarVisible(true);
    },
    openToolWindow(id, viewId) {
      if (!workbenchToolWindows.some((toolWindow) => toolWindow.id === id)) {
        throw new Error(`Tool window não registrada: ${id}`);
      }
      setToolWindowViewRequest(viewId ? {
        toolWindowId: id,
        viewId,
        sequence: ++toolWindowViewRequestSequenceRef.current,
      } : undefined);
      setActiveToolWindowId(id);
      setPanelVisible(false);
      setToolWindowVisible(true);
    },
    openDialog(contribution) {
      const token = Symbol(contribution.id);
      setWorkbenchDialog({ token, contribution, size: contribution.size });
      return {
        dispose: () => {
          setWorkbenchDialog((current) => current?.token === token ? undefined : current);
        },
      };
    },
    beginEditorBusy(request) {
      const token = Symbol(request.label);
      const startedAt = window.performance.now();
      setEditorBusyOperation({ token, ...request, startedAt });
      return {
        dispose: () => {
          const clear = () => setEditorBusyOperation((current) => current?.token === token ? undefined : current);
          const remaining = EDITOR_BUSY_MINIMUM_MS - (window.performance.now() - startedAt);
          if (remaining > 0) window.setTimeout(clear, remaining);
          else clear();
        },
      };
    },
    async replaceEditorContent(request) {
      const currentDocument = documentsRef.current.find((document) => document.id === request.documentId);
      if (!currentDocument || currentDocument.kind !== "text") return;
      const nextSavedContent = request.markSaved ? request.content : currentDocument.savedContent;
      if (currentDocument.content === request.content && currentDocument.savedContent === nextSavedContent) return;
      const previousContent = currentDocument.content;
      const changedDocument: OpenDocument = {
        ...currentDocument,
        content: request.content,
        savedContent: nextSavedContent,
        selectionStart: Math.min(request.selectionStart ?? currentDocument.selectionStart, request.content.length),
        selectionEnd: Math.min(request.selectionEnd ?? currentDocument.selectionEnd, request.content.length),
      };
      const nextDocuments = documentsRef.current.map((document) => document.id === request.documentId ? changedDocument : document);
      documentsRef.current = nextDocuments;
      setDocuments(nextDocuments);
      const currentFolds = documentFoldsRef.current.get(request.documentId) ?? [];
      if (currentFolds.length) {
        const remapped = remapDocumentFoldsAfterEdit(previousContent, request.content, currentFolds);
        const nextFolds = new Map(documentFoldsRef.current);
        if (remapped.length) nextFolds.set(request.documentId, remapped);
        else nextFolds.delete(request.documentId);
        documentFoldsRef.current = nextFolds;
        setDocumentFolds(nextFolds);
      }
      setDiagnostics([]);
      await platform.events.emit<TextEditorDocumentChangedEvent>(TEXT_EDITOR_DOCUMENT_CHANGED_EVENT, {
        document: {
          id: changedDocument.id,
          name: changedDocument.name,
          ...(changedDocument.path ? { path: changedDocument.path } : {}),
          ...(changedDocument.workspaceRoot ? { workspaceRoot: changedDocument.workspaceRoot } : {}),
          content: changedDocument.content,
          isDirty: changedDocument.content !== changedDocument.savedContent,
        },
        previousContent,
        reason: "edit",
        isDirty: changedDocument.content !== changedDocument.savedContent,
      });
      if (request.markSaved) {
        await platform.events.emit<TextEditorDocumentSavedEvent>(TEXT_EDITOR_DOCUMENT_SAVED_EVENT, {
          document: {
            id: changedDocument.id,
            name: changedDocument.name,
            ...(changedDocument.path ? { path: changedDocument.path } : {}),
            ...(changedDocument.workspaceRoot ? { workspaceRoot: changedDocument.workspaceRoot } : {}),
            content: changedDocument.content,
            isDirty: false,
          },
        });
      }
    },
    async saveEditorDocument(request) {
      const currentDocument = documentsRef.current.find((document) => document.id === request.documentId);
      if (!currentDocument) throw new Error(`Documento não encontrado: ${request.documentId}`);
      if (currentDocument.kind !== "text") throw new Error("Este recurso não é um documento de texto editável.");
      if (currentDocument.content === currentDocument.savedContent) return;
      await saveOpenDocument(currentDocument);
    },
    async openWorkspaceResource(request) {
      await openWorkspaceResourceRef.current(request);
    },
    confirm(request) {
      // Uma confirmação nova substitui a anterior, que é resolvida como cancelamento.
      pluginConfirmResolveRef.current?.(false);
      return new Promise<boolean>((resolve) => {
        pluginConfirmResolveRef.current = resolve;
        setPluginConfirm(request);
      });
    },
    async openVirtualDocument(request) {
      return virtualDocumentRef.current.open(request);
    },
    async updateVirtualDocument(id, changes) {
      await virtualDocumentRef.current.update(id, changes);
    },
    async closeVirtualDocument(id) {
      await virtualDocumentRef.current.close(id);
    },
    isVirtualDocumentOpen(id) {
      return documentsRef.current.some((document) => document.id === id);
    },
    async readWorkspaceResource(path) {
      if (!workspaceHandle) throw new Error("Abra ou reconecte um workspace antes de ler este arquivo.");
      assertWorkspaceResourcePath(path);
      const handle = await resolveFileHandle(workspaceHandle, path);
      return handle.getFile();
    },
    executionSnapshot,
    subscribeExecution(listener) {
      executionStateListenersRef.current.add(listener);
      listener(executionSnapshot());
      return { dispose: () => executionStateListenersRef.current.delete(listener) };
    },
    async updateExecutionData(profileId, providerId, data) {
      const state = profileExecutionsRef.current[profileId];
      if (!state?.processId) return;
      const process = await updateHostProcessData(state.processId, providerId, data);
      setProfileExecutions((current) => {
        const existing = current[profileId];
        if (!existing) return current;
        return {
          ...current,
          [profileId]: {
            ...existing,
            ...(process.data ? { data: process.data } : {}),
          },
        };
      });
    },
    async upsertExecutionProfile(profile, options: WorkbenchExecutionProfileUpdateOptions = {}) {
      const current = profilesStateRef.current;
      const existingIndex = current.profiles.findIndex((candidate) => candidate.id === profile.id);
      const profiles = existingIndex < 0
        ? [...current.profiles, profile]
        : current.profiles.map((candidate, index) => index === existingIndex ? profile : candidate);
      updateProfilesRef.current(
        profiles,
        options.select ? profile.id : current.selectedId,
      );
    },
    async removeExecutionProfile(profileId) {
      const current = profilesStateRef.current;
      const profiles = current.profiles.filter((profile) => profile.id !== profileId);
      if (profiles.length === current.profiles.length) return;
      updateProfilesRef.current(
        profiles,
        current.selectedId === profileId ? undefined : current.selectedId,
      );
    },
    async selectExecutionProfile(profileId) {
      const current = profilesStateRef.current;
      if (profileId && !current.profiles.some((profile) => profile.id === profileId)) {
        throw new Error(`Perfil não encontrado: ${profileId}`);
      }
      updateProfilesRef.current(current.profiles, profileId);
    },
    async runExecutionProfile(profile) {
      await runProfileRef.current(profile);
    },
    async debugExecutionProfile(profile) {
      return debugProfileRef.current(profile);
    },
    async stopExecutionProfile(profileId) {
      await stopProfileRef.current(profileId);
    },
    highlightText(request) {
      const provider = resolveSyntaxHighlighter({
        fileName: request.fileName,
        source: request.source,
      }, platform.capabilities.getAll<LanguageProvider>("language.provider"));
      return {
        languageId: provider.id,
        tokens: provider.highlight(request.source),
      };
    },
  }).dispose, [platformSnapshot.plugins]);

  useEffect(() => {
    if (!workbenchDialog) return;
    const installed = platformSnapshot.plugins.some(
      (plugin) => plugin.manifest.id === workbenchDialog.contribution.pluginId && plugin.state === "active",
    );
    if (!installed) setWorkbenchDialog(undefined);
  }, [platformSnapshot.plugins, workbenchDialog?.contribution.pluginId]);

  useEffect(() => {
    const subscriptions = textEditorLineDecorationProviders()
      .map((provider) => provider.onDidChange?.(() => setEditorDecorationRevision((current) => current + 1)))
      .filter((subscription): subscription is { dispose(): void } => Boolean(subscription));
    return () => subscriptions.forEach((subscription) => subscription.dispose());
  }, [platformSnapshot.plugins]);

  useEffect(() => {
    const subscriptions = resourceDecorationProviders()
      .map((provider) => provider.onDidChange?.(() => setResourceDecorationRevision((current) => current + 1)))
      .filter((subscription): subscription is { dispose(): void } => Boolean(subscription));
    return () => subscriptions.forEach((subscription) => subscription.dispose());
  }, [platformSnapshot.plugins]);

  useEffect(() => {
    const subscriptions = platform.capabilities
      .getAll<WorkbenchResourceEditorProvider>("workbench.resourceEditor")
      .map((provider) => provider.onDidChange?.(() => setResourceEditorRevision((current) => current + 1)))
      .filter((subscription): subscription is { dispose(): void } => Boolean(subscription));
    return () => subscriptions.forEach((subscription) => subscription.dispose());
  }, [platformSnapshot.plugins]);

  useEffect(() => {
    const providers = resourceDecorationProviders();
    if (!providers.length || workspaceName === "Sem workspace") {
      setResourceDecorations(new Map());
      return;
    }
    let cancelled = false;
    const collect = (items: readonly WorkspaceEntry[]): WorkspaceEntry[] => items.flatMap((entry) => [
      entry,
      ...(entry.children ? collect(entry.children) : []),
    ]);
    const dirtyPaths = new Set(documents
      .filter((document) => document.path && document.kind === "text" && document.content !== document.savedContent)
      .map((document) => document.path as string));
    const allEntries = collect(entries);
    const resolveDecoration = async (entry: WorkspaceEntry) => {
      const resource: ResourceContext = {
        kind: entry.kind,
        name: entry.name,
        path: entry.path,
        workspaceName,
        ...(workspaceRoot ? { workspaceRoot } : {}),
        ...(entry.kind === "file" ? { isDirty: dirtyPaths.has(entry.path) } : {}),
      };
      const decorations = (await Promise.all(providers.map(async (provider) => {
        try { return await provider.provideDecoration(resource); }
        catch { return undefined; }
      }))).filter((value): value is ResourceDecoration => Boolean(value));
      const decoration = decorations.sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0))[0];
      return decoration ? [entry.path, decoration] as const : undefined;
    };
    const dirtyEntries = allEntries.filter((entry) => entry.kind === "file" && dirtyPaths.has(entry.path));
    if (dirtyEntries.length) {
      void Promise.all(dirtyEntries.map(resolveDecoration)).then((items) => {
        if (cancelled) return;
        setResourceDecorations((current) => {
          const next = new Map(current);
          dirtyEntries.forEach((entry) => next.delete(entry.path));
          items.forEach((item) => {
            if (item) next.set(item[0], item[1]);
          });
          return next;
        });
      });
    }
    void Promise.all(allEntries.map(resolveDecoration)).then((items) => {
      if (cancelled) return;
      setResourceDecorations(new Map(items.filter((item): item is readonly [string, ResourceDecoration] => Boolean(item))));
    });
    return () => { cancelled = true; };
  }, [entries, documents, workspaceName, workspaceRoot, resourceDecorationRevision, platformSnapshot.plugins]);

  useEffect(() => {
    if (activeDocument?.kind !== "text" || activeResourceEditorProvider || !activeDocument.path || !workspaceRoot) {
      setEditorLineDecorations([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const document = {
        id: activeDocument.id,
        name: activeDocument.name,
        ...(activeDocument.path ? { path: activeDocument.path } : {}),
        workspaceRoot: activeDocument.workspaceRoot ?? workspaceRoot,
        content: activeDocument.content,
        isDirty: activeDocument.content !== activeDocument.savedContent,
      };
      void Promise.all(textEditorLineDecorationProviders().map(async (provider) => {
        try {
          return await provider.provideDecorations(document);
        } catch {
          return [];
        }
      })).then((items) => {
        if (!cancelled) setEditorLineDecorations(items.flat());
      });
    }, 140);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeDocument?.id, activeDocument?.kind, activeDocument?.path, activeDocument?.content, activeDocument?.workspaceRoot, activeResourceEditorProvider, workspaceRoot, editorDecorationRevision, platformSnapshot.plugins]);

  useEffect(() => {
    setSelectedEditorLineDecoration(undefined);
  }, [activeDocument?.id]);

  useEffect(() => {
    const next = reconcileToolWindowLayout({
      initialized: platformSnapshot.initialized,
      availableIds: workbenchToolWindows.map((toolWindow) => toolWindow.id),
      current: {
        ...(activeToolWindowId ? { activeToolWindowId } : {}),
        toolWindowVisible,
      },
    });
    if (next.activeToolWindowId !== activeToolWindowId) {
      setActiveToolWindowId(next.activeToolWindowId);
    }
    if (next.toolWindowVisible !== toolWindowVisible) {
      setToolWindowVisible(next.toolWindowVisible);
    }
  }, [platformSnapshot.plugins, platformSnapshot.initialized, activeToolWindowId, toolWindowVisible]);

  useEffect(() => {
    setMountedToolWindowIds((previous) => retainMountedToolWindows(previous, {
      ...(activeToolWindowId ? { activeToolWindowId } : {}),
      toolWindowVisible,
      availableIds: workbenchToolWindows.map((toolWindow) => toolWindow.id),
    }));
  }, [activeToolWindowId, toolWindowVisible, workbenchToolWindows]);

  useEffect(() => {
    if (!platformSnapshot.initialized) return;
    const builtIn = sidebarView === "explorer" || sidebarView === "plugins" || sidebarView === "environments";
    if (!builtIn && !workbenchSidebars.some((sidebar) => sidebar.id === sidebarView)) {
      setSidebarView("explorer");
    }
  }, [platformSnapshot.initialized, platformSnapshot.plugins, sidebarView, workbenchSidebars]);

  const replaceWorkspaceSettings = useCallback((settings: WorkspaceSettings) => {
    workspaceSettingsRef.current = settings;
    setWorkspaceSettings(settings);
  }, []);

  const replaceUserSettings = useCallback((settings: UserSettings) => {
    userSettingsRef.current = settings;
    setUserSettings(settings);
  }, []);

  const persistUserSettings = useCallback(async (settings: UserSettings) => {
    replaceUserSettings(settings);
    const write = userSettingsWriteQueueRef.current
      .catch(() => EMPTY_USER_SETTINGS)
      .then(() => writeUserSettings(settings));
    userSettingsWriteQueueRef.current = write;
    const saved = await write;
    if (userSettingsRef.current === settings) replaceUserSettings(saved);
  }, [replaceUserSettings]);

  const updateUserSettings = useCallback(async (
    update: (current: UserSettings) => UserSettings,
  ) => {
    await persistUserSettings(update(userSettingsRef.current));
  }, [persistUserSettings]);

  const persistWorkspaceSettings = useCallback(async (settings: WorkspaceSettings) => {
    if (!workspaceRoot) throw new Error("Abra um workspace antes de salvar configurações locais.");
    const targetWorkspaceRoot = workspaceRoot;
    replaceWorkspaceSettings(settings);
    const write = workspaceSettingsWriteQueueRef.current
      .catch(() => EMPTY_WORKSPACE_SETTINGS)
      .then(() => writeWorkspaceSettings(targetWorkspaceRoot, settings));
    workspaceSettingsWriteQueueRef.current = write;
    const saved = await write;
    if (workspaceSettingsRef.current === settings) replaceWorkspaceSettings(saved);
  }, [workspaceRoot, replaceWorkspaceSettings]);

  const updateWorkspaceSettings = useCallback(async (
    update: (current: WorkspaceSettings) => WorkspaceSettings,
  ) => {
    await persistWorkspaceSettings(update(workspaceSettingsRef.current));
  }, [persistWorkspaceSettings]);

  useEffect(() => {
    if (!activeLanguageProvider) {
      setLintEnabledRuleIds([]);
      return;
    }
    const configured = workspaceSettings.lint?.[activeLanguageProvider.id];
    if (configured) {
      setLintEnabledRuleIds(configured.enabledRuleIds);
      return;
    }
    const settings = defaultLintSettings(activeLanguageProvider);
    setLintEnabledRuleIds(settings.enabledRuleIds);
  }, [workspaceSettings.lint, activeLanguageProvider?.id]);

  const invoke = useCallback((operation: () => void | Promise<void>) => {
    setError(undefined);
    Promise.resolve(operation()).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  useEffect(() => {
    if (!error) return;
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    const currentError = error;
    errorTimerRef.current = setTimeout(() => {
      setError((value) => value === currentError ? undefined : value);
    }, 5000);
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, [error]);

  useEffect(() => () => {
    if (workspaceExternalSyncTimerRef.current) clearTimeout(workspaceExternalSyncTimerRef.current);
  }, []);

  useEffect(() => {
    if (!activeDocument || !activeLanguageProvider) {
      setDiagnostics([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      /** O lint analisa o conteúdo real; os diagnósticos voltam para as coordenadas visíveis. */
      const projection = activeFoldProjection;
      void lintDocument(activeDocument, { enabledRuleIds: lintEnabledRuleIds })
        .then((items) => {
          if (cancelled) return;
          setDiagnostics(projection ? foldedDiagnostics(items, projection) : items);
        })
        .catch((cause) => {
          if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
        });
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeDocument?.id, activeDocument?.content, activeLanguageProvider, lintEnabledRuleIds, activeFoldProjection]);

  useEffect(() => {
    return platform.subscribe(() => setPlatformSnapshot(platform.snapshot()));
  }, []);

  useLayoutEffect(() => {
    if (activeTheme) applyWorkbenchTheme(activeTheme);
  }, [activeTheme]);
  useEffect(() => {
    applyWorkbenchIconPack(activeIconPack);
  }, [activeIconPack]);
  useEffect(() => {
    applyWorkbenchFonts({
      editorFont: activeEditorFont,
      interfaceFont: activeInterfaceFont,
      editorFontSize: fontPreferences.editorFontSize,
    });
  }, [activeEditorFont, activeInterfaceFont, fontPreferences.editorFontSize]);

  const loadLocalWorkspaceSettings = useCallback(async (
    _name: string,
    root: string,
    legacySelectedEnvironmentId?: string,
  ): Promise<WorkspaceSettings> => {
    let settings = await readWorkspaceSettings(root);
    let migrated = false;
    if (!settings.environment?.selectedId && legacySelectedEnvironmentId) {
      settings = { ...settings, environment: { selectedId: legacySelectedEnvironmentId } };
      migrated = true;
    }
    if (migrated) {
      settings = await writeWorkspaceSettings(root, settings);
    }
    replaceWorkspaceSettings(settings);
    setProfilesState(settings.executionProfiles ?? { profiles: [] });
    setDebugBreakpoints(settings.debugBreakpoints ?? []);
    const debugLayout = normalizeDebugPanelLayout(settings.debugPanel);
    setDebugInspectorWidth(debugLayout.inspectorWidth);
    setDebugOutputWrap(debugLayout.outputWrap);
    setDebugOutputFollowTail(debugLayout.outputFollowTail);
    void configureDesktopWorkspaceWatcher(root, settings.watcher?.extraIgnoredDirectories ?? []);
    return settings;
  }, [replaceWorkspaceSettings]);

  const applyPersistedVisualSession = useCallback((session: ReturnType<typeof readSession>) => {
    setSidebarView(session.sidebarView);
    setSidebarVisible(session.sidebarVisible);
    setSidebarViewsBySide(session.sidebarViewsBySide);
    setVerticalPanelWidths({
      left: session.leftVerticalPanelWidth,
      right: session.rightVerticalPanelWidth,
    });
    setPanelVisible(session.panelVisible);
    setPanelHeight(session.panelHeight);
    setPanelTab(session.panelTab);
    setProblemsVisible(session.problemsVisible);
    setToolWindowVisible(session.toolWindowVisible);
    setToolWindowHeight(session.toolWindowHeight);
    setActiveToolWindowId(session.activeToolWindowId);
    setActivityButtonPlacements(session.activityButtonPlacements);
    setExpanded(new Set(session.expandedDirectories));
    setExplorerShowHidden(session.explorerShowHidden);
    setExplorerShowIgnored(session.explorerShowIgnored);
  }, []);

  const restorePersistedWorkspaceUi = useCallback(async (
    workspaceRoot: string,
    handle: BrowserDirectoryHandle,
    rootEntries: readonly WorkspaceEntry[],
  ) => {
    const [session, snapshot] = await Promise.all([
      readPersistedSession(workspaceRoot),
      readReactSnapshot(workspaceRoot),
    ]);
    applyPersistedVisualSession(session);
    setEntries(await hydrateExpandedEntries(rootEntries, new Set(session.expandedDirectories)));
    const restoredDocuments = await restoreWorkspaceDocuments(
      snapshot?.documents ?? [],
      workspaceRoot,
      handle,
    );
    setDocuments(restoredDocuments);
    setActiveDocumentId(
      session.activeDocumentId
        && restoredDocuments.some((document) => document.id === session.activeDocumentId)
        ? session.activeDocumentId
        : restoredDocuments[0]?.id,
    );
    const restoredDocumentIds = new Set(restoredDocuments.map((document) => document.id));
    const restoredFolds = new Map<string, readonly DocumentFold[]>();
    for (const document of snapshot?.documents ?? []) {
      if (!restoredDocumentIds.has(document.id)) continue;
      const folds = document.folds?.filter((fold): fold is DocumentFold => (
        Number.isInteger(fold.startLine)
        && Number.isInteger(fold.endLine)
        && fold.startLine >= 1
        && fold.endLine > fold.startLine
      ));
      if (folds?.length) restoredFolds.set(document.id, folds);
    }
    documentFoldsRef.current = restoredFolds;
    setDocumentFolds(restoredFolds);
    setDiagnostics(snapshot?.diagnostics ?? []);
    setOutput(snapshot ? [...snapshot.output] : []);
    return session;
  }, [applyPersistedVisualSession]);

  useEffect(() => {
    platform.initialize()
      .then(async () => {
        const [sessionLocator, persistedUserSettings] = await Promise.all([
          readPersistedSession(),
          readUserSettings(),
        ]);
        replaceUserSettings(persistedUserSettings);
        setPreferredThemeId(persistedUserSettings.appearance?.themeId ?? workbenchThemeDefaults.themeId);
        setPreferredIconPackId(persistedUserSettings.appearance?.iconPackId ?? workbenchIconDefaults.packId);
        setFontPreferences(defaultFontPreferences(persistedUserSettings.appearance?.fonts));
        let persistedSession = sessionLocator;
        let snapshot = await readReactSnapshot();
        let restoredDocuments: readonly OpenDocument[] = [];
        let restoredWorkspaceName = snapshot?.workspaceName ?? sessionLocator.workspaceName;
        let restoredWorkspaceRoot = snapshot?.workspaceRoot ?? sessionLocator.workspaceRoot;
        // Handles vivos nunca são restaurados de JSON. Eles são reconstruídos
        // pelo host a partir do caminho persistido do workspace.
        let restoredWorkspaceHandle: BrowserDirectoryHandle | undefined;
        const requestedProject = requestedProjectReference();
        if (requestedProject) {
          if (requestedProject.startsWith("path:") && isDesktopHost()) {
            const requestedPath = requestedProject.slice("path:".length);
            restoredWorkspaceHandle = await restoreDesktopWorkspaceHandle(requestedPath);
            restoredWorkspaceRoot = requestedPath;
          } else {
            const requestedRecent = (await readRecentProjects()).find((project) => project.id === requestedProject);
            if (requestedRecent) {
              const hostWorkspace = await setHostWorkspace(requestedRecent.name, requestedRecent.path);
              restoredWorkspaceRoot = hostWorkspace.workspaceRoot;
              restoredWorkspaceHandle = isDesktopHost()
                ? await restoreDesktopWorkspaceHandle(hostWorkspace.workspaceRoot)
                : runtimeWorkspaceHandle(requestedRecent.name, hostWorkspace.workspaceRoot);
            }
          }
          if (!restoredWorkspaceHandle) throw new Error("O projeto solicitado não está mais disponível.");
          restoredWorkspaceName = restoredWorkspaceHandle.name;
          restoredWorkspaceRoot = restoredWorkspaceRoot ?? await workspaceRootHintForHandle(restoredWorkspaceHandle);
          const url = new URL(window.location.href);
          url.searchParams.delete("tinyideOpenProject");
          window.history.replaceState(null, "", url.href);
        } else if (isDesktopHost()) {
          if (restoredWorkspaceRoot) {
            restoredWorkspaceHandle = await restoreDesktopWorkspaceHandle(restoredWorkspaceRoot).catch(() => undefined);
          } else {
            restoredWorkspaceHandle = await restoreLastDesktopWorkspaceHandle().catch(() => undefined);
            if (restoredWorkspaceHandle) {
              restoredWorkspaceName = restoredWorkspaceHandle.name;
              restoredWorkspaceRoot = await workspaceRootHintForHandle(restoredWorkspaceHandle);
            } else {
              restoredWorkspaceName = "Sem workspace";
            }
          }
        }
        if (restoredWorkspaceName !== "Sem workspace" && (!isDesktopHost() || Boolean(restoredWorkspaceRoot))) {
          try {
            const hostWorkspace = await setHostWorkspace(restoredWorkspaceName, restoredWorkspaceRoot);
            restoredWorkspaceRoot = hostWorkspace.workspaceRoot;
            setWorkspaceRoot(hostWorkspace.workspaceRoot);
            [persistedSession, snapshot] = await Promise.all([
              readPersistedSession(hostWorkspace.workspaceRoot),
              readReactSnapshot(hostWorkspace.workspaceRoot),
            ]);
            applyPersistedVisualSession(persistedSession);
            if (!isDesktopHost()) {
              restoredWorkspaceHandle = runtimeWorkspaceHandle(restoredWorkspaceName, hostWorkspace.workspaceRoot);
            }
            await loadLocalWorkspaceSettings(
              restoredWorkspaceName,
              hostWorkspace.workspaceRoot,
              persistedSession.selectedEnvironmentId,
            );
          } catch (cause) {
            restoredWorkspaceRoot = undefined;
            setWorkspaceRoot(undefined);
            setWorkspaceAccess("missing");
            await clearHostWorkspace().catch(() => undefined);
            setError(cause instanceof Error ? cause.message : String(cause));
          }
        } else {
          await clearHostWorkspace();
          setWorkspaceRoot(undefined);
          applyPersistedVisualSession(sessionLocator);
        }
        setWorkspaceName(restoredWorkspaceName);
        setWorkspaceHandle(restoredWorkspaceHandle);
        if (restoredWorkspaceHandle && restoredWorkspaceRoot) {
          let permission: PermissionState | undefined;
          try {
            permission = await restoredWorkspaceHandle.queryPermission?.({ mode: "readwrite" });
          } catch (cause) {
            if (!isBrowserFileSystemAccessDenied(cause)) throw cause;
            permission = "prompt";
          }
          if (permission === "granted" || permission === undefined) {
            try {
              const rootEntries = await listDirectory(restoredWorkspaceHandle);
              setEntries(await hydrateExpandedEntries(rootEntries, new Set(persistedSession.expandedDirectories)));
              setWorkspaceAccess("ready");
              restoredDocuments = await restoreWorkspaceDocuments(
                snapshot?.documents ?? [],
                restoredWorkspaceRoot,
                restoredWorkspaceHandle,
              );
            } catch (cause) {
              if (!isBrowserFileSystemAccessDenied(cause)) throw cause;
              setEntries(snapshot ? deserializeEntries(snapshot.workspaceEntries) : []);
              setWorkspaceAccess("permission-required");
              restoredDocuments = await restoreWorkspaceDocuments(snapshot?.documents ?? [], restoredWorkspaceRoot);
            }
          } else {
            setEntries(snapshot ? deserializeEntries(snapshot.workspaceEntries) : []);
            setWorkspaceAccess("permission-required");
            restoredDocuments = await restoreWorkspaceDocuments(snapshot?.documents ?? [], restoredWorkspaceRoot);
          }
        } else if (snapshot) {
          setEntries(deserializeEntries(snapshot.workspaceEntries));
          if (restoredWorkspaceName !== "Sem workspace") setWorkspaceAccess("missing");
          restoredDocuments = await restoreWorkspaceDocuments(snapshot.documents, restoredWorkspaceRoot);
        } else {
          setEntries([]);
        }
        setDocuments(restoredDocuments);
        if (snapshot) {
          const restoredDocumentIds = new Set(restoredDocuments.map((document) => document.id));
          const restoredFolds = new Map<string, readonly DocumentFold[]>();
          for (const document of snapshot.documents) {
            if (!restoredDocumentIds.has(document.id)) continue;
            const folds = document.folds?.filter((fold): fold is DocumentFold => (
              Number.isInteger(fold.startLine)
              && Number.isInteger(fold.endLine)
              && fold.startLine >= 1
              && fold.endLine > fold.startLine
            ));
            if (folds?.length) restoredFolds.set(document.id, folds);
          }
          documentFoldsRef.current = restoredFolds;
          setDocumentFolds(restoredFolds);
        }
        if (snapshot) {
          setDiagnostics(snapshot.diagnostics);
          setOutput([...snapshot.output]);
        }
        setActiveDocumentId(
          persistedSession.activeDocumentId
            && restoredDocuments.some((document) => document.id === persistedSession.activeDocumentId)
            ? persistedSession.activeDocumentId
            : restoredDocuments[0]?.id,
        );
        const loadedEnvironments = restoredWorkspaceRoot ? await loadEnvironments() : [];
        setEnvironments(loadedEnvironments);
        const configuredEnvironmentId = workspaceSettingsRef.current.environment?.selectedId;
        const restoredSelectedEnvironmentId = configuredEnvironmentId && loadedEnvironments.some((environment) => environment.id === configuredEnvironmentId)
          ? configuredEnvironmentId
          : loadedEnvironments[0]?.id;
        setSelectedEnvironmentId(restoredSelectedEnvironmentId);
        if (restoredWorkspaceRoot && restoredSelectedEnvironmentId !== configuredEnvironmentId) {
          const nextSettings: WorkspaceSettings = {
            ...workspaceSettingsRef.current,
            environment: restoredSelectedEnvironmentId ? { selectedId: restoredSelectedEnvironmentId } : {},
          };
          replaceWorkspaceSettings(await writeWorkspaceSettings(restoredWorkspaceRoot, nextSettings));
        }
        const restoredActive = restoredDocuments[0];
        const contributions = restoredWorkspaceRoot
          ? await loadProfileContributions({
              workspaceName: restoredWorkspaceName,
              workspaceRoot: restoredWorkspaceRoot,
              ...(restoredActive ? { activeDocument: restoredActive } : {}),
            })
          : { executableOptions: [], variables: [], presets: [], targetKinds: [] };
        setExecutableOptions(contributions.executableOptions);
        setProfilePresets(contributions.presets);
        setProfileTargetKinds(contributions.targetKinds);
        restoredRef.current = true;
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => {
        setRestorationComplete(true);
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => window.tinyideDesktop?.notifyReady?.());
        });
      });
  }, []);

  useEffect(() => {
    if (!restorationComplete || !workspaceRoot) return;
    let cancelled = false;
    setResumedProcessId(undefined);
    setActiveProcessId(undefined);
    setBusy(false);
    setResumedProfileProcesses([]);
    setProfileExecutions({});
    setOpenProfileTabIds([]);
    setClosingProfileTabIds(new Set());
    setDebugSession(undefined);
    setDebugAdapter(undefined);
    setDebugCommandPending(undefined);
    setDebugRestartingProfileId(undefined);
    setRestartingProfileId(undefined);
    profileRunCancellationRef.current.clear();
    profileRunPromiseRef.current.clear();
    debugCommandPromiseRef.current = undefined;
    debugRestartPromiseRef.current = undefined;
    void Promise.all([
      listHostProcesses(),
      restoreActiveDebugSession(debugAdapterProviders()),
    ])
      .then(([processes, restoredDebug]) => {
        if (cancelled) return;
        const restoredProfiles = restoreProfileExecutions(processes);
        const restoredDebugSession = restoredDebug.current?.session;
        const restoredTabIds = restoredDebugSession
          ? openProfileExecutionTab(restoredProfileExecutionTabIds(restoredProfiles.states), restoredDebugSession.profileId, "debug")
          : restoredProfileExecutionTabIds(restoredProfiles.states);
        setProfileExecutions(restoredProfiles.states);
        setOpenProfileTabIds(restoredTabIds);
        if (restoredDebug.current) {
          setDebugAdapter(restoredDebug.current.adapter);
          setDebugSession(restoredDebug.current.session);
        }
        if (restoredDebug.errors.length) {
          setError(restoredDebug.errors.map((item) => item.message).join("\n"));
        }
        setPanelTab((current) => {
          const tab = profileExecutionPanelTab(current);
          return tab && !restoredTabIds.includes(current) ? "output" : current;
        });
        setResumedProfileProcesses(restoredProfiles.running);
        const latestRunningProfile = restoredProfiles.running.at(-1);
        const latestRunningProfileStartedAt = latestRunningProfile
          ? restoredProfiles.states[latestRunningProfile.profileId]?.startedAt ?? 0
          : 0;
        if (restoredDebugSession && restoredDebugSession.startedAt >= latestRunningProfileStartedAt) {
          revealExecutionPanel(profileExecutionPanelTabId(restoredDebugSession.profileId, "debug"));
        } else if (latestRunningProfile) {
          revealExecutionPanel(profileExecutionPanelTabId(latestRunningProfile.profileId, "run"));
        }
        const running = processes
          .filter((process) => process.status === "running" && process.presentation?.kind !== "profile")
          .sort((left, right) => right.startedAt - left.startedAt)[0];
        if (!running) return;
        setOutput([...hostProcessOutputLines(running)]);
        setBusy(true);
        setActiveProcessId(running.id);
        setResumedProcessId(running.id);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [restorationComplete, workspaceRoot, revealExecutionPanel]);

  useEffect(() => {
    if (!resumedProfileProcesses.length) return;
    let cancelled = false;
    const monitor = async (resumed: ResumedProfileProcess) => {
      try {
        let process = await readHostProcess(resumed.processId);
        let cursor = process.outputEndCursor ?? process.outputStartCursor ?? 0;
        let processOutput = resumedProfileProcessOutput(resumed, process);
        while (!cancelled) {
          setProfileExecutions((current) => ({
            ...current,
            [resumed.profileId]: {
              profileId: resumed.profileId,
              profileName: process.presentation?.sourceName ?? current[resumed.profileId]?.profileName ?? resumed.profileId,
              status: process.status === "running"
                ? "running"
                : process.stopRequested
                  ? "stopped"
                  : process.exitCode === 0
                    ? "completed"
                    : "failed",
              output: processOutput,
              ...(process.data ? { data: process.data } : {}),
              ...(process.status === "running" ? { processId: process.id } : {}),
              startedAt: current[resumed.profileId]?.startedAt ?? process.startedAt,
              ...(process.finishedAt ? { finishedAt: process.finishedAt } : {}),
              ...(process.status !== "running" && process.exitCode !== 0 && !process.stopRequested
                ? { error: `Processo encerrado com código ${process.exitCode ?? -1}.` }
                : {}),
            },
          }));
          if (process.status !== "running") break;
          await new Promise((resolve) => window.setTimeout(resolve, 200));
          const delta = await readHostProcessOutput(resumed.processId, cursor);
          cursor = delta.cursor;
          processOutput = appendExecutionOutput(
            processOutput,
            delta.chunks.map((chunk) => chunk.text),
            { truncated: delta.truncated },
          );
          process = {
            ...process,
            status: delta.status,
            stopRequested: delta.stopRequested,
            ...(delta.exitCode === undefined ? {} : { exitCode: delta.exitCode }),
            ...(delta.signal === undefined ? {} : { signal: delta.signal }),
            ...(delta.finishedAt === undefined ? {} : { finishedAt: delta.finishedAt }),
            durationMs: delta.durationMs,
            outputStartCursor: delta.startCursor,
            outputEndCursor: delta.endCursor,
            outputTruncated: delta.truncated,
          };
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (!cancelled) {
          setResumedProfileProcesses((current) => current.filter((item) => item.processId !== resumed.processId));
        }
      }
    };
    for (const resumed of resumedProfileProcesses) void monitor(resumed);
    return () => {
      cancelled = true;
    };
  }, [resumedProfileProcesses]);

  useEffect(() => {
    if (!resumedProcessId) return;
    let cancelled = false;
    const monitor = async () => {
      try {
        let process = await readHostProcess(resumedProcessId);
        while (!cancelled) {
          setOutput([...hostProcessOutputLines(process)]);
          if (process.status !== "running") break;
          await new Promise((resolve) => window.setTimeout(resolve, 250));
          process = await readHostProcess(resumedProcessId);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (!cancelled) {
          setBusy(false);
          setActiveProcessId((current) => current === resumedProcessId ? undefined : current);
          setResumedProcessId((current) => current === resumedProcessId ? undefined : current);
        }
      }
    };
    void monitor();
    return () => {
      cancelled = true;
    };
  }, [resumedProcessId]);

  useEffect(() => {
    if (!restorationComplete) return;
    writeSession({
      sidebarView,
      sidebarVisible,
      sidebarWidth: verticalPanelWidths.left,
      leftVerticalPanelWidth: verticalPanelWidths.left,
      rightVerticalPanelWidth: verticalPanelWidths.right,
      panelVisible,
      panelHeight,
      panelTab,
      problemsVisible,
      problemsWidth: verticalPanelWidths.right,
      toolWindowVisible,
      toolWindowHeight,
      ...(activeToolWindowId ? { activeToolWindowId } : {}),
      workspaceName,
      ...(workspaceRoot ? { workspaceRoot } : {}),
      ...(activeDocumentId ? { activeDocumentId } : {}),
      expandedDirectories: [...expanded],
      explorerShowHidden,
      explorerShowIgnored,
      activityButtonPlacements,
      sidebarViewsBySide,
    });
  }, [restorationComplete, sidebarView, sidebarVisible, sidebarViewsBySide, verticalPanelWidths, panelVisible, panelHeight, panelTab, problemsVisible, toolWindowVisible, toolWindowHeight, activeToolWindowId, workspaceName, workspaceRoot, activeDocumentId, expanded, explorerShowHidden, explorerShowIgnored, activityButtonPlacements]);

  useEffect(() => {
    if (!restoredRef.current) return;
    if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current);
    snapshotTimerRef.current = setTimeout(() => {
      void writeReactSnapshot({
        workspaceName,
        ...(workspaceRoot ? { workspaceRoot } : {}),
        workspaceEntries: entries,
        documents,
        documentFolds,
        diagnostics,
        output,
      });
    }, 180);
    return () => {
      if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current);
    };
  }, [workspaceName, workspaceRoot, workspaceHandle, entries, documents, documentFolds, diagnostics, output]);

  useEffect(() => {
    if (!platformSnapshot.initialized || !restorationComplete) return;
    if (!workspaceRoot) {
      setEnvironments([]);
      setSelectedEnvironmentId(undefined);
      setExecutableOptions([]);
      setProfileTargetKinds([]);
      return;
    }
    void loadEnvironments().then((loaded) => {
      setEnvironments(loaded);
      const configured = workspaceSettingsRef.current.environment?.selectedId;
      const nextSelected = configured && loaded.some((environment) => environment.id === configured)
        ? configured
        : loaded[0]?.id;
      setSelectedEnvironmentId(nextSelected);
      if (workspaceRoot && nextSelected !== configured) {
        const nextSettings: WorkspaceSettings = {
          ...workspaceSettingsRef.current,
          environment: nextSelected ? { selectedId: nextSelected } : {},
        };
        replaceWorkspaceSettings(nextSettings);
        void writeWorkspaceSettings(workspaceRoot, nextSettings)
          .then(replaceWorkspaceSettings)
          .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
      }
    });
    void loadProfileContributions({
      workspaceName,
      workspaceRoot,
      ...(activeDocument ? { activeDocument } : {}),
    }).then((contributions) => {
      setExecutableOptions(contributions.executableOptions);
      setProfilePresets(contributions.presets);
      setProfileTargetKinds(contributions.targetKinds);
    });
  }, [platformSnapshot.plugins, platformSnapshot.initialized, restorationComplete, workspaceName, workspaceRoot, activeDocument?.id, replaceWorkspaceSettings]);

  const updateProfiles = (profiles: readonly ExecutionProfile[], selectedId?: string) => {
    const next = { profiles, ...(selectedId ? { selectedId } : {}) };
    setProfilesState(next);
    void updateWorkspaceSettings((current) => ({
      ...current,
      executionProfiles: next,
    })).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  };
  updateProfilesRef.current = updateProfiles;

  const resetProjectDependentState = () => {
    setDocuments([]);
    setActiveDocumentId(undefined);
    setDiagnostics([]);
    setHoveredDiagnosticLine(undefined);
    setEditorLineDecorations([]);
    setSelectedEditorLineDecoration(undefined);
    setResourceDecorations(new Map());
    setOutput([]);
    setExpanded(new Set());
    setExplorerRevealedHiddenPaths(new Set());
    setSelectedExplorerPath(undefined);
    setSelectedExplorerPaths(new Set());
    setHighlightedExplorerPath(undefined);
    setExplorerHistory(createExplorerHistoryState());
    setEnvironmentForm(undefined);
    setEditingEnvironmentId(undefined);
    setPackageManagerEnvironmentId(undefined);
    setEnvironmentPath("");
    setProfileExecutions({});
    setResumedProfileProcesses([]);
    setOpenProfileTabIds([]);
    setClosingProfileTabIds(new Set());
    setActiveProcessId(undefined);
    setResumedProcessId(undefined);
    setDebugSession(undefined);
    setDebugAdapter(undefined);
    setDebugCommandPending(undefined);
    setDebugBreakpoints([]);
    documentFoldsRef.current = new Map();
    setDocumentFolds(new Map());
    setPanelVisible(false);
    setToolWindowVisible(false);
    setActiveToolWindowId(undefined);
    // Tool windows retidos carregam estado vivo do workspace anterior (xterm,
    // sessões remotas); a troca de projeto exige remontagem do zero.
    setMountedToolWindowIds(new Set());
    profileRunCancellationRef.current.clear();
    profileRunPromiseRef.current.clear();
    debugCommandPromiseRef.current = undefined;
    debugRestartPromiseRef.current = undefined;
  };

  const activateProject = async (handle: BrowserDirectoryHandle, knownRoot?: string): Promise<boolean> => {
    const dirtyDocuments = documentsRef.current.filter((document) => document.content !== document.savedContent);
    if (dirtyDocuments.length && !window.confirm(
      `${dirtyDocuments.length === 1 ? "Há um arquivo não salvo" : `Há ${dirtyDocuments.length} arquivos não salvos`}. Abrir outro projeto na tela atual descartará essas alterações. Continuar?`,
    )) return false;
    const rootEntries = await listDirectory(handle);
    const workspaceRootHint = knownRoot ?? await workspaceRootHintForHandle(handle);
    const hostWorkspace = await setHostWorkspace(handle.name, workspaceRootHint);
    const localSettings = await loadLocalWorkspaceSettings(handle.name, hostWorkspace.workspaceRoot);
    const activeHandle = isDesktopHost()
      ? handle
      : runtimeWorkspaceHandle(handle.name, hostWorkspace.workspaceRoot);
    resetProjectDependentState();
    setWorkspaceHandle(activeHandle);
    setWorkspaceName(handle.name);
    setWorkspaceRoot(hostWorkspace.workspaceRoot);
    const projectSession = await restorePersistedWorkspaceUi(hostWorkspace.workspaceRoot, activeHandle, rootEntries);
    setWorkspaceAccess("ready");
    await refreshEnvironments(
      localSettings.environment?.selectedId ?? projectSession.selectedEnvironmentId,
      hostWorkspace.workspaceRoot,
    );
    await rememberRecentProject({
      handle: activeHandle,
      path: hostWorkspace.workspaceRoot,
      kind: classifyOpenedDirectory(rootEntries),
    });
    setRecentProjects(await readRecentProjects());
    return true;
  };

  const persistProjectOpenChoice = async (
    target: Exclude<ProjectOpenTarget, "ask"> = projectOpenTarget,
  ) => {
    if (rememberProjectOpenTarget) await writeProjectOpenPreference(target);
  };

  const openProjectInTarget = async (
    handle: BrowserDirectoryHandle,
    recentProject?: RecentProject,
    reservedBrowserTab?: Window | null,
    target: Exclude<ProjectOpenTarget, "ask"> = projectOpenTarget,
  ) => {
    const rootEntries = recentProject ? undefined : await listDirectory(handle);
    const root = recentProject?.path ?? await workspaceRootHintForHandle(handle);
    const remembered = recentProject ?? await rememberRecentProject({
      handle,
      ...(root ? { path: root } : {}),
      kind: classifyOpenedDirectory(rootEntries ?? []),
    });
    await persistProjectOpenChoice(target);
    if (target === "current") {
      if (await activateProject(handle, root)) setProjectOpenDialog(false);
      return;
    }
    const sessionId = createProjectSessionId();
    if (isDesktopHost()) {
      if (!root) throw new Error("O app empacotado exige o caminho local do projeto.");
      await openDesktopProjectWindow(root, sessionId);
    } else {
      const opened = reservedBrowserTab ?? window.open("about:blank", "_blank");
      if (!opened) throw new Error("O navegador bloqueou a abertura da nova aba.");
      opened.opener = null;
      opened.location.href = projectWindowUrl({ sessionId, pendingProjectId: remembered.id });
    }
    setRecentProjects(await readRecentProjects());
    setProjectOpenDialog(false);
  };

  const chooseProjectDirectory = async () => {
    const reservedBrowserTab = projectOpenTarget === "new" && !isDesktopHost()
      ? window.open("about:blank", "_blank")
      : undefined;
    setProjectOpenBusy(true);
    try {
      const handle = await pickWorkspaceDirectory();
      await openProjectInTarget(handle, undefined, reservedBrowserTab);
    } catch (cause) {
      reservedBrowserTab?.close();
      throw cause;
    } finally {
      setProjectOpenBusy(false);
    }
  };

  const openRecentProject = async (
    project: RecentProject,
    target: Exclude<ProjectOpenTarget, "ask"> = projectOpenTarget,
  ) => {
    const reservedBrowserTab = target === "new" && !isDesktopHost()
      ? window.open("about:blank", "_blank")
      : undefined;
    setProjectOpenBusy(true);
    try {
      if (target === "new") {
        await persistProjectOpenChoice(target);
        const sessionId = createProjectSessionId();
        if (isDesktopHost()) {
          if (!project.path) throw new Error("O caminho deste projeto recente não está mais disponível.");
          await openDesktopProjectWindow(project.path, sessionId);
        } else {
          if (!reservedBrowserTab) throw new Error("O navegador bloqueou a abertura da nova aba.");
          reservedBrowserTab.opener = null;
          reservedBrowserTab.location.href = projectWindowUrl({ sessionId, pendingProjectId: project.id });
        }
        setProjectOpenDialog(false);
        return;
      }
      const dirtyDocuments = documentsRef.current.filter((document) => document.content !== document.savedContent);
      if (dirtyDocuments.length && !window.confirm(
        `${dirtyDocuments.length === 1 ? "Há um arquivo não salvo" : `Há ${dirtyDocuments.length} arquivos não salvos`}. Abrir outro projeto na tela atual descartará essas alterações. Continuar?`,
      )) return;
      const hostWorkspace = await setHostWorkspace(project.name, project.path);
      const handle = isDesktopHost()
        ? await restoreDesktopWorkspaceHandle(hostWorkspace.workspaceRoot)
        : runtimeWorkspaceHandle(project.name, hostWorkspace.workspaceRoot);
      if (!handle) throw new Error("O projeto recente não está mais disponível ou perdeu permissão de acesso.");
      // O descarte de alterações já foi confirmado antes de trocar o contexto
      // do runtime. Evita deixar plugins apontando para outro projeto se o
      // usuário cancelar a troca.
      resetProjectDependentState();
      const rootEntries = await listDirectory(handle);
      const localSettings = await loadLocalWorkspaceSettings(project.name, hostWorkspace.workspaceRoot);
      setWorkspaceHandle(handle);
      setWorkspaceName(project.name);
      setWorkspaceRoot(hostWorkspace.workspaceRoot);
      const projectSession = await restorePersistedWorkspaceUi(hostWorkspace.workspaceRoot, handle, rootEntries);
      setWorkspaceAccess("ready");
      await refreshEnvironments(
        localSettings.environment?.selectedId ?? projectSession.selectedEnvironmentId,
        hostWorkspace.workspaceRoot,
      );
      await rememberRecentProject({
        handle,
        path: hostWorkspace.workspaceRoot,
        kind: classifyOpenedDirectory(rootEntries),
      });
      setRecentProjects(await readRecentProjects());
      await persistProjectOpenChoice(target);
      setProjectOpenDialog(false);
    } catch (cause) {
      reservedBrowserTab?.close();
      throw cause;
    } finally {
      setProjectOpenBusy(false);
    }
  };

  const loadProjectOpeningState = async () => {
    const [recent, preference] = await Promise.all([
      readRecentProjects(),
      readProjectOpenPreference(),
    ]);
    setRecentProjects(recent);
    setProjectOpenTarget(preference === "new" ? "new" : "current");
    setRememberProjectOpenTarget(preference !== "ask");
  };

  const openProjectDialog = async () => {
    await loadProjectOpeningState();
    setProjectOpenDialog(true);
  };

  const openRecentProjectFromMenu = async (project: RecentProject) => {
    const preference = await readProjectOpenPreference();
    const target = preference === "new" ? "new" : "current";
    setProjectOpenTarget(target);
    setRememberProjectOpenTarget(preference !== "ask");
    await openRecentProject(project, target);
  };

  const reconnectWorkspace = async () => {
    if (!workspaceHandle) throw new Error("Nenhum workspace anterior disponível para reconexão.");
    try {
      const permission = await workspaceHandle.requestPermission?.({ mode: "readwrite" });
      if (permission !== undefined && permission !== "granted") {
        throw new Error("Acesso ao workspace não foi concedido.");
      }
      const rootEntries = await listDirectory(workspaceHandle);
      const hostWorkspace = await setHostWorkspace(workspaceHandle.name, workspaceRoot);
      const localSettings = await loadLocalWorkspaceSettings(workspaceHandle.name, hostWorkspace.workspaceRoot);
      setEntries(await hydrateExpandedEntries(rootEntries, expanded));
      setWorkspaceName(workspaceHandle.name);
      setWorkspaceRoot(hostWorkspace.workspaceRoot);
      setWorkspaceAccess("ready");
      await refreshEnvironments(localSettings.environment?.selectedId, hostWorkspace.workspaceRoot);
    } catch (cause) {
      if (!isBrowserFileSystemAccessDenied(cause)) throw cause;
      setWorkspaceAccess("missing");
      throw browserFileSystemAccessError();
    }
  };

  const openSingleFile = async () => {
    if (!window.showOpenFilePicker) throw new Error("Este navegador não oferece seleção de arquivos.");
    const [handle] = await window.showOpenFilePicker();
    if (!handle) return;
    const document = await readFileDocument(handle);
    setDocuments((current) => current.some((item) => item.id === document.id) ? current : [...current, document]);
    setActiveDocumentId(document.id);
  };

  const presentOpenedDocument = (document: OpenDocument) => {
    setDocuments((current) => {
      const index = current.findIndex((item) => item.id === document.id);
      return index === -1
        ? [...current, document]
        : current.map((item) => item.id === document.id ? document : item);
    });
    setActiveDocumentId(document.id);
  };

  const openExternalFilesFromDataTransfer = async (dataTransfer: DataTransfer) => {
    const getAbsolutePath = isDesktopHost()
      ? (file: File) => {
          try {
            return window.tinyideDesktop?.getPathForFile(file) || undefined;
          } catch {
            return undefined;
          }
        }
      : undefined;
    const candidates = await collectExternalFileCandidates(dataTransfer, getAbsolutePath);
    if (!candidates.length) return;
    let lastId: string | undefined;
    for (const candidate of candidates) {
      const document = await openDocumentFromExternalFile(candidate);
      presentOpenedDocument(document);
      lastId = document.id;
    }
    if (lastId) setActiveDocumentId(lastId);
  };

  const handleExternalFileDragOver = (event: React.DragEvent) => {
    if (!dataTransferHasExternalFiles(event.dataTransfer)) return;
    // Evita conflitar com reordenação de abas e arrasto interno do explorer.
    if (draggingDocumentId || draggingExplorerPaths.size) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (!externalFileDropActive) setExternalFileDropActive(true);
  };

  const handleExternalFileDragLeave = (event: React.DragEvent<HTMLElement>) => {
    if (!externalFileDropActive) return;
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    setExternalFileDropActive(false);
  };

  const handleExternalFileDrop = (event: React.DragEvent) => {
    if (!dataTransferHasExternalFiles(event.dataTransfer)) return;
    if (draggingDocumentId || draggingExplorerPaths.size) return;
    event.preventDefault();
    event.stopPropagation();
    setExternalFileDropActive(false);
    void invoke(() => openExternalFilesFromDataTransfer(event.dataTransfer));
  };

  /**
   * Documentos fornecidos por plugins: não existem no disco, então não têm handle nem
   * caminho, nunca são salvos e a renderização fica a cargo do provider de editor que
   * aceitar o `mediaType`.
   */
  const openVirtualDocument = async (request: WorkbenchVirtualDocumentRequest): Promise<string> => {
    const existing = documentsRef.current.find((item) => item.id === virtualDocumentId(request.key));
    const document = createVirtualDocument(request, existing);
    setDocuments((current) => upsertDocument(current, document));
    if (request.focus !== false) setActiveDocumentId(document.id);
    return document.id;
  };

  const updateVirtualDocument = async (
    id: string,
    changes: Partial<Pick<WorkbenchVirtualDocumentRequest, "name" | "content">>,
  ): Promise<void> => {
    setDocuments((current) => current.map((document) => document.id === id
      ? applyVirtualDocumentChanges(document, changes)
      : document));
  };

  const openWorkspaceFilePath = async (path: string, fileHandle?: BrowserFileHandle) => {
    let document: OpenDocument;
    try {
      const handle = workspaceHandle
        ? await resolveFileHandle(workspaceHandle, path)
        : fileHandle;
      if (!handle) throw new Error("Restaure o acesso ao workspace antes de abrir este arquivo.");
      document = await readFileDocument(handle, path, workspaceRoot);
    } catch (cause) {
      if (!isBrowserFileSystemAccessDenied(cause)) throw cause;
      setWorkspaceAccess("permission-required");
      throw browserFileSystemAccessError();
    }
    setDocuments((current) => {
      const index = current.findIndex((item) => item.id === document.id);
      return index === -1 ? [...current, document] : current.map((item) => item.id === document.id ? document : item);
    });
    setActiveDocumentId(document.id);
    return document;
  };

  const openEntry = async (entry: WorkspaceEntry) => {
    if (entry.kind !== "file") return;
    await openWorkspaceFilePath(
      entry.path,
      entry.handle?.kind === "file" ? entry.handle : undefined,
    );
  };

  const revealEditorLocation = (
    line: number,
    selectionStart?: number,
    selectionEnd?: number,
  ) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const scrollContainer = highlightedEditorScrollRef.current ?? editorRef.current;
      if (!scrollContainer) return;
      scrollContainer.scrollTop = editorScrollTopForLine(line);
      syncEditorLineRuler(scrollContainer.scrollTop);
      if (selectionStart !== undefined) {
        editorRef.current?.focus({ preventScroll: true });
        editorRef.current?.setSelectionRange(selectionStart, selectionEnd ?? selectionStart);
        // setSelectionRange pode disparar o autoscroll nativo do textarea (invisível, mas é ele
        // quem posiciona o caret) dentro do seu próprio viewport interno, deixando o caret fora
        // da linha visível no overlay de sintaxe; realinhar com o container corrige isso.
        if (editorRef.current) {
          editorRef.current.scrollTop = scrollContainer.scrollTop;
          editorRef.current.scrollLeft = scrollContainer.scrollLeft;
        }
      }
    }));
  };

  const scrollEditorToLine = (line: number) => revealEditorLocation(line);

  const selectEditorSearchMatch = (requestedIndex: number) => {
    if (!activeDocument || activeDocument.kind !== "text" || !editorSearchMatches.length) return;
    const index = ((requestedIndex % editorSearchMatches.length) + editorSearchMatches.length) % editorSearchMatches.length;
    const match = editorSearchMatches[index];
    if (!match) return;
    setEditorSearchMatchIndex(index);
    setDocuments((current) => current.map((document) => document.id === activeDocument.id
      ? { ...document, selectionStart: match.start, selectionEnd: match.end }
      : document));
    // Um match dentro de um bloco dobrado não tem posição visível: sem abrir a dobra o realce e a
    // seleção projetada colapsam no marcador e a rolagem cai na linha errada.
    const matchFileLine = textPositionAtOffset(activeEditorContent, match.start).line;
    const projection = revealFoldsForFileLine(activeDocument.id, matchFileLine);
    scrollEditorToLine(foldSearchVisibleLine(projection, matchFileLine));
    window.requestAnimationFrame(() => {
      editorRef.current?.setSelectionRange(match.start, match.end);
      editorSearchInputRef.current?.focus({ preventScroll: true });
    });
  };

  const goToEditorLine = (requestedLine: number) => {
    if (!activeDocument || activeDocument.kind !== "text") return;
    const line = Math.min(Math.max(1, Math.trunc(requestedLine)), editorMetrics.lineCount);
    const offset = textOffsetAtPosition(activeEditorContent, { line, column: 1 });
    setDocuments((current) => current.map((document) => document.id === activeDocument.id
      ? { ...document, selectionStart: offset, selectionEnd: offset }
      : document));
    const projection = revealFoldsForFileLine(activeDocument.id, line);
    scrollEditorToLine(foldSearchVisibleLine(projection, line));
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const scrollContainer = highlightedEditorScrollRef.current ?? editorRef.current;
      editorRef.current?.focus({ preventScroll: true });
      editorRef.current?.setSelectionRange(offset, offset);
      if (editorRef.current && scrollContainer) {
        editorRef.current.scrollTop = scrollContainer.scrollTop;
        editorRef.current.scrollLeft = scrollContainer.scrollLeft;
      }
    }));
  };

  const openWorkspaceResource = async (request: WorkbenchWorkspaceResourceOpenRequest) => {
    const path = request.path.split("/").filter(Boolean).join("/");
    if (!path) throw new Error("Informe o caminho do recurso a ser aberto.");
    const opened = documentsRef.current.find((document) => document.path === path);
    let targetDocument = opened;
    if (opened) {
      setActiveDocumentId(opened.id);
    } else {
      targetDocument = await openWorkspaceFilePath(path);
    }
    if (request.reveal) {
      const nextExpanded = new Set([...expanded, ...explorerAncestorDirectoryPaths(path)]);
      if (workspacePathContainsHiddenSegment(path)) setExplorerShowHidden(true);
      setExpanded(nextExpanded);
      setEntries(await hydrateExplorerPath(entries, path));
      setSelectedExplorerPath(path);
    }
    if (request.line && request.line > 0) {
      const targetLine = request.line;
      if (targetDocument?.kind === "text" && request.column && request.column > 0) {
        const selectionStart = textOffsetAtPosition(targetDocument.content, {
          line: request.line,
          column: request.column,
        });
        const selectionEnd = request.endLine && request.endColumn
          ? textOffsetAtPosition(targetDocument.content, {
              line: request.endLine,
              column: request.endColumn,
            })
          : selectionStart;
        setDocuments((current) => current.map((document) => document.id === targetDocument.id
          ? {
              ...document,
              selectionStart,
              selectionEnd,
              scrollTop: editorScrollTopForLine(targetLine),
            }
          : document));
        revealEditorLocation(targetLine, selectionStart, selectionEnd);
      } else {
        scrollEditorToLine(targetLine);
      }
    }
  };

  useEffect(() => {
    openWorkspaceResourceRef.current = openWorkspaceResource;
    virtualDocumentRef.current = {
      open: openVirtualDocument,
      update: updateVirtualDocument,
      close: async (id: string) => { closeDocument(id); },
    };
  });

  const revealDebugLocation = async (path: string | undefined, line: number | undefined) => {
    const relativePath = workspaceRelativeDebugPath(path, workspaceRoot);
    if (!relativePath) return;
    await openWorkspaceResourceRef.current({
      path: relativePath,
      ...(line && line > 0 ? { line } : {}),
      reveal: true,
    });
  };

  useEffect(() => {
    if (!activeDebugPath || !activeDebugLine || debugSession?.status !== "paused") return;
    let cancelled = false;
    void (async () => {
      await openWorkspaceResourceRef.current({
        path: activeDebugPath,
        line: activeDebugLine,
        reveal: true,
      });
      if (cancelled) return;
      const visibleDebugLine = activeFoldProjection?.visibleLineByFileLine[activeDebugLine - 1] ?? activeDebugLine;
      const targetScrollTop = editorScrollTopForLine(visibleDebugLine);
      window.requestAnimationFrame(() => {
        const scrollContainer = highlightedEditorScrollRef.current ?? editorRef.current;
        if (!scrollContainer) return;
        scrollContainer.scrollTop = targetScrollTop;
        const actualScrollTop = scrollContainer.scrollTop;
        syncEditorLineRuler(actualScrollTop);
        setDocuments((current) => current.map((document) => document.path === activeDebugPath
          ? { ...document, scrollTop: actualScrollTop }
          : document));
      });
    })().catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
    return () => { cancelled = true; };
  }, [activeDebugPath, activeDebugLine, activeFoldProjection, debugSession?.status, editorLayoutMetrics]);

  const resourceContext = (entry: WorkspaceEntry): ResourceContext => {
    const document = entry.kind === "file"
      ? documents.find((candidate) => candidate.path === entry.path)
      : undefined;
    return {
      kind: entry.kind,
      name: entry.name,
      path: entry.path,
      ...(document ? { documentId: document.id } : {}),
      ...(workspaceName !== "Sem workspace" ? { workspaceName } : {}),
      ...(workspaceRoot ? { workspaceRoot } : {}),
      ...(document?.kind === "text" ? { isDirty: document.content !== document.savedContent } : {}),
    };
  };

  const rootResourceContext = (): ResourceContext => ({
    kind: "directory",
    name: workspaceName,
    path: "",
    ...(workspaceName !== "Sem workspace" ? { workspaceName } : {}),
    ...(workspaceRoot ? { workspaceRoot } : {}),
  });

  const openRootMenu = async (x: number, y: number) => {
    if (!workspaceHandle) return;
    const fileCreationOptions = await resolveWorkspaceFileCreationOptions("");
    const baseItems: ResourceContextMenuItem[] = [
      ...newFileContextMenuItems(fileCreationOptions),
      {
        id: "core.newDirectory",
        label: "Nova pasta",
        command: "core.resource.newDirectory",
        group: "creation",
        order: 10,
        icon: "folder",
      },
      {
        id: "core.root.copyAbsolutePath",
        label: "Copiar caminho absoluto",
        command: "core.root.copyAbsolutePath",
        group: "clipboard",
        order: 100,
        icon: "copy",
        enabled: Boolean(workspaceAbsolutePath(workspaceRoot)),
      },
      ...(explorerClipboard || supportsSystemResourceClipboard() ? [{
        id: "core.root.paste",
        label: supportsSystemResourceClipboard() ? "Colar" : explorerPasteLabel(explorerClipboard!),
        command: "core.root.paste",
        group: "clipboard",
        order: 120,
        icon: "plus" as const,
      }] : []),
      ...(workspaceRoot ? [{
        id: "core.root.openInFileManager",
        label: "Abrir no gerenciador de arquivos",
        command: "core.root.openInFileManager",
        group: "navigation",
        order: 10,
        icon: "folder" as const,
      }] : []),
    ];
    const resource = rootResourceContext();
    const providers = platform.capabilities.getAll<ResourceContextMenuProvider>("resource.contextMenu");
    const contributed = (await Promise.all(providers.map((provider) => provider.provideItems(resource)))).flat();
    const items = [...baseItems, ...contributed]
      .filter((item) => item.enabled !== false)
      .sort((left, right) => (left.group === "creation" ? 0 : 100)
        - (right.group === "creation" ? 0 : 100)
        || (left.order ?? 0) - (right.order ?? 0));
    setContextMenu({ target: { kind: "root" }, x, y, items });
  };

  const openResourceMenu = async (entry: WorkspaceEntry, x: number, y: number) => {
    const selectedEntries = topLevelWorkspacePaths(
      selectedExplorerPaths.has(entry.path) ? selectedExplorerPaths : [entry.path],
    ).map((path) => findWorkspaceEntry(entries, path)).filter((candidate): candidate is WorkspaceEntry => Boolean(candidate));
    const isBulkSelection = selectedEntries.length > 1;
    const fileCreationOptions = entry.kind === "directory"
      ? await resolveWorkspaceFileCreationOptions(entry.path)
      : [];
    const baseItems: ResourceContextMenuItem[] = [
      {
        id: "core.open",
        label: entry.kind === "file" ? "Abrir" : expanded.has(entry.path) ? "Recolher" : "Expandir",
        command: "core.resource.open",
        group: "navigation",
        order: 0,
        icon: entry.kind === "file" ? "file" as const : "folder" as const,
      },
      ...(workspaceRoot ? [{
        id: "core.openInFileManager",
        label: "Abrir no gerenciador de arquivos",
        command: "core.resource.openInFileManager",
        group: "navigation",
        order: 10,
        icon: "folder" as const,
      }] : []),
      ...(entry.kind === "directory" ? [
        ...newFileContextMenuItems(fileCreationOptions),
        {
          id: "core.newDirectory",
          label: "Nova pasta",
          command: "core.resource.newDirectory",
          group: "creation",
          order: 10,
          icon: "folder" as const,
        },
      ] : []),
      ...(!isBulkSelection ? [{
        id: "core.rename",
        label: "Renomear",
        command: "core.resource.rename",
        group: "file",
        order: 0,
        icon: entry.kind === "directory" ? "folder" as const : "file" as const,
      }] : []),
      ...(!isBulkSelection ? [{
        id: "core.copyPath",
        label: "Copiar caminho",
        command: "core.resource.copyPath",
        group: "clipboard",
        order: 100,
        icon: "copy" as const,
      }] : []),
      ...[{
        id: "core.copyEntry",
        label: isBulkSelection
          ? `Copiar ${selectedEntries.length} itens`
          : entry.kind === "directory" ? "Copiar pasta" : "Copiar arquivo",
        command: "core.resource.copyEntry",
        group: "clipboard",
        order: 90,
        icon: "copy" as const,
      }],
      ...(!isBulkSelection ? [{
        id: "core.copyAbsolutePath",
        label: "Copiar caminho absoluto",
        command: "core.resource.copyAbsolutePath",
        group: "clipboard",
        order: 110,
        icon: "copy" as const,
        enabled: Boolean(workspaceAbsolutePath(workspaceRoot, entry.path)),
      }] : []),
      ...(!isBulkSelection && (explorerClipboard || supportsSystemResourceClipboard()) ? [{
        id: "core.resource.paste",
        label: supportsSystemResourceClipboard() ? "Colar" : explorerPasteLabel(explorerClipboard!),
        command: "core.resource.paste",
        group: "clipboard",
        order: 120,
        icon: "plus" as const,
      }] : []),
      {
        id: "core.delete",
        label: isBulkSelection
          ? `Excluir ${selectedEntries.length} itens`
          : entry.kind === "directory" ? "Excluir pasta" : "Excluir arquivo",
        command: "core.resource.delete",
        group: "destructive",
        order: 1000,
        icon: "close" as const,
      },
    ];
    const resource = resourceContext(entry);
    const providers = platform.capabilities.getAll<ResourceContextMenuProvider>("resource.contextMenu");
    const contributed = (await Promise.all(providers.map((provider) => provider.provideItems(resource)))).flat();
    const groupOrder = new Map([
      ["navigation", 0],
      ["creation", 50],
      ["file", 100],
      ["execution", 100],
      ["clipboard", 200],
      ["git", 250],
      ["destructive", 300],
    ]);
    const items = [...baseItems, ...contributed]
      .filter((item) => item.enabled !== false)
      .sort((left, right) => (groupOrder.get(left.group ?? "") ?? 1000) - (groupOrder.get(right.group ?? "") ?? 1000)
        || (left.order ?? 0) - (right.order ?? 0));
    setContextMenu({ target: { kind: "entry", entry }, x, y, items });
  };

  const documentResourceContext = (document: OpenDocument): ResourceContext => ({
    kind: "file",
    name: document.name,
    path: document.path ?? document.name,
    documentId: document.id,
    ...(workspaceName !== "Sem workspace" ? { workspaceName } : {}),
    ...(workspaceRoot ? { workspaceRoot } : {}),
    ...(document.kind === "text" ? { isDirty: document.content !== document.savedContent } : {}),
  });

  const openDocumentMenu = async (document: OpenDocument, x: number, y: number) => {
    const documentIndex = documents.findIndex((candidate) => candidate.id === document.id);
    const baseItems: ResourceContextMenuItem[] = [
      {
        id: "core.tab.activate",
        label: "Ativar aba",
        command: "core.tab.activate",
        group: "navigation",
        order: 0,
        icon: "file",
        enabled: activeDocumentId !== document.id,
      },
      {
        id: "core.tab.save",
        label: "Salvar",
        command: "core.tab.save",
        group: "file",
        order: 0,
        icon: "save",
        enabled: document.kind === "text" && document.content !== document.savedContent,
      },
      {
        id: "core.tab.close",
        label: "Fechar",
        command: "core.tab.close",
        group: "close",
        order: 0,
        icon: "close",
      },
      {
        id: "core.tab.closeOthers",
        label: "Fechar outras abas",
        command: "core.tab.closeOthers",
        group: "close",
        order: 10,
        icon: "close",
        enabled: documents.length > 1,
      },
      {
        id: "core.tab.closeRight",
        label: "Fechar abas à direita",
        command: "core.tab.closeRight",
        group: "close",
        order: 20,
        icon: "close",
        enabled: documentIndex >= 0 && documentIndex < documents.length - 1,
      },
      {
        id: "core.tab.copyPath",
        label: "Copiar caminho",
        command: "core.tab.copyPath",
        group: "clipboard",
        order: 0,
        icon: "copy",
        enabled: Boolean(document.path),
      },
    ];
    const resource = documentResourceContext(document);
    const providers = platform.capabilities.getAll<ResourceContextMenuProvider>("resource.contextMenu");
    const contributed = (await Promise.all(providers.map((provider) => provider.provideItems(resource)))).flat();
    const groupOrder = new Map([
      ["navigation", 0],
      ["file", 50],
      ["execution", 100],
      ["close", 150],
      ["clipboard", 200],
      ["git", 250],
    ]);
    const items = [...baseItems, ...contributed]
      .filter((item) => item.enabled !== false)
      .sort((left, right) => (groupOrder.get(left.group ?? "") ?? 1000) - (groupOrder.get(right.group ?? "") ?? 1000)
        || (left.order ?? 0) - (right.order ?? 0));
    setContextMenu({ target: { kind: "document", document }, x, y, items });
  };

  const openEditorMenu = async (
    document: OpenDocument,
    textarea: HTMLTextAreaElement,
    x: number,
    y: number,
    preparedSelection?: { selectionStart: number; selectionEnd: number },
  ) => {
    const selectionStart = preparedSelection?.selectionStart ?? textarea.selectionStart;
    const selectionEnd = preparedSelection?.selectionEnd ?? textarea.selectionEnd;
    const beforeCursor = textarea.value.slice(0, selectionStart);
    const lineStart = beforeCursor.lastIndexOf("\n") + 1;
    const environmentExecutable = languageEnvironmentExecutable(languageProviderFor(document));
    const context: TextEditorContextMenuContext = {
      document: {
        ...editorToolbarDocumentSnapshot(document),
        content: textarea.value,
      },
      selectionStart,
      selectionEnd,
      ...(environmentExecutable ? { environmentExecutable } : {}),
      line: beforeCursor.split("\n").length,
      column: selectionStart - lineStart + 1,
    };
    const providers = platform.capabilities.getAll<TextEditorContextMenuProvider>("textEditor.contextMenu");
    const copyItems: ResourceContextMenuItem[] = selectionEnd > selectionStart ? [{
      id: "core.editor.copySelection",
      label: "Copiar",
      command: "core.editor.copySelection",
      group: "clipboard",
      icon: "copy",
      order: -100,
    }] : [];
    const contributed = (await Promise.all(providers.map(async (provider) => {
      try {
        return await provider.provideItems(context);
      } catch (cause) {
        console.warn(`Falha ao obter itens do menu de contexto do editor pelo provider '${provider.id}'.`, cause);
        return [];
      }
    }))).flat();
    const items = [...copyItems, ...contributed]
      .filter((item) => item.enabled !== false)
      .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
    if (items.length) setContextMenu({ target: { kind: "editor", context }, x, y, items });
  };

  const captureEditorLocation = (
    document: OpenDocument,
    textarea: HTMLTextAreaElement,
  ): EditorLocation => {
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const start = textPositionAtOffset(textarea.value, selectionStart);
    const end = textPositionAtOffset(textarea.value, selectionEnd);
    const scrollContainer = highlightedEditorScrollRef.current ?? textarea;
    return {
      documentId: document.id,
      ...(document.path ? { path: document.path } : {}),
      line: start.line,
      column: start.column,
      endLine: end.line,
      endColumn: end.column,
      selectionStart,
      selectionEnd,
      scrollTop: scrollContainer.scrollTop,
      scrollLeft: scrollContainer.scrollLeft,
    };
  };

  const updateEditorLocationHistory = (history: EditorLocationHistory) => {
    editorLocationHistoryRef.current = history;
    setEditorLocationHistory(history);
  };

  const restoreEditorLocation = async (location: EditorLocation): Promise<boolean> => {
    const opened = documentsRef.current.find((document) => document.id === location.documentId);
    if (!opened && !location.path) {
      setError("A origem da navegação não está mais aberta.");
      return false;
    }
    if (!opened && location.path) {
      await openWorkspaceResourceRef.current({
        path: location.path,
        line: location.line,
        column: location.column,
        endLine: location.endLine,
        endColumn: location.endColumn,
      });
    } else {
      setActiveDocumentId(location.documentId);
    }
    setDocuments((current) => current.map((document) => (
      document.id === location.documentId || (!opened && document.path === location.path)
        ? {
            ...document,
            selectionStart: location.selectionStart,
            selectionEnd: location.selectionEnd,
            scrollTop: location.scrollTop,
            scrollLeft: location.scrollLeft,
          }
        : document
    )));
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const textarea = editorRef.current;
      const scrollContainer = highlightedEditorScrollRef.current ?? textarea;
      if (!textarea || !scrollContainer) return;
      scrollContainer.scrollTop = location.scrollTop;
      scrollContainer.scrollLeft = location.scrollLeft;
      syncEditorLineRuler(scrollContainer.scrollTop);
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(location.selectionStart, location.selectionEnd);
    }));
    return true;
  };

  const navigateEditorLocationHistory = async (direction: "back" | "forward") => {
    const document = documentsRef.current.find((candidate) => candidate.id === activeDocumentId);
    const textarea = editorRef.current;
    if (!document || document.kind !== "text" || !textarea) return;
    const current = captureEditorLocation(document, textarea);
    const navigation = direction === "back"
      ? navigateEditorLocationBack(editorLocationHistoryRef.current, current)
      : navigateEditorLocationForward(editorLocationHistoryRef.current, current);
    if (!navigation.location) return;
    if (await restoreEditorLocation(navigation.location)) {
      updateEditorLocationHistory(navigation.history);
    }
  };

  const handleEditorAuxiliaryNavigation = (event: React.MouseEvent<HTMLTextAreaElement>) => {
    if (event.button !== 3 && event.button !== 4) return;
    event.preventDefault();
    void navigateEditorLocationHistory(event.button === 3 ? "back" : "forward");
  };

  const navigateFromEditor = async (
    document: OpenDocument,
    textarea: HTMLTextAreaElement,
    kind: "definition" | "declaration" | "implementation" = "definition",
  ) => {
    if (document.kind !== "text" || !document.path || editorNavigationLoadingRef.current) return;
    const offset = textarea.selectionStart;
    const origin = captureEditorLocation(document, textarea);
    const providers = platform.capabilities.getAll<TextEditorNavigationProvider>("textEditor.navigation");
    if (!providers.length) {
      setError("Nenhum provider de navegação está ativo para este arquivo.");
      return;
    }
    editorNavigationLoadingRef.current = true;
    let loadingVisibleAt: number | undefined;
    const loadingTimer = window.setTimeout(() => {
      loadingVisibleAt = window.performance.now();
      setEditorNavigationLoading(true);
    }, EDITOR_NAVIGATION_LOADING_DELAY_MS);
    try {
      const environmentExecutable = environments.find(
        (environment) => environment.id === selectedEnvironmentId,
      )?.executable;
      const context = {
        document: {
          ...editorToolbarDocumentSnapshot(document),
          content: textarea.value,
        },
        position: textPositionAtOffset(textarea.value, offset),
        offset,
        kind,
        ...(environmentExecutable ? { environmentExecutable } : {}),
      } as const;
      const target = await resolveTextEditorNavigation(providers, context);
      if (!target) {
        setError("Nenhuma definição foi encontrada para o símbolo selecionado.");
        return;
      }
      if (target.source) {
        const selectionStart = textOffsetAtPosition(target.source.content, target.range.start);
        const selectionEnd = textOffsetAtPosition(target.source.content, target.range.end);
        const id = `navigation:${target.source.origin}`;
        const sourceDocument: OpenDocument = {
          id,
          name: target.source.name,
          kind: "text",
          mediaType: target.source.mediaType ?? "text/plain",
          size: target.source.content.length,
          content: target.source.content,
          savedContent: target.source.content,
          selectionStart,
          selectionEnd,
          scrollTop: editorScrollTopForLine(target.range.start.line),
          scrollLeft: 0,
          readOnly: true,
          origin: target.source.origin,
        };
        setDocuments((current) => current.some((candidate) => candidate.id === id)
          ? current.map((candidate) => candidate.id === id ? sourceDocument : candidate)
          : [...current, sourceDocument]);
        setActiveDocumentId(id);
        revealEditorLocation(target.range.start.line, selectionStart, selectionEnd);
        updateEditorLocationHistory(recordEditorLocation(editorLocationHistoryRef.current, origin));
        return;
      }
      if (!target.path) {
        setError("O provider não informou a origem da implementação.");
        return;
      }
      await openWorkspaceResourceRef.current({
        path: target.path,
        line: target.range.start.line,
        column: target.range.start.column,
        endLine: target.range.end.line,
        endColumn: target.range.end.column,
      });
      updateEditorLocationHistory(recordEditorLocation(editorLocationHistoryRef.current, origin));
    } finally {
      window.clearTimeout(loadingTimer);
      if (loadingVisibleAt !== undefined) {
        const remaining = EDITOR_NAVIGATION_LOADING_MINIMUM_MS - (window.performance.now() - loadingVisibleAt);
        if (remaining > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, remaining));
        }
      }
      editorNavigationLoadingRef.current = false;
      setEditorNavigationLoading(false);
    }
  };

  const toggleEntry = async (entry: WorkspaceEntry) => {
    if (entry.kind !== "directory") return;
    if (expanded.has(entry.path)) {
      setExpanded((current) => {
        const next = new Set(current);
        next.delete(entry.path);
        return next;
      });
      return;
    }

    const handle = entry.handle?.kind === "directory"
      ? entry.handle
      : workspaceHandle
        ? await resolveDirectoryHandle(workspaceHandle, entry.path)
        : undefined;
    if (!handle) throw new Error("Restaure o acesso ao workspace antes de expandir esta pasta.");
    const children = await listDirectory(handle, entry.path);
    const replaceChildren = (items: readonly WorkspaceEntry[]): readonly WorkspaceEntry[] => items.map((item) => {
      if (item.path === entry.path) return { ...item, handle, children };
      return item.children ? { ...item, children: replaceChildren(item.children) } : item;
    });
    setEntries((current) => replaceChildren(current));
    setExpanded((current) => new Set(current).add(entry.path));
  };

  const updateDocument = (textarea: HTMLTextAreaElement) => {
    if (!activeDocumentId) return;
    const previous = documents.find((document) => document.id === activeDocumentId);
    if (!previous || previous.kind !== "text" || previous.readOnly) return;
    const content = textarea.value;
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const currentFolds = documentFoldsRef.current.get(activeDocumentId) ?? [];
    if (currentFolds.length) {
      const remapped = remapDocumentFoldsAfterEdit(previous.content, content, currentFolds);
      const nextFolds = new Map(documentFoldsRef.current);
      if (remapped.length) nextFolds.set(activeDocumentId, remapped);
      else nextFolds.delete(activeDocumentId);
      documentFoldsRef.current = nextFolds;
      setDocumentFolds(nextFolds);
    }
    setDocuments((current) => current.map((document) => {
      if (document.id !== activeDocumentId) return document;
      const history = editorHistoriesRef.current.get(document.id)
        ?? createEditorHistory({
          content: document.content,
          selectionStart: document.selectionStart,
          selectionEnd: document.selectionEnd,
        });
      editorHistoriesRef.current.set(document.id, recordEditorHistory(history, {
        content,
        selectionStart,
        selectionEnd,
      }));
      return {
        ...document,
        content,
        selectionStart,
        selectionEnd,
      };
    }));
    const changedEvent: TextEditorDocumentChangedEvent = {
      document: {
        id: previous.id,
        name: previous.name,
        ...(previous.path ? { path: previous.path } : {}),
        ...(previous.workspaceRoot ? { workspaceRoot: previous.workspaceRoot } : {}),
        content,
      },
      previousContent: previous.content,
      reason: "edit",
      isDirty: content !== previous.savedContent,
    };
    void platform.events.emit(TEXT_EDITOR_DOCUMENT_CHANGED_EVENT, changedEvent);
    setDiagnostics([]);
  };

  const dismissCompletions = () => {
    completionAbortRef.current?.abort();
    completionAbortRef.current = undefined;
    if (completionTimerRef.current !== undefined) {
      window.clearTimeout(completionTimerRef.current);
      completionTimerRef.current = undefined;
    }
    setCompletionSession(undefined);
  };

  const requestCompletions = (
    document: OpenDocument | undefined,
    textarea: HTMLTextAreaElement,
    options: { readonly immediate?: boolean; readonly triggerCharacter?: string } = {},
  ) => {
    if (completionTimerRef.current !== undefined) {
      window.clearTimeout(completionTimerRef.current);
      completionTimerRef.current = undefined;
    }
    if (!document || document.kind !== "text" || document.readOnly) {
      dismissCompletions();
      return;
    }
    completionAbortRef.current?.abort();
    const controller = new AbortController();
    completionAbortRef.current = controller;
    const providers = platform.capabilities.getAll<TextEditorCompletionProvider>("textEditor.completion");
    const environmentExecutable = environments.find((environment) => environment.id === selectedEnvironmentId)?.executable;
    void buildCompletionSession(textarea, {
      providers,
      documentSnapshot: {
        ...editorToolbarDocumentSnapshot(document),
        content: textarea.value,
      },
      ...(environmentExecutable ? { environmentExecutable } : {}),
      signal: controller.signal,
      maxItems: 40,
    }, {
      minPrefix: options.immediate ? 0 : 3,
      ...(options.triggerCharacter ? { triggerCharacter: options.triggerCharacter } : {}),
    }).then((session) => {
      if (controller.signal.aborted) return;
      if (completionAbortRef.current === controller) completionAbortRef.current = undefined;
      const currentTextarea = editorRef.current;
      if (!session || !currentTextarea || document.id !== activeDocumentIdRef.current) {
        setCompletionSession(undefined);
        return;
      }
      const refined = refineCompletionSession(currentTextarea, session);
      setCompletionSession(refined);
      if (!refined && shouldAutoRequestCompletion(currentTextarea, 3)) {
        const currentDocument = documentsRef.current.find((candidate) => candidate.id === activeDocumentIdRef.current);
        if (currentDocument) scheduleCompletionRequest(currentDocument, currentTextarea);
      }
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (completionAbortRef.current === controller) completionAbortRef.current = undefined;
      console.warn("Falha ao obter autocomplete do editor.", error);
      setCompletionSession(undefined);
    });
  };

  const scheduleCompletionRequest = (
    document: OpenDocument | undefined,
    textarea: HTMLTextAreaElement,
    options: { readonly immediate?: boolean; readonly triggerCharacter?: string } = {},
  ) => {
    if (completionTimerRef.current !== undefined) window.clearTimeout(completionTimerRef.current);
    if (!options.immediate && !options.triggerCharacter && !shouldAutoRequestCompletion(textarea, 3)) {
      completionTimerRef.current = undefined;
      return;
    }
    if (!options.immediate && completionAbortRef.current) return;
    const delay = options.immediate ? 0 : 450;
    completionTimerRef.current = window.setTimeout(() => {
      completionTimerRef.current = undefined;
      requestCompletions(document, textarea, options);
    }, delay);
  };

  const handleEditorChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget;
    updateDocument(textarea);
    if (completionSession) {
      const refined = refineCompletionSession(textarea, completionSession);
      if (refined) {
        setCompletionSession(refined);
        return;
      }
      setCompletionSession(undefined);
    }
    scheduleCompletionRequest(activeDocument, textarea);
  };

  const commitCompletion = (textarea: HTMLTextAreaElement, index = completionSession?.selectedIndex ?? 0) => {
    if (!completionSession) return false;
    const item = completionSession.items[index];
    if (!item) return false;
    const result = applyCompletionItem(textarea, completionSession, item);
    textarea.value = result.content;
    textarea.setSelectionRange(result.caret, result.caret);
    updateDocument(textarea);
    dismissCompletions();
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(result.caret, result.caret);
    });
    return true;
  };

  const applyEditorSearchReplacement = (content: string, selectionStart: number, selectionEnd: number) => {
    const textarea = editorRef.current;
    if (!textarea) return;
    textarea.value = content;
    textarea.setSelectionRange(selectionStart, selectionEnd);
    updateDocument(textarea);
    setEditorSearchMatchIndex(0);
    window.requestAnimationFrame(() => editorSearchInputRef.current?.focus({ preventScroll: true }));
  };

  const replaceCurrentEditorSearchMatch = () => {
    if (!activeDocument || activeDocument.kind !== "text" || !activeEditorSearchMatch) return;
    const nextContent = replaceTextMatch(activeEditorContent, activeEditorSearchMatch, editorSearchReplacement);
    const selectionStart = activeEditorSearchMatch.start;
    applyEditorSearchReplacement(nextContent, selectionStart, selectionStart + editorSearchReplacement.length);
  };

  const replaceAllEditorSearchMatches = () => {
    if (!activeDocument || activeDocument.kind !== "text" || !editorSearchMatches.length) return;
    const nextContent = replaceTextMatches(activeEditorContent, editorSearchMatches, editorSearchReplacement);
    applyEditorSearchReplacement(nextContent, 0, 0);
  };

  const navigateEditorHistory = (
    direction: "undo" | "redo",
    textarea: HTMLTextAreaElement,
  ) => {
    if (!activeDocumentId) return;
    const document = documents.find((candidate) => candidate.id === activeDocumentId);
    if (!document) return;
    const history = editorHistoriesRef.current.get(document.id)
      ?? createEditorHistory({
        content: document.content,
        selectionStart: document.selectionStart,
        selectionEnd: document.selectionEnd,
      });
    const navigation = direction === "undo"
      ? undoEditorHistory(history)
      : redoEditorHistory(history);
    editorHistoriesRef.current.set(document.id, navigation.history);
    if (!navigation.snapshot) return;

    const { snapshot } = navigation;
    const content = snapshot.content;
    setDocuments((current) => current.map((candidate) => candidate.id === document.id
      ? {
          ...candidate,
          content,
          selectionStart: snapshot.selectionStart,
          selectionEnd: snapshot.selectionEnd,
        }
      : candidate));
    const changedEvent: TextEditorDocumentChangedEvent = {
      document: {
        id: document.id,
        name: document.name,
        ...(document.path ? { path: document.path } : {}),
        ...(document.workspaceRoot ? { workspaceRoot: document.workspaceRoot } : {}),
        content,
      },
      previousContent: document.content,
      reason: direction,
      isDirty: content !== document.savedContent,
    };
    void platform.events.emit(TEXT_EDITOR_DOCUMENT_CHANGED_EVENT, changedEvent);
    setDiagnostics([]);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
    });
  };

  const handleEditorKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    event.currentTarget.classList.toggle("is-navigation-modifier", event.ctrlKey || event.metaKey);
    if (completionSession && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (event.key === "Escape") {
        event.preventDefault();
        dismissCompletions();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        setCompletionSession((current) => current
          ? {
              ...current,
              selectedIndex: (current.selectedIndex + direction + current.items.length) % current.items.length,
            }
          : current);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        commitCompletion(event.currentTarget);
        return;
      }
    }
    if (event.ctrlKey && !event.metaKey && !event.altKey && event.key === " ") {
      event.preventDefault();
      requestCompletions(activeDocument, event.currentTarget, { immediate: true });
      return;
    }
    if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key === ".") {
      const textarea = event.currentTarget;
      window.requestAnimationFrame(() => requestCompletions(activeDocument, textarea, {
        immediate: true,
        triggerCharacter: ".",
      }));
    }
    if (event.altKey && !event.ctrlKey && !event.metaKey
      && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      void navigateEditorLocationHistory(event.key === "ArrowLeft" ? "back" : "forward");
      return;
    }
    if (event.key === "Tab" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const textarea = event.currentTarget;
      const result = applyEditorTab(
        textarea.value,
        textarea.selectionStart,
        textarea.selectionEnd,
        event.shiftKey,
      );
      if (result.content === textarea.value
        && result.selectionStart === textarea.selectionStart
        && result.selectionEnd === textarea.selectionEnd) return;
      textarea.value = result.content;
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
      updateDocument(textarea);
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
      });
      return;
    }
    if (event.key === "F12") {
      if (!activeDocument) return;
      event.preventDefault();
      invoke(() => navigateFromEditor(activeDocument, event.currentTarget));
      return;
    }
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLocaleLowerCase();
    if (key === "f" && !event.shiftKey && !event.altKey) {
      const { value, selectionStart, selectionEnd } = event.currentTarget;
      if (openEditorSearch(value.slice(selectionStart, selectionEnd))) event.preventDefault();
      return;
    }
    if (key === "h" && !event.shiftKey && !event.altKey) {
      if (openEditorReplace()) event.preventDefault();
      return;
    }
    if (key === "g" && !event.shiftKey && !event.altKey) {
      if (openGoToLine()) event.preventDefault();
      return;
    }
    const undo = key === "z" && !event.shiftKey;
    const redo = (key === "z" && event.shiftKey) || key === "y";
    if (!undo && !redo) return;
    event.preventDefault();
    navigateEditorHistory(undo ? "undo" : "redo", event.currentTarget);
  };

  const flushEditorStateCapture = (capture: {
    documentId: string;
    selectionStart: number;
    selectionEnd: number;
    scrollTop: number;
    scrollLeft: number;
  }) => {
    setDocuments((current) => current.map((document) => document.id === capture.documentId
      ? {
          ...document,
          selectionStart: capture.selectionStart,
          selectionEnd: capture.selectionEnd,
          scrollTop: capture.scrollTop,
          scrollLeft: capture.scrollLeft,
        }
      : document));
  };

  const captureEditorState = (
    textarea: HTMLTextAreaElement,
    scrollContainer: HTMLElement = textarea,
  ) => {
    if (!activeDocumentId) return;
    const pending = editorStateCaptureRef.current;
    if (pending) {
      window.clearTimeout(pending.timer);
      editorStateCaptureRef.current = undefined;
    }
    flushEditorStateCapture({
      documentId: activeDocumentId,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
      scrollTop: scrollContainer.scrollTop,
      scrollLeft: scrollContainer.scrollLeft,
    });
  };

  /**
   * Rolagem e arrasto de seleção emitem eventos a cada frame; gravá-los imediatamente em
   * `documents` re-renderiza o App e re-dispara efeitos por documento (ex.: toolbar de plugins)
   * a cada tique. A captura fica coalescida e sempre grava no documento dono do evento, mesmo
   * que a aba ativa mude antes do flush.
   */
  const scheduleEditorStateCapture = (
    textarea: HTMLTextAreaElement,
    scrollContainer: HTMLElement = textarea,
  ) => {
    if (!activeDocumentId) return;
    const pending = editorStateCaptureRef.current;
    const samePendingDocument = pending?.documentId === activeDocumentId ? pending : undefined;
    if (pending && !samePendingDocument) {
      window.clearTimeout(pending.timer);
      flushEditorStateCapture(pending);
    }
    // Debounce de verdade: enquanto a rolagem/seleção continua, nenhum flush acontece — um flush
    // grava em `documents` e re-renderiza o App inteiro, o que competiria com a própria rolagem.
    if (samePendingDocument) window.clearTimeout(samePendingDocument.timer);
    editorStateCaptureRef.current = {
      documentId: activeDocumentId,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
      scrollTop: scrollContainer.scrollTop,
      scrollLeft: scrollContainer.scrollLeft,
      timer: window.setTimeout(() => {
        const capture = editorStateCaptureRef.current;
        editorStateCaptureRef.current = undefined;
        if (capture) flushEditorStateCapture(capture);
      }, EDITOR_STATE_CAPTURE_DELAY_MS),
    };
  };

  const applyEditorViewport = (scrollTop: number, height: number) => {
    editorViewportStore.set(scrollTop, height);
    setEditorViewport((current) => (
      current.scrollTop === scrollTop && current.height === height
        ? current
        : { scrollTop, height }
    ));
  };

  const syncEditorViewportOnScroll = (element: HTMLElement) => {
    // Régua e janela de sintaxe acompanham via store, no próprio evento, sem render do App.
    editorViewportStore.set(element.scrollTop, element.clientHeight);
    const sync = editorViewportSyncRef.current;
    if (sync.trailingTimer !== undefined) window.clearTimeout(sync.trailingTimer);
    // Estado React do App só assenta quando a rolagem para (fold preview, toggles de fold).
    // A captura pendente é descarregada no mesmo tique: os dois setState caem no mesmo task e
    // viram um único render do App — em arquivos grandes cada render custa dezenas de ms.
    sync.trailingTimer = window.setTimeout(() => {
      sync.trailingTimer = undefined;
      const capture = editorStateCaptureRef.current;
      if (capture) {
        window.clearTimeout(capture.timer);
        editorStateCaptureRef.current = undefined;
        flushEditorStateCapture(capture);
      }
      applyEditorViewport(element.scrollTop, element.clientHeight);
    }, EDITOR_VIEWPORT_TRAILING_DELAY_MS);
  };

  const prepareEditorContextMenu = (
    textarea: HTMLTextAreaElement,
    clientX: number,
    clientY: number,
    scrollContainer: HTMLElement = textarea,
  ) => {
    moveCollapsedEditorSelectionToPointer(
      textarea,
      clientX,
      clientY,
      scrollContainer,
      scrollContainer === textarea ? undefined : syntaxLayerRef.current ?? undefined,
      activeFoldProjection,
    );
    captureEditorState(textarea, scrollContainer);
    return {
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    };
  };

  const correctFoldedEditorPointerSelection = (event: React.MouseEvent<HTMLTextAreaElement>) => {
    if (!activeFoldProjection || event.button !== 0 || event.shiftKey) return;
    const textarea = event.currentTarget;
    // Preserve native drag selections. A plain click remains collapsed and can
    // be remapped from the projected (folded) visual line to the real file.
    if (textarea.selectionStart !== textarea.selectionEnd) return;
    const scrollContainer = highlightedEditorScrollRef.current ?? textarea;
    const offset = moveCollapsedEditorSelectionToPointer(
      textarea,
      event.clientX,
      event.clientY,
      scrollContainer,
      syntaxLayerRef.current ?? undefined,
      activeFoldProjection,
    );
    captureEditorState(textarea, scrollContainer);
  };

  const selectFoldedEditorWordAtPointer = (event: React.MouseEvent<HTMLTextAreaElement>) => {
    if (!activeFoldProjection || event.button !== 0) return;
    const textarea = event.currentTarget;
    const mirror = syntaxLayerRef.current;
    const scrollContainer = highlightedEditorScrollRef.current ?? textarea;
    if (!mirror) return;
    const projectedOffset = editorMirrorTextOffsetAtClientPoint(
      textarea,
      mirror,
      event.clientX,
      event.clientY,
    );
    if (projectedOffset === undefined) return;
    event.preventDefault();
    const sourceOffset = editorSourceOffsetFromProjectedOffset(
      textarea.value,
      activeFoldProjection,
      projectedOffset,
    );
    const word = editorWordRangeAtOffset(textarea.value, sourceOffset);
    textarea.setSelectionRange(word.start, word.end);
    captureEditorState(textarea, scrollContainer);
  };

  const syncEditorLineRuler = (scrollTop: number) => {
    editorDebugCurrentLineRef.current?.style.setProperty("--editor-scroll-top", `${scrollTop}px`);
    editorBreakpointLinesRef.current?.style.setProperty("--editor-scroll-top", `${scrollTop}px`);
    editorFoldOverlayRef.current?.style.setProperty("--editor-scroll-top", `${scrollTop}px`);
    if (!editorLineRulerRef.current) return;
    const rulerViewport = editorLineRulerRef.current.parentElement;
    if (!rulerViewport) return;
    rulerViewport.scrollTop = scrollTop;
  };

  useEffect(() => {
    const textarea = editorRef.current;
    if (!textarea || !activeDocument) return;
    requestAnimationFrame(() => {
      textarea.setSelectionRange(activeDocument.selectionStart, activeDocument.selectionEnd);
      const scrollContainer = highlightedEditorScrollRef.current ?? textarea;
      scrollContainer.scrollTop = activeDocument.scrollTop;
      scrollContainer.scrollLeft = activeDocument.scrollLeft;
      applyEditorViewport(activeDocument.scrollTop, scrollContainer.clientHeight);
      syncEditorLineRuler(activeDocument.scrollTop);
    });
  }, [activeDocumentId, editorSettings.lineNumbers, editorSearchOpen, activeResourceEditorProvider?.id]);

  const downloadDocument = (openDocument: OpenDocument) => {
    const url = URL.createObjectURL(new Blob([openDocument.content], { type: "text/plain;charset=utf-8" }));
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = openDocument.name;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const saveOpenDocument = async (document: OpenDocument, forceSaveAs = false) => {
    if (document.kind !== "text") {
      throw new Error("Este recurso não é um documento de texto editável.");
    }
    if (document.readOnly) throw new Error("Este documento de origem é somente leitura.");
    let handle = forceSaveAs ? undefined : document.handle;
    if (!handle) {
      if (!window.showSaveFilePicker) {
        downloadDocument(document);
        return document;
      }
      handle = await window.showSaveFilePicker({ suggestedName: document.name });
    }
    const saved = await writeFileDocument(document, handle);
    const nextDocuments = documentsRef.current.map((item) => item.id === document.id ? saved : item);
    documentsRef.current = nextDocuments;
    setDocuments(nextDocuments);
    const savedEvent: TextEditorDocumentSavedEvent = {
      document: {
        id: saved.id,
        name: saved.name,
        ...(saved.path ? { path: saved.path } : {}),
        ...(saved.workspaceRoot ? { workspaceRoot: saved.workspaceRoot } : {}),
        content: saved.content,
      },
    };
    await platform.events.emit(TEXT_EDITOR_DOCUMENT_SAVED_EVENT, savedEvent);
    return saved;
  };

  const saveDocument = async (forceSaveAs = false) => {
    if (!activeDocument) return;
    await saveOpenDocument(activeDocument, forceSaveAs);
    setExternalDocumentNotices((current) => {
      if (!current.has(activeDocument.id)) return current;
      const next = new Map(current);
      next.delete(activeDocument.id);
      return next;
    });
  };

  /** O aviso "reloaded" só expira depois de visível: os 60s contam com o arquivo ativo, não da detecção. */
  useEffect(() => {
    if (!activeDocument || activeExternalDocumentNotice?.kind !== "reloaded") return;
    const documentId = activeDocument.id;
    const timer = window.setTimeout(() => {
      setExternalDocumentNotices((current) => {
        if (current.get(documentId) !== activeExternalDocumentNotice) return current;
        const next = new Map(current);
        next.delete(documentId);
        return next;
      });
    }, 60_000);
    return () => window.clearTimeout(timer);
  }, [activeDocument?.id, activeExternalDocumentNotice]);

  const dismissExternalDocumentNotice = (documentId: string) => {
    setExternalDocumentNotices((current) => {
      if (!current.has(documentId)) return current;
      const next = new Map(current);
      next.delete(documentId);
      return next;
    });
  };

  const reloadExternalDocument = (documentId: string) => {
    const document = documentsRef.current.find((candidate) => candidate.id === documentId);
    if (!document || document.kind !== "text") return;
    const nextDocuments = documentsRef.current.map((candidate) => candidate.id === documentId
      ? {
          ...candidate,
          content: candidate.savedContent,
          selectionStart: Math.min(candidate.selectionStart, candidate.savedContent.length),
          selectionEnd: Math.min(candidate.selectionEnd, candidate.savedContent.length),
        }
      : candidate);
    documentsRef.current = nextDocuments;
    setDocuments(nextDocuments);
    editorHistoriesRef.current.delete(documentId);
    clearDocumentFolds(documentId);
    dismissExternalDocumentNotice(documentId);
  };

  const newDocument = (option: Pick<WorkspaceFileCreationOption, "extension"> = TEXT_FILE_CREATION_OPTION) => {
    const name = nextUntitledFileName(documents.map((document) => document.name), option.extension);
    const document: OpenDocument = {
      id: `untitled:${crypto.randomUUID()}`,
      name,
      kind: "text",
      mediaType: "text/plain",
      size: 0,
      content: "",
      savedContent: "",
      selectionStart: 0,
      selectionEnd: 0,
      scrollTop: 0,
      scrollLeft: 0,
    };
    setDocuments((current) => [...current, document]);
    setActiveDocumentId(document.id);
  };

  const refreshExplorer = async (expandedPaths: ReadonlySet<string> = expanded) => {
    if (!workspaceHandle) return;
    const nextEntries = await listDirectory(workspaceHandle);
    setEntries(await hydrateExpandedEntries(nextEntries, expandedPaths));
  };

  const updateExplorerHistory = (next: ExplorerHistoryState) => {
    explorerHistoryRef.current = next;
    setExplorerHistory(next);
  };

  const remapExplorerResourceState = async (sourcePath: string, nextPath: string) => {
    const sourceDocuments = documentsRef.current;
    const nextDocuments = await Promise.all(sourceDocuments.map(async (document) => {
      if (!workspacePathBelongsToResource(document.path, sourcePath)) return document;
      const path = replaceWorkspacePathPrefix(document.path!, sourcePath, nextPath);
      const handle = await resolveFileHandle(workspaceHandle!, path);
      return remapOpenDocumentResource(document, sourcePath, nextPath, handle);
    }));
    documentsRef.current = nextDocuments;
    setDocuments(nextDocuments);
    setActiveDocumentId((current) => current ? replaceWorkspacePathPrefix(current, sourcePath, nextPath) : current);
    const nextExpanded = new Set([...expanded].map((path) => replaceWorkspacePathPrefix(path, sourcePath, nextPath)));
    const movedHistories = [...editorHistoriesRef.current.entries()]
      .filter(([id]) => id === sourcePath || id.startsWith(`${sourcePath}/`));
    movedHistories.forEach(([id, history]) => {
      editorHistoriesRef.current.delete(id);
      editorHistoriesRef.current.set(replaceWorkspacePathPrefix(id, sourcePath, nextPath), history);
    });
    setSelectedExplorerPath(nextPath);
    setExpanded(nextExpanded);
    await refreshExplorer(nextExpanded);
    await platform.events.emit<WorkspaceResourcesChangedEvent>(
      WORKSPACE_RESOURCES_CHANGED_EVENT,
      {
        source: "core-explorer",
        reason: "workspace",
        operation: "move",
        ...(workspaceRoot ? { workspaceRoot } : {}),
        paths: [sourcePath, nextPath],
        renames: [{ from: sourcePath, to: nextPath }],
      },
    );
  };

  const relocateExplorerEntry = async (sourcePath: string, targetPath: string) => {
    if (!workspaceHandle) throw new Error("Restaure o acesso ao workspace antes de alterar recursos.");
    const sourceParent = workspacePathParent(sourcePath);
    const targetParent = workspacePathParent(targetPath);
    const targetName = targetPath.split("/").at(-1);
    if (!targetName) throw new Error("Destino inválido.");
    let nextPath = sourcePath;
    if (sourceParent !== targetParent) nextPath = await moveWorkspaceEntry(workspaceHandle, sourcePath, targetParent);
    if (nextPath.split("/").at(-1) !== targetName) nextPath = await renameWorkspaceEntry(workspaceHandle, nextPath, targetName);
    await remapExplorerResourceState(sourcePath, nextPath);
    return nextPath;
  };

  const undoExplorerOperation = async () => {
    const transition = beginExplorerUndo(explorerHistoryRef.current);
    if (!transition) return;
    await relocateExplorerEntry(transition.sourcePath, transition.targetPath);
    updateExplorerHistory(transition.state);
  };

  const redoExplorerOperation = async () => {
    const transition = beginExplorerRedo(explorerHistoryRef.current);
    if (!transition) return;
    await relocateExplorerEntry(transition.sourcePath, transition.targetPath);
    updateExplorerHistory(transition.state);
  };

  useEffect(() => {
    if (!workspaceRoot) return;
    const subscribe = window.tinyideDesktop?.subscribeWorkspaceChanges;
    if (!subscribe) return;
    return subscribe((change) => {
      if (change.workspaceRoot !== workspaceRoot) return;
      void platform.events.emit<WorkspaceResourcesChangedEvent>(
        WORKSPACE_RESOURCES_CHANGED_EVENT,
        {
          source: "desktop-workspace-watcher",
          reason: "external",
          workspaceRoot,
          paths: change.paths,
        },
      );
    });
  }, [platform.events, workspaceRoot]);

  useEffect(() => platform.events.on<WorkspaceResourcesChangedEvent>(
    WORKSPACE_RESOURCES_CHANGED_EVENT,
    async (event) => {
      if (!workspaceHandle) return;
      if (event.workspaceRoot && workspaceRoot && event.workspaceRoot !== workspaceRoot) return;
      const detectedAt = Date.now();
      setWorkspaceExternalSync({ status: "checking", affected: event.paths?.length ?? 0 });
      const nextEntries = await listDirectory(workspaceHandle);
      setEntries(await hydrateExpandedEntries(nextEntries, expanded));
      const sourceDocuments = documentsRef.current;
      const reconciliation = await reconcileOpenDocumentsAfterWorkspaceChange({
        documents: sourceDocuments,
        workspaceHandle,
        ...(workspaceRoot ? {workspaceRoot} : {}),
        ...(event.renames?.length ? {renames: event.renames} : {}),
      });
      documentsRef.current = reconciliation.documents;
      setDocuments(reconciliation.documents);
      /** Arquivos alterados/removidos fora da IDE invalidam as dobras registradas para eles. */
      for (const id of reconciliation.removedIds) clearDocumentFolds(id);
      for (const { from } of reconciliation.remappedIds) clearDocumentFolds(from);
      for (const document of reconciliation.documents) {
        const previous = sourceDocuments.find((candidate) => candidate.id === document.id);
        if (previous && previous.content !== document.content) clearDocumentFolds(document.id);
      }
      setExternalDocumentNotices((current) => {
        const next = new Map(current);
        for (const id of reconciliation.removedIds) next.delete(id);
        for (const {from, to} of reconciliation.remappedIds) {
          const notice = next.get(from);
          next.delete(from);
          if (notice) next.set(to, notice);
        }
        for (const change of reconciliation.externalChanges) {
          if (change.kind === "conflict") {
            next.set(change.id, {
              kind: "conflict",
              detectedAt,
            });
          } else {
            next.set(change.id, {
              kind: "reloaded",
              detectedAt,
            });
          }
        }
        return next;
      });

      for (const {from, to} of reconciliation.remappedIds) {
        const history = editorHistoriesRef.current.get(from);
        if (!history) continue;
        editorHistoriesRef.current.delete(from);
        editorHistoriesRef.current.set(to, history);
      }
      for (const id of reconciliation.removedIds) editorHistoriesRef.current.delete(id);

      if (reconciliation.remappedIds.length || reconciliation.removedIds.length) {
        const remapped = new Map(reconciliation.remappedIds.map(({from, to}) => [from, to]));
        const removed = new Set(reconciliation.removedIds);
        setActiveDocumentId((current) => {
          if (!current) return current;
          const next = remapped.get(current);
          if (next) return next;
          if (!removed.has(current)) return current;
          const nearest = nearestRemainingItemId(
            sourceDocuments.map((document) => document.id),
            removed,
            current,
          );
          return nearest ? remapped.get(nearest) ?? nearest : undefined;
        });
      }
      setWorkspaceExternalSync({ status: "applied", affected: reconciliation.externalChanges.length });
      if (workspaceExternalSyncTimerRef.current) clearTimeout(workspaceExternalSyncTimerRef.current);
      workspaceExternalSyncTimerRef.current = setTimeout(() => {
        setWorkspaceExternalSync(undefined);
      }, 5000);
    },
  ).dispose, [platform.events, workspaceHandle, workspaceRoot, expanded]);

  const expandExplorerLevel = async () => {
    if (!workspaceHandle) return;
    const nextExpanded = expandNextExplorerLevel(entries, expanded, explorerShowHidden);
    setExpanded(nextExpanded);
    await refreshExplorer(nextExpanded);
  };

  const collapseExplorerLevel = async () => {
    const nextExpanded = collapseDeepestExplorerLevel(expanded);
    setExpanded(nextExpanded);
    await refreshExplorer(nextExpanded);
  };

  const explorerFilterActive = Boolean(explorerFilterResult);

  useLayoutEffect(() => {
    if (!explorerFilterOpen) return;
    const input = explorerFilterInputRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
  }, [explorerFilterOpen, explorerFilterQuery]);

  useLayoutEffect(() => {
    if (!editorSearchOpen) return;
    const input = editorSearchInputRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    input.select();
  }, [editorSearchOpen]);

  useLayoutEffect(() => {
    if (!editorSearchReplaceOpen) return;
    editorSearchReplaceInputRef.current?.focus({ preventScroll: true });
  }, [editorSearchReplaceOpen]);

  useEffect(() => {
    if (!editorSearchOpen || activeDocument?.kind === "text") return;
    setEditorSearchOpen(false);
    setEditorSearchQuery("");
    setEditorSearchReplaceOpen(false);
    setEditorSearchReplacement("");
  }, [editorSearchOpen, activeDocument?.id, activeDocument?.kind]);

  useEffect(() => {
    if (!editorSearchOpen) return;
    setEditorSearchMatchIndex((current) => Math.min(current, Math.max(0, editorSearchMatches.length - 1)));
  }, [editorSearchOpen, editorSearchMatches.length]);

  useEffect(() => {
    if (!editorSearchOpen || !editorSearchQuery || !editorSearchMatches.length) return;
    selectEditorSearchMatch(0);
  }, [editorSearchOpen, editorSearchQuery, editorSearchCaseSensitive, editorSearchRegex, activeDocument?.id]);

  useEffect(() => {
    if (explorerFilterProvider && workspaceHandle) return;
    setExplorerFilterOpen(false);
    setExplorerFilterQuery("");
  }, [explorerFilterProvider, workspaceHandle]);

  useEffect(() => {
    const subscription = explorerFilterProvider?.subscribe?.(() => {
      setExplorerFilterRevision((current) => current + 1);
    });
    return () => subscription?.dispose();
  }, [explorerFilterProvider]);

  useEffect(() => {
    const subscriptions = explorerIgnoreProviders
      .map((provider) => provider.subscribe?.(() => setExplorerIgnoreRevision((current) => current + 1)))
      .filter((subscription): subscription is { dispose(): void } => Boolean(subscription));
    return () => subscriptions.forEach((subscription) => subscription.dispose());
  }, [explorerIgnoreProviders]);

  useEffect(() => {
    if (!explorerIgnoreProviders.length || workspaceName === "Sem workspace") {
      setExplorerIgnoredPaths(new Set());
      return;
    }
    const collect = (items: readonly WorkspaceEntry[]): readonly string[] => items.flatMap((entry) => [
      entry.path,
      ...(entry.children ? collect(entry.children) : []),
    ]);
    const paths = collect(entries);
    if (!paths.length) {
      setExplorerIgnoredPaths(new Set());
      return;
    }
    const requestedPaths = new Set(paths);
    let cancelled = false;
    void Promise.all(explorerIgnoreProviders.map(async (provider) => {
      try {
        return await provider.ignored({ paths });
      } catch {
        return { paths: [] as readonly string[] };
      }
    })).then((results) => {
      if (cancelled) return;
      setExplorerIgnoredPaths(new Set(results.flatMap((result) => result.paths).filter((path) => requestedPaths.has(path))));
    });
    return () => { cancelled = true; };
  }, [entries, explorerIgnoreProviders, explorerIgnoreRevision, workspaceName, workspaceRoot]);

  useEffect(() => {
    const query = explorerFilterQuery.trim();
    if (!explorerFilterProvider || !query) {
      setExplorerFilterResult(undefined);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void Promise.resolve(explorerFilterProvider.filter({ query })).then((result) => {
        if (cancelled) return;
        const view = explorerFilterView(result.paths);
        setExplorerFilterResult({
          query,
          visiblePaths: view.visiblePaths,
          expandedPaths: view.expandedPaths,
          matchCount: result.paths.length,
          truncated: result.truncated === true,
        });
      }).catch((cause) => {
        if (cancelled) return;
        setExplorerFilterResult({
          query,
          visiblePaths: new Set(),
          expandedPaths: new Set(),
          matchCount: 0,
          truncated: false,
          error: cause instanceof Error ? cause.message : String(cause),
        });
      });
    }, EXPLORER_FILTER_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [explorerFilterQuery, explorerFilterProvider, explorerFilterRevision]);

  useEffect(() => {
    if (!workspaceHandle) return;
    if (!explorerFilterResult) {
      const restored = explorerFilterExpansionBackupRef.current;
      if (!restored) return;
      explorerFilterExpansionBackupRef.current = undefined;
      setExpanded(restored);
      invoke(() => refreshExplorer(restored));
      return;
    }
    const missing = [...explorerFilterResult.expandedPaths].filter((path) => !expanded.has(path));
    if (!missing.length) return;
    explorerFilterExpansionBackupRef.current ??= expanded;
    const nextExpanded = new Set([...expanded, ...missing]);
    setExpanded(nextExpanded);
    invoke(() => refreshExplorer(nextExpanded));
  }, [explorerFilterResult, workspaceHandle, expanded, invoke]);

  useEffect(() => {
    if (explorerFilterProvider && workspaceHandle) return;
    setExplorerFilterQuery("");
  }, [explorerFilterProvider, workspaceHandle]);

  const explorerHiddenEntriesVisible = explorerShowHidden || explorerRevealedHiddenPaths.size > 0;
  const explorerSpecialEntriesVisible = explorerHiddenEntriesVisible
    && (!explorerIgnoreProviders.length || explorerShowIgnored);
  const toggleExplorerSpecialEntries = () => {
    const visible = !explorerSpecialEntriesVisible;
    setExplorerShowHidden(visible);
    setExplorerRevealedHiddenPaths(new Set());
    setExplorerShowIgnored(visible);
  };

  const revealActiveDocumentInExplorer = async () => {
    if (!workspaceHandle || !activeDocument?.path) return;
    const path = activeDocument.path;
    const nextExpanded = new Set([...expanded, ...explorerAncestorDirectoryPaths(path)]);
    if (workspacePathContainsHiddenSegment(path)) setExplorerShowHidden(true);
    setSidebarView("explorer");
    const side = activitySideFor("builtin:explorer");
    setSidebarViewsBySide((current) => ({ ...current, [side]: "explorer" }));
    setSidebarVisible(true);
    setExpanded(nextExpanded);
    await refreshExplorer(nextExpanded);
    setSelectedExplorerPath(path);
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-explorer-path="${CSS.escape(path)}"]`)
        ?.scrollIntoView({ block: "center" });
    });
  };

  const cancelExplorerCreation = () => {
    setExplorerCreation(undefined);
    setExplorerCreationParentPath("");
    setExplorerCreationName("");
    setExplorerCreationExtension(undefined);
    setExplorerCreationError(undefined);
  };

  const startExplorerCreation = async (
    kind: "file" | "directory",
    parentPath?: string,
    option?: Pick<WorkspaceFileCreationOption, "extension" | "suggestedName">,
  ) => {
    const targetPath = parentPath ?? explorerTargetDirectoryPath(entries, selectedExplorerPath);
    setExplorerCreation(kind);
    setExplorerCreationParentPath(targetPath);
    setExplorerCreationName(kind === "file" ? option?.suggestedName ?? "" : "");
    setExplorerCreationExtension(kind === "file" ? option?.extension : undefined);
    setExplorerCreationError(undefined);
    setExplorerRenamePath(undefined);
    setExplorerRenameError(undefined);
    if (targetPath) {
      const nextExpanded = new Set(expanded).add(targetPath);
      setExpanded(nextExpanded);
      await refreshExplorer(nextExpanded);
    }
  };

  const startExplorerRename = (entry: WorkspaceEntry) => {
    setSelectedExplorerPath(entry.path);
    setSelectedExplorerPaths(new Set([entry.path]));
    setExplorerRenamePath(entry.path);
    setExplorerRenameName(entry.name);
    setExplorerRenameError(undefined);
    setExplorerCreation(undefined);
    setExplorerCreationError(undefined);
  };

  const createWorkspaceEntry = async () => {
    setExplorerCreationError(undefined);
    if (!workspaceHandle) {
      setExplorerCreationError("Abra ou reconecte um workspace antes de criar arquivos ou pastas.");
      return;
    }
    let name = explorerCreationName.trim();
    if (!name) {
      setExplorerCreationError("Informe um nome.");
      return;
    }
    if (explorerCreation === "file" && explorerCreationExtension) {
      name = ensureFileCreationExtension(name, explorerCreationExtension);
    }
    if (name.includes("/") || name.includes("\\")) {
      setExplorerCreationError("Use apenas o nome, sem barras ou caminho.");
      return;
    }
    const parentHandle = await resolveDirectoryHandle(workspaceHandle, explorerCreationParentPath);
    const parentEntry = explorerCreationParentPath ? findWorkspaceEntry(entries, explorerCreationParentPath) : undefined;
    const siblings = parentEntry?.children ?? (explorerCreationParentPath ? await listDirectory(parentHandle, explorerCreationParentPath) : entries);
    if (siblings.some((entry) => entry.name === name)) {
      setExplorerCreationError(`Já existe um item chamado “${name}”.`);
      return;
    }

    try {
      if (explorerCreation === "file") {
        const handle = await parentHandle.getFileHandle(name, { create: true });
        const path = joinWorkspacePath(explorerCreationParentPath, name);
        const document = await readFileDocument(handle, path, workspaceRoot);
        setDocuments((current) => current.some((item) => item.id === document.id) ? current : [...current, document]);
        setActiveDocumentId(document.id);
      } else if (explorerCreation === "directory") {
        await parentHandle.getDirectoryHandle(name, { create: true });
      }
    } catch (cause) {
      setExplorerCreationError(cause instanceof Error ? cause.message : String(cause));
      return;
    }

    await refreshExplorer();
    const createdPath = joinWorkspacePath(explorerCreationParentPath, name);
    setHighlightedExplorerPath(createdPath);
    if (explorerHighlightTimerRef.current) clearTimeout(explorerHighlightTimerRef.current);
    explorerHighlightTimerRef.current = setTimeout(() => {
      setHighlightedExplorerPath((current) => current === createdPath ? undefined : current);
    }, 5000);
    cancelExplorerCreation();
  };

  const renameSelectedExplorerEntry = async () => {
    if (!workspaceHandle || !explorerRenamePath) return;
    const entry = findWorkspaceEntry(entries, explorerRenamePath);
    if (!entry) return;
    const name = explorerRenameName.trim();
    setExplorerRenameError(undefined);
    if (!name) {
      setExplorerRenameError("Informe um nome.");
      return;
    }
    if (name.includes("/") || name.includes("\\")) {
      setExplorerRenameError("Use apenas o nome, sem barras ou caminho.");
      return;
    }
    const parentPath = workspacePathParent(entry.path);
    const parent = parentPath ? findWorkspaceEntry(entries, parentPath) : undefined;
    const siblings = parent?.children ?? (parentPath ? await listDirectory(await resolveDirectoryHandle(workspaceHandle, parentPath), parentPath) : entries);
    if (siblings.some((candidate) => candidate.name === name && candidate.path !== entry.path)) {
      setExplorerRenameError(`Já existe um item chamado “${name}”.`);
      return;
    }

    try {
      const nextPath = await renameWorkspaceEntry(workspaceHandle, entry.path, name);
      const sourceDocuments = documentsRef.current;
      const nextDocuments = await Promise.all(sourceDocuments.map(async (document) => {
        if (!workspacePathBelongsToResource(document.path, entry.path)) return document;
        const path = replaceWorkspacePathPrefix(document.path!, entry.path, nextPath);
        const handle = await resolveFileHandle(workspaceHandle, path);
        return remapOpenDocumentResource(document, entry.path, nextPath, handle);
      }));
      documentsRef.current = nextDocuments;
      setDocuments(nextDocuments);
      const currentActiveDocumentId = activeDocumentId;
      const nextActiveDocumentId = currentActiveDocumentId
        ? replaceWorkspacePathPrefix(currentActiveDocumentId, entry.path, nextPath)
        : undefined;
      setActiveDocumentId(nextActiveDocumentId);
      const nextExpanded = new Set([...expanded].map((path) => replaceWorkspacePathPrefix(path, entry.path, nextPath)));
      setExpanded(nextExpanded);
      const movedHistories = [...editorHistoriesRef.current.entries()]
        .filter(([id]) => id === entry.path || id.startsWith(`${entry.path}/`));
      movedHistories.forEach(([id, history]) => {
        editorHistoriesRef.current.delete(id);
        editorHistoriesRef.current.set(replaceWorkspacePathPrefix(id, entry.path, nextPath), history);
      });
      setSelectedExplorerPath(nextPath);
      setExplorerRenamePath(undefined);
      setExplorerRenameName("");
      await refreshExplorer(nextExpanded);
      updateExplorerHistory(recordExplorerHistory(explorerHistoryRef.current, {
        id: crypto.randomUUID(),
        kind: "relocate",
        label: `Renomear ${entry.path} para ${nextPath}`,
        fromPath: entry.path,
        toPath: nextPath,
      }));
    } catch (cause) {
      setExplorerRenameError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const deleteWorkspaceEntry = async (entry: WorkspaceEntry) => {
    if (!workspaceHandle) throw new Error("Restaure o acesso ao workspace antes de excluir recursos.");
    await removeWorkspaceEntry(workspaceHandle, entry.path, entry.kind === "directory");
    const removedPrefix = `${entry.path}/`;
    const sourceDocuments = documentsRef.current;
    const removedIds = sourceDocuments
      .filter((document) => workspacePathBelongsToResource(document.path, entry.path))
      .map((document) => document.id);
    const removedIdSet = new Set(removedIds);
    const nextActiveDocumentId = nearestRemainingItemId(
      sourceDocuments.map((document) => document.id),
      removedIdSet,
      activeDocumentId,
    );
    const nextDocuments = sourceDocuments.filter((document) => !removedIdSet.has(document.id));
    documentsRef.current = nextDocuments;
    setDocuments(nextDocuments);
    if (activeDocumentId && removedIdSet.has(activeDocumentId)) setActiveDocumentId(nextActiveDocumentId);
    removedIds.forEach((id) => editorHistoriesRef.current.delete(id));
    setSelectedExplorerPath(undefined);
    setExpanded((current) => new Set([...current].filter((path) => path !== entry.path && !path.startsWith(removedPrefix))));
    setEntries(await listDirectory(workspaceHandle));
  };

  const deleteExplorerEntries = async (entriesToDelete: readonly WorkspaceEntry[]) => {
    for (const entry of entriesToDelete) await deleteWorkspaceEntry(entry);
    setSelectedExplorerPaths(new Set());
  };

  const moveExplorerEntry = async (sourcePath: string, targetDirectoryPath: string) => {
    if (!workspaceHandle) throw new Error("Restaure o acesso ao workspace antes de mover recursos.");
    const sourceEntry = findWorkspaceEntry(entries, sourcePath);
    const targetIsWorkspaceRoot = targetDirectoryPath === "";
    const targetEntry = targetIsWorkspaceRoot ? undefined : findWorkspaceEntry(entries, targetDirectoryPath);
    if (!sourceEntry || (!targetIsWorkspaceRoot && targetEntry?.kind !== "directory")) return;
    const targetHandle = await resolveDirectoryHandle(workspaceHandle, targetDirectoryPath);
    let targetChildren: readonly WorkspaceEntry[];
    if (targetIsWorkspaceRoot) {
      targetChildren = entries;
    } else {
      targetChildren = targetEntry!.children ?? await listDirectory(targetHandle, targetDirectoryPath);
    }
    if (targetChildren.some((entry) => entry.name === sourceEntry.name)) {
      throw new Error(`Já existe um item chamado “${sourceEntry.name}” em ${targetDirectoryPath}.`);
    }
    const nextPath = await moveWorkspaceEntry(workspaceHandle, sourcePath, targetDirectoryPath);
    const nextExpanded = new Set([...expanded].map((path) => replaceWorkspacePathPrefix(path, sourcePath, nextPath)));
    nextExpanded.add(targetDirectoryPath);
    const sourceDocuments = documentsRef.current;
    const nextDocuments = await Promise.all(sourceDocuments.map(async (document) => {
      if (!workspacePathBelongsToResource(document.path, sourcePath)) return document;
      const path = replaceWorkspacePathPrefix(document.path!, sourcePath, nextPath);
      const handle = await resolveFileHandle(workspaceHandle, path);
      return remapOpenDocumentResource(document, sourcePath, nextPath, handle);
    }));
    const movedHistories = [...editorHistoriesRef.current.entries()]
      .filter(([id]) => id === sourcePath || id.startsWith(`${sourcePath}/`));
    movedHistories.forEach(([id, history]) => {
      editorHistoriesRef.current.delete(id);
      editorHistoriesRef.current.set(replaceWorkspacePathPrefix(id, sourcePath, nextPath), history);
    });
    documentsRef.current = nextDocuments;
    setDocuments(nextDocuments);
    setActiveDocumentId((current) => current ? replaceWorkspacePathPrefix(current, sourcePath, nextPath) : current);
    setSelectedExplorerPath(nextPath);
    setSelectedExplorerPaths(new Set([nextPath]));
    setExpanded(nextExpanded);
    setDraggingExplorerPaths(new Set());
    setDropTargetExplorerPath(undefined);
    await refreshExplorer(nextExpanded);
    updateExplorerHistory(recordExplorerHistory(explorerHistoryRef.current, {
      id: crypto.randomUUID(),
      kind: "relocate",
      label: `Mover ${sourcePath} para ${nextPath}`,
      fromPath: sourcePath,
      toPath: nextPath,
    }));
  };

  const moveExplorerEntries = async (sourcePaths: readonly string[], targetDirectoryPath: string) => {
    const paths = topLevelWorkspacePaths(sourcePaths)
      .filter((path) => path !== targetDirectoryPath && !targetDirectoryPath.startsWith(`${path}/`));
    for (const path of paths) await moveExplorerEntry(path, targetDirectoryPath);
    setSelectedExplorerPaths(new Set());
  };

  const copyExplorerEntries = async (sourceEntries: readonly WorkspaceEntry[]) => {
    const clipboard = topLevelWorkspacePaths(sourceEntries.map((entry) => entry.path))
      .map((path) => sourceEntries.find((entry) => entry.path === path))
      .filter((entry): entry is WorkspaceEntry => Boolean(entry))
      .map(({ path, name, kind }) => ({ path, name, kind }));
    if (clipboard.length === 0) return;
    explorerClipboardRef.current = clipboard;
    setExplorerClipboard(clipboard);
    if (workspaceRoot && supportsSystemResourceClipboard()) {
      await copyWorkspaceResourcesToSystem(workspaceRoot, clipboard.map((entry) => entry.path));
    }
  };

  const pasteExplorerEntries = async (targetDirectoryPath: string) => {
    if (!workspaceHandle) return;
    let nextPaths: readonly string[] = [];
    if (workspaceRoot && supportsSystemResourceClipboard()) {
      const pasted = await pasteSystemResourcesIntoWorkspace(workspaceRoot, targetDirectoryPath);
      nextPaths = pasted.map((entry) => entry.path);
    }
    if (!nextPaths.length) {
      const sources = explorerClipboardRef.current;
      if (!sources?.length) {
        throw new Error("O clipboard do sistema não contém arquivos ou pastas para colar.");
      }
      nextPaths = await copyWorkspaceEntries(
        workspaceHandle,
        topLevelWorkspacePaths(sources.map((source) => source.path)),
        targetDirectoryPath,
      );
    }
    const nextExpanded = new Set(expanded);
    if (targetDirectoryPath) nextExpanded.add(targetDirectoryPath);
    setExpanded(nextExpanded);
    setSelectedExplorerPath(nextPaths.at(-1));
    setSelectedExplorerPaths(new Set(nextPaths));
    await refreshExplorer(nextExpanded);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
        || (target instanceof HTMLElement && target.isContentEditable)) return;
      if (!(target instanceof Element) || !target.closest(".explorer-content")) return;
      const selectedPath = selectedExplorerPath;
      if (event.key.toLocaleLowerCase() === "c") {
        const paths = selectedExplorerPaths.size > 0
          ? topLevelWorkspacePaths(selectedExplorerPaths)
          : selectedPath ? [selectedPath] : [];
        const selectedEntries = paths
          .map((path) => findWorkspaceEntry(entries, path))
          .filter((entry): entry is WorkspaceEntry => Boolean(entry));
        if (selectedEntries.length === 0) return;
        event.preventDefault();
        void copyExplorerEntries(selectedEntries)
          .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
        return;
      }
      if (event.key.toLocaleLowerCase() !== "v"
        || (!explorerClipboardRef.current && !supportsSystemResourceClipboard())) return;
      const selected = selectedPath ? findWorkspaceEntry(entries, selectedPath) : undefined;
      const targetDirectoryPath = selected
        ? selected.kind === "directory" ? selected.path : workspacePathParent(selected.path)
        : "";
      event.preventDefault();
      void pasteExplorerEntries(targetDirectoryPath).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [entries, selectedExplorerPath, selectedExplorerPaths, workspaceHandle, workspaceRoot, expanded]);

  const toggleBreakpoint = (path: string, line: number) => {
    const exists = debugBreakpoints.some((breakpoint) => breakpoint.path === path && breakpoint.line === line);
    const next = exists
      ? debugBreakpoints.filter((breakpoint) => !(breakpoint.path === path && breakpoint.line === line))
      : [...debugBreakpoints, { path, line, enabled: true }];
    setDebugBreakpoints(next);
    void updateWorkspaceSettings((current) => ({ ...current, debugBreakpoints: next }))
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
    if (debugSession && debugAdapter) {
      void debugAdapter.setBreakpoints(debugSession.id, next).then(setDebugSession).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
    }
  };

  const startDebugForProfile = async (profile: ExecutionProfile): Promise<DebugSessionSnapshot> => {
    const adapter = debugAdapterForProfile({
      profile,
      ...(activeDocument ? { activeDocument } : {}),
      environments,
    });
    if (!adapter) throw new Error("O perfil não possui runtime com suporte a debug.");
    if (profile.saveBeforeRun && activeDocument && activeDocument.content !== activeDocument.savedContent) await saveDocument();
    const started = await startDebugProfile({
      profile,
      ...(activeDocument ? { activeDocument } : {}),
      environments,
      breakpoints: debugBreakpoints,
    });
    setDebugAdapter(started.adapter);
    setDebugSession(started.session);
    const tabId = profileExecutionPanelTabId(profile.id, "debug");
    setOpenProfileTabIds((current) => openProfileExecutionTab(current, profile.id, "debug"));
    setPanelHeight((current) => Math.max(current, 420));
    revealExecutionPanel(tabId);
    return started.session;
  };
  debugProfileRef.current = startDebugForProfile;

  const startSelectedDebugProfile = async () => {
    if (!selectedProfile) throw new Error("Selecione um perfil de execução.");
    if (!selectedProfileDebugAdapter) throw new Error("O perfil selecionado não possui runtime com suporte a debug.");
    await startDebugForProfile(selectedProfile);
  };

  const debugCommand = async (command: DebugAdapterCommand) => {
    if (!debugSession || !debugAdapter) throw new Error("Nenhuma sessão de debug ativa.");
    // "stop" e "pause" precisam funcionar mesmo com outro comando em andamento:
    // um continue pode ficar rodando indefinidamente e são eles a saída.
    if (debugCommandPromiseRef.current && !["stop", "pause"].includes(command)) return debugCommandPromiseRef.current;
    const sessionId = debugSession.id;
    const pending = (async () => {
      setDebugCommandPending({ sessionId, command });
      const snapshot = await sendDebugCommand(debugAdapter, sessionId, command);
      setDebugSession(snapshot);
    })();
    debugCommandPromiseRef.current = pending;
    try {
      await pending;
    } finally {
      if (debugCommandPromiseRef.current === pending) debugCommandPromiseRef.current = undefined;
      setDebugCommandPending((current) => current?.sessionId === sessionId ? undefined : current);
    }
  };

  const restartDebugSession = async (profileId: string) => {
    if (debugRestartPromiseRef.current) return debugRestartPromiseRef.current;
    const restart = (async () => {
      const profile = profilesState.profiles.find((candidate) => candidate.id === profileId);
      if (!profile) throw new Error("O perfil desta sessão não está mais disponível.");
      if (!debugSession || !debugAdapter || debugSession.profileId !== profileId) {
        throw new Error("Nenhuma sessão de debug correspondente está disponível para reiniciar.");
      }
      const previousSession = debugSession;
      const previousAdapter = debugAdapter;
      setDebugRestartingProfileId(profileId);
      if (!["stopped", "completed", "failed"].includes(previousSession.status)) {
        const stopped = await sendDebugCommand(previousAdapter, previousSession.id, "stop");
        setDebugSession((current) => current?.id === previousSession.id ? stopped : current);
      }
      if (profile.saveBeforeRun && activeDocument && activeDocument.content !== activeDocument.savedContent) {
        await saveDocument();
      }
      const started = await startDebugProfile({
        profile,
        ...(activeDocument ? { activeDocument } : {}),
        environments,
        breakpoints: debugBreakpoints,
      });
      setDebugAdapter(started.adapter);
      setDebugSession(started.session);
      const tabId = profileExecutionPanelTabId(profile.id, "debug");
      setOpenProfileTabIds((current) => openProfileExecutionTab(current, profile.id, "debug"));
      revealExecutionPanel(tabId);
    })();
    debugRestartPromiseRef.current = restart;
    try {
      await restart;
    } finally {
      if (debugRestartPromiseRef.current === restart) debugRestartPromiseRef.current = undefined;
      setDebugRestartingProfileId((current) => current === profileId ? undefined : current);
    }
  };

  const executeProfile = async (profile: ExecutionProfile, replaceRunning = false) => {
    if (!profile.steps.length) throw new Error("O perfil não possui etapas.");
    if (!replaceRunning && profileExecutionsRef.current[profile.id]?.status === "running") {
      throw new Error(`O perfil '${profile.name}' já está em execução.`);
    }
    if (profile.saveBeforeRun && activeDocument && activeDocument.content !== activeDocument.savedContent) {
      await saveDocument();
    }

    const startedAt = Date.now();
    const cancellation = { cancelled: false };
    profileRunCancellationRef.current.set(profile.id, cancellation);
    setProfileExecutions((current) => ({
      ...current,
      [profile.id]: {
        profileId: profile.id,
        profileName: profile.name,
        profile,
        status: "running",
        output: [],
        startedAt,
      },
    }));
    const tabId = profileExecutionPanelTabId(profile.id, "run");
    setOpenProfileTabIds((current) => openProfileExecutionTab(current, profile.id, "run"));
    revealExecutionPanel(tabId);
    try {
      const result = await runExecutionProfile({
        profile,
        ...(activeDocument ? { activeDocument } : {}),
        workspaceName,
        environments,
        callbacks: {
          onProcessStarted: (processId) => setProfileExecutions((current) => ({
            ...current,
            [profile.id]: {
              ...(current[profile.id] ?? {
                profileId: profile.id,
                profileName: profile.name,
                profile,
                status: "running" as const,
                output: [],
                startedAt,
              }),
              status: "running",
              processId,
            },
          })),
          onProcessFinished: () => setProfileExecutions((current) => {
            const state = current[profile.id];
            if (!state) return current;
            const { processId: _processId, ...rest } = state;
            return { ...current, [profile.id]: rest };
          }),
          onOutput: (lines) => setProfileExecutions((current) => ({
            ...current,
            [profile.id]: {
              ...(current[profile.id] ?? {
                profileId: profile.id,
                profileName: profile.name,
                profile,
                status: "running" as const,
                output: [],
                startedAt,
              }),
              status: "running",
              output: [...lines],
            },
          })),
          shouldStop: () => cancellation.cancelled,
        },
      });
      setProfileExecutions((current) => ({
        ...current,
        [profile.id]: {
          ...(current[profile.id] ?? {
            profileId: profile.id,
            profileName: profile.name,
            profile,
            output: [],
            startedAt,
          }),
          profile: current[profile.id]?.profile ?? profile,
          status: result === "stopped" ? "stopped" : "completed",
          finishedAt: Date.now(),
        },
      }));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setProfileExecutions((current) => ({
        ...current,
        [profile.id]: {
          ...(current[profile.id] ?? {
            profileId: profile.id,
            profileName: profile.name,
            profile,
            output: [],
            startedAt,
          }),
          profile: current[profile.id]?.profile ?? profile,
          status: "failed",
          error: message,
          finishedAt: Date.now(),
        },
      }));
      throw cause;
    } finally {
      if (profileRunCancellationRef.current.get(profile.id) === cancellation) {
        profileRunCancellationRef.current.delete(profile.id);
      }
      setProfileExecutions((current) => {
        const state = current[profile.id];
        if (!state) return current;
        const { processId: _processId, ...rest } = state;
        return { ...current, [profile.id]: rest };
      });
    }
  };

  const runProfile = (profile: ExecutionProfile, replaceRunning = false): Promise<void> => {
    const existingRun = profileRunPromiseRef.current.get(profile.id);
    if (existingRun && !replaceRunning) {
      return Promise.reject(new Error(`O perfil '${profile.name}' já está em execução.`));
    }
    const run = executeProfile(profile, replaceRunning);
    profileRunPromiseRef.current.set(profile.id, run);
    return run.finally(() => {
      if (profileRunPromiseRef.current.get(profile.id) === run) {
        profileRunPromiseRef.current.delete(profile.id);
      }
    });
  };
  runProfileRef.current = (profile) => runProfile(profile);

  const runSelectedProfile = async () => {
    if (!selectedProfile) throw new Error("Selecione um perfil de execução.");
    await runProfile(selectedProfile);
  };

  const runDocumentScript = async (document: OpenDocument) => {
    const contribution = scriptExecutionFor(document);
    if (!contribution) throw new Error(`Nenhum plugin oferece execução para '${document.name}'.`);
    let executableDocument = document;
    if (document.content !== document.savedContent) {
      if (!document.handle) throw new Error("Salve o arquivo no workspace antes de executar o script.");
      executableDocument = await writeFileDocument(document, document.handle);
      setDocuments((current) => current.map((item) => item.id === document.id ? executableDocument : item));
    }
    const selectedEnvironment = (
      selectedEnvironmentId
        ? environments.find((environment) => environment.id === selectedEnvironmentId)
        : undefined
    ) ?? environments.find((environment) => environment.status === "ready" && environment.executable);
    if (!selectedEnvironment?.executable || selectedEnvironment.status !== "ready") {
      throw new Error("Configure um ambiente de execução pronto antes de executar o arquivo.");
    }
    const executionId = `script:${document.path ?? document.id}`;
    if (profileExecutions[executionId]?.status === "running") {
      throw new Error(`'${document.name}' já está em execução.`);
    }
    const startedAt = Date.now();
    const cancellation = { cancelled: false };
    profileRunCancellationRef.current.set(executionId, cancellation);
    setProfileExecutions((current) => ({
      ...current,
      [executionId]: {
        profileId: executionId,
        profileName: document.name,
        status: "running",
        output: [`[script] ${document.name}`],
        startedAt,
      },
    }));
    const tabId = profileExecutionPanelTabId(executionId, "run");
    setOpenProfileTabIds((current) => openProfileExecutionTab(current, executionId, "run"));
    setBusy(true);
    revealExecutionPanel(tabId);
    try {
      const result = await runScript({
        contribution,
        document: executableDocument,
        environment: selectedEnvironment,
        callbacks: {
          onProcessStarted: (processId) => {
            setActiveProcessId(processId);
            setProfileExecutions((current) => ({
              ...current,
              [executionId]: {
                ...(current[executionId] ?? {
                  profileId: executionId,
                  profileName: document.name,
                  status: "running" as const,
                  output: [`[script] ${document.name}`],
                  startedAt,
                }),
                status: "running",
                processId,
              },
            }));
          },
          onProcessFinished: () => {
            setActiveProcessId(undefined);
            setProfileExecutions((current) => {
              const state = current[executionId];
              if (!state) return current;
              const { processId: _processId, ...rest } = state;
              return { ...current, [executionId]: rest };
            });
          },
          onOutput: (lines) => {
            setOutput([...lines]);
            setProfileExecutions((current) => ({
              ...current,
              [executionId]: {
                ...(current[executionId] ?? {
                  profileId: executionId,
                  profileName: document.name,
                  status: "running" as const,
                  output: [`[script] ${document.name}`],
                  startedAt,
                }),
                status: "running",
                output: [...lines],
              },
            }));
          },
          shouldStop: () => cancellation.cancelled,
        },
      });
      setProfileExecutions((current) => ({
        ...current,
        [executionId]: {
          ...(current[executionId] ?? {
            profileId: executionId,
            profileName: document.name,
            output: [`[script] ${document.name}`],
            startedAt,
          }),
          status: result === "stopped" ? "stopped" : "completed",
          finishedAt: Date.now(),
        },
      }));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setProfileExecutions((current) => ({
        ...current,
        [executionId]: {
          ...(current[executionId] ?? {
            profileId: executionId,
            profileName: document.name,
            output: [`[script] ${document.name}`],
            startedAt,
          }),
          status: "failed",
          error: message,
          finishedAt: Date.now(),
        },
      }));
      throw cause;
    } finally {
      if (profileRunCancellationRef.current.get(executionId) === cancellation) {
        profileRunCancellationRef.current.delete(executionId);
      }
      setProfileExecutions((current) => {
        const state = current[executionId];
        if (!state) return current;
        const { processId: _processId, ...rest } = state;
        return { ...current, [executionId]: rest };
      });
      setBusy(false);
      setActiveProcessId(undefined);
    }
  };

  const resolvePluginConfirm = (value: boolean) => {
    pluginConfirmResolveRef.current?.(value);
    pluginConfirmResolveRef.current = undefined;
    setPluginConfirm(undefined);
  };

  const closeDocument = (documentId: string) => {
    const index = documents.findIndex((document) => document.id === documentId);
    if (index < 0) return;
    const next = documents.filter((document) => document.id !== documentId);
    editorHistoriesRef.current.delete(documentId);
    clearDocumentFolds(documentId);
    setDocuments(next);
    if (activeDocumentId === documentId) {
      setActiveDocumentId(next[index]?.id ?? next[index - 1]?.id);
    }
  };

  const reorderDocuments = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    setDocuments((current) => {
      const from = current.findIndex((document) => document.id === sourceId);
      if (from < 0) return current;
      const to = current.findIndex((document) => document.id === targetId);
      if (to < 0) return current;
      const moving = current[from];
      if (!moving) return current;
      const rest = current.filter((document) => document.id !== sourceId);
      const next = [...rest.slice(0, to), moving, ...rest.slice(to)];
      return next;
    });
  };

  const executeContextMenuItem = async (item: ResourceContextMenuItem, target: ContextMenuTarget) => {
    setContextMenu(undefined);
    if (target.kind === "text") {
      if (item.command !== "core.text.copy") throw new Error(`A ação '${item.id}' não possui executor.`);
      if (!navigator.clipboard?.writeText) throw new Error("A área de transferência não está disponível.");
      await navigator.clipboard.writeText(target.text);
      return;
    }
    if (target.kind === "editor") {
      if (item.command === "core.editor.copySelection") {
        if (!navigator.clipboard?.writeText) throw new Error("A área de transferência não está disponível.");
        await navigator.clipboard.writeText(
          target.context.document.content.slice(target.context.selectionStart, target.context.selectionEnd),
        );
        return;
      }
      if (!item.command) throw new Error(`A ação '${item.id}' não possui executor.`);
      await platform.commands.execute(item.command, target.context);
      return;
    }
    if (target.kind === "root") {
      if (item.command?.startsWith("core.resource.newFile")) {
        await startExplorerCreation("file", "", decodedNewFileOption(item.command));
        return;
      }
      if (item.command === "core.resource.newDirectory") {
        await startExplorerCreation("directory", "");
        return;
      }
      if (item.command === "core.root.copyAbsolutePath") {
        const path = workspaceAbsolutePath(workspaceRoot);
        if (path) await navigator.clipboard?.writeText(path);
        return;
      }
      if (item.command === "core.root.openInFileManager") {
        if (workspaceRoot) await openInSystemFileManager(workspaceRoot);
        return;
      }
      if (item.command === "core.root.paste") {
        await pasteExplorerEntries("");
        return;
      }
      if (!item.command) throw new Error(`A ação '${item.id}' não possui executor.`);
      await platform.commands.execute(item.command, rootResourceContext());
      return;
    }
    if (target.kind === "entry") {
      const { entry } = target;
      if (item.action === "runScript") {
        if (entry.kind !== "file") throw new Error("O recurso selecionado não é um arquivo executável.");
        const openDocument = documents.find((candidate) => candidate.path === entry.path);
        const document = openDocument
          ?? (entry.handle
            ? await readFileDocument(entry.handle as BrowserFileHandle, entry.path)
            : {
                id: entry.path,
                name: entry.name,
                path: entry.path,
                kind: "text",
                mediaType: "text/plain",
                size: 0,
                content: "",
                savedContent: "",
                selectionStart: 0,
                selectionEnd: 0,
                scrollTop: 0,
                scrollLeft: 0,
              });
        await runDocumentScript(document);
        return;
      }
      if (item.command === "core.resource.open") {
        await (entry.kind === "file" ? openEntry(entry) : toggleEntry(entry));
        return;
      }
      if (item.command === "core.resource.copyPath") {
        await navigator.clipboard?.writeText(entry.path);
        return;
      }
      if (item.command === "core.resource.copyEntry") {
        const paths = selectedExplorerPaths.has(entry.path) ? selectedExplorerPaths : new Set([entry.path]);
        const selectedEntries = topLevelWorkspacePaths(paths)
          .map((path) => findWorkspaceEntry(entries, path))
          .filter((candidate): candidate is WorkspaceEntry => Boolean(candidate));
        await copyExplorerEntries(selectedEntries);
        setSelectedExplorerPath(entry.path);
        setSelectedExplorerPaths(new Set(selectedEntries.map((candidate) => candidate.path)));
        return;
      }
      if (item.command === "core.resource.copyAbsolutePath") {
        const path = workspaceAbsolutePath(workspaceRoot, entry.path);
        if (path) await navigator.clipboard?.writeText(path);
        return;
      }
      if (item.command === "core.resource.openInFileManager") {
        if (workspaceRoot) await openInSystemFileManager(workspaceRoot, entry.path);
        return;
      }
      if (item.command === "core.resource.paste") {
        await pasteExplorerEntries(entry.kind === "directory" ? entry.path : workspacePathParent(entry.path));
        return;
      }
      if (item.command?.startsWith("core.resource.newFile")) {
        await startExplorerCreation("file", entry.path, decodedNewFileOption(item.command));
        return;
      }
      if (item.command === "core.resource.newDirectory") {
        await startExplorerCreation("directory", entry.path);
        return;
      }
      if (item.command === "core.resource.rename") {
        startExplorerRename(entry);
        return;
      }
      if (item.command === "core.resource.delete") {
        const paths = selectedExplorerPaths.has(entry.path) ? selectedExplorerPaths : new Set([entry.path]);
        const selectedEntries = topLevelWorkspacePaths(paths)
          .map((path) => findWorkspaceEntry(entries, path))
          .filter((candidate): candidate is WorkspaceEntry => Boolean(candidate));
        setExplorerPendingDeletion(selectedEntries);
        return;
      }
      if (!item.command) throw new Error(`A ação '${item.id}' não possui executor.`);
      await platform.commands.execute(item.command, resourceContext(entry));
      return;
    }

    const { document } = target;
    if (item.action === "runScript") {
      await runDocumentScript(document);
      return;
    }
    if (item.command === "core.tab.activate") {
      setActiveDocumentId(document.id);
      return;
    }
    if (item.command === "core.tab.save") {
      await saveOpenDocument(document);
      return;
    }
    if (item.command === "core.tab.close") {
      closeDocument(document.id);
      return;
    }
    if (item.command === "core.tab.closeOthers") {
      setDocuments([document]);
      setActiveDocumentId(document.id);
      return;
    }
    if (item.command === "core.tab.closeRight") {
      const index = documents.findIndex((candidate) => candidate.id === document.id);
      const next = documents.slice(0, index + 1);
      setDocuments(next);
      if (activeDocumentId && !next.some((candidate) => candidate.id === activeDocumentId)) {
        setActiveDocumentId(document.id);
      }
      return;
    }
    if (item.command === "core.tab.copyPath") {
      if (document.path) await navigator.clipboard?.writeText(document.path);
      return;
    }
    if (!item.command) throw new Error(`A ação '${item.id}' não possui executor.`);
    await platform.commands.execute(item.command, documentResourceContext(document));
  };

  const stopProfileExecution = async (profileId: string) => {
    const cancellation = profileRunCancellationRef.current.get(profileId);
    if (cancellation) cancellation.cancelled = true;
    const processId = profileExecutionsRef.current[profileId]?.processId;
    if (processId) await stopHostProcess(processId);
  };
  stopProfileRef.current = stopProfileExecution;

  const restartProfileExecution = async (profile: ExecutionProfile) => {
    if (restartingProfileId === profile.id) return;
    setRestartingProfileId(profile.id);
    let restartedRun: Promise<void> | undefined;
    try {
      const existingRun = profileRunPromiseRef.current.get(profile.id);
      const wasRunning = profileExecutionsRef.current[profile.id]?.status === "running";
      if (wasRunning) await stopProfileExecution(profile.id);
      if (existingRun) {
        await existingRun.catch(() => undefined);
      }
      // The finished run can still be rendered as running until React commits its final state.
      // It has already been stopped and awaited above, so this only bypasses that stale guard.
      restartedRun = runProfile(profile, true);
    } finally {
      setRestartingProfileId((current) => current === profile.id ? undefined : current);
    }
    await restartedRun;
  };

  const closeProfileOutputTab = async (tabId: string) => {
    const tab = profileExecutionPanelTab(tabId);
    if (!tab) return;
    setClosingProfileTabIds((current) => new Set(current).add(tabId));
    try {
      if (tab.mode === "debug" && debugSession?.profileId === tab.profileId && debugAdapter) {
        if (!["stopped", "completed", "failed"].includes(debugSession.status)) {
          await sendDebugCommand(debugAdapter, debugSession.id, "stop");
        }
        setDebugSession(undefined);
        setDebugAdapter(undefined);
      }
      if (tab.mode === "run" && profileExecutionsRef.current[tab.profileId]?.status === "running") {
        await stopProfileExecution(tab.profileId);
      }
      const currentTabIds = openProfileTabIdsRef.current;
      const remainingTabIds = currentTabIds.filter((candidate) => candidate !== tabId);
      const fallbackTabId = nextPanelTabAfterClosingProfile(
        currentTabIds,
        tabId,
        "output",
      );
      setOpenProfileTabIds(remainingTabIds);
      setPanelTab((current) => {
        if (current !== tabId) return current;
        if (!remainingTabIds.length) setPanelVisible(false);
        return fallbackTabId;
      });
    } finally {
      setClosingProfileTabIds((current) => {
        const next = new Set(current);
        next.delete(tabId);
        return next;
      });
    }
  };

  const selectEnvironment = (environmentId: string | undefined) => {
    const environment = environmentId
      ? environments.find((candidate) => candidate.id === environmentId)
      : undefined;
    const currentProviderSelections = workspaceSettingsRef.current.environment?.selectedByProvider ?? {};
    setSelectedEnvironmentId(environmentId);
    void updateWorkspaceSettings((current) => ({
      ...current,
      environment: environmentId ? {
        selectedId: environmentId,
        ...(environment?.providerId
          ? {
              selectedByProvider: {
                ...(current.environment?.selectedByProvider ?? currentProviderSelections),
                [environment.providerId]: environmentId,
              },
            }
          : current.environment?.selectedByProvider
            ? { selectedByProvider: current.environment.selectedByProvider }
            : {}),
      } : current.environment?.selectedByProvider
        ? { selectedByProvider: current.environment.selectedByProvider }
        : {},
    })).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  };

  const refreshEnvironments = async (
    preferredId = workspaceSettingsRef.current.environment?.selectedId,
    targetWorkspaceRoot = workspaceRoot,
  ) => {
    const loaded = await loadEnvironments();
    setEnvironments(loaded);
    const nextSelectedId = preferredId && loaded.some((environment) => environment.id === preferredId)
      ? preferredId
      : loaded[0]?.id;
    setSelectedEnvironmentId(nextSelectedId);
    if (nextSelectedId && nextSelectedId !== workspaceSettingsRef.current.environment?.selectedId && targetWorkspaceRoot) {
      const nextSettings: WorkspaceSettings = {
        ...workspaceSettingsRef.current,
        environment: { selectedId: nextSelectedId },
      };
      replaceWorkspaceSettings(nextSettings);
      replaceWorkspaceSettings(await writeWorkspaceSettings(targetWorkspaceRoot, nextSettings));
    }
  };

  const loadEnvironmentBrowser = async (
    mode: "directory" | "file",
    path?: string,
    includeHidden = environmentBrowserHidden,
  ) => {
    const provider = environmentProviderById(environmentManagerProviderId);
    if (!provider?.browse) throw new Error("O gerenciador não oferece navegação de arquivos.");
    setEnvironmentListing(await provider.browse({
      ...(path ? { path } : {}),
      mode,
      includeHidden,
      filter: "",
    }));
  };

  const pickHostPath = async (mode: "directory" | "file", executableOnly = false): Promise<string | undefined> => {
    setEnvironmentBrowserMode(mode);
    setEnvironmentBrowserExecutableOnly(executableOnly);
    setEnvironmentBrowserSelection(undefined);
    setEnvironmentBrowserFilter("");
    const { workspaceRoot } = await readHostContext();
    await loadEnvironmentBrowser(mode, workspaceRoot);
    return new Promise((resolve) => {
      browserResolverRef.current = resolve;
    });
  };

  const navigateEnvironmentBrowser = async (path?: string) => {
    if (!environmentBrowserMode) return;
    setEnvironmentBrowserSelection(undefined);
    await loadEnvironmentBrowser(environmentBrowserMode, path);
  };

  const confirmEnvironmentBrowser = async () => {
    const selection = environmentBrowserSelection;
    const mode = environmentBrowserMode;
    if (!selection || !mode) return;
    const provider = environmentProviderById(environmentManagerProviderId);
    if (mode === "file" && environmentBrowserExecutableOnly) {
      if (!provider?.validateExecutable) throw new Error("O gerenciador não valida executáveis deste tipo.");
      await provider.validateExecutable(selection);
    }
    setEnvironmentPath(selection);
    browserResolverRef.current?.(selection);
    browserResolverRef.current = undefined;
    setEnvironmentBrowserMode(undefined);
    setEnvironmentListing(undefined);
  };

  const cancelEnvironmentBrowser = () => {
    browserResolverRef.current?.(undefined);
    browserResolverRef.current = undefined;
    setEnvironmentBrowserMode(undefined);
    setEnvironmentListing(undefined);
    setEnvironmentBrowserSelection(undefined);
  };

  const submitEnvironmentForm = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const provider = environmentProviderById(environmentManagerProviderId);
    if (!provider || !environmentForm) throw new Error("Nenhum gerenciador de ambientes instalado.");
    const data = new FormData(event.currentTarget);
    setEnvironmentBusy(true);
    try {
      if (environmentForm === "addExecutable") {
        const name = String(data.get("name") ?? "").trim();
        if (!name || !environmentPath) throw new Error("Informe o nome e selecione o executável.");
        const created = await provider.addExecutable({ name, executable: environmentPath });
        await refreshEnvironments(created.id);
      } else if (environmentForm === "importEnvironment") {
        if (!environmentPath) throw new Error("Selecione a pasta do ambiente.");
        const name = String(data.get("name") ?? "").trim();
        const created = await provider.importEnvironment({
          path: environmentPath,
          ...(name ? { name } : {}),
        });
        await refreshEnvironments(created.id);
      } else if (environmentForm === "createEnvironment") {
        const name = String(data.get("name") ?? "").trim();
        const baseExecutable = String(data.get("baseExecutable") ?? "").trim();
        const path = String(data.get("path") ?? "").trim();
        if (!name || !baseExecutable) throw new Error("Informe o nome e o executável de origem.");
        const created = await provider.create({
          name,
          baseExecutable,
          ...(path ? { path } : {}),
        });
        await refreshEnvironments(created.id);
      } else if (environmentForm === "edit") {
        if (!editingEnvironmentId || !provider.update) throw new Error("Este gerenciador não permite editar ambientes.");
        const current = environments.find((environment) => environment.id === editingEnvironmentId);
        if (!current) throw new Error("Ambiente não encontrado.");
        const name = String(data.get("name") ?? "").trim();
        if (!name) throw new Error("Informe o nome do ambiente.");
        const currentLocation = current.type === "venv" ? current.path : current.executable;
        const location = environmentPath || currentLocation;
        if (!location) throw new Error("Informe o local do ambiente.");
        const updated = await provider.update(editingEnvironmentId, current.type === "venv"
          ? { name, path: location }
          : { name, executable: location });
        await refreshEnvironments(updated.id);
      } else {
        if (!selectedEnvironmentId) throw new Error("Selecione um ambiente.");
        const dependencies = String(data.get("dependencies") ?? "").trim().split(/\s+/).filter(Boolean);
        if (!dependencies.length) throw new Error("Informe ao menos uma dependência.");
        await provider.installDependencies(selectedEnvironmentId, dependencies);
        await refreshEnvironments();
      }
      setEnvironmentForm(undefined);
      setEditingEnvironmentId(undefined);
      setEnvironmentPath("");
    } finally {
      setEnvironmentBusy(false);
    }
  };

  const removeEnvironment = async (id: string) => {
    const environment = environments.find((candidate) => candidate.id === id);
    const provider = environmentProviderById(environment?.providerId);
    if (!provider) throw new Error("Nenhum gerenciador de ambientes instalado.");
    setEnvironmentBusy(true);
    try {
      await provider.remove(id);
      await refreshEnvironments();
    } finally {
      setEnvironmentBusy(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || Boolean(target?.isContentEditable);
      if (!editing && sidebarView === "explorer") {
        const visibleEntries = flattenVisibleEntries(entries, expanded, explorerShowHidden);
        const selectedIndex = selectedExplorerPath
          ? visibleEntries.findIndex((entry) => entry.path === selectedExplorerPath)
          : -1;
        const selectedEntry = selectedIndex >= 0 ? visibleEntries[selectedIndex] : undefined;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const direction = event.key === "ArrowDown" ? 1 : -1;
          const nextIndex = selectedIndex < 0
            ? (direction > 0 ? 0 : visibleEntries.length - 1)
            : Math.min(visibleEntries.length - 1, Math.max(0, selectedIndex + direction));
          const next = visibleEntries[nextIndex];
          if (next) {
            setSelectedExplorerPath(next.path);
            setSelectedExplorerPaths(new Set([next.path]));
          }
          return;
        }
        if (event.key === "Enter" && selectedEntry) {
          event.preventDefault();
          invoke(() => selectedEntry.kind === "directory" ? toggleEntry(selectedEntry) : openEntry(selectedEntry));
          return;
        }
        if (event.key === "ArrowRight" && selectedEntry?.kind === "directory") {
          event.preventDefault();
          if (!expanded.has(selectedEntry.path)) {
            invoke(() => toggleEntry(selectedEntry));
          } else {
            const firstChild = selectedEntry.children?.find((entry) => explorerShowHidden || !entry.name.startsWith("."));
            if (firstChild) {
              setSelectedExplorerPath(firstChild.path);
              setSelectedExplorerPaths(new Set([firstChild.path]));
            }
          }
          return;
        }
        if (event.key === "ArrowLeft" && selectedEntry) {
          event.preventDefault();
          if (selectedEntry.kind === "directory" && expanded.has(selectedEntry.path)) {
            invoke(() => toggleEntry(selectedEntry));
          } else {
            const parentPath = parentEntryPath(selectedEntry.path);
            if (parentPath) {
              setSelectedExplorerPath(parentPath);
              setSelectedExplorerPaths(new Set([parentPath]));
            }
          }
          return;
        }
        if (event.key === "F2" && selectedEntry) {
          event.preventDefault();
          startExplorerRename(selectedEntry);
          return;
        }
        if (event.key === "Escape") {
          setExplorerCreation(undefined);
          setExplorerCreationError(undefined);
          setExplorerRenamePath(undefined);
          setExplorerRenameError(undefined);
          return;
        }
      }
      if ((event.key === "Delete" || event.key === "Backspace")
        && !editing
        && sidebarView === "explorer"
        && selectedExplorerPath) {
        const selectedEntry = findWorkspaceEntry(entries, selectedExplorerPath);
        if (selectedEntry) {
          event.preventDefault();
          const paths = selectedExplorerPaths.has(selectedEntry.path) ? selectedExplorerPaths : new Set([selectedEntry.path]);
          const selectedEntries = topLevelWorkspacePaths(paths)
            .map((path) => findWorkspaceEntry(entries, path))
            .filter((candidate): candidate is WorkspaceEntry => Boolean(candidate));
          setExplorerPendingDeletion(selectedEntries);
        }
        return;
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLocaleLowerCase();
      if (key === "z" && !editing && sidebarView === "explorer") {
        event.preventDefault();
        invoke(event.shiftKey ? redoExplorerOperation : undoExplorerOperation);
      } else if (key === "y" && !editing && sidebarView === "explorer") {
        event.preventDefault();
        invoke(redoExplorerOperation);
      } else if (key === "n") {
        event.preventDefault();
        newDocument();
      } else if (key === "o") {
        event.preventDefault();
        invoke(openSingleFile);
      } else if (key === "s") {
        event.preventDefault();
        invoke(() => saveDocument(event.shiftKey));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [newDocument, openSingleFile, saveDocument, invoke, sidebarView, selectedExplorerPath, entries, expanded, explorerShowHidden, workspaceHandle, documents, activeDocumentId, explorerHistory]);

  const beginSidebarResize = (
    event: React.PointerEvent<HTMLDivElement>,
    side: ActivityBarSide,
    view: string,
  ) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = sidebarWidthForView(verticalPanelWidths[side], view);
    const maximumWidth = maximumSidebarWidth(view);
    const move = (pointerEvent: PointerEvent) => setVerticalPanelWidths((current) => ({
      ...current,
      [side]: Math.min(maximumWidth, Math.max(180, startWidth
        + (side === "left" ? pointerEvent.clientX - startX : startX - pointerEvent.clientX))),
    }));
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
  };

  const beginPanelResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const startY = event.clientY;
    const startHeight = panelHeight;
    const move = (pointerEvent: PointerEvent) => setPanelHeight(Math.min(640, Math.max(96, startHeight + startY - pointerEvent.clientY)));
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
  };

  const persistDebugPanelLayout = (layout: {
    inspectorWidth?: number;
    outputWrap?: boolean;
    outputFollowTail?: boolean;
  }) => {
    void updateWorkspaceSettings((current) => ({
      ...current,
      debugPanel: {
        ...current.debugPanel,
        inspectorWidth: layout.inspectorWidth ?? debugInspectorWidth,
        outputWrap: layout.outputWrap ?? debugOutputWrap,
        outputFollowTail: layout.outputFollowTail ?? debugOutputFollowTail,
      },
    })).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  };

  const beginDebugInspectorResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const layout = debugLayoutRef.current;
    if (!layout) return;
    const startX = event.clientX;
    const startWidth = debugInspectorWidth;
    let nextWidth = startWidth;
    const move = (pointerEvent: PointerEvent) => {
      nextWidth = clampDebugInspectorWidth(layout.clientWidth, startWidth + startX - pointerEvent.clientX);
      setDebugInspectorWidth(nextWidth);
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      persistDebugPanelLayout({ inspectorWidth: nextWidth });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
  };

  const beginProblemsResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = verticalPanelWidths[problemsDockSide];
    const move = (pointerEvent: PointerEvent) => setVerticalPanelWidths((current) => ({
      ...current,
      [problemsDockSide]: Math.min(640, Math.max(220, startWidth
        + (problemsDockSide === "left" ? pointerEvent.clientX - startX : startX - pointerEvent.clientX))),
    }));
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
  };

  const beginToolWindowResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const startY = event.clientY;
    const startHeight = toolWindowHeight;
    const move = (pointerEvent: PointerEvent) => setToolWindowHeight(Math.min(640, Math.max(120, startHeight + startY - pointerEvent.clientY)));
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
  };

  const closeDockConflicts = (
    side: ActivityBarSide,
    keep: "sidebar" | "problems" | "toolWindow",
  ) => {
    if (keep !== "sidebar" && sidebarViewsBySide[side]) {
      const next = closeSidebarForSide(sidebarViewsBySide, side);
      setSidebarViewsBySide(next);
      const remaining = next.left ?? next.right;
      setSidebarVisible(Boolean(remaining));
      if (remaining) setSidebarView(remaining);
    }
    if (keep !== "problems" && problemsVisible && problemsDockSide === side) setProblemsVisible(false);
  };

  const openVerticalSidebar = (view: string, side: ActivityBarSide) => {
    if (problemsVisible && problemsDockSide === side) setProblemsVisible(false);
    const next = toggleSidebarViewForSide(sidebarViewsBySide, side, view);
    setSidebarViewsBySide(next);
    const remaining = next[side] ?? next.left ?? next.right;
    setSidebarVisible(Boolean(remaining));
    if (remaining) setSidebarView(remaining);
  };

  const closeVerticalSidebar = (side: ActivityBarSide) => {
    const next = closeSidebarForSide(sidebarViewsBySide, side);
    setSidebarViewsBySide(next);
    const remaining = next.left ?? next.right;
    setSidebarVisible(Boolean(remaining));
    if (remaining) setSidebarView(remaining);
  };

  const toggleToolWindow = (toolWindowId: string) => {
    if (activeToolWindowId === toolWindowId) {
      setPanelVisible(false);
      setToolWindowVisible((visible) => !visible);
      return;
    }
    setActiveToolWindowId(toolWindowId);
    setPanelVisible(false);
    setToolWindowVisible(true);
  };

  const togglePluginSidebar = (sidebarId: string) => {
    const targetSide = activitySideFor(`sidebar:${sidebarId}`);
    openVerticalSidebar(sidebarId, targetSide);
  };

  const toggleBuiltinSidebar = (view: "explorer" | "plugins" | "environments") => {
    const targetSide = activitySideFor(`builtin:${view}`);
    openVerticalSidebar(view, targetSide);
    if (view === "environments") invoke(refreshEnvironments);
  };

  const repositionActivityButton = (
    key: string,
    side: ActivityBarSide,
    targetKey?: string,
    placeAfter = false,
  ) => {
    const movingSidebarView = sidebarViewFromActivityKey(key);
    if (movingSidebarView) {
      const from = sidebarViewsBySide.left === movingSidebarView ? "left"
        : sidebarViewsBySide.right === movingSidebarView ? "right"
          : undefined;
      if (from) {
        const next = moveOpenSidebar(sidebarViewsBySide, movingSidebarView, from, side);
        setSidebarViewsBySide(next);
        setSidebarVisible(true);
        setSidebarView(movingSidebarView);
      }
    } else if (key === "builtin:problems" && problemsVisible) closeDockConflicts(side, "problems");
    setActivityButtonPlacements((current) => (
      moveActivityButton(activityLayoutItems, current, key, side, targetKey, placeAfter)
    ));
  };

  const toggleProblemsPanel = () => setProblemsVisible((visible) => {
    if (!visible) closeDockConflicts(problemsDockSide, "problems");
    return !visible;
  });

  const toggleExecutionPanel = () => {
    const targetTabId = openProfileTabIds.includes(panelTab)
      ? panelTab
      : openProfileTabIds.at(-1);
    if (!targetTabId) return;
    if (panelVisible && panelTab === targetTabId) {
      setPanelVisible(false);
      return;
    }
    revealExecutionPanel(targetTabId);
  };

  const closeToolWindow = useCallback(() => setToolWindowVisible(false), []);
  const closeSidebar = useCallback(() => {
    setSidebarViewsBySide({});
    setSidebarVisible(false);
  }, []);

  const pluginPendingRemoval = platformSnapshot.plugins.find((plugin) => plugin.manifest.id === pluginRemovalId);
  const editingEnvironment = editingEnvironmentId
    ? environments.find((environment) => environment.id === editingEnvironmentId)
    : undefined;
  const packageManagerEnvironment = packageManagerEnvironmentId
    ? environments.find((environment) => environment.id === packageManagerEnvironmentId)
    : undefined;
  const registeredEnvironmentProviders = environmentProviders();
  const activeEnvironmentManagerProvider = environmentProviderById(environmentManagerProviderId)
    ?? registeredEnvironmentProviders[0];
  const providerEnvironments = activeEnvironmentManagerProvider
    ? environments.filter((environment) => environment.providerId === activeEnvironmentManagerProvider.id)
    : environments;
  const visibleEnvironments = providerEnvironments.filter((environment) => {
    const query = environmentSearch.trim().toLocaleLowerCase();
    if (!query) return true;
    return [
      environment.name,
      environment.version ?? "",
      environment.executable ?? "",
      environment.path ?? "",
    ].some((value) => value.toLocaleLowerCase().includes(query));
  });
  const managedEnvironmentCount = providerEnvironments.filter((environment) => environment.type === "venv" && environment.managed !== false).length;
  const importedEnvironmentCount = providerEnvironments.filter((environment) => environment.type === "venv" && environment.managed === false).length;
  const executableEnvironmentCount = providerEnvironments.filter((environment) => environment.type === "process").length;

  const pluginSettingsForProvider = (provider: PluginSettingsProvider): PluginSettingValues => resolvePluginSettingValues(
    provider,
    provider.scope === "user"
      ? userSettings.plugins?.[provider.pluginId]
      : workspaceSettings.plugins?.[provider.pluginId],
  );

  const openSettings = (sectionId = "editor") => {
    setSettingsSectionId(sectionId);
    const provider = settingsProviders.find((candidate) => candidate.pluginId === sectionId);
    setPluginSettingsDraft(provider ? pluginSettingsForProvider(provider) : {});
    setWatcherDraftDirectories(workspaceSettings.watcher?.extraIgnoredDirectories ?? []);
    setSettingsOpen(true);
  };

  const selectSettingsSection = (sectionId: string) => {
    setSettingsSectionId(sectionId);
    const provider = settingsProviders.find((candidate) => candidate.pluginId === sectionId);
    setPluginSettingsDraft(provider ? pluginSettingsForProvider(provider) : {});
  };

  const selectTheme = (themeId: string) => {
    setPreferredThemeId(themeId);
    void updateUserSettings((current) => ({
      ...current,
      appearance: { ...current.appearance, themeId },
    }));
  };
  const selectIconPack = (packId: string) => {
    setPreferredIconPackId(packId);
    void updateUserSettings((current) => ({
      ...current,
      appearance: { ...current.appearance, iconPackId: packId },
    }));
  };
  const updateFontPreferences = (patch: Partial<WorkbenchFontPreferences>) => {
    setFontPreferences((current) => {
      const next = {
        ...current,
        ...patch,
        editorFontSize: clampEditorFontSize(patch.editorFontSize ?? current.editorFontSize),
      };
      void updateUserSettings((settings) => ({
        ...settings,
        appearance: { ...settings.appearance, fonts: next },
      }));
      return next;
    });
  };

  const applyEditorLineNumbers = async (lineNumbers: boolean) => {
    await updateUserSettings((current) => ({
      ...current,
      editor: { ...current.editor, lineNumbers },
    }));
  };

  const applyWatcherExtraIgnoredDirectories = async (extraIgnoredDirectories: readonly string[]) => {
    await updateWorkspaceSettings((current) => ({
      ...current,
      watcher: {
        ...current.watcher,
        extraIgnoredDirectories,
      },
    }));
    if (workspaceRoot) await configureDesktopWorkspaceWatcher(workspaceRoot, extraIgnoredDirectories);
  };

  const addWatcherIgnoredDirectory = () => {
    const name = watcherIgnoredDraft.trim();
    if (!name) return;
    setWatcherDraftDirectories((current) => (current.includes(name) ? current : [...current, name]));
    setWatcherIgnoredDraft("");
  };

  const removeWatcherDraftDirectory = (name: string) => {
    setWatcherDraftDirectories((current) => current.filter((entry) => entry !== name));
  };

  const addPluginStringArraySetting = (settingId: string) => {
    if (!activePluginSettingsProvider) return;
    const setting = activePluginSettingsProvider.settings.find((candidate) => candidate.id === settingId);
    if (!setting || setting.type !== "stringArray") return;
    const draft = (pluginStringArrayDrafts[settingId] ?? "").trim();
    if (!draft) return;
    const current = resolvePluginStringArraySettingValue(setting, pluginSettingsDraft);
    const next = current.includes(draft) ? [...current] : [...current, draft];
    setPluginStringArrayDrafts((drafts) => ({ ...drafts, [settingId]: "" }));
    void applyPluginSetting(settingId, next);
  };

  const removePluginStringArraySetting = (settingId: string, entry: string) => {
    if (!activePluginSettingsProvider) return;
    const setting = activePluginSettingsProvider.settings.find((candidate) => candidate.id === settingId);
    if (!setting || setting.type !== "stringArray") return;
    const current = resolvePluginStringArraySettingValue(setting, pluginSettingsDraft);
    void applyPluginSetting(settingId, current.filter((candidate) => candidate !== entry));
  };

  const commitWatcherDraftDirectories = async () => {
    const current = workspaceSettings.watcher?.extraIgnoredDirectories ?? [];
    const next = watcherDraftDirectories;
    const changed = current.length !== next.length || current.some((entry, index) => entry !== next[index]);
    if (changed) await applyWatcherExtraIgnoredDirectories(next);
  };

  const applyPluginSetting = async (settingId: string, value: PluginSettingValue) => {
    if (!activePluginSettingsProvider) return;
    const values = updatePluginSettingValue(
      resolvePluginSettingValues(activePluginSettingsProvider, pluginSettingsDraft),
      settingId,
      value,
    );
    setPluginSettingsDraft(values);
    if (activePluginSettingsProvider.scope === "user") {
      await updateUserSettings((current) => ({
        ...current,
        plugins: {
          ...current.plugins,
          [activePluginSettingsProvider.pluginId]: {
            ...(current.plugins?.[activePluginSettingsProvider.pluginId] ?? {}),
            [settingId]: value,
          },
        },
      }));
      return;
    }
    await updateWorkspaceSettings((current) => ({
      ...current,
      plugins: {
        ...current.plugins,
        [activePluginSettingsProvider.pluginId]: {
          ...(current.plugins?.[activePluginSettingsProvider.pluginId] ?? {}),
          [settingId]: value,
        },
      },
    }));
  };

  if (!restorationComplete) {
    return <div className="boot-screen">Inicializando tinyIde...</div>;
  }

  const renderVerticalSidebar = (side: ActivityBarSide, view: string) => {
    const pluginSidebar = workbenchSidebars.find((candidate) => candidate.id === view);
    return (
      <>
            <aside
              className={`sidebar sidebar--${side}`}
              style={{ gridColumn: side === "left" ? 2 : 6 }}
            >
              <div className="sidebar-heading">
                <span>{pluginSidebar?.label.toLocaleUpperCase() ?? (view === "explorer" ? "EXPLORER" : view === "plugins" ? "PLUGINS" : "AMBIENTES")}</span>
                <div className="sidebar-heading-actions">
                  {view === "explorer" ? (
                    <>
                      <button
                        className="icon-button small"
                        type="button"
                        aria-label="Buscar arquivos no Explorer"
                        aria-pressed={explorerFilterOpen}
                        disabled={!explorerFilterProvider || !workspaceHandle}
                        onClick={() => setExplorerFilterOpen(true)}
                      ><WorkbenchIcon icon="search" size={15} /></button>
                      <button
                        className="icon-button small"
                        type="button"
                        aria-label="Localizar arquivo aberto no Explorer"
                        disabled={!activeDocument?.path || !workspaceHandle}
                        onClick={() => invoke(revealActiveDocumentInExplorer)}
                      ><LocateFixed size={15} /></button>
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <button className="icon-button small" type="button" aria-label="Ações do Explorer"><MoreVertical size={15} /></button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content className="menu-content" align="end" sideOffset={6}>
                            {workspaceFileCreationOptions.length ? (
                              <DropdownMenu.Sub>
                                <DropdownMenu.SubTrigger className="menu-item" disabled={!workspaceHandle}>
                                  <WorkbenchIcon icon="plus" size={15} /> Novo arquivo <ChevronRight className="menu-item__submenu-arrow" size={14} />
                                </DropdownMenu.SubTrigger>
                                <DropdownMenu.Portal>
                                  <DropdownMenu.SubContent className="menu-content" sideOffset={6} alignOffset={-5}>
                                    {fileCreationOptions(workspaceFileCreationOptions).map((option) => (
                                      <DropdownMenu.Item
                                        className="menu-item"
                                        key={`${option.id}:${option.extension}`}
                                        onSelect={() => invoke(() => startExplorerCreation("file", undefined, option))}
                                      >
                                        {option.icon ? (
                                          <span
                                            className="resource-icon resource-icon--menu"
                                            title={option.icon.title}
                                            style={{
                                              color: option.icon.foreground ?? "currentColor",
                                              background: option.icon.background ?? "transparent",
                                            }}
                                          >{option.icon.label}</span>
                                        ) : <WorkbenchIcon icon="file" size={15} />}
                                        <span>{option.label}</span>
                                        <span className="menu-item__hint">{option.extension}</span>
                                      </DropdownMenu.Item>
                                    ))}
                                  </DropdownMenu.SubContent>
                                </DropdownMenu.Portal>
                              </DropdownMenu.Sub>
                            ) : (
                              <DropdownMenu.Item className="menu-item" disabled={!workspaceHandle} onSelect={() => invoke(() => startExplorerCreation("file"))}>
                                <WorkbenchIcon icon="plus" size={15} /> Novo arquivo
                              </DropdownMenu.Item>
                            )}
                            <DropdownMenu.Item className="menu-item" disabled={!workspaceHandle} onSelect={() => invoke(() => startExplorerCreation("directory"))}>
                              <WorkbenchIcon icon="folder-open" size={15} /> Nova pasta
                            </DropdownMenu.Item>
                            <DropdownMenu.Separator className="menu-separator" />
                            <DropdownMenu.Item className="menu-item" disabled={!explorerHistory.undo.length} onSelect={() => invoke(undoExplorerOperation)}>
                              <WorkbenchIcon icon="undo" size={15} /> {explorerUndoLabel(explorerHistory) ?? "Desfazer"}
                            </DropdownMenu.Item>
                            <DropdownMenu.Item className="menu-item" disabled={!explorerHistory.redo.length} onSelect={() => invoke(redoExplorerOperation)}>
                              <Redo2 size={15} /> {explorerRedoLabel(explorerHistory) ?? "Refazer"}
                            </DropdownMenu.Item>
                            <DropdownMenu.Separator className="menu-separator" />
                            <DropdownMenu.Item className="menu-item" disabled={!workspaceHandle} onSelect={() => invoke(refreshExplorer)}>
                              <WorkbenchIcon icon="refresh" size={15} /> Atualizar
                            </DropdownMenu.Item>
                            <DropdownMenu.Separator className="menu-separator" />
                            <DropdownMenu.Item className="menu-item" onSelect={toggleExplorerSpecialEntries}>
                              <WorkbenchIcon icon="preview" size={15} />
                              {explorerSpecialEntriesVisible ? "Ocultar arquivos ignorados" : "Exibir arquivos ocultos"}
                            </DropdownMenu.Item>
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>
                    </>
                  ) : null}
                  <button className="icon-button small" type="button" onClick={() => closeVerticalSidebar(side)} aria-label="Fechar sidebar"><X size={14} /></button>
                </div>
              </div>

              {view === "explorer" ? (
                <div
                  className={`sidebar-content explorer-content${dropTargetExplorerPath === "" ? " is-root-drop-target" : ""}`}
                  tabIndex={-1}
                  aria-label="Arquivos do Explorer"
                  onPointerDown={(event) => {
                    const target = event.target as HTMLElement;
                    if (target.closest("input, textarea, select, button, [contenteditable='true']")) return;
                    event.currentTarget.focus({ preventScroll: true });
                  }}
                  onKeyDown={(event) => {
                    if (!explorerFilterProvider || !workspaceHandle) return;
                    const target = event.target as HTMLElement;
                    const isTextControl = target.matches("input, textarea, [contenteditable='true']");
                    if (isTextControl || event.ctrlKey || event.metaKey || event.altKey) return;
                    if (event.key === "Escape" && explorerFilterOpen) {
                      event.preventDefault();
                      setExplorerFilterOpen(false);
                      setExplorerFilterQuery("");
                      return;
                    }
                    if (event.key.length !== 1 || event.key.trim() === "") return;
                    event.preventDefault();
                    setExplorerFilterOpen(true);
                    setExplorerFilterQuery((current) => `${current}${event.key}`);
                  }}
                  onDragOver={(event) => {
                    const target = (event.target as Element).closest<HTMLElement>("[data-explorer-path]");
                    if (target?.dataset.explorerKind === "directory") return;
                    const containingDirectoryPath = (event.target as Element)
                      .closest<HTMLElement>("[data-explorer-directory-path]")
                      ?.dataset.explorerDirectoryPath ?? "";
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDropTargetExplorerPath(explorerDropTargetDirectory(
                      target?.dataset.explorerPath,
                      target?.dataset.explorerKind as WorkspaceEntry["kind"] | undefined,
                      containingDirectoryPath,
                    ));
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTargetExplorerPath(undefined);
                  }}
                  onDrop={(event) => {
                    const target = (event.target as Element).closest<HTMLElement>("[data-explorer-path]");
                    if (target?.dataset.explorerKind === "directory") return;
                    const containingDirectoryPath = (event.target as Element)
                      .closest<HTMLElement>("[data-explorer-directory-path]")
                      ?.dataset.explorerDirectoryPath ?? "";
                    event.preventDefault();
                    const sourcePath = event.dataTransfer.getData("application/x-tinyide-workspace-path");
                    const targetDirectoryPath = explorerDropTargetDirectory(
                      target?.dataset.explorerPath,
                      target?.dataset.explorerKind as WorkspaceEntry["kind"] | undefined,
                      containingDirectoryPath,
                    );
                    setDropTargetExplorerPath(undefined);
                    if (sourcePath && workspacePathParent(sourcePath) !== targetDirectoryPath) {
                      invoke(() => moveExplorerEntry(sourcePath, targetDirectoryPath));
                    }
                  }}
                >
                  {explorerFilterProvider && workspaceHandle && explorerFilterOpen ? (
                    <div className="explorer-filter" data-explorer-filter={explorerFilterProvider.id}>
                      <WorkbenchIcon icon="search" size={13} className="explorer-filter__icon" />
                      <input
                        ref={explorerFilterInputRef}
                        className="explorer-filter__input"
                        type="search"
                        value={explorerFilterQuery}
                        aria-label="Filtrar arquivos do Explorer"
                        placeholder={explorerFilterProvider.placeholder ?? "Filtrar arquivos"}
                        onChange={(event) => setExplorerFilterQuery(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.preventDefault();
                            setExplorerFilterOpen(false);
                            setExplorerFilterQuery("");
                          }
                        }}
                      />
                      <button
                        className="icon-button small"
                        type="button"
                        aria-label="Fechar busca do Explorer"
                        onClick={() => {
                          setExplorerFilterOpen(false);
                          setExplorerFilterQuery("");
                        }}
                      ><X size={12} /></button>
                    </div>
                  ) : null}
                  {explorerFilterResult ? (
                    <div className="explorer-filter-summary" role="status">
                      {explorerFilterResult.error
                        ? explorerFilterResult.error
                        : explorerFilterResult.matchCount === 0
                          ? "Nenhum arquivo corresponde ao filtro."
                          : `${explorerFilterResult.matchCount} ${explorerFilterResult.matchCount === 1 ? "arquivo" : "arquivos"}${explorerFilterResult.truncated ? " (parcial)" : ""}`}
                    </div>
                  ) : null}
                  {workspaceName !== "Sem workspace" ? (
                    <div
                      className={`workspace-name${selectedExplorerPath === "" ? " is-selected" : ""}`}
                      data-explorer-root
                      role="treeitem"
                      tabIndex={0}
                      aria-selected={selectedExplorerPath === ""}
                      onClick={(event) => {
                        if ((event.target as Element).closest("button")) return;
                        setSelectedExplorerPath("");
                        setSelectedExplorerPaths(new Set());
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        setSelectedExplorerPath("");
                        setSelectedExplorerPaths(new Set());
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setSelectedExplorerPath("");
                        setSelectedExplorerPaths(new Set());
                        invoke(() => openRootMenu(event.clientX, event.clientY));
                      }}
                    >
                      <span className="workspace-name__label"><WorkbenchIcon icon="folder" size={14} /> {workspaceName}</span>
                      <span className="workspace-name__actions">
                        <button
                          className="icon-button small"
                          type="button"
                          aria-label="Expandir próximo nível"
                          disabled={!workspaceHandle}
                          onClick={() => invoke(expandExplorerLevel)}
                        ><ChevronDown size={14} /></button>
                        <button
                          className="icon-button small"
                          type="button"
                          aria-label="Recolher nível mais profundo"
                          disabled={!expanded.size}
                          onClick={() => invoke(collapseExplorerLevel)}
                        ><ChevronUp size={14} /></button>
                      </span>
                    </div>
                  ) : null}
                  {workspaceAccess !== "ready" ? (
                    <div className="empty-sidebar">
                      <p>{workspaceAccess === "permission-required"
                        ? "O acesso ao workspace precisa ser restaurado."
                        : "O workspace salvo não está mais disponível."}</p>
                      {workspaceAccess === "permission-required" && workspaceHandle
                        ? <button className="button primary compact" type="button" onClick={() => invoke(reconnectWorkspace)}>Reconectar projeto</button>
                        : null}
                      {workspaceAccess === "missing"
                        ? <button className="button primary compact" type="button" onClick={() => invoke(openProjectDialog)}>Reabrir projeto</button>
                        : null}
                    </div>
                  ) : entries.length || (explorerCreation && explorerCreationParentPath === "") ? (
                    <EntryTree
                      entries={entries}
                      parentPath=""
                      expanded={expanded}
                      showHidden={explorerShowHidden || explorerFilterActive}
                      showIgnored={explorerShowIgnored || explorerFilterActive}
                      ignoredPaths={explorerIgnoredPaths}
                      revealHidden={explorerShowHidden || explorerFilterActive}
                      revealedHiddenPaths={explorerRevealedHiddenPaths}
                      filterVisiblePaths={explorerFilterResult?.visiblePaths}
                      highlightedPath={highlightedExplorerPath}
                      selectedPath={selectedExplorerPath}
                      selectedPaths={selectedExplorerPaths}
                      resourceDecorations={resourceDecorations}
                      onToggle={(entry) => invoke(() => toggleEntry(entry))}
                      onSelect={(entry, additive) => {
                        setSelectedExplorerPaths((current) => {
                          if (!additive) return new Set([entry.path]);
                          const next = new Set(current);
                          if (next.has(entry.path)) next.delete(entry.path);
                          else next.add(entry.path);
                          return next;
                        });
                        setSelectedExplorerPath((current) => additive && current === entry.path ? undefined : entry.path);
                      }}
                      onOpen={(entry) => invoke(() => openEntry(entry))}
                      onContextMenu={(entry, x, y) => invoke(() => openResourceMenu(entry, x, y))}
                      onMove={(sourcePaths, targetPath) => invoke(() => moveExplorerEntries(sourcePaths, targetPath))}
                      draggingPaths={draggingExplorerPaths}
                      dropTargetPath={dropTargetExplorerPath}
                      onDraggingPathChange={(path) => setDraggingExplorerPaths(path
                        ? new Set(selectedExplorerPaths.has(path) ? selectedExplorerPaths : [path])
                        : new Set())}
                      onDropTargetPathChange={setDropTargetExplorerPath}
                      onShowHiddenDirectory={(path) => setExplorerRevealedHiddenPaths((current) => new Set(current).add(path))}
                      onShowIgnoredEntries={() => setExplorerShowIgnored(true)}
                      renamePath={explorerRenamePath}
                      renameName={explorerRenameName}
                      renameError={explorerRenameError}
                      onRenameNameChange={(name) => { setExplorerRenameName(name); setExplorerRenameError(undefined); }}
                      onRenameSubmit={() => { void renameSelectedExplorerEntry(); }}
                      onRenameCancel={() => { setExplorerRenamePath(undefined); setExplorerRenameName(""); setExplorerRenameError(undefined); }}
                      creationKind={explorerCreation}
                      creationParentPath={explorerCreationParentPath}
                      creationName={explorerCreationName}
                      creationError={explorerCreationError}
                      onCreationNameChange={(name) => { setExplorerCreationName(name); setExplorerCreationError(undefined); }}
                      onCreationSubmit={() => { void createWorkspaceEntry(); }}
                      onCreationCancel={cancelExplorerCreation}
                      workspaceName={workspaceName}
                      {...(workspaceRoot ? { workspaceRoot } : {})}
                    />
                  ) : (
                    <div className="empty-sidebar">
                      <p>Nenhum projeto aberto.</p>
                    </div>
                  )}
                </div>
              ) : null}

              {view === "plugins" ? (
                <PluginManagerSidebar
                  snapshot={platformSnapshot}
                  settingsProviders={settingsProviders}
                  pluginIconUrl={(pluginId) => platform.pluginIconUrl(pluginId)}
                  onRefreshCatalog={() => invoke(() => platform.discoverPlugins())}
                  onRemovePlugin={setPluginRemovalId}
                  onSetPluginEnabled={(pluginId, enabled) => invoke(() => platform.setEnabled(pluginId, enabled))}
                  onOpenSettings={openSettings}
                  onInstallPlugin={(manifestUrl) => invoke(() => platform.install(manifestUrl))}
                />
              ) : null}

              {view === "environments" ? (
                <EnvironmentManagerSidebar
                  environments={environments}
                  providers={registeredEnvironmentProviders}
                  activeProvider={activeEnvironmentManagerProvider}
                  providerEnvironments={providerEnvironments}
                  visibleEnvironments={visibleEnvironments}
                  selectedEnvironmentId={selectedEnvironmentId}
                  selectedEnvironmentIds={selectedEnvironmentIds}
                  managedCount={managedEnvironmentCount}
                  importedCount={importedEnvironmentCount}
                  executableCount={executableEnvironmentCount}
                  search={environmentSearch}
                  form={environmentForm}
                  path={environmentPath}
                  editingEnvironment={editingEnvironment}
                  packageManagerEnvironment={packageManagerEnvironment}
                  packageManagerProvider={packageManagerEnvironment
                    ? environmentProviderById(packageManagerEnvironment.providerId)
                    : undefined}
                  busy={environmentBusy}
                  onRefresh={() => invoke(refreshEnvironments)}
                  onSelectProvider={(providerId) => {
                    setEnvironmentManagerProviderId(providerId);
                    setEnvironmentForm(undefined);
                    setEditingEnvironmentId(undefined);
                    setEnvironmentPath("");
                  }}
                  onSearchChange={setEnvironmentSearch}
                  onOpenForm={(kind, providerId) => {
                    setEnvironmentManagerProviderId(providerId);
                    setEnvironmentForm(kind);
                    setEnvironmentPath("");
                  }}
                  onCloseForm={() => setEnvironmentForm(undefined)}
                  onSubmitForm={(event) => invoke(() => submitEnvironmentForm(event))}
                  onPickPath={async (mode, executableOnly) => {
                    setError(undefined);
                    try {
                      return await pickHostPath(mode, executableOnly);
                    } catch (cause) {
                      setError(cause instanceof Error ? cause.message : String(cause));
                      return undefined;
                    }
                  }}
                  onPathChange={setEnvironmentPath}
                  onSelectEnvironment={selectEnvironment}
                  onRemoveEnvironment={(environmentId) => invoke(() => removeEnvironment(environmentId))}
                  onEditEnvironment={(environment) => {
                    setEnvironmentManagerProviderId(environment.providerId);
                    setEditingEnvironmentId(environment.id);
                    setEnvironmentPath(environment.type === "venv" ? environment.path ?? "" : environment.executable ?? "");
                    setEnvironmentForm("edit");
                  }}
                  onManagePackages={setPackageManagerEnvironmentId}
                  onClosePackageManager={() => setPackageManagerEnvironmentId(undefined)}
                  onPackageManagerEnvironmentChanged={(environmentId) => refreshEnvironments(environmentId)}
                  providerCanUpdate={(providerId) => Boolean(environmentProviderById(providerId)?.update)}
                />
              ) : null}

              {pluginSidebar ? (
                <WorkbenchSidebarHost
                  provider={pluginSidebar}
                  state={workbenchState}
                  onClose={() => closeVerticalSidebar(side)}
                />
              ) : null}
            </aside>

        <div
          className={`resize-handle ${side === "left" ? "resize-handle--sidebar" : "resize-handle--problems"}`}
          role="separator"
          aria-label="Redimensionar painel lateral"
          onPointerDown={(event) => beginSidebarResize(event, side, view)}
          onDoubleClick={() => setVerticalPanelWidths((current) => (
            updateVerticalPanelWidth(current, side, DEFAULT_LAYOUT.sidebarWidth)
          ))}
        />
      </>
    );
  };

  return (
    <Tooltip.Provider delayDuration={350}>
      <div className="ide-shell">
        <WorkbenchTitlebar
          workspaceName={workspaceName}
          recentProjects={recentProjects}
          fileCreationOptions={workspaceFileCreationOptions}
          profiles={profilesState}
          selectedProfile={selectedProfile}
          selectedProfileRunning={selectedProfileRunning}
          selectedProfileDebuggable={Boolean(selectedProfileDebugAdapter)}
          debugSessionActive={debugSessionActive}
          busy={busy}
          pageReloading={pageReloading}
          contributions={workbenchTitlebarContributions}
          workbenchState={workbenchState}
          onProjectMenuOpen={() => invoke(loadProjectOpeningState)}
          onOpenProject={() => invoke(openProjectDialog)}
          onOpenRecentProject={(project) => invoke(() => openRecentProjectFromMenu(project))}
          onNewDocument={newDocument}
          onOpenFile={() => invoke(openSingleFile)}
          onSave={(forceSaveAs) => invoke(() => saveDocument(forceSaveAs))}
          canFormatDocument={canFormatActiveDocument}
          onFormatDocument={() => invoke(formatActiveDocument)}
          onOpenSettings={() => openSettings("editor")}
          onOpenAbout={() => setAboutOpen(true)}
          onSelectProfile={(profileId) => updateProfiles(profilesState.profiles, profileId)}
          onManageProfiles={() => setProfilesOpen(true)}
          onRunProfile={() => invoke(runSelectedProfile)}
          onDebugProfile={() => invoke(startSelectedDebugProfile)}
          onReload={() => {
            setPageReloading(true);
            window.setTimeout(() => location.reload(), 450);
          }}
        />

        <div
          className="workbench"
          style={{
            gridTemplateColumns: `36px ${leftDockWidth ? `${leftDockWidth}px 5px` : "0 0"} minmax(0, 1fr) ${rightDockWidth ? `5px ${rightDockWidth}px` : "0 0"} 36px`,
          }}
        >
          <aside className="activity-bar">
            <WorkbenchActivityBar
              side="left"
              items={leftActivityItems}
              pluginItems={activityButtons}
              activeSidebarId={sidebarViewsBySide.left}
              toolWindowVisible={toolWindowVisible}
              activeToolWindowId={activeToolWindowId}
              draggingKey={draggingActivityButtonKey}
              environmentLabel="Ambientes de execução"
              environmentIcon="box"
              executionCount={profileOutputTabs.length}
              runningExecutionCount={runningProfileOutputCount}
              executionActive={executionPanelActive}
              diagnosticsCount={diagnostics.length}
              problemsVisible={problemsVisible}
              onPluginActivate={(item) => item.kind === "sidebar" ? togglePluginSidebar(item.id) : toggleToolWindow(item.id)}
              onBuiltinSidebarActivate={toggleBuiltinSidebar}
              onExecutionsActivate={toggleExecutionPanel}
              onProblemsActivate={toggleProblemsPanel}
              onMove={repositionActivityButton}
              onDragStateChange={setDraggingActivityButtonKey}
            />
          </aside>

          {sidebarViewsBySide.left ? renderVerticalSidebar("left", sidebarViewsBySide.left) : null}
          {sidebarViewsBySide.right ? renderVerticalSidebar("right", sidebarViewsBySide.right) : null}

          <main
            className={`editor-region${externalFileDropActive ? " is-external-file-drop" : ""}`}
            onDragEnter={handleExternalFileDragOver}
            onDragOver={handleExternalFileDragOver}
            onDragLeave={handleExternalFileDragLeave}
            onDrop={handleExternalFileDrop}
          >
            {documents.length ? (
              <>
                <Tabs.Root className="document-tabs" value={activeDocumentId ?? ""} onValueChange={setActiveDocumentId}>
                  <Tabs.List className="tabs-list">
                    {documents.map((document) => (
                      <Tabs.Trigger
                        className={`tab-trigger${draggingDocumentId === document.id ? " is-dragging" : ""}${dropTargetDocumentId === document.id ? " is-drop-target" : ""}`}
                        key={document.id}
                        value={document.id}
                        title={document.origin
                          ?? workspaceAbsolutePath(document.workspaceRoot ?? workspaceRoot, document.path)
                          ?? document.path
                          ?? document.name}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("application/x-tinyide-document-id", document.id);
                          setDraggingDocumentId(document.id);
                        }}
                        onDragEnd={() => {
                          setDraggingDocumentId(undefined);
                          setDropTargetDocumentId(undefined);
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          event.dataTransfer.dropEffect = "move";
                          setDropTargetDocumentId(document.id);
                        }}
                        onDragLeave={(event) => {
                          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                            setDropTargetDocumentId((current) => current === document.id ? undefined : current);
                          }
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          const encodedId = event.dataTransfer.getData("application/x-tinyide-document-id");
                          setDropTargetDocumentId(undefined);
                          if (!encodedId) return;
                          reorderDocuments(encodedId, document.id);
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          invoke(() => openDocumentMenu(document, event.clientX, event.clientY));
                        }}
                      >
                        {document.kind === "image"
                          ? <ImageIcon size={14} />
                          : document.kind === "binary"
                            ? <FileWarning size={14} />
                            : <File size={14} />}
                        <span>{document.name}</span>
                        {document.kind === "text" && document.content !== document.savedContent ? <span className="dirty-dot">●</span> : null}
                        <span
                          role="button"
                          tabIndex={0}
                          className="tab-close"
                          onClick={(event) => {
                            event.stopPropagation();
                            closeDocument(document.id);
                          }}
                        ><X size={13} /></span>
                      </Tabs.Trigger>
                    ))}
                  </Tabs.List>
                </Tabs.Root>
                <div className="editor-toolbar">
                  <div className="breadcrumb">{activeDocument?.path ?? activeDocument?.origin ?? activeDocument?.name}</div>
                  <div className="editor-actions">
                    <button
                      className="icon-button small"
                      type="button"
                      aria-label="Voltar para posição anterior"
                      title="Voltar para posição anterior (Alt+Seta esquerda)"
                      disabled={!editorLocationHistory.back.length}
                      onClick={() => void navigateEditorLocationHistory("back")}
                    ><ArrowLeft size={14} /></button>
                    <button
                      className="icon-button small"
                      type="button"
                      aria-label="Avançar para próxima posição"
                      title="Avançar para próxima posição (Alt+Seta direita)"
                      disabled={!editorLocationHistory.forward.length}
                      onClick={() => void navigateEditorLocationHistory("forward")}
                    ><ArrowRight size={14} /></button>
                    {editorSearchOpen ? (
                      <div className="editor-search" role="search" data-invalid={editorSearchError ? "true" : undefined}>
                        <div className="editor-search__find-row">
                        <WorkbenchIcon icon="search" size={13} className="editor-search__icon" />
                        <input
                          ref={editorSearchInputRef}
                          className="editor-search__input"
                          type="search"
                          value={editorSearchQuery}
                          aria-label="Pesquisar no arquivo aberto"
                          aria-invalid={Boolean(editorSearchError)}
                          title={editorSearchError}
                          placeholder="Pesquisar no arquivo"
                          onChange={(event) => {
                            setEditorSearchQuery(event.target.value);
                            setEditorSearchMatchIndex(0);
                          }}
                          onKeyDown={(event) => {
                            const key = event.key.toLocaleLowerCase();
                            if ((event.ctrlKey || event.metaKey) && key === "f") {
                              event.preventDefault();
                              event.currentTarget.select();
                              return;
                            }
                            if ((event.ctrlKey || event.metaKey) && key === "h") {
                              event.preventDefault();
                              setEditorSearchReplaceOpen(true);
                              return;
                            }
                            if (event.key === "Escape") {
                              event.preventDefault();
                              if (editorSearchReplaceOpen) {
                                setEditorSearchReplaceOpen(false);
                                return;
                              }
                              setEditorSearchOpen(false);
                              setEditorSearchQuery("");
                              setEditorSearchReplaceOpen(false);
                              setEditorSearchReplacement("");
                              return;
                            }
                            if (event.key === "Enter" && editorSearchMatches.length) {
                              event.preventDefault();
                              selectEditorSearchMatch(editorSearchMatchIndex + (event.shiftKey ? -1 : 1));
                            }
                          }}
                        />
                        <button
                          className="editor-search__toggle"
                          type="button"
                          aria-label="Diferenciar maiúsculas de minúsculas"
                          aria-pressed={editorSearchCaseSensitive}
                          title="Diferenciar maiúsculas de minúsculas"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setEditorSearchCaseSensitive((current) => !current);
                            setEditorSearchMatchIndex(0);
                          }}
                        >Aa</button>
                        <button
                          className="editor-search__toggle"
                          type="button"
                          aria-label="Interpretar como expressão regular"
                          aria-pressed={editorSearchRegex}
                          title="Interpretar o termo como expressão regular"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setEditorSearchRegex((current) => !current);
                            setEditorSearchMatchIndex(0);
                          }}
                        >.*</button>
                        <span className="editor-search__count" aria-live="polite">
                          {editorSearchError ? "!" : editorSearchMatches.length ? `${editorSearchMatchIndex + 1}/${editorSearchMatches.length}` : "0"}
                        </span>
                        <button
                          className="icon-button small"
                          type="button"
                          aria-label="Alternar substituição"
                          aria-expanded={editorSearchReplaceOpen}
                          title="Substituir (Ctrl+H)"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => setEditorSearchReplaceOpen((current) => !current)}
                        ><CornerDownRight size={12} /></button>
                        {editorSearchMatches.length > 1 ? (
                          <>
                            <button
                              className="icon-button small"
                              type="button"
                              aria-label="Ocorrência anterior"
                              title="Ocorrência anterior (Shift+Enter)"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => selectEditorSearchMatch(editorSearchMatchIndex - 1)}
                            ><ChevronUp size={12} /></button>
                            <button
                              className="icon-button small"
                              type="button"
                              aria-label="Próxima ocorrência"
                              title="Próxima ocorrência (Enter)"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => selectEditorSearchMatch(editorSearchMatchIndex + 1)}
                            ><ChevronDown size={12} /></button>
                          </>
                        ) : null}
                        <button
                          className="icon-button small"
                          type="button"
                          aria-label="Fechar busca no arquivo"
                          onClick={() => {
                            setEditorSearchOpen(false);
                            setEditorSearchQuery("");
                            setEditorSearchReplaceOpen(false);
                            setEditorSearchReplacement("");
                          }}
                        ><X size={12} /></button>
                        </div>
                        {editorSearchReplaceOpen ? (
                          <div className="editor-search__replace-row">
                            <CornerDownRight className="editor-search__icon" size={13} />
                            <input
                              ref={editorSearchReplaceInputRef}
                              className="editor-search__input"
                              type="text"
                              value={editorSearchReplacement}
                              aria-label="Substituir por"
                              placeholder="Substituir por"
                              onChange={(event) => setEditorSearchReplacement(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  setEditorSearchReplaceOpen(false);
                                  editorSearchInputRef.current?.focus({ preventScroll: true });
                                  return;
                                }
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  if (event.ctrlKey || event.metaKey) replaceAllEditorSearchMatches();
                                  else replaceCurrentEditorSearchMatch();
                                }
                              }}
                            />
                            <button
                              className="editor-search__replace-action"
                              type="button"
                              disabled={!activeEditorSearchMatch || Boolean(editorSearchError)}
                              title="Substituir ocorrência atual (Enter)"
                              onClick={replaceCurrentEditorSearchMatch}
                            >Substituir</button>
                            <button
                              className="editor-search__replace-action"
                              type="button"
                              disabled={!editorSearchMatches.length || Boolean(editorSearchError)}
                              title="Substituir todas as ocorrências (Ctrl+Enter)"
                              onClick={replaceAllEditorSearchMatches}
                            >Todos</button>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <button
                        className="icon-button small"
                        type="button"
                        aria-label="Pesquisar no arquivo"
                        title="Pesquisar no arquivo"
                        disabled={!activeDocument || activeDocument.kind !== "text" || Boolean(activeResourceEditorProvider)}
                        onClick={() => openEditorSearch()}
                      ><WorkbenchIcon icon="search" size={14} /></button>
                    )}
                    {goToLineOpen ? (
                      <div className="editor-go-to-line" role="search">
                        <Hash size={13} className="editor-go-to-line__icon" />
                        <input
                          ref={goToLineInputRef}
                          className="editor-go-to-line__input"
                          type="number"
                          min={1}
                          max={editorMetrics.lineCount}
                          value={goToLineValue}
                          aria-label="Ir para a linha"
                          placeholder={`Linha (1-${editorMetrics.lineCount})`}
                          onChange={(event) => setGoToLineValue(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              event.preventDefault();
                              setGoToLineOpen(false);
                              setGoToLineValue("");
                              editorRef.current?.focus({ preventScroll: true });
                              return;
                            }
                            if (event.key === "Enter") {
                              event.preventDefault();
                              const line = Number.parseInt(goToLineValue, 10);
                              if (Number.isFinite(line)) goToEditorLine(line);
                              setGoToLineOpen(false);
                              setGoToLineValue("");
                            }
                          }}
                          onBlur={() => {
                            setGoToLineOpen(false);
                            setGoToLineValue("");
                          }}
                        />
                      </div>
                    ) : (
                      <button
                        className="icon-button small"
                        type="button"
                        aria-label="Ir para linha"
                        title="Ir para linha (Ctrl+G)"
                        disabled={!activeDocument || activeDocument.kind !== "text" || Boolean(activeResourceEditorProvider)}
                        onClick={() => openGoToLine()}
                      ><Hash size={14} /></button>
                    )}
                    {editorToolbarItems.map((item) => {
                      const icon = <WorkbenchIcon icon={item.icon === "undo" ? "undo"
                        : item.icon === "diff" ? "diff"
                          : item.icon === "back" ? "back"
                            : item.icon === "forward" ? "forward"
                          : item.icon === "history" ? "history"
                          : item.icon === "preview" ? "preview"
                          : item.icon === "plus" ? "plus"
                            : "file"} size={14} />;
                      return (
                        <button
                          key={item.id}
                          className="icon-button small"
                          type="button"
                          aria-label={item.label}
                          title={item.label}
                          disabled={item.enabled === false}
                          onClick={() => invoke(() => {
                            if (!activeDocument) return Promise.resolve();
                            return platform.commands.execute(item.command, editorToolbarDocumentSnapshot(activeDocument));
                          })}
                        >{icon}</button>
                      );
                    })}
                    {activeLanguageProvider?.lintRules?.length ? (
                      <button className="icon-button small" type="button" aria-label="Configurar lint" title="Configurar lint" onClick={() => setLintSettingsOpen(true)}><Code2 size={14} /></button>
                    ) : null}
                    <button
                      className="icon-button small"
                      type="button"
                      aria-label="Salvar arquivo"
                      title="Salvar arquivo"
                      disabled={!activeDocument || activeDocument.kind !== "text" || activeDocument.readOnly || Boolean(activeResourceEditorProvider)}
                      onClick={() => invoke(saveDocument)}
                    ><Save size={14} /></button>
                  </div>
                </div>
                <div className="editor-stack">
                  {activeDocument && activeExternalDocumentNotice ? (
                    <ExternalFileNotice
                      notice={activeExternalDocumentNotice}
                      onReload={() => reloadExternalDocument(activeDocument.id)}
                      onKeep={() => dismissExternalDocumentNotice(activeDocument.id)}
                      onDismiss={() => dismissExternalDocumentNotice(activeDocument.id)}
                    />
                  ) : null}
                  {activeDocument && activeResourceEditorProvider ? (
                    <ResourceEditorHost
                      provider={activeResourceEditorProvider}
                      document={activeDocument}
                      topLine={editorTopLineForScrollTop(activeDocument.scrollTop)}
                      onRevealLine={(line) => setDocuments((current) => current.map((document) => document.id === activeDocument.id
                        ? { ...document, scrollTop: editorScrollTopForTopLine(line) }
                        : document))}
                    />
                  ) : activeDocument?.kind === "image" ? (
                    <NativeImageEditor document={activeDocument} />
                  ) : activeDocument?.kind === "binary" ? (
                    <UnsupportedBinaryEditor document={activeDocument} />
                  ) : (
                    <>
                  <div
                    className={`editor-canvas${showEditorGutter ? " has-editor-gutter" : ""}${editorSettings.lineNumbers ? " has-line-numbers" : ""}${editorNavigationLoading ? " is-symbol-navigation-loading" : ""}${activeEditorBusyOperation ? " is-editor-operation-busy" : ""}`}
                    aria-busy={editorNavigationLoading || Boolean(activeEditorBusyOperation)}
                    style={{
                      "--editor-gutter-width": `${editorMetrics.gutterWidth}px`,
                      "--editor-line-height": `${editorLayoutMetrics.lineHeight}px`,
                      "--editor-content-padding": `${editorLayoutMetrics.contentPadding}px`,
                    } as React.CSSProperties}
                    onMouseMove={trackFoldHover}
                    onMouseLeave={() => { setHoveredFoldLine(undefined); scheduleFoldPreviewClose(); }}
                  >
                    {activeEditorBusyOperation ? (
                      <div className="editor-operation-mask" role="status" aria-live="polite">
                        <RefreshCw className="is-spinning" size={18} />
                        <span>{activeEditorBusyOperation.label}</span>
                      </div>
                    ) : null}
                    {showEditorGutter ? (
                      <EditorLineRuler
                        viewportStore={editorViewportStore}
                        lineCount={editorMetrics.lineCount}
                        lineHeight={editorLayoutMetrics.lineHeight}
                        contentPadding={editorLayoutMetrics.contentPadding}
                        rulerRef={editorLineRulerRef}
                        showLineNumbers={editorSettings.lineNumbers}
                        debuggable={activeDocumentDebuggable}
                        documentPath={activeDocument?.path}
                        fileLineByVisibleLine={fileLineByVisibleLine}
                        breakpoints={debugBreakpoints}
                        activeDebugVisibleLine={activeDebugVisibleLine}
                        decorationsByLine={editorDecorationsByLine}
                        hoveredChangeKey={hoveredEditorChangeKey}
                        onToggleBreakpoint={(fileLine) => { if (activeDocumentDebuggable && activeDocument?.path) toggleBreakpoint(activeDocument.path, fileLine); }}
                        onChangeMarkerEnter={(decoration, changeKey) => { setHoveredEditorChangeKey(changeKey); openEditorDiffPeekOnHover(decoration); }}
                        onChangeMarkerLeave={() => { setHoveredEditorChangeKey(undefined); scheduleEditorDiffPeekClose(); }}
                        onLineEnter={() => { if (selectedEditorLineDecoration) scheduleEditorDiffPeekClose(); }}
                      />
                    ) : null}
                    {activeDocument && breakpointVisibleLines.length > 0 ? (
                      <div
                        ref={editorBreakpointLinesRef}
                        className="editor-breakpoint-lines"
                        aria-hidden="true"
                        style={{
                          "--editor-scroll-top": `${(highlightedEditorScrollRef.current ?? editorRef.current)?.scrollTop ?? activeDocument.scrollTop}px`,
                        } as React.CSSProperties}
                      >
                        {breakpointVisibleLines.map((line) => (
                          <div
                            key={line}
                            className="editor-breakpoint-line"
                            style={{ "--breakpoint-line-top": `${editorLineTop(line)}px` } as React.CSSProperties}
                          />
                        ))}
                      </div>
                    ) : null}
                    {activeDocument && activeDebugLine && activeDebugVisibleLine ? (
                      <div
                        ref={editorDebugCurrentLineRef}
                        className="editor-debug-current-line"
                        aria-hidden="true"
                        data-debug-line={activeDebugLine}
                        data-debug-visible-line={activeDebugVisibleLine}
                        style={{
                          "--debug-line-content-top": `${editorLineTop(activeDebugVisibleLine)}px`,
                          "--editor-scroll-top": `${(highlightedEditorScrollRef.current ?? editorRef.current)?.scrollTop ?? activeDocument.scrollTop}px`,
                        } as React.CSSProperties}
                      />
                    ) : null}
                    {(activeSyntaxHighlighter || activeEditorSearchMatch || activeFoldProjection || editorContextTargetHighlight) && activeDocument ? (
                      <div
                        ref={highlightedEditorScrollRef}
                        className="highlight-editor"
                        onMouseMove={(event) => {
                          const bounds = event.currentTarget.getBoundingClientRect();
                          const contentY = event.clientY - bounds.top + event.currentTarget.scrollTop - editorLayoutMetrics.contentPadding;
                          const line = Math.floor(contentY / editorLayoutMetrics.lineHeight) + 1;
                          const nextLine = diagnostics.some((diagnostic) => diagnostic.line === line)
                            ? line
                            : undefined;
                          setHoveredDiagnosticLine((current) => current === nextLine ? current : nextLine);
                        }}
                        onMouseLeave={() => setHoveredDiagnosticLine(undefined)}
                        onScroll={(event) => {
                          syncEditorLineRuler(event.currentTarget.scrollTop);
                          syncEditorViewportOnScroll(event.currentTarget);
                          if (editorRef.current) scheduleEditorStateCapture(editorRef.current, event.currentTarget);
                        }}
                      >
                        <div className="highlight-editor__content">
                          <pre
                            ref={syntaxLayerRef}
                            className="syntax-layer"
                            data-syntax-provider={activeSyntaxHighlighter?.id}
                            data-syntax-origin={activeSyntaxHighlighter?.origin}
                          >
                            {editorSyntaxLineStarts ? (
                              <WindowedHighlightedSource
                                viewportStore={editorViewportStore}
                                lineStarts={editorSyntaxLineStarts}
                                lineCount={editorMetrics.lineCount}
                                lineHeight={editorLayoutMetrics.lineHeight}
                                contentPadding={editorLayoutMetrics.contentPadding}
                                widthGuard={editorSyntaxWidthGuard}
                                source={activeEditorDisplayContent}
                                {...(activeSyntaxHighlighter ? { provider: activeSyntaxHighlighter } : {})}
                                {...(activeEditorSearchHighlight ? { highlight: activeEditorSearchHighlight } : {})}
                                {...(editorContextTargetHighlight ? { contextTarget: editorContextTargetHighlight } : {})}
                              />
                            ) : (
                              <HighlightedSource
                                source={activeEditorDisplayContent}
                                {...(activeSyntaxHighlighter ? { provider: activeSyntaxHighlighter } : {})}
                                {...(activeEditorSearchHighlight ? { highlight: activeEditorSearchHighlight } : {})}
                                {...(editorContextTargetHighlight ? { contextTarget: editorContextTargetHighlight } : {})}
                              />
                            )}
                          </pre>
                          <DiagnosticLayer
                            diagnostics={diagnostics}
                            source={activeEditorDisplayContent}
                            hoveredLine={hoveredDiagnosticLine}
                          />
                          <textarea
                            ref={editorRef}
                            className={`code-editor code-editor--highlighted${activeFoldProjection ? " code-editor--folded" : ""}`}
                            spellCheck={false}
                            wrap="off"
                            value={activeEditorContent}
                            readOnly={activeDocument.readOnly}
                            onChange={handleEditorChange}
                            onKeyDown={handleEditorKeyDown}
                            onMouseDown={handleEditorAuxiliaryNavigation}
                            onMouseUp={correctFoldedEditorPointerSelection}
                            onDoubleClick={selectFoldedEditorWordAtPointer}
                            onKeyUp={(event) => event.currentTarget.classList.toggle(
                              "is-navigation-modifier",
                              event.ctrlKey || event.metaKey,
                            )}
                            onMouseMove={(event) => event.currentTarget.classList.toggle(
                              "is-navigation-modifier",
                              event.ctrlKey || event.metaKey,
                            )}
                            onMouseLeave={(event) => event.currentTarget.classList.remove("is-navigation-modifier")}
                            onSelect={(event) => scheduleEditorStateCapture(event.currentTarget, highlightedEditorScrollRef.current ?? event.currentTarget)}
                            onClick={(event) => {
                              if ((!event.ctrlKey && !event.metaKey) || !activeDocument) return;
                              event.preventDefault();
                              invoke(() => navigateFromEditor(activeDocument, event.currentTarget));
                            }}
                            onContextMenu={(event) => {
                              if (!activeDocument) return;
                              event.preventDefault();
                              const preparedSelection = prepareEditorContextMenu(
                                event.currentTarget,
                                event.clientX,
                                event.clientY,
                                highlightedEditorScrollRef.current ?? event.currentTarget,
                              );
                              invoke(() => openEditorMenu(
                                activeDocument,
                                event.currentTarget,
                                event.clientX,
                                event.clientY,
                                preparedSelection,
                              ));
                            }}
                          />
                          {activeFoldProjection ? (
                            <>
                              <div
                                ref={foldedEditorSelectionRef}
                                className="editor-projected-selection"
                                aria-hidden="true"
                                hidden
                              />
                              <span
                                ref={foldedEditorCaretRef}
                                className="editor-projected-caret"
                                aria-hidden="true"
                                hidden
                              />
                            </>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <textarea
                        ref={editorRef}
                        className="code-editor"
                        spellCheck={false}
                        value={activeEditorContent}
                        readOnly={activeDocument?.readOnly}
                        onChange={handleEditorChange}
                        onKeyDown={handleEditorKeyDown}
                        onMouseDown={handleEditorAuxiliaryNavigation}
                        onMouseUp={correctFoldedEditorPointerSelection}
                        onKeyUp={(event) => event.currentTarget.classList.toggle(
                          "is-navigation-modifier",
                          event.ctrlKey || event.metaKey,
                        )}
                        onMouseMove={(event) => event.currentTarget.classList.toggle(
                          "is-navigation-modifier",
                          event.ctrlKey || event.metaKey,
                        )}
                        onMouseLeave={(event) => event.currentTarget.classList.remove("is-navigation-modifier")}
                        onSelect={(event) => scheduleEditorStateCapture(event.currentTarget)}
                        onClick={(event) => {
                          if ((!event.ctrlKey && !event.metaKey) || !activeDocument) return;
                          event.preventDefault();
                          invoke(() => navigateFromEditor(activeDocument, event.currentTarget));
                        }}
                        onContextMenu={(event) => {
                          if (!activeDocument) return;
                          event.preventDefault();
                          const preparedSelection = prepareEditorContextMenu(
                            event.currentTarget,
                            event.clientX,
                            event.clientY,
                            event.currentTarget,
                          );
                          invoke(() => openEditorMenu(
                            activeDocument,
                            event.currentTarget,
                            event.clientX,
                            event.clientY,
                            preparedSelection,
                          ));
                        }}
                        onScroll={(event) => {
                          syncEditorLineRuler(event.currentTarget.scrollTop);
                          syncEditorViewportOnScroll(event.currentTarget);
                          scheduleEditorStateCapture(event.currentTarget);
                        }}
                      />
                    )}
                    {foldControlLines.length ? (
                      <div
                        ref={editorFoldOverlayRef}
                        className="editor-fold-overlay"
                        style={{ "--editor-scroll-top": `${editorViewport.scrollTop}px` } as React.CSSProperties}
                      >
                        {foldControlLines.map(({ line, folded }) => (
                          <button
                            key={line}
                            className={`editor-fold-toggle${folded ? " is-folded" : ""}`}
                            type="button"
                            title={folded ? "Expandir bloco" : "Recolher bloco"}
                            aria-label={folded ? `Expandir bloco, linha ${line}` : `Recolher bloco, linha ${line}`}
                            style={{ "--fold-line-top": `${editorLineTop(line)}px` } as React.CSSProperties}
                            onMouseDown={(event) => event.preventDefault()}
                            onMouseEnter={() => { if (folded) openFoldPreview(line); else scheduleFoldPreviewClose(); }}
                            onFocus={() => { if (folded) openFoldPreview(line); else scheduleFoldPreviewClose(); }}
                            onMouseLeave={(event) => {
                              if (event.relatedTarget instanceof Element && event.relatedTarget.closest(".editor-fold-preview")) return;
                              scheduleFoldPreviewClose();
                            }}
                            onBlur={(event) => {
                              if (event.relatedTarget instanceof Element && event.relatedTarget.closest(".editor-fold-preview")) return;
                              scheduleFoldPreviewClose();
                            }}
                            onClick={() => toggleFold(line)}
                          >{folded ? "+" : "-"}</button>
                        ))}
                      </div>
                    ) : null}
                    {foldPreview ? (
                      <div
                        className="editor-fold-preview"
                        style={{
                          "--fold-preview-top": `${foldPreviewTop}px`,
                          "--fold-preview-max-height": `${foldPreviewMaxHeight}px`,
                        } as React.CSSProperties}
                        role="tooltip"
                        onMouseMove={(event) => event.stopPropagation()}
                        onMouseEnter={cancelFoldPreviewClose}
                        onMouseLeave={scheduleFoldPreviewClose}
                        onFocus={cancelFoldPreviewClose}
                        onBlur={(event) => {
                          if (event.relatedTarget instanceof Element && event.relatedTarget.closest(".editor-fold-toggle.is-folded")) return;
                          scheduleFoldPreviewClose();
                        }}
                        onWheel={(event) => event.stopPropagation()}
                      >
                        <div className="editor-fold-preview__title">
                          <span>Trecho recolhido</span>
                          <span>{foldPreview.lineCount} linha(s)</span>
                        </div>
                        <pre tabIndex={0} aria-label="Conteúdo completo do trecho recolhido">
                          <HighlightedSource
                            source={foldPreview.text}
                            {...(activeSyntaxHighlighter ? { provider: activeSyntaxHighlighter } : {})}
                          />
                        </pre>
                        {foldPreview.lineCount > 12 ? (
                          <div className="editor-fold-preview__footer">Role para visualizar o trecho completo.</div>
                        ) : null}
                      </div>
                    ) : null}
                    {selectedEditorLineDecoration?.change && activeDocument ? (
                      <EditorLineDiffPeek
                        decoration={selectedEditorLineDecoration}
                        provider={activeSyntaxHighlighter}
                        // 30 = altura do cabeçalho do peek (features.css); centraliza o cabeçalho na linha da régua
                        top={editorLineTop(editorDiffPeekAnchorLine(selectedEditorLineDecoration)) - activeDocument.scrollTop + (editorLayoutMetrics.lineHeight - 30) / 2}
                        onClose={() => { cancelEditorDiffPeekHoverTimer(); setSelectedEditorLineDecoration(undefined); }}
                        onMouseEnter={cancelEditorDiffPeekHoverTimer}
                        onMouseLeave={scheduleEditorDiffPeekClose}
                        onAction={(action) => {
                          invoke(async () => {
                            await platform.commands.execute(action.command, {
                              document: {
                                id: activeDocument.id,
                                name: activeDocument.name,
                                ...(activeDocument.path ? { path: activeDocument.path } : {}),
                                ...(activeDocument.workspaceRoot ? { workspaceRoot: activeDocument.workspaceRoot } : {}),
                                content: activeDocument.content,
                                isDirty: activeDocument.content !== activeDocument.savedContent,
                              },
                              decoration: selectedEditorLineDecoration,
                              action,
                            });
                            if (action.closeOnRun) setSelectedEditorLineDecoration(undefined);
                          });
                        }}
                      />
                    ) : null}
                  </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="welcome-screen">
                <span className="welcome-kicker">Bem-vindo</span>
                <h1>tinyIde</h1>
                <p>Crie, abra ou arraste um arquivo para começar.</p>
                <div className="welcome-actions">
                  {workspaceFileCreationOptions.length ? (
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <button className="button primary" type="button">
                          <WorkbenchIcon icon="plus" size={16} /> Novo arquivo <ChevronDown size={14} />
                        </button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content className="menu-content" align="center" sideOffset={6}>
                          {fileCreationOptions(workspaceFileCreationOptions).map((option) => (
                            <DropdownMenu.Item
                              className="menu-item"
                              key={`${option.id}:${option.extension}`}
                              onSelect={() => newDocument(option)}
                            >
                              {option.icon ? (
                                <span
                                  className="resource-icon resource-icon--menu"
                                  title={option.icon.title}
                                  style={{
                                    color: option.icon.foreground ?? "currentColor",
                                    background: option.icon.background ?? "transparent",
                                  }}
                                >{option.icon.label}</span>
                              ) : <WorkbenchIcon icon="file" size={15} />}
                              <span>{option.label}</span>
                              <span className="menu-item__hint">{option.extension}</span>
                            </DropdownMenu.Item>
                          ))}
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  ) : (
                    <button className="button primary" type="button" onClick={() => newDocument()}><WorkbenchIcon icon="plus" size={16} /> Novo arquivo</button>
                  )}
                  <button className="button secondary" type="button" onClick={() => invoke(openSingleFile)}><WorkbenchIcon icon="file" size={16} /> Abrir arquivo</button>
                  <button className="button secondary" type="button" onClick={() => invoke(openProjectDialog)}><WorkbenchIcon icon="folder-open" size={16} /> Abrir projeto</button>
                </div>
                <small>Atalhos: Ctrl+N, Ctrl+O, Ctrl+S e Ctrl+Shift+S</small>
              </div>
            )}

          </main>

          {problemsVisible ? (
            <div
              className={`resize-handle ${problemsDockSide === "left" ? "resize-handle--sidebar" : "resize-handle--problems"}`}
              role="separator"
              aria-label="Redimensionar painel de problemas"
              onPointerDown={beginProblemsResize}
              onDoubleClick={() => setVerticalPanelWidths((current) => (
                updateVerticalPanelWidth(current, problemsDockSide, DEFAULT_LAYOUT.problemsWidth)
              ))}
            />
          ) : null}

          {problemsVisible ? (
            <ProblemsPanel
              side={problemsDockSide}
              diagnostics={diagnostics}
              onClose={() => setProblemsVisible(false)}
            />
          ) : null}

          <aside className="right-activity-bar" aria-label="Barra lateral direita">
            <WorkbenchActivityBar
              side="right"
              items={rightActivityItems}
              pluginItems={activityButtons}
              activeSidebarId={sidebarViewsBySide.right}
              toolWindowVisible={toolWindowVisible}
              activeToolWindowId={activeToolWindowId}
              draggingKey={draggingActivityButtonKey}
              environmentLabel="Ambientes de execução"
              environmentIcon="box"
              executionCount={profileOutputTabs.length}
              runningExecutionCount={runningProfileOutputCount}
              executionActive={executionPanelActive}
              diagnosticsCount={diagnostics.length}
              problemsVisible={problemsVisible}
              onPluginActivate={(item) => item.kind === "sidebar" ? togglePluginSidebar(item.id) : toggleToolWindow(item.id)}
              onBuiltinSidebarActivate={toggleBuiltinSidebar}
              onExecutionsActivate={toggleExecutionPanel}
              onProblemsActivate={toggleProblemsPanel}
              onMove={repositionActivityButton}
              onDragStateChange={setDraggingActivityButtonKey}
            />
          </aside>

          <div className="workbench-bottom-region">
            {panelVisible && bottomPanelAvailable ? (
              <section className={`output-panel${panelVisible ? "" : " output-panel--hidden"}`} style={{ height: panelHeight }}>
                <div className="resize-handle resize-handle--panel" role="separator" aria-label="Redimensionar painel inferior" onPointerDown={beginPanelResize} onDoubleClick={() => setPanelHeight(DEFAULT_LAYOUT.panelHeight)} />
                <div className="panel-heading">
                  <div className="panel-tabs">
                    {profileOutputTabs.map((tab) => {
                      const statusLabel = tab.debugSession
                        ? `Depuração: ${tab.debugSession.status}`
                        : profileExecutionStatusLabel(tab.execution);
                      const running = tab.execution?.status === "running"
                        || Boolean(tab.debugSession && !["stopped", "completed", "failed"].includes(tab.debugSession.status));
                      const closing = closingProfileTabIds.has(tab.tabId);
                      const tabLabel = tab.mode === "debug" ? `${tab.name} (Debug)` : tab.name;
                      return (
                        <div className={`panel-tab-group${panelTab === tab.tabId ? " active" : ""}`} key={tab.tabId}>
                          <button
                            aria-label={`${tabLabel}: ${statusLabel}`}
                            className="panel-tab panel-tab--profile"
                            title={`${tabLabel}: ${statusLabel}`}
                            type="button"
                            onClick={() => setPanelTab(tab.tabId)}
                          >
                            <span className="panel-tab__label">{tabLabel}</span>
                            <span aria-hidden="true" className={`panel-tab__execution-dot${running ? " is-running" : ""}`} />
                          </button>
                          <button
                            aria-label={running ? `Fechar e interromper ${tabLabel}` : `Fechar saída de ${tabLabel}`}
                            className="panel-tab-close"
                            disabled={closing}
                            title={running ? "Fechar aba e interromper processo" : "Fechar aba"}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              invoke(() => closeProfileOutputTab(tab.tabId));
                            }}
                          ><X size={12} /></button>
                        </div>
                      );
                    })}
                    {workbenchPanels.map((panel) => (
                      <button
                        className={`panel-tab${panelTab === panel.id ? " active" : ""}`}
                        type="button"
                        key={panel.id}
                        onClick={() => setPanelTab(panel.id)}
                      >
                        {panel.icon ? <WorkbenchActivityIconView icon={panel.icon} /> : null}
                        <span className="panel-tab__label">{panel.label}</span>
                      </button>
                    ))}
                  </div>
                  <button className="icon-button small" type="button" aria-label="Fechar painel" onClick={() => setPanelVisible(false)}><X size={14} /></button>
                </div>
                {profileOutputTabs.map((tab) => {
                  const tabDebugSession = tab.debugSession;
                  const debugging = Boolean(tabDebugSession);
                  const debugEnded = Boolean(tabDebugSession && ["stopped", "completed", "failed"].includes(tabDebugSession.status));
                  const debugRestarting = debugRestartingProfileId === tab.profileId;
                  const debugCommandBusy = Boolean(tabDebugSession && debugCommandPending?.sessionId === tabDebugSession.id);
                  const executionRunning = tab.execution?.status === "running";
                  const executionRestarting = restartingProfileId === tab.profileId;
                  const outputFollowing = profileOutputFollowing[tab.tabId] ?? true;
                  const outputOffsets = tabDebugSession
                    ? debugOutputOffsets[tabDebugSession.id] ?? EMPTY_DEBUG_OUTPUT_OFFSETS
                    : EMPTY_DEBUG_OUTPUT_OFFSETS;
                  const outputSegments = tabDebugSession
                    ? debugOutputSegments(tabDebugSession, outputOffsets)
                    : [];
                  return (
                    <div className="execution-panel-view" hidden={panelTab !== tab.tabId} key={tab.tabId}>
                      <div className="execution-panel-toolbar">
                        <div className="execution-panel-toolbar__actions">
                          {tabDebugSession ? (
                            <>
                              <ButtonTooltip label={
                                debugEnded
                                  ? "Iniciar depuração"
                                  : tabDebugSession.status === "paused"
                                    ? "Continuar"
                                    : "Pausar"
                              } side="top">
                                <button
                                  className="icon-button small"
                                  type="button"
                                  aria-label={
                                    debugEnded
                                      ? "Iniciar depuração"
                                      : tabDebugSession.status === "paused"
                                        ? "Continuar depuração"
                                        : "Pausar depuração"
                                  }
                                  disabled={
                                    debugRestarting
                                    || (debugCommandBusy && tabDebugSession.status !== "running" && !debugEnded)
                                    || (!debugEnded && !["running", "paused", "starting"].includes(tabDebugSession.status))
                                  }
                                  onClick={() => invoke(async () => {
                                    if (debugEnded) {
                                      await restartDebugSession(tab.profileId);
                                      return;
                                    }
                                    await debugCommand(tabDebugSession.status === "paused" ? "resume" : "pause");
                                  })}
                                >{
                                  debugEnded
                                    ? <Bug size={14} />
                                    : tabDebugSession.status === "paused"
                                      ? <WorkbenchIcon icon="play" size={14} />
                                      : <WorkbenchIcon icon="pause" size={14} />
                                }</button>
                              </ButtonTooltip>
                              <ButtonTooltip label="Step over" side="top">
                                <button className="icon-button small" type="button" aria-label="Step over" disabled={debugRestarting || debugCommandBusy || tabDebugSession.status !== "paused"} onClick={() => invoke(() => debugCommand("stepOver"))}><StepForward size={14} /></button>
                              </ButtonTooltip>
                              <ButtonTooltip label="Step into" side="top">
                                <button className="icon-button small" type="button" aria-label="Step into" disabled={debugRestarting || debugCommandBusy || tabDebugSession.status !== "paused"} onClick={() => invoke(() => debugCommand("stepInto"))}><CornerDownRight size={14} /></button>
                              </ButtonTooltip>
                              <ButtonTooltip label="Step out" side="top">
                                <button className="icon-button small" type="button" aria-label="Step out" disabled={debugRestarting || debugCommandBusy || tabDebugSession.status !== "paused"} onClick={() => invoke(() => debugCommand("stepOut"))}><CornerUpRight size={14} /></button>
                              </ButtonTooltip>
                              <ButtonTooltip label="Reiniciar depuração" side="top">
                                <button className="icon-button small" type="button" aria-label="Reiniciar depuração" disabled={debugRestarting || debugCommandBusy} onClick={() => invoke(() => restartDebugSession(tab.profileId))}><RotateCw className={debugRestarting ? "is-spinning" : undefined} size={13} /></button>
                              </ButtonTooltip>
                              <ButtonTooltip label="Parar depuração" side="top">
                                <button className="icon-button small danger" type="button" aria-label="Parar depuração" disabled={debugRestarting || debugEnded} onClick={() => invoke(() => debugCommand("stop"))}><Square size={13} /></button>
                              </ButtonTooltip>
                            </>
                          ) : tab.profile ? (
                            <>
                              <ButtonTooltip label="Executar perfil" side="top">
                                <button
                                  className="icon-button small"
                                  type="button"
                                  aria-label="Executar perfil nesta aba"
                                  disabled={executionRunning || executionRestarting}
                                  onClick={() => invoke(() => runProfile(tab.profile!))}
                                ><WorkbenchIcon icon="play" size={14} /></button>
                              </ButtonTooltip>
                              <ButtonTooltip label="Reexecutar perfil" side="top">
                                <button
                                  className="icon-button small"
                                  type="button"
                                  aria-label="Reexecutar perfil nesta aba"
                                  disabled={executionRestarting || !tab.execution}
                                  onClick={() => invoke(() => restartProfileExecution(tab.profile!))}
                                ><RotateCw className={executionRestarting ? "is-spinning" : undefined} size={13} /></button>
                              </ButtonTooltip>
                              <ButtonTooltip label="Parar execução" side="top">
                                <button
                                  className="icon-button small danger"
                                  type="button"
                                  aria-label="Parar execução"
                                  disabled={!executionRunning || executionRestarting}
                                  onClick={() => invoke(() => stopProfileExecution(tab.profileId))}
                                ><Square size={13} /></button>
                              </ButtonTooltip>
                            </>
                          ) : executionRunning ? (
                            <ButtonTooltip label="Parar execução" side="top">
                              <button className="icon-button small danger" type="button" aria-label="Parar execução" onClick={() => invoke(() => stopProfileExecution(tab.profileId))}><Square size={13} /></button>
                            </ButtonTooltip>
                          ) : null}
                          {tab.viewProvider?.toolbarActions?.(tab.viewTarget).map((action) => (
                            <ButtonTooltip label={action.label} side="top" key={action.id}>
                              <button
                                className={`icon-button small${action.danger ? " danger" : ""}`}
                                type="button"
                                aria-label={action.label}
                                disabled={action.disabled}
                                onClick={() => invoke(() => action.run(tab.viewTarget))}
                              >{executionViewToolbarIcon(action)}</button>
                            </ButtonTooltip>
                          ))}
                        </div>
                        {!tabDebugSession && !tab.viewProvider ? (
                          <label className="workbench-output-follow execution-panel-toolbar__follow">
                            <input
                              type="checkbox"
                              className="checkbox-md"
                              checked={outputFollowing}
                              onChange={(event) => setProfileOutputFollowing((current) => ({
                                ...current,
                                [tab.tabId]: event.target.checked,
                              }))}
                            />
                            <span>Seguir saída</span>
                          </label>
                        ) : null}
                      </div>
                      {tabDebugSession ? (
                        <div
                          className="execution-debug-layout"
                          ref={debugLayoutRef}
                          style={{ gridTemplateColumns: `minmax(0, 1fr) 5px ${debugInspectorWidth}px` }}
                        >
                          <section className="execution-debug-output-pane" aria-label="Saída da depuração">
                            <div className="execution-debug-output-toolbar">
                              <ButtonTooltip label="Quebrar linhas" side="top">
                                <button
                                  type="button"
                                  className={`icon-button small execution-debug-output-toolbar__icon-btn${debugOutputWrap ? " is-active" : ""}`}
                                  aria-label="Quebrar linhas"
                                  aria-pressed={debugOutputWrap}
                                  onClick={() => {
                                    const next = !debugOutputWrap;
                                    setDebugOutputWrap(next);
                                    persistDebugPanelLayout({ outputWrap: next });
                                  }}
                                ><WrapText size={14} /></button>
                              </ButtonTooltip>
                              <ButtonTooltip label="Limpar" side="top">
                                <button
                                  type="button"
                                  className="icon-button small execution-debug-output-toolbar__icon-btn"
                                  aria-label="Limpar saída"
                                  onClick={() => setDebugOutputOffsets((current) => ({
                                    ...current,
                                    [tabDebugSession.id]: debugOutputOffsetsFor(tabDebugSession),
                                  }))}
                                ><Eraser size={14} /></button>
                              </ButtonTooltip>
                              <label className="workbench-output-follow execution-debug-output-toolbar__follow">
                                <input
                                  type="checkbox"
                                  className="checkbox-md"
                                  checked={debugOutputFollowTail}
                                  onChange={(event) => {
                                    const next = event.target.checked;
                                    setDebugOutputFollowTail(next);
                                    persistDebugPanelLayout({ outputFollowTail: next });
                                  }}
                                />
                                <span>Seguir saída</span>
                              </label>
                            </div>
                            <div ref={debugOutputRef} className={`execution-panel-output execution-panel-output--structured${debugOutputWrap ? " is-wrapped" : ""}`}>
                              {outputSegments.length ? outputSegments.map((segment, index) => (
                                <div className={`debug-output-segment is-${segment.kind}`} key={`${segment.kind}-${index}`}>
                                  {segment.label ? <span className="debug-output-segment__label">{segment.label}</span> : null}
                                  <pre>{segment.text}</pre>
                                </div>
                              )) : <p className="debug-output-empty">Nenhuma saída registrada.</p>}
                            </div>
                          </section>
                          <div
                            className="execution-debug-splitter execution-debug-splitter--vertical"
                            role="separator"
                            aria-label="Redimensionar inspetor da depuração"
                            onPointerDown={beginDebugInspectorResize}
                            onDoubleClick={() => {
                              setDebugInspectorWidth(DEFAULT_DEBUG_PANEL_LAYOUT.inspectorWidth);
                              persistDebugPanelLayout({ inspectorWidth: DEFAULT_DEBUG_PANEL_LAYOUT.inspectorWidth });
                            }}
                          />
                          <aside className="execution-debug-inspector" aria-label="Estado da depuração">
                            <section className="execution-debug-inspector-section">
                              <h3>Breakpoints <span>{debugBreakpoints.length}</span></h3>
                              {debugBreakpoints.length ? debugBreakpoints.map((breakpoint) => (
                                <button key={`${breakpoint.path}:${breakpoint.line}`} type="button" onClick={() => toggleBreakpoint(breakpoint.path, breakpoint.line)}>
                                  <span>{breakpoint.path}</span><small>{breakpoint.line}</small>
                                </button>
                              )) : <p>Nenhum breakpoint.</p>}
                            </section>
                            <section className="execution-debug-inspector-section">
                              <h3>Pilha <span>{tabDebugSession.frames.length}</span></h3>
                              {tabDebugSession.frames.length ? tabDebugSession.frames.map((frame) => (
                                <button
                                  className={frame.id === tabDebugSession.selectedFrameId ? "is-selected" : undefined}
                                  key={frame.id}
                                  type="button"
                                  onClick={() => invoke(() => revealDebugLocation(frame.path, frame.line))}
                                >
                                  <span>{frame.name}</span>
                                  {frame.path ? <small>{frame.path}:{frame.line ?? 0}</small> : null}
                                </button>
                              )) : <p>{tabDebugSession.status === "paused" ? "Pilha ainda não recebida do runtime." : "Aguardando pausa."}</p>}
                            </section>
                            <section className="execution-debug-variables">
                              <div className="execution-debug-variables__heading">
                                <h3>Variáveis</h3>
                                <input
                                  aria-label="Filtrar variáveis"
                                  placeholder="Filtrar variáveis"
                                  value={debugVariableQuery}
                                  onChange={(event) => setDebugVariableQuery(event.target.value)}
                                />
                              </div>
                              {tabDebugSession.scopes.length ? tabDebugSession.scopes.map((scope) => {
                                const variables = filterDebugVariables(scope.variables, debugVariableQuery);
                                return (
                                  <div className="debug-scope" key={scope.name}>
                                    <strong>{scope.name}</strong>
                                    <div className="debug-variable-tree">
                                      {variables.length ? variables.map((variable) => (
                                        <DebugVariableNode key={variable.name} variable={variable} />
                                      )) : <p>Nenhuma variável correspondente.</p>}
                                    </div>
                                  </div>
                                );
                              }) : <p>Nenhuma variável disponível.</p>}
                            </section>
                          </aside>
                        </div>
                      ) : tab.viewProvider ? (
                        <ExecutionViewHost
                          provider={tab.viewProvider}
                          target={tab.viewTarget}
                          state={workbenchState}
                        />
                      ) : (
                        <FollowedExecutionOutput
                          text={profileExecutionOutput(tab.execution).join("\n")}
                          following={outputFollowing}
                        />
                      )}
                    </div>
                  );
                })}
                {restorationComplete ? workbenchPanels.map((panel) => (
                  <div className="plugin-panel-container" hidden={panelTab !== panel.id} key={panel.id}>
                    <WorkbenchPanelHost provider={panel} state={workbenchState} />
                  </div>
                )) : null}
              </section>
            ) : null}

            {restorationComplete ? workbenchToolWindows
              .filter((toolWindow) => mountedToolWindowIds.has(toolWindow.id))
              .map((toolWindow) => (
                <WorkbenchToolWindowHost
                  key={toolWindow.id}
                  provider={toolWindow}
                  state={workbenchState}
                  visible={toolWindowVisible && toolWindow.id === activeToolWindowId}
                  height={toolWindowHeight}
                  {...(toolWindowViewRequest ? { viewRequest: toolWindowViewRequest } : {})}
                  onClose={closeToolWindow}
                  onResize={beginToolWindowResize}
                  onResetHeight={() => setToolWindowHeight(DEFAULT_LAYOUT.toolWindowHeight)}
                />
              )) : null}
          </div>
        </div>

        <footer className="statusbar">
          <button type="button" onClick={() => invoke(openSingleFile)}><WorkbenchIcon icon="file" size={13} /> Abrir arquivo</button>
          <span>{platformSnapshot.plugins.length} plugin(s)</span>
          {workspaceExternalSync ? <WorkspaceExternalSyncIndicator state={workspaceExternalSync} /> : null}
          {workbenchStatusbarContributions.map((provider) => (
            <WorkbenchStatusbarHost key={provider.id} provider={provider} state={workbenchState} />
          ))}
          <span className="status-spacer" />
          <span>{activeDocument?.readOnly ? "Somente leitura" : activeDocument?.kind === "text" && activeDocument.content !== activeDocument.savedContent ? "Modificado" : "Salvo"}</span>
          <span>{activeDocument?.kind === "text" ? "UTF-8" : activeDocument?.mediaType ?? ""}</span>
          <span>{activeResourceEditorProvider?.id ?? activeSyntaxHighlighter?.name ?? (activeDocument?.kind === "image" ? "Imagem" : activeDocument?.kind === "binary" ? "Binário" : "Texto")}</span>
        </footer>

        <ProfileDialog
          open={profilesOpen}
          onOpenChange={setProfilesOpen}
          profiles={profilesState.profiles}
          selectedId={profilesState.selectedId}
          environments={environments}
          executableOptions={executableOptions}
          presets={profilePresets}
          targetKinds={profileTargetKinds}
          onBrowseCommand={() => pickHostPath("file")}
          onChange={updateProfiles}
        />

        <Dialog.Root open={aboutOpen} onOpenChange={setAboutOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content className="dialog-content dialog-content--small">
              <div className="dialog-heading">
                <div>
                  <Dialog.Title>Sobre</Dialog.Title>
                  <Dialog.Description>Editor web extensível orientado a plugins.</Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <button className="icon-button" type="button" aria-label="Fechar"><X size={16} /></button>
                </Dialog.Close>
              </div>
              <div className="about-content">
                <img className="about-logo" src="/icon.png" alt="Ícone do tinyIde" />
                <span>Versão {import.meta.env.VITE_TINYIDE_APP_VERSION}</span>
                <p>O núcleo permanece um editor de texto básico. Recursos de IDE são fornecidos por plugins independentes.</p>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        <Dialog.Root open={Boolean(workbenchDialog)} onOpenChange={(open) => {
          if (!open) {
            const shouldClose = workbenchDialog?.contribution.onCloseRequest?.() !== false;
            if (shouldClose) setWorkbenchDialog(undefined);
          }
        }}>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content className={`workbench-plugin-dialog workbench-plugin-dialog--${workbenchDialog?.size ?? workbenchDialog?.contribution.size ?? "large"}`}>
              <div className="dialog-heading">
                <div>
                  {workbenchDialog?.contribution.showPluginLabel === false ? null : <span className="eyebrow">PLUGIN</span>}
                  <Dialog.Title>{workbenchDialog?.contribution.title ?? "Plugin"}</Dialog.Title>
                  {workbenchDialog?.contribution.description ? (
                    <Dialog.Description>{workbenchDialog.contribution.description}</Dialog.Description>
                  ) : null}
                </div>
                <Dialog.Close asChild>
                  <button className="icon-button" type="button" aria-label="Fechar"><X size={16} /></button>
                </Dialog.Close>
              </div>
              {workbenchDialog ? (
                <WorkbenchDialogHost
                  provider={workbenchDialog.contribution}
                  onClose={() => setWorkbenchDialog(undefined)}
                  onSizeChange={(size) => setWorkbenchDialog((current) => current ? { ...current, size } : current)}
                />
              ) : null}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        <Dialog.Root
          open={settingsOpen}
          onOpenChange={(open) => {
            if (!open) setWatcherDraftDirectories(workspaceSettings.watcher?.extraIgnoredDirectories ?? []);
            setSettingsOpen(open);
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content className="settings-dialog">
              <div className="dialog-heading settings-dialog__heading">
                <div className="settings-dialog__identity">
                  <span className="settings-dialog__icon"><Settings2 size={20} /></span>
                  <div>
                    <span className="eyebrow">CONFIGURAÇÕES</span>
                    <Dialog.Title>Configurações</Dialog.Title>
                    <Dialog.Description>
                      Preferências e comportamento da IDE.
                    </Dialog.Description>
                  </div>
                </div>
                <div className="settings-dialog__heading-actions">
                  <span className="settings-workspace-badge" title={workspaceRoot ?? "Nenhum workspace aberto"}>
                    <FolderRoot size={13} /> {workspaceName}
                  </span>
                  <Dialog.Close asChild><button className="icon-button" type="button" aria-label="Fechar"><X size={16} /></button></Dialog.Close>
                </div>
              </div>
              <div className="settings-layout">
                <nav className="settings-navigation" aria-label="Seções de configuração">
                  <span className="settings-navigation__label">Geral</span>
                  <button
                    className={settingsSectionId === "editor" ? "is-active" : ""}
                    type="button"
                    onClick={() => selectSettingsSection("editor")}
                  >
                    <Code2 size={15} />
                    <span>Editor</span>
                  </button>
                  <button
                    className={settingsSectionId === "appearance" ? "is-active" : ""}
                    type="button"
                    onClick={() => selectSettingsSection("appearance")}
                  >
                    <Palette size={15} />
                    <span>Aparência</span>
                  </button>
                  <button
                    className={settingsSectionId === "fonts" ? "is-active" : ""}
                    type="button"
                    onClick={() => selectSettingsSection("fonts")}
                  >
                    <Type size={15} />
                    <span>Fontes</span>
                  </button>
                  <button
                    className={settingsSectionId === "watcher" ? "is-active" : ""}
                    type="button"
                    onClick={() => selectSettingsSection("watcher")}
                  >
                    <WorkbenchIcon icon="preview" size={15} />
                    <span>Vigia de arquivos</span>
                  </button>
                  {settingsProviders.length ? <span className="settings-navigation__label">Plugins</span> : null}
                  {settingsProviders.map((provider) => (
                    <button
                      className={settingsSectionId === provider.pluginId ? "is-active" : ""}
                      key={provider.pluginId}
                      type="button"
                      onClick={() => selectSettingsSection(provider.pluginId)}
                    >
                      <WorkbenchIcon icon="plugins" size={15} />
                      <span>{provider.title}</span>
                    </button>
                  ))}
                </nav>
                <section className="settings-content">
                  {settingsSectionId === "editor" ? (
                    <>
                      <div className="settings-section-heading">
                        <span className="settings-section-heading__icon"><Code2 size={18} /></span>
                        <div>
                          <span className="eyebrow">NATIVO</span>
                          <h3>Editor</h3>
                          <p>Comportamento e apresentação do editor de texto.</p>
                        </div>
                      </div>
                      <div className="plugin-setting-list">
                        <label className="plugin-setting">
                          <span className="plugin-setting__copy">
                            <strong>Régua numérica</strong>
                            <small>Exibe os números das linhas no editor de texto.</small>
                          </span>
                          <span className="settings-switch">
                            <input
                              type="checkbox"
                              checked={userSettings.editor?.lineNumbers !== false}
                              onChange={(event) => invoke(() => applyEditorLineNumbers(event.target.checked))}
                            />
                            <i aria-hidden="true" />
                          </span>
                        </label>
                      </div>
                    </>
                  ) : settingsSectionId === "appearance" ? (
                    <>
                      <div className="settings-section-heading">
                        <span className="settings-section-heading__icon"><Palette size={18} /></span>
                        <div>
                          <span className="eyebrow">NATIVO</span>
                          <h3>Aparência</h3>
                          <p>Escolha o tema visual da aplicação. A preferência vale para todos os projetos.</p>
                        </div>
                      </div>
                      <div className="theme-setting-grid" role="radiogroup" aria-label="Tema da aplicação">
                        {availableThemes.map((theme) => {
                          const selected = activeTheme?.id === theme.id;
                          return (
                            <button
                              className={`theme-setting-card${selected ? " is-active" : ""}`}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              key={theme.id}
                              onClick={() => selectTheme(theme.id)}
                            >
                              <span
                                className="theme-setting-card__preview"
                                aria-hidden="true"
                                style={{
                                  background: theme.tokens.background,
                                  borderColor: theme.tokens.borderStrong,
                                  color: theme.tokens.text,
                                }}
                              >
                                <i style={{ background: theme.tokens.surfaceActivityBar }} />
                                <b style={{ background: theme.tokens.surfaceSidebar }} />
                                <em style={{ background: theme.tokens.surfaceEditor }} />
                                <strong style={{ background: theme.tokens.accent }} />
                              </span>
                              <span className="theme-setting-card__copy">
                                <strong>{theme.label}</strong>
                                <small>{theme.description}</small>
                              </span>
                              <span className="theme-setting-card__check" aria-hidden="true">
                                {selected ? <Check size={14} /> : null}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    
                      <div className="settings-section-heading settings-section-heading--nested">
                        <div>
                          <h4>Pacote de ícones</h4>
                          <p>Ícones semânticos da barra de atividades e painéis. Plugins podem oferecer packs adicionais.</p>
                        </div>
                      </div>
                      <div className="theme-setting-grid" role="radiogroup" aria-label="Pacote de ícones">
                        {availableIconPacks.map((pack) => {
                          const selected = activeIconPack?.id === pack.id;
                          return (
                            <button
                              className={`theme-setting-card${selected ? " is-active" : ""}`}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              key={pack.id}
                              onClick={() => selectIconPack(pack.id)}
                            >
                              <span className="icon-pack-preview" aria-hidden="true">
                                {(pack.id === "tinyide.brand"
                                  ? pack.icons.filter((icon) => ["git", "docker", "nodejs", "python", "terminal", "files"].includes(icon.id))
                                  : pack.icons
                                ).slice(0, 6).map((icon) => (
                                  <span
                                    key={icon.id}
                                    className="workbench-icon"
                                    data-workbench-icon={icon.id}
                                    dangerouslySetInnerHTML={{ __html: icon.svg }}
                                  />
                                ))}
                              </span>
                              <span className="theme-setting-card__copy">
                                <strong>{pack.label}</strong>
                                <small>{pack.description ?? `${pack.icons.length} ícones`}</small>
                              </span>
                            </button>
                          );
                        })}
                      </div>
</>
                  ) : settingsSectionId === "fonts" ? (
                    <>
                      <div className="settings-section-heading">
                        <span className="settings-section-heading__icon"><Type size={18} /></span>
                        <div>
                          <span className="eyebrow">NATIVO</span>
                          <h3>Fontes</h3>
                          <p>Tipografia do editor de código e da interface. A preferência vale para todos os projetos.</p>
                        </div>
                      </div>
                      <div className="plugin-setting-list">
                        <div className="plugin-setting-note">
                          <strong>Editor</strong>
                          <small>Fonte monoespaçada usada no código, na régua e nas camadas do editor.</small>
                        </div>
                        <div className="font-setting-grid" role="radiogroup" aria-label="Fonte do editor">
                          {availableEditorFonts.map((font) => {
                            const selected = activeEditorFont?.id === font.id;
                            return (
                              <button
                                className={`font-setting-card${selected ? " is-active" : ""}`}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                key={font.id}
                                onClick={() => updateFontPreferences({ editorFontId: font.id })}
                              >
                                <span
                                  className="font-setting-card__preview"
                                  aria-hidden="true"
                                  style={{ fontFamily: font.family }}
                                >
                                  {"if (ready) launch(42);"}
                                </span>
                                <span className="font-setting-card__copy">
                                  <strong>{font.label}</strong>
                                  {font.description ? <small>{font.description}</small> : null}
                                </span>
                                <span className="font-setting-card__check" aria-hidden="true">
                                  {selected ? <Check size={14} /> : null}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <label className="plugin-setting">
                          <span className="plugin-setting__copy">
                            <strong>Tamanho da fonte do editor</strong>
                            <small>
                              Entre {workbenchFontDefaults.minEditorFontSize} e {workbenchFontDefaults.maxEditorFontSize} pixels.
                            </small>
                          </span>
                          <input
                            className="plugin-setting__control plugin-setting__control--number"
                            type="number"
                            min={workbenchFontDefaults.minEditorFontSize}
                            max={workbenchFontDefaults.maxEditorFontSize}
                            value={fontPreferences.editorFontSize}
                            onChange={(event) => updateFontPreferences({ editorFontSize: Number(event.target.value) })}
                          />
                        </label>
                        <div className="plugin-setting-note">
                          <strong>Interface</strong>
                          <small>Fonte usada em menus, painéis e demais superfícies da IDE.</small>
                        </div>
                        <div className="font-setting-grid" role="radiogroup" aria-label="Fonte da interface">
                          {availableInterfaceFonts.map((font) => {
                            const selected = activeInterfaceFont?.id === font.id;
                            return (
                              <button
                                className={`font-setting-card${selected ? " is-active" : ""}`}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                key={font.id}
                                onClick={() => updateFontPreferences({ interfaceFontId: font.id })}
                              >
                                <span
                                  className="font-setting-card__preview"
                                  aria-hidden="true"
                                  style={{ fontFamily: font.family }}
                                >
                                  Explorar, Executar e Depurar
                                </span>
                                <span className="font-setting-card__copy">
                                  <strong>{font.label}</strong>
                                  {font.description ? <small>{font.description}</small> : null}
                                </span>
                                <span className="font-setting-card__check" aria-hidden="true">
                                  {selected ? <Check size={14} /> : null}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  ) : settingsSectionId === "watcher" ? (
                    <>
                      <div className="settings-section-heading">
                        <span className="settings-section-heading__icon"><Eye size={18} /></span>
                        <div>
                          <span className="eyebrow">NATIVO</span>
                          <h3>Vigia de arquivos</h3>
                          <p>Diretórios ignorados ao observar mudanças no workspace no app desktop.</p>
                        </div>
                      </div>
                      <div className="plugin-setting-list">
                        <div className="plugin-setting-note">
                          <strong>Padrões</strong>
                          <small>Sempre ignorados, para evitar travamentos com diretórios pesados.</small>
                        </div>
                        <div className="watcher-ignored-chips">
                          {desktopWatcherDefaultIgnoredDirectories().map((name) => (
                            <span className="watcher-ignored-chip watcher-ignored-chip--default" key={name}>{name}</span>
                          ))}
                        </div>
                        <div className="plugin-setting-note">
                          <strong>Personalizados</strong>
                          <small>Adicione outros nomes de diretório para ignorar neste projeto. Use * como coringa, ex.: .* para ignorar tudo que começa com ponto.</small>
                        </div>
                        {watcherDraftDirectories.length ? (
                          <div className="watcher-ignored-chips">
                            {watcherDraftDirectories.map((name) => (
                              <span className="watcher-ignored-chip" key={name}>
                                {name}
                                <button
                                  type="button"
                                  aria-label={`Remover ${name}`}
                                  disabled={!workspaceRoot}
                                  onClick={() => removeWatcherDraftDirectory(name)}
                                >
                                  <X size={12} />
                                </button>
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <div className="watcher-ignored-add">
                          <input
                            type="text"
                            placeholder="ex.: .cache-local ou .*"
                            value={watcherIgnoredDraft}
                            disabled={!workspaceRoot}
                            onChange={(event) => setWatcherIgnoredDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                invoke(() => addWatcherIgnoredDirectory());
                              }
                            }}
                          />
                          <button
                            className="button"
                            type="button"
                            disabled={!workspaceRoot || !watcherIgnoredDraft.trim()}
                            onClick={() => invoke(() => addWatcherIgnoredDirectory())}
                          >
                            <WorkbenchIcon icon="plus" size={14} /> Adicionar
                          </button>
                        </div>
                      </div>
                    </>
                  ) : activePluginSettingsProvider ? (
                    <>
                      <div className="settings-section-heading">
                        <span className="settings-section-heading__icon"><WorkbenchIcon icon="plugins" size={18} /></span>
                        <div>
                          <span className="eyebrow">PLUGIN</span>
                          <h3>{activePluginSettingsProvider.title}</h3>
                          <p>{activePluginSettingsProvider.description ?? "Configurações do plugin."}</p>
                        </div>
                      </div>
                      <div className="plugin-setting-list">
                        {activePluginSettingsProvider.settings.map((setting) => setting.type === "stringArray" ? (
                          <div className={`plugin-setting plugin-setting--${setting.type}`} key={setting.id}>
                            <span className="plugin-setting__copy">
                              <strong>{setting.label}</strong>
                              {setting.description ? <small>{setting.description}</small> : null}
                            </span>
                            <div className="plugin-setting__string-array">
                              <div className="watcher-ignored-chips">
                                {resolvePluginStringArraySettingValue(setting, pluginSettingsDraft).map((entry) => (
                                  <span className="watcher-ignored-chip" key={entry}>
                                    {entry}
                                    <button
                                      type="button"
                                      aria-label={`Remover ${entry}`}
                                      disabled={activePluginSettingsProvider.scope === "project" && !workspaceRoot}
                                      onClick={() => invoke(() => removePluginStringArraySetting(setting.id, entry))}
                                    >
                                      <X size={12} />
                                    </button>
                                  </span>
                                ))}
                              </div>
                              <div className="watcher-ignored-add">
                                <input
                                  type="text"
                                  placeholder={setting.inputPlaceholder}
                                  value={pluginStringArrayDrafts[setting.id] ?? ""}
                                  disabled={activePluginSettingsProvider.scope === "project" && !workspaceRoot}
                                  onChange={(event) => setPluginStringArrayDrafts((drafts) => ({
                                    ...drafts,
                                    [setting.id]: event.target.value,
                                  }))}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      invoke(() => addPluginStringArraySetting(setting.id));
                                    }
                                  }}
                                />
                                <button
                                  className="button"
                                  type="button"
                                  disabled={(activePluginSettingsProvider.scope === "project" && !workspaceRoot) || !(pluginStringArrayDrafts[setting.id] ?? "").trim()}
                                  onClick={() => invoke(() => addPluginStringArraySetting(setting.id))}
                                >
                                  <WorkbenchIcon icon="plus" size={14} /> {setting.addLabel ?? "Adicionar"}
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <label className={`plugin-setting plugin-setting--${setting.type}`} key={setting.id}>
                            <span className="plugin-setting__copy">
                              <strong>{setting.label}</strong>
                              {setting.description ? <small>{setting.description}</small> : null}
                            </span>
                            {setting.type === "boolean" ? (
                              <span className="settings-switch">
                                <input
                                  type="checkbox"
                                  checked={resolvePluginBooleanSettingValue(setting, pluginSettingsDraft)}
                                  disabled={activePluginSettingsProvider.scope === "project" && !workspaceRoot}
                                  onChange={(event) => invoke(() => applyPluginSetting(setting.id, event.target.checked))}
                                />
                                <i aria-hidden="true" />
                              </span>
                            ) : setting.type === "select" ? (
                              <select
                                className="plugin-setting__control"
                                value={String(pluginSettingsDraft[setting.id] ?? setting.defaultValue)}
                                disabled={activePluginSettingsProvider.scope === "project" && !workspaceRoot}
                                onChange={(event) => invoke(() => applyPluginSetting(setting.id, event.target.value))}
                              >
                                {setting.options.map((option) => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                            ) : setting.type === "string" ? (
                              <input
                                className="plugin-setting__control plugin-setting__control--string"
                                type="text"
                                value={String(pluginSettingsDraft[setting.id] ?? setting.defaultValue)}
                                placeholder={setting.placeholder}
                                disabled={activePluginSettingsProvider.scope === "project" && !workspaceRoot}
                                onChange={(event) => invoke(() => applyPluginSetting(setting.id, event.target.value))}
                              />
                            ) : (
                              <input
                                className="plugin-setting__control plugin-setting__control--number"
                                type="number"
                                value={Number(pluginSettingsDraft[setting.id] ?? setting.defaultValue)}
                                min={setting.min}
                                max={setting.max}
                                step={setting.step}
                                disabled={activePluginSettingsProvider.scope === "project" && !workspaceRoot}
                                onChange={(event) => {
                                  const value = event.target.valueAsNumber;
                                  if (Number.isFinite(value)) invoke(() => applyPluginSetting(setting.id, value));
                                }}
                              />
                            )}
                          </label>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="settings-empty-state">Esta seção não está mais disponível.</p>
                  )}
                </section>
              </div>
              <div className="settings-dialog__footer">
                {settingsSectionId === "watcher" && !workspaceRoot ? (
                  <p className="settings-scope-note"><WorkbenchIcon icon="problems" size={14} /> Abra um workspace para alterar esta configuração.</p>
                ) : activePluginSettingsProvider?.scope === "project" && !workspaceRoot ? (
                  <p className="settings-scope-note"><WorkbenchIcon icon="problems" size={14} /> Abra um workspace para alterar esta configuração.</p>
                ) : settingsSectionId === "watcher" ? (
                  <p className="settings-scope-note"><Check size={14} /> Alterações só são aplicadas ao clicar em "Concluir".</p>
                ) : (
                  <p className="settings-scope-note"><Check size={14} /> Alterações salvas automaticamente.</p>
                )}
                <button
                  className="button primary"
                  type="button"
                  onClick={() => invoke(async () => {
                    await commitWatcherDraftDirectories();
                    setSettingsOpen(false);
                  })}
                >
                  Concluir
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        <Dialog.Root open={lintSettingsOpen} onOpenChange={setLintSettingsOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content className="lint-settings-dialog">
              <div className="dialog-heading">
                <div>
                  <span className="eyebrow">ANÁLISE</span>
                  <Dialog.Title>Configurar lint</Dialog.Title>
                  <Dialog.Description>
                    Selecione os casos que {activeLanguageProvider?.name ?? "o provider"} deve detectar neste workspace.
                  </Dialog.Description>
                </div>
                <Dialog.Close asChild><button className="icon-button" type="button" aria-label="Fechar"><X size={16} /></button></Dialog.Close>
              </div>
              <div className="lint-rule-list">
                {(activeLanguageProvider?.lintRules ?? []).map((rule) => (
                  <label className="lint-rule" key={rule.id}>
                    <input
                      type="checkbox"
                      checked={lintEnabledRuleIds.includes(rule.id)}
                      onChange={(event) => {
                        const next = event.target.checked
                          ? [...new Set([...lintEnabledRuleIds, rule.id])]
                          : lintEnabledRuleIds.filter((id) => id !== rule.id);
                        setLintEnabledRuleIds(next);
                        if (activeLanguageProvider) {
                          void updateWorkspaceSettings((current) => ({
                            ...current,
                            lint: {
                              ...current.lint,
                              [activeLanguageProvider.id]: { enabledRuleIds: next },
                            },
                          })).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
                        }
                      }}
                    />
                    <span><strong>{rule.label}</strong>{rule.description ? <small>{rule.description}</small> : null}</span>
                  </label>
                ))}
              </div>
              <div className="dialog-actions">
                <Dialog.Close asChild><button className="button primary" type="button">Concluir</button></Dialog.Close>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        <EnvironmentBrowserDialog
          mode={environmentBrowserMode}
          executableOnly={environmentBrowserExecutableOnly}
          listing={environmentListing}
          filter={environmentBrowserFilter}
          hidden={environmentBrowserHidden}
          selection={environmentBrowserSelection}
          onClose={cancelEnvironmentBrowser}
          onFilterChange={setEnvironmentBrowserFilter}
          onHiddenChange={(checked) => {
            setEnvironmentBrowserHidden(checked);
            invoke(() => loadEnvironmentBrowser(environmentBrowserMode ?? "directory", environmentListing?.path, checked));
          }}
          onNavigate={(path) => invoke(() => navigateEnvironmentBrowser(path))}
          onSelect={setEnvironmentBrowserSelection}
          onConfirm={() => invoke(confirmEnvironmentBrowser)}
        />

        {contextMenu ? (
          <ResourceContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={contextMenu.items}
            disabled={busy}
            ariaLabel={`Ações de ${contextMenu.target.kind === "root"
              ? workspaceName
              : contextMenu.target.kind === "entry"
                ? contextMenu.target.entry.name
                : contextMenu.target.kind === "document"
                  ? contextMenu.target.document.name
                  : contextMenu.target.kind === "editor"
                    ? contextMenu.target.context.document.name
                    : "texto selecionado"}`}
            onExecute={(item) => invoke(() => executeContextMenuItem(item, contextMenu.target))}
          />
        ) : null}

        {completionSession ? (
          <CompletionPopup
            session={completionSession}
            onSelect={(index) => setCompletionSession((current) => current ? { ...current, selectedIndex: index } : current)}
            onCommit={(index) => {
              if (editorRef.current) commitCompletion(editorRef.current, index);
            }}
          />
        ) : null}

        {projectOpenDialog ? (
          <ProjectOpenDialog
            recentProjects={recentProjects}
            target={projectOpenTarget}
            rememberChoice={rememberProjectOpenTarget}
            desktop={isDesktopHost()}
            busy={projectOpenBusy}
            onTargetChange={setProjectOpenTarget}
            onRememberChoiceChange={setRememberProjectOpenTarget}
            onChooseProject={() => invoke(chooseProjectDirectory)}
            onOpenRecent={(project) => invoke(() => openRecentProject(project))}
            onRemoveRecent={(project) => invoke(async () => {
              await removeRecentProject(project.id);
              setRecentProjects(await readRecentProjects());
            })}
            onClose={() => setProjectOpenDialog(false)}
          />
        ) : null}

        {error ? (
          <div className="error-toast" role="alert">
            <span>{error}</span>
            <button className="icon-button small" type="button" aria-label="Fechar erro" onClick={() => setError(undefined)}><X size={14} /></button>
          </div>
        ) : null}

        {pluginPendingRemoval ? (
          <ConfirmationDialog
            titleId="plugin-removal-title"
            title="Remover plugin?"
            confirmLabel="Remover"
            onCancel={() => setPluginRemovalId(undefined)}
            onConfirm={() => invoke(async () => {
              await platform.uninstall(pluginPendingRemoval.manifest.id);
              setPluginRemovalId(undefined);
            })}
          >
            <p>O plugin <strong>{pluginPendingRemoval.manifest.name}</strong> será desativado e removido da aplicação.</p>
          </ConfirmationDialog>
        ) : null}

        {pluginConfirm ? (
          <ConfirmationDialog
            titleId="plugin-confirm-title"
            title={pluginConfirm.title}
            confirmLabel={pluginConfirm.confirmLabel ?? "Confirmar"}
            cancelLabel={pluginConfirm.cancelLabel ?? "Cancelar"}
            danger={pluginConfirm.danger !== false}
            onCancel={() => resolvePluginConfirm(false)}
            onConfirm={() => resolvePluginConfirm(true)}
          >
            <p>{pluginConfirm.message}</p>
            {pluginConfirm.detail ? <p className="muted">{pluginConfirm.detail}</p> : null}
          </ConfirmationDialog>
        ) : null}

        {explorerPendingDeletion ? (
          <ConfirmationDialog
            titleId="explorer-removal-title"
            title={<>Excluir {explorerPendingDeletion.length === 1
              ? explorerPendingDeletion[0]?.kind === "directory" ? "pasta" : "arquivo"
              : `${explorerPendingDeletion.length} itens`}?</>}
            confirmLabel="Excluir"
            onCancel={() => setExplorerPendingDeletion(undefined)}
            onConfirm={() => invoke(async () => {
              await deleteExplorerEntries(explorerPendingDeletion);
              setExplorerPendingDeletion(undefined);
            })}
          >
            <p>
              {explorerPendingDeletion.length === 1 ? (
                <><strong>{explorerPendingDeletion[0]?.name}</strong> será removido do workspace
                {explorerPendingDeletion[0]?.kind === "directory" ? " com todo o conteúdo interno." : "."}</>
              ) : (
                <>Os <strong>{explorerPendingDeletion.length} itens selecionados</strong> serão removidos do workspace. Pastas incluem todo o conteúdo interno.</>
              )}
            </p>
          </ConfirmationDialog>
        ) : null}
      </div>
    </Tooltip.Provider>
  );
}
