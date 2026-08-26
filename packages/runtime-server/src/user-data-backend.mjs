import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  assertWorkspaceScopeId,
  hostScopeDirectory,
  workspaceScopeDirectory,
} from "./workspace-scope.mjs";

const USER_SETTINGS_VERSION = 1;
const STATE_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,191}$/i;
const PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
const userSettingsWrites = new Map();

/**
 * Estado que pertence ao usuário, não a um projeto: preferências e histórico
 * que fazem sentido compartilhar entre todos os workspaces. Qualquer outra
 * chave só é aceita dentro de um escopo de workspace.
 *
 * A lista é uma allowlist, e não uma denylist, de propósito: sem ela bastaria
 * alguém acrescentar uma chave nova sem escopo para o vazamento de estado entre
 * projetos voltar em silêncio — que foi como o problema original nasceu.
 */
const GLOBAL_STATE_KEYS = new Set([
  "recent-projects",
  "project-open-preference",
  "plugins",
]);

export function isGlobalStateKey(key) {
  return GLOBAL_STATE_KEYS.has(key);
}

function writeJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  if (status === 204) {
    response.end();
    return;
  }
  response.end(JSON.stringify(payload));
}

export function defaultTinyIdeUserDataRoot(environment = process.env, platform = process.platform) {
  const configured = environment.TINYIDE_USER_DATA_ROOT?.trim();
  if (configured) return resolve(configured);
  if (platform === "win32") {
    return join(environment.APPDATA || join(homedir(), "AppData", "Roaming"), "tinyide");
  }
  if (platform === "darwin") return join(homedir(), "Library", "Application Support", "tinyide");
  return join(environment.XDG_CONFIG_HOME || join(homedir(), ".config"), "tinyide");
}

function settingsPath(root) {
  return join(root, "settings.json");
}

/**
 * Sem `scopeId` o estado é global (`<root>/state`); com escopo ele vive dentro
 * do diretório do próprio workspace. Não existe caminho intermediário: uma
 * chave não-global fora de escopo é recusada em vez de cair no diretório
 * compartilhado.
 */
function statePath(root, key, scopeId) {
  if (!STATE_KEY_PATTERN.test(key)) throw new Error("Chave de estado do usuário inválida.");
  if (scopeId) return join(workspaceScopeDirectory(root, scopeId), "state", `${key}.json`);
  if (!isGlobalStateKey(key)) {
    throw new Error(`A chave de estado '${key}' pertence a um workspace e exige escopo.`);
  }
  return join(root, "state", `${key}.json`);
}

function hostStatePath(root, hostId, key) {
  if (!STATE_KEY_PATTERN.test(key)) throw new Error("Chave de estado do host inválida.");
  return join(hostScopeDirectory(root, hostId), `${key}.json`);
}

async function readJsonFile(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    if (error instanceof SyntaxError) throw new Error(`O arquivo de estado '${path}' contém JSON inválido.`);
    throw error;
  }
}

async function writeJsonFile(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

function normalizeUserSettings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Configuração do usuário inválida.");
  }
  return { ...value, version: USER_SETTINGS_VERSION };
}

export async function readUserSettings(root) {
  const stored = await readJsonFile(settingsPath(root));
  return stored === undefined ? { version: USER_SETTINGS_VERSION } : normalizeUserSettings(stored);
}

export async function writeUserSettings(root, value) {
  const settings = normalizeUserSettings(value);
  await writeJsonFile(settingsPath(root), settings);
  return settings;
}

export async function updateUserSettings(root, updater) {
  const userRoot = resolve(root);
  const previous = userSettingsWrites.get(userRoot) ?? Promise.resolve();
  const operation = previous.catch(() => undefined).then(async () => {
    const current = await readUserSettings(userRoot);
    return writeUserSettings(userRoot, await updater(current));
  });
  const tail = operation.then(() => undefined, () => undefined);
  userSettingsWrites.set(userRoot, tail);
  try {
    return await operation;
  } finally {
    if (userSettingsWrites.get(userRoot) === tail) userSettingsWrites.delete(userRoot);
  }
}

function assertPluginId(pluginId) {
  if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error("Identificador de plugin inválido.");
  return pluginId;
}

function normalizedPluginData(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export async function readUserPluginData(root, pluginId) {
  const id = assertPluginId(pluginId);
  const settings = await readUserSettings(root);
  return normalizedPluginData(settings.pluginData?.[id]);
}

export async function replaceUserPluginData(root, pluginId, value) {
  const id = assertPluginId(pluginId);
  const data = normalizedPluginData(value);
  const settings = await updateUserSettings(root, (current) => ({
    ...current,
    pluginData: {
      ...(current.pluginData ?? {}),
      [id]: data,
    },
  }));
  return normalizedPluginData(settings.pluginData?.[id]);
}

export async function patchUserPluginData(root, pluginId, patch) {
  const id = assertPluginId(pluginId);
  const delta = normalizedPluginData(patch);
  const settings = await updateUserSettings(root, (current) => ({
    ...current,
    pluginData: {
      ...(current.pluginData ?? {}),
      [id]: {
        ...normalizedPluginData(current.pluginData?.[id]),
        ...delta,
      },
    },
  }));
  return normalizedPluginData(settings.pluginData?.[id]);
}

export async function readUserState(root, key, scopeId) {
  return await readJsonFile(statePath(root, key, scopeId));
}

export async function writeUserState(root, key, value, scopeId) {
  await writeJsonFile(statePath(root, key, scopeId), value);
}

export async function removeUserState(root, key, scopeId) {
  await rm(statePath(root, key, scopeId), { force: true });
}

/**
 * Ponteiro de "qual projeto este host reabre". É por host — não global e não por
 * workspace — porque o desktop e uma aba de navegador compartilham o mesmo
 * diretório de dados do usuário: um ponteiro único faria o último a gravar
 * decidir o que o outro abre no próximo reload.
 */
export async function readHostState(root, hostId, key) {
  return await readJsonFile(hostStatePath(root, hostId, key));
}

export async function writeHostState(root, hostId, key, value) {
  await writeJsonFile(hostStatePath(root, hostId, key), value);
}

export async function removeHostState(root, hostId, key) {
  await rm(hostStatePath(root, hostId, key), { force: true });
}

export function createUserDataBackend({ root, hostId = "web" }) {
  const userDataRoot = resolve(root);
  const host = assertWorkspaceScopeId(hostId);
  return async function handleUserData(request, response, path, scopeId) {
    if (path.startsWith("/host/state/")) {
      let key;
      try {
        key = decodeURIComponent(path.slice("/host/state/".length));
      } catch {
        writeJson(response, 400, { error: "Chave de estado do host inválida." });
        return true;
      }
      if (!STATE_KEY_PATTERN.test(key)) {
        writeJson(response, 400, { error: "Chave de estado do host inválida." });
        return true;
      }
      if (request.method === "GET") {
        const value = await readHostState(userDataRoot, host, key);
        if (value === undefined) writeJson(response, 204);
        else writeJson(response, 200, value);
        return true;
      }
      if (request.method === "PUT") {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const value = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
        await writeHostState(userDataRoot, host, key, value);
        writeJson(response, 200, value);
        return true;
      }
      if (request.method === "DELETE") {
        await removeHostState(userDataRoot, host, key);
        writeJson(response, 204);
        return true;
      }
      writeJson(response, 405, { error: "Método não permitido." });
      return true;
    }

    if (path === "/user/settings") {
      if (request.method === "GET") {
        writeJson(response, 200, await readUserSettings(userDataRoot));
        return true;
      }
      if (request.method === "PUT") {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const payload = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
        writeJson(response, 200, await updateUserSettings(userDataRoot, (current) => ({
          ...payload,
          ...(current.pluginData === undefined ? {} : { pluginData: current.pluginData }),
        })));
        return true;
      }
      writeJson(response, 405, { error: "Método não permitido." });
      return true;
    }

    if (path.startsWith("/user/plugin-data/")) {
      let pluginId;
      try {
        pluginId = decodeURIComponent(path.slice("/user/plugin-data/".length));
        assertPluginId(pluginId);
      } catch {
        writeJson(response, 400, { error: "Identificador de plugin inválido." });
        return true;
      }
      if (request.method === "GET") {
        writeJson(response, 200, await readUserPluginData(userDataRoot, pluginId));
        return true;
      }
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const payload = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
      if (request.method === "PUT") {
        writeJson(response, 200, await replaceUserPluginData(userDataRoot, pluginId, payload));
        return true;
      }
      if (request.method === "PATCH") {
        writeJson(response, 200, await patchUserPluginData(userDataRoot, pluginId, payload));
        return true;
      }
      writeJson(response, 405, { error: "Método não permitido para dados de plugin do usuário." });
      return true;
    }

    if (!path.startsWith("/user/state/")) return false;
    let key;
    try {
      key = decodeURIComponent(path.slice("/user/state/".length));
    } catch {
      writeJson(response, 400, { error: "Chave de estado do usuário inválida." });
      return true;
    }
    if (!STATE_KEY_PATTERN.test(key)) {
      writeJson(response, 400, { error: "Chave de estado do usuário inválida." });
      return true;
    }
    if (!scopeId && !isGlobalStateKey(key)) {
      writeJson(response, 400, {
        error: `A chave de estado '${key}' pertence a um workspace e exige escopo.`,
      });
      return true;
    }
    if (request.method === "GET") {
      const value = await readUserState(userDataRoot, key, scopeId);
      // Ausência de estado é um caso normal (primeira execução ou preferência
      // ainda não definida), não um erro HTTP que deva poluir o console.
      if (value === undefined) writeJson(response, 204);
      else writeJson(response, 200, value);
      return true;
    }
    if (request.method === "PUT") {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const value = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
      await writeUserState(userDataRoot, key, value, scopeId);
      writeJson(response, 200, value);
      return true;
    }
    if (request.method === "DELETE") {
      await removeUserState(userDataRoot, key, scopeId);
      writeJson(response, 204);
      return true;
    }
    writeJson(response, 405, { error: "Método não permitido." });
    return true;
  };
}

export const userDataInternals = {
  statePath,
  hostStatePath,
  settingsPath,
  GLOBAL_STATE_KEYS,
};
