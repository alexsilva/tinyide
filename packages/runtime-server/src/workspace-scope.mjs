import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, join, resolve } from "node:path";

/**
 * Escopo de workspace: a unidade de isolamento de estado da IDE.
 *
 * Todo estado que pertence a um projeto — layout, abas abertas, snapshot,
 * diagnósticos, dados de plugin com escopo de projeto — vive dentro de
 * `<userDataRoot>/workspaces/<scopeId>/`. O id deriva exclusivamente do caminho
 * absoluto do diretório aberto, então o mesmo projeto sempre resolve para o
 * mesmo diretório de estado, e projetos diferentes nunca compartilham arquivo.
 *
 * Antes o escopo era a *janela* (um id de sessão na URL) e o workspace entrava
 * só como sufixo de algumas chaves. Isso deixava dois eixos de identidade
 * cruzando no mesmo diretório plano: janelas de hosts distintos caíam no mesmo
 * id "default" e sobrescreviam o ponteiro de projeto uma da outra.
 */

const SCOPE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,95}$/;
const SCOPE_HASH_LENGTH = 16;
const SCOPE_METADATA_FILE = "workspace.json";
const WORKSPACES_DIRECTORY = "workspaces";
const HOSTS_DIRECTORY = "hosts";

/**
 * O caminho é normalizado antes do hash para que `/a/b`, `/a/b/` e `/a/./b`
 * resolvam para o mesmo escopo. Symlinks não são resolvidos aqui de propósito:
 * `realpath` exige que o diretório exista, e o escopo precisa ser calculável
 * também para um projeto que acabou de ser removido do disco (para poder
 * limpá-lo). Quem valida existência é o chamador.
 */
export function normalizeWorkspacePath(workspacePath) {
  const value = typeof workspacePath === "string" ? workspacePath.trim() : "";
  if (!value) throw new Error("O caminho do workspace é obrigatório.");
  const absolute = resolve(value);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

function scopeSlug(workspacePath) {
  const name = basename(normalizeWorkspacePath(workspacePath))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return name || "workspace";
}

/**
 * O id junta um slug legível ao hash porque este diretório é inspecionado à mão
 * quando algo dá errado: `tinyide-9f2c…` diz de qual projeto é o estado sem
 * precisar abrir o `workspace.json`. Só o hash participa da identidade.
 */
export function workspaceScopeId(workspacePath) {
  const digest = createHash("sha256")
    .update(normalizeWorkspacePath(workspacePath))
    .digest("hex")
    .slice(0, SCOPE_HASH_LENGTH);
  return `${scopeSlug(workspacePath)}-${digest}`;
}

export function assertWorkspaceScopeId(value) {
  const scopeId = typeof value === "string" ? value.trim() : "";
  if (!SCOPE_ID_PATTERN.test(scopeId)) throw new Error("Identificador de workspace inválido.");
  return scopeId;
}

export function workspaceScopeDirectory(userDataRoot, scopeId) {
  return join(resolve(userDataRoot), WORKSPACES_DIRECTORY, assertWorkspaceScopeId(scopeId));
}

export function hostScopeDirectory(userDataRoot, hostId) {
  return join(resolve(userDataRoot), HOSTS_DIRECTORY, assertWorkspaceScopeId(hostId));
}

async function writeJsonFile(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

async function readJsonFile(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

function metadataPath(userDataRoot, scopeId) {
  return join(workspaceScopeDirectory(userDataRoot, scopeId), SCOPE_METADATA_FILE);
}

/**
 * Cria (ou atualiza) o diretório de estado de um workspace e devolve o
 * descritor. Chamado quando um projeto é aberto: é o único ponto que grava a
 * associação escopo → caminho, e é o que permite ao servidor resolver um id de
 * URL de volta para o diretório do projeto depois de um reload.
 */
export async function registerWorkspaceScope(userDataRoot, workspacePath, options = {}) {
  const path = resolve(workspacePath);
  const scopeId = workspaceScopeId(path);
  const previous = await readJsonFile(metadataPath(userDataRoot, scopeId));
  const descriptor = {
    version: 1,
    scopeId,
    path,
    name: basename(path),
    createdAt: Number.isFinite(previous?.createdAt) ? previous.createdAt : options.now ?? Date.now(),
    lastOpenedAt: options.now ?? Date.now(),
  };
  await writeJsonFile(metadataPath(userDataRoot, scopeId), descriptor);
  return descriptor;
}

export async function readWorkspaceScope(userDataRoot, scopeId) {
  const stored = await readJsonFile(metadataPath(userDataRoot, scopeId));
  if (!stored || typeof stored.path !== "string" || !stored.path.trim()) return undefined;
  // Um descritor cujo id não corresponde ao próprio caminho é resíduo de um
  // diretório copiado ou editado à mão: honrá-lo devolveria estado de outro
  // projeto, que é exatamente a falha que o escopo existe para impedir.
  if (workspaceScopeId(stored.path) !== assertWorkspaceScopeId(scopeId)) return undefined;
  return {
    scopeId,
    path: resolve(stored.path),
    name: typeof stored.name === "string" && stored.name.trim() ? stored.name : basename(stored.path),
    ...(Number.isFinite(stored.lastOpenedAt) ? { lastOpenedAt: stored.lastOpenedAt } : {}),
  };
}

export async function listWorkspaceScopes(userDataRoot) {
  const root = join(resolve(userDataRoot), WORKSPACES_DIRECTORY);
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const descriptors = await Promise.all(entries
    .filter((entry) => entry.isDirectory() && SCOPE_ID_PATTERN.test(entry.name))
    .map((entry) => readWorkspaceScope(userDataRoot, entry.name).catch(() => undefined)));
  return descriptors.filter(Boolean);
}

export async function removeWorkspaceScope(userDataRoot, scopeId) {
  await rm(workspaceScopeDirectory(userDataRoot, scopeId), { recursive: true, force: true });
}

export const workspaceScopeInternals = {
  SCOPE_ID_PATTERN,
  metadataPath,
  scopeSlug,
};
