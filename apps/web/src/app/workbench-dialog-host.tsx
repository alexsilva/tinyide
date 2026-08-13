import type { WorkbenchDialogContribution, WorkbenchDialogSize } from "@tinyide/plugin-api";
import { useEffect, useRef } from "react";

export function WorkbenchDialogHost({
  provider,
  onClose,
  onSizeChange,
}: {
  readonly provider: WorkbenchDialogContribution;
  readonly onClose: () => void;
  readonly onSizeChange?: (size: WorkbenchDialogSize) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  const onSizeChangeRef = useRef(onSizeChange);
  onCloseRef.current = onClose;
  onSizeChangeRef.current = onSizeChange;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let mountedDisposable: { dispose(): void } | void;
    try {
      const mounted = provider.mount({
        container,
        close: () => onCloseRef.current(),
        setSize: (size) => onSizeChangeRef.current?.(size),
      });
      if (mounted && typeof (mounted as PromiseLike<unknown>).then === "function") {
        void Promise.resolve(mounted)
          .then((disposable) => {
            if (disposed) disposable?.dispose();
            else mountedDisposable = disposable;
          })
          .catch((cause) => {
            if (!disposed) container.textContent = cause instanceof Error ? cause.message : String(cause);
          });
      } else {
        mountedDisposable = mounted as void | { dispose(): void };
      }
    } catch (cause) {
      container.textContent = cause instanceof Error ? cause.message : String(cause);
    }

    return () => {
      disposed = true;
      mountedDisposable?.dispose();
      container.replaceChildren();
    };
  }, [provider]);

  return <div className="plugin-dialog-host" ref={containerRef} data-dialog-id={provider.id} />;
}
