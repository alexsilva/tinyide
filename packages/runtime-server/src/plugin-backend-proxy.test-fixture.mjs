export function createBackend({ runtime }) {
  const handler = async (request, response, relativePath) => {
    if (relativePath === "/never") {
      await new Promise(() => {});
      return;
    }
    if (relativePath === "/echo") {
      const chunks = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      response.statusCode = 201;
      response.setHeader("x-fixture", "ok");
      response.end(Buffer.concat(chunks));
      return;
    }
    if (relativePath === "/throw") {
      throw new Error("fixture request failed");
    }
    if (relativePath === "/exit-worker") {
      process.exit(7);
    }
  };
  handler.mcpTools = [
    {
      name: "echo",
      label: "Echo",
      description: "Returns its arguments.",
      inputSchema: { type: "object" },
      defaultEnabled: true,
      invoke: async (args) => args,
    },
    {
      name: "runtime-list",
      invoke: async () => runtime.mcpTools.list(),
    },
    {
      name: "runtime-invoke",
      invoke: async (args) => runtime.mcpTools.invoke("upstream", args),
    },
  ];
  handler.dispose = async ({ reason } = {}) => {
    if (reason === "fail") throw new Error("fixture dispose failed");
    if (reason === "never") await new Promise(() => {});
  };
  return handler;
}
