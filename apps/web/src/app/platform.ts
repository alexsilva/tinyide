import {
  CapabilityRegistry,
  CommandRegistry,
  EventBus,
  PluginManager,
} from "@tinyide/core";
import { builtinModules } from "@tinyide/modules";
import type {
  DebugSessionSnapshot,
  ExecutionProfile,
  ModuleContext,
  PluginContext,
  PluginBackendRequestOptions,
  PluginBackendApi,
  PluginConfigurationApi,
  PluginConfigurationData,
  PluginConfigurationScope,
  PluginManifest,
  PluginRecord,
  WorkbenchApi,
  WorkbenchConfirmRequest,
  WorkbenchDialogContribution,
  WorkbenchExecutionProfileUpdateOptions,
  WorkbenchExecutionSnapshot,
  WorkbenchVirtualDocumentRequest,
  WorkbenchWorkspaceResourceOpenRequest,
  WorkbenchTextEditorReplaceContentRequest,
  WorkbenchTextEditorBusyRequest,
  WorkbenchTextEditorSaveRequest,
  WorkbenchTextHighlightRequest,
  WorkbenchTextHighlightResult,
  Disposable,
} from "@tinyide/plugin-api";
import { projectRuntimeFetch, runtimeFetch } from "./project-session";
import { getActiveHostWorkspaceRoot } from "./host-workspace-state";
import { AppPluginHost } from "./plugin-host";
import { createOutputFollowControl } from "./output-follow";
import { createExtensionApi } from "./extension-api";
import { AppModuleHost } from "./module-host";
import { readGlobalState, writeGlobalState } from "../session-store";

const PLATFORM_VERSION = "0.4.0";
const PLUGINS_STATE_KEY = "plugins";

export interface StoredPlugin {
  readonly manifest: PluginManifest;
  readonly manifestUrl: string;
  readonly sourceUrl: string;
  readonly enabled: boolean;
}

function parseStoredPlugins(value: unknown): readonly StoredPlugin[] {
  return Array.isArray(value) ? value as readonly StoredPlugin[] : [];
}

export async function readStoredPlugins(): Promise<readonly StoredPlugin[]> {
  return parseStoredPlugins(await readGlobalState(PLUGINS_STATE_KEY));
}

export async function writeStoredPlugins(
  stored: readonly StoredPlugin[],
): Promise<void> {
  await writeGlobalState(PLUGINS_STATE_KEY, stored);
}

export function rebaseLoopbackPluginUrl(storedUrl: string, currentUrl: string): string {
  try {
    const stored = new URL(storedUrl);
    const current = new URL(currentUrl);
    const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
    if (
      !["http:", "https:"].includes(stored.protocol)
      || !["http:", "https:"].includes(current.protocol)
      || !loopbackHosts.has(stored.hostname)
      || !loopbackHosts.has(current.hostname)
      || stored.origin === current.origin
    ) {
      return storedUrl;
    }
    return new URL(`${stored.pathname}${stored.search}${stored.hash}`, current.origin).href;
  } catch {
    return storedUrl;
  }
}

export function orderPluginsByDependencies<T extends { readonly manifest: PluginManifest }>(
  entries: readonly T[],
): readonly T[] {
  const entriesById = new Map(entries.map((entry) => [entry.manifest.id, entry]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: T[] = [];

  const visit = (entry: T): void => {
    const id = entry.manifest.id;
    if (visited.has(id)) return;
    if (visiting.has(id)) return;

    visiting.add(id);
    for (const dependencyId of Object.keys(entry.manifest.dependencies ?? {})) {
      const dependency = entriesById.get(dependencyId);
      if (dependency) visit(dependency);
    }
    visiting.delete(id);
    visited.add(id);
    ordered.push(entry);
  };

  for (const entry of entries) visit(entry);
  return ordered;
}

export interface PluginCatalogEntry {
  readonly manifest: PluginManifest;
  readonly manifestUrl: string;
  readonly bundled?: boolean;
}

export interface PlatformSnapshot {
  readonly initialized: boolean;
  readonly catalogLoading: boolean;
  readonly plugins: readonly PluginRecord[];
  readonly catalog: readonly PluginCatalogEntry[];
}

type SnapshotListener = () => void;

interface WorkbenchBinding {
  openSidebar(id: string): void;
  openToolWindow(id: string, viewId?: string): void;
  openDialog(dialog: WorkbenchDialogContribution): Disposable;
  confirm(request: WorkbenchConfirmRequest): Promise<boolean>;
  replaceEditorContent(request: WorkbenchTextEditorReplaceContentRequest): Promise<void>;
  beginEditorBusy(request: WorkbenchTextEditorBusyRequest): Disposable;
  saveEditorDocument(request: WorkbenchTextEditorSaveRequest): Promise<void>;
  highlightText(request: WorkbenchTextHighlightRequest): WorkbenchTextHighlightResult;
  openWorkspaceResource(request: WorkbenchWorkspaceResourceOpenRequest): Promise<void>;
  readWorkspaceResource(path: string): Promise<Blob>;
  openVirtualDocument(request: WorkbenchVirtualDocumentRequest): Promise<string>;
  updateVirtualDocument(
    id: string,
    changes: Partial<Pick<WorkbenchVirtualDocumentRequest, "name" | "content">>,
  ): Promise<void>;
  closeVirtualDocument(id: string): Promise<void>;
  isVirtualDocumentOpen(id: string): boolean;
  executionSnapshot(): WorkbenchExecutionSnapshot;
  subscribeExecution(listener: (snapshot: WorkbenchExecutionSnapshot) => void): Disposable;
  updateExecutionData(profileId: string, providerId: string, data: unknown): Promise<void>;
  upsertExecutionProfile(
    profile: ExecutionProfile,
    options?: WorkbenchExecutionProfileUpdateOptions,
  ): Promise<void>;
  removeExecutionProfile(profileId: string): Promise<void>;
  selectExecutionProfile(profileId?: string): Promise<void>;
  runExecutionProfile(profile: ExecutionProfile): Promise<void>;
  debugExecutionProfile(profile: ExecutionProfile): Promise<DebugSessionSnapshot>;
  stopExecutionProfile(profileId: string): Promise<void>;
}

class AppWorkbenchApi implements WorkbenchApi {
  #binding: WorkbenchBinding | undefined;

  readonly dialogs = {
    confirm: async (request: WorkbenchConfirmRequest): Promise<boolean> => {
      if (!this.#binding) throw new Error("O workbench ainda não está disponível.");
      return this.#binding.confirm(request);
    },
    open: (dialog: WorkbenchDialogContribution): Disposable => {
      if (!this.#binding) throw new Error("O workbench ainda não está disponível.");
      return this.#binding.openDialog(dialog);
    },
  };

  readonly editor = {
    replaceContent: async (request: WorkbenchTextEditorReplaceContentRequest): Promise<void> => {
      if (!this.#binding) throw new Error("O workbench ainda não está disponível.");
      await this.#binding.replaceEditorContent(request);
    },
    beginBusy: (request: WorkbenchTextEditorBusyRequest): Disposable => {
      if (!this.#binding) throw new Error("O workbench ainda não está disponível.");
      return this.#binding.beginEditorBusy(request);
    },
    save: async (request: WorkbenchTextEditorSaveRequest): Promise<void> => {
      if (!this.#binding) throw new Error("O workbench ainda não está disponível.");
      await this.#binding.saveEditorDocument(request);
    },
  };

  readonly text = {
    highlight: (request: WorkbenchTextHighlightRequest): WorkbenchTextHighlightResult => {
      if (!this.#binding) throw new Error("O workbench ainda não está disponível.");
      return this.#binding.highlightText(request);
    },
  };

  readonly workspace = {
    openResource: async (request: WorkbenchWorkspaceResourceOpenRequest): Promise<void> => {
      if (!this.#binding) throw new Error("O workbench ainda não está disponível.");
      await this.#binding.openWorkspaceResource(request);
    },
    readResource: async (path: string): Promise<Blob> => {
      if (!this.#binding) throw new Error("O workbench ainda não está disponível.");
      return this.#binding.readWorkspaceResource(path);
    },
  };

  readonly documents = {
    open: async (request: WorkbenchVirtualDocumentRequest): Promise<string> => {
      if (!this.#binding) throw new Error("O workbench ainda não está disponível.");
      return this.#binding.openVirtualDocument(request);
    },
    update: async (
      id: string,
      changes: Partial<Pick<WorkbenchVirtualDocumentRequest, "name" | "content">>,
    ): Promise<void> => {
      if (!this.#binding) throw new Error("O workbench ainda não está disponível.");
      await this.#binding.updateVirtualDocument(id, changes);
    },
    close: async (id: string): Promise<void> => {
      if (!this.#binding) throw new Error("O workbench ainda não está disponível.");
      await this.#binding.closeVirtualDocument(id);
    },
    isOpen: (id: string): boolean => Boolean(this.#binding?.isVirtualDocumentOpen(id)),
  };

  readonly output = {
    createFollowControl: createOutputFollowControl,
  };

  readonly execution = {
    snapshot: (): WorkbenchExecutionSnapshot => {
      if (!this.#binding) throw new Error("O workbench ainda não está disponível.");
      return this.#binding.executionSnapshot();
    },
    subscribe: (listener: (snapshot: WorkbenchExecutionSnapshot) => void): Disposable => {
      if (!this.#binding) throw new Error("O workbench ainda não está disponível.");
      return this.#binding.subscribeExecution(listener);
    },
    updateExecutionData: async (profileId: string, providerId: string, data: unknown): Promise<void> => {
      if (!this.#binding) throw new Error("O workbench ainda não está disponível.");
      await this.#binding.updateExecutionData(profileId, providerId, data);
    },
    upsertProfile: async (
      profile: ExecutionProfile,
      options?: WorkbenchExecutionProfileUpdateOptions,
    ): Promise<void> => {
      if (!this.#binding) throw new Error("O workbench ainda não está disponível.");
      await this.#binding.upsertExecutionProfile(profile, options);
    },
    removeProfile: async (profileId: string): Promise<void> => {
      if (!this.#binding) throw new Error("O workbench ainda não está disponível.");
      await this.#binding.removeExecutionProfile(profileId);
    },
    selectProfile: async (profileId?: string): Promise<void> => {
      if (!this.#binding) throw new Error("O workbench ainda não está disponível.");
      await this.#binding.selectExecutionProfile(profileId);
    },
    runProfile: async (profile: ExecutionProfile): Promise<void> => {
      if (!this.#binding) throw new Error("O workbench ainda não está disponível.");
      await this.#binding.runExecutionProfile(profile);
    },
    debugProfile: async (profile: ExecutionProfile): Promise<DebugSessionSnapshot> => {
      if (!this.#binding) throw new Error("O workbench ainda não está disponível.");
      return this.#binding.debugExecutionProfile(profile);
    },
    stopProfile: async (profileId: string): Promise<void> => {
      if (!this.#binding) throw new Error("O workbench ainda não está disponível.");
      await this.#binding.stopExecutionProfile(profileId);
    },
  };

  bind(binding: WorkbenchBinding): Disposable {
    this.#binding = binding;
    return {
      dispose: () => {
        if (this.#binding === binding) this.#binding = undefined;
      },
    };
  }

  openToolWindow(id: string, viewId?: string): void {
    if (!this.#binding) throw new Error("O workbench ainda não está disponível.");
    this.#binding.openToolWindow(id, viewId);
  }

  openSidebar(id: string): void {
    if (!this.#binding) throw new Error("O workbench ainda não está disponível.");
    this.#binding.openSidebar(id);
  }
}

function pluginSourceUrl(manifest: PluginManifest, manifestUrl: string): string {
  const frontend = manifest.entrypoints?.frontend;
  if (!frontend) throw new Error(`Plugin '${manifest.name}' não possui entrypoint de frontend.`);
  const sourceUrl = new URL(frontend, manifestUrl);
  sourceUrl.searchParams.set("tinyide-plugin-version", manifest.version);
  return sourceUrl.href;
}

export function resolvePluginIconUrl(manifest: PluginManifest, manifestUrl: string): string | undefined {
  if (!manifest.icon) return undefined;
  const baseUrl = new URL(manifestUrl, window.location.href);
  const iconUrl = new URL(manifest.icon, baseUrl);
  return iconUrl.origin === baseUrl.origin ? iconUrl.href : undefined;
}

export function pluginBackend(pluginId: string): PluginBackendApi {
  return {
    async request<Response>(path: string, options: PluginBackendRequestOptions = {}): Promise<Response> {
      const suffix = path.startsWith("/") ? path : `/${path}`;
      const pathname = suffix.split(/[?#]/, 1)[0] ?? "";
      if (suffix.startsWith("//") || pathname.split("/").includes("..")) {
        throw new Error("O caminho do backend do plugin deve ser relativo ao próprio plugin.");
      }
      if (!getActiveHostWorkspaceRoot()) {
        throw Object.assign(new Error("Abra um workspace antes de usar este plugin."), { statusCode: 409 });
      }
      const response = await projectRuntimeFetch(`/plugin-api/${encodeURIComponent(pluginId)}${suffix}`, {
        ...options,
        headers: {
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.headers ?? {}),
        },
      });
      const contentType = response.headers.get("Content-Type") ?? "";
      const payload = response.status === 204
        ? undefined
        : contentType.includes("application/json")
          ? await response.json().catch(() => undefined)
          : await response.text().catch(() => undefined);
      if (!response.ok) {
        const message = payload && typeof payload === "object" && "error" in payload
          ? String(payload.error)
          : `Backend do plugin indisponível: HTTP ${response.status}`;
        // O status acompanha o erro para que o plugin distinga "servidor fora do ar"
        // (reconectar) de "pedido inválido" (falha definitiva) sem ler a mensagem.
        throw Object.assign(new Error(message), { statusCode: response.status });
      }
      return payload as Response;
    },
  };
}

export function pluginConfiguration(pluginId: string): PluginConfigurationApi {
  const endpoint = (scope: PluginConfigurationScope) => (
    scope === "user"
      ? `/core-api/user/plugin-data/${encodeURIComponent(pluginId)}`
      : `/core-api/workspace/plugin-data/${encodeURIComponent(pluginId)}`
  );
  const request = async (
    scope: PluginConfigurationScope,
    method: "GET" | "PUT" | "PATCH",
    value?: PluginConfigurationData,
  ): Promise<PluginConfigurationData> => {
    if (scope === "project" && !getActiveHostWorkspaceRoot()) {
      throw Object.assign(new Error("Abra um workspace antes de alterar a configuração do projeto."), { statusCode: 409 });
    }
    // Configuração de escopo "user" não pertence a projeto nenhum; a de escopo
    // "project" vive dentro do workspace aberto e exige o escopo na URL.
    const send = scope === "user" ? runtimeFetch : projectRuntimeFetch;
    const response = await send(endpoint(scope), {
      method,
      cache: "no-store",
      ...(value === undefined ? {} : {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      }),
    });
    const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload && typeof payload === "object" && "error" in payload
        ? String(payload.error)
        : `Configuração do plugin indisponível: HTTP ${response.status}`;
      throw Object.assign(new Error(message), { statusCode: response.status });
    }
    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload as PluginConfigurationData
      : {};
  };
  return {
    read: (scope) => request(scope, "GET"),
    replace: (scope, value) => request(scope, "PUT", value),
    update: (scope, patch) => request(scope, "PATCH", patch),
  };
}

function pluginContext(platform: TinyIdePlatform, pluginId: string): PluginContext {
  return {
    backend: pluginBackend(pluginId),
    configuration: pluginConfiguration(pluginId),
    commands: platform.commands,
    events: platform.events,
    workbench: platform.workbench,
    extensions: createExtensionApi(platform),
    subscriptions: [],
  };
}

function moduleContext(platform: TinyIdePlatform): ModuleContext {
  return {
    commands: platform.commands,
    events: platform.events,
    extensions: createExtensionApi(platform),
    workbench: platform.workbench,
    subscriptions: [],
  };
}

export class TinyIdePlatform {
  readonly commands = new CommandRegistry();
  readonly events = new EventBus();
  readonly capabilities = new CapabilityRegistry();
  readonly workbench = new AppWorkbenchApi();
  readonly modules = new AppModuleHost(() => moduleContext(this));

  readonly #sourceUrls = new Map<string, string>();
  readonly #manifestUrls = new Map<string, string>();
  readonly #listeners = new Set<SnapshotListener>();
  readonly #host = new AppPluginHost({
    loadModule: (plugin) => {
      const sourceUrl = this.#sourceUrls.get(plugin.manifest.id);
      if (!sourceUrl) throw new Error(`Fonte do plugin não registrada: ${plugin.manifest.id}`);
      return import(/* @vite-ignore */ sourceUrl);
    },
  });
  readonly plugins = new PluginManager({
    platformVersion: PLATFORM_VERSION,
    events: this.events,
    host: this.#host,
  });

  #initialized = false;
  #initializationPromise: Promise<void> | undefined;
  #catalogLoading = false;
  #catalog: PluginCatalogEntry[] = [];

  constructor() {
    const notifyEvents = [
      "plugin.installed",
      "plugin.enabled",
      "plugin.disabled",
      "plugin.activated",
      "plugin.deactivated",
      "plugin.failed",
      "plugin.uninstalled",
    ];
    for (const event of notifyEvents) {
      this.events.on(event, () => this.#notify());
    }

    this.capabilities.register("core.commands", this.commands);
    this.capabilities.register("core.events", this.events);
    this.capabilities.register("core.plugins", this.plugins);
  }

  snapshot(): PlatformSnapshot {
    return {
      initialized: this.#initialized,
      catalogLoading: this.#catalogLoading,
      plugins: this.plugins.list(),
      catalog: [...this.#catalog],
    };
  }

  pluginIconUrl(id: string): string | undefined {
    const plugin = this.plugins.list().find((entry) => entry.manifest.id === id);
    const manifestUrl = this.#manifestUrls.get(id);
    return plugin && manifestUrl ? resolvePluginIconUrl(plugin.manifest, manifestUrl) : undefined;
  }

  subscribe(listener: SnapshotListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async initialize(): Promise<void> {
    if (this.#initialized) return;
    if (this.#initializationPromise) return this.#initializationPromise;

    this.#initializationPromise = (async () => {
      if (!this.modules.list().length) await this.modules.initialize(builtinModules);
      await this.#restore();
      await this.discoverPlugins();
      await this.#installBundledPlugins();
      this.#initialized = true;
      this.#notify();
    })();

    try {
      await this.#initializationPromise;
    } finally {
      this.#initializationPromise = undefined;
    }
  }

  async discoverPlugins(): Promise<void> {
    this.#catalogLoading = true;
    this.#notify();
    try {
      const response = await fetch("/dev-plugins/index.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`Catálogo indisponível: HTTP ${response.status}`);
      const payload = (await response.json()) as {
        readonly plugins?: readonly { readonly manifestUrl?: unknown; readonly bundled?: unknown }[];
      };
      const catalogSources = (payload.plugins ?? [])
        .filter((entry): entry is {readonly manifestUrl: string; readonly bundled?: unknown} => typeof entry.manifestUrl === "string");

      const entries = await Promise.all(
        catalogSources.map(async ({manifestUrl, bundled}): Promise<PluginCatalogEntry | undefined> => {
          const absoluteUrl = new URL(manifestUrl, window.location.href).href;
          const manifestResponse = await fetch(absoluteUrl, { cache: "no-store" });
          if (!manifestResponse.ok) return undefined;
          return {
            manifest: (await manifestResponse.json()) as PluginManifest,
            manifestUrl: absoluteUrl,
            ...(bundled === true ? {bundled: true} : {}),
          };
        }),
      );
      this.#catalog = entries.filter((entry): entry is PluginCatalogEntry => entry !== undefined);
    } finally {
      this.#catalogLoading = false;
      this.#notify();
    }
  }

  async #installBundledPlugins(): Promise<void> {
    let pending = this.#catalog.filter((entry) => (
      entry.bundled && !this.plugins.list().some((plugin) => plugin.manifest.id === entry.manifest.id)
    ));
    while (pending.length) {
      const next: PluginCatalogEntry[] = [];
      let installed = 0;
      for (const entry of pending) {
        try {
          await this.install(entry.manifestUrl);
          installed += 1;
        } catch (error) {
          next.push(entry);
          console.warn(`Não foi possível ativar o plugin empacotado ${entry.manifest.id}.`, error);
        }
      }
      if (!installed) break;
      pending = next;
    }
  }

  async install(manifestUrl: string): Promise<void> {
    const absoluteManifestUrl = new URL(manifestUrl, window.location.href).href;
    const response = await fetch(absoluteManifestUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Falha ao carregar manifesto: HTTP ${response.status}`);

    const manifest = (await response.json()) as PluginManifest;
    const sourceUrl = pluginSourceUrl(manifest, absoluteManifestUrl);
    await this.plugins.install(manifest);
    this.#sourceUrls.set(manifest.id, sourceUrl);
    this.#manifestUrls.set(manifest.id, absoluteManifestUrl);
    await this.plugins.enable(manifest.id);
    await this.plugins.activate(manifest.id, pluginContext(this, manifest.id));
    await this.#persist();
    this.#notify();
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    if (enabled) {
      await this.plugins.enable(id);
      await this.plugins.activate(id, pluginContext(this, id));
    } else {
      await this.plugins.disable(id);
    }
    await this.#persist();
    this.#notify();
  }

  async uninstall(id: string): Promise<void> {
    await this.plugins.uninstall(id);
    this.#sourceUrls.delete(id);
    this.#manifestUrls.delete(id);
    await this.#persist();
    this.#notify();
  }

  async #restore(): Promise<void> {
    const stored = await readStoredPlugins();

    const restored: StoredPlugin[] = [];
    for (const entry of stored) {
      try {
        let manifest = entry.manifest;
        let manifestUrl = rebaseLoopbackPluginUrl(entry.manifestUrl, window.location.href);
        let sourceUrl = rebaseLoopbackPluginUrl(entry.sourceUrl, window.location.href);
        try {
          const response = await fetch(manifestUrl, { headers: { Accept: "application/json" }, cache: "no-store" });
          if (response.ok) {
            manifest = (await response.json()) as PluginManifest;
            sourceUrl = pluginSourceUrl(manifest, manifestUrl);
          }
        } catch {
          // Installed plugins remain restorable when their original source is temporarily unavailable.
        }
        await this.plugins.install(manifest);
        this.#sourceUrls.set(manifest.id, sourceUrl);
        this.#manifestUrls.set(manifest.id, manifestUrl);
        restored.push({ manifest, manifestUrl, sourceUrl, enabled: entry.enabled });
      } catch (error) {
        console.warn(`Não foi possível restaurar o plugin ${entry.manifest.id}.`, error);
      }
    }

    for (const entry of orderPluginsByDependencies(restored)) {
      if (!entry.enabled) continue;
      try {
        await this.plugins.enable(entry.manifest.id);
        await this.plugins.activate(entry.manifest.id, pluginContext(this, entry.manifest.id));
      } catch (error) {
        console.warn(`Não foi possível reativar o plugin ${entry.manifest.id}.`, error);
      }
    }
    await this.#persist();
  }

  async #persist(): Promise<void> {
    const stored = this.plugins.list().flatMap((plugin): StoredPlugin[] => {
      const sourceUrl = this.#sourceUrls.get(plugin.manifest.id);
      const manifestUrl = this.#manifestUrls.get(plugin.manifest.id);
      if (!sourceUrl || !manifestUrl) return [];
      return [{
        manifest: plugin.manifest,
        sourceUrl,
        manifestUrl,
        enabled: plugin.state === "active" || plugin.state === "enabled",
      }];
    });
    await writeStoredPlugins(stored);
  }

  #notify(): void {
    for (const listener of this.#listeners) listener();
  }
}

export const platform = new TinyIdePlatform();
