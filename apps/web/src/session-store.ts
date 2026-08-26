import { projectRuntimeFetch, runtimeFetch } from "./app/project-session";

/**
 * Duas famílias de estado, deliberadamente separadas em funções distintas:
 *
 * - `*GlobalState` grava em `<userData>/state` e é do usuário (histórico de
 *   projetos, preferência de abertura, plugins instalados);
 * - `*StoredState` grava dentro do diretório do workspace ativo.
 *
 * Não há função que "escolhe sozinha" onde gravar. Era exatamente esse tipo de
 * decisão implícita — chave com sufixo opcional, caindo no arquivo global
 * quando o sufixo faltava — que fazia o estado de um projeto vazar para outro.
 */

const SNAPSHOT_KEY = "application-snapshot";

async function parseStateResponse<T>(response: Response, key: string): Promise<T | undefined> {
  if (response.status === 404) return undefined;
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { readonly error?: string };
    throw new Error(payload.error ?? `Não foi possível acessar o estado persistente '${key}'.`);
  }
  if (response.status === 204) return undefined;
  return await response.json() as T;
}

function stateInit(init?: RequestInit): RequestInit {
  return { cache: "no-store", ...init };
}

async function workspaceStateRequest<T>(key: string, init?: RequestInit): Promise<T | undefined> {
  const response = await projectRuntimeFetch(
    `/core-api/user/state/${encodeURIComponent(key)}`,
    stateInit(init),
  );
  return await parseStateResponse<T>(response, key);
}

async function globalStateRequest<T>(key: string, init?: RequestInit): Promise<T | undefined> {
  const response = await runtimeFetch(
    `/core-api/user/state/${encodeURIComponent(key)}`,
    stateInit(init),
  );
  return await parseStateResponse<T>(response, key);
}

async function hostStateRequest<T>(key: string, init?: RequestInit): Promise<T | undefined> {
  const response = await runtimeFetch(
    `/core-api/host/state/${encodeURIComponent(key)}`,
    stateInit(init),
  );
  return await parseStateResponse<T>(response, key);
}

function jsonBody<T>(value: T): RequestInit {
  return {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  };
}

export async function readApplicationSnapshot<T>(): Promise<T | undefined> {
  return await readStoredState<T>(SNAPSHOT_KEY);
}

export async function writeApplicationSnapshot<T>(snapshot: T): Promise<void> {
  await writeStoredState(SNAPSHOT_KEY, snapshot);
}

export async function clearApplicationSnapshot(): Promise<void> {
  await removeStoredState(SNAPSHOT_KEY);
}

export async function readStoredState<T>(key: string): Promise<T | undefined> {
  return await workspaceStateRequest<T>(key);
}

export async function writeStoredState<T>(key: string, value: T): Promise<void> {
  await workspaceStateRequest<T>(key, jsonBody(value));
}

export async function removeStoredState(key: string): Promise<void> {
  await workspaceStateRequest(key, { method: "DELETE" });
}

export async function readGlobalState<T>(key: string): Promise<T | undefined> {
  return await globalStateRequest<T>(key);
}

export async function writeGlobalState<T>(key: string, value: T): Promise<void> {
  await globalStateRequest<T>(key, jsonBody(value));
}

export async function removeGlobalState(key: string): Promise<void> {
  await globalStateRequest(key, { method: "DELETE" });
}

/**
 * Estado do host que serve esta janela (desktop ou navegador), não do usuário e
 * não do projeto. Guarda apenas qual workspace reabrir quando uma janela nasce
 * sem escopo na URL — o ponteiro que antes era global e fazia um host decidir o
 * projeto do outro.
 */
export async function readHostState<T>(key: string): Promise<T | undefined> {
  return await hostStateRequest<T>(key);
}

export async function writeHostState<T>(key: string, value: T): Promise<void> {
  await hostStateRequest<T>(key, jsonBody(value));
}

export async function removeHostState(key: string): Promise<void> {
  await hostStateRequest(key, { method: "DELETE" });
}
