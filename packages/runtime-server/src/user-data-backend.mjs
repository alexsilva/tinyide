import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const USER_SETTINGS_VERSION = 1;
const STATE_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,191}$/i;
const PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
const userSettingsWrites = new Map();

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

function statePath(root, key) {
  if (!STATE_KEY_PATTERN.test(key)) throw new Error("Chave de estado do usuário inválida.");
  return join(root, "state", `${key}.json`);
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

export async function readUserState(root, key) {
  return await readJsonFile(statePath(root, key));
}

export async function writeUserState(root, key, value) {
  await writeJsonFile(statePath(root, key), value);
}

export async function removeUserState(root, key) {
  await rm(statePath(root, key), { force: true });
}

export function createUserDataBackend({ root }) {
  const userDataRoot = resolve(root);
  return async function handleUserData(request, response, path) {
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
    if (request.method === "GET") {
      const value = await readUserState(userDataRoot, key);
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
      await writeUserState(userDataRoot, key, value);
      writeJson(response, 200, value);
      return true;
    }
    if (request.method === "DELETE") {
      await removeUserState(userDataRoot, key);
      writeJson(response, 204);
      return true;
    }
    writeJson(response, 405, { error: "Método não permitido." });
    return true;
  };
}

export const userDataInternals = {
  statePath,
  settingsPath,
};
