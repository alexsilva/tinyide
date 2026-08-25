import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readPersistedSession,
  readSession,
  normalizeSession,
  resolveRestoredWorkspace,
  restoreWorkspaceDocuments,
  writeReactSnapshot,
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

afterEach(() => vi.unstubAllGlobals());

describe("layout persistence", () => {
  it("starts with the execution output panel closed", () => {
    expect(readSession()).toMatchObject({
      panelVisible: false,
      panelTab: "output",
      problemsVisible: false,
      problemsWidth: 320,
      leftVerticalPanelWidth: 280,
      rightVerticalPanelWidth: 320,
    });
  });

  it("normalizes independent widths for the two vertical columns", () => {
    expect(normalizeSession({
      sidebarWidth: 290,
      problemsWidth: 410,
      leftVerticalPanelWidth: 360,
      rightVerticalPanelWidth: 470,
    })).toMatchObject({
      leftVerticalPanelWidth: 360,
      rightVerticalPanelWidth: 470,
    });
  });

  it("migrates legacy sidebar and problems widths to each side", () => {
    expect(normalizeSession({
      sidebarWidth: 350,
      problemsWidth: 430,
    })).toMatchObject({
      leftVerticalPanelWidth: 350,
      rightVerticalPanelWidth: 430,
    });
  });

  it("migrates the legacy Problems tab to the dedicated right panel", () => {
    expect(normalizeSession({
      panelVisible: true,
      panelTab: "problems",
      problemsWidth: 410,
    })).toMatchObject({
      panelVisible: false,
      panelTab: "output",
      problemsVisible: true,
      problemsWidth: 410,
    });
  });

  it("does not reopen a persisted profile output until a new or resumed execution", () => {
    expect(normalizeSession({
      panelVisible: true,
      panelTab: "execution-profile:python",
    }).panelVisible).toBe(false);
  });

  it("restores only valid activity button placements", () => {
    expect(normalizeSession({
      activityButtonPlacements: {
        "toolWindow:docker": { side: "right", order: 2 },
        "toolWindow:git": { side: "center", order: 1 },
        "sidebar:git.changes": { side: "left", order: "first" },
      },
    }).activityButtonPlacements).toEqual({
      "toolWindow:docker": { side: "right", order: 2 },
    });
  });

  it("restores the visual session from host persistence", async () => {
    const stored = {
      activityButtonPlacements: {
        "toolWindow:git": { side: "right", order: 7 },
      },
      sidebarViewsBySide: { right: "git.changes" },
      sidebarView: "git.changes",
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(stored), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(readPersistedSession()).resolves.toMatchObject({
      activityButtonPlacements: {
        "toolWindow:git": { side: "right", order: 7 },
      },
      sidebarViewsBySide: { right: "git.changes" },
    });
    expect(fetchMock).toHaveBeenCalled();
  });

  it("isolates the visual session by workspace root", async () => {
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify({
      sidebarView: url.includes("workspace.") ? "git.changes" : "explorer",
      sidebarViewsBySide: url.includes("workspace.") ? { right: "git.changes" } : { left: "explorer" },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const alpha = await readPersistedSession("/workspaces/alpha");
    const alphaUrl = String(fetchMock.mock.calls.at(-1)?.[0]);
    const beta = await readPersistedSession("/workspaces/beta");
    const betaUrl = String(fetchMock.mock.calls.at(-1)?.[0]);

    expect(alpha.sidebarViewsBySide).toEqual({ right: "git.changes" });
    expect(beta.sidebarViewsBySide).toEqual({ right: "git.changes" });
    expect(alphaUrl).toMatch(/\/core-api\/user\/state\/ui-session\.workspace\.[a-f0-9]{64}$/);
    expect(betaUrl).toMatch(/\/core-api\/user\/state\/ui-session\.workspace\.[a-f0-9]{64}$/);
    expect(alphaUrl).not.toBe(betaUrl);
  });

  it("writes the visual session only through host persistence", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => new Response(init?.body as string, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const session = {
      ...readSession(),
      activityButtonPlacements: {
        "toolWindow:docker": { side: "right" as const, order: 4 },
      },
    };

    writeSession(session);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/core-api/user/state/ui-session",
      expect.objectContaining({ method: "PUT", body: JSON.stringify(session) }),
    ));
  });

  it("stores workspace layout separately and keeps the global session as a locator", async () => {
    const writes = new Map<string, unknown>();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PUT") writes.set(url, JSON.parse(String(init.body)));
      return new Response(init?.body as string, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const session = {
      ...readSession(),
      workspaceName: "alpha",
      workspaceRoot: "/workspaces/alpha",
      activityButtonPlacements: {
        "sidebar:git.changes": { side: "right" as const, order: 4 },
      },
      sidebarViewsBySide: { right: "git.changes" },
    };

    writeSession(session);
    await vi.waitFor(() => expect(writes.size).toBe(2));
    const scoped = [...writes.entries()].find(([url]) => url.includes("ui-session.workspace."));
    const locator = writes.get("/core-api/user/state/ui-session") as ReturnType<typeof readSession>;

    expect(scoped?.[1]).toEqual(session);
    expect(locator.workspaceRoot).toBe("/workspaces/alpha");
    expect(locator.sidebarViewsBySide).toEqual({ left: "explorer" });
    expect(locator.activityButtonPlacements).toEqual({});
  });

  it("restores every open vertical panel", () => {
    expect(normalizeSession({
      sidebarVisible: true,
      sidebarView: "plugins",
      sidebarViewsBySide: {
        left: "plugins",
        right: "git.changes",
      },
    })).toMatchObject({
      sidebarVisible: true,
      sidebarViewsBySide: {
        left: "plugins",
        right: "git.changes",
      },
    });
  });

  it("preserves an explicitly closed set of vertical panels", () => {
    expect(normalizeSession({
      sidebarVisible: true,
      sidebarView: "explorer",
      sidebarViewsBySide: {},
    })).toMatchObject({
      sidebarVisible: false,
      sidebarViewsBySide: {},
    });
  });

  it("collapses a view duplicated on both sides to the button side", () => {
    expect(normalizeSession({
      sidebarVisible: true,
      sidebarView: "git.changes",
      sidebarViewsBySide: {
        left: "git.changes",
        right: "git.changes",
      },
      activityButtonPlacements: {
        "sidebar:git.changes": { side: "right", order: 2 },
      },
    }).sidebarViewsBySide).toEqual({ right: "git.changes" });
  });

  it("migrates the legacy single sidebar to its configured side", () => {
    expect(normalizeSession({
      sidebarVisible: true,
      sidebarView: "git.changes",
      activityButtonPlacements: {
        "sidebar:git.changes": { side: "right", order: 2 },
      },
    }).sidebarViewsBySide).toEqual({ right: "git.changes" });
  });
});

describe("workspace pointer precedence on reload", () => {
  function snapshot(workspaceName: string, workspaceRoot?: string) {
    return {
      version: 2 as const,
      workspaceName,
      ...(workspaceRoot ? { workspaceRoot } : {}),
      workspaceEntries: [],
      documents: [],
      diagnostics: [],
      output: [],
    };
  }

  it("reopens the workspace named by the session pointer, not the stale global snapshot", () => {
    const pointer = normalizeSession({ workspaceName: "precocerto", workspaceRoot: "/workspace/precocerto" });

    expect(resolveRestoredWorkspace(pointer, snapshot("tinyIde", "/workspace/tinyIde"))).toEqual({
      workspaceName: "precocerto",
      workspaceRoot: "/workspace/precocerto",
    });
  });

  it("keeps the global snapshot when it belongs to the pointed workspace", () => {
    const pointer = normalizeSession({ workspaceName: "tinyIde", workspaceRoot: "/workspace/tinyIde" });
    const owned = snapshot("tinyIde", "/workspace/tinyIde");

    expect(resolveRestoredWorkspace(pointer, owned).snapshot).toBe(owned);
  });

  it("falls back to the global snapshot while no workspace pointer exists", () => {
    const empty = normalizeSession({});
    const orphan = snapshot("tinyIde", "/workspace/tinyIde");

    expect(resolveRestoredWorkspace(empty, orphan)).toMatchObject({
      workspaceName: "tinyIde",
      workspaceRoot: "/workspace/tinyIde",
    });
    expect(resolveRestoredWorkspace(empty, undefined)).toEqual({ workspaceName: "Sem workspace" });
  });
});

describe("workspace document persistence", () => {
  it("discards the global snapshot once a workspace snapshot is written", async () => {
    vi.resetModules();
    const requests: Array<{ readonly method: string; readonly url: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({ method: init?.method ?? "GET", url: String(url) });
      return new Response(null, { status: 204 });
    }));
    const { writeReactSnapshot: write } = await import("./persistence");

    await write({
      workspaceName: "current",
      workspaceRoot: "/workspace/current",
      workspaceEntries: [],
      documents: [],
      diagnostics: [],
      output: [],
    });

    expect(requests.filter((request) => request.method === "DELETE").map((request) => request.url)).toEqual([
      "/core-api/user/state/application-snapshot",
    ]);
  });


  it("does not duplicate a clean document body in savedContent", async () => {
    let persisted: unknown;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      persisted = JSON.parse(String(init?.body));
      return Response.json(persisted);
    }));
    const clean = document({ content: "large clean body", savedContent: "large clean body" });

    await writeReactSnapshot({
      workspaceName: "current",
      workspaceRoot: "/workspace/current",
      workspaceEntries: [],
      documents: [clean],
      diagnostics: [],
      output: [],
    });

    expect((persisted as { documents: Array<Record<string, unknown>> }).documents[0]).toMatchObject({
      content: "large clean body",
    });
    expect((persisted as { documents: Array<Record<string, unknown>> }).documents[0]).not.toHaveProperty("savedContent");
  });

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
