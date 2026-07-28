const { spawnSync } = require("node:child_process");

const DEFAULT_WINDOW_SHOW_TIMEOUT_MS = 3_000;
const LOGIN_SHELL_ENV_TIMEOUT_MS = 5_000;
const PRODUCTION_CHROMIUM_SWITCHES = Object.freeze([
  "disable-extensions",
  "disable-component-extensions-with-background-pages",
  "disable-plugins",
]);
const DEBUG_CHROMIUM_SWITCHES = Object.freeze([
  "auto-open-devtools-for-tabs",
  "remote-debugging-address",
  "remote-debugging-pipe",
  "remote-debugging-port",
]);

function parseNullSeparatedEnvironment(value) {
  const environment = {};
  for (const rawEntry of String(value ?? "").split("\0")) {
    const entry = rawEntry.includes("\n") ? rawEntry.slice(rawEntry.lastIndexOf("\n") + 1) : rawEntry;
    const separator = entry.indexOf("=");
    if (separator <= 0) continue;
    const name = entry.slice(0, separator);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
    environment[name] = entry.slice(separator + 1);
  }
  return environment;
}

function loginShellEnvironment({
  platform = process.platform,
  shell = process.env.SHELL,
  currentEnvironment = process.env,
  spawnSyncFunction = spawnSync,
} = {}) {
  if (platform === "win32") return {};
  const executable = typeof shell === "string" && shell.trim() ? shell.trim() : "/bin/sh";
  const result = spawnSyncFunction(executable, ["-ilc", "env -0"], {
    env: currentEnvironment,
    encoding: "utf8",
    timeout: LOGIN_SHELL_ENV_TIMEOUT_MS,
    windowsHide: true,
  });
  if (result?.status !== 0 || typeof result?.stdout !== "string") return {};
  return parseNullSeparatedEnvironment(result.stdout);
}

function applyLoginShellEnvironment(options = {}) {
  const targetEnvironment = options.targetEnvironment ?? process.env;
  const loaded = loginShellEnvironment(options);
  Object.assign(targetEnvironment, loaded);
  return loaded;
}

function configureProductionChromium(application, { packaged = application.isPackaged } = {}) {
  if (!packaged) return false;
  for (const name of DEBUG_CHROMIUM_SWITCHES) application.commandLine.removeSwitch(name);
  for (const name of PRODUCTION_CHROMIUM_SWITCHES) application.commandLine.appendSwitch(name);
  return true;
}

function isDeveloperShortcut(input = {}) {
  const key = String(input.key ?? "").toLowerCase();
  if (key === "f12") return true;
  const commandModifier = input.control === true || input.meta === true;
  return commandModifier && input.shift === true && ["c", "i", "j"].includes(key);
}

function installProductionWindowHardening(window, { packaged = true } = {}) {
  if (!packaged) return { dispose() {} };
  const onBeforeInputEvent = (event, input) => {
    if (isDeveloperShortcut(input)) event.preventDefault();
  };
  const onDevToolsOpened = () => window.webContents.closeDevTools();
  window.webContents.on("before-input-event", onBeforeInputEvent);
  window.webContents.on("devtools-opened", onDevToolsOpened);
  return {
    dispose() {
      window.webContents.removeListener("before-input-event", onBeforeInputEvent);
      window.webContents.removeListener("devtools-opened", onDevToolsOpened);
    },
  };
}

function disableBrowserExtensions(targetSession) {
  const extensions = targetSession?.extensions;
  if (!extensions) return { dispose() {} };
  const remove = (extension) => {
    if (!extension?.id) return;
    try { extensions.removeExtension(extension.id); } catch {}
  };
  for (const extension of extensions.getAllExtensions()) remove(extension);
  const onLoaded = (_event, extension) => remove(extension);
  extensions.on("extension-loaded", onLoaded);
  return {
    dispose() {
      extensions.removeListener("extension-loaded", onLoaded);
    },
  };
}

function focusExistingWindow(window) {
  if (!window || window.isDestroyed()) return false;
  if (window.isMinimized()) window.restore();
  if (!window.isVisible()) window.show();
  window.focus();
  return true;
}

function installSingleInstanceGuard(application, getWindow) {
  const isPrimaryInstance = application.requestSingleInstanceLock();
  if (!isPrimaryInstance) {
    application.quit();
    return false;
  }

  application.on("second-instance", () => {
    focusExistingWindow(getWindow());
  });
  return true;
}

function installGracefulShutdown(application, closeResources, { logger = console } = {}) {
  let shutdownCompleted = false;
  let shutdownPromise;
  application.on("before-quit", (event) => {
    if (shutdownCompleted) return;
    event.preventDefault();
    if (shutdownPromise) return;
    shutdownPromise = Promise.resolve()
      .then(closeResources)
      .catch((error) => logger.error("[tinyIde] Falha ao encerrar recursos:", error))
      .finally(() => {
        shutdownCompleted = true;
        application.exit(0);
      });
  });
  return () => shutdownPromise;
}

function installWindowVisibilityFallback(window, {
  timeoutMs = DEFAULT_WINDOW_SHOW_TIMEOUT_MS,
  waitForRendererReady = false,
  setTimeoutFunction = setTimeout,
  clearTimeoutFunction = clearTimeout,
  logger = console,
} = {}) {
  let shown = false;
  const show = () => {
    if (shown || window.isDestroyed()) return;
    shown = true;
    if (!window.isVisible()) window.show();
  };

  const timer = setTimeoutFunction(show, timeoutMs);
  timer?.unref?.();
  if (!waitForRendererReady) {
    window.once("ready-to-show", show);
    window.webContents.once("did-finish-load", show);
  }
  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    if (isMainFrame === false) return;
    logger.error(`[tinyIde] Falha ao carregar a janela (${errorCode}): ${errorDescription} - ${validatedUrl}`);
    show();
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    logger.error(`[tinyIde] Renderer encerrado: ${details?.reason ?? "motivo desconhecido"}`);
  });
  window.once("closed", () => clearTimeoutFunction(timer));
  return show;
}

module.exports = {
  DEBUG_CHROMIUM_SWITCHES,
  DEFAULT_WINDOW_SHOW_TIMEOUT_MS,
  LOGIN_SHELL_ENV_TIMEOUT_MS,
  PRODUCTION_CHROMIUM_SWITCHES,
  applyLoginShellEnvironment,
  configureProductionChromium,
  disableBrowserExtensions,
  focusExistingWindow,
  installGracefulShutdown,
  installProductionWindowHardening,
  installSingleInstanceGuard,
  installWindowVisibilityFallback,
  isDeveloperShortcut,
  loginShellEnvironment,
  parseNullSeparatedEnvironment,
};
