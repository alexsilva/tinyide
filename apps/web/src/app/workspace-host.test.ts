import { afterEach, describe, expect, it, vi } from "vitest";
import { clearActiveWorkspaceScope, setActiveWorkspaceScope } from "./project-session";
import type {
  BrowserDirectoryHandle,
  BrowserFileHandle,
} from "../browser-filesystem";
import {
  createProjectDirectory,
  desktopWatcherDefaultIgnoredDirectories,
  openInSystemFileManager,
  pickWorkspaceDirectory,
  PROJECT_PARENT_PICKER_ID,
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

describe("createProjectDirectory", () => {
  it("delega criação e registro ao host desktop", async () => {
    const createDirectory = vi.fn(async () => ({
      token: "new-token",
      name: "meu-projeto",
      path: "/mnt/projects/meu-projeto",
    }));
    vi.stubGlobal("window", {
      tinyideDesktop: {
        getPathForFile: () => "",
        pickDirectory: async () => undefined,
        createProjectDirectory: createDirectory,
        restoreDirectory: async () => undefined,
        listDirectory: async () => [],
        ensureFile: async () => true,
        ensureDirectory: async () => true,
        readFile: async () => ({ bytes: new Uint8Array(), lastModified: 0 }),
        writeFile: async () => true,
        removeEntry: async () => true,
      },
    });

    await expect(createProjectDirectory("  meu-projeto  ", "/mnt/projects/atual"))
      .resolves.toMatchObject({ name: "meu-projeto", desktopWorkspaceRoot: "/mnt/projects/meu-projeto" });
    expect(createDirectory).toHaveBeenCalledWith("meu-projeto", "/mnt/projects/atual");
  });

  it("cria uma pasta filha inédita pelo seletor do navegador", async () => {
    const created = directoryHandle("meu-projeto", []);
    const getDirectoryHandle = vi.fn(async () => created);
    const parent = { ...directoryHandle("projects", []), getDirectoryHandle };
    const showDirectoryPicker = vi.fn(async () => parent);
    vi.stubGlobal("window", { showDirectoryPicker });

    await expect(createProjectDirectory("meu-projeto")).resolves.toBe(created);
    expect(showDirectoryPicker).toHaveBeenCalledWith({ id: PROJECT_PARENT_PICKER_ID, mode: "readwrite" });
    expect(getDirectoryHandle).toHaveBeenCalledWith("meu-projeto", { create: true });
  });

  it("não converte silenciosamente uma pasta existente em projeto", async () => {
    const parent = directoryHandle("projects", [directoryHandle("Meu-Projeto", [])]);
    vi.stubGlobal("window", { showDirectoryPicker: async () => parent });

    await expect(createProjectDirectory("meu-projeto")).rejects.toThrow("Já existe um arquivo ou uma pasta");
  });
});

describe("desktop watcher defaults", () => {
  it("keeps .tmp out of the external-change watcher fallback", () => {
    vi.stubGlobal("window", { tinyideDesktop: {} });
    expect(desktopWatcherDefaultIgnoredDirectories()).toContain(".tmp");
  });

  it("prefers the defaults published by the desktop host", () => {
    vi.stubGlobal("window", {
      tinyideDesktop: { watcherDefaultIgnoredDirectories: ["desktop-only"] },
    });
    expect(desktopWatcherDefaultIgnoredDirectories()).toEqual(["desktop-only"]);
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
