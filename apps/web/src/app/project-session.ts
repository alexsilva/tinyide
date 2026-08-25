const PROJECT_SESSION_QUERY = "tinyideSession";
const PROJECT_OPEN_QUERY = "tinyideOpenProject";
const DEFAULT_PROJECT_SESSION_ID = "default";
const PROJECT_SESSION_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/i;

let cachedSessionId: string | undefined;

function validSessionId(value: string | null | undefined): value is string {
  return Boolean(value && PROJECT_SESSION_PATTERN.test(value));
}

export function createProjectSessionId(): string {
  return crypto.randomUUID();
}

export function projectSessionId(): string {
  if (cachedSessionId) return cachedSessionId;
  // `window` pode existir sem `location` utilizável (ambientes de teste, workers):
  // a ausência do parâmetro não deve derrubar a requisição.
  const queryValue = (() => {
    const href = typeof window === "undefined" ? undefined : window.location?.href;
    if (!href) return undefined;
    try {
      return new URL(href).searchParams.get(PROJECT_SESSION_QUERY);
    } catch {
      return undefined;
    }
  })();
  cachedSessionId = validSessionId(queryValue)
    ? queryValue
    : DEFAULT_PROJECT_SESSION_ID;
  return cachedSessionId;
}

export function projectSessionStateKey(key: string): string {
  const sessionId = projectSessionId();
  return sessionId === DEFAULT_PROJECT_SESSION_ID ? key : `${key}.${sessionId}`;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Estado visual é simultaneamente isolado pela janela/sessão do host e pelo
 * workspace. O caminho não entra no nome do arquivo de estado: além de evitar
 * limites de tamanho e caracteres do SO, o hash impede que dois workspaces
 * compartilhem acidentalmente a mesma chave global de UI.
 */
export async function projectWorkspaceStateKey(key: string, workspaceRoot: string): Promise<string> {
  const root = workspaceRoot.trim();
  if (!root) throw new Error("Workspace obrigatório para estado escopado.");
  const scope = `${projectSessionId()}\0${root}`;
  return `${key}.workspace.${await sha256Hex(scope)}`;
}

export function projectSessionHeaders(headers?: HeadersInit): Headers {
  const next = new Headers(headers);
  next.set("X-TinyIde-Session-Id", projectSessionId());
  return next;
}

export function projectRuntimeFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  return fetch(input, {
    ...init,
    headers: projectSessionHeaders(init.headers),
  });
}

export function projectWindowUrl(input: {
  readonly sessionId: string;
  readonly pendingProjectId?: string;
  readonly projectPath?: string;
}): string {
  const url = new URL(window.location.href);
  url.searchParams.set(PROJECT_SESSION_QUERY, input.sessionId);
  url.searchParams.delete(PROJECT_OPEN_QUERY);
  if (input.pendingProjectId) url.searchParams.set(PROJECT_OPEN_QUERY, input.pendingProjectId);
  if (input.projectPath) url.searchParams.set(PROJECT_OPEN_QUERY, `path:${input.projectPath}`);
  url.hash = "";
  return url.href;
}

export function requestedProjectReference(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const value = new URL(window.location.href).searchParams.get(PROJECT_OPEN_QUERY)?.trim();
  return value || undefined;
}

export const projectSessionInternals = {
  validSessionId,
  sha256Hex,
};
