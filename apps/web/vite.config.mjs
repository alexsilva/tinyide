import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createTinyIdeRuntime } from "../../packages/runtime-server/src/index.mjs";

const configDirectory = dirname(fileURLToPath(import.meta.url));
const hostRoot = resolve(configDirectory, "../..");
const pluginsRoot = resolve(hostRoot, "plugins");
const appVersion = JSON.parse(readFileSync(join(hostRoot, "package.json"), "utf8")).version;
const reactRefreshPreamble = react.preambleCode.replace("__BASE__", "/");
const reactRefreshHash = `'sha256-${createHash("sha256").update(reactRefreshPreamble).digest("base64")}'`;

function pluginFrontendEntries() {
  return readdirSync(pluginsRoot).flatMap((directoryName) => {
    const directory = join(pluginsRoot, directoryName);
    const manifestPath = join(directory, "plugin.json");
    if (!existsSync(manifestPath) || !statSync(manifestPath).isFile()) return [];
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      const frontend = manifest?.entrypoints?.frontend;
      if (typeof frontend !== "string") return [];
      const entry = resolve(directory, frontend);
      return entry.startsWith(`${directory}${sep}`) && existsSync(entry) ? [entry] : [];
    } catch {
      return [];
    }
  });
}

function installTransformedPluginModules(server) {
  server.middlewares.use(async (request, response, next) => {
    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    if (!requestUrl.pathname.startsWith("/dev-plugins/") || ![".js", ".mjs"].includes(extname(requestUrl.pathname))) {
      next();
      return;
    }
    let requestedPath;
    try {
      requestedPath = decodeURIComponent(requestUrl.pathname.slice("/dev-plugins/".length));
    } catch {
      response.statusCode = 400;
      response.end("Invalid plugin module path.");
      return;
    }
    const absolutePath = resolve(pluginsRoot, requestedPath);
    if (!absolutePath.startsWith(`${pluginsRoot}${sep}`) || !existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
      next();
      return;
    }
    try {
      const transformed = await server.transformRequest(absolutePath);
      if (!transformed) {
        next();
        return;
      }
      response.statusCode = 200;
      response.setHeader("Content-Type", "text/javascript; charset=utf-8");
      response.setHeader("Cache-Control", "no-store");
      response.end(transformed.code);
    } catch (error) {
      next(error);
    }
  });
}

function runtimePlugin() {
  const runtime = createTinyIdeRuntime({
    hostRoot,
    pluginsRoot,
    workspaceSearchRoot: process.env.TINYIDE_WORKSPACES_ROOT ?? dirname(hostRoot),
    inlineScriptHashes: [reactRefreshHash],
  });

  function install(server) {
    installTransformedPluginModules(server);
    server.middlewares.use(runtime.middleware);
    const watchedPluginFiles = readdirSync(pluginsRoot).flatMap((directoryName) => [
      join(pluginsRoot, directoryName, "plugin.json"),
      join(pluginsRoot, directoryName, "dist/frontend.js"),
      join(pluginsRoot, directoryName, "src/backend.mjs"),
    ]).filter(existsSync);
    server.watcher.add(watchedPluginFiles);
    server.watcher.on("all", (eventName, changedPath) => {
      if (!["add", "change", "unlink"].includes(eventName)) return;
      const normalizedChangedPath = normalize(changedPath);
      if (!normalizedChangedPath.startsWith(`${pluginsRoot}${sep}`)) return;
      if (
        normalizedChangedPath.endsWith(`${sep}plugin.json`)
        || normalizedChangedPath.endsWith(`${sep}dist${sep}frontend.js`)
      ) {
        // Backends são isolados por plugin em workers. O runtime compara o
        // mtime do entrypoint em cada chamada e reinicia somente o worker do
        // plugin alterado. Um backend não muda a UI e, portanto, não deve
        // recarregar a página inteira nem perturbar recursos vivos de outros
        // plugins (por exemplo, PTYs do Terminal).
        if (normalizedChangedPath.endsWith(`${sep}plugin.json`)) runtime.clearManifestCache();
        server.ws.send({type: "full-reload", path: "*"});
      }
    });
  }

  return {
    name: "tinyide-runtime-server",
    configureServer: install,
    configurePreviewServer(server) {
      server.middlewares.use(runtime.middleware);
    },
  };
}

export default defineConfig({
  cacheDir: resolve(hostRoot, ".tmp/vite-web"),
  define: {
    "import.meta.env.VITE_TINYIDE_APP_VERSION": JSON.stringify(appVersion),
  },
  plugins: [react(), runtimePlugin()],
  optimizeDeps: {
    entries: [resolve(configDirectory, "index.html"), ...pluginFrontendEntries()],
  },
  server: {
    host: "0.0.0.0",
    port: 5174,
    strictPort: false,
    open: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    strictPort: true,
    open: true,
  },
});
