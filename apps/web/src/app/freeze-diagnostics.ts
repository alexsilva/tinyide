/**
 * Sondas que explicam um congelamento da janela a partir de dentro dela.
 *
 * Quando a IDE "trava" sem o Chromium declarar a página sem resposta, o log do
 * desktop fica mudo: não há exceção, não há erro de rede e o processo principal
 * segue vivo. Foi o que aconteceu em 2026-10-22 — uma janela sem reação por
 * mais de um minuto e nenhuma linha dizendo onde o tempo foi gasto.
 *
 * Três lugares concentram esse tempo, e cada sonda mede um deles pelo relógio
 * da própria página, que é o relógio que o usuário sente:
 *
 * - tarefa longa: o renderer passou mais de N ms sem devolver o controle;
 * - entrada atrasada: um clique ou uma tecla esperou mais de N ms para ser
 *   tratado ou pintado;
 * - requisição parada: um pedido ao runtime esperou por uma conexão livre (o
 *   Chromium limita a 6 conexões por origem, partilhadas por todas as janelas
 *   da IDE) ou ficou esperando o próprio runtime responder;
 * - arrasto sem fim: um `dragstart` nativo sem `dragend`. Enquanto o Blink
 *   acredita que a página arrasta, ele descarta todo clique e tecla, e só o
 *   scroll do compositor segue vivo — foi o quadro de 2026-10-22, quando o
 *   Chromium perdeu o fim de uma sessão XDND aberta por um clique.
 *
 * O relato vai para `console.warn`, que no desktop é copiado para o log da
 * aplicação já com a identificação da janela. Cada tipo de sonda fala no
 * máximo uma vez por intervalo e conta o que calou, para que um congelamento
 * longo não vire milhares de linhas.
 */

export interface ObservedPerformanceEntry {
  readonly entryType: string;
  readonly name: string;
  readonly startTime: number;
  readonly duration: number;
}

export interface ObservedLongTaskEntry extends ObservedPerformanceEntry {
  readonly attribution?: readonly {
    readonly containerType?: string;
    readonly containerName?: string;
    readonly containerSrc?: string;
  }[];
}

export interface ObservedEventTimingEntry extends ObservedPerformanceEntry {
  readonly processingStart: number;
  readonly processingEnd: number;
  readonly target?: unknown;
}

export interface ObservedResourceEntry extends ObservedPerformanceEntry {
  readonly initiatorType: string;
  readonly fetchStart: number;
  readonly connectStart: number;
  readonly connectEnd: number;
  readonly requestStart: number;
  readonly responseStart: number;
}

export interface FreezeObserver {
  observe(options: { type: string; buffered?: boolean; durationThreshold?: number }): void;
  disconnect(): void;
}

export type FreezeObserverFactory = (
  callback: (entries: readonly ObservedPerformanceEntry[]) => void,
) => FreezeObserver;

export interface FreezeDiagnosticsOptions {
  /** Destino do relato. Padrão: `console.warn`. */
  readonly report?: (message: string) => void;
  /** Fábrica de observadores. Padrão: `PerformanceObserver` da página. */
  readonly createObserver?: FreezeObserverFactory;
  /** Relógio usado só para limitar a cadência dos relatos. */
  readonly now?: () => number;
  /** Origem do runtime local; só requisições a ela entram na sonda. */
  readonly runtimeOrigin?: string;
  readonly longTaskThresholdMs?: number;
  readonly inputDelayThresholdMs?: number;
  readonly requestWaitThresholdMs?: number;
  /** Intervalo mínimo entre relatos do mesmo tipo. */
  readonly reportIntervalMs?: number;
  /** Tempo sem `dragend` após um `dragstart` a partir do qual o arrasto é relatado. */
  readonly dragTimeoutMs?: number;
  /** Onde ouvir os eventos de arrasto. Padrão: `window`. */
  readonly dragTarget?: EventTarget;
  readonly setTimer?: (callback: () => void, delayMs: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
}

export interface FreezeDiagnostics {
  dispose(): void;
}

const DEFAULT_LONG_TASK_THRESHOLD_MS = 1000;
const DEFAULT_INPUT_DELAY_THRESHOLD_MS = 1000;
const DEFAULT_REQUEST_WAIT_THRESHOLD_MS = 3000;
const DEFAULT_REPORT_INTERVAL_MS = 5000;
const DEFAULT_DRAG_TIMEOUT_MS = 10_000;
const RUNTIME_REQUEST_INITIATORS = new Set(["fetch", "xmlhttprequest"]);

type ReportKind = "longtask" | "input" | "request" | "drag";

function defaultObserverFactory(): FreezeObserverFactory | undefined {
  const Observer = (globalThis as { PerformanceObserver?: typeof PerformanceObserver }).PerformanceObserver;
  if (typeof Observer !== "function") return undefined;
  return (callback) => new Observer((list) => {
    callback(list.getEntries() as unknown as readonly ObservedPerformanceEntry[]);
  });
}

function defaultRuntimeOrigin(): string {
  const origin = (globalThis as { location?: { origin?: string } }).location?.origin;
  return typeof origin === "string" ? origin : "";
}

/**
 * Um relato por tipo a cada intervalo. O que ficou calado entra como contagem
 * no relato seguinte, para que a frequência do sintoma não se perca junto com
 * o ruído.
 */
function createReportLimiter(now: () => number, intervalMs: number, report: (message: string) => void) {
  const state = new Map<ReportKind, { lastAt: number; suppressed: number }>();
  return (kind: ReportKind, message: string) => {
    const current = state.get(kind);
    const at = now();
    if (current && at - current.lastAt < intervalMs) {
      current.suppressed += 1;
      return;
    }
    const suffix = current?.suppressed
      ? ` (+${current.suppressed} ocorrências semelhantes omitidas nos últimos ${Math.round((at - current.lastAt) / 1000)} s)`
      : "";
    state.set(kind, { lastAt: at, suppressed: 0 });
    report(`${message}${suffix}`);
  };
}

function describeTarget(target: unknown): string {
  if (!target || typeof target !== "object") return "";
  const element = target as { tagName?: unknown; id?: unknown; classList?: ArrayLike<string> };
  if (typeof element.tagName !== "string") return "";
  const id = typeof element.id === "string" && element.id ? `#${element.id}` : "";
  const className = element.classList && element.classList.length > 0 ? `.${element.classList[0]}` : "";
  return `${element.tagName.toLowerCase()}${id}${className}`;
}

function describeAttribution(entry: ObservedLongTaskEntry): string {
  const first = entry.attribution?.[0];
  if (!first?.containerType || first.containerType === "window") return "";
  const label = first.containerName || first.containerSrc || "";
  return ` (origem: ${first.containerType}${label ? ` ${label}` : ""})`;
}

function requestPath(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

function isRuntimeRequest(entry: ObservedResourceEntry, runtimeOrigin: string): boolean {
  return runtimeOrigin !== ""
    && RUNTIME_REQUEST_INITIATORS.has(entry.initiatorType)
    && entry.name.startsWith(`${runtimeOrigin}/`);
}

/**
 * Tempo entre o pedido ser feito e o Chromium conseguir enviá-lo. Uma conexão
 * reaproveitada não tem fase de conexão (os marcos coincidem com `fetchStart`),
 * então o que sobra entre `fetchStart` e `requestStart` é fila do pool. Em
 * conexão nova, a própria conexão é descontada.
 */
export function requestQueueWaitMs(entry: ObservedResourceEntry): number {
  if (!(entry.requestStart > 0)) return 0;
  const connecting = entry.connectEnd > 0 && entry.connectStart > 0 ? entry.connectEnd - entry.connectStart : 0;
  return Math.max(0, entry.requestStart - entry.fetchStart - connecting);
}

/** Tempo entre o envio do pedido e o primeiro byte da resposta. */
export function requestServerWaitMs(entry: ObservedResourceEntry): number {
  if (!(entry.requestStart > 0) || !(entry.responseStart > 0)) return 0;
  return Math.max(0, entry.responseStart - entry.requestStart);
}

/**
 * `dragstart` sem `dragend` no prazo. O relato nomeia a origem do arrasto para
 * apontar qual superfície ainda usa arrasto nativo; a activity bar deixou de
 * usar depois do incidente, o explorer e as abas ainda usam de propósito.
 */
function installDragWatchdog(
  target: EventTarget | undefined,
  timeoutMs: number,
  report: (message: string) => void,
  setTimer: (callback: () => void, delayMs: number) => unknown,
  clearTimer: (handle: unknown) => void,
): () => void {
  if (!target || typeof target.addEventListener !== "function") return () => {};
  let pending: { handle: unknown; source: string } | undefined;
  const clear = () => {
    if (!pending) return;
    clearTimer(pending.handle);
    pending = undefined;
  };
  const onDragStart = (event: Event) => {
    clear();
    const source = describeTarget(event.target) || "origem desconhecida";
    pending = {
      source,
      handle: setTimer(() => {
        pending = undefined;
        report(
          `[tinyIde] Arrasto nativo iniciado em ${source} há ${Math.round(timeoutMs / 1000)} s sem dragend. `
            + "Se a janela ignora cliques e teclas mas ainda rola, o Chromium ainda a considera em arrasto.",
        );
      }, timeoutMs),
    };
  };
  const onDragEnd = () => clear();
  // Objeto, não booleano: o EventTarget do Node só casa a remoção com a
  // mesma forma de opções, e a sonda é testada fora do navegador.
  const options = { capture: true };
  target.addEventListener("dragstart", onDragStart, options);
  target.addEventListener("dragend", onDragEnd, options);
  target.addEventListener("drop", onDragEnd, options);
  return () => {
    clear();
    target.removeEventListener("dragstart", onDragStart, options);
    target.removeEventListener("dragend", onDragEnd, options);
    target.removeEventListener("drop", onDragEnd, options);
  };
}

export function installFreezeDiagnostics(options: FreezeDiagnosticsOptions = {}): FreezeDiagnostics {
  const report = options.report ?? ((message: string) => console.warn(message));
  const disposeDragWatchdog = installDragWatchdog(
    options.dragTarget ?? (globalThis as { window?: EventTarget }).window,
    options.dragTimeoutMs ?? DEFAULT_DRAG_TIMEOUT_MS,
    report,
    options.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs)),
    options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)),
  );
  const createObserver = options.createObserver ?? defaultObserverFactory();
  if (!createObserver) return { dispose: disposeDragWatchdog };
  const now = options.now ?? (() => Date.now());
  const runtimeOrigin = options.runtimeOrigin ?? defaultRuntimeOrigin();
  const longTaskThresholdMs = options.longTaskThresholdMs ?? DEFAULT_LONG_TASK_THRESHOLD_MS;
  const inputDelayThresholdMs = options.inputDelayThresholdMs ?? DEFAULT_INPUT_DELAY_THRESHOLD_MS;
  const requestWaitThresholdMs = options.requestWaitThresholdMs ?? DEFAULT_REQUEST_WAIT_THRESHOLD_MS;
  const limited = createReportLimiter(now, options.reportIntervalMs ?? DEFAULT_REPORT_INTERVAL_MS, report);
  const observers: FreezeObserver[] = [];

  const subscribe = <Entry extends ObservedPerformanceEntry>(
    type: string,
    handler: (entry: Entry) => void,
    extra: { durationThreshold?: number } = {},
  ) => {
    try {
      const observer = createObserver((entries) => {
        for (const entry of entries) handler(entry as Entry);
      });
      observer.observe({ type, buffered: false, ...extra });
      observers.push(observer);
    } catch {
      // Tipo de entrada que este navegador não oferece: a sonda simplesmente
      // não existe aqui. As outras continuam valendo.
    }
  };

  subscribe<ObservedLongTaskEntry>("longtask", (entry) => {
    if (entry.duration < longTaskThresholdMs) return;
    limited(
      "longtask",
      `[tinyIde] Renderer ocupado por ${Math.round(entry.duration)} ms numa única tarefa${describeAttribution(entry)}.`,
    );
  });

  subscribe<ObservedEventTimingEntry>("event", (entry) => {
    const waiting = Math.max(0, entry.processingStart - entry.startTime);
    const handling = Math.max(0, entry.processingEnd - entry.processingStart);
    if (entry.duration < inputDelayThresholdMs && waiting < inputDelayThresholdMs) return;
    const target = describeTarget(entry.target);
    limited(
      "input",
      `[tinyIde] Entrada "${entry.name}" levou ${Math.round(entry.duration)} ms até ser pintada: `
        + `${Math.round(waiting)} ms esperando o renderer, ${Math.round(handling)} ms no tratamento`
        + `${target ? ` (alvo: ${target})` : ""}.`,
    );
  }, { durationThreshold: inputDelayThresholdMs });

  subscribe<ObservedResourceEntry>("resource", (entry) => {
    if (!isRuntimeRequest(entry, runtimeOrigin)) return;
    const queued = requestQueueWaitMs(entry);
    const server = requestServerWaitMs(entry);
    if (queued < requestWaitThresholdMs && server < requestWaitThresholdMs) return;
    limited(
      "request",
      `[tinyIde] Requisição ao runtime demorou ${Math.round(entry.duration)} ms: `
        + `${Math.round(queued)} ms na fila de conexões do Chromium, ${Math.round(server)} ms esperando o runtime `
        + `(${requestPath(entry.name)}).`,
    );
  });

  return {
    dispose() {
      disposeDragWatchdog();
      for (const observer of observers.splice(0)) observer.disconnect();
    },
  };
}
