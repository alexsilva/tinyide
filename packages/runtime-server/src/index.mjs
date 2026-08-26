import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { mkdir, readFile, realpath, readdir, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { basename, dirname, extname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { createExecutionBackend, createWorkspacePluginConfiguration } from "./execution-backend.mjs";
import { createUserDataBackend, defaultTinyIdeUserDataRoot } from "./user-data-backend.mjs";
import {
  assertWorkspaceScopeId,
  listWorkspaceScopes,
  readWorkspaceScope,
  registerWorkspaceScope,
  removeWorkspaceScope,
  workspaceScopeId,
} from "./workspace-scope.mjs";

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};
const MAX_JSON_BODY_BYTES = 1024 * 1024;
const MAX_WORKSPACE_RESOURCE_BYTES = 128 * 1024 * 1024;
const MANIFEST_CACHE_TTL_MS = 1000;
const CDN_ORIGIN = "https://cdn.jsdelivr.net";
// Prefixo que carrega a identidade do workspace na própria URL. Toda chamada de
// API feita com um projeto aberto passa por `/w/<scopeId>/…`: o escopo deixa de
// depender de um header que qualquer janela pode omitir e passa a ser visível no
// devtools, no log de acesso e no histórico do navegador.
const WORKSPACE_SCOPE_PREFIX = "/w/";

function validInlineScriptHashes(hashes) {
  if (!Array.isArray(hashes)) return [];
  return hashes.filter((hash) => /^'sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}'$/.test(hash));
}

function contentSecurityPolicy(pluginDescriptors, inlineScriptHashes = []) {
  const permissions = new Set(
    pluginDescriptors.flatMap(({ manifest }) => Array.isArray(manifest.permissions) ? manifest.permissions : []),
  );
  const scriptSources = ["'self'", ...validInlineScriptHashes(inlineScriptHashes)];
  const connectSources = ["'self'", "ws:"];

  if (permissions.has("runtime.wasm")) scriptSources.push("'wasm-unsafe-eval'");
  if (permissions.has("network.cdn")) {
    scriptSources.push(CDN_ORIGIN);
    connectSources.push(CDN_ORIGIN);
  }

  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

function applySecurityHeaders(response, pluginDescriptors, inlineScriptHashes) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("Content-Security-Policy", contentSecurityPolicy(pluginDescriptors, inlineScriptHashes));
}

function writeJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

function isLoopbackHostname(hostname) {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

function requestOriginAllowed(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  const host = request.headers.host;
  if (!host) return false;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "http:"
      && isLoopbackHostname(parsed.hostname)
      && parsed.host === host;
  } catch {
    return false;
  }
}

/**
 * Identidade da janela que fala com o runtime. Serve só para contar quem está
 * em cada workspace; um valor inválido é tratado como ausência, e não como
 * erro, porque a consequência é apenas manter o escopo vivo mais tempo.
 */
export function workspaceClientId(payload) {
  const value = payload?.clientId;
  return typeof value === "string" && /^[A-Za-z0-9-]{8,128}$/.test(value) ? value : undefined;
}

async function readJson(request) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_JSON_BODY_BYTES) {
      const error = new Error("O corpo da requisição excede o limite permitido.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

async function readBinary(request, maxBytes = MAX_WORKSPACE_RESOURCE_BYTES) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > maxBytes) {
      const error = new Error("O arquivo excede o limite permitido pelo runtime.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return chunks.length ? Buffer.concat(chunks) : Buffer.alloc(0);
}

function safeFile(root, path) {
  const normalizedPath = normalize(path).replace(/^([/\\])+/, "");
  const absolutePath = resolve(root, normalizedPath);
  return absolutePath === root || absolutePath.startsWith(`${root}${sep}`) ? absolutePath : undefined;
}

function openSystemFileManager(directory) {
  const [command, arguments_] = process.platform === "win32"
    ? ["explorer.exe", [directory]]
    : process.platform === "darwin"
      ? ["open", [directory]]
      : ["xdg-open", [directory]];
  return new Promise((resolveOpen, rejectOpen) => {
    const child = spawn(command, arguments_, { detached: true, stdio: "ignore", windowsHide: true });
    child.once("error", rejectOpen);
    child.once("spawn", () => {
      child.unref();
      resolveOpen();
    });
  });
}

function manifestDirectories(pluginsRoot) {
  if (!existsSync(pluginsRoot)) return [];
  return readdirSync(pluginsRoot)
    .map((name) => join(pluginsRoot, name))
    .filter((directory) => {
      const manifest = join(directory, "plugin.json");
      return existsSync(manifest) && statSync(manifest).isFile();
    });
}

export function createTinyIdeRuntime(options) {
  const hostRoot = resolve(options.hostRoot);
  const pluginsRoot = resolve(options.pluginsRoot ?? join(hostRoot, "plugins"));
  const webRoot = options.webRoot ? resolve(options.webRoot) : undefined;
  const workspaceSearchRoot = resolve(options.workspaceSearchRoot ?? process.env.TINYIDE_WORKSPACES_ROOT ?? dirname(hostRoot));
  const userDataRoot = resolve(options.userDataRoot ?? defaultTinyIdeUserDataRoot());
  // Desktop e servidor de desenvolvimento compartilham o mesmo diretório de
  // dados do usuário. O `hostId` separa o que é ponteiro de janela ("qual
  // projeto reabrir") sem separar o que é do projeto: o estado do workspace
  // continua sendo um só, venha de onde vier.
  const userDataBackend = createUserDataBackend({ root: userDataRoot, hostId: options.hostId ?? "web" });
  // O motivo distingue recargas rotineiras (rebuild de plugin, limpeza de
  // cache), em que backends devem preservar recursos reataráveis, da troca ou
  // fechamento de workspace ("workspace-switch"), em que devem encerrá-los.
  async function disposeBackendHandler(handler, reason) {
    if (typeof handler?.dispose === "function") await handler.dispose(reason ? {reason} : undefined);
  }
  async function disposeCachedBackends(context, reason) {
    const handlers = [...new Set([...context.backendHandlers.values()].map((entry) => entry.handler))];
    context.backendHandlers.clear();
    await Promise.allSettled(handlers.map((handler) => disposeBackendHandler(handler, reason)));
  }
  let manifestCache = { expiresAt: 0, descriptors: [] };
  function cachedPluginDescriptors() {
    const now = Date.now();
    if (manifestCache.expiresAt > now) return manifestCache.descriptors;
    const descriptors = [];
    for (const directory of manifestDirectories(pluginsRoot)) {
      try {
        const manifest = JSON.parse(readFileSync(join(directory, "plugin.json"), "utf8"));
        descriptors.push({ directory, manifest });
      } catch {
        // Invalid manifests are ignored here and reported by the plugin host when explicitly loaded.
      }
    }
    manifestCache = { expiresAt: now + MANIFEST_CACHE_TTL_MS, descriptors };
    return descriptors;
  }

  // Um contexto por workspace, nunca por janela. Duas janelas do mesmo projeto
  // compartilham processos e backends — que é o comportamento correto, já que
  // compartilham o próprio diretório —, e projetos diferentes não têm como se
  // enxergar: não existe mais um contexto "default" no qual todos caem.
  const workspaceContexts = new Map();
  const initialWorkspaceRoot = options.initialWorkspaceRoot
    ? resolve(options.initialWorkspaceRoot)
    : undefined;
  const initialScopeId = initialWorkspaceRoot ? workspaceScopeId(initialWorkspaceRoot) : undefined;

  function createWorkspaceContext(scopeId) {
    const context = {
      scopeId,
      workspaceRoot: scopeId === initialScopeId ? initialWorkspaceRoot : undefined,
      backendHandlers: new Map(),
      executionBackend: undefined,
      // Janelas que declararam estar neste escopo. Sem isso não há como
      // distinguir "ninguém está mais neste projeto" de "outra janela continua
      // nele", e o runtime só teria as opções ruins: manter processos órfãos
      // para sempre ou derrubar terminais de quem ainda está trabalhando.
      clients: new Set(),
      hadClients: false,
    };
    context.executionBackend = createExecutionBackend({ workspaceRoot: () => context.workspaceRoot });
    return context;
  }

  function workspaceContext(scopeId) {
    let context = workspaceContexts.get(scopeId);
    if (!context) {
      context = createWorkspaceContext(scopeId);
      workspaceContexts.set(scopeId, context);
    }
    return context;
  }

  // Requisições sem escopo só alcançam estado global (preferências do usuário,
  // projetos recentes) e o registro de workspaces. Elas recebem um contexto
  // vazio, sem workspace: qualquer rota que precise de arquivos responde 409 em
  // vez de operar sobre "o último projeto que alguém abriu".
  const unscopedContext = {
    scopeId: undefined,
    workspaceRoot: undefined,
    backendHandlers: new Map(),
    executionBackend: createExecutionBackend({ workspaceRoot: () => undefined }),
  };

  async function resetExecutionBackend(context) {
    await context.executionBackend.dispose?.();
    context.executionBackend = createExecutionBackend({ workspaceRoot: () => context.workspaceRoot });
  }

  /**
   * Encerra tudo que pertence a um workspace: backends de plugin (terminais,
   * watchers) e processos de execução. Só é chamado quando o escopo ficou sem
   * nenhuma janela — é o descarte, não uma recarga.
   */
  async function releaseWorkspaceContext(context) {
    await disposeCachedBackends(context, "workspace-switch");
    await resetExecutionBackend(context);
    context.workspaceRoot = undefined;
    context.clients.clear();
    // O contexto vazio permanece no mapa de propósito: recriá-lo devolveria o
    // `initialWorkspaceRoot` ao escopo inicial e o workspace fechado voltaria
    // sozinho.
  }

  /**
   * Uma janela só existe em um escopo por vez. Registrar num escopo é, por
   * definição, sair do anterior — e o anterior, sem ninguém dentro, é liberado.
   *
   * Sem `clientId` nada acontece: chamadas programáticas e clientes antigos
   * seguem com o comportamento de manter o contexto vivo.
   */
  async function attachWorkspaceClient(scopeId, clientId) {
    if (!clientId) return;
    const target = workspaceContext(scopeId);
    target.clients.add(clientId);
    target.hadClients = true;
    await releaseAbandonedContexts(clientId, scopeId);
  }

  async function releaseAbandonedContexts(clientId, keepScopeId) {
    if (!clientId) return;
    const abandoned = [];
    for (const context of workspaceContexts.values()) {
      if (context.scopeId === keepScopeId) continue;
      if (!context.clients.delete(clientId)) continue;
      if (context.hadClients && context.clients.size === 0) abandoned.push(context);
    }
    await Promise.allSettled(abandoned.map((context) => releaseWorkspaceContext(context)));
  }

  /**
   * Separa `/w/<scopeId>` do restante do caminho. Um escopo malformado é erro de
   * requisição, não motivo para cair no caminho sem escopo — silenciar aqui
   * reintroduziria o estado compartilhado pela porta dos fundos.
   */
  function splitScopedPath(pathname) {
    if (!pathname.startsWith(WORKSPACE_SCOPE_PREFIX)) return { pathname };
    const rest = pathname.slice(WORKSPACE_SCOPE_PREFIX.length);
    const separator = rest.indexOf("/");
    const rawScopeId = separator < 0 ? rest : rest.slice(0, separator);
    return {
      scopeId: assertWorkspaceScopeId(decodeURIComponent(rawScopeId)),
      pathname: separator < 0 ? "/" : rest.slice(separator),
    };
  }
  const openInFileManager = options.openInFileManager ?? openSystemFileManager;

  async function workspaceDirectoryForFileManager(activeWorkspaceRoot, workspacePath) {
    if (!activeWorkspaceRoot) throw new Error("Abra um workspace antes de usar o gerenciador de arquivos.");
    if (typeof workspacePath !== "string" || workspacePath.includes("\0") || isAbsolute(workspacePath)) {
      throw new Error("Caminho de workspace inválido.");
    }
    const target = safeFile(activeWorkspaceRoot, workspacePath);
    if (!target) throw new Error("O caminho solicitado está fora do workspace.");
    const [workspaceRoot, resolvedTarget] = await Promise.all([realpath(activeWorkspaceRoot), realpath(target)]);
    if (resolvedTarget !== workspaceRoot && !resolvedTarget.startsWith(`${workspaceRoot}${sep}`)) {
      throw new Error("O caminho solicitado está fora do workspace.");
    }
    return (await stat(resolvedTarget)).isDirectory() ? resolvedTarget : dirname(resolvedTarget);
  }

  async function workspaceResourcePath(activeWorkspaceRoot, workspacePath, allowMissing = false) {
    if (!activeWorkspaceRoot) {
      const error = new Error("Abra um workspace antes de acessar arquivos.");
      error.statusCode = 409;
      throw error;
    }
    const target = safeFile(activeWorkspaceRoot, typeof workspacePath === "string" ? workspacePath : "");
    if (!target) {
      const error = new Error("O caminho solicitado está fora do workspace.");
      error.statusCode = 400;
      throw error;
    }
    const realWorkspaceRoot = await realpath(activeWorkspaceRoot);
    let probe = target;
    while (!existsSync(probe)) {
      if (!allowMissing) {
        const error = new Error("O recurso solicitado não existe.");
        error.statusCode = 404;
        throw error;
      }
      const parent = dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }
    const realProbe = await realpath(probe);
    if (realProbe !== realWorkspaceRoot && !realProbe.startsWith(`${realWorkspaceRoot}${sep}`)) {
      const error = new Error("O caminho solicitado resolve para fora do workspace.");
      error.statusCode = 400;
      throw error;
    }
    return target;
  }

  function isInsideWorkspaceSearchRoot(candidate) {
    const relativePath = relative(workspaceSearchRoot, candidate);
    return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
  }

  function findWorkspaceByName(name) {
    if (basename(hostRoot) === name) return hostRoot;
    const ignored = new Set([".git", ".venv", "node_modules", "dist", "coverage"]);
    const queue = [{path: workspaceSearchRoot, depth: 0}];
    const matches = [];
    let cursor = 0;
    while (cursor < queue.length) {
      const current = queue[cursor++];
      if (!current || current.depth >= 4) continue;
      let entries;
      try {
        entries = readdirSync(current.path, {withFileTypes: true});
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isDirectory() || ignored.has(entry.name)) continue;
        const directoryPath = join(current.path, entry.name);
        if (entry.name === name) matches.push({path: directoryPath, depth: current.depth + 1});
        queue.push({path: directoryPath, depth: current.depth + 1});
      }
    }
    if (!matches.length) return undefined;
    const minimumDepth = Math.min(...matches.map((match) => match.depth));
    const nearest = matches.filter((match) => match.depth === minimumDepth);
    if (nearest.length > 1) throw new Error(`Há mais de um diretório chamado '${name}' no mesmo nível da raiz de workspaces.`);
    return nearest[0].path;
  }

  function resolveWorkspaceSelection(payload) {
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    if (!name || name.includes("/") || name.includes("\\") || name.includes("\0")) throw new Error("Nome de workspace inválido.");
    if (typeof payload.path === "string" && payload.path.trim()) {
      const candidate = resolve(payload.path.trim());
      const pathAllowed = typeof options.workspacePathAllowed === "function"
        ? options.workspacePathAllowed(candidate)
        : isInsideWorkspaceSearchRoot(candidate);
      if (!pathAllowed || !existsSync(candidate) || !statSync(candidate).isDirectory()) {
        throw new Error("O workspace salvo não está disponível dentro da raiz configurada para workspaces.");
      }
      if (basename(candidate) !== name) throw new Error("O caminho salvo não corresponde ao workspace selecionado.");
      return candidate;
    }
    if (options.requireWorkspacePath === true) {
      throw new Error("O desktop exige o caminho absoluto do workspace selecionado.");
    }
    const candidate = findWorkspaceByName(name);
    if (!candidate) throw new Error(`Não foi possível vincular o diretório '${name}' à raiz de workspaces '${workspaceSearchRoot}'.`);
    return candidate;
  }

  async function resolveBackend(context, pluginId) {
    const activeWorkspaceRoot = context.workspaceRoot;
    if (!activeWorkspaceRoot) throw new Error("Abra um workspace antes de usar este plugin.");
    for (const { directory, manifest } of cachedPluginDescriptors()) {
      if (manifest.id !== pluginId || !manifest.entrypoints?.backend) continue;
      const backendPath = safeFile(directory, manifest.entrypoints.backend);
      if (!backendPath || !existsSync(backendPath) || !statSync(backendPath).isFile()) {
        throw new Error(`Caminho de backend inválido para o plugin: ${pluginId}`);
      }
      const backendMtime = statSync(backendPath).mtimeMs;
      const cacheKey = `${pluginId}:${activeWorkspaceRoot}`;
      const cached = context.backendHandlers.get(cacheKey);
      if (cached?.mtime === backendMtime) return cached.handler;
      if (cached) {
        context.backendHandlers.delete(cacheKey);
        await disposeBackendHandler(cached.handler);
      }
      const imported = await import(`${pathToFileURL(backendPath).href}?v=${backendMtime}`);
      if (typeof imported.createBackend !== "function") throw new Error(`Plugin backend must export createBackend(): ${pluginId}`);
      const handler = imported.createBackend({
        workspaceRoot: activeWorkspaceRoot,
        configuration: createWorkspacePluginConfiguration(activeWorkspaceRoot, pluginId),
      });
      context.backendHandlers.set(cacheKey, {mtime: backendMtime, handler});
      return handler;
    }
    return undefined;
  }

  function serveFile(response, absolutePath) {
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) return false;
    response.statusCode = 200;
    response.setHeader("Content-Type", CONTENT_TYPES[extname(absolutePath)] ?? "application/octet-stream");
    const immutableAsset = /-[A-Za-z0-9_-]{8,}\.[^.]+$/.test(basename(absolutePath));
    response.setHeader("Cache-Control", immutableAsset
      ? "public, max-age=31536000, immutable"
      : extname(absolutePath) === ".html" ? "no-cache" : "no-store");
    createReadStream(absolutePath).pipe(response);
    return true;
  }

  const middleware = (request, response, next = () => {
    response.statusCode = 404;
    response.end("Not found.");
  }) => {
    applySecurityHeaders(response, cachedPluginDescriptors(), options.inlineScriptHashes);
    const rawUrl = new URL(request.url ?? "/", "http://localhost");
    let scopeId;
    let pathname;
    try {
      ({ scopeId, pathname } = splitScopedPath(rawUrl.pathname));
    } catch (error) {
      writeJson(response, 400, {error: error instanceof Error ? error.message : String(error)});
      return;
    }
    const requestUrl = new URL(`${pathname}${rawUrl.search}`, "http://localhost");
    const context = scopeId ? workspaceContext(scopeId) : unscopedContext;

    if ((requestUrl.pathname.startsWith("/core-api/") || requestUrl.pathname.startsWith("/plugin-api/"))
      && !requestOriginAllowed(request)) {
      writeJson(response, 403, {error: "Origem da requisição não autorizada."});
      return;
    }

    if (requestUrl.pathname === "/core-api/workspace/scopes" && request.method === "GET") {
      void listWorkspaceScopes(userDataRoot)
        .then((scopes) => writeJson(response, 200, scopes))
        .catch((error) => writeJson(response, 500, {error: error instanceof Error ? error.message : String(error)}));
      return;
    }

    if (requestUrl.pathname.startsWith("/core-api/workspace/scopes/")) {
      let requestedScopeId;
      try {
        requestedScopeId = assertWorkspaceScopeId(
          decodeURIComponent(requestUrl.pathname.slice("/core-api/workspace/scopes/".length)),
        );
      } catch (error) {
        writeJson(response, 400, {error: error instanceof Error ? error.message : String(error)});
        return;
      }
      if (request.method === "GET") {
        void readWorkspaceScope(userDataRoot, requestedScopeId).then((descriptor) => {
          if (!descriptor) writeJson(response, 404, {error: "Workspace desconhecido."});
          else writeJson(response, 200, descriptor);
        }).catch((error) => writeJson(response, 500, {error: error instanceof Error ? error.message : String(error)}));
        return;
      }
      if (request.method === "DELETE") {
        void removeWorkspaceScope(userDataRoot, requestedScopeId).then(() => {
          workspaceContexts.delete(requestedScopeId);
          writeJson(response, 204, undefined);
        }).catch((error) => writeJson(response, 500, {error: error instanceof Error ? error.message : String(error)}));
        return;
      }
      writeJson(response, 405, {error: "Método não permitido."});
      return;
    }

    // Abrir um projeto é o que cria o escopo. A resposta devolve o `scopeId`
    // para que a janela reancore todas as chamadas seguintes — e a própria URL —
    // no diretório de estado daquele workspace.
    if (request.method === "POST" && requestUrl.pathname === "/core-api/workspace") {
      void readJson(request).then(async (payload) => {
        const nextWorkspaceRoot = resolveWorkspaceSelection(payload);
        const nextScopeId = workspaceScopeId(nextWorkspaceRoot);
        if (scopeId && scopeId !== nextScopeId) {
          const error = new Error("O workspace informado não pertence a este escopo.");
          error.statusCode = 409;
          throw error;
        }
        const descriptor = await registerWorkspaceScope(userDataRoot, nextWorkspaceRoot);
        const target = workspaceContext(nextScopeId);
        if (nextWorkspaceRoot !== target.workspaceRoot) {
          await disposeCachedBackends(target, "workspace-switch");
          await resetExecutionBackend(target);
          target.workspaceRoot = nextWorkspaceRoot;
        }
        // Depois de o escopo novo estar pronto: a janela deixou o projeto
        // anterior, e o que sobrava dele (terminais, processos) morre aqui.
        await attachWorkspaceClient(nextScopeId, workspaceClientId(payload));
        writeJson(response, 200, {
          workspaceRoot: target.workspaceRoot,
          scopeId: nextScopeId,
          name: descriptor.name,
        });
      }).catch((error) => writeJson(
        response,
        Number.isInteger(error?.statusCode) ? error.statusCode : 400,
        {error: error instanceof Error ? error.message : String(error)},
      ));
      return;
    }

    if (request.method === "DELETE" && requestUrl.pathname === "/core-api/workspace") {
      if (!scopeId) {
        writeJson(response, 400, {error: "Fechar um workspace exige o escopo na URL."});
        return;
      }
      void releaseWorkspaceContext(context).then(() => {
        writeJson(response, 204, undefined);
      }).catch((error) => writeJson(response, 500, {error: error instanceof Error ? error.message : String(error)}));
      return;
    }

    /**
     * Saída sem troca: a janela foi fechada. Chega por `sendBeacon`, então
     * responde sempre 204 — não há ninguém do outro lado para ler um erro — e o
     * escopo só é liberado se nenhuma outra janela continuar nele.
     */
    if (request.method === "POST" && requestUrl.pathname === "/core-api/workspace/release") {
      void readJson(request)
        .then((payload) => releaseAbandonedContexts(workspaceClientId(payload), undefined))
        .catch(() => undefined)
        .then(() => writeJson(response, 204, undefined));
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/core-api/workspace/open-in-file-manager") {
      void readJson(request).then(async (payload) => {
        const directory = await workspaceDirectoryForFileManager(context.workspaceRoot, payload.path ?? "");
        await openInFileManager(directory);
        writeJson(response, 200, { directory });
      }).catch((error) => writeJson(
        response,
        Number.isInteger(error?.statusCode) ? error.statusCode : 400,
        {error: error instanceof Error ? error.message : String(error)},
      ));
      return;
    }

    if (requestUrl.pathname === "/core-api/workspace/resources") {
      if (request.method === "GET") {
        void workspaceResourcePath(context.workspaceRoot, requestUrl.searchParams.get("path") ?? "")
          .then(async (directory) => {
            const directoryStat = await stat(directory);
            if (!directoryStat.isDirectory()) {
              const error = new Error("O recurso solicitado não é um diretório.");
              error.statusCode = 400;
              throw error;
            }
            const entries = await readdir(directory, { withFileTypes: true });
            writeJson(response, 200, entries
              .filter((entry) => entry.isFile() || entry.isDirectory())
              .map((entry) => ({ name: entry.name, kind: entry.isDirectory() ? "directory" : "file" })));
          })
          .catch((error) => writeJson(
            response,
            Number.isInteger(error?.statusCode) ? error.statusCode : 500,
            { error: error instanceof Error ? error.message : String(error) },
          ));
        return;
      }
      if (request.method === "POST") {
        void readJson(request).then(async (payload) => {
          const path = typeof payload.path === "string" ? payload.path : "";
          const kind = payload.kind === "directory" ? "directory" : payload.kind === "file" ? "file" : undefined;
          if (!path || !kind) {
            const error = new Error("Caminho e tipo do recurso são obrigatórios.");
            error.statusCode = 400;
            throw error;
          }
          const target = await workspaceResourcePath(context.workspaceRoot, path, payload.create === true);
          if (existsSync(target)) {
            const targetStat = await stat(target);
            if ((kind === "directory") !== targetStat.isDirectory()) {
              const error = new Error(`O recurso '${path}' existe com outro tipo.`);
              error.statusCode = 409;
              throw error;
            }
          } else if (payload.create === true) {
            if (kind === "directory") await mkdir(target);
            else await writeFile(target, Buffer.alloc(0), { flag: "wx" });
          } else {
            const error = new Error("O recurso solicitado não existe.");
            error.statusCode = 404;
            throw error;
          }
          writeJson(response, 200, { ok: true });
        }).catch((error) => writeJson(
          response,
          Number.isInteger(error?.statusCode) ? error.statusCode : 500,
          { error: error instanceof Error ? error.message : String(error) },
        ));
        return;
      }
    }

    if (requestUrl.pathname === "/core-api/workspace/resource") {
      const resourcePath = requestUrl.searchParams.get("path") ?? "";
      if (request.method === "GET") {
        void workspaceResourcePath(context.workspaceRoot, resourcePath)
          .then(async (target) => {
            const targetStat = await stat(target);
            if (!targetStat.isFile()) {
              const error = new Error("O recurso solicitado não é um arquivo.");
              error.statusCode = 400;
              throw error;
            }
            response.statusCode = 200;
            response.setHeader("Content-Type", "application/octet-stream");
            response.setHeader("Content-Length", String(targetStat.size));
            response.setHeader("X-TinyIde-Last-Modified", String(targetStat.mtimeMs));
            response.setHeader("Cache-Control", "no-store");
            createReadStream(target).pipe(response);
          })
          .catch((error) => {
            if (!response.headersSent && !response.writableEnded) {
              writeJson(response, Number.isInteger(error?.statusCode) ? error.statusCode : 500, {
                error: error instanceof Error ? error.message : String(error),
              });
            }
          });
        return;
      }
      if (request.method === "PUT") {
        void Promise.all([
          workspaceResourcePath(context.workspaceRoot, resourcePath),
          readBinary(request),
        ]).then(async ([target, bytes]) => {
          const targetStat = await stat(target);
          if (!targetStat.isFile()) {
            const error = new Error("O recurso solicitado não é um arquivo.");
            error.statusCode = 400;
            throw error;
          }
          await writeFile(target, bytes);
          writeJson(response, 200, { ok: true });
        }).catch((error) => writeJson(
          response,
          Number.isInteger(error?.statusCode) ? error.statusCode : 500,
          { error: error instanceof Error ? error.message : String(error) },
        ));
        return;
      }
      if (request.method === "DELETE") {
        void workspaceResourcePath(context.workspaceRoot, resourcePath)
          .then(async (target) => {
            if (target === context.workspaceRoot) {
              const error = new Error("A raiz do workspace não pode ser removida.");
              error.statusCode = 400;
              throw error;
            }
            const targetStat = await stat(target);
            await rm(target, {
              recursive: targetStat.isDirectory() && requestUrl.searchParams.get("recursive") === "1",
              force: false,
            });
            writeJson(response, 200, { ok: true });
          })
          .catch((error) => writeJson(
            response,
            Number.isInteger(error?.statusCode) ? error.statusCode : 500,
            { error: error instanceof Error ? error.message : String(error) },
          ));
        return;
      }
    }

    if (requestUrl.pathname.startsWith("/core-api/")) {
      // Uma rejeição não tratada aqui derruba o processo Node inteiro — e com
      // ele todos os PTYs de terminal hospedados neste runtime.
      const apiPath = requestUrl.pathname.slice("/core-api".length);
      void Promise.resolve(userDataBackend(request, response, apiPath, scopeId))
        .then((handled) => handled ? undefined : context.executionBackend(request, response, apiPath))
        .catch((error) => {
          if (!response.headersSent && !response.writableEnded) {
            writeJson(response, 500, {error: error instanceof Error ? error.message : String(error)});
          }
        });
      return;
    }

    if (requestUrl.pathname.startsWith("/plugin-api/")) {
      if (!context.workspaceRoot) {
        writeJson(response, 409, {error: "Abra um workspace antes de usar este plugin."});
        return;
      }
      const segments = requestUrl.pathname.slice("/plugin-api/".length).split("/");
      let pluginId;
      try {
        pluginId = decodeURIComponent(segments.shift() ?? "");
      } catch {
        writeJson(response, 400, {error: "Identificador de plugin inválido."});
        return;
      }
      if (!/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(pluginId)) {
        writeJson(response, 400, {error: "Identificador de plugin inválido."});
        return;
      }
      const relativePath = `/${segments.join("/")}`;
      void resolveBackend(context, pluginId).then((handler) => {
        if (!handler) {
          writeJson(response, 404, {error: "Plugin backend not found."});
          return;
        }
        return handler(request, response, relativePath);
      }).catch((error) => {
        // Se o handler já respondeu, escrever de novo lançaria dentro do catch
        // e a rejeição não tratada derrubaria o processo (e os PTYs) inteiro.
        if (!response.headersSent && !response.writableEnded) {
          writeJson(response, 500, {error: error instanceof Error ? error.message : String(error)});
        }
      });
      return;
    }

    if (requestUrl.pathname === "/dev-plugins/index.json") {
      writeJson(response, 200, {
        plugins: cachedPluginDescriptors().map(({ directory }) => ({
          manifestUrl: `/dev-plugins/${encodeURIComponent(basename(directory))}/plugin.json`,
          bundled: Boolean(options.bundledPlugins),
        })),
      });
      return;
    }

    if (requestUrl.pathname.startsWith("/dev-plugins/")) {
      let requestedPluginPath;
      try {
        requestedPluginPath = decodeURIComponent(requestUrl.pathname.slice("/dev-plugins/".length));
      } catch {
        writeJson(response, 400, {error: "Caminho de plugin inválido."});
        return;
      }
      const absolutePath = safeFile(pluginsRoot, requestedPluginPath);
      if (!absolutePath || !serveFile(response, absolutePath)) {
        response.statusCode = 404;
        response.end("Plugin asset not found.");
      }
      return;
    }

    if (webRoot) {
      let requestedPath;
      try {
        requestedPath = requestUrl.pathname === "/" ? "index.html" : decodeURIComponent(requestUrl.pathname.slice(1));
      } catch {
        writeJson(response, 400, {error: "Caminho inválido."});
        return;
      }
      const absolutePath = safeFile(webRoot, requestedPath);
      if (absolutePath && serveFile(response, absolutePath)) return;
      const indexPath = join(webRoot, "index.html");
      if (serveFile(response, indexPath)) return;
    }

    next();
  };

  return {
    middleware,
    userDataRoot,
    pluginsRoot,
    webRoot,
    workspaceScopeId,
    initialScopeId,
    /**
     * Torna o workspace inicial resolvível por id antes de a primeira janela
     * abrir: sem o registro em disco, um reload apontando para `/w/<scopeId>`
     * não teria como redescobrir o caminho do projeto.
     */
    registerInitialWorkspaceScope() {
      return initialWorkspaceRoot
        ? registerWorkspaceScope(userDataRoot, initialWorkspaceRoot)
        : Promise.resolve(undefined);
    },
    // A API programática age sobre o workspace que o host embutiu via
    // `initialWorkspaceRoot` — não sobre o primeiro escopo que aparecer numa
    // requisição.
    get workspaceRoot() {
      return initialScopeId ? workspaceContext(initialScopeId).workspaceRoot : undefined;
    },
    setWorkspaceRoot(path) {
      const nextWorkspaceRoot = path ? resolve(path) : undefined;
      if (!nextWorkspaceRoot) return undefined;
      const context = workspaceContext(workspaceScopeId(nextWorkspaceRoot));
      if (nextWorkspaceRoot !== context.workspaceRoot) {
        void resetExecutionBackend(context);
        context.workspaceRoot = nextWorkspaceRoot;
        void disposeCachedBackends(context, "workspace-switch");
      }
      return context.workspaceRoot;
    },
    // Recarregar código de plugin invalida o backend de todos os workspaces:
    // cada um tem o próprio cache, e limpar só o do workspace do host deixaria
    // os demais rodando a versão antiga.
    clearBackendCache() {
      return Promise.allSettled([...workspaceContexts.values(), unscopedContext]
        .map((context) => disposeCachedBackends(context)));
    },
    clearManifestCache() { manifestCache = { expiresAt: 0, descriptors: [] }; },
    async dispose() {
      await Promise.allSettled([...workspaceContexts.values(), unscopedContext].flatMap((context) => [
        context.executionBackend.dispose?.(),
        disposeCachedBackends(context),
      ]));
      workspaceContexts.clear();
    },
  };
}

export async function startTinyIdeRuntime(options) {
  const runtime = createTinyIdeRuntime(options);
  await runtime.registerInitialWorkspaceScope();
  const server = createServer((request, response) => runtime.middleware(request, response));
  server.maxHeadersCount = 100;
  // O runtime só atende loopback e um único consumidor (o renderer). Manter o idle de
  // keep-alive acima do pool do Chromium evita a race em que o Node envia FIN no exato
  // instante em que o navegador reusa o socket — que chega ao cliente como
  // "Failed to fetch"/ERR_CONNECTION_RESET indistinguível de servidor fora do ar.
  server.keepAliveTimeout = 75_000;
  server.headersTimeout = 80_000; // precisa ser > keepAliveTimeout, senão fecha a conexão ociosa
  server.requestTimeout = 120_000; // precisa ser > headersTimeout; cobre git status/spawn lentos
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, options.host ?? "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Não foi possível determinar a porta do runtime.");
  return Object.assign(runtime, {
    server,
    host: address.address,
    port: address.port,
    url: `http://127.0.0.1:${address.port}`,
    async close() {
      await runtime.dispose();
      server.closeAllConnections?.();
      await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
    },
  });
}
