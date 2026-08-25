import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { mkdir, readFile, realpath, readdir, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { basename, dirname, extname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { createExecutionBackend, createWorkspacePluginConfiguration } from "./execution-backend.mjs";
import { createUserDataBackend, defaultTinyIdeUserDataRoot } from "./user-data-backend.mjs";

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
const DEFAULT_SESSION_ID = "default";
const SESSION_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/i;

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
  const userDataBackend = createUserDataBackend({ root: userDataRoot });
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

  const sessionContexts = new Map();
  // O workspace inicial pertence a uma sessão específica: o host que embute o
  // runtime escolhe qual. O desktop nomeia a própria janela principal, então
  // amarrar o bootstrap ao id "default" deixaria `TINYIDE_WORKSPACE` sem efeito.
  const initialSessionId = options.initialSessionId ?? DEFAULT_SESSION_ID;
  function createSessionContext(sessionId) {
    const context = {
      sessionId,
      workspaceRoot: sessionId === initialSessionId && options.initialWorkspaceRoot
        ? resolve(options.initialWorkspaceRoot)
        : undefined,
      backendHandlers: new Map(),
      executionBackend: undefined,
    };
    context.executionBackend = createExecutionBackend({ workspaceRoot: () => context.workspaceRoot });
    return context;
  }
  function sessionContext(sessionId = DEFAULT_SESSION_ID) {
    let context = sessionContexts.get(sessionId);
    if (!context) {
      context = createSessionContext(sessionId);
      sessionContexts.set(sessionId, context);
    }
    return context;
  }
  async function resetExecutionBackend(context) {
    await context.executionBackend.dispose?.();
    context.executionBackend = createExecutionBackend({ workspaceRoot: () => context.workspaceRoot });
  }
  function requestSessionId(request) {
    const value = request.headers["x-tinyide-session-id"];
    const sessionId = Array.isArray(value) ? value[0] : value;
    if (!sessionId) return DEFAULT_SESSION_ID;
    if (!SESSION_ID_PATTERN.test(sessionId)) throw new Error("Identificador de sessão inválido.");
    return sessionId;
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
    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    let context;
    try {
      context = sessionContext(requestSessionId(request));
    } catch (error) {
      writeJson(response, 400, {error: error instanceof Error ? error.message : String(error)});
      return;
    }

    if ((requestUrl.pathname.startsWith("/core-api/") || requestUrl.pathname.startsWith("/plugin-api/"))
      && !requestOriginAllowed(request)) {
      writeJson(response, 403, {error: "Origem da requisição não autorizada."});
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/core-api/workspace") {
      void readJson(request).then(async (payload) => {
        const nextWorkspaceRoot = resolveWorkspaceSelection(payload);
        if (nextWorkspaceRoot !== context.workspaceRoot) {
          await disposeCachedBackends(context, "workspace-switch");
          await resetExecutionBackend(context);
          context.workspaceRoot = nextWorkspaceRoot;
        }
        writeJson(response, 200, {workspaceRoot: context.workspaceRoot});
      }).catch((error) => writeJson(
        response,
        Number.isInteger(error?.statusCode) ? error.statusCode : 400,
        {error: error instanceof Error ? error.message : String(error)},
      ));
      return;
    }

    if (request.method === "DELETE" && requestUrl.pathname === "/core-api/workspace") {
      void disposeCachedBackends(context, "workspace-switch").then(() => {
        return resetExecutionBackend(context);
      }).then(() => {
        context.workspaceRoot = undefined;
        writeJson(response, 204, undefined);
      }).catch((error) => writeJson(response, 500, {error: error instanceof Error ? error.message : String(error)}));
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
      void Promise.resolve(userDataBackend(request, response, apiPath))
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
    // A API programática age sobre a sessão que o host embutiu (a janela
    // principal do desktop, ou "default" no servidor de desenvolvimento) — não
    // sobre a primeira sessão que aparecer numa requisição.
    get workspaceRoot() { return sessionContext(initialSessionId).workspaceRoot; },
    setWorkspaceRoot(path) {
      const context = sessionContext(initialSessionId);
      const nextWorkspaceRoot = path ? resolve(path) : undefined;
      if (nextWorkspaceRoot !== context.workspaceRoot) {
        void resetExecutionBackend(context);
        context.workspaceRoot = nextWorkspaceRoot;
        void disposeCachedBackends(context, "workspace-switch");
      }
      return context.workspaceRoot;
    },
    // Recarregar código de plugin invalida o backend de todas as sessões: cada
    // janela tem o próprio cache, e limpar só o da sessão do host deixaria as
    // demais rodando a versão antiga.
    clearBackendCache() {
      return Promise.allSettled([...sessionContexts.values()]
        .map((context) => disposeCachedBackends(context)));
    },
    clearManifestCache() { manifestCache = { expiresAt: 0, descriptors: [] }; },
    async dispose() {
      await Promise.allSettled([...sessionContexts.values()].flatMap((context) => [
        context.executionBackend.dispose?.(),
        disposeCachedBackends(context),
      ]));
      sessionContexts.clear();
    },
  };
}

export async function startTinyIdeRuntime(options) {
  const runtime = createTinyIdeRuntime(options);
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
