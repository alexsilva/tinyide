const PROJECT_SESSION_QUERY = "tinyideSession";
const PROJECT_OPEN_QUERY = "tinyideOpenProject";
const PROJECT_SESSION_STORAGE_KEY = "tinyide.project-session";
const DEFAULT_PROJECT_SESSION_ID = "default";
const PROJECT_SESSION_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/i;

let cachedSessionId: string | undefined;

function safeSessionStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

function validSessionId(value: string | null | undefined): value is string {
  return Boolean(value && PROJECT_SESSION_PATTERN.test(value));
}

export function createProjectSessionId(): string {
  return crypto.randomUUID();
}

export function projectSessionId(): string {
  if (cachedSessionId) return cachedSessionId;
  const queryValue = typeof window === "undefined"
    ? undefined
    : new URL(window.location.href).searchParams.get(PROJECT_SESSION_QUERY);
  const storage = safeSessionStorage();
  const stored = storage?.getItem(PROJECT_SESSION_STORAGE_KEY);
  cachedSessionId = validSessionId(queryValue)
    ? queryValue
    : validSessionId(stored)
      ? stored
      : DEFAULT_PROJECT_SESSION_ID;
  storage?.setItem(PROJECT_SESSION_STORAGE_KEY, cachedSessionId);
  return cachedSessionId;
}

export function projectSessionStateKey(key: string): string {
  const sessionId = projectSessionId();
  return sessionId === DEFAULT_PROJECT_SESSION_ID ? key : `${key}.${sessionId}`;
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
};
