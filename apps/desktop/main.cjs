const { app, BrowserWindow, clipboard, dialog, ipcMain, session, shell } = require("electron");
const { randomUUID } = require("node:crypto");
const { existsSync, statSync } = require("node:fs");
const { mkdir, readFile, readdir, rm, stat, writeFile } = require("node:fs/promises");
const { basename, dirname, join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");
const { openInSystemFileManager } = require("./file-manager.cjs");
const { copyExternalEntries, readFileClipboard, writeFileClipboard } = require("./file-clipboard.cjs");
const { allowedExternalUrl, safeWorkspacePath: resolveSafeWorkspacePath, sameOriginUrl } = require("./security.cjs");
const {
  applyLoginShellEnvironment,
  configureProductionChromium,
  disableBrowserExtensions,
  installGracefulShutdown,
  installProductionWindowHardening,
  installSingleInstanceGuard,
  installWindowVisibilityFallback,
} = require("./startup.cjs");
const { readDesktopState, removeDesktopState, writeDesktopState } = require("./state-store.cjs");
const { createWorkspaceWatcher, DEFAULT_IGNORED_DIRECTORIES } = require("./workspace-watcher.cjs");

let runtime;
let mainWindow;
let browserExtensionGuard;
const desktopWorkspaces = new Map();
const desktopWorkspaceWatchers = new Map();
const desktopWorkspaceWatcherIgnores = new Map();
const LAST_WORKSPACE_STATE_KEY = "last-workspace";

function desktopStateRoot() {
  return join(app.getPath("userData"), "state");
}

function registeredWorkspace(token) {
  const root = desktopWorkspaces.get(token);
  if (!root) throw new Error("O workspace desktop não está mais registrado.");
  return root;
}

async function safeWorkspacePath(token, workspacePath = "") {
  const root = registeredWorkspace(token);
  return resolveSafeWorkspacePath(root, workspacePath);
}

function registeredWorkspaceRoot(rootPath) {
  if (typeof rootPath !== "string" || !rootPath.trim()) {
    throw new Error("O caminho do workspace e obrigatorio.");
  }
  const root = resolve(rootPath);
  if (![...desktopWorkspaces.values()].some((candidate) => resolve(candidate) === root)) {
    throw new Error("O workspace solicitado nao esta registrado.");
  }
  return root;
}

async function safeRegisteredWorkspacePath(rootPath, workspacePath = "") {
  return resolveSafeWorkspacePath(registeredWorkspaceRoot(rootPath), workspacePath);
}

function startWorkspaceWatcher(root, extraIgnoredDirectories = []) {
  return createWorkspaceWatcher(root, (paths) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed()) continue;
      window.webContents.send("tinyide:workspace:changed", { workspaceRoot: root, paths });
    }
  }, { extraIgnoredDirectories });
}

async function registerDesktopWorkspace(rootPath, { persist = true } = {}) {
  const root = resolve(rootPath);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error("O diretório selecionado não está disponível.");
  }
  const token = randomUUID();
  desktopWorkspaces.set(token, root);
  if (!desktopWorkspaceWatchers.has(root)) {
    desktopWorkspaceWatchers.set(root, startWorkspaceWatcher(root, desktopWorkspaceWatcherIgnores.get(root)));
  }
  if (persist) {
    await writeDesktopState(desktopStateRoot(), LAST_WORKSPACE_STATE_KEY, { path: root });
  }
  return { token, name: basename(root), path: root };
}

function installDesktopFileSystemHandlers() {
  const stateRoot = desktopStateRoot();

  ipcMain.on("tinyide:workspace:watcher:defaults", (event) => {
    event.returnValue = DEFAULT_IGNORED_DIRECTORIES;
  });

  ipcMain.handle("tinyide:state:read", async (_event, key) => readDesktopState(stateRoot, key));
  ipcMain.handle("tinyide:state:write", async (_event, key, value) => {
    await writeDesktopState(stateRoot, key, value);
    return true;
  });
  ipcMain.handle("tinyide:state:remove", async (_event, key) => {
    await removeDesktopState(stateRoot, key);
    return true;
  });

  ipcMain.handle("tinyide:workspace:pick", async () => {
    const testWorkspace = process.env.TINYIDE_TEST_WORKSPACE_PICKER_PATH?.trim();
    if (testWorkspace) return await registerDesktopWorkspace(testWorkspace);
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Abrir workspace",
      properties: ["openDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) return undefined;
    return await registerDesktopWorkspace(result.filePaths[0]);
  });

  ipcMain.handle("tinyide:workspace:restore", async (_event, rootPath) => {
    if (typeof rootPath !== "string" || !rootPath.trim()) return undefined;
    return await registerDesktopWorkspace(rootPath.trim());
  });

  ipcMain.handle("tinyide:workspace:restore-last", async () => {
    const stored = await readDesktopState(stateRoot, LAST_WORKSPACE_STATE_KEY);
    const rootPath = typeof stored?.path === "string" ? stored.path.trim() : "";
    if (!rootPath) return undefined;
    try {
      return await registerDesktopWorkspace(rootPath, { persist: false });
    } catch {
      await removeDesktopState(stateRoot, LAST_WORKSPACE_STATE_KEY);
      return undefined;
    }
  });

  ipcMain.handle("tinyide:workspace:open-window", async (_event, rootPath, sessionId) => {
    if (typeof rootPath !== "string" || !rootPath.trim()) throw new Error("O caminho do projeto é obrigatório.");
    if (typeof sessionId !== "string" || !/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(sessionId)) {
      throw new Error("Identificador de sessão inválido.");
    }
    const descriptor = await registerDesktopWorkspace(rootPath.trim());
    const target = new URL(runtime.url);
    target.searchParams.set("tinyideSession", sessionId);
    target.searchParams.set("tinyideOpenProject", `path:${descriptor.path}`);
    createWindow(target.href);
    return true;
  });

  ipcMain.handle("tinyide:workspace:list", async (_event, token, workspacePath) => {
    const directory = await safeWorkspacePath(token, workspacePath);
    const entries = await readdir(directory, { withFileTypes: true });
    const result = [];
    for (const entry of entries) {
      let kind = entry.isDirectory() ? "directory" : "file";
      if (entry.isSymbolicLink()) {
        try {
          kind = (await stat(join(directory, entry.name))).isDirectory() ? "directory" : "file";
        } catch {
          kind = "file";
        }
      }
      result.push({ name: entry.name, kind });
    }
    return result;
  });

  ipcMain.handle("tinyide:workspace:ensure-file", async (_event, token, workspacePath, create) => {
    const filePath = await safeWorkspacePath(token, workspacePath);
    if (create && !existsSync(filePath)) {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, new Uint8Array());
    }
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("O recurso solicitado não é um arquivo.");
    return true;
  });

  ipcMain.handle("tinyide:workspace:ensure-directory", async (_event, token, workspacePath, create) => {
    const directoryPath = await safeWorkspacePath(token, workspacePath);
    if (create) await mkdir(directoryPath, { recursive: true });
    const info = await stat(directoryPath);
    if (!info.isDirectory()) throw new Error("O recurso solicitado não é um diretório.");
    return true;
  });

  ipcMain.handle("tinyide:workspace:read-file", async (_event, token, workspacePath) => {
    const filePath = await safeWorkspacePath(token, workspacePath);
    const [data, info] = await Promise.all([readFile(filePath), stat(filePath)]);
    return {
      bytes: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      lastModified: info.mtimeMs,
    };
  });

  ipcMain.handle("tinyide:workspace:write-file", async (_event, token, workspacePath, bytes) => {
    const filePath = await safeWorkspacePath(token, workspacePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, Buffer.from(bytes));
    return true;
  });

  ipcMain.handle("tinyide:workspace:remove", async (_event, token, workspacePath, recursive) => {
    const target = await safeWorkspacePath(token, workspacePath);
    await rm(target, { recursive: recursive === true, force: false });
    return true;
  });

  ipcMain.handle("tinyide:workspace:clipboard-copy", async (_event, rootPath, workspacePaths) => {
    if (!Array.isArray(workspacePaths) || !workspacePaths.length) return false;
    const paths = await Promise.all(workspacePaths.map((workspacePath) => (
      safeRegisteredWorkspacePath(rootPath, workspacePath)
    )));
    return writeFileClipboard(clipboard, paths);
  });

  ipcMain.handle("tinyide:workspace:clipboard-paste", async (_event, rootPath, workspacePath) => {
    const sources = readFileClipboard(clipboard);
    if (!sources.length) return [];
    const target = await safeRegisteredWorkspacePath(rootPath, workspacePath);
    const copied = await copyExternalEntries(sources, target);
    return copied.map((entry) => ({
      ...entry,
      path: workspacePath ? `${workspacePath}/${entry.name}` : entry.name,
    }));
  });

  ipcMain.handle("tinyide:workspace:open-in-file-manager", async (_event, rootPath, workspacePath) => {
    const target = await safeRegisteredWorkspacePath(rootPath, workspacePath);
    const targetInfo = await stat(target);
    return openInSystemFileManager(shell, target, targetInfo);
  });

  ipcMain.handle("tinyide:workspace:watcher:configure", async (_event, rootPath, extraIgnoredDirectories) => {
    const root = registeredWorkspaceRoot(rootPath);
    const list = Array.isArray(extraIgnoredDirectories)
      ? extraIgnoredDirectories.filter((name) => typeof name === "string" && name.trim())
      : [];
    desktopWorkspaceWatcherIgnores.set(root, list);
    const existing = desktopWorkspaceWatchers.get(root);
    if (existing) await existing.close();
    desktopWorkspaceWatchers.set(root, startWorkspaceWatcher(root, list));
    return true;
  });
}

function initialWorkspaceRoot() {
  const configured = process.env.TINYIDE_WORKSPACE?.trim();
  if (!configured) return undefined;
  const candidate = resolve(configured);
  if (existsSync(candidate) && statSync(candidate).isDirectory()) return candidate;
  return undefined;
}

async function startRuntime() {
  const appRoot = app.getAppPath();
  const runtimeModuleUrl = pathToFileURL(join(appRoot, "packages/runtime-server/src/index.mjs")).href;
  const { startTinyIdeRuntime } = await import(runtimeModuleUrl);
  const selectedPort = Number(process.env.TINYIDE_RUNTIME_PORT);
  const initialWorkspace = initialWorkspaceRoot();
  const runtime = await startTinyIdeRuntime({
    hostRoot: appRoot,
    webRoot: join(appRoot, "apps/web/dist"),
    pluginsRoot: join(appRoot, "plugins"),
    userDataRoot: app.getPath("userData"),
    workspaceSearchRoot: process.env.TINYIDE_WORKSPACES_ROOT || app.getPath("home"),
    requireWorkspacePath: true,
    workspacePathAllowed(candidate) {
      return [...desktopWorkspaces.values()].some((root) => resolve(root) === resolve(candidate));
    },
    ...(initialWorkspace ? { initialWorkspaceRoot: initialWorkspace } : {}),
    bundledPlugins: true,
    host: "127.0.0.1",
    port: Number.isInteger(selectedPort) && selectedPort > 0 ? selectedPort : 0,
  });
  console.log(`[tinyIde] Runtime disponível em ${runtime.url}`);
  return runtime;
}

function createWindow(url) {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0e1116",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
      plugins: false,
      webviewTag: false,
    },
  });

  const productionHardening = installProductionWindowHardening(window, { packaged: app.isPackaged });

  window.webContents.setWindowOpenHandler(({ url: target }) => {
    if (allowedExternalUrl(target)) void shell.openExternal(target);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, target) => {
    if (sameOriginUrl(target, url)) return;
    event.preventDefault();
    if (allowedExternalUrl(target)) void shell.openExternal(target);
  });
  const showWindow = installWindowVisibilityFallback(window, { waitForRendererReady: true });
  const rendererReady = (event) => {
    if (event.sender !== window.webContents) return;
    ipcMain.removeListener("tinyide:renderer:ready", rendererReady);
    showWindow();
  };
  ipcMain.on("tinyide:renderer:ready", rendererReady);
  window.on("closed", () => {
    productionHardening.dispose();
    ipcMain.removeListener("tinyide:renderer:ready", rendererReady);
    if (mainWindow === window) mainWindow = undefined;
  });
  void window.loadURL(url);
  return window;
}

configureProductionChromium(app);
const isPrimaryInstance = installSingleInstanceGuard(app, () => mainWindow);

if (isPrimaryInstance) {
  applyLoginShellEnvironment();
  app.whenReady().then(async () => {
    browserExtensionGuard = disableBrowserExtensions(session.defaultSession);
    installDesktopFileSystemHandlers();
    runtime = await startRuntime();
    mainWindow = createWindow(runtime.url);
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow(runtime.url);
    });
  }).catch((error) => {
    console.error(error);
    app.exit(1);
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  installGracefulShutdown(app, async () => {
    browserExtensionGuard?.dispose();
    await Promise.allSettled([...desktopWorkspaceWatchers.values()].map((watcher) => watcher.close()));
    desktopWorkspaceWatchers.clear();
    if (runtime) await runtime.close();
  });
}
