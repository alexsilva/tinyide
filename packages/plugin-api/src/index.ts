export interface Disposable {
  dispose(): void;
}

export type CommandHandler<Arguments extends unknown[] = unknown[], Result = unknown> = (
  ...args: Arguments
) => Result | Promise<Result>;

export interface CommandRegistryApi {
  register<Arguments extends unknown[], Result>(
    id: string,
    handler: CommandHandler<Arguments, Result>,
  ): Disposable;

  execute<Result = unknown>(id: string, ...args: unknown[]): Promise<Result>;
  has(id: string): boolean;
  list(): readonly string[];
}

export type EventListener<Payload> = (payload: Payload) => void | Promise<void>;

export interface EventBusApi {
  on<Payload>(event: string, listener: EventListener<Payload>): Disposable;
  emit<Payload>(event: string, payload: Payload): Promise<void>;
}

export interface CapabilityRegistryApi {
  register<Provider>(id: string, provider: Provider): Disposable;
  get<Provider>(id: string): Provider;
  tryGet<Provider>(id: string): Provider | undefined;
  getAll<Provider>(id: string): readonly Provider[];
  has(id: string): boolean;
}

export interface PluginEngineRequirement {
  readonly tinyide: string;
}

export interface PluginEntrypoints {
  readonly frontend?: string;
  readonly backend?: string;
}

export type PluginCategory = "language" | "tool";

export interface PluginManifest {
  readonly id: string;
  readonly name: string;
  /** Caminho relativo ao manifesto para a identidade visual do plugin. */
  readonly icon?: string;
  readonly description?: string;
  readonly version: string;
  readonly publisher: string;
  readonly category: PluginCategory;
  readonly engines: PluginEngineRequirement;
  readonly entrypoints?: PluginEntrypoints;
  readonly activationEvents?: readonly string[];
  readonly permissions?: readonly string[];
  readonly contributes?: Readonly<Record<string, unknown>>;
  readonly dependencies?: Readonly<Record<string, string>>;
}

export type PluginState =
  | "discovered"
  | "installed"
  | "disabled"
  | "enabled"
  | "activating"
  | "active"
  | "deactivating"
  | "failed"
  | "uninstalled";

export interface PluginRecord {
  readonly manifest: PluginManifest;
  readonly state: PluginState;
  readonly installedAt: string;
  readonly error?: string;
}

export interface PluginBackendRequestOptions {
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly signal?: AbortSignal;
}

export interface PluginBackendApi {
  request<Response = unknown>(
    path: string,
    options?: PluginBackendRequestOptions,
  ): Promise<Response>;
}

export interface PluginContext {
  readonly backend: PluginBackendApi;
  /** Persistent configuration owned by this plugin. Data is namespaced by plugin id and stored only in tinyIde settings files. */
  readonly configuration: PluginConfigurationApi;
  readonly commands: CommandRegistryApi;
  readonly events: EventBusApi;
  readonly extensions: PluginExtensionApi;
  readonly workbench: WorkbenchApi;
  readonly subscriptions: Disposable[];
}

export type PluginConfigurationScope = "user" | "project";
export type PluginConfigurationData = Readonly<Record<string, unknown>>;

export interface PluginConfigurationApi {
  read(scope: PluginConfigurationScope): Promise<PluginConfigurationData>;
  replace(scope: PluginConfigurationScope, value: PluginConfigurationData): Promise<PluginConfigurationData>;
  update(scope: PluginConfigurationScope, patch: PluginConfigurationData): Promise<PluginConfigurationData>;
}

/** Contexto público entregue a implementações básicas distribuídas com a IDE. */
export interface ModuleContext {
  readonly commands: CommandRegistryApi;
  readonly events: EventBusApi;
  readonly extensions: PluginExtensionApi;
  readonly workbench: WorkbenchApi;
  readonly subscriptions: Disposable[];
}

/**
 * Implementação básica carregada automaticamente pela IDE.
 *
 * Módulos não possuem estado de instalação, ativação ou habilitação. Eles usam
 * exclusivamente contratos públicos e podem ser substituídos por providers de
 * plugins com prioridade superior.
 */
export interface TinyIdeModule {
  readonly id: string;
  readonly version: string;
  init(context: ModuleContext): void | Promise<void>;
  dispose?(): void | Promise<void>;
}

export interface PluginExtensionApi {
  registerLanguageProvider(provider: LanguageProvider): Disposable;
  getLanguageProviders(): readonly LanguageProvider[];
  registerResourceIconProvider(provider: ResourceIconProvider): Disposable;
  registerResourceDecorationProvider(provider: ResourceDecorationProvider): Disposable;
  registerWorkspaceFileCreationProvider(provider: WorkspaceFileCreationProvider): Disposable;
  registerExecutionEnvironmentProvider(provider: ExecutionEnvironmentProvider): Disposable;
  registerExecutionProfileContributionProvider(provider: ExecutionProfileContributionProvider): Disposable;
  registerDebugAdapterProvider(provider: DebugAdapterProvider): Disposable;
  registerScriptExecution(contribution: ScriptExecutionContribution): Disposable;
  registerResourceContextMenuProvider(provider: ResourceContextMenuProvider): Disposable;
  registerTextEditorContextMenuProvider(provider: TextEditorContextMenuProvider): Disposable;
  registerTextEditorNavigationProvider(provider: TextEditorNavigationProvider): Disposable;
  registerInteractiveSessionHook(provider: InteractiveSessionHookProvider): Disposable;
  registerInteractiveSessionProvider(provider: InteractiveSessionProvider): Disposable;
  registerTextEditorCompletionProvider(provider: TextEditorCompletionProvider): Disposable;
  getInteractiveSessionHooks(): readonly InteractiveSessionHookProvider[];
  registerPluginSettingsProvider(provider: PluginSettingsProvider): Disposable;
  registerWorkbenchSidebarHook(hook: WorkbenchSidebarHook): Disposable;
  registerWorkbenchPanelHook(hook: WorkbenchPanelHook): Disposable;
  registerWorkbenchToolWindowHook(hook: WorkbenchToolWindowHook): Disposable;
  registerWorkbenchThemeProvider(provider: WorkbenchThemeProvider): Disposable;
  registerWorkbenchFontProvider(provider: WorkbenchFontProvider): Disposable;
  registerWorkbenchIconProvider(provider: WorkbenchIconProvider): Disposable;
  registerWorkbenchTitlebarContribution(contribution: WorkbenchTitlebarContribution): Disposable;
  registerWorkbenchStatusbarContribution(contribution: WorkbenchStatusbarContribution): Disposable;
  registerWorkbenchExplorerFilterProvider(provider: WorkbenchExplorerFilterProvider): Disposable;
  registerWorkbenchExplorerIgnoreProvider(provider: WorkbenchExplorerIgnoreProvider): Disposable;
  registerWorkbenchEditorToolbarProvider(provider: WorkbenchEditorToolbarProvider): Disposable;
  registerTextEditorLineDecorationProvider(provider: TextEditorLineDecorationProvider): Disposable;
  registerWorkbenchResourceEditorProvider(provider: WorkbenchResourceEditorProvider): Disposable;
  registerWorkbenchHtmlPreviewProvider(provider: WorkbenchHtmlPreviewProvider): Disposable;
  getWorkbenchHtmlPreviewProviders(): readonly WorkbenchHtmlPreviewProvider[];
  registerWorkbenchExecutionViewProvider(provider: WorkbenchExecutionViewProvider): Disposable;
}

export interface PluginModule {
  init(context: PluginContext): void | Promise<void>;
  activate?(): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

export type DiagnosticSeverity = "error" | "warning" | "information";

export interface TextDiagnostic {
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly line: number;
  readonly column: number;
  readonly endLine?: number;
  readonly endColumn?: number;
  readonly code?: string;
}

export interface LanguageLintRule {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly defaultEnabled: boolean;
}

export interface LanguageLintSettings {
  readonly enabledRuleIds: readonly string[];
}

export interface SyntaxToken {
  readonly start: number;
  readonly end: number;
  readonly scope:
    | "keyword"
    | "string"
    | "number"
    | "comment"
    | "function"
    | "class"
    | "decorator"
    | "builtin"
    | "operator";
}

export interface TextEditorFoldingRange {
  /** One-based line where the foldable region header starts. */
  readonly startLine: number;
  /** One-based line where the foldable region ends, inclusive. */
  readonly endLine: number;
  /** Optional language-owned classification for future UI hints. */
  readonly kind?: "region" | "comment" | "imports" | "code" | string;
  /** Optional placeholder text hint. The editor may ignore it. */
  readonly collapsedText?: string;
}

export interface TextEditorFoldingContext {
  readonly document: TextEditorDocumentSnapshot;
  /**
   * Source whose line numbers must be used for the returned ranges.
   * In the plain editor this is the document content; when folds are already
   * visible it may be the current editor projection.
   */
  readonly source: string;
}

export interface ScriptExecutionResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly durationMs: number;
}

export type ExecutionProfileEnvironmentBinding =
  | { readonly mode: "none" }
  | { readonly mode: "fixed"; readonly environmentId: string };

export interface ExecutionProfileStep {
  readonly id: string;
  readonly name: string;
  readonly executable: string;
  /**
   * Fully materialized process arguments. When present, these arguments are
   * the execution source of truth and `command`/`parameters` are retained only
   * for backward-compatible profile authoring.
   */
  readonly arguments?: readonly string[];
  /** Optional provider-owned authoring metadata. The execution core ignores it. */
  readonly target?: ExecutionProfileTargetSelection;
  readonly command: string;
  readonly parameters: readonly string[];
  /** Optional authoring hint shown when the parameter list is empty. */
  readonly parametersPlaceholder?: string;
  readonly workingDirectory?: string;
  readonly environmentVariables?: Readonly<Record<string, string>>;
  readonly continueOnError?: boolean;
}

export interface ExecutionProfileTargetSelection {
  readonly providerId: string;
  readonly kindId: string;
  readonly value: string;
}

export interface ExecutionProfile {
  readonly id: string;
  readonly name: string;
  readonly environment: ExecutionProfileEnvironmentBinding;
  readonly steps: readonly ExecutionProfileStep[];
  readonly saveBeforeRun?: boolean;
}

export interface ExecutionProfileVariableContext {
  readonly workspaceRoot?: string;
  readonly activeFile?: string;
  readonly activeFileDirectory?: string;
  readonly activeFileName?: string;
  readonly environmentExecutable?: string;
  readonly environmentPath?: string;
}

export interface ResolvedExecutionProfileStep {
  readonly id: string;
  readonly name: string;
  readonly executable: string;
  readonly arguments: readonly string[];
  readonly workingDirectory?: string;
  readonly environmentVariables?: Readonly<Record<string, string>>;
  readonly continueOnError: boolean;
}

export interface ProcessExecutionRequest {
  readonly executable: string;
  readonly arguments: readonly string[];
  readonly workingDirectory?: string;
  readonly environmentVariables?: Readonly<Record<string, string>>;
}

export interface ExecutionProfileContributionContext {
  readonly workspaceName?: string;
  readonly workspaceRoot?: string;
  readonly activeFileName?: string;
  readonly activeFilePath?: string;
}

export interface ExecutionProfileExecutableOption {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly description?: string;
  readonly environmentId?: string;
}

export interface ExecutionProfileVariableContribution {
  readonly name: string;
  readonly label: string;
  readonly description?: string;
}

export interface ExecutionProfilePresetContribution {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  create(context: ExecutionProfileContributionContext): ExecutionProfile;
}

export interface ExecutionProfileTargetKindContribution {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly valueLabel: string;
  readonly placeholder?: string;
  readonly browse?: boolean;
  buildArguments(target: string, parameters: readonly string[]): readonly string[];
  parseArguments?(
    argumentsList: readonly string[],
  ): { readonly target: string; readonly parameters: readonly string[] } | undefined;
}

export interface ExecutionProfileTargetKindOption extends ExecutionProfileTargetKindContribution {
  readonly providerId: string;
  readonly providerName: string;
  readonly environmentProviderId?: string;
}

export interface ExecutionProfileContributionProvider {
  readonly id: string;
  readonly name: string;
  readonly environmentProviderId?: string;
  executableOptions?(
    context: ExecutionProfileContributionContext,
  ): Promise<readonly ExecutionProfileExecutableOption[]> | readonly ExecutionProfileExecutableOption[];
  variables?(
    context: ExecutionProfileContributionContext,
  ): Promise<readonly ExecutionProfileVariableContribution[]> | readonly ExecutionProfileVariableContribution[];
  presets?(
    context: ExecutionProfileContributionContext,
  ): Promise<readonly ExecutionProfilePresetContribution[]> | readonly ExecutionProfilePresetContribution[];
  targetKinds?(
    context: ExecutionProfileContributionContext,
  ): Promise<readonly ExecutionProfileTargetKindContribution[]> | readonly ExecutionProfileTargetKindContribution[];
}

export const EXECUTION_PROFILE_CONTRIBUTION_CAPABILITY = "execution.profile.contribution";

export interface DebugBreakpoint {
  /** Workspace-relative source path. */
  readonly path: string;
  /** One-based source line. */
  readonly line: number;
  readonly column?: number;
  readonly enabled?: boolean;
  readonly verified?: boolean;
  readonly message?: string;
}

export type DebugSessionStatus = "starting" | "running" | "paused" | "stopped" | "completed" | "failed";

export interface DebugStackFrame {
  readonly id: string;
  readonly name: string;
  readonly path?: string;
  readonly line?: number;
  readonly column?: number;
}

export interface DebugVariable {
  readonly name: string;
  readonly value: string;
  readonly type?: string;
  readonly children?: readonly DebugVariable[];
}

export interface DebugScope {
  readonly name: string;
  readonly variables: readonly DebugVariable[];
}

export interface DebugSessionSnapshot {
  readonly id: string;
  readonly adapterId: string;
  readonly profileId: string;
  readonly profileName: string;
  readonly status: DebugSessionStatus;
  readonly reason?: string;
  readonly breakpoints: readonly DebugBreakpoint[];
  readonly frames: readonly DebugStackFrame[];
  readonly selectedFrameId?: string;
  readonly scopes: readonly DebugScope[];
  readonly stdout: string;
  readonly stderr: string;
  readonly error?: string;
  readonly startedAt: number;
  readonly finishedAt?: number;
}

export interface DebugLaunchRequest {
  readonly profileId: string;
  readonly profileName: string;
  readonly environmentId?: string;
  readonly executable: string;
  readonly arguments: readonly string[];
  readonly workingDirectory: string;
  readonly environmentVariables?: Readonly<Record<string, string>>;
  readonly workspaceRoot: string;
  readonly breakpoints: readonly DebugBreakpoint[];
  readonly stopOnEntry?: boolean;
}

export type DebugAdapterCommand = "pause" | "resume" | "stepOver" | "stepInto" | "stepOut" | "stop";

export interface DebugAdapterContext {
  readonly profile: ExecutionProfile;
  readonly environment?: ExecutionEnvironment;
  readonly environmentProviderId?: string;
  readonly activeFileName?: string;
}

export interface DebugAdapterProvider {
  readonly id: string;
  readonly name: string;
  readonly environmentProviderId?: string;
  readonly extensions?: readonly string[];
  supports(context: DebugAdapterContext): boolean;
  list?(): Promise<readonly DebugSessionSnapshot[]>;
  launch(request: DebugLaunchRequest): Promise<DebugSessionSnapshot>;
  read(sessionId: string): Promise<DebugSessionSnapshot>;
  setBreakpoints(sessionId: string, breakpoints: readonly DebugBreakpoint[]): Promise<DebugSessionSnapshot>;
  command(sessionId: string, command: DebugAdapterCommand): Promise<DebugSessionSnapshot>;
  evaluate?(sessionId: string, expression: string, frameId?: string): Promise<DebugVariable>;
}

export const DEBUG_ADAPTER_CAPABILITY = "execution.debugAdapter";

export interface LanguageProvider {
  readonly id: string;
  readonly name: string;
  readonly extensions: readonly string[];
  /** Runtime provider used by language services that execute tools from the selected project environment. */
  readonly environmentProviderId?: string;
  /** Maior prioridade vence. Módulos devem usar prioridade negativa para permitir substituição por plugins. */
  readonly priority?: number;
  readonly lintRules?: readonly LanguageLintRule[];
  highlight(source: string): readonly SyntaxToken[];
  provideFoldingRanges?(
    context: TextEditorFoldingContext,
  ): Promise<readonly TextEditorFoldingRange[]> | readonly TextEditorFoldingRange[];
  formatDocument?(
    context: LanguageDocumentFormattingContext,
  ):
    | Promise<LanguageDocumentFormattingResult | undefined>
    | LanguageDocumentFormattingResult
    | undefined;
  lint(
    source: string,
    fileName: string,
    settings?: LanguageLintSettings,
  ): Promise<readonly TextDiagnostic[]>;
}

export const LANGUAGE_PROVIDER_CAPABILITY = "language.provider";

export interface LanguageDocumentFormattingContext {
  readonly document: TextEditorDocumentSnapshot;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  /** Runtime selecionado no workspace, quando o override da linguagem depende dele. */
  readonly environmentExecutable?: string;
}

export interface LanguageDocumentFormattingResult {
  readonly content: string;
  readonly selectionStart?: number;
  readonly selectionEnd?: number;
}

/**
 * Resolve o provider dono de um arquivo sem conhecer linguagens específicas.
 * Prioridade do provider vence; em empate, a extensão mais específica vence.
 */
export function languageProviderForFile(
  fileName: string,
  providers: readonly LanguageProvider[],
): LanguageProvider | undefined {
  const lowerName = fileName.toLocaleLowerCase();
  return providers
    .map((provider, index) => ({
      provider,
      index,
      extension: provider.extensions
        .map((extension) => extension.toLocaleLowerCase())
        .filter((extension) => lowerName.endsWith(extension))
        .sort((left, right) => right.length - left.length)[0],
    }))
    .filter((item): item is { provider: LanguageProvider; index: number; extension: string } => Boolean(item.extension))
    .sort((left, right) =>
      (right.provider.priority ?? 0) - (left.provider.priority ?? 0)
      || right.extension.length - left.extension.length
      || left.index - right.index
    )[0]?.provider;
}

export interface ScriptExecutionContribution {
  readonly id: string;
  readonly name: string;
  readonly extensions: readonly string[];
  /** Environment provider whose selected runtime should execute this script. */
  readonly environmentProviderId?: string;
  readonly executable?: string;
  readonly arguments?: readonly string[];
}

export const SCRIPT_EXECUTION_CAPABILITY = "execution.script";

export interface ResourceContext {
  readonly kind: "file" | "directory";
  readonly name: string;
  readonly path: string;
  /** Open editor document associated with this resource, when available. */
  readonly documentId?: string;
  readonly workspaceName?: string;
  readonly workspaceRoot?: string;
  /** True when the file is currently modified in an open editor buffer. */
  readonly isDirty?: boolean;
}

export interface ResourceIcon {
  readonly id: string;
  readonly label: string;
  readonly foreground?: string;
  readonly background?: string;
  readonly title?: string;
}

export interface ResourceIconProvider {
  readonly id: string;
  provideIcon(resource: ResourceContext): ResourceIcon | undefined;
}

export const RESOURCE_ICON_CAPABILITY = "resource.icon";

export interface WorkspaceFileCreationOption {
  /** Stable identifier scoped to the provider. */
  readonly id: string;
  /** Human-readable menu label, for example "Arquivo Python". */
  readonly label: string;
  /** File suffix including the leading dot, for example ".py". */
  readonly extension: `.${string}`;
  /** Optional filename prefilled in the Explorer inline editor. */
  readonly suggestedName?: string;
  readonly description?: string;
  readonly order?: number;
  readonly icon?: ResourceIcon;
}

export interface WorkspaceFileCreationProvider {
  readonly id: string;
  readonly pluginId: string;
  provideOptions(
    directory: ResourceContext,
  ): Promise<readonly WorkspaceFileCreationOption[]> | readonly WorkspaceFileCreationOption[];
}

export const WORKSPACE_FILE_CREATION_CAPABILITY = "workspace.fileCreation";

export interface ResourceDecoration {
  /** CSS color applied to the resource label. */
  readonly foreground?: string;
  readonly badge?: string;
  readonly tooltip?: string;
  readonly priority?: number;
}

export interface ResourceDecorationProvider {
  readonly id: string;
  readonly pluginId: string;
  provideDecoration(
    resource: ResourceContext,
  ): Promise<ResourceDecoration | undefined> | ResourceDecoration | undefined;
  onDidChange?(listener: (paths?: readonly string[]) => void): Disposable;
}

export const RESOURCE_DECORATION_CAPABILITY = "resource.decoration";

export type ResourceContextMenuIcon = "file" | "folder" | "play" | "copy" | "terminal" | "save" | "close" | "diff" | "plus" | "undo" | "preview" | "history" | "back" | "forward";

export type ResourceContextMenuAction = "runScript";

export interface ResourceContextMenuItem {
  readonly id: string;
  readonly label: string;
  readonly command?: string;
  readonly action?: ResourceContextMenuAction;
  readonly group?: string;
  readonly order?: number;
  readonly icon?: ResourceContextMenuIcon;
  readonly enabled?: boolean;
}

export interface ResourceContextMenuProvider {
  readonly id: string;
  provideItems(
    resource: ResourceContext,
  ): Promise<readonly ResourceContextMenuItem[]> | readonly ResourceContextMenuItem[];
}

export const RESOURCE_CONTEXT_MENU_CAPABILITY = "resource.contextMenu";

export interface TextEditorContextMenuContext {
  readonly document: TextEditorDocumentSnapshot;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  /** Runtime selecionado no workspace, quando uma ação da linguagem depende dele. */
  readonly environmentExecutable?: string;
  /** One-based cursor line. */
  readonly line: number;
  /** One-based cursor column. */
  readonly column: number;
}

export interface TextEditorContextMenuProvider {
  readonly id: string;
  readonly pluginId: string;
  provideItems(
    context: TextEditorContextMenuContext,
  ): Promise<readonly ResourceContextMenuItem[]> | readonly ResourceContextMenuItem[];
}

export const TEXT_EDITOR_CONTEXT_MENU_CAPABILITY = "textEditor.contextMenu";
export const TEXT_EDITOR_FORMAT_DOCUMENT_COMMAND = "textEditor.formatDocument";

export interface TextEditorPosition {
  /** One-based line. */
  readonly line: number;
  /** One-based column. */
  readonly column: number;
}

export interface TextEditorRange {
  readonly start: TextEditorPosition;
  readonly end: TextEditorPosition;
}

export type TextEditorNavigationKind = "definition" | "declaration" | "implementation";

export interface TextEditorNavigationContext {
  readonly document: TextEditorDocumentSnapshot;
  readonly position: TextEditorPosition;
  readonly offset: number;
  readonly kind: TextEditorNavigationKind;
  /** Executable selected by the workspace, when navigation depends on its SDK/runtime. */
  readonly environmentExecutable?: string;
}

export interface TextEditorNavigationSource {
  readonly name: string;
  readonly content: string;
  readonly mediaType?: string;
  /** Human-readable origin, such as an SDK or dependency path. */
  readonly origin: string;
}

export interface TextEditorNavigationTarget {
  /** Workspace-relative path. Optional when the provider supplies external source. */
  readonly path?: string;
  /** Provider-owned source outside the workspace, opened read-only by the workbench. */
  readonly source?: TextEditorNavigationSource;
  readonly range: TextEditorRange;
  readonly label?: string;
}

export interface TextEditorNavigationProvider {
  readonly id: string;
  readonly pluginId: string;
  readonly priority?: number;
  canNavigate(document: TextEditorDocumentSnapshot): boolean;
  provideTargets(
    context: TextEditorNavigationContext,
  ): Promise<readonly TextEditorNavigationTarget[]> | readonly TextEditorNavigationTarget[];
}

export const TEXT_EDITOR_NAVIGATION_CAPABILITY = "textEditor.navigation";

export type TextEditorCompletionKind =
  | "text"
  | "keyword"
  | "variable"
  | "function"
  | "method"
  | "class"
  | "module"
  | "property"
  | "snippet"
  | "file"
  | "folder";

export interface TextEditorCompletionItem {
  /** Texto exibido na lista de sugestões. */
  readonly label: string;
  /** Texto inserido no editor. Quando omitido, usa `label`. */
  readonly insertText?: string;
  readonly kind?: TextEditorCompletionKind;
  /** Detalhe curto (tipo, assinatura, origem). */
  readonly detail?: string;
  /** Documentação opcional exibida no painel de detalhe. */
  readonly documentation?: string;
  /** Chave de ordenação. Menor vem primeiro. */
  readonly sortText?: string;
  /** Texto usado no filtro. Quando omitido, usa `label`. */
  readonly filterText?: string;
  /** Caracteres que confirmam a sugestão ao serem digitados. */
  readonly commitCharacters?: readonly string[];
}

export interface TextEditorCompletionContext {
  readonly document: TextEditorDocumentSnapshot;
  readonly position: TextEditorPosition;
  readonly offset: number;
  /** Prefixo da palavra sob o cursor (token à esquerda). */
  readonly prefix: string;
  /** Caractere que disparou o autocomplete, quando houver. */
  readonly triggerCharacter?: string;
  /** Runtime selecionado no workspace, quando o provider depende dele. */
  readonly environmentExecutable?: string;
  /** Permite cancelar trabalho lento quando o pedido for substituído. */
  readonly signal?: AbortSignal;
}

export interface TextEditorCompletionList {
  readonly items: readonly TextEditorCompletionItem[];
  /** Quando true, a lista pode crescer com mais resultados. */
  readonly isIncomplete?: boolean;
}

/**
 * Provider de autocomplete consumido pelo editor.
 * Providers genéricos devem usar `priority` negativa para permitir que plugins
 * de linguagem (Python, Node, etc.) dominem as sugestões dos arquivos que suportam.
 */
export interface TextEditorCompletionProvider {
  readonly id: string;
  /** Identificador do plugin ou módulo que registra o provider. */
  readonly pluginId?: string;
  /** Maior prioridade é consultada primeiro. Módulos: valores negativos. */
  readonly priority?: number;
  canComplete(document: TextEditorDocumentSnapshot): boolean;
  provideCompletions(
    context: TextEditorCompletionContext,
  ):
    | Promise<TextEditorCompletionList | readonly TextEditorCompletionItem[]>
    | TextEditorCompletionList
    | readonly TextEditorCompletionItem[];
}

export const TEXT_EDITOR_COMPLETION_CAPABILITY = "textEditor.completion";

export type PluginSettingValue = boolean | string | number | readonly string[];

export type PluginSettingValues = Readonly<Record<string, PluginSettingValue>>;

export type PluginSettingsMap = Readonly<Record<string, PluginSettingValues>>;

export interface PluginBooleanSettingDefinition {
  readonly id: string;
  readonly type: "boolean";
  readonly label: string;
  readonly description?: string;
  readonly defaultValue: boolean;
}

export interface PluginNumberSettingDefinition {
  readonly id: string;
  readonly type: "number";
  readonly label: string;
  readonly description?: string;
  readonly defaultValue: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

export interface PluginSelectSettingOption {
  readonly value: string;
  readonly label: string;
}

export interface PluginSelectSettingDefinition {
  readonly id: string;
  readonly type: "select";
  readonly label: string;
  readonly description?: string;
  readonly defaultValue: string;
  readonly options: readonly PluginSelectSettingOption[];
}

export interface PluginStringSettingDefinition {
  readonly id: string;
  readonly type: "string";
  readonly label: string;
  readonly description?: string;
  readonly defaultValue: string;
  readonly placeholder?: string;
}

export interface PluginStringArraySettingDefinition {
  readonly id: string;
  readonly type: "stringArray";
  readonly label: string;
  readonly description?: string;
  readonly defaultValue: readonly string[];
  readonly inputPlaceholder?: string;
  readonly addLabel?: string;
}

export type PluginSettingDefinition =
  | PluginBooleanSettingDefinition
  | PluginNumberSettingDefinition
  | PluginSelectSettingDefinition
  | PluginStringSettingDefinition
  | PluginStringArraySettingDefinition;

export interface PluginSettingsProvider {
  readonly id: string;
  readonly pluginId: string;
  readonly title: string;
  readonly description?: string;
  /** Defines the single persistence owner for these settings. */
  readonly scope: "user" | "project";
  readonly settings: readonly PluginSettingDefinition[];
}

export const PLUGIN_SETTINGS_CAPABILITY = "plugin.settings";

export interface WorkbenchStateSnapshot {
  readonly workspaceName: string;
  readonly workspaceRoot?: string;
  readonly activeSidebarId: string;
  readonly sidebarVisible: boolean;
  readonly activePanelId: string;
  readonly panelVisible: boolean;
  readonly activeToolWindowId?: string;
  readonly toolWindowVisible: boolean;
  /** Legacy single selection. Prefer selectedExecutionEnvironmentIds for provider-aware integrations. */
  readonly selectedExecutionEnvironmentId?: string;
  /** One independently selected execution environment per provider. */
  readonly selectedExecutionEnvironmentIds?: Readonly<Record<string, string>>;
  readonly pluginSettings: PluginSettingsMap;
}

export interface WorkbenchStateApi {
  snapshot(): WorkbenchStateSnapshot;
  subscribe(listener: (snapshot: WorkbenchStateSnapshot) => void): Disposable;
}

export interface WorkbenchPanelMountContext {
  readonly container: HTMLElement;
  readonly state: WorkbenchStateApi;
}

/**
 * Identificador semântico de ícone do workbench.
 *
 * Valores conhecidos da distribuição base: box, database, docker, files, git,
 * history, nodejs, python, source-control, terminal. Packs e plugins podem
 * introduzir novos ids; a resolução concreta vem de `WorkbenchIconProvider`.
 */
export type WorkbenchActivityIcon = string;

/** Ícones semânticos padrão publicados pelo módulo builtin de ícones. */
export const WORKBENCH_BUILTIN_ICON_IDS = [
  "back",
  "box",
  "bug",
  "check",
  "close",
  "copy",
  "database",
  "diff",
  "docker",
  "file",
  "files",
  "folder",
  "folder-open",
  "forward",
  "git",
  "history",
  "nodejs",
  "package",
  "pause",
  "play",
  "plugins",
  "plus",
  "preview",
  "problems",
  "python",
  "refresh",
  "rerun",
  "save",
  "search",
  "settings",
  "source-control",
  "stop",
  "terminal",
  "undo",
] as const;

export type WorkbenchBuiltinIconId = (typeof WORKBENCH_BUILTIN_ICON_IDS)[number];

export type WorkbenchThemeAppearance = "light" | "neutral" | "dark";

/**
 * Tokens semânticos do shell. Plugins que desejem acompanhar o tema devem usar as
 * variáveis CSS públicas listadas em `WORKBENCH_THEME_CSS_VARIABLES`, em vez de
 * codificar uma paleta própria de superfícies, bordas e texto.
 */
export interface WorkbenchThemeTokens {
  readonly background: string;
  readonly surface1: string;
  readonly surface2: string;
  readonly surface3: string;
  readonly surface4: string;
  readonly surfaceRaised: string;
  readonly surfaceInput: string;
  readonly surfaceEditor: string;
  readonly surfacePanel: string;
  readonly surfaceSidebar: string;
  readonly surfaceTitlebar: string;
  readonly surfaceActivityBar: string;
  readonly surfaceStatusbar: string;
  readonly border: string;
  readonly borderStrong: string;
  readonly text: string;
  readonly textMuted: string;
  readonly textSubtle: string;
  readonly textInverse: string;
  readonly accent: string;
  readonly accentStrong: string;
  readonly accentSoft: string;
  readonly danger: string;
  readonly dangerSoft: string;
  readonly success: string;
  readonly successSoft: string;
  readonly warning: string;
  readonly information: string;
  readonly directory: string;
  readonly scrollbarThumb: string;
  readonly scrollbarThumbHover: string;
  readonly selection: string;
  readonly editorForeground: string;
  readonly editorCaret: string;
  readonly syntaxKeyword: string;
  readonly syntaxString: string;
  readonly syntaxNumber: string;
  readonly syntaxComment: string;
  readonly syntaxFunction: string;
  readonly syntaxClass: string;
  readonly syntaxDecorator: string;
  readonly syntaxBuiltin: string;
  readonly syntaxOperator: string;
}

/**
 * Contrato público entre temas e UI de plugins.
 *
 * Estes nomes são aplicados no elemento raiz do workbench e ficam disponíveis a
 * qualquer contribuição visual de plugin via CSS custom properties.
 */
export const WORKBENCH_THEME_CSS_VARIABLES = {
  background: "--bg",
  surface1: "--surface-1",
  surface2: "--surface-2",
  surface3: "--surface-3",
  surface4: "--surface-4",
  surfaceRaised: "--surface-raised",
  surfaceInput: "--surface-input",
  surfaceEditor: "--surface-editor",
  surfacePanel: "--surface-panel",
  surfaceSidebar: "--surface-sidebar",
  surfaceTitlebar: "--surface-titlebar",
  surfaceActivityBar: "--surface-activity-bar",
  surfaceStatusbar: "--surface-statusbar",
  border: "--border",
  borderStrong: "--border-strong",
  text: "--text",
  textMuted: "--muted",
  textSubtle: "--text-subtle",
  textInverse: "--text-inverse",
  accent: "--accent",
  accentStrong: "--accent-strong",
  accentSoft: "--accent-soft",
  danger: "--danger",
  dangerSoft: "--danger-soft",
  success: "--success",
  successSoft: "--success-soft",
  warning: "--warning",
  information: "--information",
  directory: "--directory",
  scrollbarThumb: "--scrollbar-thumb",
  scrollbarThumbHover: "--scrollbar-thumb-hover",
  selection: "--selection",
  editorForeground: "--editor-foreground",
  editorCaret: "--editor-caret",
  syntaxKeyword: "--syntax-keyword",
  syntaxString: "--syntax-string",
  syntaxNumber: "--syntax-number",
  syntaxComment: "--syntax-comment",
  syntaxFunction: "--syntax-function",
  syntaxClass: "--syntax-class",
  syntaxDecorator: "--syntax-decorator",
  syntaxBuiltin: "--syntax-builtin",
  syntaxOperator: "--syntax-operator",
} as const satisfies Readonly<Record<keyof WorkbenchThemeTokens, string>>;

export interface WorkbenchThemeDefinition {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly appearance: WorkbenchThemeAppearance;
  readonly order?: number;
  readonly tokens: WorkbenchThemeTokens;
}

/** Um provider pode adicionar temas ou substituir um tema existente pelo mesmo id. */
export interface WorkbenchThemeProvider {
  readonly id: string;
  readonly priority?: number;
  themes(): readonly WorkbenchThemeDefinition[];
}

/** Onde a fonte se aplica: no editor de código ou na interface geral da IDE. */
export type WorkbenchFontTarget = "editor" | "interface";

export interface WorkbenchFontDefinition {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly target: WorkbenchFontTarget;
  /** Pilha CSS completa (com fallbacks), aplicada como valor de `font-family`. */
  readonly family: string;
  readonly order?: number;
}

/** Um provider pode adicionar fontes ou substituir uma fonte existente pelo mesmo id. */
export interface WorkbenchFontProvider {
  readonly id: string;
  readonly priority?: number;
  fonts(): readonly WorkbenchFontDefinition[];
}

/**
 * Contrato público de tipografia. Contribuições visuais de plugins devem usar estas
 * variáveis CSS em vez de codificar pilhas de fontes próprias.
 */
export const WORKBENCH_FONT_CSS_VARIABLES = {
  interface: "--font-ui",
  editor: "--font-editor",
  editorFontSize: "--editor-font-size",
} as const;

/**
 * Glifo de um ícone semântico do workbench.
 *
 * O `svg` deve ser markup SVG completo (elemento raiz `<svg>`) com viewBox.
 * O host aplica tamanho e cor via CSS; evite hardcode de dimensões externas.
 */
export interface WorkbenchIconDefinition {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly svg: string;
  readonly order?: number;
}

/**
 * Pacote de ícones selecionável na aparência, análogo a um tema.
 * Plugins podem publicar packs adicionais ou substituir um pack pelo mesmo id.
 */
export interface WorkbenchIconPackDefinition {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly order?: number;
  readonly icons: readonly WorkbenchIconDefinition[];
}

/** Um provider pode adicionar packs ou substituir um pack existente pelo mesmo id. */
export interface WorkbenchIconProvider {
  readonly id: string;
  readonly priority?: number;
  packs(): readonly WorkbenchIconPackDefinition[];
}

export const WORKBENCH_ICON_CAPABILITY = "workbench.icon";

export interface WorkbenchSidebarMountContext extends WorkbenchPanelMountContext {
  close(): void;
}

export type WorkbenchActivityBadgeTone = "neutral" | "active" | "warning" | "error";

export interface WorkbenchActivityBadgeSnapshot {
  readonly value: string | number;
  readonly label: string;
  readonly tone?: WorkbenchActivityBadgeTone;
}

export interface WorkbenchActivityBadgeProvider {
  snapshot(): WorkbenchActivityBadgeSnapshot | undefined;
  subscribe(listener: (snapshot: WorkbenchActivityBadgeSnapshot | undefined) => void): Disposable;
}

export interface WorkbenchSidebarContribution {
  readonly id: string;
  readonly pluginId: string;
  readonly label: string;
  readonly icon?: WorkbenchActivityIcon;
  readonly activityBadge?: WorkbenchActivityBadgeProvider;
  readonly order?: number;
  mount(context: WorkbenchSidebarMountContext): void | Disposable | Promise<void | Disposable>;
}

export interface WorkbenchSidebarHook {
  readonly id: string;
  readonly pluginId: string;
  contribute(): readonly WorkbenchSidebarContribution[];
}

export const WORKBENCH_SIDEBAR_HOOK = "workbench.sidebar.hook";

export interface WorkbenchTabContribution {
  readonly id: string;
  readonly label: string;
  readonly closable?: boolean;
  readonly order?: number;
  readonly placement?: "start" | "end";
  onSelect(): void;
  onClose?(): void | Promise<void>;
  /** Renders lightweight status content beside the tab label. */
  mountStatus?(container: HTMLElement): void | Disposable;
}

/** Action rendered by the host after the last tab of a tab strip. */
export interface WorkbenchTabStripActionContribution {
  readonly id: string;
  readonly order?: number;
  mount(container: HTMLElement): void | Disposable;
}

export interface WorkbenchTabApi {
  register(tab: WorkbenchTabContribution): Disposable;
  registerAction(action: WorkbenchTabStripActionContribution): Disposable;
  select(id: string): void;
  activeId(): string | undefined;
}

export interface WorkbenchPanelContribution {
  readonly id: string;
  readonly pluginId: string;
  readonly label: string;
  readonly icon?: WorkbenchActivityIcon;
  readonly order?: number;
  mount(context: WorkbenchPanelMountContext): void | Disposable | Promise<void | Disposable>;
}

export interface WorkbenchPanelTabContribution {
  readonly id: string;
  readonly label: string;
  readonly icon?: WorkbenchActivityIcon;
  readonly order?: number;
  mount(context: WorkbenchPanelMountContext): void | Disposable | Promise<void | Disposable>;
}

export interface WorkbenchPanelTabGroupContribution {
  readonly id: string;
  readonly pluginId: string;
  readonly label: string;
  readonly icon?: WorkbenchActivityIcon;
  readonly order?: number;
  readonly tabs: readonly WorkbenchPanelTabContribution[];
}

export type WorkbenchPanelHookContribution =
  | WorkbenchPanelContribution
  | WorkbenchPanelTabGroupContribution;

export interface WorkbenchPanelHook {
  readonly id: string;
  readonly pluginId: string;
  contribute(): readonly WorkbenchPanelHookContribution[];
}

export const WORKBENCH_PANEL_HOOK = "workbench.panel.hook";

export interface WorkbenchToolWindowContribution {
  readonly id: string;
  readonly pluginId: string;
  readonly label: string;
  readonly icon?: WorkbenchActivityIcon;
  readonly activityBadge?: WorkbenchActivityBadgeProvider;
  readonly order?: number;
  mount(context: WorkbenchToolWindowMountContext): void | Disposable | Promise<void | Disposable>;
}

export interface WorkbenchToolWindowViewContribution {
  readonly id: string;
  readonly label: string;
  readonly order?: number;
  readonly placement?: "start" | "end";
  /** Renders lightweight status content beside the view label in the panel tab. */
  mountStatus?(container: HTMLElement): void | Disposable;
  mount(context: WorkbenchPanelMountContext): void | Disposable | Promise<void | Disposable>;
}

export interface WorkbenchToolWindowGroupContribution {
  readonly id: string;
  readonly pluginId: string;
  readonly label: string;
  readonly icon?: WorkbenchActivityIcon;
  readonly activityBadge?: WorkbenchActivityBadgeProvider;
  readonly order?: number;
  readonly views: readonly WorkbenchToolWindowViewContribution[];
}

export type WorkbenchToolWindowHookContribution =
  | WorkbenchToolWindowContribution
  | WorkbenchToolWindowGroupContribution;

export interface WorkbenchToolWindowMountContext extends WorkbenchPanelMountContext {
  readonly headerContainer: HTMLElement;
  readonly tabs: WorkbenchTabApi;
  close(): void;
}

export interface WorkbenchToolWindowHook {
  readonly id: string;
  readonly pluginId: string;
  contribute(): readonly WorkbenchToolWindowHookContribution[];
}

export const WORKBENCH_TOOL_WINDOW_HOOK = "workbench.toolWindow.hook";

export interface WorkbenchTitlebarContribution {
  readonly id: string;
  readonly pluginId: string;
  readonly order?: number;
  mount(context: WorkbenchPanelMountContext): void | Disposable | Promise<void | Disposable>;
}

export const WORKBENCH_TITLEBAR_CAPABILITY = "workbench.titlebar";

export interface WorkbenchStatusbarContribution {
  readonly id: string;
  readonly pluginId: string;
  readonly order?: number;
  mount(context: WorkbenchPanelMountContext): void | Disposable | Promise<void | Disposable>;
}

export const WORKBENCH_STATUSBAR_CAPABILITY = "workbench.statusbar";

export interface WorkbenchEditorToolbarItem {
  readonly id: string;
  readonly label: string;
  readonly command: string;
  readonly icon?: ResourceContextMenuIcon;
  readonly enabled?: boolean;
  readonly order?: number;
}

export interface WorkbenchEditorToolbarProvider {
  readonly id: string;
  provideItems(document: TextEditorDocumentSnapshot): readonly WorkbenchEditorToolbarItem[] | Promise<readonly WorkbenchEditorToolbarItem[]>;
}

export const WORKBENCH_EDITOR_TOOLBAR_CAPABILITY = "workbench.editorToolbar";

export type WorkbenchDialogSize = "medium" | "large" | "full";

export interface WorkbenchDialogMountContext {
  readonly container: HTMLElement;
  close(): void;
  /** Changes the host dialog size without remounting the plugin content. */
  setSize(size: WorkbenchDialogSize): void;
}

export interface WorkbenchDialogContribution {
  readonly id: string;
  readonly pluginId: string;
  readonly title: string;
  readonly description?: string;
  readonly size?: WorkbenchDialogSize;
  /** Hides the generic plugin eyebrow from the host chrome for feature dialogs. */
  readonly showPluginLabel?: boolean;
  /**
   * Called when the user requests to dismiss the dialog through the workbench
   * chrome (for example the close button or Escape). Return `false` to keep
   * the dialog open and handle the request inside the plugin instead.
   */
  readonly onCloseRequest?: () => boolean | void;
  mount(context: WorkbenchDialogMountContext): void | Disposable | Promise<void | Disposable>;
}

export interface WorkbenchConfirmRequest {
  readonly title: string;
  readonly message: string;
  /** Linha secundária com o efeito da ação. */
  readonly detail?: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  /** Destaca a confirmação como destrutiva e mantém o foco em cancelar. */
  readonly danger?: boolean;
}

export interface WorkbenchDialogApi {
  /**
   * Confirmação compacta, no mesmo formato usado pela IDE ao excluir arquivos.
   * Resolve `false` quando o usuário cancela ou fecha o diálogo.
   */
  confirm(request: WorkbenchConfirmRequest): Promise<boolean>;
  open(dialog: WorkbenchDialogContribution): Disposable;
}

export interface WorkbenchTextHighlightRequest {
  readonly fileName: string;
  readonly source: string;
}

export interface WorkbenchTextHighlightResult {
  readonly languageId?: string;
  readonly tokens: readonly SyntaxToken[];
}

export interface WorkbenchTextApi {
  highlight(request: WorkbenchTextHighlightRequest): WorkbenchTextHighlightResult;
}

export interface WorkbenchTextEditorReplaceContentRequest {
  readonly documentId: string;
  readonly content: string;
  readonly selectionStart?: number;
  readonly selectionEnd?: number;
  /** Marks the replacement as the persisted baseline instead of a dirty editor edit. */
  readonly markSaved?: boolean;
}

export interface WorkbenchTextEditorSaveRequest {
  readonly documentId: string;
}

export interface WorkbenchTextEditorBusyRequest {
  readonly documentId: string;
  readonly label: string;
}

export interface WorkbenchTextEditorApi {
  replaceContent(request: WorkbenchTextEditorReplaceContentRequest): Promise<void>;
  save(request: WorkbenchTextEditorSaveRequest): Promise<void>;
  /** Shows a document-scoped busy state until the returned disposable is released. */
  beginBusy(request: WorkbenchTextEditorBusyRequest): Disposable;
}

export interface WorkbenchWorkspaceResourceOpenRequest {
  /** Workspace-relative path of the file to open in the text editor. */
  readonly path: string;
  /** One-based line to scroll into view after the document is opened. */
  readonly line?: number;
  /** One-based column to place the selection at. */
  readonly column?: number;
  /** One-based end line for a selected navigation target. */
  readonly endLine?: number;
  /** One-based end column for a selected navigation target. */
  readonly endColumn?: number;
  /** Selects the resource in the Explorer, expanding its ancestors. */
  readonly reveal?: boolean;
}

export interface WorkbenchWorkspaceApi {
  openResource(request: WorkbenchWorkspaceResourceOpenRequest): Promise<void>;
  /** Reads a workspace-relative file without opening it in the editor. */
  readResource(path: string): Promise<Blob>;
}

export interface WorkbenchOutputFollowOptions {
  readonly label?: string;
  readonly checked?: boolean;
  readonly className?: string;
  follow(): void;
}

export interface WorkbenchOutputFollowControl extends Disposable {
  readonly element: HTMLLabelElement;
  readonly input: HTMLInputElement;
  readonly following: boolean;
  setFollowing(value: boolean): void;
  notify(): void;
}

export interface WorkbenchOutputApi {
  createFollowControl(options: WorkbenchOutputFollowOptions): WorkbenchOutputFollowControl;
}

export type WorkbenchProfileExecutionStatus = "running" | "completed" | "failed" | "stopped";

export interface WorkbenchProfileExecutionSnapshot {
  readonly profileId: string;
  readonly profileName: string;
  /** Profile used for this run, including provider-owned transient arguments. */
  readonly profile?: ExecutionProfile;
  readonly status: WorkbenchProfileExecutionStatus;
  readonly output: readonly string[];
  /** Provider-owned structured state persisted with the host process. */
  readonly data?: Readonly<Record<string, unknown>>;
  readonly processId?: string;
  readonly error?: string;
  readonly startedAt?: number;
  readonly finishedAt?: number;
}

export interface WorkbenchExecutionSnapshot {
  readonly profiles: readonly ExecutionProfile[];
  readonly selectedProfileId?: string;
  readonly environments: readonly ExecutionEnvironment[];
  /** Legacy single selection. Prefer selectedEnvironmentIds for provider-aware integrations. */
  readonly selectedEnvironmentId?: string;
  /** One independently selected execution environment per provider. */
  readonly selectedEnvironmentIds?: Readonly<Record<string, string>>;
  readonly executions: readonly WorkbenchProfileExecutionSnapshot[];
  readonly debugSessions?: readonly DebugSessionSnapshot[];
  readonly debugSession?: DebugSessionSnapshot;
}

export interface WorkbenchExecutionProfileUpdateOptions {
  readonly select?: boolean;
}

export interface WorkbenchExecutionApi {
  snapshot(): WorkbenchExecutionSnapshot;
  subscribe(listener: (snapshot: WorkbenchExecutionSnapshot) => void): Disposable;
  updateExecutionData(profileId: string, providerId: string, data: unknown): Promise<void>;
  upsertProfile(
    profile: ExecutionProfile,
    options?: WorkbenchExecutionProfileUpdateOptions,
  ): Promise<void>;
  removeProfile(profileId: string): Promise<void>;
  selectProfile(profileId?: string): Promise<void>;
  runProfile(profile: ExecutionProfile): Promise<void>;
  debugProfile(profile: ExecutionProfile): Promise<DebugSessionSnapshot>;
  stopProfile(profileId: string): Promise<void>;
}

export interface WorkbenchApi {
  readonly dialogs: WorkbenchDialogApi;
  readonly notifications: WorkbenchNotificationApi;
  readonly editor: WorkbenchTextEditorApi;
  readonly text: WorkbenchTextApi;
  readonly workspace: WorkbenchWorkspaceApi;
  readonly documents: WorkbenchDocumentsApi;
  readonly output: WorkbenchOutputApi;
  readonly execution: WorkbenchExecutionApi;
  openSidebar(id: string): void;
  openToolWindow(id: string, viewId?: string): void;
}

export interface WorkbenchNotificationApi {
  error(message: string): void;
}

/**
 * Documento que não existe no sistema de arquivos e cujo conteúdo é fornecido pelo
 * próprio plugin. O host apenas abre a aba e delega a renderização ao
 * `WorkbenchResourceEditorProvider` que aceitar o `mediaType` informado.
 */
export interface WorkbenchVirtualDocumentRequest {
  /** Identificador estável dentro do plugin; reabrir com o mesmo valor foca a aba existente. */
  readonly key: string;
  /** Título exibido na aba. */
  readonly name: string;
  /** Roteia a renderização: um provider precisa aceitar este tipo em `canOpen`. */
  readonly mediaType: string;
  /** Conteúdo textual opcional, disponível ao provider através de `read()`. */
  readonly content?: string;
  /** Rótulo de origem exibido pelo host, por exemplo o nome da conexão. */
  readonly origin?: string;
  /** Ativa a aba após abrir. Padrão: `true`. */
  readonly focus?: boolean;
}

export interface WorkbenchDocumentsApi {
  /** Abre (ou foca) o documento virtual e devolve o identificador atribuído pelo host. */
  open(request: WorkbenchVirtualDocumentRequest): Promise<string>;
  /** Atualiza nome e conteúdo de um documento já aberto. */
  update(id: string, changes: Partial<Pick<WorkbenchVirtualDocumentRequest, "name" | "content">>): Promise<void>;
  close(id: string): Promise<void>;
  isOpen(id: string): boolean;
}

export interface WorkbenchExplorerFilterRequest {
  readonly query: string;
}

export interface WorkbenchExplorerFilterResult {
  /** Workspace-relative paths that match the query; ancestors are revealed by the host. */
  readonly paths: readonly string[];
  /** Signals that the provider stopped before listing every match. */
  readonly truncated?: boolean;
}

export interface WorkbenchExplorerFilterProvider {
  readonly id: string;
  readonly pluginId: string;
  readonly placeholder?: string;
  readonly priority?: number;
  filter(
    request: WorkbenchExplorerFilterRequest,
  ): WorkbenchExplorerFilterResult | Promise<WorkbenchExplorerFilterResult>;
  /** Notifies the host that an active query should be evaluated again. */
  subscribe?(listener: () => void): Disposable;
}

export const WORKBENCH_EXPLORER_FILTER_CAPABILITY = "workbench.explorerFilter";

export interface WorkbenchExplorerIgnoreRequest {
  /** Workspace-relative paths that are currently known to the Explorer. */
  readonly paths: readonly string[];
}

export interface WorkbenchExplorerIgnoreResult {
  /** Subset of request.paths that should be treated as generated/ignored resources. */
  readonly paths: readonly string[];
}

/**
 * Lets plugins contribute project-aware ignore semantics without coupling the Explorer
 * to a specific VCS or language. For example, a Git plugin can expose .gitignore rules.
 */
export interface WorkbenchExplorerIgnoreProvider {
  readonly id: string;
  readonly pluginId: string;
  readonly priority?: number;
  ignored(
    request: WorkbenchExplorerIgnoreRequest,
  ): WorkbenchExplorerIgnoreResult | Promise<WorkbenchExplorerIgnoreResult>;
  /** Notifies the host that ignore rules or repository state changed. */
  subscribe?(listener: () => void): Disposable;
}

export const WORKBENCH_EXPLORER_IGNORE_CAPABILITY = "workbench.explorerIgnore";

export type WorkbenchResourceKind = "text" | "image" | "binary";

export interface WorkbenchResourceDescriptor {
  readonly id: string;
  readonly name: string;
  readonly path?: string;
  readonly workspaceRoot?: string;
  readonly mediaType: string;
  readonly size: number;
  readonly kind: WorkbenchResourceKind;
}

export interface WorkbenchResourceEditorMountContext {
  readonly container: HTMLElement;
  readonly resource: WorkbenchResourceDescriptor;
  read(): Promise<Blob>;
  /** Sinaliza que a montagem foi substituída ou removida antes de concluir. */
  readonly signal?: AbortSignal;
  /** Linha (1-based, fracionária) visível no topo do editor de texto ao abrir a visualização. */
  readonly topLine?: number | undefined;
  /** Reposiciona o editor de texto para exibir a linha informada no topo. */
  revealLine?(line: number): void;
}

export interface WorkbenchResourceEditorProvider {
  readonly id: string;
  readonly pluginId: string;
  readonly priority?: number;
  canOpen(resource: WorkbenchResourceDescriptor, settings?: PluginSettingValues): boolean;
  onDidChange?(listener: () => void): Disposable;
  mount(
    context: WorkbenchResourceEditorMountContext,
  ): void | Disposable | Promise<void | Disposable>;
}

export const WORKBENCH_RESOURCE_EDITOR_CAPABILITY = "workbench.resourceEditor";

export type WorkbenchHtmlPreviewSandboxPermission =
  | "allow-downloads"
  | "allow-forms"
  | "allow-modals"
  | "allow-popups";

export interface WorkbenchHtmlPreviewRequest {
  readonly resource: WorkbenchResourceDescriptor;
  readonly html: string;
  readonly sandbox: readonly WorkbenchHtmlPreviewSandboxPermission[];
}

export interface WorkbenchHtmlPreviewResult {
  readonly html?: string;
  readonly sandbox?: readonly WorkbenchHtmlPreviewSandboxPermission[];
  /**
   * Permite executar scripts da prévia. Perigoso: só produz efeito quando
   * `unsafeSkipSanitize` também é explicitamente verdadeiro.
   */
  readonly unsafeAllowScripts?: true;
  /**
   * Ignora a sanitização final do core. Perigoso: só produz efeito quando
   * `unsafeAllowScripts` também é explicitamente verdadeiro.
   */
  readonly unsafeSkipSanitize?: true;
}

/**
 * Customiza a prévia HTML nativa. Providers são compostos por prioridade;
 * os de maior prioridade são aplicados por último.
 */
export interface WorkbenchHtmlPreviewProvider {
  readonly id: string;
  readonly pluginId: string;
  readonly priority?: number;
  canHandle?(resource: WorkbenchResourceDescriptor): boolean;
  previewByDefault?(resource: WorkbenchResourceDescriptor): boolean | undefined;
  providePreview?(
    request: WorkbenchHtmlPreviewRequest,
  ): WorkbenchHtmlPreviewResult | undefined | Promise<WorkbenchHtmlPreviewResult | undefined>;
}

export const WORKBENCH_HTML_PREVIEW_CAPABILITY = "workbench.htmlPreview";

export type WorkbenchExecutionViewMode = "run" | "debug";

/** Aba de execução aberta no painel inferior compartilhado pelos perfis. */
export interface WorkbenchExecutionViewTarget {
  readonly profileId: string;
  readonly profileName: string;
  readonly mode: WorkbenchExecutionViewMode;
  /** Perfil ainda presente na configuração; ausente para execuções órfãs. */
  readonly profile?: ExecutionProfile;
}

export interface WorkbenchExecutionViewMountContext extends WorkbenchPanelMountContext {
  readonly target: WorkbenchExecutionViewTarget;
}

export type WorkbenchExecutionViewToolbarActionIcon = "rerun" | "run" | "stop" | "refresh";

export interface WorkbenchExecutionViewToolbarAction {
  readonly id: string;
  readonly label: string;
  readonly icon?: WorkbenchExecutionViewToolbarActionIcon;
  readonly danger?: boolean;
  readonly disabled?: boolean;
  run(target: WorkbenchExecutionViewTarget): void | Promise<void>;
}

/**
 * Substitui a saída textual da aba de execução por uma visão própria do plugin.
 * O host mantém a barra de ações da aba e o estado da execução continua
 * disponível por `workbench.execution`.
 */
export interface WorkbenchExecutionViewProvider {
  readonly id: string;
  readonly pluginId: string;
  readonly priority?: number;
  canRender(target: WorkbenchExecutionViewTarget): boolean;
  toolbarActions?(
    target: WorkbenchExecutionViewTarget,
  ): readonly WorkbenchExecutionViewToolbarAction[];
  mount(
    context: WorkbenchExecutionViewMountContext,
  ): void | Disposable | Promise<void | Disposable>;
}

export const WORKBENCH_EXECUTION_VIEW_CAPABILITY = "workbench.executionView";

export type TextEditorLineDecorationKind =
  | "added"
  | "modified"
  | "deleted"
  | "information"
  | "warning"
  | "error";

export interface TextEditorDocumentSnapshot {
  readonly id: string;
  readonly name: string;
  readonly path?: string;
  readonly workspaceRoot?: string;
  readonly mediaType?: string;
  readonly content: string;
  readonly isDirty?: boolean;
}

export type TextEditorDocumentChangeReason = "edit" | "undo" | "redo";

export interface TextEditorDocumentChangedEvent {
  readonly document: TextEditorDocumentSnapshot;
  readonly previousContent: string;
  readonly reason: TextEditorDocumentChangeReason;
  readonly isDirty: boolean;
}

export interface TextEditorDocumentSavedEvent {
  readonly document: TextEditorDocumentSnapshot;
}

export const TEXT_EDITOR_DOCUMENT_CHANGED_EVENT = "textEditor.document.changed";
export const TEXT_EDITOR_DOCUMENT_SAVED_EVENT = "textEditor.document.saved";

export interface WorkspaceResourcesChangedEvent {
  readonly source: string;
  readonly reason: "source-control" | "external" | "workspace";
  readonly operation?: string;
  readonly workspaceRoot?: string;
  readonly paths?: readonly string[];
  readonly renames?: readonly {
    readonly from: string;
    readonly to: string;
  }[];
}

export const WORKSPACE_RESOURCES_CHANGED_EVENT = "workspace.resources.changed";

export interface TextEditorLineDecoration {
  /** One-based line number in the current document. */
  readonly line: number;
  readonly kind: TextEditorLineDecorationKind;
  readonly label?: string;
  readonly tooltip?: string;
  readonly change?: TextEditorLineChangePreview;
  readonly actions?: readonly TextEditorLineDecorationAction[];
  /** Number of removed lines represented by a deletion marker at this line. */
  readonly deletedLineCount?: number;
}

export interface TextEditorLineDecorationAction {
  readonly id: string;
  readonly label: string;
  readonly command: string;
  readonly title?: string;
  readonly closeOnRun?: boolean;
}

export interface TextEditorLineDecorationActionContext {
  readonly document: TextEditorDocumentSnapshot;
  readonly decoration: TextEditorLineDecoration;
  readonly action: TextEditorLineDecorationAction;
}

export interface TextEditorLineSnapshot {
  readonly line: number;
  readonly content: string;
}

export interface TextEditorLineChangePreview {
  readonly before: readonly TextEditorLineSnapshot[];
  readonly after: readonly TextEditorLineSnapshot[];
}

export interface TextEditorLineDecorationProvider {
  readonly id: string;
  readonly pluginId: string;
  provideDecorations(
    document: TextEditorDocumentSnapshot,
  ): Promise<readonly TextEditorLineDecoration[]> | readonly TextEditorLineDecoration[];
  onDidChange?(listener: () => void): Disposable;
}

export const TEXT_EDITOR_LINE_DECORATION_CAPABILITY = "textEditor.lineDecoration";

export interface WorkbenchExtensionApi {
  registerPanelHook(hook: WorkbenchPanelHook): Disposable;
}

export interface TerminalSessionInfo {
  readonly id: string;
  readonly title?: string;
  readonly createdAt?: string;
  readonly status: "running" | "exited";
  readonly workspaceRoot: string;
  readonly shell: string;
  readonly platform: string;
  readonly configurationKey?: string;
  readonly hasUserInput?: boolean;
}

export interface TerminalSessionOutput {
  readonly id: string;
  readonly data: string;
  readonly offset: number;
  readonly status: "running" | "exited";
  readonly exitCode?: number;
}

export interface TerminalSessionCreateOptions {
  readonly title?: string;
  readonly cols?: number;
  readonly rows?: number;
  readonly configurationKey?: string;
  readonly environmentVariables?: Readonly<Record<string, string>>;
  readonly unsetEnvironmentVariables?: readonly string[];
  readonly prependPathEntries?: readonly string[];
  readonly shellStartupCommands?: TerminalShellStartupCommands;
}

export type TerminalShellFamily = "posix" | "fish" | "powershell" | "cmd";

/**
 * Commands that must run inside the interactive shell after its own startup
 * files have been evaluated. This is intentionally shell-generic: plugins
 * contribute commands per shell family and the terminal selects the matching
 * family without knowing what feature supplied them.
 */
export type TerminalShellStartupCommands = Readonly<
  Partial<Record<TerminalShellFamily, readonly string[]>>
>;

export interface TerminalSessionHookContext {
  readonly workspaceRoot?: string;
  readonly selectedEnvironmentId?: string;
  readonly settings: PluginSettingValues;
}

export interface TerminalSessionIndicator {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
}

export interface TerminalSessionHookContribution {
  readonly environmentVariables?: Readonly<Record<string, string>>;
  readonly unsetEnvironmentVariables?: readonly string[];
  readonly prependPathEntries?: readonly string[];
  readonly shellStartupCommands?: TerminalShellStartupCommands;
  readonly indicators?: readonly TerminalSessionIndicator[];
}

export interface TerminalSessionHookProvider {
  readonly id: string;
  readonly pluginId: string;
  /** Optional execution-environment provider whose project selection this hook consumes. */
  readonly environmentProviderId?: string;
  prepare(
    context: TerminalSessionHookContext,
  ): Promise<TerminalSessionHookContribution | undefined> | TerminalSessionHookContribution | undefined;
}

export interface TerminalProvider {
  readonly id: string;
  readonly label: string;
  list?(): Promise<readonly TerminalSessionInfo[]>;
  create(options?: TerminalSessionCreateOptions): Promise<TerminalSessionInfo>;
  read(sessionId: string, offset?: number): Promise<TerminalSessionOutput>;
  write(sessionId: string, data: string): Promise<void>;
  resize(sessionId: string, cols: number, rows: number): Promise<void>;
  close(sessionId: string): Promise<void>;
}

export const TERMINAL_PROVIDER_CAPABILITY = "terminal.provider";
export const TERMINAL_SESSION_HOOK_CAPABILITY = "terminal.session.hook";

/** Generic interactive byte-stream session rendered by a workbench host. */
export type InteractiveSessionInfo = TerminalSessionInfo;
export type InteractiveSessionOutput = TerminalSessionOutput;
export type InteractiveSessionCreateOptions = TerminalSessionCreateOptions;
export type InteractiveSessionIndicator = TerminalSessionIndicator;
export type InteractiveSessionHookContext = TerminalSessionHookContext;
export type InteractiveSessionHookContribution = TerminalSessionHookContribution;
export type InteractiveSessionHookProvider = TerminalSessionHookProvider;
export type InteractiveSessionProvider = TerminalProvider;

export const INTERACTIVE_SESSION_PROVIDER_CAPABILITY = "interactive.session";
export const INTERACTIVE_SESSION_HOOK_CAPABILITY = "interactive.session.hook";

export interface InteractiveSessionExtensionApi {
  registerProvider(provider: InteractiveSessionProvider): Disposable;
  hooks(): readonly InteractiveSessionHookProvider[];
}

export type ExecutionEnvironmentType = string;

export type ExecutionEnvironmentStatus = "ready" | "creating" | "error";

export interface ExecutionEnvironment {
  readonly id: string;
  /** Provider que descobriu/criou este ambiente. Preenchido pelo workbench. */
  readonly providerId?: string;
  readonly name: string;
  readonly type: ExecutionEnvironmentType;
  readonly status: ExecutionEnvironmentStatus;
  readonly managed?: boolean;
  readonly executable?: string;
  readonly path?: string;
  readonly version?: string;
  readonly packages?: readonly string[];
  readonly error?: string;
}

export interface ExecutionEnvironmentCreateRequest {
  readonly name: string;
  readonly baseExecutable: string;
  readonly path?: string;
}

export interface ExecutionEnvironmentAddExecutableRequest {
  readonly name: string;
  readonly executable: string;
}

export interface ExecutionEnvironmentImportRequest {
  readonly name?: string;
  readonly path: string;
}

export interface ExecutionEnvironmentUpdateRequest {
  readonly name: string;
  readonly path?: string;
  readonly executable?: string;
}

export interface ExecutionEnvironmentPackage {
  readonly name: string;
  readonly version: string;
  readonly latestVersion?: string;
}

export interface ExecutionEnvironmentPackageInventory {
  readonly packages: readonly ExecutionEnvironmentPackage[];
  readonly health: "healthy" | "issues" | "unknown";
  readonly issues?: readonly string[];
}

export interface ExecutionEnvironmentPackageOperationResult {
  readonly inventory: ExecutionEnvironmentPackageInventory;
  readonly output?: string;
}

export interface ExecutionEnvironmentDirectoryEntry {
  readonly name: string;
  readonly path: string;
  readonly kind: "directory" | "file";
  readonly hidden: boolean;
  readonly isEnvironment: boolean;
  readonly executable: boolean;
}

export interface ExecutionEnvironmentDirectoryListing {
  readonly path: string;
  readonly parentPath?: string;
  readonly mode: "directory" | "file";
  readonly includeHidden: boolean;
  readonly filter: string;
  readonly isEnvironment: boolean;
  readonly entries: readonly ExecutionEnvironmentDirectoryEntry[];
}

export interface ExecutionEnvironmentBrowseRequest {
  readonly path?: string;
  readonly mode?: "directory" | "file";
  readonly includeHidden?: boolean;
  readonly filter?: string;
}

export interface ExecutionEnvironmentRunRequest {
  readonly mode?: "source" | "script" | "module";
  readonly source?: string;
  readonly fileName?: string;
  readonly scriptPath?: string;
  readonly moduleName?: string;
  readonly args?: readonly string[];
  readonly workingDirectory?: string;
  readonly environmentVariables?: Readonly<Record<string, string>>;
}

export interface ExecutionEnvironmentProvider {
  readonly id: string;
  readonly name: string;
  readonly icon?: WorkbenchActivityIcon;
  readonly extensions: readonly string[];
  list(): Promise<readonly ExecutionEnvironment[]>;
  create(request: ExecutionEnvironmentCreateRequest): Promise<ExecutionEnvironment>;
  addExecutable(request: ExecutionEnvironmentAddExecutableRequest): Promise<ExecutionEnvironment>;
  importEnvironment(request: ExecutionEnvironmentImportRequest): Promise<ExecutionEnvironment>;
  update?(environmentId: string, request: ExecutionEnvironmentUpdateRequest): Promise<ExecutionEnvironment>;
  browse?(request?: ExecutionEnvironmentBrowseRequest): Promise<ExecutionEnvironmentDirectoryListing>;
  validateExecutable?(path: string): Promise<{ readonly executable: string; readonly version?: string }>;
  remove(environmentId: string): Promise<void>;
  installDependencies(environmentId: string, dependencies: readonly string[]): Promise<ExecutionEnvironment>;
  listPackages?(environmentId: string): Promise<ExecutionEnvironmentPackageInventory>;
  installPackages?(
    environmentId: string,
    packages: readonly string[],
  ): Promise<ExecutionEnvironmentPackageOperationResult>;
  upgradePackages?(
    environmentId: string,
    packages?: readonly string[],
  ): Promise<ExecutionEnvironmentPackageOperationResult>;
  uninstallPackages?(
    environmentId: string,
    packages: readonly string[],
  ): Promise<ExecutionEnvironmentPackageOperationResult>;
  run(
    environmentId: string,
    request: ExecutionEnvironmentRunRequest,
  ): Promise<ScriptExecutionResult>;
}

export const EXECUTION_ENVIRONMENT_CAPABILITY = "execution.environment";

export interface PluginHost {
  activate(plugin: PluginRecord, context: PluginContext): Promise<void>;
  deactivate(plugin: PluginRecord): Promise<void>;
}
