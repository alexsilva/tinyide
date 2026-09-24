export function createBackend() {
  return async (_request, _response, relativePath) => {
    if (relativePath === "/never") {
      await new Promise(() => {});
      return;
    }
  };
}
