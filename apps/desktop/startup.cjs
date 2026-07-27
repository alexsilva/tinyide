const DEFAULT_WINDOW_SHOW_TIMEOUT_MS = 3_000;

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
  DEFAULT_WINDOW_SHOW_TIMEOUT_MS,
  focusExistingWindow,
  installSingleInstanceGuard,
  installWindowVisibilityFallback,
};
