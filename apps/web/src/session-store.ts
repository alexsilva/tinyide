import { projectRuntimeFetch } from "./app/project-session";
import { projectSessionStateKey } from "./app/project-session";

const SNAPSHOT_KEY = () => projectSessionStateKey("application-snapshot");

async function stateRequest<T>(key: string, init?: RequestInit): Promise<T | undefined> {
  const response = await projectRuntimeFetch(`/core-api/user/state/${encodeURIComponent(key)}`, {
    cache: "no-store",
    ...init,
  });
  if (response.status === 404) return undefined;
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { readonly error?: string };
    throw new Error(payload.error ?? `Não foi possível acessar o estado persistente '${key}'.`);
  }
  if (response.status === 204) return undefined;
  return await response.json() as T;
}

export async function readApplicationSnapshot<T>(): Promise<T | undefined> {
  return await readStoredState<T>(SNAPSHOT_KEY());
}

export async function writeApplicationSnapshot<T>(snapshot: T): Promise<void> {
  await writeStoredState(SNAPSHOT_KEY(), snapshot);
}

export async function clearApplicationSnapshot(): Promise<void> {
  await removeStoredState(SNAPSHOT_KEY());
}

export async function readStoredState<T>(key: string): Promise<T | undefined> {
  return await stateRequest<T>(key);
}

export async function writeStoredState<T>(key: string, value: T): Promise<void> {
  await stateRequest<T>(key, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
}

export async function removeStoredState(key: string): Promise<void> {
  await stateRequest(key, { method: "DELETE" });
}
