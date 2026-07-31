import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  copyExternalEntries,
  parseFileClipboard,
  readFileClipboard,
  writeFileClipboard,
} = require("./file-clipboard.cjs");

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function temporaryDirectory() {
  const path = await mkdtemp(join(tmpdir(), "tinyide-file-clipboard-"));
  temporaryDirectories.push(path);
  return path;
}

describe("desktop file clipboard", () => {
  it("parses GNOME and URI-list clipboard payloads", () => {
    expect(parseFileClipboard("copy\nfile:///tmp/one.txt\nfile:///tmp/folder"))
      .toEqual(["/tmp/one.txt", "/tmp/folder"]);
    expect(parseFileClipboard("# files\nfile:///tmp/one%20two.txt\r\n"))
      .toEqual(["/tmp/one two.txt"]);
  });

  it("prefers native file formats when reading", () => {
    const clipboard = {
      availableFormats: () => ["x-special/gnome-copied-files"],
      readBuffer: vi.fn(() => Buffer.from("copy\nfile:///tmp/source.txt")),
      readText: vi.fn(() => "/tmp/fallback.txt"),
    };

    expect(readFileClipboard(clipboard)).toEqual(["/tmp/source.txt"]);
    expect(clipboard.readText).not.toHaveBeenCalled();
  });

  it("publishes workspace paths as a URI list accepted by the system clipboard", () => {
    const clipboard = { writeBuffer: vi.fn() };

    expect(writeFileClipboard(clipboard, ["/tmp/one file.txt"])).toBe(true);
    expect(clipboard.writeBuffer).toHaveBeenCalledWith(
      "text/uri-list",
      Buffer.from("file:///tmp/one%20file.txt"),
    );
  });

  it("copies files and directories recursively with collision-safe names", async () => {
    const root = await temporaryDirectory();
    const source = join(root, "source");
    const target = join(root, "target");
    await mkdir(join(source, "folder"), { recursive: true });
    await mkdir(target);
    await writeFile(join(source, "main.txt"), "first");
    await writeFile(join(source, "folder", "nested.txt"), "nested");
    await writeFile(join(target, "main.txt"), "existing");

    await expect(copyExternalEntries(
      [join(source, "main.txt"), join(source, "folder")],
      target,
    )).resolves.toEqual([
      { name: "main copia.txt", kind: "file" },
      { name: "folder", kind: "directory" },
    ]);
    await expect(readFile(join(target, "main copia.txt"), "utf8")).resolves.toBe("first");
    await expect(readFile(join(target, "folder", "nested.txt"), "utf8")).resolves.toBe("nested");
  });
});
