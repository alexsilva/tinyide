import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { createPluginBackendProxy } from "./plugin-backend-proxy.mjs";

class TestResponse extends EventEmitter {
  constructor() {
    super();
    this.writableEnded = false;
    this.statusCode = 200;
    this.headers = new Map();
  }

  setHeader(name, value) {
    this.headers.set(name, value);
  }

  end() {
    this.writableEnded = true;
  }
}

test("aborted plugin requests reject immediately instead of staying pending", async () => {
  const backendPath = fileURLToPath(new URL("./plugin-backend-proxy.test-fixture.mjs", import.meta.url));
  const proxy = createPluginBackendProxy({
    backendPath,
    workspaceRoot: process.cwd(),
    pluginId: "test.abort",
  });
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
