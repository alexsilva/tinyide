import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readPersistedSession,
  readSession,
  restoreWorkspaceDocuments,
  writeSession,
  workspaceDocumentsForSnapshot,
} from "./persistence";
import type {
  BrowserDirectoryHandle,
  BrowserFileHandle,
  OpenDocument,
} from "../browser-filesystem";

function document(overrides: Partial<OpenDocument> = {}): OpenDocument {
  return {
    id: "src/main.py",
    name: "main.py",
    path: "src/main.py",
    workspaceRoot: "/workspace/current",
    kind: "text",
    mediaType: "text/plain",
    size: 11,
    content: "print('ok')",
    savedContent: "print('ok')",
    selectionStart: 0,
    selectionEnd: 0,
    scrollTop: 0,
    scrollLeft: 0,
    ...overrides,
  };
}

function detachedDocument(id: string): OpenDocument {
  const { path: _path, workspaceRoot: _workspaceRoot, ...detached } = document({ id });
  return detached;
}

function legacyWorkspaceDocument(overrides: Partial<OpenDocument> = {}): OpenDocument {
  const { workspaceRoot: _workspaceRoot, ...legacy } = document(overrides);
  return legacy;
}

function fileHandle(name: string): BrowserFileHandle {
  return {
    kind: "file",
    name,
    async getFile() { return new File(["content"], name); },
    async createWritable() { throw new Error("unused"); },
  };
}

function directoryHandle(
  name: string,
  children: readonly (BrowserDirectoryHandle | BrowserFileHandle)[],
): BrowserDirectoryHandle {
  return {
    kind: "directory",
    name,
    async *values() { yield* children; },
    async getFileHandle(childName) {
      const child = children.find((item) => item.kind === "file" && item.name === childName);
      if (!child || child.kind !== "file") throw new Error("missing file");
      return child;
    },
    async getDirectoryHandle(childName) {
      const child = children.find((item) => item.kind === "directory" && item.name === childName);
      if (!child || child.kind !== "directory") throw new Error("missing directory");
      return child;
    },
  };
}

function localStorageWith(session?: unknown): Storage {
  const values = new Map<string, string>();
  if (session !== undefined) values.set("tinyide.react.session.v2", JSON.stringify(session));
  return {
    get length() { return values.size; },
    clear() { values.clear(); },
    getItem(key) { return values.get(key) ?? null; },
    key(index) { return [...values.keys()][index] ?? null; },
    removeItem(key) { values.delete(key); },
    setItem(key, value) { values.set(key, value); },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("layout persistence", () => {
  it("starts with the execution output panel closed", () => {
    vi.stubGlobal("localStorage", localStorageWith());
    expect(readSession()).toMatchObject({
      panelVisible: false,
      panelTab: "output",
      problemsVisible: false,
      problemsWidth: 320,
      leftVerticalPanelWidth: 280,
      rightVerticalPanelWidth: 320,
    });
  });

  it("restores independent widths for the two vertical columns", () => {
    vi.stubGlobal("localStorage", localStorageWith({
      sidebarWidth: 290,
      problemsWidth: 410,
      leftVerticalPanelWidth: 360,
      rightVerticalPanelWidth: 470,
    }));
    expect(readSession()).toMatchObject({
      leftVerticalPanelWidth: 360,
      rightVerticalPanelWidth: 470,
    });
  });

  it("migrates legacy sidebar and problems widths to each side", () => {
    vi.stubGlobal("localStorage", localStorageWith({
      sidebarWidth: 350,
      problemsWidth: 430,
    }));
    expect(readSession()).toMatchObject({
      leftVerticalPanelWidth: 350,
      rightVerticalPanelWidth: 430,
    });
  });

  it("migrates the legacy Problems tab to the dedicated right panel", () => {
    vi.stubGlobal("localStorage", localStorageWith({
      panelVisible: true,
      panelTab: "problems",
      problemsWidth: 410,
    }));
    expect(readSession()).toMatchObject({
      panelVisible: false,
      panelTab: "output",
      problemsVisible: true,
      problemsWidth: 410,
    });
  });

  it("does not reopen a persisted profile output until a new or resumed execution", () => {
    vi.stubGlobal("localStorage", localStorageWith({
      panelVisible: true,
      panelTab: "execution-profile:python",
    }));
    expect(readSession().panelVisible).toBe(false);
  });

  it("restores only valid activity button placements", () => {
    vi.stubGlobal("localStorage", localStorageWith({
      activityButtonPlacements: {
        "toolWindow:docker": { side: "right", order: 2 },
        "toolWindow:git": { side: "center", order: 1 },
        "sidebar:git.changes": { side: "left", order: "first" },
      },
    }));

    expect(readSession().activityButtonPlacements).toEqual({
      "toolWindow:docker": { side: "right", order: 2 },
    });
  });

  it("restores the desktop session independently from the runtime origin", async () => {
    vi.stubGlobal("localStorage", localStorageWith({
      activityButtonPlacements: {
        "toolWindow:git": { side: "left", order: 1 },
      },
    }));
    const readState = vi.fn(async () => ({
      activityButtonPlacements: {
        "toolWindow:git": { side: "right", order: 7 },
      },
      sidebarViewsBySide: { right: "git.changes" },
      sidebarView: "git.changes",
    }));
    vi.stubGlobal("window", { tinyideDesktop: { readState } });

    await expect(readPersistedSession()).resolves.toMatchObject({
      activityButtonPlacements: {
        "toolWindow:git": { side: "right", order: 7 },
      },
      sidebarViewsBySide: { right: "git.changes" },
    });
    expect(readState).toHaveBeenCalledWith("ui-session");
  });

  it("writes the visual session to both browser and stable desktop storage", async () => {
    const storage = localStorageWith();
    vi.stubGlobal("localStorage", storage);
    const writeState = vi.fn(async () => true);
    vi.stubGlobal("window", { tinyideDesktop: { writeState } });
    const session = {
      ...readSession(),
      activityButtonPlacements: {
        "toolWindow:docker": { side: "right" as const, order: 4 },
      },
    };

    writeSession(session);
    await vi.waitFor(() => expect(writeState).toHaveBeenCalledWith("ui-session", session));
    expect(JSON.parse(storage.getItem("tinyide.react.session.v2") ?? "null"))
      .toMatchObject(session);
  });

  it("restores every open vertical panel", () => {
    vi.stubGlobal("localStorage", localStorageWith({
      sidebarVisible: true,
      sidebarView: "plugins",
      sidebarViewsBySide: {
        left: "plugins",
        right: "git.changes",
      },
    }));

    expect(readSession()).toMatchObject({
      sidebarVisible: true,
      sidebarViewsBySide: {
        left: "plugins",
        right: "git.changes",
      },
    });
  });

  it("preserves an explicitly closed set of vertical panels", () => {
    vi.stubGlobal("localStorage", localStorageWith({
      sidebarVisible: true,
      sidebarView: "explorer",
      sidebarViewsBySide: {},
    }));

    expect(readSession()).toMatchObject({
      sidebarVisible: false,
      sidebarViewsBySide: {},
    });
  });

  it("migrates the legacy single sidebar to its configured side", () => {
    vi.stubGlobal("localStorage", localStorageWith({
      sidebarVisible: true,
      sidebarView: "git.changes",
      activityButtonPlacements: {
        "sidebar:git.changes": { side: "right", order: 2 },
      },
    }));

    expect(readSession().sidebarViewsBySide).toEqual({ right: "git.changes" });
  });
});

describe("workspace document persistence", () => {
  it("persists only documents explicitly owned by the current workspace", () => {
    const current = document();
    const other = document({ id: "other.py", path: "other.py", workspaceRoot: "/workspace/other" });
    const external = detachedDocument("file:external.py");
    const untitled = detachedDocument("untitled:1");

    expect(workspaceDocumentsForSnapshot(
      [current, other, external, untitled],
      "/workspace/current",
    )).toEqual([current]);
    expect(workspaceDocumentsForSnapshot([current], undefined)).toEqual([]);
  });

  it("restores matching documents and resolves their handles from the workspace", async () => {
    const main = fileHandle("main.py");
    const source = directoryHandle("src", [main]);
    const root = directoryHandle("workspace", [source]);
    const restored = await restoreWorkspaceDocuments([
      document(),
      document({ id: "other.py", path: "other.py", workspaceRoot: "/workspace/other" }),
      document({ id: "missing.py", path: "missing.py" }),
      detachedDocument("external"),
    ], "/workspace/current", root);

    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({
      id: "src/main.py",
      workspaceRoot: "/workspace/current",
      handle: main,
    });
  });

  it("does not restore legacy documents without a workspace handle", async () => {
    expect(await restoreWorkspaceDocuments([
      legacyWorkspaceDocument(),
      legacyWorkspaceDocument({ id: "owned.py", path: "owned.py" }),
    ], "/workspace/current")).toEqual([]);
  });

  it("restores cached workspace text without calling a stale persisted file handle", async () => {
    const getFile = vi.fn(async () => {
      throw new DOMException(
        "The request is not allowed by the user agent or the platform in the current context.",
        "NotAllowedError",
      );
    });
    const staleHandle: BrowserFileHandle = {
      kind: "file",
      name: "main.py",
      getFile,
      async createWritable() { throw new Error("unused"); },
    };

    const restored = await restoreWorkspaceDocuments([
      document({ handle: staleHandle }),
    ], "/workspace/current");

    expect(getFile).not.toHaveBeenCalled();
    expect(restored[0]).toMatchObject({
      id: "src/main.py",
      path: "src/main.py",
      content: "print('ok')",
    });
    expect(restored[0]?.handle).toBeUndefined();
  });
});
