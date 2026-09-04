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

const resolvedRoots = new Map();

function resolvedRoot(root) {
  let entry = resolvedRoots.get(root);
  if (!entry) {
    const resolved = resolve(root);
    entry = {resolved, prefix: resolved.endsWith(sep) ? resolved : `${resolved}${sep}`};
    resolvedRoots.set(root, entry);
    // Poucos roots convivem (um por janela); o limite só evita crescer sem fim.
    if (resolvedRoots.size > 32) resolvedRoots.delete(resolvedRoots.keys().next().value);
  }
  return entry;
}

function workspaceRelativePath(root, changedPath) {
  const {resolved, prefix} = resolvedRoot(root);
  // Caminho rápido: o chokidar entrega caminhos absolutos montados a partir do
  // root; basta cortar o prefixo quando não sobra segmento relativo (".", "..").
  if (changedPath.startsWith(prefix)) {
    const rest = changedPath.slice(prefix.length);
    const segments = rest.split(sep);
    let plain = rest.length > 0;
    for (const segment of segments) {
      if (!segment || segment === "." || segment === "..") {
        plain = false;
        break;
      }
    }
    if (plain) return sep === "/" ? rest : segments.join("/");
  }
  const path = relative(resolved, resolve(changedPath));
  if (!path || path === ".." || path.startsWith(`..${sep}`)) return "";
  return path.split(sep).join("/");
}

function globToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

const EMPTY_EXTRA_MATCHERS = {literals: undefined, patterns: undefined};
const extraMatcherCache = new WeakMap();

/**
 * Compila a lista de nomes extras uma única vez por conjunto: o filtro roda
 * para cada entrada do scan e recompilar o curinga por segmento dominava o
 * custo. O conjunto é tratado como imutável — quem muda a configuração recria
 * o conjunto (e o watcher).
 */
function extraIgnoredMatchers(extraIgnored) {
  if (!extraIgnored) return EMPTY_EXTRA_MATCHERS;
  const cached = extraMatcherCache.get(extraIgnored);
  if (cached) return cached;
  let literals;
  let patterns;
  for (const name of extraIgnored) {
    if (name.includes("*")) (patterns ??= []).push(globToRegExp(name));
    else (literals ??= new Set()).add(name);
  }
  const matchers = {literals, patterns};
  extraMatcherCache.set(extraIgnored, matchers);
  return matchers;
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
    ignores(path, segments) {
      if (!path) return false;
      const parts = segments ?? path.split("/");
      let ignored = false;
      // Comprimento do prefixo `parts[0..depth)` dentro de `path`, mantido de
      // forma incremental para não reconstruir strings por profundidade.
      let prefixLength = 0;
      // Do `.gitignore` mais externo para o mais interno: o mais próximo do
      // arquivo decide, inclusive para reverter uma exclusão com `!`.
      for (let depth = 0; depth < parts.length; depth += 1) {
        const rules = rulesFor(depth === 0 ? "" : path.slice(0, prefixLength));
        if (rules.length > 0) {
          const candidate = depth === 0 ? path : path.slice(prefixLength + 1);
          for (const rule of rules) {
            if (rule.expression.test(candidate)) ignored = !rule.negated;
          }
        }
        prefixLength += (depth === 0 ? 0 : 1) + parts[depth].length;
      }
      return ignored;
    },
  };
}

function ignoredWorkspacePath(root, changedPath, extraIgnored, gitignore) {
  const path = workspaceRelativePath(root, changedPath);
  if (!path) return false;
  const segments = path.split("/");
  const {literals, patterns} = extraIgnoredMatchers(extraIgnored);
  for (const segment of segments) {
    if (IGNORED_DIRECTORIES.has(segment)) return true;
    if (literals !== undefined && literals.has(segment)) return true;
    if (patterns !== undefined) {
      for (const pattern of patterns) {
        if (pattern.test(segment)) return true;
      }
    }
  }
  return gitignore ? gitignore.ignores(path, segments) : false;
}

function createWorkspaceWatcher(root, onChanges, options = {}) {
  const watch = options.watch ?? chokidar.watch;
  const debounceMs = options.debounceMs ?? 120;
  const maxWaitMs = options.maxWaitMs ?? 1000;
  const schedule = options.schedule ?? setTimeout;
  const cancel = options.cancel ?? clearTimeout;
  const extraIgnored = new Set(
    (options.extraIgnoredDirectories ?? [])
      .filter((name) => typeof name === "string" && name.trim())
      .map((name) => name.trim()),
  );
  const gitignore = options.gitignore === false
    ? undefined
    : options.gitignore ?? createGitignoreFilter(root);
  const pending = new Set();
  let timer;
  let firstPendingAt;
  let closed = false;

  const flush = () => {
    if (timer !== undefined) cancel(timer);
    timer = undefined;
    firstPendingAt = undefined;
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
    const now = Date.now();
    if (firstPendingAt === undefined) firstPendingAt = now;
    // Uma rajada contínua (build, checkout de branch) reiniciaria o debounce
    // para sempre; o teto garante lotes periódicos para a UI durante a rajada.
    if (now - firstPendingAt >= maxWaitMs) {
      flush();
      return;
    }
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
