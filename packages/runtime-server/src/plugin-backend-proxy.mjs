import { randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";
import { pathToFileURL } from "node:url";

const DISPOSE_TIMEOUT_MS = 2_000;

function errorFromPayload(payload, fallback) {
  const error = new Error(payload?.message ?? fallback);
  if (payload?.stack) error.stack = payload.stack;
  return error;
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return chunks.length ? Buffer.concat(chunks) : Buffer.alloc(0);
}

export function createPluginBackendProxy({ backendPath, workspaceRoot, pluginId }) {
  const worker = new Worker(new URL("./plugin-backend-worker.mjs", import.meta.url), {
    workerData: {
      backendUrl: pathToFileURL(backendPath).href,
      workspaceRoot,
      pluginId,
    },
  });
  const requests = new Map();
  const control = new Map();
  let disposed = false;
  let startupError;
  let readyResolve;
  let readyReject;
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });

  const failPending = (error) => {
    for (const pending of requests.values()) pending.reject(error);
    requests.clear();
    for (const pending of control.values()) pending.reject(error);
    control.clear();
  };

  worker.on("message", (message) => {
    if (!message || typeof message !== "object") return;
    if (message.type === "ready") {
      readyResolve();
      return;
    }
    if (message.type === "startup-error") {
      startupError = errorFromPayload(message.error, `Falha ao iniciar backend do plugin '${pluginId}'.`);
      readyReject(startupError);
      failPending(startupError);
      return;
    }
    if (message.type === "response" || message.type === "request-error") {
      const pending = requests.get(message.id);
      if (!pending) return;
      requests.delete(message.id);
      if (message.type === "request-error") {
        pending.reject(errorFromPayload(message.error, `Falha no backend do plugin '${pluginId}'.`));
      } else {
        pending.resolve(message);
      }
      return;
    }
    if (message.type === "disposed" || message.type === "dispose-error") {
      const pending = control.get(message.id);
      if (!pending) return;
      control.delete(message.id);
      if (message.type === "dispose-error") {
        pending.reject(errorFromPayload(message.error, `Falha ao descartar backend do plugin '${pluginId}'.`));
      } else {
        pending.resolve();
      }
    }
  });
  worker.on("error", (error) => {
    readyReject(error);
    failPending(error);
  });
  worker.on("exit", (code) => {
    if (disposed) return;
    const error = startupError ?? new Error(`Backend do plugin '${pluginId}' terminou inesperadamente com código ${code}.`);
    readyReject(error);
    failPending(error);
  });

  const proxy = async (request, response, relativePath) => {
    if (disposed) throw new Error(`Backend do plugin '${pluginId}' já foi descartado.`);
    await ready;
    const body = await readRequestBody(request);
    const id = randomUUID();
    const resultPromise = new Promise((resolve, reject) => requests.set(id, { resolve, reject }));
    const abort = () => {
      if (requests.has(id)) worker.postMessage({ type: "abort", id });
    };
    request.once?.("aborted", abort);
    response.once?.("close", abort);
    worker.postMessage({
      type: "request",
      id,
      method: request.method,
      url: request.url,
      headers: request.headers,
      relativePath,
      body: body.toString("base64"),
    });
    try {
      const result = await resultPromise;
      if (response.writableEnded) return;
      response.statusCode = result.statusCode;
      for (const [name, value] of result.headers ?? []) response.setHeader(name, value);
      response.end(result.body ? Buffer.from(result.body, "base64") : undefined);
    } finally {
      request.off?.("aborted", abort);
      response.off?.("close", abort);
    }
  };

  proxy.dispose = async ({ reason } = {}) => {
    if (disposed) return;
    disposed = true;
    let timer;
    try {
      await ready.catch(() => undefined);
      if (!startupError && worker.threadId !== -1) {
        const id = randomUUID();
        const disposedPromise = new Promise((resolve, reject) => control.set(id, { resolve, reject }));
        worker.postMessage({ type: "dispose", id, reason });
        await Promise.race([
          disposedPromise,
          new Promise((resolve) => { timer = setTimeout(resolve, DISPOSE_TIMEOUT_MS); }),
        ]);
      }
    } finally {
      if (timer) clearTimeout(timer);
      failPending(new Error(`Backend do plugin '${pluginId}' foi reiniciado.`));
      await worker.terminate().catch(() => undefined);
    }
  };

  return proxy;
}
