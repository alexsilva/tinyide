import { describe, expect, it } from "vitest";
import {
  createTransientRetry,
  describeTransientFailure,
  HostRequestError,
  isTransientFailure,
  isTransientHttpStatus,
  reconnectingNotice,
  TransientRuntimeError,
} from "./transient-failure";

describe("classificação de falhas transitórias", () => {
  it("trata falha de transporte do fetch como transitória", () => {
    expect(isTransientFailure(new TypeError("Failed to fetch"))).toBe(true);
    expect(isTransientFailure(new TransientRuntimeError("corpo ilegível"))).toBe(true);
  });

  it("trata mensagens de transporte de runtimes não-browser como transitórias", () => {
    for (const message of [
      "NetworkError when attempting to fetch resource.",
      "net::ERR_CONNECTION_REFUSED",
      "connection reset by peer",
      "socket hang up",
    ]) {
      expect(isTransientFailure(new Error(message)), message).toBe(true);
    }
  });

  it("cobre o servidor reiniciando atrás de proxy", () => {
    // 502/503 com corpo HTML: o caso que antes matava o monitor de execução.
    expect(isTransientFailure(new HostRequestError("Bad Gateway", 502))).toBe(true);
    expect(isTransientFailure(new HostRequestError("Service Unavailable", 503))).toBe(true);
    expect(isTransientHttpStatus(429)).toBe(true);
  });

  it("não confunde erro de aplicação com falha de rede", () => {
    // Mensagem do servidor contendo texto de rede não pode virar retry infinito.
    expect(isTransientFailure(new HostRequestError("connection refused ao abrir sessão remota", 400))).toBe(false);
    expect(isTransientFailure(new HostRequestError("Processo não encontrado.", 404))).toBe(false);
    expect(isTransientFailure(new Error("Falha ao iniciar processo."))).toBe(false);
  });

  it("não trata cancelamento como falha transitória", () => {
    const aborted = new Error("The operation was aborted.");
    aborted.name = "AbortError";
    expect(isTransientFailure(aborted)).toBe(false);
  });
});

describe("backoff de reconexão", () => {
  it("cresce exponencialmente até o teto e reinicia no sucesso", () => {
    let now = 0;
    const retry = createTransientRetry({ initialDelayMs: 100, maxDelayMs: 400, now: () => now });
    const failure = new TypeError("Failed to fetch");

    expect(retry.schedule(failure)).toMatchObject({ attempt: 1, delayMs: 100 });
    expect(retry.schedule(failure)).toMatchObject({ attempt: 2, delayMs: 200 });
    expect(retry.schedule(failure)).toMatchObject({ attempt: 3, delayMs: 400 });
    expect(retry.schedule(failure)).toMatchObject({ attempt: 4, delayMs: 400 });
    expect(retry.reconnecting).toBe(true);

    expect(retry.reset()).toBe(true);
    expect(retry.reconnecting).toBe(false);
    expect(retry.reset()).toBe(false);
    expect(retry.schedule(failure)).toMatchObject({ attempt: 1, delayMs: 100 });
  });

  it("propaga erro não transitório sem retentar", () => {
    const retry = createTransientRetry();
    const fatal = new HostRequestError("Processo não encontrado.", 404);
    expect(() => retry.schedule(fatal)).toThrow(fatal);
    expect(retry.reconnecting).toBe(false);
  });

  it("desiste depois do orçamento de reconexão", () => {
    let now = 0;
    const retry = createTransientRetry({ initialDelayMs: 100, maxDurationMs: 1_000, now: () => now });
    const failure = new TypeError("Failed to fetch");

    retry.schedule(failure);
    now = 900;
    expect(retry.schedule(failure).elapsedMs).toBe(900);
    now = 1_500;
    expect(() => retry.schedule(failure)).toThrow(failure);
  });
});

describe("motivo da reconexão", () => {
  /**
   * "conexão perdida" sozinho não permitia distinguir, depois do episódio, um
   * erro do runtime de uma requisição que nem saiu da máquina.
   */
  it("distingue status do servidor de falha de transporte", () => {
    expect(describeTransientFailure(new HostRequestError("Falha ao ler a saída.", 500))).toBe("HTTP 500");
    expect(describeTransientFailure(new TransientRuntimeError("sem resposta", {
      cause: new TypeError("Failed to fetch"),
    }))).toBe("Failed to fetch");
    expect(describeTransientFailure(new Error("socket hang up"))).toBe("socket hang up");
  });

  it("compõe o aviso do console com o motivo", () => {
    expect(reconnectingNotice(new HostRequestError("x", 503)))
      .toBe("[execução] conexão perdida (HTTP 503); tentando reconectar…");
  });
});
