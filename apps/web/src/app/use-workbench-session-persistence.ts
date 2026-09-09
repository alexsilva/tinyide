import { useEffect, useMemo } from "react";
import { createCoalescedWriter } from "./coalesced-writer";
import { writeSession, type SessionState } from "./persistence";

export interface WorkbenchSessionPersistenceOptions {
  readonly enabled: boolean;
  readonly session: SessionState;
}

/** Persists layout changes without coupling workbench rendering to storage timing. */
export function useWorkbenchSessionPersistence({
  enabled,
  session,
}: WorkbenchSessionPersistenceOptions): void {
  const writer = useMemo(
    () => createCoalescedWriter({ delayMs: 250, write: writeSession }),
    [],
  );
  const fingerprint = useMemo(() => JSON.stringify(session), [session]);

  useEffect(() => {
    if (enabled) writer.schedule(session, fingerprint);
  }, [enabled, fingerprint, session, writer]);

  useEffect(() => {
    // pagehide runs before the runtime releases the workspace, preserving the last resize.
    const flush = () => writer.flush();
    window.addEventListener("pagehide", flush, { capture: true });
    return () => {
      window.removeEventListener("pagehide", flush, { capture: true });
      writer.dispose();
    };
  }, [writer]);
}
