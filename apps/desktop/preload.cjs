const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("tinyideDesktop", {
  watcherDefaultIgnoredDirectories: ipcRenderer.sendSync("tinyide:workspace:watcher:defaults"),
  configureWorkspaceWatcher(rootPath, extraIgnoredDirectories) {
    return ipcRenderer.invoke("tinyide:workspace:watcher:configure", rootPath, extraIgnoredDirectories);
  },
  readState(key) {
    return ipcRenderer.invoke("tinyide:state:read", key);
  },
  writeState(key, value) {
    return ipcRenderer.invoke("tinyide:state:write", key, value);
  },
  removeState(key) {
    return ipcRenderer.invoke("tinyide:state:remove", key);
  },
  notifyReady() {
    ipcRenderer.send("tinyide:renderer:ready");
  },
  pickDirectory(defaultPath) {
    return ipcRenderer.invoke("tinyide:workspace:pick", defaultPath);
  },
  restoreDirectory(path) {
    return ipcRenderer.invoke("tinyide:workspace:restore", path);
  },
  restoreLastDirectory() {
    return ipcRenderer.invoke("tinyide:workspace:restore-last");
  },
  openProjectWindow(path, sessionId) {
    return ipcRenderer.invoke("tinyide:workspace:open-window", path, sessionId);
  },
  listDirectory(token, path) {
    return ipcRenderer.invoke("tinyide:workspace:list", token, path);
  },
  ensureFile(token, path, create) {
    return ipcRenderer.invoke("tinyide:workspace:ensure-file", token, path, create);
  },
  ensureDirectory(token, path, create) {
    return ipcRenderer.invoke("tinyide:workspace:ensure-directory", token, path, create);
  },
  readFile(token, path) {
    return ipcRenderer.invoke("tinyide:workspace:read-file", token, path);
  },
  writeFile(token, path, bytes) {
    return ipcRenderer.invoke("tinyide:workspace:write-file", token, path, bytes);
  },
  removeEntry(token, path, recursive) {
    return ipcRenderer.invoke("tinyide:workspace:remove", token, path, recursive);
  },
  copyWorkspaceResources(rootPath, paths) {
    return ipcRenderer.invoke("tinyide:workspace:clipboard-copy", rootPath, paths);
  },
  pasteWorkspaceResources(rootPath, targetPath) {
    return ipcRenderer.invoke("tinyide:workspace:clipboard-paste", rootPath, targetPath);
  },
  subscribeWorkspaceChanges(listener) {
    const handleChange = (_event, change) => listener(change);
    ipcRenderer.on("tinyide:workspace:changed", handleChange);
    return () => ipcRenderer.removeListener("tinyide:workspace:changed", handleChange);
  },
  openInFileManager(rootPath, path) {
    return ipcRenderer.invoke("tinyide:workspace:open-in-file-manager", rootPath, path);
  },
  getPathForFile(file) {
    return webUtils.getPathForFile(file);
  },
});
