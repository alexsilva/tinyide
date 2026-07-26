import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  readDesktopState,
  removeDesktopState,
  writeDesktopState,
} = require("./state-store.cjs");

const roots = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("desktop state store", () => {
  it("writes, replaces and removes JSON state atomically", async () => {
    const root = await mkdtemp(join(tmpdir(), "tinyide-state-"));
    roots.push(root);

    await writeDesktopState(root, "application-snapshot", { workspaceRoot: "/workspace/one" });
    await expect(readDesktopState(root, "application-snapshot"))
      .resolves.toEqual({ workspaceRoot: "/workspace/one" });

    await writeDesktopState(root, "application-snapshot", { workspaceRoot: "/workspace/two" });
    await expect(readDesktopState(root, "application-snapshot"))
      .resolves.toEqual({ workspaceRoot: "/workspace/two" });
    expect(await readFile(join(root, "application-snapshot.json"), "utf8"))
      .toContain("/workspace/two");

    await removeDesktopState(root, "application-snapshot");
    await expect(readDesktopState(root, "application-snapshot")).resolves.toBeUndefined();
  });

  it("rejects keys that could escape the state directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "tinyide-state-"));
    roots.push(root);
    await expect(writeDesktopState(root, "../unsafe", {})).rejects.toThrow("Chave de estado inválida");
  });
});
