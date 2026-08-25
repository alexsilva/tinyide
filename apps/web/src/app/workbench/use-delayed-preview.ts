import { useCallback, useEffect, useRef, useState } from "react";

export interface DelayedPreviewController<T> {
  readonly value: T | undefined;
  cancelPending(): void;
  open(value: T): void;
  openAfter(value: T, delayMs: number): void;
  close(): void;
  closeAfter(delayMs: number): void;
}

/** Shared hover/preview timing controller. Pending transitions are cancelled on unmount. */
export function useDelayedPreview<T>(): DelayedPreviewController<T> {
  const [value, setValue] = useState<T>();
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const cancelPending = useCallback(() => {
    if (timerRef.current === undefined) return;
    clearTimeout(timerRef.current);
    timerRef.current = undefined;
  }, []);

  const open = useCallback((next: T) => {
    cancelPending();
    setValue(next);
  }, [cancelPending]);

  const openAfter = useCallback((next: T, delayMs: number) => {
    cancelPending();
    timerRef.current = setTimeout(() => {
      timerRef.current = undefined;
      setValue(next);
    }, delayMs);
  }, [cancelPending]);

  const close = useCallback(() => {
    cancelPending();
    setValue(undefined);
  }, [cancelPending]);

  const closeAfter = useCallback((delayMs: number) => {
    cancelPending();
    timerRef.current = setTimeout(() => {
      timerRef.current = undefined;
      setValue(undefined);
    }, delayMs);
  }, [cancelPending]);

  useEffect(() => cancelPending, [cancelPending]);

  return { value, cancelPending, open, openAfter, close, closeAfter };
}
