import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { BACKEND_WORKER_RESOURCE_LIMITS, createPluginBackendProxy } from "./plugin-backend-proxy.mjs";

class TestResponse extends EventEmitter {
  constructor() {
    super();
    this.writableEnded = false;
    this.statusCode = 200;
    this.headers = new Map();
    this.body = Buffer.alloc(0);
  }

  setHeader(name, value) {
    this.headers.set(name, value);
  }

  end(body) {
    this.body = body ? Buffer.from(body) : Buffer.alloc(0);
    this.writableEnded = true;
  }
}

function fixturePath(name = "plugin-backend-proxy.test-fixture.mjs") {
  return fileURLToPath(new URL(`./${name}`, import.meta.url));
}

function createProxy(options = {}) {
  return createPluginBackendProxy({
    backendPath: fixturePath(),
    workspaceRoot: process.cwd(),
    pluginId: "test.proxy",
    ...options,
  });
}

function request(method, url, body = "") {
  const stream = Readable.from(body ? [body] : []);
  stream.method = method;
  stream.url = url;
  stream.headers = { "content-type": "text/plain" };
  return stream;
}

test("forwards plugin backend responses, headers and request bodies", async () => {
  const proxy = createProxy();
  const response = new TestResponse();
  try {
    await proxy(request("POST", "/echo", "payload"), response, "/echo");
    expect(response.statusCode).toBe(201);
    expect(response.headers.get("x-fixture")).toBe("ok");
    expect(response.body.toString()).toBe("payload");
  } finally {
    await proxy.dispose({ reason: "test" });
  }
});

test("propagates request errors from the backend worker", async () => {
  const proxy = createProxy();
  try {
    await expect(
      proxy(request("GET", "/throw"), new TestResponse(), "/throw"),
    ).rejects.toThrow("fixture request failed");
  } finally {
    await proxy.dispose({ reason: "test" });
  }
});

test("lists and invokes MCP tools through worker control messages", async () => {
  const runtimeCalls = [];
  const proxy = createProxy({
    runtimeRequest: async (method, payload) => {
      runtimeCalls.push([method, payload]);
      if (method === "mcp-tools:list") return [{ name: "upstream" }];
      return { method, payload };
    },
  });
  try {
    const catalog = await proxy.listMcpTools();
    expect(catalog.map((tool) => tool.name)).toEqual(["echo", "runtime-list", "runtime-invoke"]);
    expect(await proxy.invokeMcpTool("echo", { value: 42 })).toEqual({ value: 42 });
    expect(await proxy.invokeMcpTool("runtime-list")).toEqual([{ name: "upstream" }]);
    expect(await proxy.invokeMcpTool("runtime-invoke", { value: "x" })).toEqual({
      method: "mcp-tools:invoke",
      payload: { name: "upstream", args: { value: "x" } },
    });
    expect(runtimeCalls).toEqual([
      ["mcp-tools:list", undefined],
      ["mcp-tools:invoke", { name: "upstream", args: { value: "x" } }],
    ]);
    await expect(proxy.invokeMcpTool("missing", {})).rejects.toThrow("Ferramenta MCP não encontrada");
  } finally {
    await proxy.dispose({ reason: "test" });
  }
});

test("returns runtime service errors back through MCP invocation", async () => {
  const proxy = createProxy({
    runtimeRequest: async () => {
      throw new Error("runtime service failed");
    },
  });
  try {
    await expect(proxy.invokeMcpTool("runtime-list")).rejects.toThrow("runtime service failed");
  } finally {
    await proxy.dispose({ reason: "test" });
  }
});

test("reports startup failures for invalid backend modules", async () => {
  const proxy = createPluginBackendProxy({
    backendPath: fixturePath("plugin-backend-proxy.invalid-fixture.mjs"),
    workspaceRoot: process.cwd(),
    pluginId: "test.invalid",
  });
  await expect(
    proxy(request("GET", "/"), new TestResponse(), "/"),
  ).rejects.toThrow("Plugin backend must export createBackend()");
  await proxy.dispose({ reason: "test" });
});

test("fails pending requests when the backend worker exits unexpectedly", async () => {
  const proxy = createProxy();
  await expect(
    proxy(request("GET", "/exit-worker"), new TestResponse(), "/exit-worker"),
  ).rejects.toThrow(/terminou inesperadamente com código 7/);
  expect(proxy.isDead()).toBe(true);
  await proxy.dispose({ reason: "test" });
});

test("backend workers run under the shared memory ceiling", async () => {
  const proxy = createProxy();
  const response = new TestResponse();
  try {
    await proxy(request("GET", "/heap-limit"), response, "/heap-limit");
    const heapLimit = Number(response.body.toString());
    const ceiling = BACKEND_WORKER_RESOURCE_LIMITS.maxOldGenerationSizeMb * 1024 * 1024;
    // O limite efetivo soma old space e semi-spaces: aceita a margem, mas não
    // o default do V8 (~4 GB), que é o que vigora quando o teto não é aplicado.
    expect(heapLimit).toBeGreaterThanOrEqual(ceiling);
    expect(heapLimit).toBeLessThan(ceiling * 1.5);
  } finally {
    await proxy.dispose({ reason: "test" });
  }
});

test("a backend that exhausts its memory fails recoverably instead of aborting the host", async () => {
  const proxy = createProxy({ pluginId: "test.oom" });
  try {
    await expect(
      proxy(request("GET", "/exhaust-memory"), new TestResponse(), "/exhaust-memory"),
    ).rejects.toThrow(/excedeu o limite de memória|terminou inesperadamente/);
    expect(proxy.isDead()).toBe(true);
  } finally {
    await proxy.dispose({ reason: "test" });
  }
}, 30_000);

test("propagates dispose errors and makes disposal idempotent", async () => {
  const proxy = createProxy();
  await expect(proxy.dispose({ reason: "fail" })).rejects.toThrow("fixture dispose failed");
  await expect(proxy.dispose({ reason: "again" })).resolves.toBeUndefined();
  await expect(
    proxy(request("GET", "/echo"), new TestResponse(), "/echo"),
  ).rejects.toThrow("já foi descartado");
});

test("forces worker termination when backend disposal does not finish", async () => {
  const proxy = createProxy();
  const startedAt = Date.now();
  await proxy.dispose({ reason: "never" });
  const elapsed = Date.now() - startedAt;
  expect(elapsed).toBeGreaterThanOrEqual(1_500);
  expect(elapsed).toBeLessThan(4_000);
});

test("aborted plugin requests reject immediately instead of staying pending", async () => {
  const proxy = createProxy({ pluginId: "test.abort" });
  const request = Readable.from([]);
  request.method = "GET";
  request.url = "/never";
  request.headers = {};
  const response = new TestResponse();

  const pending = proxy(request, response, "/never");
  const deadline = Date.now() + 2_000;
  while (response.listenerCount("close") === 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(response.listenerCount("close")).toBeGreaterThan(0);
  response.emit("close");
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });

  // A resposta tardia do worker não deve manter o proxy bloqueado nem impedir
  // o descarte do runtime do plugin.
  await proxy.dispose({ reason: "test" });
});
