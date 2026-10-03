import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { parentPort, workerData } from "node:worker_threads";
import { createWorkspacePluginConfiguration } from "./execution-backend.mjs";

if (!parentPort) throw new Error("Plugin backend worker requires a parent port.");

const activeRequests = new Map();
const runtimeRequests = new Map();
const channels = new Map();
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

function runtimeRequest(method, payload) {
  const id = randomUUID();
  const promise = new Promise((resolve, reject) => runtimeRequests.set(id, { resolve, reject }));
  parentPort.postMessage({ type: "runtime-request", id, method, payload });
  return promise;
}

function mcpToolCatalog() {
  const tools = Array.isArray(backendHandler?.mcpTools) ? backendHandler.mcpTools : [];
  return tools.flatMap((tool) => {
    if (!tool || typeof tool !== "object" || typeof tool.name !== "string" || typeof tool.invoke !== "function") return [];
    return [{
      name: tool.name,
      label: typeof tool.label === "string" ? tool.label : tool.name,
      description: typeof tool.description === "string" ? tool.description : "",
      ...(tool.inputSchema && typeof tool.inputSchema === "object" ? { inputSchema: tool.inputSchema } : {}),
      ...(tool.outputSchema && typeof tool.outputSchema === "object" ? { outputSchema: tool.outputSchema } : {}),
      ...(tool.annotations && typeof tool.annotations === "object" ? { annotations: tool.annotations } : {}),
      defaultEnabled: tool.defaultEnabled !== false,
    }];
  });
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

  abort() {
    if (this.writableEnded) return;
    this.writableEnded = true;
    this.emit("close");
  }
}

/**
 * Lado do backend de um canal WebSocket aberto pelo frontend do plugin. O
 * socket real vive no processo principal; aqui chegam só as mensagens, pelo
 * `parentPort`. Eventos: `message(data, isBinary)` e `close(code, reason)`.
 */
class WorkerChannel extends EventEmitter {
  constructor(id, { relativePath, url, headers }) {
    super();
    this.id = id;
    this.relativePath = relativePath;
    this.url = url;
    this.headers = headers ?? {};
    this.closed = false;
  }

  send(data) {
    if (this.closed) return false;
    const binary = Buffer.isBuffer(data) || data instanceof Uint8Array;
    parentPort.postMessage({
      type: "channel-message",
      id: this.id,
      data: binary ? new Uint8Array(data) : String(data),
      binary,
    });
    return true;
  }

  close(code = 1000, reason = "") {
    if (this.closed) return;
    this.closed = true;
    channels.delete(this.id);
    parentPort.postMessage({ type: "channel-close", id: this.id, code, reason });
    this.emit("close", code, reason);
  }

  receive(data, binary) {
    if (this.closed) return;
    this.emit("message", binary ? Buffer.from(data) : data, binary);
  }

  remoteClosed(code, reason) {
    if (this.closed) return;
    this.closed = true;
    channels.delete(this.id);
    this.emit("close", code, reason);
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
    runtime: {
      mcpTools: {
        list: () => runtimeRequest("mcp-tools:list"),
        invoke: (name, args) => runtimeRequest("mcp-tools:invoke", { name, args }),
      },
    },
  });
  parentPort.postMessage({ type: "ready", channels: typeof backendHandler?.openChannel === "function" });
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

async function handleChannelOpen(message) {
  const channel = new WorkerChannel(message.id, message);
  channels.set(message.id, channel);
  if (typeof backendHandler?.openChannel !== "function") {
    channel.close(1011, "O backend deste plugin não oferece canais.");
    return;
  }
  try {
    await backendHandler.openChannel(channel, message.relativePath);
  } catch (error) {
    channel.close(1011, error instanceof Error ? error.message : String(error));
  }
}

async function dispose(reason) {
  if (typeof backendHandler?.dispose === "function") {
    await backendHandler.dispose(reason ? { reason } : undefined);
  }
}

async function handleControl(message) {
  try {
    if (message.action === "mcp-tools:list") {
      parentPort.postMessage({ type: "control-response", id: message.id, result: mcpToolCatalog() });
      return;
    }
    if (message.action === "mcp-tools:invoke") {
      const tools = Array.isArray(backendHandler?.mcpTools) ? backendHandler.mcpTools : [];
      const tool = tools.find((candidate) => candidate?.name === message.payload?.name && typeof candidate?.invoke === "function");
      if (!tool) throw Object.assign(new Error("Ferramenta MCP não encontrada no backend do plugin."), { statusCode: 404 });
      const result = await tool.invoke(message.payload?.args ?? {});
      parentPort.postMessage({ type: "control-response", id: message.id, result });
      return;
    }
    throw new Error(`Ação de controle desconhecida: ${message.action}`);
  } catch (error) {
    parentPort.postMessage({ type: "control-error", id: message.id, error: serializedError(error) });
  }
}

parentPort.on("message", (message) => {
  if (!message || typeof message !== "object") return;
  if (message.type === "runtime-response" || message.type === "runtime-error") {
    const pending = runtimeRequests.get(message.id);
    if (!pending) return;
    runtimeRequests.delete(message.id);
    if (message.type === "runtime-error") pending.reject(errorFromRuntimePayload(message.error));
    else pending.resolve(message.result);
    return;
  }
  if (message.type === "control") {
    void handleControl(message);
    return;
  }
  if (message.type === "request") {
    void handleRequest(message);
    return;
  }
  if (message.type === "abort") {
    const active = activeRequests.get(message.id);
    if (!active) return;
    activeRequests.delete(message.id);
    active.request.emit("aborted");
    active.response.abort();
    return;
  }
  if (message.type === "channel-open") {
    void handleChannelOpen(message);
    return;
  }
  if (message.type === "channel-message") {
    channels.get(message.id)?.receive(message.data, message.binary === true);
    return;
  }
  if (message.type === "channel-close") {
    channels.get(message.id)?.remoteClosed(message.code ?? 1005, message.reason ?? "");
    return;
  }
  if (message.type === "dispose") {
    void dispose(message.reason)
      .then(() => parentPort.postMessage({ type: "disposed", id: message.id }))
      .catch((error) => parentPort.postMessage({ type: "dispose-error", id: message.id, error: serializedError(error) }));
  }
});

function errorFromRuntimePayload(payload) {
  const error = new Error(payload?.message ?? "Falha em serviço interno do runtime.");
  if (payload?.stack) error.stack = payload.stack;
  return error;
}

void initialize().catch((error) => {
  parentPort.postMessage({ type: "startup-error", error: serializedError(error) });
});
