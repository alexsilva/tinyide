type ProcessMonitorGlobal = typeof globalThis & {
  __tinyIdeHostProcessMonitors?: Map<string, symbol>;
};

function processMonitors(): Map<string, symbol> {
  const host = globalThis as ProcessMonitorGlobal;
  if (!host.__tinyIdeHostProcessMonitors) host.__tinyIdeHostProcessMonitors = new Map();
  return host.__tinyIdeHostProcessMonitors;
}

export interface HostProcessMonitorLease {
  readonly processId: string;
  dispose(): void;
}

/**
 * Garante um único consumidor contínuo por processo no renderer. O registro vive em
 * `globalThis` de propósito: React Fast Refresh substitui módulos sem encerrar promises
 * antigas, então um Map no escopo do módulo permitiria monitores duplicados a cada HMR.
 */
export function tryAcquireHostProcessMonitor(processId: string): HostProcessMonitorLease | undefined {
  const monitors = processMonitors();
  if (monitors.has(processId)) return undefined;
  const token = Symbol(processId);
  monitors.set(processId, token);
  return {
    processId,
    dispose() {
      if (monitors.get(processId) === token) monitors.delete(processId);
    },
  };
}
