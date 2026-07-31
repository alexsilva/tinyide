import {EventEmitter} from "node:events";
import {createRequire} from "node:module";
import {join} from "node:path";
import {describe, expect, it, vi} from "vitest";

const require = createRequire(import.meta.url);
const {
  createWorkspaceWatcher,
  ignoredWorkspacePath,
  workspaceRelativePath,
} = require("./workspace-watcher.cjs");

describe("desktop workspace watcher", () => {
  it("normalizes workspace paths and ignores Git internals", () => {
    expect(workspaceRelativePath("/workspace", "/workspace/src/main.ts")).toBe("src/main.ts");
    expect(workspaceRelativePath("/workspace", "/outside/main.ts")).toBe("");
    expect(ignoredWorkspacePath("/workspace", "/workspace/.git/index")).toBe(true);
    expect(ignoredWorkspacePath("/workspace", "/workspace/src/main.ts")).toBe(false);
  });

  it("batches external file changes and stops cleanly", async () => {
    vi.useFakeTimers();
    const watcher = new EventEmitter();
    watcher.close = vi.fn(async () => undefined);
    const watch = vi.fn(() => watcher);
    const onChanges = vi.fn();
    const subscription = createWorkspaceWatcher("/workspace", onChanges, {watch, debounceMs: 100});

    watcher.emit("all", "change", join("/workspace", "src", "main.ts"));
    watcher.emit("all", "add", join("/workspace", "src", "new.ts"));
    await vi.advanceTimersByTimeAsync(100);

    expect(onChanges).toHaveBeenCalledWith(["src/main.ts", "src/new.ts"]);
    await subscription.close();
    expect(watcher.close).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
