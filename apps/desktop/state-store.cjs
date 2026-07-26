const { randomUUID } = require("node:crypto");
const { mkdir, readFile, rename, rm, writeFile } = require("node:fs/promises");
const { join } = require("node:path");

const STATE_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/i;

function stateFilePath(root, key) {
  if (!STATE_KEY_PATTERN.test(key)) throw new Error("Chave de estado inválida.");
  return join(root, `${key}.json`);
}

async function readDesktopState(root, key) {
  try {
    return JSON.parse(await readFile(stateFilePath(root, key), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

async function writeDesktopState(root, key, value) {
  const target = stateFilePath(root, key);
  const temporary = `${target}.${randomUUID()}.tmp`;
  await mkdir(root, { recursive: true });
  await writeFile(temporary, `${JSON.stringify(value)}\n`, "utf8");
  await rename(temporary, target);
}

async function removeDesktopState(root, key) {
  await rm(stateFilePath(root, key), { force: true });
}

module.exports = {
  readDesktopState,
  removeDesktopState,
  writeDesktopState,
};
