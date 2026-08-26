/**
 * Identidade de escopo do cliente.
 *
 * A IDE não tem mais "sessão de janela": o que isola estado é o workspace
 * aberto, e ele aparece no próprio caminho da URL (`/w/<scopeId>/`). Toda
 * chamada de API que toca o projeto é reancorada nesse prefixo, e o servidor
 * resolve o escopo para o diretório de estado daquele workspace.
 *
 * O ganho não é cosmético: enquanto a identidade era um parâmetro opcional,
 * qualquer janela que o omitisse caía num escopo compartilhado chamado
 * "default" — e duas janelas apontando para projetos diferentes disputavam os
 * mesmos arquivos de estado.
 */

const WORKSPACE_SCOPE_PREFIX = "/w/";
const PROJECT_OPEN_QUERY = "tinyideOpenProject";
const SCOPE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,95}$/;

function validScopeId(value: string | null | undefined): value is string {
  return Boolean(value && SCOPE_ID_PATTERN.test(value));
}

function scopeFromPathname(pathname: string): string | undefined {
  if (!pathname.startsWith(WORKSPACE_SCOPE_PREFIX)) return undefined;
  const rest = pathname.slice(WORKSPACE_SCOPE_PREFIX.length);
  const separator = rest.indexOf("/");
  const candidate = separator < 0 ? rest : rest.slice(0, separator);
  return validScopeId(candidate) ? candidate : undefined;
}

/**
 * `window` pode existir sem `location` utilizável (workers, ambientes de teste).
 * A identidade do escopo é mantida em memória de qualquer forma; só a reescrita
 * da URL é que depende do documento.
 */
function currentWindowUrl(): URL | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const href = window.location?.href;
    return href ? new URL(href) : undefined;
  } catch {
    return undefined;
  }
}

function currentPathname(): string {
  return currentWindowUrl()?.pathname ?? "/";
}

let activeScopeId: string | undefined = scopeFromPathname(currentPathname());

export function activeWorkspaceScopeId(): string | undefined {
  return activeScopeId;
}

/**
 * Reescreve a URL da janela para o escopo do projeto recém-aberto. Usa
 * `replaceState` — e não navegação — porque o app já está montado: o objetivo é
 * que um reload posterior volte para o mesmo projeto sem depender de nenhum
 * ponteiro global.
 */
export function setActiveWorkspaceScope(scopeId: string): void {
  if (!validScopeId(scopeId)) throw new Error("Identificador de workspace inválido.");
  activeScopeId = scopeId;
  const url = currentWindowUrl();
  if (!url) return;
  const suffix = url.pathname.startsWith(WORKSPACE_SCOPE_PREFIX)
    ? url.pathname.slice(WORKSPACE_SCOPE_PREFIX.length).split("/").slice(1).join("/")
    : url.pathname.replace(/^\/+/, "");
  url.pathname = `${WORKSPACE_SCOPE_PREFIX}${scopeId}/${suffix}`;
  url.searchParams.delete(PROJECT_OPEN_QUERY);
  window.history?.replaceState?.(null, "", url.href);
}

export function clearActiveWorkspaceScope(): void {
  activeScopeId = undefined;
  const url = currentWindowUrl();
  if (!url?.pathname.startsWith(WORKSPACE_SCOPE_PREFIX)) return;
  url.pathname = `/${url.pathname.slice(WORKSPACE_SCOPE_PREFIX.length).split("/").slice(1).join("/")}`;
  window.history?.replaceState?.(null, "", url.href);
}

export function workspaceScopedPath(path: string, scopeId = activeScopeId): string {
  if (!scopeId) throw new Error("Nenhum workspace aberto para esta operação.");
  return `${WORKSPACE_SCOPE_PREFIX}${scopeId}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Chamadas que pertencem ao usuário, não a um projeto: preferências, histórico, registro de workspaces. */
export function runtimeFetch(input: string, init: RequestInit = {}): Promise<Response> {
  return fetch(input, init);
}

/**
 * Chamadas que tocam o projeto aberto. A ausência de escopo é erro explícito, e
 * não uma requisição sem prefixo: sem isso a chamada silenciosamente atingiria
 * estado global de novo.
 */
export function projectRuntimeFetch(input: string, init: RequestInit = {}): Promise<Response> {
  return fetch(workspaceScopedPath(input), init);
}

export function hasActiveWorkspaceScope(): boolean {
  return Boolean(activeScopeId);
}

/** URL de uma janela nova. Sem escopo ela abre o seletor de projeto. */
export function projectWindowUrl(input: {
  readonly scopeId?: string;
  readonly pendingProjectId?: string;
  readonly projectPath?: string;
} = {}): string {
  const url = currentWindowUrl() ?? new URL("http://localhost/");
  url.pathname = input.scopeId ? `${WORKSPACE_SCOPE_PREFIX}${input.scopeId}/` : "/";
  url.searchParams.delete(PROJECT_OPEN_QUERY);
  if (input.pendingProjectId) url.searchParams.set(PROJECT_OPEN_QUERY, input.pendingProjectId);
  if (input.projectPath) url.searchParams.set(PROJECT_OPEN_QUERY, `path:${input.projectPath}`);
  url.hash = "";
  return url.href;
}

export function requestedProjectReference(): string | undefined {
  const value = currentWindowUrl()?.searchParams.get(PROJECT_OPEN_QUERY)?.trim();
  return value || undefined;
}

export function clearRequestedProjectReference(): void {
  const url = currentWindowUrl();
  if (!url?.searchParams.has(PROJECT_OPEN_QUERY)) return;
  url.searchParams.delete(PROJECT_OPEN_QUERY);
  window.history?.replaceState?.(null, "", url.href);
}

export const projectSessionInternals = {
  validScopeId,
  scopeFromPathname,
  WORKSPACE_SCOPE_PREFIX,
};
