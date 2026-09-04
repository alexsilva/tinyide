import { afterEach, describe, expect, it, vi } from "vitest";
import { createCoalescedWriter } from "./coalesced-writer";

afterEach(() => vi.useRealTimers());

describe("coalesced writer", () => {
  it("grava somente o último estado depois da pausa", async () => {
    vi.useFakeTimers();
    const write = vi.fn();
    const writer = createCoalescedWriter({ delayMs: 250, write });

    writer.schedule({ width: 100 }, "100");
    await vi.advanceTimersByTimeAsync(100);
    writer.schedule({ width: 200 }, "200");
    await vi.advanceTimersByTimeAsync(249);
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(write).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith({ width: 200 });
  });

  it("descarta uma pendência quando o estado volta ao último já gravado", async () => {
    vi.useFakeTimers();
    const write = vi.fn();
    const writer = createCoalescedWriter({ delayMs: 250, write });

    writer.schedule("original", "original");
    await vi.advanceTimersByTimeAsync(250);
    writer.schedule("alterado", "alterado");
    writer.schedule("original", "original");
    await vi.advanceTimersByTimeAsync(250);

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith("original");
  });

  it("faz flush imediato e cancela tudo ao liberar", async () => {
    vi.useFakeTimers();
    const write = vi.fn();
    const writer = createCoalescedWriter({ delayMs: 250, write });

    writer.schedule("ao-fechar", "ao-fechar");
    writer.flush();
    expect(write).toHaveBeenCalledWith("ao-fechar");

    writer.schedule("descartar", "descartar");
    writer.dispose();
    await vi.advanceTimersByTimeAsync(250);
    expect(write).toHaveBeenCalledTimes(1);
  });
});
