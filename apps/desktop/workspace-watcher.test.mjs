import {EventEmitter} from "node:events";
import {mkdtemp, mkdir, rm, writeFile} from "node:fs/promises";
import {createRequire} from "node:module";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, describe, expect, it, vi} from "vitest";

const require = createRequire(import.meta.url);
const {
  createGitignoreFilter,
  createWorkspaceWatcher,
  DEFAULT_IGNORED_DIRECTORIES,
  ignoredWorkspacePath,
  workspaceRelativePath,
} = require("./workspace-watcher.cjs");

function gitignoreFilter(root, files) {
  return createGitignoreFilter(root, {readGitignore: (path) => files[path]});
}

const temporaryRoots = [];

afterEach(async () => {
  while (temporaryRoots.length > 0) {
    await rm(temporaryRoots.pop(), {recursive: true, force: true});
  }
});

describe("desktop workspace watcher", () => {
  it("normalizes workspace paths and ignores Git internals", () => {
    expect(workspaceRelativePath("/workspace", "/workspace/src/main.ts")).toBe("src/main.ts");
    expect(workspaceRelativePath("/workspace", "/outside/main.ts")).toBe("");
    expect(ignoredWorkspacePath("/workspace", "/workspace/.git/index")).toBe(true);
    expect(ignoredWorkspacePath("/workspace", "/workspace/src/main.ts")).toBe(false);
  });

  it("ignores heavy dependency/build directories", () => {
    expect(ignoredWorkspacePath("/workspace", "/workspace/node_modules/pkg/index.js")).toBe(true);
    expect(ignoredWorkspacePath("/workspace", "/workspace/dist/bundle.js")).toBe(true);
    expect(ignoredWorkspacePath("/workspace", "/workspace/.tmp/performance-workspace/file.txt")).toBe(true);
    expect(ignoredWorkspacePath("/workspace", "/workspace/.venv/lib/site-packages/x.py")).toBe(true);
    expect(ignoredWorkspacePath("/workspace", "/workspace/src/node_modules_helper.ts")).toBe(false);
    expect(DEFAULT_IGNORED_DIRECTORIES).toContain(".tmp");
  });

  it("supports wildcard patterns in extra ignored directories", () => {
    const extraIgnored = new Set([".*"]);
    expect(ignoredWorkspacePath("/workspace", "/workspace/.directory/x.txt", extraIgnored)).toBe(true);
    expect(ignoredWorkspacePath("/workspace", "/workspace/.env", extraIgnored)).toBe(true);
    expect(ignoredWorkspacePath("/workspace", "/workspace/src/main.ts", extraIgnored)).toBe(false);
  });

  it("poda pelo .gitignore do projeto, inclusive em nível aninhado", () => {
    const gitignore = gitignoreFilter("/workspace", {
      "/workspace/.gitignore": "*.log\n/tmp\ndocs/**/rascunho\n",
      "/workspace/backend/.gitignore": "precocerto/media/\n!precocerto/media/README.md\n",
    });

    expect(gitignore.ignores("backend/precocerto/media/uploads/nota.pdf")).toBe(true);
    expect(gitignore.ignores("backend/precocerto/media/README.md")).toBe(false);
    expect(gitignore.ignores("backend/precocerto/core/views.py")).toBe(false);
    // Sem barra no padrão, casa em qualquer nível; com barra, só onde ancorado.
    expect(gitignore.ignores("backend/logs/app.log")).toBe(true);
    expect(gitignore.ignores("tmp/x")).toBe(true);
    expect(gitignore.ignores("backend/tmp/x")).toBe(false);
    expect(gitignore.ignores("docs/api/v2/rascunho/notas.md")).toBe(true);
  });

  it("combina .gitignore com a lista fixa de diretórios pesados", () => {
    const gitignore = gitignoreFilter("/workspace", {"/workspace/.gitignore": "media/\n"});

    expect(ignoredWorkspacePath("/workspace", "/workspace/media/foto.png", undefined, gitignore)).toBe(true);
    expect(ignoredWorkspacePath("/workspace", "/workspace/src/main.ts", undefined, gitignore)).toBe(false);
    // Sem filtro, o comportamento antigo continua valendo.
    expect(ignoredWorkspacePath("/workspace", "/workspace/media/foto.png")).toBe(false);
  });

  it("reavalia o .gitignore quando ele muda no disco", async () => {
    vi.useFakeTimers();
    const watcher = new EventEmitter();
    watcher.close = vi.fn(async () => undefined);
    const invalidate = vi.fn();
    createWorkspaceWatcher("/workspace", vi.fn(), {
      watch: () => watcher,
      debounceMs: 10,
      gitignore: {invalidate, ignores: () => false},
    });

    watcher.emit("all", "change", join("/workspace", "src", "main.ts"));
    expect(invalidate).not.toHaveBeenCalled();
    watcher.emit("all", "change", join("/workspace", "backend", ".gitignore"));
    expect(invalidate).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("não observa subárvore ignorada pelo git, mas observa o resto", async () => {
    const root = await mkdtemp(join(tmpdir(), "tinyide-watcher-"));
    temporaryRoots.push(root);
    await writeFile(join(root, ".gitignore"), "media/\n");
    await mkdir(join(root, "media"), {recursive: true});
    await mkdir(join(root, "src"), {recursive: true});
    const batches = [];
    const watcher = createWorkspaceWatcher(root, (paths) => batches.push(...paths), {debounceMs: 20});
    // O watcher do chokidar precisa concluir a varredura inicial antes de ver eventos.
    await new Promise((resolve) => setTimeout(resolve, 500));

    await writeFile(join(root, "media", "foto.png"), "x");
    await writeFile(join(root, "src", "main.ts"), "y");
    await new Promise((resolve) => setTimeout(resolve, 800));
    await watcher.close();

    expect(batches).toContain("src/main.ts");
    expect(batches.some((path) => path.startsWith("media/"))).toBe(false);
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
