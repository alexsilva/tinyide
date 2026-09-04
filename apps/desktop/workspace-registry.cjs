const {randomUUID} = require("node:crypto");
const {resolve} = require("node:path");

function effectiveIgnoredDirectories(list) {
  const names = [...(list ?? [])]
    .filter((name) => typeof name === "string" && name.trim())
    .map((name) => name.trim());
  return [...new Set(names)].sort();
}

function sameIgnoredDirectories(current, next) {
  const left = effectiveIgnoredDirectories(current);
  const right = effectiveIgnoredDirectories(next);
  return left.length === right.length && left.every((name, index) => name === right[index]);
}

/**
 * Registro dos workspaces que o processo principal aceita servir.
 *
 * Existe por dois motivos que antes ficavam implícitos em mapas soltos:
 *
 * 1. **Posse por janela.** Trocar de projeto não liberava nada: o watcher do
 *    projeto anterior seguia vivo até o app fechar. Numa sessão real medida
 *    aqui, três projetos abertos em sequência deixaram três watchers ativos e
 *    ~230 mil watches de inotify no processo que também hospeda o servidor
 *    HTTP da IDE. Com posse por janela, o último a sair de um workspace o
 *    libera — e duas janelas no mesmo projeto não derrubam o watcher uma da
 *    outra.
 * 2. **Validade dos tokens.** Cada registro emitia um token novo e nenhum
 *    expirava, então uma janela continuava podendo ler e escrever em projetos
 *    que já havia fechado. Liberar o workspace invalida os tokens dele.
 */
function createWorkspaceRegistry(options = {}) {
  const startWatcher = options.startWatcher;
  const createToken = options.createToken ?? randomUUID;
  const tokens = new Map();
  const owners = new Map();
  const watchers = new Map();
  const ignores = new Map();

  const ownersOf = (root) => {
    const existing = owners.get(root);
    if (existing) return existing;
    const created = new Set();
    owners.set(root, created);
    return created;
  };

  async function release(root) {
    tokens.forEach((candidate, token) => {
      if (candidate === root) tokens.delete(token);
    });
    owners.delete(root);
    ignores.delete(root);
    const watcher = watchers.get(root);
    watchers.delete(root);
    await watcher?.close();
  }

  /** Move a posse do dono para `root` e devolve os workspaces que ficaram órfãos. */
  function transferOwnership(root, owner) {
    if (owner === undefined) return [];
    const abandoned = [];
    for (const [candidate, current] of owners) {
      if (candidate === root) continue;
      if (current.delete(owner) && current.size === 0) abandoned.push(candidate);
    }
    ownersOf(root).add(owner);
    return abandoned;
  }

  return {
    async register(rootPath, {owner} = {}) {
      const root = resolve(rootPath);
      const abandoned = transferOwnership(root, owner);
      const token = createToken();
      tokens.set(token, root);
      if (!watchers.has(root) && startWatcher) {
        watchers.set(root, startWatcher(root, ignores.get(root)));
      }
      await Promise.allSettled(abandoned.map(release));
      return {token, root, released: abandoned};
    },

    resolveToken(token) {
      return tokens.get(token);
    },

    isRegistered(rootPath) {
      const root = resolve(rootPath);
      for (const candidate of tokens.values()) {
        if (candidate === root) return true;
      }
      return false;
    },

    async configureIgnores(rootPath, extraIgnoredDirectories) {
      const root = resolve(rootPath);
      // Recriar o watcher repete a varredura completa da árvore. A janela
      // recém-aberta aplica as settings logo após o registro — quase sempre com
      // a mesma lista efetiva —, então uma lista equivalente mantém o watcher.
      const unchanged = watchers.has(root)
        && sameIgnoredDirectories(ignores.get(root), extraIgnoredDirectories);
      ignores.set(root, extraIgnoredDirectories);
      if (unchanged) return;
      const existing = watchers.get(root);
      if (existing) {
        await existing.close();
        if (startWatcher) watchers.set(root, startWatcher(root, extraIgnoredDirectories));
      }
    },

    /**
     * Uma janela fechou ou trocou de projeto. Workspaces que ficaram sem
     * nenhuma janela são liberados; os que ainda têm, permanecem.
     */
    async releaseOwner(owner) {
      if (owner === undefined) return [];
      const abandoned = [];
      for (const [root, current] of owners) {
        if (current.delete(owner) && current.size === 0) abandoned.push(root);
      }
      await Promise.allSettled(abandoned.map(release));
      return abandoned;
    },

    async closeAll() {
      const pending = [...watchers.values()];
      tokens.clear();
      owners.clear();
      ignores.clear();
      watchers.clear();
      await Promise.allSettled(pending.map((watcher) => watcher.close()));
    },

    /** Só para diagnóstico e testes: quais workspaces ainda estão vivos. */
    activeRoots() {
      return [...watchers.keys()];
    },
  };
}

module.exports = {createWorkspaceRegistry};
