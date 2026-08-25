import type { DebugAdapterProvider, DebugSessionSnapshot } from "@tinyide/plugin-api";

const ENDED_DEBUG_STATUSES = new Set(["stopped", "completed", "failed"]);

export interface RestoredDebugSession {
  readonly adapter: DebugAdapterProvider;
  readonly session: DebugSessionSnapshot;
}

export interface DebugSessionRestoration {
  readonly sessions: readonly RestoredDebugSession[];
  readonly errors: readonly Error[];
}

export function debugSessionFingerprint(session: DebugSessionSnapshot): string {
  const frames = session.frames
    .map((frame) => `${frame.id}:${frame.path ?? ""}:${frame.line ?? 0}:${frame.column ?? 0}`)
    .join("|");
  const scopes = session.scopes
    .map((scope) => `${scope.name}:${scope.variables.length}:${scope.variables
      .slice(0, 20)
      .map((variable) => `${variable.name}:${variable.type ?? ""}:${variable.value}`)
      .join("|")}`)
    .join("||");
  return [
    session.id,
    session.status,
    session.reason ?? "",
    session.selectedFrameId ?? "",
    session.stdout.length,
    session.stderr.length,
    session.error ?? "",
    session.breakpoints.map((breakpoint) => `${breakpoint.path}:${breakpoint.line}:${breakpoint.enabled}:${breakpoint.verified}`).join("|"),
    frames,
    scopes,
    session.finishedAt ?? 0,
  ].join("\u0001");
}

export function sameDebugSessionSnapshot(
  left: DebugSessionSnapshot | undefined,
  right: DebugSessionSnapshot,
): boolean {
  return Boolean(left && debugSessionFingerprint(left) === debugSessionFingerprint(right));
}

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

export function workspaceRelativeDebugPath(
  path: string | undefined,
  workspaceRoot: string | undefined,
): string | undefined {
  if (!path) return undefined;
  const normalized = path.replaceAll("\\", "/").trim();
  if (!normalized || normalized.startsWith("<")) return undefined;

  const normalizedRoot = workspaceRoot?.replaceAll("\\", "/").replace(/\/$/, "");
  if (normalizedRoot) {
    const comparePath = normalized.toLocaleLowerCase();
    const compareRoot = normalizedRoot.toLocaleLowerCase();
    if (comparePath.startsWith(`${compareRoot}/`)) {
      return normalized.slice(normalizedRoot.length + 1);
    }
    if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) return undefined;
  }

  return normalized.replace(/^\.\//, "");
}

export async function restoreActiveDebugSessions(
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

  // Uma sessão ativa pertence ao perfil que a iniciou. Perfis diferentes podem
  // permanecer em debug simultaneamente; somente duplicatas do mesmo perfil são
  // consideradas obsoletas após uma restauração (por exemplo, um restart interrompido).
  const newestByProfile = new Map<string, RestoredDebugSession>();
  const stale: RestoredDebugSession[] = [];
  for (const candidate of discovered) {
    const previous = newestByProfile.get(candidate.session.profileId);
    if (previous) stale.push(previous);
    newestByProfile.set(candidate.session.profileId, candidate);
  }

  await Promise.all(stale.map(async (candidate) => {
    try {
      await candidate.adapter.command(candidate.session.id, "stop");
    } catch (cause) {
      errors.push(asError(cause));
    }
  }));

  return {
    sessions: [...newestByProfile.values()].sort((left, right) => left.session.startedAt - right.session.startedAt),
    errors,
  };
}
