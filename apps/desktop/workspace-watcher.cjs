const chokidar = require("chokidar");
const {relative, resolve, sep} = require("node:path");

function workspaceRelativePath(root, changedPath) {
  const path = relative(resolve(root), resolve(changedPath));
  if (!path || path === ".." || path.startsWith(`..${sep}`)) return "";
  return path.split(sep).join("/");
}

function ignoredWorkspacePath(root, changedPath) {
  const path = workspaceRelativePath(root, changedPath);
  return path.split("/").includes(".git");
}

function createWorkspaceWatcher(root, onChanges, options = {}) {
  const watch = options.watch ?? chokidar.watch;
  const debounceMs = options.debounceMs ?? 120;
  const schedule = options.schedule ?? setTimeout;
  const cancel = options.cancel ?? clearTimeout;
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
    ignored: (path) => ignoredWorkspacePath(root, path),
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

module.exports = {
  createWorkspaceWatcher,
  ignoredWorkspacePath,
  workspaceRelativePath,
};
