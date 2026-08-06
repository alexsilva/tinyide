import type { DebugSessionSnapshot } from "@tinyide/plugin-api";
import { sameDebugSessionSnapshot } from "./debug-session-state";

/**
 * Decide se um instantâneo lido do adaptador substitui o estado atual da sessão.
 *
 * O polling é assíncrono: uma leitura disparada antes de reiniciar a depuração pode
 * chegar depois que a nova sessão já começou. Aplicá-la ressuscitaria a sessão antiga
 * na interface, por isso um instantâneo de outra sessão é descartado. Instantâneos
 * iguais também são descartados, para não provocar renderização sem mudança.
 */
export function nextDebugSession(
  current: DebugSessionSnapshot | undefined,
  snapshot: DebugSessionSnapshot,
): DebugSessionSnapshot | undefined {
  if (!current) return current;
  if (current.id !== snapshot.id) return current;
  return sameDebugSessionSnapshot(current, snapshot) ? current : snapshot;
}
