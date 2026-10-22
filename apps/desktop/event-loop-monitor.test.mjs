import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { installEventLoopMonitor } = require("./event-loop-monitor.cjs");

function fakeTimers() {
  let clock = 0;
  const pending = new Map();
  let nextId = 1;
  return {
    now: () => clock,
    advance(ms) {
      clock += ms;
    },
    schedule(callback, delay) {
      const id = nextId++;
      pending.set(id, { callback, at: clock + delay });
      return id;
    },
    cancel(id) {
      pending.delete(id);
    },
    /** Dispara o temporizador pendente como se o loop só agora tivesse voltado. */
    fire() {
      const [id, entry] = [...pending.entries()][0] ?? [];
      if (id === undefined) throw new Error("Nenhum temporizador pendente.");
      pending.delete(id);
      entry.callback();
    },
    pendingCount: () => pending.size,
  };
}

describe("vigia do loop de eventos do processo principal", () => {
  it("registra quanto tempo o loop ficou parado quando o temporizador atrasa além do limiar", () => {
    const timers = fakeTimers();
    const logger = { warn: vi.fn() };
    installEventLoopMonitor({
      logger,
      intervalMs: 1000,
      thresholdMs: 2000,
      now: timers.now,
      schedule: timers.schedule,
      cancel: timers.cancel,
    });

    timers.advance(1005);
    timers.fire();
    expect(logger.warn).not.toHaveBeenCalled();

    timers.advance(4500);
    timers.fire();
    expect(logger.warn).toHaveBeenCalledWith(
      "main",
      "Loop de eventos do processo principal ficou parado.",
      { stalledMs: 3500 },
    );
    expect(timers.pendingCount()).toBe(1);
  });

  it("para de medir e não reagenda depois de descartado", () => {
    const timers = fakeTimers();
    const logger = { warn: vi.fn() };
    const monitor = installEventLoopMonitor({
      logger,
      now: timers.now,
      schedule: timers.schedule,
      cancel: timers.cancel,
    });

    monitor.dispose();
    expect(timers.pendingCount()).toBe(0);
  });

  it("ignora um disparo tardio que chegue depois do descarte", () => {
    const timers = fakeTimers();
    const logger = { warn: vi.fn() };
    const monitor = installEventLoopMonitor({
      logger,
      now: timers.now,
      schedule: timers.schedule,
      cancel: () => undefined,
    });

    monitor.dispose();
    timers.advance(60_000);
    timers.fire();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(timers.pendingCount()).toBe(0);
  });

  it("vira um não-op sem logger", () => {
    const timers = fakeTimers();
    expect(() => installEventLoopMonitor({ schedule: timers.schedule }).dispose()).not.toThrow();
    expect(timers.pendingCount()).toBe(0);
  });
});
