import { describe, expect, it, vi } from "vitest";
import {
  installFreezeDiagnostics,
  requestQueueWaitMs,
  requestServerWaitMs,
  type FreezeObserverFactory,
  type ObservedPerformanceEntry,
  type ObservedResourceEntry,
} from "./freeze-diagnostics";

interface ObserverHarness {
  readonly factory: FreezeObserverFactory;
  readonly observed: { type: string; buffered?: boolean; durationThreshold?: number }[];
  readonly disconnected: string[];
  emit(type: string, entries: readonly Partial<ObservedPerformanceEntry>[]): void;
}

function observerHarness(options: { readonly unsupported?: readonly string[] } = {}): ObserverHarness {
  const callbacks = new Map<string, (entries: readonly ObservedPerformanceEntry[]) => void>();
  const observed: ObserverHarness["observed"] = [];
  const disconnected: string[] = [];
  const factory: FreezeObserverFactory = (callback) => {
    let type = "";
    return {
      observe(request) {
        if (options.unsupported?.includes(request.type)) throw new TypeError(`unsupported ${request.type}`);
        type = request.type;
        observed.push(request);
        callbacks.set(request.type, callback);
      },
      disconnect() {
        disconnected.push(type);
        callbacks.delete(type);
      },
    };
  };
  return {
    factory,
    observed,
    disconnected,
    emit(type, entries) {
      callbacks.get(type)?.(entries.map((entry) => ({
        entryType: type,
        name: "",
        startTime: 0,
        duration: 0,
        ...entry,
      })));
    },
  };
}

function resourceEntry(overrides: Partial<ObservedResourceEntry>): ObservedResourceEntry {
  return {
    entryType: "resource",
    name: "http://127.0.0.1:37399/w/projeto/plugin-api/tinyide.git/status",
    initiatorType: "fetch",
    startTime: 0,
    duration: 0,
    fetchStart: 0,
    connectStart: 0,
    connectEnd: 0,
    requestStart: 0,
    responseStart: 0,
    ...overrides,
  };
}

describe("sondas de congelamento do renderer", () => {
  it("relata tarefas longas acima do limiar e ignora as curtas", () => {
    const harness = observerHarness();
    const report = vi.fn();
    installFreezeDiagnostics({ createObserver: harness.factory, report, now: () => 0 });

    harness.emit("longtask", [{ duration: 999 }]);
    expect(report).not.toHaveBeenCalled();

    harness.emit("longtask", [{
      duration: 1534.4,
      attribution: [{ containerType: "iframe", containerName: "terminal" }],
    } as Partial<ObservedPerformanceEntry>]);
    expect(report).toHaveBeenCalledWith("[tinyIde] Renderer ocupado por 1534 ms numa única tarefa (origem: iframe terminal).");
  });

  it("relata entradas que esperaram pelo renderer, com a divisão do tempo e o alvo", () => {
    const harness = observerHarness();
    const report = vi.fn();
    installFreezeDiagnostics({ createObserver: harness.factory, report, now: () => 0 });

    expect(harness.observed.find((request) => request.type === "event")).toEqual({
      type: "event",
      buffered: false,
      durationThreshold: 1000,
    });
    harness.emit("event", [{
      name: "click",
      startTime: 100,
      duration: 2400,
      processingStart: 2100,
      processingEnd: 2300,
      target: { tagName: "BUTTON", id: "", classList: ["button"] },
    } as Partial<ObservedPerformanceEntry>]);
    expect(report).toHaveBeenCalledWith(
      "[tinyIde] Entrada \"click\" levou 2400 ms até ser pintada: 2000 ms esperando o renderer, 200 ms no tratamento (alvo: button.button).",
    );
  });

  it("relata requisições ao runtime presas na fila de conexões ou esperando o runtime", () => {
    const harness = observerHarness();
    const report = vi.fn();
    let clock = 0;
    installFreezeDiagnostics({
      createObserver: harness.factory,
      report,
      now: () => clock,
      runtimeOrigin: "http://127.0.0.1:37399",
    });

    harness.emit("resource", [resourceEntry({
      fetchStart: 1000,
      requestStart: 5200,
      responseStart: 5250,
      duration: 4300,
    })]);
    expect(report).toHaveBeenLastCalledWith(
      "[tinyIde] Requisição ao runtime demorou 4300 ms: 4200 ms na fila de conexões do Chromium, 50 ms esperando o runtime (/w/projeto/plugin-api/tinyide.git/status).",
    );

    clock = 10_000;
    harness.emit("resource", [resourceEntry({
      name: "http://127.0.0.1:37399/w/projeto/plugin-api/tinyide.git/branches?x=1",
      fetchStart: 0,
      requestStart: 10,
      responseStart: 3600,
      duration: 3650,
    })]);
    expect(report).toHaveBeenLastCalledWith(
      "[tinyIde] Requisição ao runtime demorou 3650 ms: 10 ms na fila de conexões do Chromium, 3590 ms esperando o runtime (/w/projeto/plugin-api/tinyide.git/branches?x=1).",
    );
  });

  it("ignora requisições rápidas, de outras origens ou que não sejam fetch", () => {
    const harness = observerHarness();
    const report = vi.fn();
    installFreezeDiagnostics({
      createObserver: harness.factory,
      report,
      now: () => 0,
      runtimeOrigin: "http://127.0.0.1:37399",
    });

    harness.emit("resource", [
      resourceEntry({ fetchStart: 0, requestStart: 200, responseStart: 300, duration: 350 }),
      resourceEntry({ name: "https://registry.npmjs.org/x", fetchStart: 0, requestStart: 9000, responseStart: 9100 }),
      resourceEntry({ initiatorType: "script", fetchStart: 0, requestStart: 9000, responseStart: 9100 }),
      resourceEntry({ fetchStart: 0, requestStart: 0, responseStart: 0, duration: 9000 }),
    ]);
    expect(report).not.toHaveBeenCalled();
  });

  it("desconta a conexão nova ao medir a fila e exige os marcos presentes", () => {
    expect(requestQueueWaitMs(resourceEntry({ fetchStart: 100, connectStart: 3000, connectEnd: 3040, requestStart: 3050 }))).toBe(2910);
    expect(requestQueueWaitMs(resourceEntry({ fetchStart: 100, requestStart: 0 }))).toBe(0);
    expect(requestServerWaitMs(resourceEntry({ requestStart: 50, responseStart: 2050 }))).toBe(2000);
    expect(requestServerWaitMs(resourceEntry({ requestStart: 50, responseStart: 0 }))).toBe(0);
  });

  it("fala uma vez por intervalo por tipo e conta o que calou", () => {
    const harness = observerHarness();
    const report = vi.fn();
    let clock = 0;
    installFreezeDiagnostics({ createObserver: harness.factory, report, now: () => clock, reportIntervalMs: 5000 });

    harness.emit("longtask", [{ duration: 1200 }]);
    clock = 1000;
    harness.emit("longtask", [{ duration: 1300 }, { duration: 1400 }]);
    clock = 2000;
    harness.emit("event", [{ name: "keydown", startTime: 0, duration: 1500, processingStart: 1400, processingEnd: 1450 } as Partial<ObservedPerformanceEntry>]);
    expect(report).toHaveBeenCalledTimes(2);

    clock = 6000;
    harness.emit("longtask", [{ duration: 1100 }]);
    expect(report).toHaveBeenLastCalledWith(
      "[tinyIde] Renderer ocupado por 1100 ms numa única tarefa. (+2 ocorrências semelhantes omitidas nos últimos 6 s)",
    );
  });

  it("segue com as sondas disponíveis quando um tipo não é suportado e desliga todas ao descartar", () => {
    const harness = observerHarness({ unsupported: ["longtask"] });
    const report = vi.fn();
    const diagnostics = installFreezeDiagnostics({ createObserver: harness.factory, report, now: () => 0 });

    expect(harness.observed.map((request) => request.type)).toEqual(["event", "resource"]);
    harness.emit("longtask", [{ duration: 9000 }]);
    expect(report).not.toHaveBeenCalled();

    diagnostics.dispose();
    expect(harness.disconnected).toEqual(["event", "resource"]);
    harness.emit("event", [{ name: "click", duration: 9000, processingStart: 8000, processingEnd: 8100 } as Partial<ObservedPerformanceEntry>]);
    expect(report).not.toHaveBeenCalled();
  });

  it("relata um arrasto nativo que ficou sem dragend e cala quando o arrasto termina", () => {
    const report = vi.fn();
    const timers = new Map<number, () => void>();
    let nextHandle = 1;
    const target = new EventTarget();
    const dragSource = { tagName: "DIV", id: "", classList: ["tree-entry"] };
    const dispatch = (type: string) => {
      const event = new Event(type);
      Object.defineProperty(event, "target", { value: dragSource });
      target.dispatchEvent(event);
    };
    const diagnostics = installFreezeDiagnostics({
      report,
      createObserver: observerHarness().factory,
      dragTarget: target,
      dragTimeoutMs: 10_000,
      setTimer: (callback) => {
        const handle = nextHandle++;
        timers.set(handle, callback);
        return handle;
      },
      clearTimer: (handle) => {
        timers.delete(handle as number);
      },
    });

    dispatch("dragstart");
    expect(timers.size).toBe(1);
    dispatch("dragend");
    expect(timers.size).toBe(0);
    expect(report).not.toHaveBeenCalled();

    dispatch("dragstart");
    expect(timers.size).toBe(1);
    for (const [handle, callback] of [...timers]) {
      timers.delete(handle);
      callback();
    }
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0]?.[0]).toContain("Arrasto nativo iniciado em div.tree-entry há 10 s sem dragend");

    dispatch("dragstart");
    diagnostics.dispose();
    expect(timers.size).toBe(0);
    dispatch("dragstart");
    expect(timers.size).toBe(0);
  });

  it("vigia o arrasto mesmo quando a página não oferece PerformanceObserver", () => {
    const original = (globalThis as { PerformanceObserver?: unknown }).PerformanceObserver;
    (globalThis as { PerformanceObserver?: unknown }).PerformanceObserver = undefined;
    try {
      const report = vi.fn();
      const target = new EventTarget();
      const timers: (() => void)[] = [];
      const diagnostics = installFreezeDiagnostics({
        report,
        dragTarget: target,
        setTimer: (callback) => {
          timers.push(callback);
          return timers.length;
        },
        clearTimer: () => {},
      });
      target.dispatchEvent(new Event("dragstart"));
      timers[0]?.();
      expect(report).toHaveBeenCalledTimes(1);
      expect(report.mock.calls[0]?.[0]).toContain("origem desconhecida");
      diagnostics.dispose();
    } finally {
      (globalThis as { PerformanceObserver?: unknown }).PerformanceObserver = original;
    }
  });

  it("vira um não-op quando a página não oferece PerformanceObserver", () => {
    const original = (globalThis as { PerformanceObserver?: unknown }).PerformanceObserver;
    (globalThis as { PerformanceObserver?: unknown }).PerformanceObserver = undefined;
    try {
      expect(() => installFreezeDiagnostics({ report: vi.fn() }).dispose()).not.toThrow();
    } finally {
      (globalThis as { PerformanceObserver?: unknown }).PerformanceObserver = original;
    }
  });
});
