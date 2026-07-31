const chokidar = require("chokidar");
const {relative, resolve, sep} = require("node:path");

const IGNORED_DIRECTORIES = new Set([
  ".cache",
  ".git",
  ".idea",
  ".mypy_cache",
  ".next",
  ".nuxt",
  ".pytest_cache",
  ".svelte-kit",
  ".tox",
  ".tinyide",
  ".venv",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "release",
  "site",
  "target",
  "venv",
]);

function workspaceRelativePath(root, changedPath) {
  const path = relative(resolve(root), resolve(changedPath));
  if (!path || path === ".." || path.startsWith(`..${sep}`)) return "";
  return path.split(sep).join("/");
}

function globToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function matchesIgnoredName(segment, name) {
  if (!name.includes("*")) return segment === name;
  return globToRegExp(name).test(segment);
}

function ignoredWorkspacePath(root, changedPath, extraIgnored) {
  const path = workspaceRelativePath(root, changedPath);
  return path.split("/").some(
    (segment) =>
      IGNORED_DIRECTORIES.has(segment) ||
      [...(extraIgnored ?? [])].some((name) => matchesIgnoredName(segment, name)),
  );
}

function createWorkspaceWatcher(root, onChanges, options = {}) {
  const watch = options.watch ?? chokidar.watch;
  const debounceMs = options.debounceMs ?? 120;
  const schedule = options.schedule ?? setTimeout;
  const cancel = options.cancel ?? clearTimeout;
  const extraIgnored = new Set(
    (options.extraIgnoredDirectories ?? []).filter((name) => typeof name === "string" && name.trim()),
  );
  const pending = new Set();
  let timer;
  let closed = false;

  const flush = () => {
    timer = undefined;
    if (closed || pending.size === 0) return;
    const paths = [...pending].sort();
    pending.clear();
    onChanges(paths);
  };
  const watcher = watch(root, {
    ignoreInitial: true,
    ignored: (path) => ignoredWorkspacePath(root, path, extraIgnored),
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 25,
    },
  });
  watcher.on("all", (_event, changedPath) => {
    const path = workspaceRelativePath(root, changedPath);
    if (!path) return;
    pending.add(path);
    if (timer !== undefined) cancel(timer);
    timer = schedule(flush, debounceMs);
  });

  return {
    async close() {
      closed = true;
      if (timer !== undefined) cancel(timer);
      pending.clear();
      await watcher.close();
    },
  };
}

const DEFAULT_IGNORED_DIRECTORIES = [...IGNORED_DIRECTORIES].sort();

module.exports = {
  createWorkspaceWatcher,
  ignoredWorkspacePath,
  workspaceRelativePath,
  DEFAULT_IGNORED_DIRECTORIES,
};
