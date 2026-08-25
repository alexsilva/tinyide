import { describe, expect, it, vi } from "vitest";
import type { ResourceContextMenuProvider } from "@tinyide/plugin-api";
import type { OpenDocument, WorkspaceEntry } from "../../browser-filesystem";
import {
  resourceContextForDocument,
  resourceContextForEntry,
  resourceContextForRoot,
  resourceContextMenuContributions,
  sortContextMenuItems,
} from "./resource-context";

const workspace = { workspaceName: "project", workspaceRoot: "/workspace/project" } as const;

function document(content = "changed", savedContent = "saved"): OpenDocument {
  return {
    id: "src/main.ts",
    name: "main.ts",
    path: "src/main.ts",
    kind: "text",
    mediaType: "text/typescript",
    size: content.length,
    content,
    savedContent,
    selectionStart: 0,
    selectionEnd: 0,
    scrollTop: 0,
    scrollLeft: 0,
  };
}

describe("resource context helpers", () => {
  it("builds a root resource without exposing the sentinel workspace name", () => {
    expect(resourceContextForRoot(workspace)).toEqual({
      kind: "directory",
      name: "project",
      path: "",
      workspaceName: "project",
      workspaceRoot: "/workspace/project",
    });
    expect(resourceContextForRoot({ workspaceName: "Sem workspace" })).toEqual({
      kind: "directory",
      name: "Sem workspace",
      path: "",
    });
  });

  it("associates explorer resources with open dirty documents", () => {
    const entry: WorkspaceEntry = { name: "main.ts", path: "src/main.ts", kind: "file" };
    expect(resourceContextForEntry(entry, [document()], workspace)).toMatchObject({
      kind: "file",
      path: "src/main.ts",
      documentId: "src/main.ts",
      workspaceName: "project",
      isDirty: true,
    });
  });

  it("builds document resources and orders only enabled menu items", () => {
    expect(resourceContextForDocument(document("same", "same"), workspace)).toMatchObject({
      path: "src/main.ts",
      isDirty: false,
    });
    const sorted = sortContextMenuItems([
      { id: "delete", label: "Delete", group: "destructive", order: 0 },
      { id: "disabled", label: "Disabled", group: "navigation", enabled: false },
      { id: "open-2", label: "Open 2", group: "navigation", order: 20 },
      { id: "open-1", label: "Open 1", group: "navigation", order: 10 },
    ], { navigation: 0, destructive: 300 });
    expect(sorted.map((item) => item.id)).toEqual(["open-1", "open-2", "delete"]);
  });

  it("isolates failing context-menu providers while preserving the others", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const providers: readonly ResourceContextMenuProvider[] = [
      {
        id: "sync",
        provideItems: () => [{ id: "sync.item", label: "Sync" }],
      },
      {
        id: "async",
        provideItems: async () => [{ id: "async.item", label: "Async" }],
      },
      {
        id: "broken",
        provideItems: async () => {
          throw new Error("broken provider");
        },
      },
    ];

    const items = await resourceContextMenuContributions(providers, resourceContextForRoot(workspace));

    expect(items.map((item) => item.id)).toEqual(["sync.item", "async.item"]);
    expect(warn).toHaveBeenCalledWith(
      "Falha ao obter itens do menu de contexto pelo provider 'broken'.",
      expect.any(Error),
    );
    warn.mockRestore();
  });
});
