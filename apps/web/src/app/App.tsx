import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Tabs from "@radix-ui/react-tabs";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  ArrowLeft,
  ArrowUpCircle,
  Bug,
  Box,
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
  HardDrive,
  History,
  Info,
  Image as ImageIcon,
  LocateFixed,
  MoreVertical,
  Package,
  PackageCheck,
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
  Undo2,
  Upload,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { formatCommandLineArguments, parseCommandLineArguments } from "@tinyide/core";
import {
  TEXT_EDITOR_DOCUMENT_CHANGED_EVENT,
  TEXT_EDITOR_DOCUMENT_SAVED_EVENT,
  WORKSPACE_RESOURCES_CHANGED_EVENT,
} from "@tinyide/plugin-api";
import type {
  DebugAdapterProvider,
  DebugBreakpoint,
  DebugSessionSnapshot,
  DebugVariable,
  ExecutionEnvironment,
  ExecutionEnvironmentDirectoryListing,
  ExecutionEnvironmentPackageInventory,
  ExecutionEnvironmentProvider,
  ExecutionProfile,
  ExecutionProfileExecutableOption,
  ExecutionProfilePresetContribution,
  LanguageLintSettings,
  LanguageProvider,
  PluginSettingValues,
  ResourceContext,
  ResourceDecoration,
  ResourceContextMenuItem,
  ResourceContextMenuProvider,
  TextEditorDocumentChangedEvent,
  TextEditorDocumentSnapshot,
  TextEditorDocumentSavedEvent,
  TextEditorLineDecoration,
  TextDiagnostic,
  WorkbenchDialogContribution,
  WorkbenchEditorToolbarItem,
  WorkbenchEditorToolbarProvider,
  WorkbenchActivityIcon,
  WorkbenchPanelContribution,
  WorkbenchPanelHookContribution,
  WorkbenchTabApi,
  WorkbenchTabContribution,
  WorkbenchPanelHook,
  WorkbenchResourceEditorProvider,
  WorkbenchSidebarContribution,
  WorkbenchSidebarHook,
  WorkbenchStateApi,
  WorkbenchStateSnapshot,
  WorkbenchTitlebarContribution,
  WorkbenchToolWindowContribution,
  WorkbenchToolWindowHookContribution,
  WorkbenchToolWindowHook,
  WorkspaceFileCreationOption,
  WorkspaceFileCreationProvider,
  WorkspaceResourcesChangedEvent,
} from "@tinyide/plugin-api";
import {
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

export function editorToolbarDocumentSnapshot(document: OpenDocument): TextEditorDocumentSnapshot {
  return {
    id: document.id,
    name: document.name,
    ...(document.path ? { path: document.path } : {}),
    ...(document.workspaceRoot ? { workspaceRoot: document.workspaceRoot } : {}),
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
  findWorkspaceEntry,
  flattenVisibleEntries,
  joinWorkspacePath,
  nearestRemainingItemId,
  nextExplorerHiddenVisibility,
  parentEntryPath,
  remapOpenDocumentResource,
  replaceWorkspacePathPrefix,
  workspacePathBelongsToResource,
  workspacePathName,
  workspacePathParent,
  workspacePathContainsHiddenSegment,
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
import { reconcileOpenDocumentsAfterWorkspaceChange } from "./workspace-resource-reconciliation";
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
  readReactSnapshot,
  readSession,
  restoreWorkspaceDocuments,
  writeReactSnapshot,
  writeSession,
  type PersistedSidebarView,
} from "./persistence";
import { resolveSyntaxHighlighter, type SyntaxHighlighter } from "./generic-syntax";
import {
  debugAdapterProviders,
  debugAdapterForProfile,
  environmentProvider,
  hostProcessOutputLines,
  languageProviderFor,
  lintDocument,
  loadEnvironments,
  loadProfileContributions,
  listHostProcesses,
  readHostContext,
  readHostProcess,
  runExecutionProfile,
  sendDebugCommand,
  startDebugProfile,
  runScript,
  clearHostWorkspace,
  pluginSettingsProviders,
  resourceIconFor,
  resourceDecorationProviders,
  resourceEditorProviderFor,
  scriptExecutionFor,
  setHostWorkspace,
  stopHostProcess,
  textEditorLineDecorationProviders,
  workbenchResourceDescriptor,
} from "./runtime";
import { restoreActiveDebugSession } from "./debug-session-state";
import {
  DEFAULT_DEBUG_PANEL_LAYOUT,
  EMPTY_DEBUG_OUTPUT_OFFSETS,
  clampDebugInspectorWidth,
  debugOutputOffsetsFor,
  debugOutputSegments,
  filterDebugVariables,
  normalizeDebugPanelLayout,
  type DebugOutputFilter,
  type DebugOutputOffsets,
} from "./debug-panel";
import {
  isDesktopHost,
  isDesktopWorkspaceHandle,
  pickWorkspaceDirectory,
  restoreDesktopWorkspaceHandle,
  restoreLastDesktopWorkspaceHandle,
  workspaceRootHintForHandle,
} from "./workspace-host";
import {
  resolvePluginSettingValues,
  updatePluginSettingValue,
} from "./plugin-settings";
import { editorLineNumbers, resolveEditorSettings } from "./editor-settings";
import {
  closeSidebarForSide,
  maximumSidebarWidth,
  moveOpenSidebar,
  reconcileToolWindowLayout,
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

const PROFILE_KEY = "tinyide.react.executionProfiles.v1";
const LINT_SETTINGS_KEY = "tinyide.react.lintSettings.v1";

type SidebarView = PersistedSidebarView;

type StoredProfiles = WorkspaceExecutionProfiles;

type ContextMenuTarget =
  | { readonly kind: "root" }
  | { readonly kind: "entry"; readonly entry: WorkspaceEntry }
  | { readonly kind: "document"; readonly document: OpenDocument };

interface ContextMenuState {
  readonly target: ContextMenuTarget;
  readonly x: number;
  readonly y: number;
  readonly items: readonly ResourceContextMenuItem[];
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

function expandWorkbenchPanelContribution(
  contribution: WorkbenchPanelHookContribution,
): readonly WorkbenchPanelContribution[] {
  if (!("tabs" in contribution)) return [contribution];
  return contribution.tabs.map((tab) => ({
    id: tab.id,
    pluginId: contribution.pluginId,
    label: tab.label,
    ...((tab.order ?? contribution.order) !== undefined ? { order: tab.order ?? contribution.order } : {}),
    mount: tab.mount,
  }));
}

function expandWorkbenchToolWindowContribution(
  contribution: WorkbenchToolWindowHookContribution,
): readonly WorkbenchToolWindowContribution[] {
  if (!("views" in contribution)) return [contribution];
  return [{
    id: contribution.id,
    pluginId: contribution.pluginId,
    label: contribution.label,
    ...(contribution.icon ? { icon: contribution.icon } : {}),
    ...(contribution.order !== undefined ? { order: contribution.order } : {}),
    mount({ container, headerContainer, tabs, state }) {
      container.replaceChildren();
      const views = [...contribution.views]
        .sort((left, right) =>
          Number(left.placement === "end") - Number(right.placement === "end")
          || (left.order ?? 0) - (right.order ?? 0)
          || left.label.localeCompare(right.label));
      const sections = new Map<string, HTMLElement>();
      const tabDisposables: Array<{ dispose(): void }> = [];
      const mountedDisposables: Array<{ dispose(): void }> = [];
      let disposed = false;

      const activate = (id: string) => {
        for (const [viewId, section] of sections) section.hidden = viewId !== id;
      };

      for (const view of views) {
        const section = document.createElement("section");
        section.className = "workbench-tool-window-view";
        section.dataset.viewId = view.id;
        section.hidden = true;
        container.append(section);
        sections.set(view.id, section);
        tabDisposables.push(tabs.register({
          id: view.id,
          label: view.label,
          ...(view.order !== undefined ? { order: view.order } : {}),
          ...(view.placement ? { placement: view.placement } : {}),
          onSelect: () => activate(view.id),
        }));
        try {
          const mounted = view.mount({ container: section, state });
          if (mounted && typeof (mounted as PromiseLike<unknown>).then === "function") {
            void Promise.resolve(mounted).then((result) => {
              if (!result) return;
              if (disposed) result.dispose();
              else mountedDisposables.push(result);
            }).catch((cause) => {
              if (!disposed) section.textContent = cause instanceof Error ? cause.message : String(cause);
            });
          } else if (mounted) {
            mountedDisposables.push(mounted as { dispose(): void });
          }
        } catch (cause) {
          section.textContent = cause instanceof Error ? cause.message : String(cause);
        }
      }

      const firstView = views[0];
      if (firstView) tabs.select(firstView.id);
      return {
        dispose() {
          disposed = true;
          mountedDisposables.forEach((item) => item.dispose());
          tabDisposables.forEach((item) => item.dispose());
          container.replaceChildren();
        },
      };
    },
  }];
}

function createWorkbenchTabApi(container: HTMLElement): WorkbenchTabApi & { dispose(): void } {
  const strip = document.createElement("div");
  strip.className = "workbench-tab-strip";
  container.append(strip);
  const tabs = new Map<string, { contribution: WorkbenchTabContribution; element: HTMLDivElement }>();
  let activeId: string | undefined;

  const renderSelection = () => {
    for (const [id, record] of tabs) {
      const active = id === activeId;
      record.element.classList.toggle("is-active", active);
      record.element.querySelector("button[role='tab']")?.setAttribute("aria-selected", String(active));
    }
  };

  const select = (id: string) => {
    const record = tabs.get(id);
    if (!record) return;
    activeId = id;
    renderSelection();
    record.contribution.onSelect();
  };

  return {
    register(contribution) {
      if (tabs.has(contribution.id)) throw new Error(`Aba já registrada: ${contribution.id}`);
      const group = document.createElement("div");
      group.className = "workbench-tab-group";
      group.classList.toggle("is-end", contribution.placement === "end");
      const button = document.createElement("button");
      button.type = "button";
      button.role = "tab";
      button.className = "workbench-tab";
      button.textContent = contribution.label;
      button.addEventListener("click", () => select(contribution.id));
      group.append(button);
      if (contribution.closable) {
        const closeButton = document.createElement("button");
        closeButton.type = "button";
        closeButton.className = "workbench-tab-close";
        closeButton.setAttribute("aria-label", `Fechar ${contribution.label}`);
        closeButton.textContent = "×";
        closeButton.addEventListener("click", (event) => {
          event.stopPropagation();
          void contribution.onClose?.();
        });
        group.append(closeButton);
      }
      tabs.set(contribution.id, { contribution, element: group });
      const ordered = [...tabs.entries()].sort(([, left], [, right]) =>
        Number(left.contribution.placement === "end") - Number(right.contribution.placement === "end")
        ||
        (left.contribution.order ?? 0) - (right.contribution.order ?? 0)
        || left.contribution.label.localeCompare(right.contribution.label));
      for (const [, record] of ordered) record.element.classList.remove("is-end-start");
      ordered.find(([, record]) => record.contribution.placement === "end")?.[1].element.classList.add("is-end-start");
      strip.replaceChildren(...ordered.map(([, record]) => record.element));
      if (!activeId) select(contribution.id);
      else renderSelection();
      return {
        dispose() {
          const wasActive = activeId === contribution.id;
          tabs.delete(contribution.id);
          group.remove();
          if (wasActive) {
            activeId = tabs.keys().next().value;
            if (activeId) select(activeId);
          }
        },
      };
    },
    select,
    activeId: () => activeId,
    dispose() {
      tabs.clear();
      activeId = undefined;
      strip.remove();
    },
  };
}

interface ActiveWorkbenchDialog {
  readonly token: symbol;
  readonly contribution: WorkbenchDialogContribution;
}

interface WorkbenchToolWindowViewRequest {
  readonly toolWindowId: string;
  readonly viewId: string;
  readonly sequence: number;
}

function lineDecorationClassName(decorations: readonly TextEditorLineDecoration[]): string {
  const kinds = [...new Set(decorations.map((decoration) => decoration.kind))];
  return kinds.map((kind) => ` has-${kind}`).join("");
}

function lintSettingsStorageKey(workspaceName: string, providerId: string): string {
  return `${LINT_SETTINGS_KEY}:${encodeURIComponent(workspaceName)}:${encodeURIComponent(providerId)}`;
}

function defaultLintSettings(provider: LanguageProvider): LanguageLintSettings {
  const defaults = (provider.lintRules ?? [])
    .filter((rule) => rule.defaultEnabled)
    .map((rule) => rule.id);
  return { enabledRuleIds: defaults };
}

function readLegacyLintSettings(workspaceName: string, provider: LanguageProvider): LanguageLintSettings | undefined {
  try {
    const raw = localStorage.getItem(lintSettingsStorageKey(workspaceName, provider.id));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<LanguageLintSettings>;
    return {
      enabledRuleIds: Array.isArray(parsed.enabledRuleIds)
        ? parsed.enabledRuleIds.filter((value): value is string => typeof value === "string")
        : defaultLintSettings(provider).enabledRuleIds,
    };
  } catch {
    return undefined;
  }
}

function makeProfile(): ExecutionProfile {
  const id = `profile-${crypto.randomUUID()}`;
  return {
    id,
    name: "Novo perfil",
    environment: { mode: "none" },
    saveBeforeRun: true,
    steps: [
      {
        id: "step-1",
        name: "Executar",
        executable: "",
        command: "",
        parameters: [],
        workingDirectory: "${workspaceRoot}",
      },
    ],
  };
}

function profileStorageKey(workspaceName: string): string {
  const scope = workspaceName && workspaceName !== "Sem workspace" ? workspaceName : "global";
  return `${PROFILE_KEY}:${scope}`;
}

function readLegacyProfiles(workspaceName: string): StoredProfiles | undefined {
  try {
    const scopedKey = profileStorageKey(workspaceName);
    let raw = localStorage.getItem(scopedKey);
    if (!raw) {
      raw = localStorage.getItem(PROFILE_KEY);
      if (raw) {
        localStorage.setItem(scopedKey, raw);
        localStorage.removeItem(PROFILE_KEY);
      }
    }
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as StoredProfiles;
    const result = {
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
      ...(typeof parsed.selectedId === "string" ? { selectedId: parsed.selectedId } : {}),
    };
    if (!localStorage.getItem(scopedKey)) localStorage.setItem(scopedKey, JSON.stringify(result));
    return result;
  } catch {
    return undefined;
  }
}

function parseEnvironmentVariables(value: string): Readonly<Record<string, string>> {
  const variables: Record<string, string> = {};
  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) throw new Error(`Variável de ambiente inválida: ${line}`);
    const name = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Nome de variável inválido: ${name}`);
    variables[name] = line.slice(separator + 1);
  }
  return variables;
}

function environmentVariablesText(value: Readonly<Record<string, string>> | undefined): string {
  return Object.entries(value ?? {}).map(([name, item]) => `${name}=${item}`).join("\n");
}

function IconButton({
  label,
  children,
  onClick,
  onKeyDown,
  active = false,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
  readonly onClick: () => void;
  readonly onKeyDown?: React.KeyboardEventHandler<HTMLButtonElement>;
  readonly active?: boolean;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          className={`icon-button${active ? " is-active" : ""}`}
          type="button"
          aria-label={label}
          onClick={onClick}
          onKeyDown={onKeyDown}
        >
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" side="right" sideOffset={8}>
          {label}
          <Tooltip.Arrow className="tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

interface PluginActivityButton extends ActivityButtonDescriptor {
  readonly id: string;
  readonly kind: "sidebar" | "toolWindow";
  readonly label: string;
  readonly icon?: WorkbenchActivityIcon;
}

function FixedActivitySlot({
  itemKey,
  side,
  draggingKey,
  spacer = false,
  children,
  onMove,
  onDragStateChange,
}: {
  readonly itemKey: string;
  readonly side: ActivityBarSide;
  readonly draggingKey?: string;
  readonly spacer?: boolean;
  readonly children?: React.ReactNode;
  readonly onMove: (
    key: string,
    side: ActivityBarSide,
    targetKey?: string,
    placeAfter?: boolean,
  ) => void;
  readonly onDragStateChange: (key?: string) => void;
}) {
  return (
    <div
      className={`activity-fixed-slot${spacer ? " activity-spacer" : " activity-button-slot"}${draggingKey ? " is-drag-active" : ""}${draggingKey === itemKey ? " is-dragging" : ""}`}
      data-activity-key={itemKey}
      draggable={!spacer}
      onDragStart={spacer ? undefined : (event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/x-tinyide-activity-button", itemKey);
        onDragStateChange(itemKey);
      }}
      onDragEnd={spacer ? undefined : () => onDragStateChange()}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("text/x-tinyide-activity-button")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        const key = event.dataTransfer.getData("text/x-tinyide-activity-button");
        if (!key) return;
        event.preventDefault();
        event.stopPropagation();
        const bounds = event.currentTarget.getBoundingClientRect();
        onMove(key, side, itemKey, event.clientY >= bounds.top + bounds.height / 2);
        onDragStateChange();
      }}
      onKeyDown={spacer ? undefined : (event) => {
        if (!event.altKey) return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          onMove(itemKey, event.key === "ArrowLeft" ? "left" : "right");
        } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          const sibling = event.key === "ArrowUp"
            ? event.currentTarget.previousElementSibling
            : event.currentTarget.nextElementSibling;
          const targetKey = sibling instanceof HTMLElement ? sibling.dataset.activityKey : undefined;
          if (targetKey) onMove(itemKey, side, targetKey, event.key === "ArrowDown");
        }
      }}
    >
      {children}
    </div>
  );
}

function MovableActivityButton({
  item,
  side,
  active,
  dragging,
  dragActive,
  onActivate,
  onMove,
  onDragStateChange,
}: {
  readonly item: PluginActivityButton;
  readonly side: ActivityBarSide;
  readonly active: boolean;
  readonly dragging: boolean;
  readonly dragActive: boolean;
  readonly onActivate: () => void;
  readonly onMove: (
    key: string,
    side: ActivityBarSide,
    targetKey?: string,
    placeAfter?: boolean,
  ) => void;
  readonly onDragStateChange: (key?: string) => void;
}) {
  return (
    <div
      className={`activity-button-slot${dragActive ? " is-drag-active" : ""}${dragging ? " is-dragging" : ""}`}
      data-activity-key={item.key}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/x-tinyide-activity-button", item.key);
        onDragStateChange(item.key);
      }}
      onDragEnd={() => onDragStateChange()}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("text/x-tinyide-activity-button")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        const key = event.dataTransfer.getData("text/x-tinyide-activity-button");
        if (!key) return;
        event.preventDefault();
        event.stopPropagation();
        const bounds = event.currentTarget.getBoundingClientRect();
        onMove(key, side, item.key, event.clientY >= bounds.top + bounds.height / 2);
        onDragStateChange();
      }}
    >
      <IconButton
        label={item.label}
        active={active}
        onClick={onActivate}
        onKeyDown={(event) => {
          if (!event.altKey) return;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            onMove(item.key, event.key === "ArrowLeft" ? "left" : "right");
          } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            const slot = event.currentTarget.closest<HTMLElement>(".activity-button-slot");
            const sibling = event.key === "ArrowUp"
              ? slot?.previousElementSibling
              : slot?.nextElementSibling;
            const targetKey = sibling instanceof HTMLElement ? sibling.dataset.activityKey : undefined;
            if (targetKey) onMove(item.key, side, targetKey, event.key === "ArrowDown");
          }
        }}
      >
        <WorkbenchActivityIconView icon={item.icon} />
      </IconButton>
    </div>
  );
}

function ButtonTooltip({
  label,
  children,
  side = "bottom",
}: {
  readonly label: string;
  readonly children: React.ReactElement;
  readonly side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" side={side} sideOffset={6}>
          {label}
          <Tooltip.Arrow className="tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function workspaceRelativeDebugPath(path: string | undefined, root: string | undefined): string | undefined {
  if (!path) return undefined;
  const normalized = path.replaceAll("\\", "/");
  const normalizedRoot = root?.replaceAll("\\", "/").replace(/\/$/, "");
  if (normalizedRoot && normalized.startsWith(`${normalizedRoot}/`)) return normalized.slice(normalizedRoot.length + 1);
  return normalized.replace(/^\.\//, "");
}

function formattedDebugValue(value: string, type?: string): { text: string; kind: string } {
  const normalizedType = type?.toLocaleLowerCase() ?? "";
  const trimmed = value.trim();
  const kind = normalizedType.includes("bool") || /^(true|false)$/i.test(trimmed)
    ? "boolean"
    : normalizedType.includes("int") || normalizedType.includes("float") || normalizedType.includes("number") || /^-?\d+(?:\.\d+)?$/.test(trimmed)
      ? "number"
      : normalizedType.includes("none") || normalizedType.includes("null") || /^(none|null|undefined)$/i.test(trimmed)
        ? "null"
        : normalizedType.includes("str") || normalizedType.includes("string")
          ? "string"
          : "object";
  if (trimmed.length < 80 || !/^[\[{]/.test(trimmed)) return { text: value, kind };
  try {
    return { text: JSON.stringify(JSON.parse(trimmed), null, 2), kind };
  } catch {
    return { text: value, kind };
  }
}

function DebugVariableNode({ variable, depth = 0 }: { variable: DebugVariable; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const formatted = formattedDebugValue(variable.value, variable.type);
  const children = variable.children;
  const hasChildren = Boolean(children && children.length);
  return (
    <div className="debug-variable">
      <div className="debug-variable__row" style={{ paddingLeft: depth * 14 }}>
        {hasChildren ? (
          <button
            type="button"
            className="debug-variable__toggle"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="debug-variable__toggle debug-variable__toggle--spacer" aria-hidden="true" />
        )}
        <span className="debug-variable__name">{variable.name}</span>
        {variable.type ? <small className="debug-variable__type">{variable.type}</small> : null}
        <span className={`debug-variable__value is-${formatted.kind}`}>{formatted.text}</span>
      </div>
      {hasChildren && expanded ? (
        <div className="debug-variable__children">
          {children!.map((child, index) => (
            <DebugVariableNode key={`${child.name}-${index}`} variable={child} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function GitBrandIcon() {
  return (
    <svg className="workbench-brand-icon" data-workbench-icon="git" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#f05032" d="M12 1.55 22.45 12 12 22.45 1.55 12 12 1.55Z" />
      <path fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="m7.8 7.8 8.4 8.4M11.05 11.05l3.15-3.15" />
      <circle cx="7.8" cy="7.8" r="1.7" fill="#fff" />
      <circle cx="16.2" cy="7.8" r="1.7" fill="#fff" />
      <circle cx="16.2" cy="16.2" r="1.7" fill="#fff" />
    </svg>
  );
}

function DockerBrandIcon() {
  return (
    <svg className="workbench-brand-icon" data-workbench-icon="docker" viewBox="0 0 24 24" aria-hidden="true">
      <g fill="#2496ed">
        <rect x="3" y="8" width="3.2" height="2.8" rx=".35" />
        <rect x="6.7" y="8" width="3.2" height="2.8" rx=".35" />
        <rect x="10.4" y="8" width="3.2" height="2.8" rx=".35" />
        <rect x="6.7" y="4.7" width="3.2" height="2.8" rx=".35" />
        <rect x="10.4" y="4.7" width="3.2" height="2.8" rx=".35" />
        <rect x="10.4" y="1.4" width="3.2" height="2.8" rx=".35" />
        <rect x="14.1" y="8" width="3.2" height="2.8" rx=".35" />
        <path d="M22.55 9.8c-.85-.55-1.95-.7-2.93-.42-.12-1.02-.7-1.9-1.58-2.45l-.58-.36-.36.58c-.45.72-.58 1.57-.39 2.38H2.05c-.42 0-.76.34-.76.76 0 4.72 3.62 8.57 8.27 8.57 4.27 0 7.64-2.02 9.54-5.7 1.3.08 2.5-.43 3.28-1.44l.45-.58-.28-1.34Z" />
      </g>
      <circle cx="5.25" cy="13.05" r=".62" fill="#fff" />
    </svg>
  );
}

function NodeBrandIcon() {
  return (
    <svg className="workbench-brand-icon" data-workbench-icon="nodejs" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#5fa04e" d="M12 1.35 21.25 6.7v10.6L12 22.65 2.75 17.3V6.7L12 1.35Z" />
      <path fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.05" d="M7.2 16.5v-9l9.6 9v-9" />
      <circle cx="7.2" cy="7.5" r="1.15" fill="#fff" />
      <circle cx="16.8" cy="16.5" r="1.15" fill="#fff" />
    </svg>
  );
}

function PythonBrandIcon() {
  return (
    <svg className="workbench-brand-icon" data-workbench-icon="python" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#3776ab" d="M11.75 2C6.8 2 7.1 4.15 7.1 4.15v2.23h4.74v.67H5.22S2 6.68 2 11.74s2.82 4.88 2.82 4.88h1.69v-2.37s-.09-2.82 2.77-2.82h4.7s2.64.04 2.64-2.55V4.6S17.02 2 11.75 2Z" />
      <circle cx="9.12" cy="4.72" r=".78" fill="#fff" />
      <path fill="#ffd43b" d="M12.25 22c4.95 0 4.65-2.15 4.65-2.15v-2.23h-4.74v-.67h6.62S22 17.32 22 12.26s-2.82-4.88-2.82-4.88h-1.69v2.37s.09 2.82-2.77 2.82h-4.7s-2.64-.04-2.64 2.55v4.28S6.98 22 12.25 22Z" />
      <circle cx="14.88" cy="19.28" r=".78" fill="#fff" />
    </svg>
  );
}

function WorkbenchActivityIconView({ icon }: { readonly icon: WorkbenchActivityIcon | undefined }) {
  if (icon === "docker") return <DockerBrandIcon />;
  if (icon === "git" || icon === "source-control") return <GitBrandIcon />;
  if (icon === "nodejs") return <NodeBrandIcon />;
  if (icon === "python") return <PythonBrandIcon />;
  if (icon === "files") return <Files size={20} />;
  if (icon === "history") return <History size={20} />;
  if (icon === "terminal") return <Terminal size={20} />;
  return <Box size={20} />;
}

function ExplorerCreationRow({
  kind,
  name,
  error,
  onNameChange,
  onSubmit,
  onCancel,
}: {
  readonly kind: "file" | "directory";
  readonly name: string;
  readonly error: string | undefined;
  readonly onNameChange: (name: string) => void;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
}) {
  const label = kind === "directory" ? "Nome da nova pasta" : "Nome do novo arquivo";
  const rowRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
      rowRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      ref={rowRef}
      className="tree-entry-row tree-entry-row--creation"
      data-explorer-creation-row
    >
      <form
        className={`tree-entry tree-entry--${kind} tree-entry--creation${error ? " has-error" : ""}`}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        {kind === "directory"
          ? <Folder className="tree-entry__icon tree-entry__icon--directory" size={15} />
          : <File className="tree-entry__icon tree-entry__icon--file" size={15} />}
        <input
          ref={inputRef}
          autoFocus
          value={name}
          aria-label={label}
          placeholder={label}
          aria-invalid={Boolean(error)}
          onChange={(event) => onNameChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onCancel();
          }}
        />
        <button className="icon-button small" type="submit" aria-label="Confirmar criação"><Check size={13} /></button>
        <button className="icon-button small" type="button" aria-label="Cancelar criação" onClick={onCancel}><X size={13} /></button>
        {error ? <span className="tree-entry-rename-error" role="alert">{error}</span> : null}
      </form>
    </div>
  );
}

function EntryTree({
  entries,
  parentPath,
  expanded,
  showHidden,
  revealHidden,
  revealedHiddenPaths,
  highlightedPath,
  selectedPath,
  resourceDecorations,
  onToggle,
  onSelect,
  onOpen,
  onContextMenu,
  onMove,
  draggingPath,
  dropTargetPath,
  onDraggingPathChange,
  onDropTargetPathChange,
  onShowHiddenDirectory,
  renamePath,
  renameName,
  renameError,
  onRenameNameChange,
  onRenameSubmit,
  onRenameCancel,
  creationKind,
  creationParentPath,
  creationName,
  creationError,
  onCreationNameChange,
  onCreationSubmit,
  onCreationCancel,
  workspaceName,
  workspaceRoot,
}: {
  readonly entries: readonly WorkspaceEntry[];
  readonly parentPath: string;
  readonly expanded: ReadonlySet<string>;
  readonly showHidden: boolean;
  readonly revealHidden: boolean;
  readonly revealedHiddenPaths: ReadonlySet<string>;
  readonly highlightedPath: string | undefined;
  readonly selectedPath: string | undefined;
  readonly resourceDecorations: ReadonlyMap<string, ResourceDecoration>;
  readonly onToggle: (entry: WorkspaceEntry) => void;
  readonly onSelect: (entry: WorkspaceEntry) => void;
  readonly onOpen: (entry: WorkspaceEntry) => void;
  readonly onContextMenu: (entry: WorkspaceEntry, x: number, y: number) => void;
  readonly onMove: (sourcePath: string, targetDirectoryPath: string) => void;
  readonly draggingPath: string | undefined;
  readonly dropTargetPath: string | undefined;
  readonly onDraggingPathChange: (path: string | undefined) => void;
  readonly onDropTargetPathChange: (path: string | undefined) => void;
  readonly onShowHiddenDirectory: (path: string) => void;
  readonly renamePath: string | undefined;
  readonly renameName: string;
  readonly renameError: string | undefined;
  readonly onRenameNameChange: (name: string) => void;
  readonly onRenameSubmit: () => void;
  readonly onRenameCancel: () => void;
  readonly creationKind: "file" | "directory" | undefined;
  readonly creationParentPath: string;
  readonly creationName: string;
  readonly creationError: string | undefined;
  readonly onCreationNameChange: (name: string) => void;
  readonly onCreationSubmit: () => void;
  readonly onCreationCancel: () => void;
  readonly workspaceName: string;
  readonly workspaceRoot?: string;
}) {
  const visibleEntries = revealHidden
    ? entries
    : entries.filter((entry) => !entry.name.startsWith("."));
  const creationIndex = creationKind && creationParentPath === parentPath
    ? explorerCreationInsertionIndex(visibleEntries, creationKind, creationName.trim())
    : -1;
  const creationRow = creationKind && creationParentPath === parentPath ? (
    <ExplorerCreationRow
      kind={creationKind}
      name={creationName}
      error={creationError}
      onNameChange={onCreationNameChange}
      onSubmit={onCreationSubmit}
      onCancel={onCreationCancel}
    />
  ) : null;
  const treeItems: Array<
    | { readonly type: "creation" }
    | { readonly type: "entry"; readonly entry: WorkspaceEntry }
  > = visibleEntries.map((entry) => ({ type: "entry", entry }));
  if (creationRow) treeItems.splice(creationIndex, 0, { type: "creation" });

  return (
    <div className="tree" data-explorer-directory-path={parentPath}>
      {treeItems.map((item) => {
        if (item.type === "creation") {
          return <div key="explorer-creation-entry">{creationRow}</div>;
        }
        const { entry } = item;
        const contributedIcon = entry.kind === "file"
          ? resourceIconFor({
              kind: "file",
              name: entry.name,
              path: entry.path,
              ...(workspaceName !== "Sem workspace" ? { workspaceName } : {}),
              ...(workspaceRoot ? { workspaceRoot } : {}),
            })
          : undefined;
        const decoration = resourceDecorations.get(entry.path);
        return <div key={entry.path}>
          <div className="tree-entry-row">
            {renamePath === entry.path ? (
              <form className={`tree-entry tree-entry--${entry.kind} tree-entry--rename${renameError ? " has-error" : ""}`} onSubmit={(event) => { event.preventDefault(); onRenameSubmit(); }}>
                {entry.kind === "directory" ? <Folder className="tree-entry__icon tree-entry__icon--directory" size={15} /> : <File className="tree-entry__icon tree-entry__icon--file" size={15} />}
                <input
                  autoFocus
                  value={renameName}
                  aria-label={`Renomear ${entry.name}`}
                  aria-invalid={Boolean(renameError)}
                  onChange={(event) => onRenameNameChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") onRenameCancel();
                  }}
                />
                <button className="icon-button small" type="submit" aria-label="Confirmar renomeação"><Check size={13} /></button>
                <button className="icon-button small" type="button" aria-label="Cancelar renomeação" onClick={onRenameCancel}><X size={13} /></button>
                {renameError ? <span className="tree-entry-rename-error" role="alert">{renameError}</span> : null}
              </form>
            ) : (
              <button
                type="button"
                data-explorer-path={entry.path}
                data-explorer-kind={entry.kind}
                draggable
                className={`tree-entry tree-entry--${entry.kind}${highlightedPath === entry.path ? " is-new" : ""}${selectedPath === entry.path ? " is-selected" : ""}${draggingPath === entry.path ? " is-dragging" : ""}${dropTargetPath === entry.path ? " is-drop-target" : ""}`}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("application/x-tinyide-workspace-path", entry.path);
                  onDraggingPathChange(entry.path);
                }}
                onDragEnd={() => {
                  onDraggingPathChange(undefined);
                  onDropTargetPathChange(undefined);
                }}
                onDragOver={(event) => {
                  if (entry.kind !== "directory") return;
                  event.preventDefault();
                  event.stopPropagation();
                  event.dataTransfer.dropEffect = "move";
                  onDropTargetPathChange(entry.path);
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onDropTargetPathChange(undefined);
                }}
                onDrop={(event) => {
                  if (entry.kind !== "directory") return;
                  event.preventDefault();
                  event.stopPropagation();
                  const sourcePath = event.dataTransfer.getData("application/x-tinyide-workspace-path");
                  onDropTargetPathChange(undefined);
                  if (sourcePath) onMove(sourcePath, entry.path);
                }}
                onClick={() => {
                  if (entry.kind === "directory") {
                    onSelect(entry);
                    onToggle(entry);
                    return;
                  }
                  if (selectedPath === entry.path) {
                    onOpen(entry);
                    return;
                  }
                  onSelect(entry);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  onSelect(entry);
                  onContextMenu(entry, event.clientX, event.clientY);
                }}
              >
              {entry.kind === "directory" ? (
                expanded.has(entry.path) ? <ChevronDown size={14} /> : <ChevronRight size={14} />
              ) : (
                <span className="tree-spacer" />
              )}
              {entry.kind === "directory" ? (
                expanded.has(entry.path)
                  ? <FolderOpen className="tree-entry__icon tree-entry__icon--directory" size={15} />
                  : <Folder className="tree-entry__icon tree-entry__icon--directory" size={15} />
              ) : contributedIcon ? (
                <span
                  className="resource-icon"
                  title={contributedIcon.title}
                  style={{
                    color: contributedIcon.foreground ?? "currentColor",
                    background: contributedIcon.background ?? "transparent",
                  }}
                >{contributedIcon.label}</span>
              ) : (
                <File className="tree-entry__icon tree-entry__icon--file" size={15} />
              )}
              <span
                className="tree-entry__name"
                title={decoration?.tooltip}
                style={decoration?.foreground ? { color: decoration.foreground } : undefined}
              >{entry.name}</span>
              {decoration?.badge ? <span className="tree-entry__badge">{decoration.badge}</span> : null}
              </button>
            )}
          </div>
          {entry.kind === "directory" && expanded.has(entry.path) && (entry.children || creationParentPath === entry.path) ? (
            <div className="tree-children">
              {creationKind && creationParentPath === entry.path ? (
                <EntryTree
                  entries={entry.children ?? []}
                  parentPath={entry.path}
                  expanded={expanded}
                  showHidden={showHidden}
                  revealHidden={showHidden || revealedHiddenPaths.has(entry.path)}
                  revealedHiddenPaths={revealedHiddenPaths}
                  highlightedPath={highlightedPath}
                  selectedPath={selectedPath}
                  resourceDecorations={resourceDecorations}
                  onToggle={onToggle}
                  onSelect={onSelect}
                  onOpen={onOpen}
                  onContextMenu={onContextMenu}
                  onMove={onMove}
                  draggingPath={draggingPath}
                  dropTargetPath={dropTargetPath}
                  onDraggingPathChange={onDraggingPathChange}
                  onDropTargetPathChange={onDropTargetPathChange}
                  onShowHiddenDirectory={onShowHiddenDirectory}
                  renamePath={renamePath}
                  renameName={renameName}
                  renameError={renameError}
                  onRenameNameChange={onRenameNameChange}
                  onRenameSubmit={onRenameSubmit}
                  onRenameCancel={onRenameCancel}
                  creationKind={creationKind}
                  creationParentPath={creationParentPath}
                  creationName={creationName}
                  creationError={creationError}
                  onCreationNameChange={onCreationNameChange}
                  onCreationSubmit={onCreationSubmit}
                  onCreationCancel={onCreationCancel}
                  workspaceName={workspaceName}
                  {...(workspaceRoot ? { workspaceRoot } : {})}
                />
              ) : explorerDirectoryEmptyState(entry.children, showHidden || revealedHiddenPaths.has(entry.path)) === "hidden-only" ? (
                <button className="tree-empty-state tree-empty-state--action" type="button" onClick={() => onShowHiddenDirectory(entry.path)}>
                  Contém {hiddenExplorerEntryCount(entry.children)} {hiddenExplorerEntryCount(entry.children) === 1 ? "arquivo oculto" : "arquivos ocultos"}. Exibir?
                </button>
              ) : explorerDirectoryEmptyState(entry.children, showHidden || revealedHiddenPaths.has(entry.path)) === "empty" ? (
                <div className="tree-empty-state">Pasta vazia</div>
              ) : (
                <EntryTree
                  entries={entry.children ?? []}
                  parentPath={entry.path}
                  expanded={expanded}
                  showHidden={showHidden}
                  revealHidden={showHidden || revealedHiddenPaths.has(entry.path)}
                  revealedHiddenPaths={revealedHiddenPaths}
                  highlightedPath={highlightedPath}
                  selectedPath={selectedPath}
                  resourceDecorations={resourceDecorations}
                  onToggle={onToggle}
                  onSelect={onSelect}
                  onOpen={onOpen}
                  onContextMenu={onContextMenu}
                  onMove={onMove}
                  draggingPath={draggingPath}
                  dropTargetPath={dropTargetPath}
                  onDraggingPathChange={onDraggingPathChange}
                  onDropTargetPathChange={onDropTargetPathChange}
                  onShowHiddenDirectory={onShowHiddenDirectory}
                  renamePath={renamePath}
                  renameName={renameName}
                  renameError={renameError}
                  onRenameNameChange={onRenameNameChange}
                  onRenameSubmit={onRenameSubmit}
                  onRenameCancel={onRenameCancel}
                  creationKind={creationKind}
                  creationParentPath={creationParentPath}
                  creationName={creationName}
                  creationError={creationError}
                  onCreationNameChange={onCreationNameChange}
                  onCreationSubmit={onCreationSubmit}
                  onCreationCancel={onCreationCancel}
                  workspaceName={workspaceName}
                  {...(workspaceRoot ? { workspaceRoot } : {})}
                />
              )}
            </div>
          ) : null}
        </div>;
      })}
    </div>
  );
}

function HighlightedSource({ source, provider }: { readonly source: string; readonly provider: Pick<SyntaxHighlighter, "highlight"> }) {
  const tokens = [...provider.highlight(source)].sort((left, right) => left.start - right.start);
  const fragments: React.ReactNode[] = [];
  let cursor = 0;
  for (const token of tokens) {
    if (token.start < cursor || token.start < 0 || token.end > source.length) continue;
    if (token.start > cursor) fragments.push(source.slice(cursor, token.start));
    fragments.push(<span className={`syntax-${token.scope}`} key={`${token.start}:${token.end}`}>{source.slice(token.start, token.end)}</span>);
    cursor = token.end;
  }
  if (cursor < source.length) fragments.push(source.slice(cursor));
  fragments.push("\n");
  return <>{fragments}</>;
}

function HighlightedLine({ source, provider }: { readonly source: string; readonly provider: Pick<SyntaxHighlighter, "highlight"> | undefined }) {
  if (!provider) return <>{source}</>;
  const tokens = [...provider.highlight(source)].sort((left, right) => left.start - right.start);
  const fragments: React.ReactNode[] = [];
  let cursor = 0;
  for (const token of tokens) {
    if (token.start < cursor || token.start < 0 || token.end > source.length) continue;
    if (token.start > cursor) fragments.push(source.slice(cursor, token.start));
    fragments.push(<span className={`syntax-${token.scope}`} key={`${token.start}:${token.end}`}>{source.slice(token.start, token.end)}</span>);
    cursor = token.end;
  }
  if (cursor < source.length) fragments.push(source.slice(cursor));
  return <>{fragments}</>;
}

function EditorLineDiffPeek({
  decoration,
  provider,
  top,
  onClose,
  onAction,
}: {
  readonly decoration: TextEditorLineDecoration;
  readonly provider: Pick<SyntaxHighlighter, "highlight"> | undefined;
  readonly top: number;
  readonly onClose: () => void;
  readonly onAction: (action: NonNullable<TextEditorLineDecoration["actions"]>[number]) => void;
}) {
  const change = decoration.change;
  if (!change) return null;
  const allLines = [...change.before, ...change.after].map((line) => line.line);
  const width = Math.max(2, String(Math.max(1, ...allLines)).length);
  const rows = [
    ...change.before.map((line) => ({ ...line, kind: "before" as const, marker: "−" })),
    ...change.after.map((line) => ({ ...line, kind: "after" as const, marker: "+" })),
  ];
  return (
    <section
      className="editor-line-diff-peek"
      aria-label={`Diferença da linha ${decoration.line}`}
      style={{ "--editor-line-diff-top": `${top}px` } as React.CSSProperties}
    >
      <div className="editor-line-diff-peek__heading">
        <div>
          <span className={`editor-line-diff-peek__status is-${decoration.kind}`} />
          <strong>{decoration.label ?? decoration.tooltip ?? `Alteração na linha ${decoration.line}`}</strong>
        </div>
        <div className="editor-line-diff-peek__actions">
          {decoration.actions?.map((action) => {
            const ActionIcon = action.id.includes("revert")
              ? Undo2
              : action.id.includes("diff")
                ? Code2
                : MoreVertical;
            return (
              <button
                className="icon-button small editor-line-diff-peek__action"
                key={action.id}
                type="button"
                title={action.title ?? action.label}
                aria-label={action.label}
                onClick={() => onAction(action)}
              >
                <ActionIcon size={14} />
              </button>
            );
          })}
          <button
            className="icon-button small editor-line-diff-peek__action"
            type="button"
            title="Fechar"
            aria-label="Fechar diff da linha"
            onClick={onClose}
          ><X size={14} /></button>
        </div>
      </div>
      <div className="editor-line-diff-peek__code">
        {rows.length ? rows.map((line, index) => (
          <div className={`editor-line-diff-peek__row is-${line.kind}`} key={`${line.kind}:${line.line}:${index}`}>
            <span className="editor-line-diff-peek__marker">{line.marker}</span>
            <span className="editor-line-diff-peek__line-number">{String(line.line).padStart(width, "0")}</span>
            <pre><HighlightedLine source={line.content} provider={provider} /></pre>
          </div>
        )) : <div className="editor-line-diff-peek__empty">Alteração sem conteúdo textual.</div>}
      </div>
    </section>
  );
}

function DiagnosticLayer({
  diagnostics,
  source,
  hoveredLine,
}: {
  readonly diagnostics: readonly TextDiagnostic[];
  readonly source: string;
  readonly hoveredLine: number | undefined;
}) {
  const sourceLines = source.split(/\r?\n/);
  const diagnosticsByLine = new Map<number, TextDiagnostic[]>();
  diagnostics.forEach((diagnostic) => {
    const current = diagnosticsByLine.get(diagnostic.line) ?? [];
    current.push(diagnostic);
    diagnosticsByLine.set(diagnostic.line, current);
  });

  return (
    <div className="diagnostic-layer">
      {[...diagnosticsByLine.entries()].map(([line, lineDiagnostics]) => {
        const severity = lineDiagnostics.some((diagnostic) => diagnostic.severity === "error")
          ? "error"
          : lineDiagnostics.some((diagnostic) => diagnostic.severity === "warning")
            ? "warning"
            : "information";
        const lineLength = sourceLines[line - 1]?.length ?? 0;
        return (
          <div
            className={`diagnostic-line diagnostic-line--${severity}${hoveredLine === line ? " is-hovered" : ""}`}
            key={line}
            style={{
              "--diagnostic-line": line,
              "--diagnostic-line-length": lineLength,
            } as React.CSSProperties}
            aria-hidden={hoveredLine === line ? undefined : true}
          >
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  className="diagnostic-line__details"
                  type="button"
                  aria-label={`Detalhes dos problemas na linha ${line}`}
                >
                  <CircleAlert size={14} />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content className="tooltip diagnostic-tooltip" side="right" sideOffset={7}>
                  {lineDiagnostics.map((diagnostic, index) => (
                    <span key={`${diagnostic.column}:${diagnostic.code ?? index}`}>
                      <strong>{diagnostic.line}:{diagnostic.column}</strong>
                      {diagnostic.message}
                    </span>
                  ))}
                  <Tooltip.Arrow className="tooltip-arrow" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </div>
        );
      })}
    </div>
  );
}

async function hydrateExpandedEntries(
  entries: readonly WorkspaceEntry[],
  expanded: ReadonlySet<string>,
): Promise<readonly WorkspaceEntry[]> {
  return Promise.all(entries.map(async (entry) => {
    if (entry.kind !== "directory" || !entry.handle || !expanded.has(entry.path)) return entry;
    const children = await listDirectory(entry.handle as BrowserDirectoryHandle, entry.path);
    return { ...entry, children: await hydrateExpandedEntries(children, expanded) };
  }));
}

function ProfileDialog({
  open,
  onOpenChange,
  profiles,
  selectedId,
  environments,
  executableOptions,
  presets,
  onBrowseCommand,
  onChange,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly profiles: readonly ExecutionProfile[];
  readonly selectedId: string | undefined;
  readonly environments: readonly ExecutionEnvironment[];
  readonly executableOptions: readonly ExecutionProfileExecutableOption[];
  readonly presets: readonly ExecutionProfilePresetContribution[];
  readonly onBrowseCommand: () => Promise<string | undefined>;
  readonly onChange: (profiles: readonly ExecutionProfile[], selectedId?: string) => void;
}) {
  const [drafts, setDrafts] = useState<readonly ExecutionProfile[]>(profiles);
  const [editingId, setEditingId] = useState<string | undefined>(selectedId ?? profiles[0]?.id);
  const [removalId, setRemovalId] = useState<string>();
  const [parameterDrafts, setParameterDrafts] = useState<Readonly<Record<string, string>>>({});
  const [parameterError, setParameterError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setDrafts(profiles);
    setEditingId(selectedId ?? profiles[0]?.id);
    setRemovalId(undefined);
    setParameterDrafts(Object.fromEntries(profiles.map((profile) => [
      profile.id,
      formatCommandLineArguments(profile.steps[0]?.parameters ?? []),
    ])));
    setParameterError(undefined);
  }, [open, profiles, selectedId]);

  const editing = drafts.find((profile) => profile.id === editingId);
  const step = editing?.steps[0];
  const editingEnvironmentId = editing?.environment.mode === "fixed"
    ? editing.environment.environmentId
    : undefined;

  const updateEditing = (update: (profile: ExecutionProfile) => ExecutionProfile) => {
    if (!editingId) return;
    setDrafts((current) => current.map((profile) => (profile.id === editingId ? update(profile) : profile)));
  };

  const addProfile = () => {
    const profile = makeProfile();
    setDrafts((current) => [...current, profile]);
    setParameterDrafts((current) => ({ ...current, [profile.id]: "" }));
    setEditingId(profile.id);
  };

  const addPreset = (preset: ExecutionProfilePresetContribution) => {
    const template = preset.create({});
    const duplicates = drafts.filter((candidate) => candidate.id === template.id || candidate.id.startsWith(`${template.id}-`)).length;
    const id = duplicates ? `${template.id}-${duplicates + 1}` : template.id;
    const profile = {
      ...template,
      id,
      steps: template.steps.map((profileStep, index) => ({ ...profileStep, id: `${id}:step-${index + 1}` })),
    };
    setDrafts((current) => [...current, profile]);
    setParameterDrafts((current) => ({ ...current, [profile.id]: formatCommandLineArguments(profile.steps[0]?.parameters ?? []) }));
    setEditingId(profile.id);
  };

  const removeProfile = (id: string) => {
    setDrafts((current) => current.filter((profile) => profile.id !== id));
    setParameterDrafts((current) => Object.fromEntries(Object.entries(current).filter(([profileId]) => profileId !== id)));
    if (editingId === id) setEditingId(undefined);
    setRemovalId(undefined);
  };

  const saveProfiles = () => {
    try {
      const parsedDrafts = drafts.map((profile) => {
        const rawParameters = parameterDrafts[profile.id]
          ?? formatCommandLineArguments(profile.steps[0]?.parameters ?? []);
        const parameters = rawParameters.trim() ? parseCommandLineArguments(rawParameters) : [];
        return {
          ...profile,
          steps: profile.steps.map((profileStep, index) => index === 0
            ? { ...profileStep, parameters }
            : profileStep),
        };
      });
      setParameterError(undefined);
      onChange(parsedDrafts, editing?.id);
      onOpenChange(false);
    } catch (cause) {
      setParameterError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const removalProfile = drafts.find((profile) => profile.id === removalId);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content profile-dialog">
          <div className="dialog-heading">
            <div>
              <span className="eyebrow">EXECUÇÃO</span>
              <Dialog.Title>Perfis de execução</Dialog.Title>
              <Dialog.Description>Configure comandos reutilizáveis sem acoplar linguagem ao core.</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="icon-button" type="button" aria-label="Fechar">
                <X size={17} />
              </button>
            </Dialog.Close>
          </div>

          <div className="profile-layout">
            <aside className="profile-list-panel">
              <div className="section-title-row">
                <strong>Perfis</strong>
                <span>{drafts.length}</span>
              </div>
              <div className="profile-list">
                {drafts.map((profile) => (
                  <article
                    key={profile.id}
                    className={`profile-card${editingId === profile.id ? " is-active" : ""}`}
                  >
                    <button
                      type="button"
                      className="profile-card__select"
                      onClick={() => setEditingId(profile.id)}
                    >
                      <Terminal size={16} />
                      <span>
                        <strong>{profile.name}</strong>
                        <small>{profile.steps.length} etapa(s)</small>
                      </span>
                    </button>
                    <button
                      className="card-delete"
                      type="button"
                      aria-label={`Remover ${profile.name}`}
                      title={`Remover ${profile.name}`}
                      onClick={() => setRemovalId(profile.id)}
                    >
                      <X size={14} />
                    </button>
                  </article>
                ))}
              </div>
              <button className="button secondary full" type="button" onClick={addProfile}>
                <Plus size={15} /> Novo perfil
              </button>
              {presets.length ? (
                <select className="profile-preset-select" aria-label="Adicionar perfil a partir de um preset" defaultValue="" onChange={(event) => {
                  const preset = presets.find((candidate) => candidate.id === event.target.value);
                  if (preset) addPreset(preset);
                  event.currentTarget.value = "";
                }}>
                  <option value="" disabled>Adicionar preset...</option>
                  {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                </select>
              ) : null}
            </aside>

            <div className="profile-editor">
              {editing && step ? (
                <>
                  <div className="form-grid two-columns">
                    <label>
                      Nome do perfil
                      <input
                        value={editing.name}
                        placeholder="Ex.: Servidor de desenvolvimento"
                        onChange={(event) => updateEditing((profile) => ({ ...profile, name: event.target.value }))}
                      />
                    </label>
                    <label>
                      Ambiente
                      <select
                        value={editing.environment.mode === "fixed" ? editing.environment.environmentId : ""}
                        onChange={(event) => updateEditing((profile) => ({
                          ...profile,
                          environment: event.target.value
                            ? { mode: "fixed", environmentId: event.target.value }
                            : { mode: "none" },
                          steps: profile.steps.map((item, index) => index === 0
                            ? {
                                ...item,
                                executable: event.target.value ? "${environmentExecutable}" : item.executable,
                              }
                            : item),
                        }))}
                      >
                        <option value="">Nenhum ambiente</option>
                        {environments.map((environment) => (
                          <option key={environment.id} value={environment.id}>
                            {environment.name}{environment.version ? ` — ${environment.version}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <section className="form-section">
                    <div className="form-section-heading">
                      <Terminal size={17} />
                      <div>
                        <strong>Comando</strong>
                        <small>Primeira etapa do perfil.</small>
                      </div>
                    </div>
                    <label>
                      Executável
                      <input
                        value={editingEnvironmentId
                          ? environments.find((environment) => environment.id === editingEnvironmentId)?.executable ?? ""
                          : step.executable}
                        placeholder="Ex.: node, python, bash ou caminho completo"
                        readOnly={Boolean(editingEnvironmentId)}
                        onChange={(event) => updateEditing((profile) => ({
                          ...profile,
                          steps: profile.steps.map((item, index) => index === 0 ? { ...item, executable: event.target.value } : item),
                        }))}
                      />
                    </label>
                    {editing.environment.mode === "none" && executableOptions.filter((option) => !option.environmentId).length ? (
                      <div className="profile-executable-options">
                        {executableOptions.filter((option) => !option.environmentId).map((option) => (
                          <button
                            className="button secondary compact"
                            type="button"
                            key={option.id}
                            onClick={() => updateEditing((profile) => ({
                              ...profile,
                              steps: profile.steps.map((item, index) => index === 0
                                ? { ...item, executable: option.value }
                                : item),
                            }))}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <label>
                      Comando ou arquivo
                      <div className="path-row">
                        <input
                          value={step.command}
                          placeholder="Ex.: caminho/do/arquivo ou subcomando"
                          onChange={(event) => updateEditing((profile) => ({
                            ...profile,
                            steps: profile.steps.map((item, index) => index === 0 ? { ...item, command: event.target.value } : item),
                          }))}
                        />
                        <button className="button secondary compact" type="button" onClick={() => {
                          void onBrowseCommand().then((path) => {
                            if (!path) return;
                            updateEditing((profile) => ({
                              ...profile,
                              steps: profile.steps.map((item, index) => index === 0 ? { ...item, command: path } : item),
                            }));
                          });
                        }}>Procurar</button>
                      </div>
                    </label>
                    <label>
                      Parâmetros
                      <textarea
                        rows={5}
                        value={parameterDrafts[editing.id] ?? formatCommandLineArguments(step.parameters)}
                        placeholder="Ex.: --port 8000 --verbose"
                        onChange={(event) => {
                          setParameterDrafts((current) => ({ ...current, [editing.id]: event.target.value }));
                          setParameterError(undefined);
                        }}
                      />
                      {parameterError ? <small className="field-error">{parameterError}</small> : null}
                    </label>
                    <label>
                      Diretório de trabalho
                      <input
                        value={step.workingDirectory ?? ""}
                        placeholder="Ex.: ${workspaceRoot} ou caminho absoluto"
                        onChange={(event) => updateEditing((profile) => ({
                          ...profile,
                          steps: profile.steps.map((item, index) => index === 0
                            ? { ...item, workingDirectory: event.target.value }
                            : item),
                        }))}
                      />
                    </label>
                    <label>
                      Variáveis de ambiente
                      <textarea
                        rows={4}
                        value={environmentVariablesText(step.environmentVariables)}
                        placeholder="Ex.: DEBUG=1"
                        onChange={(event) => {
                          try {
                            const environmentVariables = parseEnvironmentVariables(event.target.value);
                            updateEditing((profile) => ({
                              ...profile,
                              steps: profile.steps.map((item, index) => index === 0
                                ? { ...item, environmentVariables }
                                : item),
                            }));
                          } catch {
                            // Preserve the last valid value while the user is still typing.
                          }
                        }}
                      />
                    </label>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={step.continueOnError === true}
                        onChange={(event) => updateEditing((profile) => ({
                          ...profile,
                          steps: profile.steps.map((item, index) => index === 0
                            ? { ...item, continueOnError: event.target.checked }
                            : item),
                        }))}
                      />
                      Continuar após falha
                    </label>
                  </section>

                  <div className="dialog-footer">
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={editing.saveBeforeRun !== false}
                        onChange={(event) => updateEditing((profile) => ({ ...profile, saveBeforeRun: event.target.checked }))}
                      />
                      Salvar antes de executar
                    </label>
                    <div className="dialog-actions">
                      <Dialog.Close asChild>
                        <button className="button secondary" type="button">Cancelar</button>
                      </Dialog.Close>
                      <button
                        className="button primary"
                        type="button"
                        onClick={saveProfiles}
                      >
                        <Save size={15} /> Salvar perfis
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="empty-panel">
                  <Settings2 size={28} />
                  <strong>Selecione ou crie um perfil</strong>
                </div>
              )}
            </div>
          </div>
          {removalProfile ? (
            <div className="profile-removal-backdrop" role="presentation">
              <section className="profile-removal-dialog" role="alertdialog" aria-modal="true" aria-labelledby="profile-removal-title">
                <div>
                  <span className="eyebrow">CONFIRMAÇÃO</span>
                  <h3 id="profile-removal-title">Remover perfil?</h3>
                  <p>O perfil <strong>{removalProfile.name}</strong> será removido quando as alterações forem salvas.</p>
                </div>
                <div className="dialog-actions">
                  <button className="button secondary" type="button" onClick={() => setRemovalId(undefined)}>Cancelar</button>
                  <button className="button danger" type="button" onClick={() => removeProfile(removalProfile.id)}>Remover</button>
                </div>
              </section>
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function WorkbenchSidebarHost({
  provider,
  state,
  onClose,
}: {
  readonly provider: WorkbenchSidebarContribution;
  readonly state: WorkbenchStateApi;
  readonly onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let mountedDisposable: { dispose(): void } | void;
    try {
      const mounted = provider.mount({ container, state, close: onClose });
      if (mounted && typeof (mounted as PromiseLike<unknown>).then === "function") {
        void Promise.resolve(mounted)
          .then((disposable) => {
            if (disposed) disposable?.dispose();
            else mountedDisposable = disposable;
          })
          .catch((cause) => {
            if (!disposed) container.textContent = cause instanceof Error ? cause.message : String(cause);
          });
      } else {
        mountedDisposable = mounted as void | { dispose(): void };
      }
    } catch (cause) {
      container.textContent = cause instanceof Error ? cause.message : String(cause);
    }
    return () => {
      disposed = true;
      mountedDisposable?.dispose();
      container.replaceChildren();
    };
  }, [provider, state, onClose]);

  return <div className="plugin-sidebar-host" ref={containerRef} data-sidebar-id={provider.id} />;
}

function WorkbenchPanelHost({
  provider,
  state,
}: {
  readonly provider: WorkbenchPanelContribution;
  readonly state: WorkbenchStateApi;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let mountedDisposable: { dispose(): void } | void;
    try {
      const mounted = provider.mount({ container, state });
      if (mounted && typeof (mounted as PromiseLike<unknown>).then === "function") {
        void Promise.resolve(mounted)
          .then((disposable) => {
            if (disposed) disposable?.dispose();
            else mountedDisposable = disposable;
          })
          .catch((cause) => {
            if (!disposed) container.textContent = cause instanceof Error ? cause.message : String(cause);
          });
      } else {
        mountedDisposable = mounted as void | { dispose(): void };
      }
    } catch (cause) {
      container.textContent = cause instanceof Error ? cause.message : String(cause);
    }

    return () => {
      disposed = true;
      mountedDisposable?.dispose();
      container.replaceChildren();
    };
  }, [provider, state]);

  return <div className="plugin-panel-host" ref={containerRef} data-panel-id={provider.id} />;
}

function WorkbenchToolWindowHost({
  provider,
  state,
  visible,
  height,
  viewRequest,
  onClose,
  onResize,
  onResetHeight,
}: {
  readonly provider: WorkbenchToolWindowContribution;
  readonly state: WorkbenchStateApi;
  readonly visible: boolean;
  readonly height: number;
  readonly viewRequest?: WorkbenchToolWindowViewRequest;
  readonly onClose: () => void;
  readonly onResize: (event: React.PointerEvent<HTMLDivElement>) => void;
  readonly onResetHeight: () => void;
}) {
  const headerContainerRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tabsRef = useRef<(WorkbenchTabApi & { dispose(): void }) | null>(null);

  useEffect(() => {
    const headerContainer = headerContainerRef.current;
    const container = containerRef.current;
    if (!headerContainer || !container) return;
    let disposed = false;
    let mountedDisposable: { dispose(): void } | void;
    const tabs = createWorkbenchTabApi(headerContainer);
    tabsRef.current = tabs;
    try {
      const mounted = provider.mount({ headerContainer, container, state, tabs, close: onClose });
      if (mounted && typeof (mounted as PromiseLike<unknown>).then === "function") {
        void Promise.resolve(mounted)
          .then((disposable) => {
            if (disposed) disposable?.dispose();
            else mountedDisposable = disposable;
          })
          .catch((cause) => {
            if (!disposed) container.textContent = cause instanceof Error ? cause.message : String(cause);
          });
      } else {
        mountedDisposable = mounted as void | { dispose(): void };
      }
    } catch (cause) {
      container.textContent = cause instanceof Error ? cause.message : String(cause);
    }

    return () => {
      disposed = true;
      mountedDisposable?.dispose();
      tabs.dispose();
      if (tabsRef.current === tabs) tabsRef.current = null;
      headerContainer.replaceChildren();
      container.replaceChildren();
    };
  }, [provider, state, onClose]);

  useEffect(() => {
    if (!viewRequest || viewRequest.toolWindowId !== provider.id) return;
    tabsRef.current?.select(viewRequest.viewId);
  }, [provider.id, viewRequest]);

  return (
    <section
      className={`tool-window-panel${visible ? "" : " tool-window-panel--hidden"}`}
      style={{ height }}
      data-tool-window-id={provider.id}
    >
      <div
        className="resize-handle resize-handle--panel"
        role="separator"
        aria-label={`Redimensionar ${provider.label}`}
        onPointerDown={onResize}
        onDoubleClick={onResetHeight}
      />
      <div className="panel-heading tool-window-heading">
        <div className="tool-window-header-content" ref={headerContainerRef} />
        <button
          className="icon-button small"
          type="button"
          aria-label={`Fechar painel ${provider.label}`}
          onClick={onClose}
        ><X size={14} /></button>
      </div>
      <div className="plugin-panel-host" ref={containerRef} data-panel-id={provider.id} />
    </section>
  );
}

function WorkbenchDialogHost({
  provider,
  onClose,
}: {
  readonly provider: WorkbenchDialogContribution;
  readonly onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let mountedDisposable: { dispose(): void } | void;
    try {
      const mounted = provider.mount({ container, close: onClose });
      if (mounted && typeof (mounted as PromiseLike<unknown>).then === "function") {
        void Promise.resolve(mounted)
          .then((disposable) => {
            if (disposed) disposable?.dispose();
            else mountedDisposable = disposable;
          })
          .catch((cause) => {
            if (!disposed) container.textContent = cause instanceof Error ? cause.message : String(cause);
          });
      } else {
        mountedDisposable = mounted as void | { dispose(): void };
      }
    } catch (cause) {
      container.textContent = cause instanceof Error ? cause.message : String(cause);
    }

    return () => {
      disposed = true;
      mountedDisposable?.dispose();
      container.replaceChildren();
    };
  }, [provider, onClose]);

  return <div className="plugin-dialog-host" ref={containerRef} data-dialog-id={provider.id} />;
}

function WorkbenchTitlebarHost({
  provider,
  state,
}: {
  readonly provider: WorkbenchTitlebarContribution;
  readonly state: WorkbenchStateApi;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let mountedDisposable: { dispose(): void } | void;
    const mounted = provider.mount({container, state});
    if (mounted && typeof (mounted as PromiseLike<unknown>).then === "function") {
      void Promise.resolve(mounted).then((disposable) => {
        if (disposed) disposable?.dispose();
        else mountedDisposable = disposable;
      });
    } else {
      mountedDisposable = mounted as void | {dispose(): void};
    }
    return () => {
      disposed = true;
      mountedDisposable?.dispose();
      container.replaceChildren();
    };
  }, [provider, state]);
  return <div className="titlebar-plugin-actions" data-titlebar-contribution={provider.id} ref={containerRef} />;
}

async function readOpenDocumentBlob(document: OpenDocument): Promise<Blob> {
  if (document.handle) return document.handle.getFile();
  if (document.kind === "text") {
    return new Blob([document.content], { type: document.mediaType || "text/plain;charset=utf-8" });
  }
  throw new Error("O conteúdo binário não está mais disponível. Reabra o arquivo pelo workspace.");
}

function ResourceEditorHost({
  provider,
  document,
}: {
  readonly provider: WorkbenchResourceEditorProvider;
  readonly document: OpenDocument;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const documentRef = useRef(document);
  documentRef.current = document;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let mountedDisposable: { dispose(): void } | void;
    try {
      const mounted = provider.mount({
        container,
        resource: workbenchResourceDescriptor(document),
        read: () => readOpenDocumentBlob(documentRef.current),
      });
      if (mounted && typeof (mounted as PromiseLike<unknown>).then === "function") {
        void Promise.resolve(mounted)
          .then((disposable) => {
            if (disposed) disposable?.dispose();
            else mountedDisposable = disposable;
          })
          .catch((cause) => {
            if (!disposed) container.textContent = cause instanceof Error ? cause.message : String(cause);
          });
      } else {
        mountedDisposable = mounted as void | { dispose(): void };
      }
    } catch (cause) {
      container.textContent = cause instanceof Error ? cause.message : String(cause);
    }
    return () => {
      disposed = true;
      mountedDisposable?.dispose();
      container.replaceChildren();
    };
  }, [provider, document.id]);

  return (
    <div
      className="resource-editor resource-editor--plugin"
      ref={containerRef}
      data-resource-editor-provider={provider.id}
    />
  );
}

function NativeImageEditor({ document }: { readonly document: OpenDocument }) {
  const [source, setSource] = useState<string>();
  const [error, setError] = useState<string>();
  const [dimensions, setDimensions] = useState<string>();

  useEffect(() => {
    let disposed = false;
    let objectUrl: string | undefined;
    setSource(undefined);
    setError(undefined);
    setDimensions(undefined);
    void readOpenDocumentBlob(document)
      .then((blob) => {
        if (disposed) return;
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      })
      .catch((cause) => {
        if (!disposed) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [document.id, document.handle, document.size, document.mediaType]);

  return (
    <section className="resource-editor resource-editor--image" data-resource-kind="image">
      <div className="resource-editor__viewport">
        {source ? (
          <img
            src={source}
            alt={document.name}
            onLoad={(event) => {
              const image = event.currentTarget;
              setDimensions(`${image.naturalWidth} × ${image.naturalHeight}`);
            }}
          />
        ) : error ? (
          <div className="resource-editor__message is-error"><FileWarning size={34} /><strong>Não foi possível exibir a imagem.</strong><p>{error}</p></div>
        ) : (
          <div className="resource-editor__message"><ImageIcon size={34} /><strong>Carregando imagem…</strong></div>
        )}
      </div>
      <footer className="resource-editor__meta">
        <span>{document.mediaType}</span>
        {dimensions ? <span>{dimensions}</span> : null}
        <span>{formatByteSize(document.size)}</span>
      </footer>
    </section>
  );
}

function formatByteSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} MB`;
  return `${(size / 1024 ** 3).toFixed(1)} GB`;
}

function UnsupportedBinaryEditor({ document }: { readonly document: OpenDocument }) {
  return (
    <section className="resource-editor resource-editor--unsupported" data-resource-kind="binary">
      <div className="resource-editor__message">
        <FileWarning size={38} />
        <strong>Este arquivo não pode ser aberto no editor.</strong>
        <p>Nenhum plugin instalado oferece um visualizador para este formato binário.</p>
        <small>{document.mediaType} · {formatByteSize(document.size)}</small>
      </div>
    </section>
  );
}

function EnvironmentPackageManager({
  environment,
  provider,
  onClose,
  onEnvironmentChanged,
}: {
  readonly environment: ExecutionEnvironment;
  readonly provider: ExecutionEnvironmentProvider;
  readonly onClose: () => void;
  readonly onEnvironmentChanged: () => Promise<void>;
}) {
  const [inventory, setInventory] = useState<ExecutionEnvironmentPackageInventory>();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "updates">("all");
  const [packageSpecs, setPackageSpecs] = useState("");
  const [busy, setBusy] = useState<string>();
  const [feedback, setFeedback] = useState<string>();
  const [operationOutput, setOperationOutput] = useState("");
  const [packageToRemove, setPackageToRemove] = useState<string>();
  const [packageError, setPackageError] = useState<string>();

  const loadPackages = useCallback(async () => {
    if (!provider.listPackages) return;
    setBusy("refresh");
    setPackageError(undefined);
    try {
      setInventory(await provider.listPackages(environment.id));
    } catch (cause) {
      setPackageError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(undefined);
    }
  }, [environment.id, provider]);

  useEffect(() => {
    void loadPackages();
  }, [loadPackages]);

  const execute = async (
    label: string,
    operation: () => Promise<{ readonly inventory: ExecutionEnvironmentPackageInventory; readonly output?: string }>,
  ) => {
    setBusy(label);
    setPackageError(undefined);
    setFeedback(`${label}...`);
    try {
      const result = await operation();
      setInventory(result.inventory);
      setOperationOutput(result.output ?? "");
      setFeedback(`${label} concluído.`);
      await onEnvironmentChanged();
      return true;
    } catch (cause) {
      setPackageError(cause instanceof Error ? cause.message : String(cause));
      setFeedback(undefined);
      return false;
    } finally {
      setBusy(undefined);
    }
  };

  const installedPackages = inventory?.packages ?? [];
  const visiblePackages = installedPackages.filter((item) => {
    if (filter === "updates" && !item.latestVersion) return false;
    return !query.trim() || item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  });
  const updates = installedPackages.filter((item) => item.latestVersion);
  const packageManagementAvailable = Boolean(
    provider.listPackages && provider.installPackages && provider.upgradePackages && provider.uninstallPackages,
  );

  return (
    <section className="package-manager" aria-label={`Pacotes de ${environment.name}`}>
      <header className="package-manager__header">
        <button className="icon-button small" type="button" aria-label="Voltar para ambientes" title="Voltar para ambientes" onClick={onClose}><ArrowLeft size={15} /></button>
        <div><strong>{environment.name}</strong><span>{environment.version ?? "Python"} · Pacotes</span></div>
        <button className="icon-button small" type="button" aria-label="Atualizar pacotes" title="Atualizar pacotes" disabled={Boolean(busy)} onClick={() => void loadPackages()}><RefreshCw className={busy === "refresh" ? "is-spinning" : undefined} size={14} /></button>
      </header>

      <div className="package-manager__summary">
        <span><PackageCheck size={14} /><strong>{installedPackages.length}</strong> instalados</span>
        <span className={updates.length ? "has-updates" : ""}><ArrowUpCircle size={14} /><strong>{updates.length}</strong> atualizações</span>
        <span className={inventory?.health === "issues" ? "has-issues" : ""}>{inventory?.health === "healthy" ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}{inventory?.health === "healthy" ? "Saudável" : inventory?.health === "issues" ? "Conflitos" : "Verificando"}</span>
      </div>

      {packageManagementAvailable ? (
        <form
          className="package-install"
          onSubmit={(event) => {
            event.preventDefault();
            const packages = packageSpecs.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
            if (!packages.length || !provider.installPackages) return;
            void execute("Instalação", () => provider.installPackages!(environment.id, packages))
              .then((succeeded) => { if (succeeded) setPackageSpecs(""); });
          }}
        >
          <label htmlFor="package-specs">Instalar pacotes</label>
          <div>
            <input id="package-specs" value={packageSpecs} onChange={(event) => setPackageSpecs(event.target.value)} placeholder="requests ou django==5.2" />
            <button className="button primary compact" type="submit" disabled={Boolean(busy) || !packageSpecs.trim()}><Plus size={14} /> Instalar</button>
          </div>
          <small>Aceita vários nomes ou versões, separados por espaço.</small>
        </form>
      ) : <p className="package-manager__unsupported">Este provedor não oferece gerenciamento detalhado de pacotes.</p>}

      <div className="package-manager__controls">
        <div className="segmented-control" aria-label="Filtrar pacotes">
          <button type="button" className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}><Package size={13} /> Todos</button>
          <button type="button" className={filter === "updates" ? "is-active" : ""} onClick={() => setFilter("updates")}><ArrowUpCircle size={13} /> Atualizações</button>
        </div>
        <label className="package-search"><Search size={13} /><input aria-label="Buscar pacote instalado" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filtrar" /></label>
      </div>

      {updates.length && provider.upgradePackages ? (
        <button className="package-update-all" type="button" disabled={Boolean(busy)} onClick={() => void execute("Atualização", () => provider.upgradePackages!(environment.id))}><ArrowUpCircle size={14} /> Atualizar todos ({updates.length})</button>
      ) : null}

      {packageError ? <div className="package-feedback is-error" role="alert"><CircleAlert size={14} /><span>{packageError}</span><button type="button" onClick={() => void loadPackages()}><RefreshCw size={13} /> Tentar novamente</button></div> : null}
      {feedback ? <div className="package-feedback" role="status">{busy ? <RefreshCw className="is-spinning" size={14} /> : <CheckCircle2 size={14} />}<span>{feedback}</span></div> : null}
      {inventory?.issues?.length ? <details className="package-issues"><summary><CircleAlert size={13} /> Ver conflitos ({inventory.issues.length})</summary>{inventory.issues.map((issue) => <code key={issue}>{issue}</code>)}</details> : null}
      {operationOutput ? <details className="package-output"><summary><Terminal size={13} /> Saída da última operação</summary><pre>{operationOutput}</pre></details> : null}

      <div className="package-list" aria-busy={busy === "refresh"}>
        {busy === "refresh" && !inventory ? <div className="package-empty"><RefreshCw className="is-spinning" size={20} /><span>Carregando pacotes...</span></div> : null}
        {inventory && !visiblePackages.length ? <div className="package-empty"><Package size={20} /><span>{query ? "Nenhum pacote corresponde à busca." : filter === "updates" ? "Todos os pacotes estão atualizados." : "Nenhum pacote instalado."}</span></div> : null}
        {visiblePackages.map((item) => (
          <article className="package-row" key={item.name}>
            <div><strong>{item.name}</strong><span>{item.version}{item.latestVersion ? ` → ${item.latestVersion}` : ""}</span></div>
            <div>
              {item.latestVersion && provider.upgradePackages ? <button className="icon-button small" type="button" aria-label={`Atualizar ${item.name}`} title={`Atualizar ${item.name}`} disabled={Boolean(busy)} onClick={() => void execute(`Atualização de ${item.name}`, () => provider.upgradePackages!(environment.id, [item.name]))}><ArrowUpCircle size={14} /></button> : null}
              {provider.uninstallPackages ? <button className="icon-button small danger" type="button" aria-label={`Desinstalar ${item.name}`} title={`Desinstalar ${item.name}`} disabled={Boolean(busy)} onClick={() => setPackageToRemove(item.name)}><Trash2 size={14} /></button> : null}
            </div>
          </article>
        ))}
      </div>

      <Dialog.Root open={Boolean(packageToRemove)} onOpenChange={(open) => { if (!open) setPackageToRemove(undefined); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content dialog-content--small package-remove-dialog">
            <Dialog.Title>Desinstalar pacote</Dialog.Title>
            <Dialog.Description>Remover <strong>{packageToRemove}</strong> de {environment.name}? Dependências usadas por outros pacotes não serão removidas automaticamente.</Dialog.Description>
            <div className="dialog-actions">
              <button className="button secondary compact" type="button" onClick={() => setPackageToRemove(undefined)}><X size={14} /> Cancelar</button>
              <button className="button danger compact" type="button" onClick={() => {
                const name = packageToRemove;
                setPackageToRemove(undefined);
                if (name && provider.uninstallPackages) void execute(`Remoção de ${name}`, () => provider.uninstallPackages!(environment.id, [name]));
              }}><Trash2 size={14} /> Desinstalar</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
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
  const toolWindowViewRequestSequenceRef = useRef(0);
  const [workspaceHandle, setWorkspaceHandle] = useState<BrowserDirectoryHandle>();
  const [workspaceName, setWorkspaceName] = useState(initialSession.workspaceName);
  const [workspaceRoot, setWorkspaceRoot] = useState<string | undefined>(initialSession.workspaceRoot);
  const [entries, setEntries] = useState<readonly WorkspaceEntry[]>([]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set(initialSession.expandedDirectories));
  const [explorerShowHidden, setExplorerShowHidden] = useState(initialSession.explorerShowHidden);
  const [explorerRevealedHiddenPaths, setExplorerRevealedHiddenPaths] = useState<ReadonlySet<string>>(new Set());
  const [documents, setDocuments] = useState<readonly OpenDocument[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | undefined>(initialSession.activeDocumentId);
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
  const [packageManagerEnvironmentId, setPackageManagerEnvironmentId] = useState<string>();
  const [environmentBrowserMode, setEnvironmentBrowserMode] = useState<"directory" | "file">();
  const [environmentListing, setEnvironmentListing] = useState<ExecutionEnvironmentDirectoryListing>();
  const [environmentBrowserFilter, setEnvironmentBrowserFilter] = useState("");
  const [environmentBrowserHidden, setEnvironmentBrowserHidden] = useState(false);
  const [environmentBrowserSelection, setEnvironmentBrowserSelection] = useState<string>();
  const [environmentBrowserExecutableOnly, setEnvironmentBrowserExecutableOnly] = useState(false);
  const [executableOptions, setExecutableOptions] = useState<readonly ExecutionProfileExecutableOption[]>([]);
  const [profilePresets, setProfilePresets] = useState<readonly ExecutionProfilePresetContribution[]>([]);
  const [busy, setBusy] = useState(false);
  const [pageReloading, setPageReloading] = useState(false);
  const [activeProcessId, setActiveProcessId] = useState<string>();
  const [resumedProcessId, setResumedProcessId] = useState<string>();
  const [profileExecutions, setProfileExecutions] = useState<Readonly<Record<string, ProfileExecutionState>>>({});
  const [openProfileTabIds, setOpenProfileTabIds] = useState<readonly string[]>([]);
  const [closingProfileTabIds, setClosingProfileTabIds] = useState<ReadonlySet<string>>(new Set());
  const [resumedProfileProcesses, setResumedProfileProcesses] = useState<readonly ResumedProfileProcess[]>([]);
  const [profilesState, setProfilesState] = useState<StoredProfiles>({ profiles: [] });
  const [debugBreakpoints, setDebugBreakpoints] = useState<readonly DebugBreakpoint[]>([]);
  const [debugSession, setDebugSession] = useState<DebugSessionSnapshot>();
  const [debugAdapter, setDebugAdapter] = useState<DebugAdapterProvider>();
  const [debugRestartingProfileId, setDebugRestartingProfileId] = useState<string>();
  const [restartingProfileId, setRestartingProfileId] = useState<string>();
  const [debugInspectorWidth, setDebugInspectorWidth] = useState<number>(DEFAULT_DEBUG_PANEL_LAYOUT.inspectorWidth);
  const [debugOutputWrap, setDebugOutputWrap] = useState<boolean>(DEFAULT_DEBUG_PANEL_LAYOUT.outputWrap);
  const [debugOutputFollowTail, setDebugOutputFollowTail] = useState<boolean>(DEFAULT_DEBUG_PANEL_LAYOUT.outputFollowTail);
  const [debugOutputFilter, setDebugOutputFilter] = useState<DebugOutputFilter>("all");
  const [debugVariableQuery, setDebugVariableQuery] = useState("");
  const [debugOutputOffsets, setDebugOutputOffsets] = useState<Readonly<Record<string, DebugOutputOffsets>>>({});
  const [workspaceSettings, setWorkspaceSettings] = useState<WorkspaceSettings>(EMPTY_WORKSPACE_SETTINGS);
  const [profilesOpen, setProfilesOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [lintSettingsOpen, setLintSettingsOpen] = useState(false);
  const [lintEnabledRuleIds, setLintEnabledRuleIds] = useState<readonly string[]>([]);
  const [pluginRemovalId, setPluginRemovalId] = useState<string>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSectionId, setSettingsSectionId] = useState("editor");
  const [pluginSettingsDraft, setPluginSettingsDraft] = useState<PluginSettingValues>({});
  const [workbenchDialog, setWorkbenchDialog] = useState<ActiveWorkbenchDialog>();
  const [editorLineDecorations, setEditorLineDecorations] = useState<readonly TextEditorLineDecoration[]>([]);
  const [selectedEditorLineDecoration, setSelectedEditorLineDecoration] = useState<TextEditorLineDecoration>();
  const [editorDecorationRevision, setEditorDecorationRevision] = useState(0);
  const [resourceDecorations, setResourceDecorations] = useState<ReadonlyMap<string, ResourceDecoration>>(new Map());
  const [resourceDecorationRevision, setResourceDecorationRevision] = useState(0);
  const [restorationComplete, setRestorationComplete] = useState(false);
  const [error, setError] = useState<string>();
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
  const [explorerPendingDeletion, setExplorerPendingDeletion] = useState<WorkspaceEntry>();
  const [highlightedExplorerPath, setHighlightedExplorerPath] = useState<string>();
  const [selectedExplorerPath, setSelectedExplorerPath] = useState<string>();
  const [contextMenu, setContextMenu] = useState<ContextMenuState>();
  const [draggingExplorerPath, setDraggingExplorerPath] = useState<string>();
  const [dropTargetExplorerPath, setDropTargetExplorerPath] = useState<string>();
  const [explorerHistory, setExplorerHistory] = useState<ExplorerHistoryState>(createExplorerHistoryState);
  const restoredRef = useRef(false);
  const snapshotTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const explorerHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const explorerHistoryRef = useRef<ExplorerHistoryState>(createExplorerHistoryState());
  const browserResolverRef = useRef<((path: string | undefined) => void) | undefined>(undefined);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightedEditorScrollRef = useRef<HTMLDivElement | null>(null);
  const editorLineRulerRef = useRef<HTMLPreElement | null>(null);
  const editorDebugCurrentLineRef = useRef<HTMLDivElement | null>(null);
  const editorHistoriesRef = useRef<Map<string, EditorHistory>>(new Map());
  const documentsRef = useRef<readonly OpenDocument[]>(documents);
  documentsRef.current = documents;
  const profileExecutionsRef = useRef(profileExecutions);
  profileExecutionsRef.current = profileExecutions;
  const openProfileTabIdsRef = useRef(openProfileTabIds);
  openProfileTabIdsRef.current = openProfileTabIds;
  const profileRunCancellationRef = useRef(new Map<string, { cancelled: boolean }>());
  const profileRunPromiseRef = useRef(new Map<string, Promise<void>>());
  const debugRestartPromiseRef = useRef<Promise<void> | undefined>(undefined);
  const debugLayoutRef = useRef<HTMLDivElement | null>(null);
  const debugOutputRef = useRef<HTMLDivElement | null>(null);
  const workspaceSettingsRef = useRef<WorkspaceSettings>(EMPTY_WORKSPACE_SETTINGS);
  const workspaceSettingsWriteQueueRef = useRef<Promise<WorkspaceSettings>>(Promise.resolve(EMPTY_WORKSPACE_SETTINGS));
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
    pluginSettings: workspaceSettings.plugins ?? {},
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
  const [editorToolbarItems, setEditorToolbarItems] = useState<readonly WorkbenchEditorToolbarItem[]>([]);
  const activeResourceEditorProvider = resourceEditorProviderFor(activeDocument);
  const activeLanguageProvider = activeResourceEditorProvider ? undefined : languageProviderFor(activeDocument);
  const activeSyntaxHighlighter = useMemo(() => {
    if (activeResourceEditorProvider || !activeDocument || activeDocument.kind !== "text") return undefined;
    return resolveSyntaxHighlighter({
      fileName: activeDocument.name,
      mediaType: activeDocument.mediaType,
      source: activeDocument.content,
    }, platform.capabilities.getAll<LanguageProvider>("language.provider"));
  }, [activeResourceEditorProvider, activeDocument?.id, activeDocument?.name, activeDocument?.mediaType, activeDocument?.content, platformSnapshot.plugins]);
  const workbenchSidebars = useMemo(() => platform.capabilities
    .getAll<WorkbenchSidebarHook>("workbench.sidebar.hook")
    .flatMap((hook) => hook.contribute())
    .slice()
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.label.localeCompare(right.label)), [platformSnapshot]);
  const activePluginSidebar = workbenchSidebars.find((sidebar) => sidebar.id === sidebarView);
  const workbenchPanels = useMemo(() => platform.capabilities
    .getAll<WorkbenchPanelHook>("workbench.panel.hook")
    .flatMap((hook) => hook.contribute())
    .flatMap(expandWorkbenchPanelContribution)
    .slice()
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.label.localeCompare(right.label)), [platformSnapshot]);
  const workbenchToolWindows = useMemo(() => platform.capabilities
    .getAll<WorkbenchToolWindowHook>("workbench.toolWindow.hook")
    .flatMap((hook) => hook.contribute())
    .flatMap(expandWorkbenchToolWindowContribution)
    .slice()
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.label.localeCompare(right.label)), [platformSnapshot]);
  const activityButtons = useMemo<readonly PluginActivityButton[]>(() => [
    ...workbenchSidebars.map((sidebar, index) => ({
      key: `sidebar:${sidebar.id}`,
      id: sidebar.id,
      kind: "sidebar" as const,
      label: sidebar.label,
      ...(sidebar.icon ? { icon: sidebar.icon } : {}),
      defaultOrder: 100 + (sidebar.order ?? index),
      defaultSide: "left" as const,
      movable: true,
    })),
    ...workbenchToolWindows.map((toolWindow, index) => ({
      key: `toolWindow:${toolWindow.id}`,
      id: toolWindow.id,
      kind: "toolWindow" as const,
      label: toolWindow.label,
      ...(toolWindow.icon ? { icon: toolWindow.icon } : {}),
      defaultOrder: 12_000 + (toolWindow.order ?? index),
      defaultSide: "left" as const,
      movable: true,
    })),
  ], [workbenchSidebars, workbenchToolWindows]);
  const workbenchTitlebarContributions = useMemo(() => platform.capabilities
    .getAll<WorkbenchTitlebarContribution>("workbench.titlebar")
    .slice()
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.id.localeCompare(right.id)), [platformSnapshot]);
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
      setEditorToolbarItems(items.flat().filter((item) => item.enabled !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
    });
    return () => { cancelled = true; };
  }, [activeDocument, platformSnapshot]);
  const activeToolWindow = workbenchToolWindows.find((toolWindow) => toolWindow.id === activeToolWindowId);
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
    const timer = window.setInterval(() => {
      void debugAdapter.read(debugSession.id).then((snapshot) => {
        setDebugSession((current) => current?.id === snapshot.id ? snapshot : current);
      }).catch(() => undefined);
    }, 400);
    return () => window.clearInterval(timer);
  }, [debugSessionActive, debugSession?.id, debugAdapter]);

  useEffect(() => {
    if (!debugOutputFollowTail || !debugSession) return;
    window.requestAnimationFrame(() => {
      const outputElement = debugOutputRef.current;
      if (outputElement) outputElement.scrollTop = outputElement.scrollHeight;
    });
  }, [debugSession?.stdout, debugSession?.stderr, debugSession?.error, debugOutputFollowTail, debugOutputFilter]);
  const profileOutputTabs = openProfileTabIds.flatMap((tabId) => {
    const tab = profileExecutionPanelTab(tabId);
    if (!tab) return [];
    const profile = profilesState.profiles.find((candidate) => candidate.id === tab.profileId);
    const execution = tab.mode === "run" ? profileExecutions[tab.profileId] : undefined;
    const tabDebugSession = tab.mode === "debug" && debugSession?.profileId === tab.profileId
      ? debugSession
      : undefined;
    if (!profile && !execution && !tabDebugSession) return [];
    return [{
      profileId: tab.profileId,
      mode: tab.mode,
      tabId,
      name: profile?.name ?? execution?.profileName ?? tabDebugSession?.profileName ?? tab.profileId,
      profile,
      execution,
      debugSession: tabDebugSession,
    }];
  });
  const runningProfileOutputCount = profileOutputTabs.filter((tab) => (
    tab.execution?.status === "running"
    || Boolean(tab.debugSession && !["stopped", "completed", "failed"].includes(tab.debugSession.status))
  )).length;
  const activeExecutionTab = profileExecutionPanelTab(panelTab);
  const executionPanelActive = panelVisible
    && Boolean(activeExecutionTab && openProfileTabIds.includes(panelTab));
  const activityLayoutItems = useMemo<readonly ActivityButtonDescriptor[]>(() => [
    { key: "builtin:explorer", defaultOrder: 0, defaultSide: "left", movable: true },
    ...activityButtons.filter((item) => item.kind === "sidebar"),
    { key: "builtin:plugins", defaultOrder: 2_000, defaultSide: "left", movable: true },
    ...(environmentProvider()
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
  const executionDockSide = activitySideFor("builtin:executions");
  const bottomRegionDockSide = executionPanelActive
    ? executionDockSide
    : undefined;
  const leftDockWidth = bottomRegionDockSide === "left"
    ? Math.min(640, Math.max(220, verticalPanelWidths.left))
    : problemsVisible && problemsDockSide === "left"
      ? Math.min(640, Math.max(220, verticalPanelWidths.left))
      : sidebarViewsBySide.left
        ? sidebarWidthForView(verticalPanelWidths.left, sidebarViewsBySide.left)
        : 0;
  const rightDockWidth = bottomRegionDockSide === "right"
    ? Math.min(640, Math.max(220, verticalPanelWidths.right))
    : problemsVisible && problemsDockSide === "right"
      ? Math.min(640, Math.max(220, verticalPanelWidths.right))
      : sidebarViewsBySide.right
        ? sidebarWidthForView(verticalPanelWidths.right, sidebarViewsBySide.right)
        : 0;
  const bottomPanelAvailable = profileOutputTabs.length > 0
    || Boolean(debugSession)
    || workbenchPanels.some((panel) => panel.id === panelTab);
  const settingsProviders = pluginSettingsProviders();
  const activePluginSettingsProvider = settingsSectionId === "editor"
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
  const editorSettings = resolveEditorSettings(workspaceSettings);
  const editorRulerLines = activeDocument?.kind === "text" ? editorLineNumbers(activeDocument.content) : ["01"];
  const editorDecorationsByLine = useMemo(() => {
    const grouped = new Map<number, TextEditorLineDecoration[]>();
    for (const decoration of editorLineDecorations) {
      if (!Number.isInteger(decoration.line) || decoration.line < 1) continue;
      const items = grouped.get(decoration.line) ?? [];
      items.push(decoration);
      grouped.set(decoration.line, items);
    }
    return grouped;
  }, [editorLineDecorations]);
  const showEditorGutter = activeDocument?.kind === "text"
    && !activeResourceEditorProvider
    && (editorSettings.lineNumbers || editorLineDecorations.length > 0 || debugBreakpoints.some((breakpoint) => breakpoint.path === activeDocument.path));

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
      pluginSettings: workspaceSettings.plugins ?? {},
    };
    workbenchStateRef.current = snapshot;
    for (const listener of workbenchStateListenersRef.current) listener(snapshot);
  }, [workspaceName, workspaceRoot, sidebarView, sidebarVisible, panelTab, panelVisible, activeToolWindowId, toolWindowVisible, selectedEnvironmentId, workspaceSettings.plugins]);

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
      setSidebarViewsBySide((current) => ({ ...current, [side]: id }));
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
      setWorkbenchDialog({ token, contribution });
      return {
        dispose: () => {
          setWorkbenchDialog((current) => current?.token === token ? undefined : current);
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
    const legacy = readLegacyLintSettings(workspaceName, activeLanguageProvider);
    const settings = legacy ?? defaultLintSettings(activeLanguageProvider);
    setLintEnabledRuleIds(settings.enabledRuleIds);
    if (legacy && workspaceRoot) {
      void updateWorkspaceSettings((current) => ({
        ...current,
        lint: {
          ...current.lint,
          [activeLanguageProvider.id]: legacy,
        },
      })).then(() => {
        localStorage.removeItem(lintSettingsStorageKey(workspaceName, activeLanguageProvider.id));
      }).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
    }
  }, [workspaceName, workspaceRoot, workspaceSettings.lint, activeLanguageProvider?.id, updateWorkspaceSettings]);

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

  useEffect(() => {
    if (!activeDocument || !activeLanguageProvider) {
      setDiagnostics([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void lintDocument(activeDocument, { enabledRuleIds: lintEnabledRuleIds })
        .then((items) => {
          if (!cancelled) setDiagnostics(items);
        })
        .catch((cause) => {
          if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
        });
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeDocument?.id, activeDocument?.content, activeLanguageProvider, lintEnabledRuleIds]);

  useEffect(() => {
    return platform.subscribe(() => setPlatformSnapshot(platform.snapshot()));
  }, []);

  const loadLocalWorkspaceSettings = useCallback(async (
    name: string,
    root: string,
    legacySelectedEnvironmentId?: string,
  ): Promise<WorkspaceSettings> => {
    let settings = await readWorkspaceSettings(root);
    let migrated = false;
    const legacyProfiles = settings.executionProfiles ? undefined : readLegacyProfiles(name);
    if (legacyProfiles) {
      settings = { ...settings, executionProfiles: legacyProfiles };
      migrated = true;
    }
    if (!settings.environment?.selectedId && legacySelectedEnvironmentId) {
      settings = { ...settings, environment: { selectedId: legacySelectedEnvironmentId } };
      migrated = true;
    }
    if (migrated) {
      settings = await writeWorkspaceSettings(root, settings);
      if (legacyProfiles) localStorage.removeItem(profileStorageKey(name));
    }
    replaceWorkspaceSettings(settings);
    setProfilesState(settings.executionProfiles ?? { profiles: [] });
    setDebugBreakpoints(settings.debugBreakpoints ?? []);
    const debugLayout = normalizeDebugPanelLayout(settings.debugPanel);
    setDebugInspectorWidth(debugLayout.inspectorWidth);
    setDebugOutputWrap(debugLayout.outputWrap);
    setDebugOutputFollowTail(debugLayout.outputFollowTail);
    return settings;
  }, [replaceWorkspaceSettings]);

  useEffect(() => {
    platform.initialize()
      .then(async () => {
        const snapshot = await readReactSnapshot();
        let restoredDocuments: readonly OpenDocument[] = [];
        let restoredWorkspaceName = snapshot?.workspaceName ?? initialSession.workspaceName;
        let restoredWorkspaceRoot = snapshot?.workspaceRoot ?? initialSession.workspaceRoot;
        let restoredWorkspaceHandle = isDesktopHost() ? undefined : snapshot?.workspaceHandle;
        if (isDesktopHost()) {
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
            await loadLocalWorkspaceSettings(
              restoredWorkspaceName,
              hostWorkspace.workspaceRoot,
              initialSession.selectedEnvironmentId,
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
        }
        setWorkspaceName(restoredWorkspaceName);
        setWorkspaceHandle(restoredWorkspaceHandle);
        if (restoredWorkspaceHandle && restoredWorkspaceRoot) {
          const permission = await restoredWorkspaceHandle.queryPermission?.({ mode: "readwrite" });
          if (permission === "granted" || permission === undefined) {
            const rootEntries = await listDirectory(restoredWorkspaceHandle);
            setEntries(await hydrateExpandedEntries(rootEntries, new Set(initialSession.expandedDirectories)));
            setWorkspaceAccess("ready");
            restoredDocuments = await restoreWorkspaceDocuments(
              snapshot?.documents ?? [],
              restoredWorkspaceRoot,
              restoredWorkspaceHandle,
            );
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
          setDiagnostics(snapshot.diagnostics);
          setOutput([...snapshot.output]);
        }
        setActiveDocumentId(
          initialSession.activeDocumentId
            && restoredDocuments.some((document) => document.id === initialSession.activeDocumentId)
            ? initialSession.activeDocumentId
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
          : { executableOptions: [], variables: [], presets: [] };
        setExecutableOptions(contributions.executableOptions);
        setProfilePresets(contributions.presets);
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
    setDebugRestartingProfileId(undefined);
    setRestartingProfileId(undefined);
    profileRunCancellationRef.current.clear();
    profileRunPromiseRef.current.clear();
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
          setPanelVisible(true);
          setPanelTab(profileExecutionPanelTabId(restoredDebugSession.profileId, "debug"));
        } else if (latestRunningProfile) {
          setPanelVisible(true);
          setPanelTab(profileExecutionPanelTabId(latestRunningProfile.profileId, "run"));
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
  }, [restorationComplete, workspaceRoot]);

  useEffect(() => {
    if (!resumedProfileProcesses.length) return;
    let cancelled = false;
    const monitor = async (resumed: ResumedProfileProcess) => {
      try {
        let process = await readHostProcess(resumed.processId);
        while (!cancelled) {
          const processOutput = resumedProfileProcessOutput(resumed, process);
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
              ...(process.status === "running" ? { processId: process.id } : {}),
              startedAt: current[resumed.profileId]?.startedAt ?? process.startedAt,
              ...(process.finishedAt ? { finishedAt: process.finishedAt } : {}),
              ...(process.status !== "running" && process.exitCode !== 0 && !process.stopRequested
                ? { error: `Processo encerrado com código ${process.exitCode ?? -1}.` }
                : {}),
            },
          }));
          if (process.status !== "running") break;
          await new Promise((resolve) => window.setTimeout(resolve, 250));
          process = await readHostProcess(resumed.processId);
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
      activityButtonPlacements,
      sidebarViewsBySide,
    });
  }, [sidebarView, sidebarVisible, sidebarViewsBySide, verticalPanelWidths, panelVisible, panelHeight, panelTab, problemsVisible, toolWindowVisible, toolWindowHeight, activeToolWindowId, workspaceName, workspaceRoot, activeDocumentId, expanded, explorerShowHidden, activityButtonPlacements]);

  useEffect(() => {
    if (!restoredRef.current) return;
    if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current);
    snapshotTimerRef.current = setTimeout(() => {
      void writeReactSnapshot({
        workspaceName,
        ...(workspaceRoot ? { workspaceRoot } : {}),
        ...(workspaceHandle && !isDesktopWorkspaceHandle(workspaceHandle) ? { workspaceHandle } : {}),
        workspaceEntries: entries,
        documents,
        diagnostics,
        output,
      });
    }, 180);
    return () => {
      if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current);
    };
  }, [workspaceName, workspaceRoot, workspaceHandle, entries, documents, diagnostics, output]);

  useEffect(() => {
    if (!platformSnapshot.initialized || !restorationComplete) return;
    if (!workspaceRoot) {
      setEnvironments([]);
      setSelectedEnvironmentId(undefined);
      setExecutableOptions([]);
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

  const openFolder = async () => {
    const handle = await pickWorkspaceDirectory();
    const workspaceRootHint = await workspaceRootHintForHandle(handle);
    const hostWorkspace = await setHostWorkspace(handle.name, workspaceRootHint);
    const localSettings = await loadLocalWorkspaceSettings(handle.name, hostWorkspace.workspaceRoot);
    setWorkspaceHandle(handle);
    setWorkspaceName(handle.name);
    setWorkspaceRoot(hostWorkspace.workspaceRoot);
    setEntries(await listDirectory(handle));
    setExpanded(new Set());
    setWorkspaceAccess("ready");
    await refreshEnvironments(localSettings.environment?.selectedId, hostWorkspace.workspaceRoot);
  };

  const reconnectWorkspace = async () => {
    if (!workspaceHandle) throw new Error("Nenhum workspace anterior disponível para reconexão.");
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
  };

  const openSingleFile = async () => {
    if (!window.showOpenFilePicker) throw new Error("Este navegador não oferece seleção de arquivos.");
    const [handle] = await window.showOpenFilePicker();
    if (!handle) return;
    const document = await readFileDocument(handle);
    setDocuments((current) => current.some((item) => item.id === document.id) ? current : [...current, document]);
    setActiveDocumentId(document.id);
  };

  const openEntry = async (entry: WorkspaceEntry) => {
    if (entry.kind !== "file") return;
    const handle = entry.handle?.kind === "file"
      ? entry.handle
      : workspaceHandle
        ? await resolveFileHandle(workspaceHandle, entry.path)
        : undefined;
    if (!handle) throw new Error("Restaure o acesso ao workspace antes de abrir este arquivo.");
    const document = await readFileDocument(handle, entry.path, workspaceRoot);
    setDocuments((current) => {
      const index = current.findIndex((item) => item.id === document.id);
      return index === -1 ? [...current, document] : current.map((item) => item.id === document.id ? document : item);
    });
    setActiveDocumentId(document.id);
  };

  const revealDebugLocation = async (path: string | undefined, line: number | undefined) => {
    const relativePath = workspaceRelativeDebugPath(path, workspaceRoot);
    if (!relativePath) return;
    const opened = documents.find((document) => document.path === relativePath);
    if (opened) {
      setActiveDocumentId(opened.id);
    } else {
      const entry = findWorkspaceEntry(entries, relativePath);
      if (!entry || entry.kind !== "file") return;
      await openEntry(entry);
    }
    if (!line) return;
    window.requestAnimationFrame(() => {
      const scrollContainer = highlightedEditorScrollRef.current ?? editorRef.current;
      if (!scrollContainer) return;
      scrollContainer.scrollTop = Math.max(0, 18 + (line - 1) * 21.45 - 120);
      syncEditorLineRuler(scrollContainer.scrollTop);
    });
  };

  useEffect(() => {
    if (!activeDebugPath || !activeDebugLine || debugSession?.status !== "paused") return;
    let cancelled = false;
    void (async () => {
      const opened = documents.find((document) => document.path === activeDebugPath);
      if (!opened) {
        const entry = findWorkspaceEntry(entries, activeDebugPath);
        if (!entry || entry.kind !== "file") return;
        await openEntry(entry);
      } else {
        setActiveDocumentId(opened.id);
      }
      if (cancelled) return;
      const targetScrollTop = Math.max(0, 18 + (activeDebugLine - 1) * 21.45 - 120);
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
  }, [activeDebugPath, activeDebugLine, debugSession?.status]);

  const resourceContext = (entry: WorkspaceEntry): ResourceContext => ({
    kind: entry.kind,
    name: entry.name,
    path: entry.path,
    ...(workspaceName !== "Sem workspace" ? { workspaceName } : {}),
    ...(workspaceRoot ? { workspaceRoot } : {}),
    ...(entry.kind === "file" ? {
      isDirty: documents.some((document) => document.path === entry.path && document.kind === "text" && document.content !== document.savedContent),
    } : {}),
  });

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
        icon: entry.kind === "file" ? "file" : "folder",
      },
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
      {
        id: "core.rename",
        label: "Renomear",
        command: "core.resource.rename",
        group: "file",
        order: 0,
        icon: entry.kind === "directory" ? "folder" : "file",
      },
      {
        id: "core.copyPath",
        label: "Copiar caminho",
        command: "core.resource.copyPath",
        group: "clipboard",
        order: 100,
        icon: "copy",
      },
      {
        id: "core.delete",
        label: entry.kind === "directory" ? "Excluir pasta" : "Excluir arquivo",
        command: "core.resource.delete",
        group: "destructive",
        order: 1000,
        icon: "close",
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
    ...(workspaceName !== "Sem workspace" ? { workspaceName } : {}),
    ...(workspaceRoot ? { workspaceRoot } : {}),
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
    if (!previous || previous.kind !== "text") return;
    const content = textarea.value;
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
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
    setDocuments((current) => current.map((candidate) => candidate.id === document.id
      ? {
          ...candidate,
          content: snapshot.content,
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
        content: snapshot.content,
      },
      previousContent: document.content,
      reason: direction,
      isDirty: snapshot.content !== document.savedContent,
    };
    void platform.events.emit(TEXT_EDITOR_DOCUMENT_CHANGED_EVENT, changedEvent);
    setDiagnostics([]);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
    });
  };

  const handleEditorKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLocaleLowerCase();
    const undo = key === "z" && !event.shiftKey;
    const redo = (key === "z" && event.shiftKey) || key === "y";
    if (!undo && !redo) return;
    event.preventDefault();
    navigateEditorHistory(undo ? "undo" : "redo", event.currentTarget);
  };

  const captureEditorState = (
    textarea: HTMLTextAreaElement,
    scrollContainer: HTMLElement = textarea,
  ) => {
    if (!activeDocumentId) return;
    setDocuments((current) => current.map((document) => document.id === activeDocumentId
      ? {
          ...document,
          selectionStart: textarea.selectionStart,
          selectionEnd: textarea.selectionEnd,
          scrollTop: scrollContainer.scrollTop,
          scrollLeft: scrollContainer.scrollLeft,
        }
      : document));
  };

  const syncEditorLineRuler = (scrollTop: number) => {
    editorDebugCurrentLineRef.current?.style.setProperty("--editor-scroll-top", `${scrollTop}px`);
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
      syncEditorLineRuler(activeDocument.scrollTop);
    });
  }, [activeDocumentId, editorSettings.lineNumbers]);

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

  useEffect(() => platform.events.on<WorkspaceResourcesChangedEvent>(
    WORKSPACE_RESOURCES_CHANGED_EVENT,
    async (event) => {
      if (!workspaceHandle) return;
      if (event.workspaceRoot && workspaceRoot && event.workspaceRoot !== workspaceRoot) return;
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

  const explorerHiddenEntriesVisible = explorerShowHidden || explorerRevealedHiddenPaths.size > 0;
  const toggleExplorerHiddenEntries = () => {
    const nextVisibility = nextExplorerHiddenVisibility(
      explorerShowHidden,
      explorerRevealedHiddenPaths,
    );
    setExplorerShowHidden(nextVisibility.showHidden);
    setExplorerRevealedHiddenPaths(nextVisibility.revealedHiddenPaths);
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
    setExpanded(nextExpanded);
    setDraggingExplorerPath(undefined);
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

  const startSelectedDebugProfile = async () => {
    if (!selectedProfile) throw new Error("Selecione um perfil de execução.");
    if (!selectedProfileDebugAdapter) throw new Error("O perfil selecionado não possui runtime com suporte a debug.");
    if (selectedProfile.saveBeforeRun && activeDocument && activeDocument.content !== activeDocument.savedContent) await saveDocument();
    const started = await startDebugProfile({
      profile: selectedProfile,
      ...(activeDocument ? { activeDocument } : {}),
      environments,
      breakpoints: debugBreakpoints,
    });
    setDebugAdapter(started.adapter);
    setDebugSession(started.session);
    const tabId = profileExecutionPanelTabId(selectedProfile.id, "debug");
    setOpenProfileTabIds((current) => openProfileExecutionTab(current, selectedProfile.id, "debug"));
    setPanelVisible(true);
    setPanelHeight((current) => Math.max(current, 420));
    setPanelTab(tabId);
  };

  const debugCommand = async (command: "pause" | "resume" | "stepOver" | "stepInto" | "stepOut" | "stop") => {
    if (!debugSession || !debugAdapter) throw new Error("Nenhuma sessão de debug ativa.");
    setDebugSession(await sendDebugCommand(debugAdapter, debugSession.id, command));
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
      setPanelVisible(true);
      setPanelTab(tabId);
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
        status: "running",
        output: [`[perfil] ${profile.name}`],
        startedAt,
      },
    }));
    const tabId = profileExecutionPanelTabId(profile.id, "run");
    setOpenProfileTabIds((current) => openProfileExecutionTab(current, profile.id, "run"));
    setToolWindowVisible(false);
    setPanelVisible(true);
    setPanelTab(tabId);
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
                status: "running" as const,
                output: [`[perfil] ${profile.name}`],
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
                status: "running" as const,
                output: [`[perfil] ${profile.name}`],
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
            output: [`[perfil] ${profile.name}`],
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
        [profile.id]: {
          ...(current[profile.id] ?? {
            profileId: profile.id,
            profileName: profile.name,
            output: [`[perfil] ${profile.name}`],
            startedAt,
          }),
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
    setToolWindowVisible(false);
    setPanelVisible(true);
    setPanelTab(tabId);
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

  const closeDocument = (documentId: string) => {
    const index = documents.findIndex((document) => document.id === documentId);
    if (index < 0) return;
    const next = documents.filter((document) => document.id !== documentId);
    editorHistoriesRef.current.delete(documentId);
    setDocuments(next);
    if (activeDocumentId === documentId) {
      setActiveDocumentId(next[index]?.id ?? next[index - 1]?.id);
    }
  };

  const executeContextMenuItem = async (item: ResourceContextMenuItem, target: ContextMenuTarget) => {
    setContextMenu(undefined);
    if (target.kind === "root") {
      if (item.command?.startsWith("core.resource.newFile")) {
        await startExplorerCreation("file", "", decodedNewFileOption(item.command));
        return;
      }
      if (item.command === "core.resource.newDirectory") {
        await startExplorerCreation("directory", "");
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
        setExplorerPendingDeletion(entry);
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
      restartedRun = runProfile(profile, wasRunning && !existingRun);
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
    setSelectedEnvironmentId(environmentId);
    void updateWorkspaceSettings((current) => ({
      ...current,
      environment: environmentId ? { selectedId: environmentId } : {},
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
    const provider = environmentProvider();
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
    const provider = environmentProvider();
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
    const provider = environmentProvider();
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
    const provider = environmentProvider();
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
          if (next) setSelectedExplorerPath(next.path);
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
            if (firstChild) setSelectedExplorerPath(firstChild.path);
          }
          return;
        }
        if (event.key === "ArrowLeft" && selectedEntry) {
          event.preventDefault();
          if (selectedEntry.kind === "directory" && expanded.has(selectedEntry.path)) {
            invoke(() => toggleEntry(selectedEntry));
          } else {
            const parentPath = parentEntryPath(selectedEntry.path);
            if (parentPath) setSelectedExplorerPath(parentPath);
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
          setExplorerPendingDeletion(selectedEntry);
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
    if (executionPanelActive) {
      const startX = event.clientX;
      const startWidth = verticalPanelWidths[executionDockSide];
      const move = (pointerEvent: PointerEvent) => setVerticalPanelWidths((current) => ({
        ...current,
        [executionDockSide]: Math.min(640, Math.max(220, startWidth
          + (executionDockSide === "left" ? pointerEvent.clientX - startX : startX - pointerEvent.clientX))),
      }));
      const finish = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", finish);
      return;
    }
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
    keep: "sidebar" | "problems" | "toolWindow" | "execution",
  ) => {
    if (keep !== "sidebar" && sidebarViewsBySide[side]) {
      const next = closeSidebarForSide(sidebarViewsBySide, side);
      setSidebarViewsBySide(next);
      const remaining = next.left ?? next.right;
      setSidebarVisible(Boolean(remaining));
      if (remaining) setSidebarView(remaining);
    }
    if (keep !== "problems" && problemsVisible && problemsDockSide === side) setProblemsVisible(false);
    if (keep !== "execution" && executionPanelActive && executionDockSide === side) setPanelVisible(false);
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
      setToolWindowVisible((visible) => {
        const next = !visible;
        if (next) setPanelVisible(false);
        return next;
      });
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
    else if (key === "builtin:executions" && executionPanelActive) closeDockConflicts(side, "execution");
    setActivityButtonPlacements((current) => (
      moveActivityButton(activityLayoutItems, current, key, side, targetKey, placeAfter)
    ));
  };

  const renderActivityButton = (item: PluginActivityButton, side: ActivityBarSide) => (
    <MovableActivityButton
      key={item.key}
      item={item}
      side={side}
      dragging={draggingActivityButtonKey === item.key}
      dragActive={Boolean(draggingActivityButtonKey)}
      active={item.kind === "sidebar"
        ? sidebarViewsBySide[side] === item.id
        : toolWindowVisible && activeToolWindowId === item.id}
      onActivate={() => (
        item.kind === "sidebar" ? togglePluginSidebar(item.id) : toggleToolWindow(item.id)
      )}
      onMove={repositionActivityButton}
      onDragStateChange={setDraggingActivityButtonKey}
    />
  );

  const renderFixedActivitySlot = (
    itemKey: string,
    side: ActivityBarSide,
    children?: React.ReactNode,
    spacer = false,
  ) => (
    <FixedActivitySlot
      key={itemKey}
      itemKey={itemKey}
      side={side}
      {...(draggingActivityButtonKey ? { draggingKey: draggingActivityButtonKey } : {})}
      spacer={spacer}
      onMove={repositionActivityButton}
      onDragStateChange={setDraggingActivityButtonKey}
    >
      {children}
    </FixedActivitySlot>
  );

  const renderActivityLayoutItem = (item: ActivityButtonDescriptor, side: ActivityBarSide) => {
    const pluginItem = activityButtons.find((candidate) => candidate.key === item.key);
    if (pluginItem) return renderActivityButton(pluginItem, side);
    if (item.key === "builtin:explorer") {
      return renderFixedActivitySlot(item.key, side, (
        <IconButton label="Explorador" active={sidebarViewsBySide[side] === "explorer"} onClick={() => toggleBuiltinSidebar("explorer")}>
          <Files size={20} />
        </IconButton>
      ));
    }
    if (item.key === "builtin:plugins") {
      return renderFixedActivitySlot(item.key, side, (
        <IconButton label="Plugins" active={sidebarViewsBySide[side] === "plugins"} onClick={() => toggleBuiltinSidebar("plugins")}>
          <Plug size={20} />
        </IconButton>
      ));
    }
    if (item.key === "builtin:environments") {
      return renderFixedActivitySlot(item.key, side, (
        <IconButton label={environmentProvider()?.name ?? "Ambientes"} active={sidebarViewsBySide[side] === "environments"} onClick={() => toggleBuiltinSidebar("environments")}>
          <WorkbenchActivityIconView icon={environmentProvider()?.icon} />
        </IconButton>
      ));
    }
    if (item.key === "builtin:executions") {
      return renderFixedActivitySlot(item.key, side, (
        <IconButton
          label={`Execuções: ${profileOutputTabs.length}${runningProfileOutputCount ? `, ${runningProfileOutputCount} em execução` : ""}`}
          active={executionPanelActive}
          onClick={toggleExecutionPanel}
        >
          <Play size={20} />
          <span
            aria-hidden="true"
            className={`execution-activity__badge${runningProfileOutputCount ? " is-running" : ""}`}
          >{profileOutputTabs.length}</span>
        </IconButton>
      ));
    }
    if (item.key === "builtin:problems") {
      return renderFixedActivitySlot(item.key, side, (
        <IconButton label={`Problemas: ${diagnostics.length}`} active={problemsVisible} onClick={toggleProblemsPanel}>
          <CircleAlert size={20} />
          <span className="right-activity-bar__badge" aria-hidden="true">{diagnostics.length}</span>
        </IconButton>
      ));
    }
    return renderFixedActivitySlot(item.key, side, undefined, true);
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
    closeDockConflicts(executionDockSide, "execution");
    setToolWindowVisible(false);
    setPanelTab(targetTabId);
    setPanelVisible(true);
  };

  const closeToolWindow = useCallback(() => setToolWindowVisible(false), []);
  const closeSidebar = useCallback(() => {
    setSidebarViewsBySide({});
    setSidebarVisible(false);
  }, []);

  const installedIds = useMemo(() => new Set(platformSnapshot.plugins.map((plugin) => plugin.manifest.id)), [platformSnapshot.plugins]);
  const pluginPendingRemoval = platformSnapshot.plugins.find((plugin) => plugin.manifest.id === pluginRemovalId);
  const editingEnvironment = editingEnvironmentId
    ? environments.find((environment) => environment.id === editingEnvironmentId)
    : undefined;
  const packageManagerEnvironment = packageManagerEnvironmentId
    ? environments.find((environment) => environment.id === packageManagerEnvironmentId)
    : undefined;
  const visibleEnvironments = environments.filter((environment) => {
    const query = environmentSearch.trim().toLocaleLowerCase();
    if (!query) return true;
    return [
      environment.name,
      environment.version ?? "",
      environment.executable ?? "",
      environment.path ?? "",
    ].some((value) => value.toLocaleLowerCase().includes(query));
  });
  const managedEnvironmentCount = environments.filter((environment) => environment.type === "venv" && environment.managed !== false).length;
  const importedEnvironmentCount = environments.filter((environment) => environment.type === "venv" && environment.managed === false).length;
  const executableEnvironmentCount = environments.filter((environment) => environment.type === "process").length;

  const openSettings = (sectionId = "editor") => {
    setSettingsSectionId(sectionId);
    const provider = settingsProviders.find((candidate) => candidate.pluginId === sectionId);
    setPluginSettingsDraft(provider
      ? resolvePluginSettingValues(provider, workspaceSettings.plugins?.[provider.pluginId])
      : {});
    setSettingsOpen(true);
  };

  const selectSettingsSection = (sectionId: string) => {
    setSettingsSectionId(sectionId);
    const provider = settingsProviders.find((candidate) => candidate.pluginId === sectionId);
    setPluginSettingsDraft(provider
      ? resolvePluginSettingValues(provider, workspaceSettings.plugins?.[provider.pluginId])
      : {});
  };

  const applyEditorLineNumbers = async (lineNumbers: boolean) => {
    await updateWorkspaceSettings((current) => ({
      ...current,
      editor: {
        ...current.editor,
        lineNumbers,
      },
    }));
  };

  const applyPluginSetting = async (settingId: string, value: boolean) => {
    if (!activePluginSettingsProvider) return;
    const values = updatePluginSettingValue(
      resolvePluginSettingValues(activePluginSettingsProvider, pluginSettingsDraft),
      settingId,
      value,
    );
    setPluginSettingsDraft(values);
    await updateWorkspaceSettings((current) => ({
      ...current,
      plugins: {
        ...current.plugins,
        [activePluginSettingsProvider.pluginId]: values,
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
                                  <FilePlus2 size={15} /> Novo arquivo <ChevronRight className="menu-item__submenu-arrow" size={14} />
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
                                        ) : <File size={15} />}
                                        <span>{option.label}</span>
                                        <span className="menu-item__hint">{option.extension}</span>
                                      </DropdownMenu.Item>
                                    ))}
                                  </DropdownMenu.SubContent>
                                </DropdownMenu.Portal>
                              </DropdownMenu.Sub>
                            ) : (
                              <DropdownMenu.Item className="menu-item" disabled={!workspaceHandle} onSelect={() => invoke(() => startExplorerCreation("file"))}>
                                <FilePlus2 size={15} /> Novo arquivo
                              </DropdownMenu.Item>
                            )}
                            <DropdownMenu.Item className="menu-item" disabled={!workspaceHandle} onSelect={() => invoke(() => startExplorerCreation("directory"))}>
                              <FolderOpen size={15} /> Nova pasta
                            </DropdownMenu.Item>
                            <DropdownMenu.Separator className="menu-separator" />
                            <DropdownMenu.Item className="menu-item" disabled={!explorerHistory.undo.length} onSelect={() => invoke(undoExplorerOperation)}>
                              <Undo2 size={15} /> {explorerUndoLabel(explorerHistory) ?? "Desfazer"}
                            </DropdownMenu.Item>
                            <DropdownMenu.Item className="menu-item" disabled={!explorerHistory.redo.length} onSelect={() => invoke(redoExplorerOperation)}>
                              <Redo2 size={15} /> {explorerRedoLabel(explorerHistory) ?? "Refazer"}
                            </DropdownMenu.Item>
                            <DropdownMenu.Separator className="menu-separator" />
                            <DropdownMenu.Item className="menu-item" disabled={!workspaceHandle} onSelect={() => invoke(refreshExplorer)}>
                              <RefreshCw size={15} /> Atualizar
                            </DropdownMenu.Item>
                            <DropdownMenu.Separator className="menu-separator" />
                            <DropdownMenu.Item className="menu-item" onSelect={toggleExplorerHiddenEntries}>
                              {explorerHiddenEntriesVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                              {explorerHiddenEntriesVisible ? "Ocultar arquivos ocultos" : "Mostrar arquivos ocultos"}
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
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        setSelectedExplorerPath("");
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setSelectedExplorerPath("");
                        invoke(() => openRootMenu(event.clientX, event.clientY));
                      }}
                    >
                      <span className="workspace-name__label"><FolderRoot size={14} /> {workspaceName}</span>
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
                  {entries.length || (explorerCreation && explorerCreationParentPath === "") ? (
                    <EntryTree
                      entries={entries}
                      parentPath=""
                      expanded={expanded}
                      showHidden={explorerShowHidden}
                      revealHidden={explorerShowHidden}
                      revealedHiddenPaths={explorerRevealedHiddenPaths}
                      highlightedPath={highlightedExplorerPath}
                      selectedPath={selectedExplorerPath}
                      resourceDecorations={resourceDecorations}
                      onToggle={(entry) => invoke(() => toggleEntry(entry))}
                      onSelect={(entry) => setSelectedExplorerPath(entry.path)}
                      onOpen={(entry) => invoke(() => openEntry(entry))}
                      onContextMenu={(entry, x, y) => invoke(() => openResourceMenu(entry, x, y))}
                      onMove={(sourcePath, targetPath) => invoke(() => moveExplorerEntry(sourcePath, targetPath))}
                      draggingPath={draggingExplorerPath}
                      dropTargetPath={dropTargetExplorerPath}
                      onDraggingPathChange={setDraggingExplorerPath}
                      onDropTargetPathChange={setDropTargetExplorerPath}
                      onShowHiddenDirectory={(path) => setExplorerRevealedHiddenPaths((current) => new Set(current).add(path))}
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
                      <p>{workspaceAccess === "permission-required"
                        ? "O acesso ao workspace precisa ser restaurado."
                        : workspaceAccess === "missing"
                          ? "O workspace salvo não está mais disponível."
                          : "Nenhum arquivo ou pasta aberto."}</p>
                      {workspaceAccess === "permission-required" && workspaceHandle
                        ? <button className="button primary compact" type="button" onClick={() => invoke(reconnectWorkspace)}>Reconectar pasta</button>
                        : null}
                      {workspaceAccess === "missing"
                        ? <button className="button primary compact" type="button" onClick={() => invoke(openFolder)}>Reabrir pasta</button>
                        : null}
                    </div>
                  )}
                </div>
              ) : null}

              {view === "plugins" ? (
                <div className="sidebar-content plugins-view">
                  <div className="toolbar-row spread">
                    <span>{platformSnapshot.plugins.length} instalado(s)</span>
                    <button className="icon-button small" type="button" aria-label="Atualizar catálogo" onClick={() => invoke(() => platform.discoverPlugins())}><RefreshCw size={14} /></button>
                  </div>
                  {platformSnapshot.plugins.map((plugin) => {
                    const enabled = plugin.state === "active" || plugin.state === "enabled";
                    return (
                      <article className="plugin-card" key={plugin.manifest.id}>
                        <button className="card-delete" type="button" aria-label={`Remover ${plugin.manifest.name}`} title={`Remover ${plugin.manifest.name}`} onClick={() => setPluginRemovalId(plugin.manifest.id)}><X size={14} /></button>
                        <div className="plugin-card-heading"><Package size={16} /><strong>{plugin.manifest.name}</strong></div>
                        <p>{plugin.manifest.description}</p>
                        <small>{plugin.manifest.id} · {plugin.manifest.version}</small>
                        <div className="plugin-actions">
                          <button className="button secondary compact" type="button" onClick={() => invoke(() => platform.setEnabled(plugin.manifest.id, !enabled))}>{enabled ? "Desativar" : "Ativar"}</button>
                          {settingsProviders.some((provider) => provider.pluginId === plugin.manifest.id) ? (
                            <button
                              className="button secondary compact"
                              type="button"
                              onClick={() => {
                                const provider = settingsProviders.find((candidate) => candidate.pluginId === plugin.manifest.id);
                                if (provider) openSettings(provider.pluginId);
                              }}
                            >
                              <Settings2 size={13} /> Configurar
                            </button>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                  {platformSnapshot.catalog.filter((entry) => !installedIds.has(entry.manifest.id)).map((entry) => (
                    <article className="plugin-card available" key={entry.manifest.id}>
                      <div className="plugin-card-heading"><Box size={16} /><strong>{entry.manifest.name}</strong></div>
                      <p>{entry.manifest.description}</p>
                      <button className="button primary compact full" type="button" onClick={() => invoke(() => platform.install(entry.manifestUrl))}>Instalar</button>
                    </article>
                  ))}
                </div>
              ) : null}

              {view === "environments" ? (
                <div className="sidebar-content environment-manager">
                  {packageManagerEnvironment && environmentProvider() ? (
                    <EnvironmentPackageManager
                      environment={packageManagerEnvironment}
                      provider={environmentProvider()!}
                      onClose={() => setPackageManagerEnvironmentId(undefined)}
                      onEnvironmentChanged={() => refreshEnvironments(packageManagerEnvironment.id)}
                    />
                  ) : (
                  <>
                  <div className="environment-manager__intro">
                    <div>
                      <strong>{environmentProvider()?.name ?? "Ambientes de execução"}</strong>
                      <p>Gerencie intérpretes, ambientes e pacotes do workspace atual.</p>
                    </div>
                    <ButtonTooltip label="Atualizar ambientes" side="left">
                      <button className="icon-button small" type="button" aria-label="Atualizar ambientes" onClick={() => invoke(refreshEnvironments)}><RefreshCw size={14} /></button>
                    </ButtonTooltip>
                  </div>
                  <div className="environment-manager__summary">
                    <span><CheckCircle2 size={13} /> {environments.length} ambientes</span>
                    <span><Package size={13} /> {managedEnvironmentCount} gerenciados</span>
                    <span><FolderOpen size={13} /> {importedEnvironmentCount} importados</span>
                    <span><Terminal size={13} /> {executableEnvironmentCount} executáveis</span>
                  </div>
                  <label className="search-field environment-manager__search">
                    <Search size={14} />
                    <input value={environmentSearch} onChange={(event) => setEnvironmentSearch(event.target.value)} placeholder="Buscar ambiente por nome, versão ou caminho" />
                  </label>
                  <div className="environment-manager__toolbar">
                    <ButtonTooltip label="Criar ambiente">
                      <button className="button primary compact" type="button" aria-label="Criar ambiente" onClick={() => { setEnvironmentForm("createEnvironment"); setEnvironmentPath(""); }}><Plus size={14} /><span className="responsive-action__label">Criar</span></button>
                    </ButtonTooltip>
                    <ButtonTooltip label="Importar ambiente">
                      <button className="button secondary compact" type="button" aria-label="Importar ambiente" onClick={() => { setEnvironmentForm("importEnvironment"); setEnvironmentPath(""); }}><FolderOpen size={14} /><span className="responsive-action__label">Importar</span></button>
                    </ButtonTooltip>
                    <ButtonTooltip label="Adicionar executável Python">
                      <button className="button secondary compact" type="button" aria-label="Adicionar executável Python" onClick={() => { setEnvironmentForm("addExecutable"); setEnvironmentPath(""); }}><Terminal size={14} /><span className="responsive-action__label">Executável</span></button>
                    </ButtonTooltip>
                  </div>

                  {environmentForm ? (
                    <form className="environment-form" onSubmit={(event) => invoke(() => submitEnvironmentForm(event))}>
                      <strong>{environmentForm === "addExecutable" ? "Adicionar executável" : environmentForm === "importEnvironment" ? "Importar ambiente existente" : environmentForm === "createEnvironment" ? "Criar ambiente" : environmentForm === "edit" ? "Editar ambiente" : "Instalar dependências"}</strong>
                      {environmentForm === "addExecutable" ? (
                        <>
                          <label>Nome<input name="name" placeholder="Runtime local" /></label>
                          <label>Executável<div className="path-row"><input readOnly value={environmentPath} placeholder="Nenhum executável selecionado" /><button className="button secondary compact" type="button" onClick={() => invoke(async () => { const path = await pickHostPath("file", true); if (path) setEnvironmentPath(path); })}><Search size={13} /> Procurar</button></div></label>
                        </>
                      ) : null}
                      {environmentForm === "importEnvironment" ? (
                        <>
                          <label>Nome opcional<input name="name" /></label>
                          <label>Pasta<div className="path-row"><input readOnly value={environmentPath} placeholder="Nenhum venv selecionado" /><button className="button secondary compact" type="button" onClick={() => invoke(async () => { const path = await pickHostPath("directory"); if (path) setEnvironmentPath(path); })}><FolderOpen size={13} /> Procurar</button></div></label>
                        </>
                      ) : null}
                      {environmentForm === "createEnvironment" ? (
                        <>
                          <label>Nome<input name="name" defaultValue=".venv" /></label>
                          <label>Executável de origem<select name="baseExecutable" defaultValue={environments.find((environment) => environment.executable)?.executable ?? ""}><option value="">Selecione</option>{environments.filter((environment) => environment.executable).map((environment) => <option key={environment.id} value={environment.executable}>{environment.name}</option>)}</select></label>
                          <label>Diretório opcional<input name="path" /></label>
                        </>
                      ) : null}
                      {environmentForm === "edit" && editingEnvironment ? (
                        <>
                          <label>Nome<input name="name" defaultValue={editingEnvironment.name} /></label>
                          <label>{editingEnvironment.type === "venv" ? "Pasta" : "Executável"}<div className="path-row"><input readOnly value={environmentPath} /><button className="button secondary compact" type="button" onClick={() => invoke(async () => { const path = await pickHostPath(editingEnvironment.type === "venv" ? "directory" : "file", editingEnvironment.type === "process"); if (path) setEnvironmentPath(path); })}><Search size={13} /> Procurar</button></div></label>
                        </>
                      ) : null}
                      {environmentForm === "dependencies" ? <label>Dependências<input name="dependencies" placeholder="pacote-a pacote-b" /></label> : null}
                      <div className="dialog-actions"><button className="button secondary compact" type="button" onClick={() => setEnvironmentForm(undefined)}><X size={13} /> Cancelar</button><button className="button primary compact" disabled={environmentBusy} type="submit"><Check size={13} /> Confirmar</button></div>
                    </form>
                  ) : null}

                  <div className="environment-list">
                    {visibleEnvironments.map((environment) => (
                      <article className={`environment-card${selectedEnvironmentId === environment.id ? " is-active" : ""}`} key={environment.id}>
                        <button className="card-delete" type="button" aria-label={`Remover ${environment.name}`} title={`Remover ${environment.name}`} onClick={() => invoke(() => removeEnvironment(environment.id))}><X size={14} /></button>
                        <div>
                          <strong>{environment.name}</strong>
                          <div className="environment-card__badges">
                            <span className={`environment-chip is-${environment.status}`}>{environment.status === "ready" ? <CheckCircle2 size={12} /> : <CircleAlert size={12} />}{environment.status === "ready" ? "Pronto" : environment.status === "creating" ? "Criando" : "Erro"}</span>
                            <span className="environment-chip">{environment.type === "venv" ? environment.managed === false ? <FolderOpen size={12} /> : <Package size={12} /> : <Terminal size={12} />}{environment.type === "venv" ? environment.managed === false ? "Importado" : "Gerenciado" : "Executável"}</span>
                            {environment.version ? <span className="environment-chip"><Box size={12} /> {environment.version}</span> : null}
                          </div>
                          <small>{environment.executable ?? environment.path}</small>
                        </div>
                        <div className="environment-card__actions">
                          <ButtonTooltip label={selectedEnvironmentId === environment.id ? "Ambiente selecionado" : `Selecionar ${environment.name}`}>
                            <button className="button secondary compact" aria-label={selectedEnvironmentId === environment.id ? "Ambiente selecionado" : `Selecionar ${environment.name}`} disabled={selectedEnvironmentId === environment.id} type="button" onClick={() => selectEnvironment(environment.id)}><Check size={13} /><span className="responsive-action__label">{selectedEnvironmentId === environment.id ? "Selecionado" : "Selecionar"}</span></button>
                          </ButtonTooltip>
                          {environmentProvider()?.update ? (
                            <ButtonTooltip label={`Editar ${environment.name}`}>
                              <button className="button secondary compact" type="button" aria-label={`Editar ${environment.name}`} onClick={() => { setEditingEnvironmentId(environment.id); setEnvironmentPath(environment.type === "venv" ? environment.path ?? "" : environment.executable ?? ""); setEnvironmentForm("edit"); }}><Settings2 size={13} /><span className="responsive-action__label">Editar</span></button>
                            </ButtonTooltip>
                          ) : null}
                          {environment.type === "venv" ? (
                            <ButtonTooltip label={`Gerenciar pacotes de ${environment.name}`}>
                              <button className="button secondary compact" type="button" aria-label={`Gerenciar pacotes de ${environment.name}`} onClick={() => { selectEnvironment(environment.id); setPackageManagerEnvironmentId(environment.id); }}><Package size={13} /><span className="responsive-action__label">Pacotes</span></button>
                            </ButtonTooltip>
                          ) : null}
                        </div>
                      </article>
                    ))}
                    {!visibleEnvironments.length ? <div className="empty-sidebar"><HardDrive size={26} /><p>{environmentSearch ? "Nenhum ambiente corresponde à busca." : "Nenhum ambiente cadastrado."}</p></div> : null}
                  </div>
                  </>
                  )}
                </div>
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
        <header className="titlebar">
          <div className="app-brand"><img src="/icon.png" alt="tinyIde" /></div>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="menu-button" type="button">
                Arquivo <ChevronDown size={13} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="menu-content" align="start" sideOffset={6}>
                {workspaceFileCreationOptions.length ? (
                  <DropdownMenu.Sub>
                    <DropdownMenu.SubTrigger className="menu-item">
                      <FilePlus2 size={15} /> Novo arquivo <ChevronRight className="menu-item__submenu-arrow" size={14} />
                    </DropdownMenu.SubTrigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.SubContent className="menu-content" sideOffset={6} alignOffset={-5}>
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
                            ) : <File size={15} />}
                            <span>{option.label}</span>
                            <span className="menu-item__hint">{option.extension}</span>
                          </DropdownMenu.Item>
                        ))}
                      </DropdownMenu.SubContent>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Sub>
                ) : (
                  <DropdownMenu.Item className="menu-item" onSelect={() => newDocument()}>
                    <FilePlus2 size={15} /> Novo arquivo
                  </DropdownMenu.Item>
                )}
                <DropdownMenu.Item className="menu-item" onSelect={() => invoke(openSingleFile)}>
                  <File size={15} /> Abrir arquivo
                </DropdownMenu.Item>
                <DropdownMenu.Item className="menu-item" onSelect={() => invoke(openFolder)}>
                  <FolderOpen size={15} /> Abrir pasta
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="menu-separator" />
                <DropdownMenu.Item className="menu-item" onSelect={() => invoke(saveDocument)}>
                  <Save size={15} /> Salvar
                </DropdownMenu.Item>
                <DropdownMenu.Item className="menu-item" onSelect={() => invoke(() => saveDocument(true))}>
                  <Save size={15} /> Salvar como
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="menu-button" type="button">
                Edit <ChevronDown size={13} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="menu-content" align="start" sideOffset={6}>
                <DropdownMenu.Item className="menu-item" onSelect={() => openSettings("editor")}>
                  <Settings2 size={15} /> Configurações
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="menu-button" type="button">
                Help <ChevronDown size={13} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="menu-content" align="start" sideOffset={6}>
                <DropdownMenu.Item className="menu-item" onSelect={() => setAboutOpen(true)}>
                  <Info size={15} /> Sobre
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          <div className="window-title">{workspaceName}</div>
          <div className="titlebar-actions">
            {workbenchTitlebarContributions.map((provider) => (
              <WorkbenchTitlebarHost key={provider.id} provider={provider} state={workbenchState} />
            ))}
            <select
              aria-label="Perfil de execução"
              value={profilesState.selectedId ?? ""}
              onChange={(event) => updateProfiles(profilesState.profiles, event.target.value || undefined)}
            >
              <option value="">Selecionar perfil</option>
              {profilesState.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
            </select>
            <button className="icon-button small" type="button" aria-label="Gerenciar perfis" onClick={() => setProfilesOpen(true)}><Settings2 size={14} /></button>
            <ButtonTooltip label="Executar perfil">
              <button
                className="icon-button small"
                type="button"
                aria-label="Executar perfil"
                disabled={!selectedProfile || selectedProfileRunning || busy}
                onClick={() => invoke(runSelectedProfile)}
              ><Play size={15} /></button>
            </ButtonTooltip>
            <ButtonTooltip label={selectedProfile && !selectedProfileDebugAdapter
              ? "O runtime selecionado não oferece depuração para este perfil"
              : "Depurar perfil"}>
              <button
                className="icon-button small"
                type="button"
                aria-label="Depurar perfil"
                disabled={!selectedProfileDebugAdapter || busy || debugSessionActive}
                onClick={() => invoke(startSelectedDebugProfile)}
              ><Bug size={15} /></button>
            </ButtonTooltip>
          </div>
          <div className="titlebar-corner">
            <button
              className="icon-button small titlebar-reload-button"
              type="button"
              aria-label="Recarregar página"
              aria-busy={pageReloading}
              title="Recarregar página"
              disabled={pageReloading}
              onClick={() => {
                setPageReloading(true);
                window.setTimeout(() => location.reload(), 450);
              }}
            ><RotateCw className={pageReloading ? "is-spinning" : undefined} size={14} /></button>
          </div>
        </header>

        <div
          className="workbench"
          style={{
            gridTemplateColumns: `48px ${leftDockWidth ? `${leftDockWidth}px 5px` : "0 0"} minmax(0, 1fr) ${rightDockWidth ? `5px ${rightDockWidth}px` : "0 0"} 48px`,
          }}
        >
          <aside className="activity-bar">
            {leftActivityItems.map((item) => renderActivityLayoutItem(item, "left"))}
          </aside>

          {sidebarViewsBySide.left ? renderVerticalSidebar("left", sidebarViewsBySide.left) : null}
          {sidebarViewsBySide.right ? renderVerticalSidebar("right", sidebarViewsBySide.right) : null}

          <main className="editor-region">
            {documents.length ? (
              <>
                <Tabs.Root className="document-tabs" value={activeDocumentId ?? ""} onValueChange={setActiveDocumentId}>
                  <Tabs.List className="tabs-list">
                    {documents.map((document) => (
                      <Tabs.Trigger
                        className="tab-trigger"
                        key={document.id}
                        value={document.id}
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
                  <div className="breadcrumb">{activeDocument?.path ?? activeDocument?.name}</div>
                  <div className="editor-actions">
                    {editorToolbarItems.map((item) => {
                      const icon = item.icon === "undo" ? <Undo2 size={14} />
                        : item.icon === "diff" ? <Code2 size={14} />
                          : item.icon === "plus" ? <Plus size={14} />
                            : <File size={14} />;
                      return (
                        <button
                          key={item.id}
                          className="icon-button small"
                          type="button"
                          aria-label={item.label}
                          title={item.label}
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
                      disabled={!activeDocument || activeDocument.kind !== "text" || Boolean(activeResourceEditorProvider)}
                      onClick={() => invoke(saveDocument)}
                    ><Save size={14} /></button>
                  </div>
                </div>
                <div className="editor-stack">
                  {activeDocument && activeResourceEditorProvider ? (
                    <ResourceEditorHost provider={activeResourceEditorProvider} document={activeDocument} />
                  ) : activeDocument?.kind === "image" ? (
                    <NativeImageEditor document={activeDocument} />
                  ) : activeDocument?.kind === "binary" ? (
                    <UnsupportedBinaryEditor document={activeDocument} />
                  ) : (
                    <>
                  <div className={`editor-canvas${showEditorGutter ? " has-editor-gutter" : ""}${editorSettings.lineNumbers ? " has-line-numbers" : ""}`}>
                    {showEditorGutter ? (
                      <div className={`editor-line-ruler${editorSettings.lineNumbers ? "" : " decorations-only"}`}>
                        <pre ref={editorLineRulerRef}>
                          {editorRulerLines.map((lineNumber, index) => {
                            const line = index + 1;
                            const breakpoint = activeDocument?.path
                              ? debugBreakpoints.find((candidate) => candidate.path === activeDocument.path && candidate.line === line)
                              : undefined;
                            const currentDebugLine = activeDocument?.path === activeDebugPath && activeDebugLine === line;
                            const decorations = editorDecorationsByLine.get(line) ?? [];
                            const changeDecoration = decorations.find((decoration) => decoration.change);
                            const tooltip = decorations
                              .map((decoration) => decoration.tooltip ?? decoration.label)
                              .filter((value): value is string => Boolean(value))
                              .join("\n");
                            const content = <>
                              <i className={`editor-line-ruler__marker${breakpoint ? " is-breakpoint" : ""}`} />
                              <i className={`editor-line-ruler__execution-marker${currentDebugLine ? " is-current" : ""}`} />
                              {editorSettings.lineNumbers ? <b>{lineNumber}</b> : null}
                            </>;
                            return changeDecoration ? (
                              <button
                                className={`editor-line-ruler__line${lineDecorationClassName(decorations)}${currentDebugLine ? " is-debug-current" : ""}`}
                                key={line}
                                type="button"
                                title={tooltip || undefined}
                                aria-label={`${tooltip || "Exibir alteração"}, linha ${line}`}
                                onClick={() => setSelectedEditorLineDecoration((current) => current === changeDecoration ? undefined : changeDecoration)}
                                onDoubleClick={() => { if (activeDocument?.path) toggleBreakpoint(activeDocument.path, line); }}
                              >
                                {content}
                              </button>
                            ) : (
                              <button
                                className={`editor-line-ruler__line${currentDebugLine ? " is-debug-current" : ""}`}
                                key={line}
                                type="button"
                                aria-label={`${breakpoint ? "Remover" : "Adicionar"} breakpoint na linha ${line}`}
                                onClick={() => { if (activeDocument?.path) toggleBreakpoint(activeDocument.path, line); }}
                              >{content}</button>
                            );
                          })}
                        </pre>
                      </div>
                    ) : null}
                    {activeDocument && activeDocument.path === activeDebugPath && activeDebugLine ? (
                      <div
                        ref={editorDebugCurrentLineRef}
                        className="editor-debug-current-line"
                        aria-hidden="true"
                        data-debug-line={activeDebugLine}
                        style={{
                          "--debug-line-content-top": `${18 + (activeDebugLine - 1) * 21.45}px`,
                          "--editor-scroll-top": `${(highlightedEditorScrollRef.current ?? editorRef.current)?.scrollTop ?? activeDocument.scrollTop}px`,
                        } as React.CSSProperties}
                      />
                    ) : null}
                    {activeSyntaxHighlighter && activeDocument ? (
                      <div
                        ref={highlightedEditorScrollRef}
                        className="highlight-editor"
                        onMouseMove={(event) => {
                          const bounds = event.currentTarget.getBoundingClientRect();
                          const contentY = event.clientY - bounds.top + event.currentTarget.scrollTop - 18;
                          const line = Math.floor(contentY / 21.45) + 1;
                          const nextLine = diagnostics.some((diagnostic) => diagnostic.line === line)
                            ? line
                            : undefined;
                          setHoveredDiagnosticLine((current) => current === nextLine ? current : nextLine);
                        }}
                        onMouseLeave={() => setHoveredDiagnosticLine(undefined)}
                        onScroll={(event) => {
                          syncEditorLineRuler(event.currentTarget.scrollTop);
                          if (editorRef.current) captureEditorState(editorRef.current, event.currentTarget);
                        }}
                      >
                        <div className="highlight-editor__content">
                          <pre className="syntax-layer" data-syntax-provider={activeSyntaxHighlighter.id} data-syntax-origin={activeSyntaxHighlighter.origin}><HighlightedSource source={activeDocument.content} provider={activeSyntaxHighlighter} /></pre>
                          <DiagnosticLayer
                            diagnostics={diagnostics}
                            source={activeDocument.content}
                            hoveredLine={hoveredDiagnosticLine}
                          />
                          <textarea
                            ref={editorRef}
                            className="code-editor code-editor--highlighted"
                            spellCheck={false}
                            wrap="off"
                            value={activeDocument.content}
                            onChange={(event) => updateDocument(event.currentTarget)}
                            onKeyDown={handleEditorKeyDown}
                            onSelect={(event) => captureEditorState(event.currentTarget, highlightedEditorScrollRef.current ?? event.currentTarget)}
                          />
                        </div>
                      </div>
                    ) : (
                      <textarea
                        ref={editorRef}
                        className="code-editor"
                        spellCheck={false}
                        value={activeDocument?.content ?? ""}
                        onChange={(event) => updateDocument(event.currentTarget)}
                        onKeyDown={handleEditorKeyDown}
                        onSelect={(event) => captureEditorState(event.currentTarget)}
                        onScroll={(event) => {
                          syncEditorLineRuler(event.currentTarget.scrollTop);
                          captureEditorState(event.currentTarget);
                        }}
                      />
                    )}
                    {selectedEditorLineDecoration?.change && activeDocument ? (
                      <EditorLineDiffPeek
                        decoration={selectedEditorLineDecoration}
                        provider={activeSyntaxHighlighter}
                        top={18 + (selectedEditorLineDecoration.line - 1) * 21.45 - activeDocument.scrollTop + 21.45}
                        onClose={() => setSelectedEditorLineDecoration(undefined)}
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
                <p>Crie ou abra um arquivo para começar.</p>
                <div className="welcome-actions">
                  {workspaceFileCreationOptions.length ? (
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <button className="button primary" type="button">
                          <FilePlus2 size={16} /> Novo arquivo <ChevronDown size={14} />
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
                              ) : <File size={15} />}
                              <span>{option.label}</span>
                              <span className="menu-item__hint">{option.extension}</span>
                            </DropdownMenu.Item>
                          ))}
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  ) : (
                    <button className="button primary" type="button" onClick={() => newDocument()}><FilePlus2 size={16} /> Novo arquivo</button>
                  )}
                  <button className="button secondary" type="button" onClick={() => invoke(openSingleFile)}><File size={16} /> Abrir arquivo</button>
                  <button className="button secondary" type="button" onClick={() => invoke(openFolder)}><FolderOpen size={16} /> Abrir pasta</button>
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
            <aside
              className={`problems-panel problems-panel--${problemsDockSide}`}
              style={{ gridColumn: problemsDockSide === "left" ? 2 : 6 }}
              aria-label="Problemas"
            >
              <div className="problems-panel__heading">
                <span>PROBLEMAS <b>{diagnostics.length}</b></span>
                <button className="icon-button small" type="button" aria-label="Fechar problemas" onClick={() => setProblemsVisible(false)}><X size={14} /></button>
              </div>
              <div className="problems-list problems-list--vertical">
                {diagnostics.length ? diagnostics.map((diagnostic, index) => (
                  <button type="button" key={`${diagnostic.line}:${index}`}>
                    <strong>{diagnostic.severity}</strong>
                    <span>{diagnostic.line}:{diagnostic.column}</span>
                    <span>{diagnostic.message}</span>
                  </button>
                )) : <p>Nenhum problema detectado.</p>}
              </div>
            </aside>
          ) : null}

          <aside className="right-activity-bar" aria-label="Barra lateral direita">
            {rightActivityItems.map((item) => renderActivityLayoutItem(item, "right"))}
          </aside>

          <div
            className={`workbench-bottom-region${bottomRegionDockSide ? ` workbench-bottom-region--side workbench-bottom-region--${bottomRegionDockSide}` : ""}`}
            {...(bottomRegionDockSide
              ? { style: { gridColumn: bottomRegionDockSide === "left" ? 2 : 6 } }
              : {})}
          >
            {panelVisible && bottomPanelAvailable ? (
              <section className={`output-panel${executionPanelActive ? ` output-panel--side output-panel--${executionDockSide}` : ""}${panelVisible ? "" : " output-panel--hidden"}`} style={executionPanelActive ? undefined : { height: panelHeight }}>
                <div className={`resize-handle ${executionPanelActive
                  ? executionDockSide === "left" ? "resize-handle--sidebar" : "resize-handle--problems"
                  : "resize-handle--panel"}`} role="separator" aria-label="Redimensionar painel inferior" onPointerDown={beginPanelResize} onDoubleClick={() => setPanelHeight(DEFAULT_LAYOUT.panelHeight)} />
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
                            {tab.mode === "debug" ? <Bug size={11} aria-hidden="true" /> : null}
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
                      >{panel.label}</button>
                    ))}
                  </div>
                  <button className="icon-button small" type="button" aria-label="Fechar painel" onClick={() => setPanelVisible(false)}><X size={14} /></button>
                </div>
                {profileOutputTabs.map((tab) => {
                  const tabDebugSession = tab.debugSession;
                  const debugging = Boolean(tabDebugSession);
                  const debugEnded = Boolean(tabDebugSession && ["stopped", "completed", "failed"].includes(tabDebugSession.status));
                  const debugRestarting = debugRestartingProfileId === tab.profileId;
                  const executionRunning = tab.execution?.status === "running";
                  const executionRestarting = restartingProfileId === tab.profileId;
                  const outputOffsets = tabDebugSession
                    ? debugOutputOffsets[tabDebugSession.id] ?? EMPTY_DEBUG_OUTPUT_OFFSETS
                    : EMPTY_DEBUG_OUTPUT_OFFSETS;
                  const outputSegments = tabDebugSession
                    ? debugOutputSegments(tabDebugSession, outputOffsets, debugOutputFilter)
                    : [];
                  return (
                    <div className="execution-panel-view" hidden={panelTab !== tab.tabId} key={tab.tabId}>
                      <div className="execution-panel-toolbar">
                        <div className="execution-panel-toolbar__actions">
                          {tabDebugSession ? (
                            <>
                              <ButtonTooltip label={tabDebugSession.status === "paused" ? "Continuar" : "Pausar"} side="top">
                                <button
                                  className="icon-button small"
                                  type="button"
                                  aria-label={tabDebugSession.status === "paused" ? "Continuar depuração" : "Pausar depuração"}
                                  disabled={debugRestarting || debugEnded || !["running", "paused"].includes(tabDebugSession.status)}
                                  onClick={() => invoke(() => debugCommand(tabDebugSession.status === "paused" ? "resume" : "pause"))}
                                >{tabDebugSession.status === "paused" ? <Play size={14} /> : <Pause size={14} />}</button>
                              </ButtonTooltip>
                              <ButtonTooltip label="Step over" side="top">
                                <button className="icon-button small" type="button" aria-label="Step over" disabled={debugRestarting || tabDebugSession.status !== "paused"} onClick={() => invoke(() => debugCommand("stepOver"))}><StepForward size={14} /></button>
                              </ButtonTooltip>
                              <ButtonTooltip label="Step into" side="top">
                                <button className="icon-button small" type="button" aria-label="Step into" disabled={debugRestarting || tabDebugSession.status !== "paused"} onClick={() => invoke(() => debugCommand("stepInto"))}><CornerDownRight size={14} /></button>
                              </ButtonTooltip>
                              <ButtonTooltip label="Step out" side="top">
                                <button className="icon-button small" type="button" aria-label="Step out" disabled={debugRestarting || tabDebugSession.status !== "paused"} onClick={() => invoke(() => debugCommand("stepOut"))}><CornerUpRight size={14} /></button>
                              </ButtonTooltip>
                              <ButtonTooltip label="Reiniciar depuração" side="top">
                                <button className="icon-button small" type="button" aria-label="Reiniciar depuração" disabled={debugRestarting} onClick={() => invoke(() => restartDebugSession(tab.profileId))}><RotateCw className={debugRestarting ? "is-spinning" : undefined} size={13} /></button>
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
                                ><Play size={14} /></button>
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
                        </div>
                        <span className="execution-panel-toolbar__status">
                          {tabDebugSession ? `Depuração · ${debugRestarting ? "reiniciando" : tabDebugSession.status}` : profileExecutionStatusLabel(tab.execution)}
                        </span>
                      </div>
                      {tabDebugSession ? (
                        <div
                          className="execution-debug-layout"
                          ref={debugLayoutRef}
                          style={{ gridTemplateColumns: `minmax(0, 1fr) 5px ${debugInspectorWidth}px` }}
                        >
                          <section className="execution-debug-output-pane" aria-label="Saída da depuração">
                            <div className="execution-debug-output-toolbar">
                              <label>
                                <span>Exibir</span>
                                <select value={debugOutputFilter} onChange={(event) => setDebugOutputFilter(event.target.value as DebugOutputFilter)}>
                                  <option value="all">Tudo</option>
                                  <option value="stdout">stdout</option>
                                  <option value="stderr">stderr</option>
                                  <option value="system">Debugger</option>
                                </select>
                              </label>
                              <button
                                type="button"
                                className={debugOutputWrap ? "is-active" : undefined}
                                onClick={() => {
                                  const next = !debugOutputWrap;
                                  setDebugOutputWrap(next);
                                  persistDebugPanelLayout({ outputWrap: next });
                                }}
                              >Quebrar linhas</button>
                              <button
                                type="button"
                                className={debugOutputFollowTail ? "is-active" : undefined}
                                onClick={() => {
                                  const next = !debugOutputFollowTail;
                                  setDebugOutputFollowTail(next);
                                  persistDebugPanelLayout({ outputFollowTail: next });
                                }}
                              >Seguir saída</button>
                              <button
                                type="button"
                                onClick={() => setDebugOutputOffsets((current) => ({
                                  ...current,
                                  [tabDebugSession.id]: debugOutputOffsetsFor(tabDebugSession),
                                }))}
                              >Limpar</button>
                            </div>
                            <div ref={debugOutputRef} className={`execution-panel-output execution-panel-output--structured${debugOutputWrap ? " is-wrapped" : ""}`}>
                              {outputSegments.length ? outputSegments.map((segment, index) => (
                                <div className={`debug-output-segment is-${segment.kind}`} key={`${segment.kind}-${index}`}>
                                  <span className="debug-output-segment__label">{segment.label}</span>
                                  <pre>{segment.text}</pre>
                                </div>
                              )) : <p className="debug-output-empty">Nenhuma saída para o filtro selecionado.</p>}
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
                      ) : (
                        <pre className="execution-panel-output">{profileExecutionOutput({ name: tab.name }, tab.execution).join("\n")}</pre>
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

            {restorationComplete && activeToolWindow ? (
              <WorkbenchToolWindowHost
                provider={activeToolWindow}
                state={workbenchState}
                visible={toolWindowVisible}
                height={toolWindowHeight}
                {...(toolWindowViewRequest ? { viewRequest: toolWindowViewRequest } : {})}
                onClose={closeToolWindow}
                onResize={beginToolWindowResize}
                onResetHeight={() => setToolWindowHeight(DEFAULT_LAYOUT.toolWindowHeight)}
              />
            ) : null}
          </div>
        </div>

        <footer className="statusbar">
          <button type="button" onClick={() => invoke(openSingleFile)}><File size={13} /> Abrir arquivo</button>
          <span>{platformSnapshot.plugins.length} plugin(s)</span>
          <span className="status-spacer" />
          <span>{activeDocument?.kind === "text" && activeDocument.content !== activeDocument.savedContent ? "Modificado" : "Salvo"}</span>
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
          if (!open) setWorkbenchDialog(undefined);
        }}>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content className={`workbench-plugin-dialog workbench-plugin-dialog--${workbenchDialog?.contribution.size ?? "large"}`}>
              <div className="dialog-heading">
                <div>
                  <span className="eyebrow">PLUGIN</span>
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
                />
              ) : null}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        <Dialog.Root open={settingsOpen} onOpenChange={setSettingsOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content className="settings-dialog">
              <div className="dialog-heading settings-dialog__heading">
                <div className="settings-dialog__identity">
                  <span className="settings-dialog__icon"><Settings2 size={20} /></span>
                  <div>
                    <span className="eyebrow">PREFERÊNCIAS DO PROJETO</span>
                    <Dialog.Title>Configurações</Dialog.Title>
                    <Dialog.Description>
                      Ajustes locais do editor e extensões instaladas.
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
                  {settingsProviders.length ? <span className="settings-navigation__label">Plugins</span> : null}
                  {settingsProviders.map((provider) => (
                    <button
                      className={settingsSectionId === provider.pluginId ? "is-active" : ""}
                      key={provider.pluginId}
                      type="button"
                      onClick={() => selectSettingsSection(provider.pluginId)}
                    >
                      <Plug size={15} />
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
                            <small>Mostra a numeração das linhas e serve como área de indicadores do editor.</small>
                          </span>
                          <span className="settings-switch">
                            <input
                              type="checkbox"
                              checked={editorSettings.lineNumbers}
                              disabled={!workspaceRoot}
                              onChange={(event) => invoke(() => applyEditorLineNumbers(event.target.checked))}
                            />
                            <i aria-hidden="true" />
                          </span>
                        </label>
                      </div>
                    </>
                  ) : activePluginSettingsProvider ? (
                    <>
                      <div className="settings-section-heading">
                        <span className="settings-section-heading__icon"><Plug size={18} /></span>
                        <div>
                          <span className="eyebrow">PLUGIN</span>
                          <h3>{activePluginSettingsProvider.title}</h3>
                          <p>{activePluginSettingsProvider.description ?? "Configurações específicas deste plugin para o workspace."}</p>
                        </div>
                      </div>
                      <div className="plugin-setting-list">
                        {activePluginSettingsProvider.settings.map((setting) => (
                          <label className="plugin-setting" key={setting.id}>
                            <span className="plugin-setting__copy">
                              <strong>{setting.label}</strong>
                              {setting.description ? <small>{setting.description}</small> : null}
                            </span>
                            <span className="settings-switch">
                              <input
                                type="checkbox"
                                checked={pluginSettingsDraft[setting.id] !== false}
                                disabled={!workspaceRoot}
                                onChange={(event) => invoke(() => applyPluginSetting(setting.id, event.target.checked))}
                              />
                              <i aria-hidden="true" />
                            </span>
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
                {!workspaceRoot ? (
                  <p className="settings-scope-note"><CircleAlert size={14} /> Abra um workspace para alterar configurações locais.</p>
                ) : (
                  <p className="settings-scope-note"><Check size={14} /> Alterações salvas automaticamente em <code>.tinyide/settings.json</code>.</p>
                )}
                <button className="button primary" type="button" onClick={() => setSettingsOpen(false)}>Concluir</button>
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

        <Dialog.Root open={Boolean(environmentBrowserMode)} onOpenChange={(open) => {
          if (!open) cancelEnvironmentBrowser();
        }}>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content className="file-browser-dialog">
              <div className="file-browser-heading">
                <div><span className="eyebrow">SISTEMA DE ARQUIVOS</span><Dialog.Title>{environmentBrowserMode === "file" ? "Selecionar executável" : "Selecionar ambiente"}</Dialog.Title><Dialog.Description>Navegue pelo host, selecione um item válido e confirme.</Dialog.Description></div>
                <Dialog.Close asChild><button className="icon-button" type="button" aria-label="Fechar"><X size={16} /></button></Dialog.Close>
              </div>
              <div className="file-browser-controls">
                <label className="search-field"><Search size={15} /><input value={environmentBrowserFilter} onChange={(event) => setEnvironmentBrowserFilter(event.target.value)} placeholder="Filtrar nesta pasta" /></label>
                <label className="check-row"><input type="checkbox" checked={environmentBrowserHidden} onChange={(event) => { const checked = event.target.checked; setEnvironmentBrowserHidden(checked); invoke(() => loadEnvironmentBrowser(environmentBrowserMode ?? "directory", environmentListing?.path, checked)); }} /> Mostrar ocultos</label>
              </div>
              <div className="file-browser-path"><button className="button secondary compact" type="button" disabled={!environmentListing?.parentPath} onClick={() => invoke(() => navigateEnvironmentBrowser(environmentListing?.parentPath))}><Upload size={14} /> Pasta pai</button><code>{environmentListing?.path ?? "Carregando..."}</code></div>
              <div className="file-browser-selection">{environmentBrowserSelection ? <><Check size={16} /><strong>{environmentBrowserSelection}</strong></> : <span>Nenhum item selecionado.</span>}</div>
              <div className="file-browser-entries">
                {(environmentListing?.entries ?? [])
                  .filter((entry) => !environmentBrowserFilter.trim() || entry.name.toLocaleLowerCase().includes(environmentBrowserFilter.trim().toLocaleLowerCase()))
                  .map((entry) => {
                    const selectable = environmentBrowserMode === "file"
                      ? entry.kind === "file" && (!environmentBrowserExecutableOnly || entry.executable)
                      : entry.kind === "directory" && entry.isEnvironment;
                    return (
                      <button
                        className={`file-browser-entry${environmentBrowserSelection === entry.path ? " is-selected" : ""}`}
                        type="button"
                        key={entry.path}
                        disabled={entry.kind === "file" && !selectable}
                        onDoubleClick={() => entry.kind === "directory" && !selectable ? invoke(() => navigateEnvironmentBrowser(entry.path)) : undefined}
                        onClick={() => selectable ? setEnvironmentBrowserSelection(entry.path) : entry.kind === "directory" ? invoke(() => navigateEnvironmentBrowser(entry.path)) : undefined}
                      >
                        {entry.kind === "directory" ? <Folder size={17} /> : <File size={17} />}
                        <span><strong>{entry.name}</strong><small>{selectable ? (environmentBrowserMode === "file" ? environmentBrowserExecutableOnly ? "Executável válido" : "Arquivo selecionável" : "Ambiente válido") : entry.kind === "directory" ? "Diretório" : "Arquivo"}</small></span>
                      </button>
                    );
                  })}
              </div>
              <div className="file-browser-footer"><button className="button secondary" type="button" onClick={cancelEnvironmentBrowser}>Cancelar</button><button className="button primary" disabled={!environmentBrowserSelection} type="button" onClick={() => invoke(confirmEnvironmentBrowser)}>Confirmar seleção</button></div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        {contextMenu ? (
          <>
            <button
              className="resource-context-menu-backdrop"
              type="button"
              aria-label="Fechar menu de contexto"
              onClick={() => setContextMenu(undefined)}
              onContextMenu={(event) => { event.preventDefault(); setContextMenu(undefined); }}
            />
            <div
              className="menu-content resource-context-menu"
              role="menu"
              aria-label={`Ações de ${contextMenu.target.kind === "root"
                ? workspaceName
                : contextMenu.target.kind === "entry"
                  ? contextMenu.target.entry.name
                  : contextMenu.target.document.name}`}
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              {contextMenu.items.map((item, index) => {
                const previous = contextMenu.items[index - 1];
                const separated = previous && previous.group !== item.group;
                const icon = item.icon === "play" ? <Play size={14} />
                  : item.icon === "folder" ? <FolderOpen size={14} />
                    : item.icon === "copy" ? <Code2 size={14} />
                      : item.icon === "terminal" ? <Terminal size={14} />
                        : item.icon === "save" ? <Save size={14} />
                          : item.icon === "close" ? <X size={14} />
                            : item.icon === "plus" ? <Plus size={14} />
                              : item.icon === "undo" ? <Undo2 size={14} />
                                : item.icon === "diff" ? <Code2 size={14} />
                                  : <File size={14} />;
                return (
                  <div key={item.id}>
                    {separated ? <div className="menu-separator" /> : null}
                    <button
                      className="menu-item resource-context-menu__item"
                      type="button"
                      role="menuitem"
                      disabled={busy}
                      onClick={() => invoke(() => executeContextMenuItem(item, contextMenu.target))}
                    >
                      {icon}<span>{item.label}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}

        {error ? (
          <div className="error-toast" role="alert">
            <span>{error}</span>
            <button className="icon-button small" type="button" aria-label="Fechar erro" onClick={() => setError(undefined)}><X size={14} /></button>
          </div>
        ) : null}

        {pluginPendingRemoval ? (
          <div className="profile-removal-backdrop" role="presentation">
            <section className="profile-removal-dialog" role="alertdialog" aria-modal="true" aria-labelledby="plugin-removal-title">
              <div>
                <span className="eyebrow">CONFIRMAÇÃO</span>
                <h3 id="plugin-removal-title">Remover plugin?</h3>
                <p>O plugin <strong>{pluginPendingRemoval.manifest.name}</strong> será desativado e removido da aplicação.</p>
              </div>
              <div className="dialog-actions">
                <button className="button secondary" type="button" onClick={() => setPluginRemovalId(undefined)}>Cancelar</button>
                <button className="button danger" type="button" onClick={() => invoke(async () => {
                  await platform.uninstall(pluginPendingRemoval.manifest.id);
                  setPluginRemovalId(undefined);
                })}>Remover</button>
              </div>
            </section>
          </div>
        ) : null}

        {explorerPendingDeletion ? (
          <div className="profile-removal-backdrop" role="presentation">
            <section className="profile-removal-dialog" role="alertdialog" aria-modal="true" aria-labelledby="explorer-removal-title">
              <div>
                <span className="eyebrow">CONFIRMAÇÃO</span>
                <h3 id="explorer-removal-title">Excluir {explorerPendingDeletion.kind === "directory" ? "pasta" : "arquivo"}?</h3>
                <p>
                  <strong>{explorerPendingDeletion.name}</strong> será removido do workspace
                  {explorerPendingDeletion.kind === "directory" ? " com todo o conteúdo interno." : "."}
                </p>
              </div>
              <div className="dialog-actions">
                <button className="button secondary" type="button" onClick={() => setExplorerPendingDeletion(undefined)}>Cancelar</button>
                <button className="button danger" type="button" onClick={() => invoke(async () => {
                  const entry = explorerPendingDeletion;
                  await deleteWorkspaceEntry(entry);
                  setExplorerPendingDeletion(undefined);
                })}>Excluir</button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </Tooltip.Provider>
  );
}
