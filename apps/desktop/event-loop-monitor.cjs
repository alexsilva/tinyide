/**
 * Vigia do loop de eventos do processo principal.
 *
 * Tudo o que a IDE faz passa por este loop: o servidor HTTP do runtime, os
 * canais WebSocket, o IPC das janelas e as respostas dos backends de plugin.
 * Se ele para, todas as janelas param juntas — e nada no log diz isso, porque
 * quem escreveria o log é o próprio loop parado. A sonda mede o atraso de um
 * temporizador curto e registra, depois do fato, quanto tempo o processo ficou
 * sem devolver o controle. É a contraparte, do lado do host, das sondas que o
 * renderer tem em `apps/web/src/app/freeze-diagnostics.ts`: com as duas, um
 * congelamento diz se foi a janela, a fila de conexões, o runtime ou o host.
 *
 * A máquina dormir também aparece como um atraso grande; a linha traz o valor
 * para que o leitor compare com o relógio de parede.
 */
function installEventLoopMonitor({
  logger,
  intervalMs = 1000,
  thresholdMs = 2000,
  now = Date.now,
  schedule = setTimeout,
  cancel = clearTimeout,
} = {}) {
  if (typeof logger?.warn !== "function") return { dispose() {} };
  let disposed = false;
  let timer;
  let expectedAt = now() + intervalMs;

  const arm = () => {
    timer = schedule(tick, intervalMs);
    timer?.unref?.();
  };
  const tick = () => {
    if (disposed) return;
    const stalledMs = now() - expectedAt;
    if (stalledMs >= thresholdMs) {
      logger.warn("main", "Loop de eventos do processo principal ficou parado.", { stalledMs });
    }
    expectedAt = now() + intervalMs;
    arm();
  };
  arm();

  return {
    dispose() {
      disposed = true;
      if (timer !== undefined) cancel(timer);
      timer = undefined;
    },
  };
}

module.exports = { installEventLoopMonitor };
