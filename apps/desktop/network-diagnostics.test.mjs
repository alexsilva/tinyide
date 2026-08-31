import {createRequire} from "node:module";
import {describe, expect, it, vi} from "vitest";

const require = createRequire(import.meta.url);
const {installNetworkDiagnostics} = require("./network-diagnostics.cjs");

function webRequestStub() {
  const listeners = [];
  return {
    listeners,
    onErrorOccurred(filter, listener) {
      if (filter === null) {
        listeners.length = 0;
        return;
      }
      listeners.push({filter, listener});
    },
  };
}

describe("diagnóstico de rede do desktop", () => {
  it("registra o código do Chromium e a rota de cada falha", async () => {
    const webRequest = webRequestStub();
    const write = vi.fn(async () => undefined);
    const onEntry = vi.fn();
    const diagnostics = installNetworkDiagnostics({
      webRequest,
      runtimeOrigin: "http://127.0.0.1:42329",
      logPath: "/tmp/tinyide/network-errors.log",
      write,
      onEntry,
      timestamp: () => "2026-08-26T13:00:00.000Z",
    });

    expect(webRequest.listeners[0].filter).toEqual({urls: ["http://127.0.0.1:42329/*"]});
    webRequest.listeners[0].listener({
      error: "net::ERR_INSUFFICIENT_RESOURCES",
      method: "GET",
      url: "http://127.0.0.1:42329/w/projeto-1/core-api/execution/processes/abc/output?cursor=10",
      resourceType: "xhr",
    });

    expect(diagnostics.recent()).toEqual([{
      at: "2026-08-26T13:00:00.000Z",
      error: "net::ERR_INSUFFICIENT_RESOURCES",
      method: "GET",
      url: "/w/projeto-1/core-api/execution/processes/abc/output?cursor=10",
      resourceType: "xhr",
    }]);
    expect(onEntry).toHaveBeenCalledWith(diagnostics.recent()[0]);
    expect(write).toHaveBeenCalledOnce();
    expect(JSON.parse(write.mock.calls[0][0]).error).toBe("net::ERR_INSUFFICIENT_RESOURCES");
  });

  it("guarda apenas as últimas ocorrências em memória", () => {
    const webRequest = webRequestStub();
    const diagnostics = installNetworkDiagnostics({
      webRequest,
      runtimeOrigin: "http://127.0.0.1:1",
      logPath: "/tmp/tinyide/network-errors.log",
      write: async () => undefined,
    });

    for (let index = 0; index < 60; index += 1) {
      webRequest.listeners[0].listener({
        error: `net::ERR_${index}`,
        method: "GET",
        url: `http://127.0.0.1:1/x/${index}`,
        resourceType: "xhr",
      });
    }

    const recent = diagnostics.recent();
    expect(recent).toHaveLength(50);
    expect(recent.at(-1).error).toBe("net::ERR_59");
    expect(recent[0].error).toBe("net::ERR_10");
  });

  it("não instala nada sem sessão ou destino de log", () => {
    expect(installNetworkDiagnostics({runtimeOrigin: "http://127.0.0.1:1"}).recent).toBeUndefined();
    const webRequest = webRequestStub();
    installNetworkDiagnostics({webRequest, runtimeOrigin: "http://127.0.0.1:1"});
    expect(webRequest.listeners).toHaveLength(0);
  });
});
