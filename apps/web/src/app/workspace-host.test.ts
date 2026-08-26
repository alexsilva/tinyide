import { afterEach, describe, expect, it, vi } from "vitest";
import { clearActiveWorkspaceScope, setActiveWorkspaceScope } from "./project-session";
import type {
  BrowserDirectoryHandle,
  BrowserFileHandle,
} from "../browser-filesystem";
import {
  openInSystemFileManager,
  pickWorkspaceDirectory,
  WORKSPACE_PICKER_ID,
  workspaceRootFromFilePath,
  workspaceRootHintForHandle,
} from "./workspace-host";

function fileHandle(name: string): BrowserFileHandle {
  return {
    kind: "file",
    name,
    getFile: async () => ({ name } as File),
    createWritable: async () => ({ write: async () => undefined, close: async () => undefined }),
  };
}

function directoryHandle(
  name: string,
  children: readonly (BrowserFileHandle | BrowserDirectoryHandle)[],
): BrowserDirectoryHandle {
  return {
    kind: "directory",
    name,
    async *values() { yield* children; },
    getFileHandle: async (childName) => {
      const child = children.find((entry): entry is BrowserFileHandle => entry.kind === "file" && entry.name === childName);
      if (!child) throw new Error(`missing file: ${childName}`);
      return child;
    },
    getDirectoryHandle: async (childName) => {
      const child = children.find((entry): entry is BrowserDirectoryHandle => entry.kind === "directory" && entry.name === childName);
      if (!child) throw new Error(`missing directory: ${childName}`);
      return child;
    },
  };
}

describe("workspaceRootFromFilePath", () => {
  it("deriva a raiz Linux a partir do caminho de um arquivo interno", () => {
    expect(workspaceRootFromFilePath("/mnt/projects/preco/src/main.ts", ["src", "main.ts"]))
      .toBe("/mnt/projects/preco");
  });

  it("deriva a raiz Windows a partir do caminho de um arquivo interno", () => {
    expect(workspaceRootFromFilePath("C:\\projects\\preco\\src\\main.ts", ["src", "main.ts"]))
      .toBe("C:\\projects\\preco");
  });
});

describe("workspaceRootHintForHandle", () => {
  it("usa o caminho real exposto pelo host desktop", async () => {
    const file = fileHandle("package.json");
    const handle = directoryHandle("preco", [file]);
    const desktop = {
      getPathForFile: vi.fn(() => "/mnt/projects/preco/package.json"),
    };

    await expect(workspaceRootHintForHandle(handle, desktop)).resolves.toBe("/mnt/projects/preco");
  });

  it("mantém o fallback por nome no navegador comum", async () => {
    const handle = directoryHandle("preco", [fileHandle("package.json")]);
    await expect(workspaceRootHintForHandle(handle, undefined)).resolves.toBeUndefined();
  });
});

describe("pickWorkspaceDirectory", () => {
  it("abre o diálogo nativo no último diretório conhecido", async () => {
    const pickDirectory = vi.fn(async () => ({ token: "token", name: "preco", path: "/mnt/projects/preco" }));
    vi.stubGlobal("window", {
      tinyideDesktop: {
        getPathForFile: () => "",
        pickDirectory,
        restoreDirectory: async () => undefined,
        listDirectory: async () => [],
        ensureFile: async () => true,
        ensureDirectory: async () => true,
        readFile: async () => ({ bytes: new Uint8Array(), lastModified: 0 }),
        writeFile: async () => true,
        removeEntry: async () => true,
      },
    });

    await expect(pickWorkspaceDirectory("/mnt/projects/preco")).resolves.toMatchObject({ name: "preco" });
    expect(pickDirectory).toHaveBeenCalledWith("/mnt/projects/preco");
  });

  it("identifica o seletor do navegador para que ele reabra no último diretório", async () => {
    const showDirectoryPicker = vi.fn(async () => directoryHandle("preco", []));
    vi.stubGlobal("window", { showDirectoryPicker });

    await expect(pickWorkspaceDirectory("/mnt/projects/preco")).resolves.toMatchObject({ name: "preco" });
    expect(showDirectoryPicker).toHaveBeenCalledWith({ id: WORKSPACE_PICKER_ID, mode: "readwrite" });
  });
});

afterEach(() => clearActiveWorkspaceScope());

describe("system file manager bridge", () => {
  it("delegates only when the desktop bridge exposes the operation", async () => {
    const openInFileManager = vi.fn(async () => true);
    vi.stubGlobal("window", { tinyideDesktop: { openInFileManager } });

    await expect(openInSystemFileManager("/mnt/projects/preco", "src/main.ts")).resolves.toBe(true);
    expect(openInFileManager).toHaveBeenCalledWith("/mnt/projects/preco", "src/main.ts");
  });

  it("uses the local runtime when the browser has no desktop bridge", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ directory: "/mnt/projects/preco/src" }), { status: 200 }));
    vi.stubGlobal("window", { tinyideDesktop: {} });
    vi.stubGlobal("fetch", fetch);
    setActiveWorkspaceScope("preco-0011223344556677");

    await expect(openInSystemFileManager("/mnt/projects/preco", "src/main.ts")).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledWith("/w/preco-0011223344556677/core-api/workspace/open-in-file-manager", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ path: "src/main.ts" }),
    }));
  });
});
