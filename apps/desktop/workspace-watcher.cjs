const chokidar = require("chokidar");
const {readFileSync} = require("node:fs");
const {join, relative, resolve, sep} = require("node:path");

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
  ".tmp",
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

const ANY_DEPTH = "\u0000";

/**
 * Subset de `.gitignore` suficiente para podar o watcher: curingas de um nível
 * (`*`, `?`), `**`, ancoragem por barra e negação com `!`. Classes de caractere
 * (`[a-z]`) ficam de fora — o padrão simplesmente deixa de podar, nunca poda
 * demais.
 */
function compileGitignoreRule(line) {
  let pattern = line.trim();
  if (!pattern || pattern.startsWith("#")) return undefined;
  const negated = pattern.startsWith("!");
  if (negated) pattern = pattern.slice(1).trim();
  // A barra final marca "só diretórios"; sem `stats` confiáveis no momento da
  // decisão, o watcher trata o padrão como caminho — o que dá no mesmo, porque
  // um arquivo homônimo também não interessa observar.
  pattern = pattern.replace(/\/+$/, "");
  const rooted = pattern.startsWith("/");
  if (rooted) pattern = pattern.slice(1);
  if (!pattern) return undefined;
  // `ANY_DEPTH` marca `**` até a junção dos segmentos: como não ocorre em
  // caminho nem em expressão regular, não colide com nenhum segmento real.
  const body = pattern
    .split("/")
    .map((segment) => segment === "**" ? ANY_DEPTH : segmentToRegExpSource(segment))
    .join("/")
    .replaceAll(`${ANY_DEPTH}/`, "(?:[^/]+/)*")
    .replaceAll(`/${ANY_DEPTH}`, "(?:/[^/]+)*")
    .replaceAll(ANY_DEPTH, ".*");
  const anchored = rooted || pattern.includes("/");
  // `(?:/.*)?` faz o diretório casado arrastar tudo abaixo dele, que é o ponto:
  // é a subárvore inteira que não deve receber watch.
  const expression = new RegExp(`^${anchored ? "" : "(?:.*/)?"}${body}(?:/.*)?$`);
  return {expression, negated};
}

function segmentToRegExpSource(segment) {
  let source = "";
  for (const character of segment) {
    if (character === "*") source += "[^/]*";
    else if (character === "?") source += "[^/]";
    else source += character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return source;
}

/**
 * Filtro por `.gitignore` da própria árvore.
 *
 * Sem ele a lista fixa de diretórios não dá conta do que existe em projeto
 * real: em um workspace aqui medido, `backend/precocerto/media` (170 mil
 * arquivos de upload, ignorados pelo git) levava o watcher a 178 mil watches
 * de inotify e ~900 MB de RSS no processo principal do Electron — que é onde
 * também vive o servidor HTTP da IDE.
 */
function createGitignoreFilter(root, options = {}) {
  const readGitignore = options.readGitignore ?? ((path) => {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return undefined;
    }
  });
  const cache = new Map();
  const rulesFor = (directory) => {
    const cached = cache.get(directory);
    if (cached) return cached;
    const content = readGitignore(join(root, directory, ".gitignore"));
    const rules = content
      ? content.split(/\r?\n/).map(compileGitignoreRule).filter(Boolean)
      : [];
    cache.set(directory, rules);
    return rules;
  };
  return {
    /** Descarta o cache quando um `.gitignore` da árvore muda. */
    invalidate() {
      cache.clear();
    },
    ignores(path) {
      if (!path) return false;
      const segments = path.split("/");
      let ignored = false;
      // Do `.gitignore` mais externo para o mais interno: o mais próximo do
      // arquivo decide, inclusive para reverter uma exclusão com `!`.
      for (let depth = 0; depth < segments.length; depth += 1) {
        const rules = rulesFor(segments.slice(0, depth).join("/"));
        if (rules.length === 0) continue;
        const candidate = segments.slice(depth).join("/");
        for (const rule of rules) {
          if (rule.expression.test(candidate)) ignored = !rule.negated;
        }
      }
      return ignored;
    },
  };
}

function ignoredWorkspacePath(root, changedPath, extraIgnored, gitignore) {
  const path = workspaceRelativePath(root, changedPath);
  const ignoredByName = path.split("/").some(
    (segment) =>
      IGNORED_DIRECTORIES.has(segment) ||
      [...(extraIgnored ?? [])].some((name) => matchesIgnoredName(segment, name)),
  );
  if (ignoredByName) return true;
  return gitignore ? gitignore.ignores(path) : false;
}

function createWorkspaceWatcher(root, onChanges, options = {}) {
  const watch = options.watch ?? chokidar.watch;
  const debounceMs = options.debounceMs ?? 120;
  const schedule = options.schedule ?? setTimeout;
  const cancel = options.cancel ?? clearTimeout;
  const extraIgnored = new Set(
    (options.extraIgnoredDirectories ?? []).filter((name) => typeof name === "string" && name.trim()),
  );
  const gitignore = options.gitignore === false
    ? undefined
    : options.gitignore ?? createGitignoreFilter(root);
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
    ignored: (path) => ignoredWorkspacePath(root, path, extraIgnored, gitignore),
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 25,
    },
  });
  watcher.on("all", (_event, changedPath) => {
    const path = workspaceRelativePath(root, changedPath);
    if (!path) return;
    // Editar um `.gitignore` muda o que deve ser observado; sem invalidar, a
    // poda continuaria valendo pelas regras antigas até reabrir o projeto.
    if (path === ".gitignore" || path.endsWith("/.gitignore")) gitignore?.invalidate();
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
  createGitignoreFilter,
  createWorkspaceWatcher,
  ignoredWorkspacePath,
  workspaceRelativePath,
  DEFAULT_IGNORED_DIRECTORIES,
};
