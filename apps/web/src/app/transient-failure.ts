/**
 * Classificação única de falhas transitórias de comunicação com o backend.
 *
 * Sem isto cada monitor inventava seu próprio critério (`cause instanceof TypeError`
 * em um lugar, regex de mensagem em outro), e o caso mais comum de reinício de
 * servidor atrás de proxy — 502/503 com corpo HTML — não era coberto por nenhum.
 */

/** Erro de aplicação vindo do backend, com o status HTTP que o originou. */
export class HostRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.name = "HostRequestError";
    this.status = status;
  }
}

/** Falha de transporte já classificada como transitória na origem. */
export class TransientRuntimeError extends Error {
  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.name = "TransientRuntimeError";
  }
}

/**
 * Mensagens que os runtimes de `fetch` (browser e Electron) produzem quando o
 * transporte cai. Só são consultadas para erros sem status HTTP: um erro de
 * aplicação pode conter "connection refused" no texto sem ser falha de rede.
 */
const TRANSIENT_TRANSPORT_PATTERN =
  /network\s*error|failed to fetch|load failed|err_connection|err_network|err_empty_response|connection (?:refused|reset|closed|aborted)|socket hang up|econnrefused|econnreset|epipe|etimedout/i;

/** Status HTTP em que o backend está indisponível, não em que o pedido é inválido. */
export function isTransientHttpStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function isTransientFailure(cause: unknown): boolean {
  if (cause instanceof TransientRuntimeError) return true;
  if (cause instanceof HostRequestError) return isTransientHttpStatus(cause.status);
  // Cancelamento é intencional: nunca deve virar reconexão.
  if (cause instanceof DOMException && cause.name === "AbortError") return false;
  if (cause instanceof Error && cause.name === "AbortError") return false;
  // `fetch` cru rejeita com TypeError quando não consegue sequer falar com o host.
  if (cause instanceof TypeError) return true;
  if (cause instanceof Error) return TRANSIENT_TRANSPORT_PATTERN.test(cause.message);
  return false;
}

export interface TransientRetryOptions {
  readonly initialDelayMs?: number;
  readonly maxDelayMs?: number;
  /** Tempo total de reconexão antes de desistir e propagar o erro original. */
  readonly maxDurationMs?: number;
  readonly now?: () => number;
}

export interface TransientRetryDecision {
  /** Número da tentativa de reconexão, começando em 1. */
  readonly attempt: number;
  /** Quanto esperar antes de tentar de novo. */
  readonly delayMs: number;
  /** Tempo desde a primeira falha da sequência atual. */
  readonly elapsedMs: number;
}

export interface TransientRetry {
  readonly reconnecting: boolean;
  /** Marca sucesso; devolve `true` se estava reconectando (para avisar o usuário). */
  reset(): boolean;
  /**
   * Decide o backoff para `cause`, ou relança `cause` se ele não for transitório
   * ou se o orçamento de reconexão já tiver se esgotado.
   */
  schedule(cause: unknown): TransientRetryDecision;
}

export function createTransientRetry(options: TransientRetryOptions = {}): TransientRetry {
  const initialDelayMs = options.initialDelayMs ?? 250;
  const maxDelayMs = options.maxDelayMs ?? 5_000;
  const maxDurationMs = options.maxDurationMs ?? 120_000;
  const now = options.now ?? (() => Date.now());
  let attempt = 0;
  let delayMs = initialDelayMs;
  let firstFailureAt: number | undefined;

  return {
    get reconnecting() {
      return attempt > 0;
    },
    reset() {
      const wasReconnecting = attempt > 0;
      attempt = 0;
      delayMs = initialDelayMs;
      firstFailureAt = undefined;
      return wasReconnecting;
    },
    schedule(cause: unknown): TransientRetryDecision {
      if (!isTransientFailure(cause)) throw cause;
      const timestamp = now();
      if (firstFailureAt === undefined) firstFailureAt = timestamp;
      const elapsedMs = timestamp - firstFailureAt;
      if (elapsedMs > maxDurationMs) throw cause;
      attempt += 1;
      const scheduledDelayMs = delayMs;
      delayMs = Math.min(delayMs * 2, maxDelayMs);
      return { attempt, delayMs: scheduledDelayMs, elapsedMs };
    },
  };
}

export const RECONNECTING_NOTICE = "[execução] conexão perdida; tentando reconectar…";
export const RECONNECTED_NOTICE = "[execução] conexão restabelecida.";

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
