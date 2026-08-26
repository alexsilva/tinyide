import { resolveExecutionProfile } from "@tinyide/core";
import type {
  DebugAdapterCommand,
  DebugAdapterProvider,
  DebugBreakpoint,
  DebugSessionSnapshot,
  ExecutionEnvironment,
  ExecutionEnvironmentProvider,
  ExecutionProfile,
  ExecutionProfileContributionProvider,
  ExecutionProfileExecutableOption,
  ExecutionProfilePresetContribution,
  ExecutionProfileTargetKindOption,
  ExecutionProfileVariableContribution,
  LanguageProvider,
  LanguageLintSettings,
  ProcessExecutionRequest,
  PluginSettingsMap,
  PluginSettingsProvider,
  ResourceContext,
  ResourceDecorationProvider,
  ResourceIcon,
  ResourceIconProvider,
  ScriptExecutionContribution,
  TextEditorLineDecorationProvider,
  TextDiagnostic,
  WorkbenchExecutionViewProvider,
  WorkbenchExecutionViewTarget,
  WorkbenchResourceDescriptor,
  WorkbenchResourceEditorProvider,
} from "@tinyide/plugin-api";
import type { OpenDocument } from "../browser-filesystem";
import { appendExecutionOutput } from "./execution/execution-output-buffer";
import { pluginLanguageProviderFor } from "./generic-syntax";
import { platform } from "./platform";
import { setActiveHostWorkspaceRoot } from "./host-workspace-state";
import { writeHostWorkspacePointer } from "./host-pointer";
import {
  clearActiveWorkspaceScope,
  hasActiveWorkspaceScope,
  projectRuntimeFetch,
  runtimeFetch,
  setActiveWorkspaceScope,
} from "./project-session";
import {
  createTransientRetry,
  delay,
  HostRequestError,
  RECONNECTED_NOTICE,
  RECONNECTING_NOTICE,
  TransientRuntimeError,
} from "./transient-failure";

export interface HostProcessSnapshot {
  readonly id: string;
  readonly workspaceRoot: string;
  readonly status: "running" | "exited";
  readonly executable: string;
  readonly arguments: readonly string[];
  readonly workingDirectory: string;
  readonly presentation?: HostProcessPresentation;
  readonly stdout: string;
  readonly stderr: string;
  readonly output?: string;
  readonly outputStartCursor?: number;
  readonly outputEndCursor?: number;
  readonly outputTruncated?: boolean;
  readonly data?: Readonly<Record<string, unknown>>;
  readonly stopRequested: boolean;
  readonly exitCode?: number;
  readonly signal?: string;
  readonly startedAt: number;
  readonly finishedAt?: number;
  readonly durationMs: number;
}

export interface HostProcessOutputChunk {
  readonly stream: "stdout" | "stderr";
  readonly text: string;
}

export interface HostProcessOutputDelta {
  readonly id: string;
  readonly status: "running" | "exited";
  readonly stopRequested: boolean;
  readonly exitCode?: number;
  readonly signal?: string;
  readonly startedAt: number;
  readonly finishedAt?: number;
  readonly durationMs: number;
  readonly startCursor: number;
  readonly endCursor: number;
  readonly cursor: number;
  readonly truncated: boolean;
  readonly hasMore: boolean;
  readonly chunks: readonly HostProcessOutputChunk[];
}

export interface HostProcessPresentation {
  readonly kind: "profile" | "script";
  readonly sourceId: string;
  readonly sourceName: string;
  readonly runId?: string;
  readonly stepId?: string;
  readonly stepName?: string;
  readonly outputPrefix: readonly string[];
}

interface HostProcessStartRequest extends ProcessExecutionRequest {
  readonly presentation?: HostProcessPresentation;
}

export interface ProfileContributions {
  readonly executableOptions: readonly ExecutionProfileExecutableOption[];
  readonly variables: readonly ExecutionProfileVariableContribution[];
  readonly presets: readonly ExecutionProfilePresetContribution[];
  readonly targetKinds: readonly ExecutionProfileTargetKindOption[];
}

export interface RunProfileCallbacks {
  readonly onProcessStarted: (processId: string) => void;
  readonly onProcessFinished: () => void;
  readonly onOutput: (lines: readonly string[]) => void;
  readonly shouldStop?: () => boolean;
}

export function languageProviderFor(document: OpenDocument | undefined): LanguageProvider | undefined {
  if (!document || document.kind !== "text") return undefined;
  return pluginLanguageProviderFor(
    { fileName: document.name },
    platform.capabilities.getAll<LanguageProvider>("language.provider"),
  );
}

export function scriptExecutionFor(document: OpenDocument | undefined): ScriptExecutionContribution | undefined {
  if (!document) return undefined;
  const lowerName = document.name.toLocaleLowerCase();
  return platform.capabilities
    .getAll<ScriptExecutionContribution>("execution.script")
    .find((provider) => provider.extensions.some((extension) => lowerName.endsWith(extension)));
}

export function resourceIconFor(resource: ResourceContext): ResourceIcon | undefined {
  return platform.capabilities
    .getAll<ResourceIconProvider>("resource.icon")
    .map((provider) => provider.provideIcon(resource))
    .find((icon): icon is ResourceIcon => Boolean(icon));
}

export function resourceDecorationProviders(): readonly ResourceDecorationProvider[] {
  return platform.capabilities.getAll<ResourceDecorationProvider>("resource.decoration");
}

export function environmentProvider(): ExecutionEnvironmentProvider | undefined {
  return platform.capabilities.getAll<ExecutionEnvironmentProvider>("execution.environment")[0];
}

export function environmentProviders(): readonly ExecutionEnvironmentProvider[] {
  return platform.capabilities.getAll<ExecutionEnvironmentProvider>("execution.environment");
}

export function environmentProviderById(
  providerId: string | undefined,
): ExecutionEnvironmentProvider | undefined {
  if (!providerId) return undefined;
  return environmentProviders().find((provider) => provider.id === providerId);
}

export function pluginSettingsProviders(): readonly PluginSettingsProvider[] {
  return platform.capabilities.getAll<PluginSettingsProvider>("plugin.settings");
}

export function textEditorLineDecorationProviders(): readonly TextEditorLineDecorationProvider[] {
  return platform.capabilities.getAll<TextEditorLineDecorationProvider>("textEditor.lineDecoration");
}

export function debugAdapterProviders(): readonly DebugAdapterProvider[] {
  return platform.capabilities.getAll<DebugAdapterProvider>("execution.debugAdapter");
}

export function debugAdapterForProfile(input: {
  readonly profile: ExecutionProfile;
  readonly activeDocument?: OpenDocument;
  readonly environments: readonly ExecutionEnvironment[];
}): DebugAdapterProvider | undefined {
  const environmentId = input.profile.environment.mode === "fixed"
    ? input.profile.environment.environmentId
    : undefined;
  const environment = environmentId
    ? input.environments.find((candidate) => candidate.id === environmentId)
    : undefined;
  return debugAdapterProviders().find((candidate) => (
    (!environment?.providerId || candidate.environmentProviderId === environment.providerId)
    && candidate.supports({
      profile: input.profile,
      ...(environment ? { environment } : {}),
      ...(environment?.providerId ? { environmentProviderId: environment.providerId } : {}),
      ...(input.activeDocument?.name ? { activeFileName: input.activeDocument.name } : {}),
    })
  ));
}

export function workbenchResourceDescriptor(document: OpenDocument): WorkbenchResourceDescriptor {
  return {
    id: document.id,
    name: document.name,
    ...(document.path ? { path: document.path } : {}),
    ...(document.workspaceRoot ? { workspaceRoot: document.workspaceRoot } : {}),
    mediaType: document.mediaType,
    size: document.size,
    kind: document.kind,
  };
}

export function resourceEditorProviderFor(
  document: OpenDocument | undefined,
  pluginSettings: PluginSettingsMap = {},
  options: { readonly settingsResolved?: boolean } = {},
): WorkbenchResourceEditorProvider | undefined {
  if (options.settingsResolved === false) return undefined;
  if (!document) return undefined;
  const resource = workbenchResourceDescriptor(document);
  return platform.capabilities
    .getAll<WorkbenchResourceEditorProvider>("workbench.resourceEditor")
    .slice()
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0) || left.id.localeCompare(right.id))
    .find((provider) => {
      try {
        return provider.canOpen(resource, pluginSettings[provider.pluginId] ?? {});
      } catch {
        return false;
      }
    });
}

export function executionViewProviderFor(
  target: WorkbenchExecutionViewTarget,
): WorkbenchExecutionViewProvider | undefined {
  return platform.capabilities
    .getAll<WorkbenchExecutionViewProvider>("workbench.executionView")
    .slice()
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0) || left.id.localeCompare(right.id))
    .find((provider) => {
      try {
        return provider.canRender(target);
      } catch {
        return false;
      }
    });
}

export function environmentProviderFor(document: OpenDocument | undefined): ExecutionEnvironmentProvider | undefined {
  if (!document) return undefined;
  const lowerName = document.name.toLocaleLowerCase();
  return platform.capabilities
    .getAll<ExecutionEnvironmentProvider>("execution.environment")
    .find((provider) => provider.extensions.some((extension) => lowerName.endsWith(extension)));
}

export async function loadEnvironments(): Promise<readonly ExecutionEnvironment[]> {
  const providers = platform.capabilities.getAll<ExecutionEnvironmentProvider>("execution.environment");
  const listed = await Promise.all(providers.map(async (provider) => (
    (await provider.list()).map((environment) => ({ ...environment, providerId: provider.id }))
  )));
  return listed.flat();
}

export async function loadProfileContributions(input: {
  readonly workspaceName?: string;
  readonly workspaceRoot?: string;
  readonly activeDocument?: OpenDocument;
}): Promise<ProfileContributions> {
  const providers = platform.capabilities.getAll<ExecutionProfileContributionProvider>(
    "execution.profile.contribution",
  );
  const context = {
    ...(input.workspaceName && input.workspaceName !== "Sem workspace"
      ? { workspaceName: input.workspaceName }
      : {}),
    ...(input.workspaceRoot ? { workspaceRoot: input.workspaceRoot } : {}),
    ...(input.activeDocument?.name ? { activeFileName: input.activeDocument.name } : {}),
    ...(input.activeDocument?.path ? { activeFilePath: input.activeDocument.path } : {}),
  };
  const executableOptions = await Promise.all(
    providers.map((provider) => provider.executableOptions?.(context) ?? []),
  );
  const variables = await Promise.all(
    providers.map((provider) => provider.variables?.(context) ?? []),
  );
  const presets = await Promise.all(
    providers.map((provider) => provider.presets?.(context) ?? []),
  );
  const targetKinds = await Promise.all(
    providers.map(async (provider) => (
      (await provider.targetKinds?.(context) ?? []).map((targetKind) => ({
        ...targetKind,
        providerId: provider.id,
        providerName: provider.name,
        ...(provider.environmentProviderId
          ? { environmentProviderId: provider.environmentProviderId }
          : {}),
      }))
    )),
  );
  return {
    executableOptions: executableOptions.flat(),
    variables: variables.flat(),
    presets: presets.flat(),
    targetKinds: targetKinds.flat(),
  };
}

export async function lintDocument(
  document: OpenDocument,
  settings?: LanguageLintSettings,
): Promise<readonly TextDiagnostic[]> {
  const provider = languageProviderFor(document);
  if (!provider) throw new Error("Nenhum provider de linguagem disponível para este arquivo.");
  return provider.lint(document.content, document.name, settings);
}

/**
 * Lê o corpo JSON de uma resposta do host classificando a falha na origem.
 *
 * O status é checado **antes** do `json()`: um proxy devolvendo 502 com corpo
 * HTML fazia `json()` estourar `SyntaxError` e os monitores tratavam isso como
 * erro definitivo, matando a execução justamente no caso de servidor reiniciando.
 */
async function readHostJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    const payload = await response.json().catch(() => undefined) as { readonly error?: string } | undefined;
    throw new HostRequestError(payload?.error ?? fallbackMessage, response.status);
  }
  try {
    return await response.json() as T;
  } catch (cause) {
    // Resposta 2xx com corpo ilegível também é sintoma de transporte/proxy.
    throw new TransientRuntimeError(fallbackMessage, { cause });
  }
}

export async function readHostContext(): Promise<{ readonly workspaceRoot: string }> {
  const response = await projectRuntimeFetch("/core-api/context", { cache: "no-store" });
  const context = await readHostJson<{ readonly workspaceRoot: string }>(
    response,
    "Não foi possível obter o contexto de execução do host.",
  );
  setActiveHostWorkspaceRoot(context.workspaceRoot);
  return context;
}

/**
 * Abrir um projeto é o ato que define o escopo desta janela. A requisição sai
 * sem prefixo — ainda não existe escopo — e a resposta traz o `scopeId` que
 * passa a ancorar todas as chamadas seguintes e a própria URL da janela.
 */
export async function setHostWorkspace(
  workspaceName: string,
  workspaceRootHint?: string,
): Promise<{ readonly workspaceRoot: string; readonly scopeId: string }> {
  // Durante a troca, nenhum plugin deve continuar consultando o backend do
  // workspace anterior enquanto o runtime desmonta seus handlers.
  setActiveHostWorkspaceRoot(undefined);
  const response = await runtimeFetch("/core-api/workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: workspaceName,
      ...(workspaceRootHint ? { path: workspaceRootHint } : {}),
    }),
  });
  const payload = await readHostJson<{
    readonly workspaceRoot?: string;
    readonly scopeId?: string;
    readonly error?: string;
  }>(response, "Não foi possível definir a raiz do workspace no host.");
  if (!payload.workspaceRoot || !payload.scopeId) {
    throw new Error(payload.error ?? "Não foi possível definir a raiz do workspace no host.");
  }
  setActiveWorkspaceScope(payload.scopeId);
  setActiveHostWorkspaceRoot(payload.workspaceRoot);
  // Ponteiro deste host, gravado num só lugar: abrir um projeto é o único
  // evento que muda qual projeto uma janela nova deste host deve reabrir. Não
  // bloqueia a abertura — é um atalho de conveniência, e esta janela já sabe
  // qual é o seu projeto pelo escopo na URL.
  void writeHostWorkspacePointer({ path: payload.workspaceRoot, name: workspaceName });
  return { workspaceRoot: payload.workspaceRoot, scopeId: payload.scopeId };
}

export async function clearHostWorkspace(): Promise<void> {
  setActiveHostWorkspaceRoot(undefined);
  if (!hasActiveWorkspaceScope()) return;
  const response = await projectRuntimeFetch("/core-api/workspace", { method: "DELETE" });
  clearActiveWorkspaceScope();
  if (!response.ok && response.status !== 204) {
    const payload = await response.json().catch(() => undefined) as { readonly error?: string } | undefined;
    throw new Error(payload?.error ?? "Não foi possível limpar o workspace ativo no host.");
  }
}

export interface WorkspaceScopeDescriptor {
  readonly scopeId: string;
  readonly path: string;
  readonly name: string;
}

/** Resolve o escopo vindo da URL de volta para o projeto que ele representa. */
export async function readWorkspaceScopeDescriptor(
  scopeId: string,
): Promise<WorkspaceScopeDescriptor | undefined> {
  const response = await runtimeFetch(`/core-api/workspace/scopes/${encodeURIComponent(scopeId)}`, {
    cache: "no-store",
  });
  if (response.status === 404) return undefined;
  return await readHostJson<WorkspaceScopeDescriptor>(
    response,
    "Não foi possível resolver o workspace desta janela.",
  );
}

export async function startHostProcess(request: HostProcessStartRequest): Promise<HostProcessSnapshot> {
  const response = await projectRuntimeFetch("/core-api/execution/processes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return readHostJson<HostProcessSnapshot>(response, "Falha ao iniciar processo.");
}

export async function listHostProcesses(): Promise<readonly HostProcessSnapshot[]> {
  const response = await projectRuntimeFetch("/core-api/execution/processes", { cache: "no-store" });
  return readHostJson<readonly HostProcessSnapshot[]>(response, "Falha ao listar processos.");
}

export async function readHostProcess(id: string): Promise<HostProcessSnapshot> {
  const response = await projectRuntimeFetch(`/core-api/execution/processes/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
  return readHostJson<HostProcessSnapshot>(response, "Falha ao consultar processo.");
}

export async function updateHostProcessData(
  id: string,
  providerId: string,
  data: unknown,
): Promise<HostProcessSnapshot> {
  const response = await projectRuntimeFetch(`/core-api/execution/processes/${encodeURIComponent(id)}/data`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ providerId, data }),
  });
  return readHostJson<HostProcessSnapshot>(response, "Falha ao persistir dados da execução.");
}

export async function readHostProcessOutput(id: string, cursor: number): Promise<HostProcessOutputDelta> {
  const response = await projectRuntimeFetch(
    `/core-api/execution/processes/${encodeURIComponent(id)}/output?cursor=${Math.max(0, Math.trunc(cursor))}`,
    { cache: "no-store" },
  );
  return readHostJson<HostProcessOutputDelta>(response, "Falha ao ler a saída do processo.");
}

export async function stopHostProcess(id: string): Promise<void> {
  const response = await projectRuntimeFetch(`/core-api/execution/processes/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok && response.status !== 404) {
    throw new Error("Falha ao interromper processo.");
  }
}

export function hostProcessOutputLines(process: HostProcessSnapshot): readonly string[] {
  const fallbackPrefix = [
    `[processo] ${process.executable}`,
    `[diretório] ${process.workingDirectory}`,
    `$ ${process.executable} ${process.arguments.join(" ")}`,
  ];
  return [
    ...(process.presentation?.outputPrefix ?? fallbackPrefix),
    process.output ?? process.stdout,
    ...(process.output === undefined ? [process.stderr] : []),
    ...(process.stopRequested
      ? ["[interrompido pelo usuário]"]
      : process.status === "running"
        ? []
        : [`[exit] ${process.exitCode ?? -1}`]),
  ].filter(Boolean);
}

async function followHostProcess(
  initial: HostProcessSnapshot,
  callbacks: RunProfileCallbacks,
  onDelta: (delta: HostProcessOutputDelta) => void,
  /** Anexa linhas de aviso à saída acumulada (reconexão), sem substituí-la. */
  publishNotice: (lines: readonly string[]) => void,
): Promise<HostProcessSnapshot> {
  let process = initial;
  let cursor = initial.outputStartCursor ?? 0;
  let hasMore = false;
  const retry = createTransientRetry();

  do {
    await delay(hasMore ? 0 : 200);
    let delta: HostProcessOutputDelta;
    try {
      delta = await readHostProcessOutput(process.id, cursor);
      if (retry.reset()) publishNotice([RECONNECTED_NOTICE]);
    } catch (cause) {
      const decision = retry.schedule(cause);
      if (decision.attempt === 1) publishNotice([RECONNECTING_NOTICE]);
      await delay(decision.delayMs);
      continue;
    }
    cursor = delta.cursor;
    hasMore = delta.hasMore;
    onDelta(delta);
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
    if (callbacks.shouldStop?.() && process.status === "running") {
      await stopHostProcess(process.id);
    }
  } while (process.status === "running" || hasMore);

  return process;
}

function activeFileDirectory(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const normalized = path.replaceAll("\\", "/");
  const separator = normalized.lastIndexOf("/");
  return separator >= 0 ? normalized.slice(0, separator) || "/" : undefined;
}

export async function runExecutionProfile(input: {
  readonly profile: ExecutionProfile;
  readonly activeDocument?: OpenDocument;
  readonly workspaceName: string;
  readonly environments: readonly ExecutionEnvironment[];
  readonly callbacks: RunProfileCallbacks;
}): Promise<"completed" | "stopped"> {
  const { profile, activeDocument, environments, callbacks } = input;
  const environmentId = profile.environment.mode === "fixed"
    ? profile.environment.environmentId
    : undefined;
  const environment = environmentId
    ? environments.find((candidate) => candidate.id === environmentId)
    : undefined;
  if (profile.environment.mode === "fixed" && !environment?.executable) {
    throw new Error("O perfil exige um ambiente com executável disponível.");
  }

  const { workspaceRoot } = await readHostContext();
  const runId = crypto.randomUUID();

  const activePath = activeDocument?.path
    ? `${workspaceRoot}/${activeDocument.path.replace(/^\/+/, "")}`
    : activeDocument?.name;
  const activeDirectory = activeFileDirectory(activePath);
  const resolvedSteps = resolveExecutionProfile(profile, {
    workspaceRoot,
    ...(activePath ? { activeFile: activePath } : {}),
    ...(activeDirectory ? { activeFileDirectory: activeDirectory } : {}),
    ...(activeDocument?.name ? { activeFileName: activeDocument.name } : {}),
    ...(environment?.executable ? { environmentExecutable: environment.executable } : {}),
    ...(environment?.path ? { environmentPath: environment.path } : {}),
  });

  let completedOutput: readonly string[] = [];
  const publish = (
    additions: readonly string[],
    options: { readonly truncated?: boolean } = {},
  ) => {
    completedOutput = appendExecutionOutput(completedOutput, additions, options);
    callbacks.onOutput(completedOutput);
  };
  callbacks.onOutput(completedOutput);
  for (const step of resolvedSteps) {
    if (callbacks.shouldStop?.()) {
      publish(["[interrompido pelo usuário]"]);
      return "stopped";
    }
    const workingDirectory = step.workingDirectory ?? workspaceRoot;
    const heading = [
      `\n[etapa] ${step.name}`,
      `[diretório] ${workingDirectory}`,
      `$ ${step.executable} ${step.arguments.join(" ")}`,
    ];
    publish(heading);
    let process = await startHostProcess({
      executable: step.executable,
      arguments: step.arguments,
      workingDirectory,
      ...(step.environmentVariables ? { environmentVariables: step.environmentVariables } : {}),
      presentation: {
        kind: "profile",
        sourceId: profile.id,
        sourceName: profile.name,
        runId,
        stepId: step.id,
        stepName: step.name,
        outputPrefix: heading,
      },
    });
    callbacks.onProcessStarted(process.id);
    if (callbacks.shouldStop?.() && process.status === "running") {
      await stopHostProcess(process.id);
    }
    process = await followHostProcess(process, callbacks, (delta) => {
      publish(delta.chunks.map((chunk) => chunk.text), { truncated: delta.truncated });
    }, publish);
    callbacks.onProcessFinished();
    if (process.stopRequested) {
      publish(["[interrompido pelo usuário]"]);
      return "stopped";
    }
    publish([`[exit] ${process.exitCode ?? -1}`]);
    if (process.exitCode !== 0 && !step.continueOnError) {
      throw new Error(`A etapa '${step.name}' terminou com código ${process.exitCode}.`);
    }
  }
  return "completed";
}

export async function startDebugProfile(input: {
  readonly profile: ExecutionProfile;
  readonly activeDocument?: OpenDocument;
  readonly environments: readonly ExecutionEnvironment[];
  readonly breakpoints: readonly DebugBreakpoint[];
}): Promise<{ readonly adapter: DebugAdapterProvider; readonly session: DebugSessionSnapshot }> {
  const { profile, activeDocument, environments, breakpoints } = input;
  const environmentId = profile.environment.mode === "fixed" ? profile.environment.environmentId : undefined;
  const environment = environmentId ? environments.find((candidate) => candidate.id === environmentId) : undefined;
  const adapter = debugAdapterForProfile({
    profile,
    ...(activeDocument ? { activeDocument } : {}),
    environments,
  });
  if (!adapter) throw new Error("Nenhum runtime configurado oferece um adaptador compatível com este perfil.");
  const { workspaceRoot } = await readHostContext();
  const activePath = activeDocument?.path ? `${workspaceRoot}/${activeDocument.path.replace(/^\/+/, "")}` : activeDocument?.name;
  const activeDirectory = activeFileDirectory(activePath);
  const [step] = resolveExecutionProfile(profile, {
    workspaceRoot,
    ...(activePath ? { activeFile: activePath } : {}),
    ...(activeDirectory ? { activeFileDirectory: activeDirectory } : {}),
    ...(activeDocument?.name ? { activeFileName: activeDocument.name } : {}),
    ...(environment?.executable ? { environmentExecutable: environment.executable } : {}),
    ...(environment?.path ? { environmentPath: environment.path } : {}),
  });
  if (!step) throw new Error("O perfil de debug não possui etapa executável.");
  const session = await adapter.launch({
    profileId: profile.id,
    profileName: profile.name,
    ...(environmentId ? { environmentId } : {}),
    executable: step.executable,
    arguments: step.arguments,
    workingDirectory: step.workingDirectory ?? workspaceRoot,
    ...(step.environmentVariables ? { environmentVariables: step.environmentVariables } : {}),
    workspaceRoot,
    breakpoints,
  });
  return { adapter, session };
}

export async function sendDebugCommand(
  adapter: DebugAdapterProvider,
  sessionId: string,
  command: DebugAdapterCommand,
): Promise<DebugSessionSnapshot> {
  let snapshot = await adapter.command(sessionId, command);
  if (!["stepOver", "stepInto", "stepOut"].includes(command)) return snapshot;
  if (snapshot.status === "paused" || ["stopped", "completed", "failed"].includes(snapshot.status)) {
    return snapshot;
  }

  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
    snapshot = await adapter.read(sessionId);
    if (snapshot.status === "paused" || ["stopped", "completed", "failed"].includes(snapshot.status)) {
      return snapshot;
    }
  }
  return snapshot;
}

export async function runScript(input: {
  readonly contribution: ScriptExecutionContribution;
  readonly document: OpenDocument;
  readonly environment?: ExecutionEnvironment;
  readonly callbacks: RunProfileCallbacks;
}): Promise<"completed" | "stopped"> {
  const { contribution, document, environment, callbacks } = input;
  if (!document.path) throw new Error("Salve o arquivo no workspace antes de executar o script.");
  const host = await readHostContext();
  const scriptPath = `${host.workspaceRoot}/${document.path.replace(/^\/+/, "")}`;
  const executable = environment?.executable ?? contribution.executable;
  if (!executable) throw new Error("O plugin não forneceu um executável para este script.");
  const heading = [
    `[script] ${document.name}`,
    `$ ${executable} ${[...(contribution.arguments ?? []), scriptPath].join(" ")}`,
  ];
  let output: readonly string[] = appendExecutionOutput([], heading);
  const publish = (
    additions: readonly string[],
    options: { readonly truncated?: boolean } = {},
  ) => {
    output = appendExecutionOutput(output, additions, options);
    callbacks.onOutput(output);
  };
  callbacks.onOutput(output);
  if (callbacks.shouldStop?.()) {
    publish(["[interrompido pelo usuário]"]);
    return "stopped";
  }
  let process = await startHostProcess({
    executable,
    arguments: [...(contribution.arguments ?? []), scriptPath],
    workingDirectory: activeFileDirectory(scriptPath) ?? host.workspaceRoot,
    presentation: {
      kind: "script",
      sourceId: contribution.id,
      sourceName: document.name,
      outputPrefix: heading,
    },
  });
  callbacks.onProcessStarted(process.id);
  if (callbacks.shouldStop?.() && process.status === "running") {
    await stopHostProcess(process.id);
  }
  process = await followHostProcess(process, callbacks, (delta) => {
    publish(delta.chunks.map((chunk) => chunk.text), { truncated: delta.truncated });
  }, publish);
  callbacks.onProcessFinished();
  if (process.stopRequested) {
    publish(["[interrompido pelo usuário]"]);
    return "stopped";
  }
  publish([`[exit] ${process.exitCode ?? -1}`]);
  if (process.exitCode !== 0) throw new Error(`O script terminou com código ${process.exitCode}.`);
  return "completed";
}
