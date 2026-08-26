import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { parentPort, workerData } from "node:worker_threads";
import { createWorkspacePluginConfiguration } from "./execution-backend.mjs";

if (!parentPort) throw new Error("Plugin backend worker requires a parent port.");

const activeRequests = new Map();
let backendHandler;

function serializedError(error) {
  return {
    message: error instanceof Error ? error.message : String(error),
    ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
  };
}

function requestFromMessage(message) {
  const body = message.body ? Buffer.from(message.body, "base64") : Buffer.alloc(0);
  const request = Readable.from(body.length ? [body] : []);
  request.method = message.method;
  request.url = message.url;
  request.headers = message.headers ?? {};
  return request;
}

class WorkerResponse extends EventEmitter {
  constructor(id) {
    super();
    this.id = id;
    this.statusCode = 200;
    this.headersSent = false;
    this.writableEnded = false;
    this.headers = new Map();
  }

  setHeader(name, value) {
    this.headers.set(String(name).toLowerCase(), value);
    return this;
  }

  getHeader(name) {
    return this.headers.get(String(name).toLowerCase());
  }

  end(chunk = "") {
    if (this.writableEnded) return this;
    this.headersSent = true;
    this.writableEnded = true;
    const body = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    parentPort.postMessage({
      type: "response",
      id: this.id,
      statusCode: this.statusCode,
      headers: [...this.headers.entries()],
      body: body.toString("base64"),
    });
    this.emit("finish");
    return this;
  }
}

async function initialize() {
  const imported = await import(workerData.backendUrl);
  if (typeof imported.createBackend !== "function") {
    throw new Error(`Plugin backend must export createBackend(): ${workerData.pluginId}`);
  }
  backendHandler = imported.createBackend({
    workspaceRoot: workerData.workspaceRoot,
    configuration: createWorkspacePluginConfiguration(workerData.workspaceRoot, workerData.pluginId),
  });
  parentPort.postMessage({ type: "ready" });
}

async function handleRequest(message) {
  const request = requestFromMessage(message);
  const response = new WorkerResponse(message.id);
  activeRequests.set(message.id, { request, response });
  try {
    await backendHandler(request, response, message.relativePath);
    if (!response.writableEnded) {
      response.end();
    }
  } catch (error) {
    if (!response.writableEnded) {
      parentPort.postMessage({ type: "request-error", id: message.id, error: serializedError(error) });
    }
  } finally {
    activeRequests.delete(message.id);
  }
}

async function dispose(reason) {
  if (typeof backendHandler?.dispose === "function") {
    await backendHandler.dispose(reason ? { reason } : undefined);
  }
}

parentPort.on("message", (message) => {
  if (!message || typeof message !== "object") return;
  if (message.type === "request") {
    void handleRequest(message);
    return;
  }
  if (message.type === "abort") {
    const active = activeRequests.get(message.id);
    active?.request.emit("aborted");
    active?.response.emit("close");
    return;
  }
  if (message.type === "dispose") {
    void dispose(message.reason)
      .then(() => parentPort.postMessage({ type: "disposed", id: message.id }))
      .catch((error) => parentPort.postMessage({ type: "dispose-error", id: message.id, error: serializedError(error) }));
  }
});

void initialize().catch((error) => {
  parentPort.postMessage({ type: "startup-error", error: serializedError(error) });
});
