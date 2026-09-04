export interface CoalescedWriter<T> {
  schedule(value: T, fingerprint: string): void;
  flush(): void;
  dispose(): void;
}

type TimerHandle = ReturnType<typeof globalThis.setTimeout> | number;

interface CoalescedWriterOptions<T> {
  readonly delayMs: number;
  readonly write: (value: T) => void;
  readonly scheduleTimer?: (callback: () => void, delayMs: number) => TimerHandle;
  readonly cancelTimer?: (timer: TimerHandle) => void;
}

/** Agrupa escritas de estado frequentes sem perder a última ao fechar a janela. */
export function createCoalescedWriter<T>(options: CoalescedWriterOptions<T>): CoalescedWriter<T> {
  const scheduleTimer = options.scheduleTimer ?? setTimeout;
  const cancelTimer = options.cancelTimer ?? clearTimeout;
  let timer: TimerHandle | undefined;
  let pending: { value: T; fingerprint: string } | undefined;
  let lastWrittenFingerprint: string | undefined;

  const cancelPendingTimer = () => {
    if (timer === undefined) return;
    cancelTimer(timer);
    timer = undefined;
  };
  const commit = () => {
    cancelPendingTimer();
    const next = pending;
    pending = undefined;
    if (!next) return;
    options.write(next.value);
    lastWrittenFingerprint = next.fingerprint;
  };

  return {
    schedule(value, fingerprint) {
      cancelPendingTimer();
      if (fingerprint === lastWrittenFingerprint) {
        pending = undefined;
        return;
      }
      pending = { value, fingerprint };
      timer = scheduleTimer(commit, options.delayMs);
    },
    flush: commit,
    dispose() {
      cancelPendingTimer();
      pending = undefined;
    },
  };
}
