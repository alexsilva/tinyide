import type { PluginBackendChannel, PluginBackendChannelCloseEvent } from "@tinyide/plugin-api";
import { TransientRuntimeError } from "./transient-failure";

/**
 * Lado do navegador de um canal de plugin: um WebSocket com a mesma identidade
 * de escopo das requisições (`/w/<scopeId>/plugin-api/<pluginId>/…`).
 *
 * A API `WebSocket` do navegador não entrega o status HTTP de um upgrade
 * recusado — toda falha chega como `close` com código 1006 —, então a recusa
 * vira um erro transitório com `statusCode` 503: quem reconecta com recuo
 * continua tentando, e quem precisa de um resultado imediato cai para
 * `request`.
 */

type WebSocketConstructor = new (url: string) => WebSocket;

export interface OpenRuntimeChannelOptions {
  readonly signal?: AbortSignal | undefined;
  readonly WebSocketImpl?: WebSocketConstructor | undefined;
}

const OPEN_STATE = 1;

export function runtimeChannelUrl(path: string, baseUrl: string): string {
  const url = new URL(path, baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
}

export function openRuntimeChannel(url: string, options: OpenRuntimeChannelOptions = {}): Promise<PluginBackendChannel> {
  const Impl = options.WebSocketImpl ?? (typeof WebSocket === "function" ? WebSocket : undefined);
  if (!Impl) {
    return Promise.reject(Object.assign(new Error("Este ambiente não oferece WebSocket."), { statusCode: 501 }));
  }
  if (options.signal?.aborted) {
    return Promise.reject(options.signal.reason ?? new Error("Canal cancelado antes de abrir."));
  }
  return new Promise((resolve, reject) => {
    let socket: WebSocket;
    try {
      socket = new Impl(url);
    } catch (cause) {
      reject(Object.assign(new TransientRuntimeError("O runtime local não aceitou o canal.", { cause }), { statusCode: 503 }));
      return;
    }
    let opened = false;
    let closed = false;
    const messageListeners = new Set<(data: string) => void>();
    const closeListeners = new Set<(event: PluginBackendChannelCloseEvent) => void>();

    const channel: PluginBackendChannel = {
      get closed() {
        return closed;
      },
      send(data) {
        if (closed || socket.readyState !== OPEN_STATE) return false;
        socket.send(data);
        return true;
      },
      close(code = 1000, reason = "") {
        if (closed) return;
        try {
          socket.close(code, reason);
        } catch {
          socket.close();
        }
      },
      onMessage(listener) {
        messageListeners.add(listener);
        return { dispose: () => { messageListeners.delete(listener); } };
      },
      onClose(listener) {
        closeListeners.add(listener);
        return { dispose: () => { closeListeners.delete(listener); } };
      },
    };

    const onAbort = () => channel.close(1000, "workspace mudou");
    options.signal?.addEventListener("abort", onAbort, { once: true });

    socket.addEventListener("open", () => {
      opened = true;
      resolve(channel);
    });
    socket.addEventListener("message", (event: MessageEvent) => {
      if (typeof event.data !== "string") return;
      for (const listener of [...messageListeners]) listener(event.data);
    });
    socket.addEventListener("close", (event: CloseEvent) => {
      closed = true;
      options.signal?.removeEventListener("abort", onAbort);
      if (!opened) {
        reject(Object.assign(
          new TransientRuntimeError("O runtime local não aceitou o canal.", { cause: event }),
          { statusCode: 503, code: event.code, reason: event.reason },
        ));
        return;
      }
      const detail = { code: event.code, reason: event.reason ?? "" };
      for (const listener of [...closeListeners]) listener(detail);
    });
    // `error` nunca vem sozinho: o `close` que o segue carrega o código.
    socket.addEventListener("error", () => undefined);
  });
}
