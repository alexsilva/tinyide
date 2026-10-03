import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { BACKEND_WORKER_RESOURCE_LIMITS, CHANNEL_RESTART_CLOSE_CODE, createPluginBackendProxy, sanitizeCloseCode } from "./plugin-backend-proxy.mjs";

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

/** Conexão WebSocket de mentira: só o que o proxy usa (send/close/eventos). */
class FakeConnection extends EventEmitter {
  constructor() {
    super();
    this.sent = [];
    this.closed = false;
    this.closure = undefined;
  }

  send(data) {
    if (this.closed) return false;
    this.sent.push(data);
    return true;
  }

  close(code, reason) {
    if (this.closed) return;
    this.closed = true;
    this.closure = [code, reason];
    this.emit("close", code, reason);
  }

  async nextSent(timeoutMs = 2_000) {
    const deadline = Date.now() + timeoutMs;
    while (!this.sent.length) {
      if (Date.now() > deadline) throw new Error("O backend não enviou nada pelo canal.");
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    return this.sent.shift();
  }

  async closedEventually(timeoutMs = 2_000) {
    const deadline = Date.now() + timeoutMs;
    while (!this.closed) {
      if (Date.now() > deadline) throw new Error("O canal não fechou.");
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    return this.closure;
  }
}

test("bridges channel messages between the connection and the backend worker", async () => {
  const proxy = createProxy();
  const connection = new FakeConnection();
  try {
    expect(await proxy.supportsChannels()).toBe(true);
    await proxy.openChannel({
      relativePath: "/channel/echo",
      url: "/channel/echo?offset=3",
      headers: { "x-fixture": "header-value" },
      connection,
    });
    expect(JSON.parse(await connection.nextSent())).toEqual({
      hello: "/channel/echo",
      url: "/channel/echo?offset=3",
      header: "header-value",
    });
    connection.emit("message", "ping", false);
    expect(await connection.nextSent()).toBe("echo:ping");
    connection.emit("message", Buffer.from([1, 2, 3]), true);
    const reversed = await connection.nextSent();
    expect([...reversed]).toEqual([3, 2, 1]);
    connection.emit("message", "close-me", false);
    expect(await connection.closedEventually()).toEqual([4000, "closed by backend"]);
  } finally {
    await proxy.dispose({ reason: "test" });
  }
});

test("closes channels the backend rejects or fails to open", async () => {
  const proxy = createProxy();
  const rejected = new FakeConnection();
  const failed = new FakeConnection();
  try {
    await proxy.openChannel({ relativePath: "/channel/reject", url: "/channel/reject", headers: {}, connection: rejected });
    expect(await rejected.closedEventually()).toEqual([4404, "fixture channel rejected"]);
    await proxy.openChannel({ relativePath: "/channel/throw", url: "/channel/throw", headers: {}, connection: failed });
    expect(await failed.closedEventually()).toEqual([1011, "fixture channel failed"]);
  } finally {
    await proxy.dispose({ reason: "test" });
  }
});

test("closes open channels with 1012 when the backend is disposed", async () => {
  const proxy = createProxy();
  const connection = new FakeConnection();
  await proxy.openChannel({ relativePath: "/channel/echo", url: "/channel/echo", headers: {}, connection });
  await connection.nextSent();
  await proxy.dispose({ reason: "test" });
  expect(connection.closed).toBe(true);
  expect(connection.closure[0]).toBe(CHANNEL_RESTART_CLOSE_CODE);
  const late = new FakeConnection();
  await proxy.openChannel({ relativePath: "/channel/echo", url: "/channel/echo", headers: {}, connection: late });
  expect(late.closure[0]).toBe(CHANNEL_RESTART_CLOSE_CODE);
});

test("closes open channels with 1012 when the backend worker dies", async () => {
  const proxy = createProxy();
  const connection = new FakeConnection();
  await proxy.openChannel({ relativePath: "/channel/echo", url: "/channel/echo", headers: {}, connection });
  await connection.nextSent();
  await expect(proxy(request("GET", "/exit-worker"), new TestResponse(), "/exit-worker")).rejects.toThrow(/código 7/);
  expect(await connection.closedEventually()).toEqual([CHANNEL_RESTART_CLOSE_CODE, expect.stringContaining("código 7")]);
  expect(proxy.isDead()).toBe(true);
  await proxy.dispose({ reason: "test" });
});

test("closes channels with 1011 when the backend failed to start", async () => {
  const proxy = createPluginBackendProxy({
    backendPath: fixturePath("plugin-backend-proxy.invalid-fixture.mjs"),
    workspaceRoot: process.cwd(),
    pluginId: "test.invalid",
  });
  const connection = new FakeConnection();
  try {
    await proxy.openChannel({ relativePath: "/x", url: "/x", headers: {}, connection });
    expect(connection.closure).toEqual([1011, expect.stringContaining("Plugin backend must export createBackend()")]);
  } finally {
    await proxy.dispose({ reason: "test" });
  }
});

test("forwards client-side closes to the backend and stops bridging afterwards", async () => {
  const proxy = createProxy();
  const connection = new FakeConnection();
  try {
    await proxy.openChannel({ relativePath: "/channel/echo", url: "/channel/echo", headers: {}, connection });
    await connection.nextSent();
    // O navegador fechou: o backend vê o código e a razão originais, e nada
    // que a conexão ainda emita depois disso chega ao worker.
    connection.close(1001, "going away");
    connection.emit("message", "late", false);
    const lastClose = async () => {
      const response = new TestResponse();
      await proxy(request("GET", "/channel/last-close"), response, "/channel/last-close");
      return JSON.parse(response.body.toString("utf8"));
    };
    await expect.poll(lastClose, { timeout: 2_000 }).toEqual({ code: 1001, reason: "going away" });
    expect(connection.sent).toEqual([]);
  } finally {
    await proxy.dispose({ reason: "test" });
  }
});

test("reports missing channel support without opening a worker channel", async () => {
  const proxy = createProxy({ backendPath: fixturePath("plugin-backend-proxy.no-channel-fixture.mjs") });
  const connection = new FakeConnection();
  try {
    expect(await proxy.supportsChannels()).toBe(false);
    await proxy.openChannel({ relativePath: "/x", url: "/x", headers: {}, connection });
    expect(connection.closure).toEqual([1011, "O backend deste plugin não oferece canais."]);
  } finally {
    await proxy.dispose({ reason: "test" });
  }
});

test("sanitizes close codes the browser would refuse", () => {
  expect(sanitizeCloseCode(1000)).toBe(1000);
  expect(sanitizeCloseCode(1012)).toBe(1012);
  expect(sanitizeCloseCode(4404)).toBe(4404);
  expect(sanitizeCloseCode(1005)).toBe(1000);
  expect(sanitizeCloseCode(1006)).toBe(1000);
  expect(sanitizeCloseCode(2000)).toBe(1000);
  expect(sanitizeCloseCode("abc")).toBe(1000);
});
