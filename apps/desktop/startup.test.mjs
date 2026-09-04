import { EventEmitter } from "node:events";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  applyLoginShellEnvironment,
  configureProductionChromium,
  disableBrowserExtensions,
  installGracefulShutdown,
  installProductionWindowHardening,
  installSingleInstanceGuard,
  installWindowVisibilityFallback,
  isDeveloperShortcut,
  loginShellEnvironment,
  parseNullSeparatedEnvironment,
} = require("./startup.cjs");

function createWindow() {
  const window = new EventEmitter();
  window.webContents = new EventEmitter();
  window.isDestroyed = vi.fn(() => false);
  window.isMinimized = vi.fn(() => false);
  window.isVisible = vi.fn(() => false);
  window.restore = vi.fn();
  window.show = vi.fn();
  window.focus = vi.fn();
  return window;
}

function extractInstalledLauncher() {
  const source = readFileSync(new URL("../../build/after-install.sh", import.meta.url), "utf8");
  const match = source.match(/cat > \/usr\/bin\/tinyide <<'EOF'\n([\s\S]*?)\nEOF/);
  if (!match) throw new Error("tinyIde launcher was not found in after-install.sh");
  return match[1];
}

function runInstalledLauncher(ozonePlatform) {
  const directory = mkdtempSync(join(tmpdir(), "tinyide-launcher-"));
  const launcherPath = join(directory, "tinyide");
  const executablePath = join(directory, "electron-stub");
  const capturePath = join(directory, "arguments.txt");
  writeFileSync(launcherPath, extractInstalledLauncher(), "utf8");
  writeFileSync(executablePath, "#!/bin/sh\nprintf '%s\\n' \"$@\" > \"$TINYIDE_CAPTURE\"\n", "utf8");
  chmodSync(launcherPath, 0o755);
  chmodSync(executablePath, 0o755);

  const env = {
    ...process.env,
    TINYIDE_EXECUTABLE: executablePath,
    TINYIDE_CAPTURE: capturePath,
  };
  if (ozonePlatform === undefined) delete env.TINYIDE_OZONE_PLATFORM;
  else env.TINYIDE_OZONE_PLATFORM = ozonePlatform;

  const result = spawnSync(launcherPath, ["--example"], {
    env,
    encoding: "utf8",
  });
  expect(result.status).toBe(0);
  return readFileSync(capturePath, "utf8").trim().split("\n");
}

describe("desktop startup", () => {
  it("packages complete plugin source trees required by frontend imports", () => {
    const rootPackage = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    expect(rootPackage.build.files).toContain("plugins/*/src/**/*");
  });

  it("uses package.json as the shared version source for the UI and Debian artifact", () => {
    const rootPackage = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    const viteConfig = readFileSync(new URL("../web/vite.config.mjs", import.meta.url), "utf8");
    const applicationSource = readFileSync(new URL("../web/src/app/App.tsx", import.meta.url), "utf8");

    expect(rootPackage.build.artifactName).toContain("${version}");
    expect(viteConfig).toContain('readFileSync(join(hostRoot, "package.json"), "utf8")');
    expect(applicationSource).toContain("import.meta.env.VITE_TINYIDE_APP_VERSION");
    expect(applicationSource).not.toMatch(/Versão\s+0\.4\.0/);
  });

  it("parses and applies the login-shell environment used by graphical launches", () => {
    expect(parseNullSeparatedEnvironment("PATH=/home/dev/.nvm/bin:/usr/bin\0NVM_BIN=/home/dev/.nvm/bin\0invalid\0"))
      .toEqual({ PATH: "/home/dev/.nvm/bin:/usr/bin", NVM_BIN: "/home/dev/.nvm/bin" });

    const spawnSyncFunction = vi.fn(() => ({
      status: 0,
      stdout: "PATH=/home/dev/.nvm/bin:/usr/bin\0NVM_BIN=/home/dev/.nvm/bin\0",
    }));
    expect(loginShellEnvironment({ shell: "/bin/bash", spawnSyncFunction })).toEqual({
      PATH: "/home/dev/.nvm/bin:/usr/bin",
      NVM_BIN: "/home/dev/.nvm/bin",
    });
    expect(spawnSyncFunction).toHaveBeenCalledWith(
      "/bin/bash",
      ["-ilc", "env -0"],
      expect.objectContaining({ encoding: "utf8" }),
    );

    const targetEnvironment = { PATH: "/usr/bin" };
    applyLoginShellEnvironment({ targetEnvironment, shell: "/bin/bash", spawnSyncFunction });
    expect(targetEnvironment).toEqual({
      PATH: "/home/dev/.nvm/bin:/usr/bin",
      NVM_BIN: "/home/dev/.nvm/bin",
    });
  });

  it("keeps the current environment when login-shell discovery fails", () => {
    const targetEnvironment = { PATH: "/usr/bin" };
    const loaded = applyLoginShellEnvironment({
      targetEnvironment,
      spawnSyncFunction: vi.fn(() => ({ status: 1, stdout: "" })),
    });
    expect(loaded).toEqual({});
    expect(targetEnvironment).toEqual({ PATH: "/usr/bin" });
  });

  it("disables browser debugging and extensions in packaged builds", () => {
    const commandLine = {
      appendSwitch: vi.fn(),
      removeSwitch: vi.fn(),
    };
    expect(configureProductionChromium({ isPackaged: true, commandLine })).toBe(true);
    expect(commandLine.removeSwitch).toHaveBeenCalledWith("remote-debugging-port");
    expect(commandLine.removeSwitch).toHaveBeenCalledWith("remote-debugging-pipe");
    expect(commandLine.appendSwitch).toHaveBeenCalledWith("disable-extensions");
    expect(commandLine.appendSwitch).toHaveBeenCalledWith("disable-plugins");

    commandLine.appendSwitch.mockClear();
    commandLine.removeSwitch.mockClear();
    expect(configureProductionChromium({ isPackaged: false, commandLine })).toBe(false);
    expect(commandLine.appendSwitch).not.toHaveBeenCalled();
    expect(commandLine.removeSwitch).not.toHaveBeenCalled();
  });

  it("blocks developer shortcuts and closes DevTools in packaged windows", () => {
    expect(isDeveloperShortcut({ key: "F12" })).toBe(true);
    expect(isDeveloperShortcut({ key: "I", control: true, shift: true })).toBe(true);
    expect(isDeveloperShortcut({ key: "C", meta: true, shift: true })).toBe(true);
    expect(isDeveloperShortcut({ key: "I", control: true })).toBe(false);

    const window = createWindow();
    window.webContents.closeDevTools = vi.fn();
    const hardening = installProductionWindowHardening(window, { packaged: true });
    const event = { preventDefault: vi.fn() };
    window.webContents.emit("before-input-event", event, { key: "F12" });
    window.webContents.emit("devtools-opened");
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(window.webContents.closeDevTools).toHaveBeenCalledOnce();
    hardening.dispose();
    expect(window.webContents.listenerCount("before-input-event")).toBe(0);
    expect(window.webContents.listenerCount("devtools-opened")).toBe(0);
  });

  it("keeps development windows and sessions untouched", () => {
    const window = createWindow();
    const hardening = installProductionWindowHardening(window, {packaged: false});
    const extensionGuard = disableBrowserExtensions(undefined);

    expect(() => hardening.dispose()).not.toThrow();
    expect(() => extensionGuard.dispose()).not.toThrow();
    expect(window.webContents.listenerCount("before-input-event")).toBe(0);
  });

  it("disposes packaged window hardening after BrowserWindow destruction", () => {
    const window = createWindow();
    const webContents = window.webContents;
    webContents.closeDevTools = vi.fn();
    webContents.isDestroyed = vi.fn(() => true);
    const hardening = installProductionWindowHardening(window, { packaged: true });

    Object.defineProperty(window, "webContents", {
      configurable: true,
      get() {
        throw new TypeError("Object has been destroyed");
      },
    });

    expect(() => hardening.dispose()).not.toThrow();
    expect(() => hardening.dispose()).not.toThrow();
  });

  it("removes loaded browser extensions and rejects extensions loaded later", () => {
    const extensions = new EventEmitter();
    extensions.getAllExtensions = vi.fn(() => [{ id: "one" }, { id: "two" }]);
    extensions.removeExtension = vi.fn();
    const guard = disableBrowserExtensions({ extensions });
    expect(extensions.removeExtension).toHaveBeenCalledWith("one");
    expect(extensions.removeExtension).toHaveBeenCalledWith("two");
    extensions.emit("extension-loaded", {}, { id: "three" });
    expect(extensions.removeExtension).toHaveBeenCalledWith("three");
    guard.dispose();
    expect(extensions.listenerCount("extension-loaded")).toBe(0);
  });

  it("exits immediately when another tinyIde instance already owns the lock", () => {
    const application = new EventEmitter();
    application.requestSingleInstanceLock = vi.fn(() => false);
    application.quit = vi.fn();

    expect(installSingleInstanceGuard(application, () => undefined)).toBe(false);
    expect(application.quit).toHaveBeenCalledOnce();
    expect(application.listenerCount("second-instance")).toBe(0);
  });

  it("restores and focuses the existing window when a second instance starts", () => {
    const application = new EventEmitter();
    application.requestSingleInstanceLock = vi.fn(() => true);
    application.quit = vi.fn();
    const window = createWindow();
    window.isMinimized.mockReturnValue(true);

    expect(installSingleInstanceGuard(application, () => window)).toBe(true);
    application.emit("second-instance");

    expect(application.quit).not.toHaveBeenCalled();
    expect(window.restore).toHaveBeenCalledOnce();
    expect(window.show).toHaveBeenCalledOnce();
    expect(window.focus).toHaveBeenCalledOnce();
  });

  it("waits for runtime cleanup before exiting the desktop process", async () => {
    const application = new EventEmitter();
    application.exit = vi.fn();
    let releaseCleanup;
    const cleanup = vi.fn(() => new Promise((resolve) => { releaseCleanup = resolve; }));
    const shutdown = installGracefulShutdown(application, cleanup);
    const event = { preventDefault: vi.fn() };

    application.emit("before-quit", event);
    application.emit("before-quit", event);
    await Promise.resolve();
    expect(event.preventDefault).toHaveBeenCalledTimes(2);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(application.exit).not.toHaveBeenCalled();

    releaseCleanup();
    await shutdown();
    expect(application.exit).toHaveBeenCalledWith(0);
  });

  it("logs cleanup failures and still exits the desktop process", async () => {
    const application = new EventEmitter();
    application.exit = vi.fn();
    const logger = {error: vi.fn()};
    const shutdown = installGracefulShutdown(
      application,
      vi.fn(async () => { throw new Error("cleanup failed"); }),
      {logger},
    );

    application.emit("before-quit", {preventDefault: vi.fn()});
    await shutdown();

    expect(logger.error).toHaveBeenCalledWith(
      "[tinyIde] Falha ao encerrar recursos:",
      expect.objectContaining({message: "cleanup failed"}),
    );
    expect(application.exit).toHaveBeenCalledWith(0);
  });

  it("uses x11 when the installed launcher has no ozone environment override", () => {
    expect(runInstalledLauncher(undefined)).toEqual([
      "--ozone-platform=x11",
      "--example",
    ]);
  });

  it("passes explicit ozone choices without producing an empty platform argument", () => {
    expect(runInstalledLauncher("wayland")).toEqual([
      "--ozone-platform=wayland",
      "--example",
    ]);
    expect(runInstalledLauncher("auto")).toEqual(["--example"]);
  });

  it("shows the window when the renderer finishes loading", () => {
    const window = createWindow();
    const clearTimeoutFunction = vi.fn();
    installWindowVisibilityFallback(window, {
      setTimeoutFunction: vi.fn(() => ({ unref: vi.fn() })),
      clearTimeoutFunction,
    });
    window.webContents.emit("did-finish-load");
    window.emit("ready-to-show");
    expect(window.show).toHaveBeenCalledOnce();
    window.emit("closed");
    expect(clearTimeoutFunction).toHaveBeenCalledOnce();
  });

  it("uses the timeout when neither Electron visibility event arrives", () => {
    const window = createWindow();
    let timeoutCallback;
    const timer = { unref: vi.fn() };
    installWindowVisibilityFallback(window, {
      setTimeoutFunction: vi.fn((callback) => {
        timeoutCallback = callback;
        return timer;
      }),
    });
    expect(timer.unref).toHaveBeenCalledOnce();
    timeoutCallback();
    expect(window.show).toHaveBeenCalledOnce();
  });

  it("keeps a compiled window hidden until the renderer reports restored state", () => {
    const window = createWindow();
    let timeoutCallback;
    const show = installWindowVisibilityFallback(window, {
      waitForRendererReady: true,
      setTimeoutFunction: vi.fn((callback) => {
        timeoutCallback = callback;
        return { unref: vi.fn() };
      }),
    });

    window.emit("ready-to-show");
    window.webContents.emit("did-finish-load");
    expect(window.show).not.toHaveBeenCalled();

    show();
    expect(window.show).toHaveBeenCalledOnce();
    timeoutCallback();
    expect(window.show).toHaveBeenCalledOnce();
  });

  it("logs main-frame load and renderer failures without reopening destroyed windows", () => {
    const window = createWindow();
    const logger = { error: vi.fn() };
    installWindowVisibilityFallback(window, {
      setTimeoutFunction: vi.fn(() => ({ unref: vi.fn() })),
      logger,
    });
    window.webContents.emit("did-fail-load", {}, -2, "ERR_FAILED", "http://127.0.0.1/", true);
    window.webContents.emit("render-process-gone", {}, { reason: "crashed" });
    expect(window.show).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledTimes(2);

    const destroyed = createWindow();
    destroyed.isDestroyed.mockReturnValue(true);
    installWindowVisibilityFallback(destroyed, {
      setTimeoutFunction: vi.fn((callback) => {
        callback();
        return undefined;
      }),
    });
    expect(destroyed.show).not.toHaveBeenCalled();
  });
});
