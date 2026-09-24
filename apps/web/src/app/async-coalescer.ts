import type { WorkspaceResourcesChangedEvent } from "@tinyide/plugin-api";

type TimerHandle = ReturnType<typeof globalThis.setTimeout> | number;

export interface AsyncCoalescer<T> {
  push(value: T): void;
  dispose(): void;
}

interface AsyncCoalescerOptions<T> {
  readonly delayMs: number;
  readonly merge: (current: T, next: T) => T;
  readonly run: (value: T) => Promise<void>;
  readonly scheduleTimer?: (callback: () => void, delayMs: number) => TimerHandle;
  readonly cancelTimer?: (timer: TimerHandle) => void;
  readonly onError?: (cause: unknown) => void;
}

/**
 * Agrupa rajadas de eventos e garante no máximo uma operação assíncrona ativa.
 * Eventos recebidos enquanto uma execução está em andamento viram um único lote
 * subsequente em vez de disparar trabalho concorrente.
 */
export function createAsyncCoalescer<T>(options: AsyncCoalescerOptions<T>): AsyncCoalescer<T> {
  const scheduleTimer = options.scheduleTimer ?? setTimeout;
  const cancelTimer = options.cancelTimer ?? clearTimeout;
  let timer: TimerHandle | undefined;
  let pending: T | undefined;
  let running = false;
  let disposed = false;

  const cancelScheduled = () => {
    if (timer === undefined) return;
    cancelTimer(timer);
    timer = undefined;
  };

  const schedule = () => {
    if (disposed || running || pending === undefined || timer !== undefined) return;
    timer = scheduleTimer(() => {
      timer = undefined;
      void drain();
    }, options.delayMs);
  };

  const drain = async () => {
    if (disposed || running || pending === undefined) return;
    const value = pending;
    pending = undefined;
    running = true;
    try {
      await options.run(value);
    } catch (cause) {
      options.onError?.(cause);
    } finally {
      running = false;
      schedule();
    }
  };

  return {
    push(value) {
      if (disposed) return;
      pending = pending === undefined ? value : options.merge(pending, value);
      schedule();
    },
    dispose() {
      disposed = true;
      pending = undefined;
      cancelScheduled();
    },
  };
}

export function mergeWorkspaceResourceChanges(
  current: WorkspaceResourcesChangedEvent,
  next: WorkspaceResourcesChangedEvent,
): WorkspaceResourcesChangedEvent {
  // Um evento sem caminhos significa "não sei o que mudou, confira tudo". Somar os caminhos do
  // outro evento transformaria essa varredura completa numa lista parcial e deixaria arquivos
  // abertos exibindo conteúdo antigo.
  const currentPaths = current.paths?.length ? current.paths : undefined;
  const nextPaths = next.paths?.length ? next.paths : undefined;
  const paths = currentPaths && nextPaths
    ? [...new Set([...currentPaths, ...nextPaths])]
    : [];
  const renamesBySource = new Map<string, { readonly from: string; readonly to: string }>();
  for (const rename of [...(current.renames ?? []), ...(next.renames ?? [])]) {
    renamesBySource.set(rename.from, rename);
  }

  return {
    source: next.source,
    reason: next.reason,
    ...(next.operation ? { operation: next.operation } : {}),
    ...((next.workspaceRoot ?? current.workspaceRoot)
      ? { workspaceRoot: next.workspaceRoot ?? current.workspaceRoot }
      : {}),
    ...(paths.length ? { paths } : {}),
    ...(renamesBySource.size ? { renames: [...renamesBySource.values()] } : {}),
  };
}
