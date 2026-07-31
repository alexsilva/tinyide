const { cp, stat } = require("node:fs/promises");
const { existsSync } = require("node:fs");
const { basename, isAbsolute, join, relative, resolve } = require("node:path");
const { fileURLToPath, pathToFileURL } = require("node:url");

const GNOME_FILE_FORMAT = "x-special/gnome-copied-files";
const URI_LIST_FORMAT = "text/uri-list";

function clipboardLines(value) {
  return value
    .replaceAll("\0", "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line !== "copy" && line !== "cut" && !line.startsWith("#"));
}

function parseFileClipboard(value) {
  const paths = [];
  for (const line of clipboardLines(value)) {
    try {
      const path = line.startsWith("file://") ? fileURLToPath(line) : line;
      if (isAbsolute(path)) paths.push(resolve(path));
    } catch {
      // Ignore malformed clipboard entries while preserving the valid ones.
    }
  }
  return [...new Set(paths)];
}

function readFileClipboard(clipboard) {
  const formats = new Set(clipboard.availableFormats().map((format) => format.toLocaleLowerCase()));
  for (const format of [GNOME_FILE_FORMAT, URI_LIST_FORMAT]) {
    if (!formats.has(format)) continue;
    const paths = parseFileClipboard(clipboard.readBuffer(format).toString("utf8"));
    if (paths.length) return paths;
  }
  return parseFileClipboard(clipboard.readText());
}

function writeFileClipboard(clipboard, paths) {
  const uniquePaths = [...new Set(paths.map((path) => resolve(path)))];
  if (!uniquePaths.length) return false;
  const uris = uniquePaths.map((path) => pathToFileURL(path).href);
  clipboard.writeBuffer(URI_LIST_FORMAT, Buffer.from(uris.join("\r\n"), "utf8"));
  return true;
}

function copiedEntryName(name, index) {
  if (index === 0) return name;
  const extensionIndex = name.lastIndexOf(".");
  const base = extensionIndex > 0 ? name.slice(0, extensionIndex) : name;
  const extension = extensionIndex > 0 ? name.slice(extensionIndex) : "";
  return `${base} copia${index === 1 ? "" : ` ${index}`}${extension}`;
}

async function availableTargetPath(targetDirectory, sourceName) {
  let index = 0;
  let name = copiedEntryName(sourceName, index);
  while (existsSync(join(targetDirectory, name))) {
    index += 1;
    name = copiedEntryName(sourceName, index);
  }
  return { name, path: join(targetDirectory, name) };
}

async function copyExternalEntries(sourcePaths, targetDirectory) {
  const target = resolve(targetDirectory);
  const targetInfo = await stat(target);
  if (!targetInfo.isDirectory()) throw new Error("O destino da colagem não é um diretório.");

  const copied = [];
  for (const sourcePath of [...new Set(sourcePaths.map((path) => resolve(path)))]) {
    const sourceInfo = await stat(sourcePath);
    const relativeTarget = relative(sourcePath, target);
    if (sourceInfo.isDirectory()
      && (relativeTarget === "" || (!relativeTarget.startsWith("..") && !isAbsolute(relativeTarget)))) {
      throw new Error("Não é possível copiar uma pasta para dentro dela mesma.");
    }
    const destination = await availableTargetPath(target, basename(sourcePath));
    await cp(sourcePath, destination.path, {
      recursive: sourceInfo.isDirectory(),
      errorOnExist: true,
      force: false,
      preserveTimestamps: true,
    });
    copied.push({ name: destination.name, kind: sourceInfo.isDirectory() ? "directory" : "file" });
  }
  return copied;
}

module.exports = {
  copyExternalEntries,
  parseFileClipboard,
  readFileClipboard,
  writeFileClipboard,
};
