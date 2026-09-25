import { describe, expect, it, vi } from "vitest";
import type { BrowserDirectoryHandle, WorkspaceEntry } from "../../browser-filesystem";
import {
  hydrateExpandedEntries,
  hydrateExplorerPath,
  refreshExpandedEntriesAfterChanges,
} from "./hydration";

const handle = {} as BrowserDirectoryHandle;

function file(path: string): WorkspaceEntry {
  return { name: path.split("/").at(-1)!, path, kind: "file", handle: {} as never };
}

function directory(path: string, children?: readonly WorkspaceEntry[]): WorkspaceEntry {
  return { name: path.split("/").at(-1)!, path, kind: "directory", handle, ...(children ? { children } : {}) };
}

function tree() {
  const libChildren = [file("src/lib/a.ts"), file("src/lib/b.ts")];
  const srcChildren = [directory("src/lib", libChildren), file("src/main.ts")];
  const docsChildren = [file("docs/readme.md")];
  return {
    entries: [directory("src", srcChildren), directory("docs", docsChildren)],
    srcChildren,
    libChildren,
    docsChildren,
  };
}

describe("explorer hydration", () => {
  it("refreshes only the expanded parent of a changed nested resource", async () => {
    const current = tree();
    const calls: string[] = [];
    const list = vi.fn(async (_handle: BrowserDirectoryHandle, parentPath = "") => {
      calls.push(parentPath);
      if (parentPath === "src/lib") return [file("src/lib/a.ts"), file("src/lib/new.ts")];
      throw new Error(`unexpected listDirectory(${parentPath})`);
    });

    const next = await refreshExpandedEntriesAfterChanges(
      handle,
      current.entries,
      new Set(["src", "src/lib", "docs"]),
      ["src/lib/a.ts"],
      list,
    );

    expect(calls).toEqual(["src/lib"]);
    expect(next[0]?.children?.[0]?.children?.map((entry) => entry.path)).toEqual([
      "src/lib/a.ts",
      "src/lib/new.ts",
    ]);
    expect(next[1]?.children).toBe(current.docsChildren);
    expect(next[1]).toBe(current.entries[1]);
  });

  it("walks up to the nearest known parent when a new nested directory was not in the tree yet", async () => {
    const current = tree();
    const calls: string[] = [];
    const list = vi.fn(async (_handle: BrowserDirectoryHandle, parentPath = "") => {
      calls.push(parentPath);
      if (parentPath === "src") {
        return [
          directory("src/lib", current.libChildren),
          directory("src/generated"),
          file("src/main.ts"),
        ];
      }
      throw new Error(`unexpected listDirectory(${parentPath})`);
    });

    const next = await refreshExpandedEntriesAfterChanges(
      handle,
      current.entries,
      new Set(["src", "src/lib", "docs"]),
      ["src/generated/new/file.ts"],
      list,
    );

    expect(calls).toEqual(["src"]);
    expect(next[0]?.children?.map((entry) => entry.path)).toEqual([
      "src/lib",
      "src/generated",
      "src/main.ts",
    ]);
    expect(next[1]).toBe(current.entries[1]);
  });

  it("also relists a known expanded directory reported as the change itself", async () => {
    const current = tree();
    const calls: string[] = [];
    const list = vi.fn(async (_handle: BrowserDirectoryHandle, parentPath = "") => {
      calls.push(parentPath);
      if (parentPath === "src") return current.srcChildren;
      if (parentPath === "src/lib") return [file("src/lib/a.ts"), file("src/lib/added.ts")];
      throw new Error(`unexpected listDirectory(${parentPath})`);
    });

    const next = await refreshExpandedEntriesAfterChanges(
      handle,
      current.entries,
      new Set(["src", "src/lib", "docs"]),
      ["src/lib"],
      list,
    );

    expect(calls).toEqual(["src", "src/lib"]);
    expect(next[0]?.children?.[0]?.children?.map((entry) => entry.path)).toEqual([
      "src/lib/a.ts",
      "src/lib/added.ts",
    ]);
    expect(next[1]).toBe(current.entries[1]);
  });

  it("refreshes the root without rescanning unrelated expanded branches", async () => {
    const current = tree();
    const calls: string[] = [];
    const list = vi.fn(async (_handle: BrowserDirectoryHandle, parentPath = "") => {
      calls.push(parentPath);
      if (parentPath === "") {
        return [directory("src"), directory("docs"), file("root-added.txt")];
      }
      throw new Error(`unexpected listDirectory(${parentPath})`);
    });

    const next = await refreshExpandedEntriesAfterChanges(
      handle,
      current.entries,
      new Set(["src", "src/lib", "docs"]),
      ["root-added.txt"],
      list,
    );

    expect(calls).toEqual([""]);
    expect(next.map((entry) => entry.path)).toEqual(["src", "docs", "root-added.txt"]);
    expect(next[0]?.children).toBe(current.srcChildren);
    expect(next[1]?.children).toBe(current.docsChildren);
  });

  it("keeps the full refresh path for an unknown change set", async () => {
    const current = tree();
    const calls: string[] = [];
    const list = vi.fn(async (_handle: BrowserDirectoryHandle, parentPath = "") => {
      calls.push(parentPath);
      if (parentPath === "") return [directory("src"), directory("docs")];
      if (parentPath === "src") return current.srcChildren;
      if (parentPath === "src/lib") return current.libChildren;
      if (parentPath === "docs") return current.docsChildren;
      return [];
    });

    await refreshExpandedEntriesAfterChanges(
      handle,
      current.entries,
      new Set(["src", "src/lib", "docs"]),
      [],
      list,
    );

    expect(calls).toEqual(["", "src", "docs", "src/lib"]);
  });

  it("hydrates all expanded branches when explicitly requested", async () => {
    const root = [directory("src"), directory("docs")];
    const calls: string[] = [];
    const list = vi.fn(async (_handle: BrowserDirectoryHandle, parentPath = "") => {
      calls.push(parentPath);
      if (parentPath === "src") return [file("src/a.ts")];
      if (parentPath === "docs") return [file("docs/a.md")];
      return [];
    });

    await hydrateExpandedEntries(root, new Set(["src", "docs"]), list);
    expect(calls).toEqual(["src", "docs"]);
  });

  it("hydrates only the ancestor chain needed to reveal one resource", async () => {
    const root = [directory("src"), directory("docs", [file("docs/readme.md")])];
    const docs = root[1]?.children;
    const calls: string[] = [];
    const list = vi.fn(async (_handle: BrowserDirectoryHandle, parentPath = "") => {
      calls.push(parentPath);
      if (parentPath === "src") return [directory("src/lib"), file("src/main.ts")];
      if (parentPath === "src/lib") return [file("src/lib/target.ts")];
      throw new Error(`unexpected listDirectory(${parentPath})`);
    });

    const next = await hydrateExplorerPath(root, "src/lib/target.ts", list);

    expect(calls).toEqual(["src", "src/lib"]);
    expect(next[0]?.children?.[0]?.children?.[0]?.path).toBe("src/lib/target.ts");
    expect(next[1]?.children).toBe(docs);
  });
});
