import type { WorkbenchDialogContribution } from "@tinyide/plugin-api";
import { useEffect, useRef } from "react";

export function WorkbenchDialogHost({
  provider,
  onClose,
}: {
  readonly provider: WorkbenchDialogContribution;
  readonly onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let mountedDisposable: { dispose(): void } | void;
    try {
      const mounted = provider.mount({
        container,
        close: () => onCloseRef.current(),
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
