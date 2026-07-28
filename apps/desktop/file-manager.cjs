const { dirname } = require("node:path");

async function openInSystemFileManager(shell, target, targetInfo) {
  if (targetInfo.isDirectory()) {
    const failure = await shell.openPath(target);
    if (failure) throw new Error(failure);
    return { directory: target, selected: false };
  }

  shell.showItemInFolder(target);
  return { directory: dirname(target), selected: true };
}

module.exports = {
  openInSystemFileManager,
};
