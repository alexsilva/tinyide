import type { DebugAdapterProvider, DebugSessionSnapshot } from "@tinyide/plugin-api";

const ENDED_DEBUG_STATUSES = new Set(["stopped", "completed", "failed"]);

export interface RestoredDebugSession {
  readonly adapter: DebugAdapterProvider;
  readonly session: DebugSessionSnapshot;
}

export interface DebugSessionRestoration {
  readonly current?: RestoredDebugSession;
  readonly errors: readonly Error[];
}

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

export async function restoreActiveDebugSession(
  adapters: readonly DebugAdapterProvider[],
): Promise<DebugSessionRestoration> {
  const errors: Error[] = [];
  const discovered: RestoredDebugSession[] = [];

  await Promise.all(adapters.map(async (adapter) => {
    if (!adapter.list) return;
    try {
      const sessions = await adapter.list();
      for (const session of sessions) {
        if (!ENDED_DEBUG_STATUSES.has(session.status)) discovered.push({ adapter, session });
      }
    } catch (cause) {
      errors.push(asError(cause));
    }
  }));

  discovered.sort((left, right) => left.session.startedAt - right.session.startedAt);
  const current = discovered.at(-1);
  const stale = current ? discovered.slice(0, -1) : discovered;

  for (const candidate of stale) {
    try {
      await candidate.adapter.command(candidate.session.id, "stop");
    } catch (cause) {
      errors.push(asError(cause));
    }
  }

  return {
    ...(current ? { current } : {}),
    errors,
  };
}
