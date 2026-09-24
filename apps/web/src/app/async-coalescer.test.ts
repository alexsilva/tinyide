import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAsyncCoalescer,
  mergeWorkspaceResourceChanges,
} from "./async-coalescer";

afterEach(() => vi.useRealTimers());

describe("async coalescer", () => {
  it("agrupa uma rajada antes de executar", async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => undefined);
    const coalescer = createAsyncCoalescer<number>({
      delayMs: 40,
      merge: (current, next) => current + next,
      run,
    });

    coalescer.push(1);
    coalescer.push(2);
    coalescer.push(3);
    expect(run).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(40);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(6);
  });

  it("nunca sobrepõe execuções e agrupa o que chega durante a operação ativa", async () => {
    vi.useFakeTimers();
    let releaseFirst: (() => void) | undefined;
    let active = 0;
    let peak = 0;
    const values: number[] = [];
    const run = vi.fn(async (value: number) => {
      active += 1;
      peak = Math.max(peak, active);
      values.push(value);
      if (values.length === 1) {
        await new Promise<void>((resolve) => { releaseFirst = resolve; });
      }
      active -= 1;
    });
    const coalescer = createAsyncCoalescer<number>({
      delayMs: 20,
      merge: (current, next) => current + next,
      run,
    });

    coalescer.push(1);
    await vi.advanceTimersByTimeAsync(20);
    expect(values).toEqual([1]);

    coalescer.push(2);
    coalescer.push(3);
    await vi.advanceTimersByTimeAsync(200);
    expect(values).toEqual([1]);

    releaseFirst?.();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(20);
    expect(values).toEqual([1, 5]);
    expect(peak).toBe(1);
  });

  it("descarta o lote pendente ao liberar", async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => undefined);
    const coalescer = createAsyncCoalescer<number>({
      delayMs: 50,
      merge: (current, next) => current + next,
      run,
    });

    coalescer.push(1);
    coalescer.dispose();
    await vi.advanceTimersByTimeAsync(100);

    expect(run).not.toHaveBeenCalled();
    coalescer.push(2);
    await vi.advanceTimersByTimeAsync(100);
    expect(run).not.toHaveBeenCalled();
  });

  it("permite liberar depois de um lote já drenado sem timer pendente", async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => undefined);
    const coalescer = createAsyncCoalescer<number>({
      delayMs: 10,
      merge: (current, next) => current + next,
      run,
    });

    coalescer.push(1);
    await vi.advanceTimersByTimeAsync(10);
    expect(run).toHaveBeenCalledTimes(1);
    coalescer.dispose();
    coalescer.dispose();
  });

  it("ignora callback de timer repetido depois de o lote já ter sido consumido", async () => {
    let scheduled: (() => void) | undefined;
    const run = vi.fn(async () => undefined);
    const coalescer = createAsyncCoalescer<number>({
      delayMs: 10,
      merge: (current, next) => current + next,
      run,
      scheduleTimer(callback) {
        scheduled = callback;
        return 1;
      },
      cancelTimer() {},
    });

    coalescer.push(1);
    scheduled?.();
    await Promise.resolve();
    scheduled?.();
    await Promise.resolve();

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("encaminha falha e continua processando o próximo lote", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const run = vi.fn()
      .mockRejectedValueOnce(new Error("falhou"))
      .mockResolvedValue(undefined);
    const coalescer = createAsyncCoalescer<number>({
      delayMs: 10,
      merge: (current, next) => current + next,
      run,
      onError,
    });

    coalescer.push(1);
    await vi.advanceTimersByTimeAsync(10);
    expect(onError).toHaveBeenCalledTimes(1);

    coalescer.push(2);
    await vi.advanceTimersByTimeAsync(10);
    expect(run).toHaveBeenCalledTimes(2);
  });
});

describe("workspace change merge", () => {
  it("une paths e mantém o rename mais novo de cada origem", () => {
    expect(mergeWorkspaceResourceChanges(
      {
        source: "watcher",
        reason: "external",
        workspaceRoot: "/repo",
        paths: ["a.ts", "b.ts"],
        renames: [{ from: "old.ts", to: "mid.ts" }],
      },
      {
        source: "git",
        reason: "source-control",
        operation: "checkout",
        paths: ["b.ts", "c.ts"],
        renames: [
          { from: "old.ts", to: "new.ts" },
          { from: "x.ts", to: "y.ts" },
        ],
      },
    )).toEqual({
      source: "git",
      reason: "source-control",
      operation: "checkout",
      workspaceRoot: "/repo",
      paths: ["a.ts", "b.ts", "c.ts"],
      renames: [
        { from: "old.ts", to: "new.ts" },
        { from: "x.ts", to: "y.ts" },
      ],
    });
  });

  it("preserva a varredura completa quando um dos eventos não diz o que mudou", () => {
    const withoutPaths = mergeWorkspaceResourceChanges(
      { source: "watcher", reason: "external", paths: ["a.ts"] },
      { source: "git", reason: "source-control" },
    );
    expect(withoutPaths.paths).toBeUndefined();

    const reversed = mergeWorkspaceResourceChanges(
      { source: "git", reason: "source-control" },
      { source: "watcher", reason: "external", paths: ["a.ts"] },
    );
    expect(reversed.paths).toBeUndefined();
  });

  it("não materializa coleções vazias", () => {
    expect(mergeWorkspaceResourceChanges(
      { source: "a", reason: "external" },
      { source: "b", reason: "workspace" },
    )).toEqual({ source: "b", reason: "workspace" });
  });
});
