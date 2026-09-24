import { describe, expect, it, vi } from "vitest";
import {
  readFileDocument,
  type BrowserDirectoryHandle,
  type BrowserFileHandle,
  type OpenDocument,
} from "../browser-filesystem";
import {
  assertWorkspaceResourcePath,
  isSafeWorkspaceResourcePath,
  reconcileOpenDocumentsAfterWorkspaceChange,
} from "./workspace-resource-reconciliation";

function fileHandle(name: string, content: BlobPart = "content", type = ""): BrowserFileHandle {
  return {
    kind: "file",
    name,
    getFile: async () => new File([content], name, {type}),
    createWritable: async () => ({write: async () => undefined, close: async () => undefined}),
  };
}

function directoryHandle(name: string, children: readonly (BrowserFileHandle | BrowserDirectoryHandle)[]): BrowserDirectoryHandle {
  const directories = new Map(children.filter((child): child is BrowserDirectoryHandle => child.kind === "directory").map((child) => [child.name, child]));
  const files = new Map(children.filter((child): child is BrowserFileHandle => child.kind === "file").map((child) => [child.name, child]));
  return {
    kind: "directory",
    name,
    async *values() { yield* children; },
    getFileHandle: async (childName) => {
      const child = files.get(childName);
      if (!child) throw new Error(`missing file: ${childName}`);
      return child;
    },
    getDirectoryHandle: async (childName) => {
      const child = directories.get(childName);
      if (!child) throw new Error(`missing directory: ${childName}`);
      return child;
    },
  };
}

async function openDocument(path: string, content: string): Promise<OpenDocument> {
  return readFileDocument(fileHandle(path.split("/").at(-1) ?? path, content), path, "/workspace");
}

describe("workspace resource reconciliation", () => {
  it("accepts only normalized workspace-relative resource paths", () => {
    expect(isSafeWorkspaceResourcePath("src/main.py")).toBe(true);
    for (const unsafe of ["", "../main.py", "./main.py", "src//main.py", "src\\main.py"]) {
      expect(isSafeWorkspaceResourcePath(unsafe)).toBe(false);
      expect(() => assertWorkspaceResourcePath(unsafe)).toThrow("Caminho de recurso inválido.");
    }
    expect(() => assertWorkspaceResourcePath("src/main.py")).not.toThrow();
  });

  it("keeps untitled documents untouched during filesystem reconciliation", async () => {
    const document = await openDocument("src/main.py", "same\n");
    const {path: _path, ...withoutPath} = document;
    const untitled: OpenDocument = {...withoutPath, id: "untitled:1", name: "Untitled"};
    const root = directoryHandle("root", []);

    const result = await reconcileOpenDocumentsAfterWorkspaceChange({
      documents: [untitled],
      workspaceHandle: root,
      paths: ["src/main.py"],
    });

    expect(result.documents).toEqual([untitled]);
    expect(result.removedIds).toEqual([]);
  });

  it("reloads clean documents and closes files removed by reset --hard", async () => {
    const changed = await openDocument("src/changed.py", "old\n");
    const removed = await openDocument("src/removed.py", "removed\n");
    const root = directoryHandle("root", [
      directoryHandle("src", [fileHandle("changed.py", "new\n")]),
    ]);

    const result = await reconcileOpenDocumentsAfterWorkspaceChange({
      documents: [changed, removed],
      workspaceHandle: root,
      workspaceRoot: "/workspace",
    });

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]).toMatchObject({
      id: "src/changed.py",
      content: "new\n",
      savedContent: "new\n",
    });
    expect(result.removedIds).toEqual(["src/removed.py"]);
    expect(result.externalChanges).toEqual([
      {id: "src/changed.py", path: "src/changed.py", kind: "reloaded"},
    ]);
  });

  it("remaps an open tab from an explicit Git rename", async () => {
    const document = await openDocument("src/old.py", "print('ok')\n");
    const root = directoryHandle("root", [
      directoryHandle("src", [fileHandle("new.py", "print('changed')\n")]),
    ]);

    const result = await reconcileOpenDocumentsAfterWorkspaceChange({
      documents: [document],
      workspaceHandle: root,
      workspaceRoot: "/workspace",
      renames: [{from: "src/old.py", to: "src/new.py"}],
    });

    expect(result.documents[0]).toMatchObject({
      id: "src/new.py",
      path: "src/new.py",
      name: "new.py",
      content: "print('changed')\n",
    });
    expect(result.remappedIds).toEqual([{from: "src/old.py", to: "src/new.py"}]);
    expect(result.removedIds).toEqual([]);
    expect(result.externalChanges).toEqual([
      {id: "src/new.py", path: "src/new.py", kind: "reloaded"},
    ]);
  });

  it("closes a missing tab when no explicit rename is supplied", async () => {
    const document = await openDocument("src/main.py", "print('same')\n");
    const root = directoryHandle("root", [
      directoryHandle("lib", [fileHandle("main.py", "print('same')\n")]),
    ]);

    const result = await reconcileOpenDocumentsAfterWorkspaceChange({
      documents: [document],
      workspaceHandle: root,
      workspaceRoot: "/workspace",
    });

    expect(result.documents).toEqual([]);
    expect(result.removedIds).toEqual(["src/main.py"]);
    expect(result.remappedIds).toEqual([]);
    expect(result.externalChanges).toEqual([]);
  });

  it("preserves unsaved editor content while updating the disk baseline", async () => {
    const original = await openDocument("src/main.py", "disk-old\n");
    const dirty: OpenDocument = {...original, content: "editor-unsaved\n"};
    const root = directoryHandle("root", [
      directoryHandle("src", [fileHandle("main.py", "disk-reset\n")]),
    ]);

    const result = await reconcileOpenDocumentsAfterWorkspaceChange({
      documents: [dirty],
      workspaceHandle: root,
      workspaceRoot: "/workspace",
    });

    expect(result.documents[0]).toMatchObject({
      content: "editor-unsaved\n",
      savedContent: "disk-reset\n",
    });
    expect(result.externalChanges).toEqual([
      {id: "src/main.py", path: "src/main.py", kind: "conflict"},
    ]);
  });

  it("does not report an external change when disk content is unchanged", async () => {
    const document = await openDocument("src/main.py", "same\n");
    const root = directoryHandle("root", [
      directoryHandle("src", [fileHandle("main.py", "same\n")]),
    ]);

    const result = await reconcileOpenDocumentsAfterWorkspaceChange({
      documents: [document],
      workspaceHandle: root,
      workspaceRoot: "/workspace",
    });

    expect(result.externalChanges).toEqual([]);
  });

  it("reconciles only open documents affected by watcher paths", async () => {
    const documents = await Promise.all(Array.from({length: 500}, (_, index) => (
      openDocument(`doc-${index}.txt`, `saved-${index}\n`)
    )));
    const rawRoot = directoryHandle("root", Array.from({length: 500}, (_, index) => (
      fileHandle(
        `doc-${index}.txt`,
        index === 321 ? "changed-on-disk\n" : `saved-${index}\n`,
      )
    )));
    const getFileHandle = vi.fn(rawRoot.getFileHandle);
    const root: BrowserDirectoryHandle = {...rawRoot, getFileHandle};

    const result = await reconcileOpenDocumentsAfterWorkspaceChange({
      documents,
      workspaceHandle: root,
      workspaceRoot: "/workspace",
      paths: ["doc-321.txt"],
    });

    expect(getFileHandle).toHaveBeenCalledTimes(1);
    expect(getFileHandle).toHaveBeenCalledWith("doc-321.txt");
    expect(result.documents[320]).toBe(documents[320]);
    expect(result.documents[321]?.content).toBe("changed-on-disk\n");
    expect(result.documents[322]).toBe(documents[322]);
    expect(result.externalChanges).toEqual([
      {id: "doc-321.txt", path: "doc-321.txt", kind: "reloaded"},
    ]);
  });

});
