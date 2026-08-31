const {appendFile, mkdir, stat, rm} = require("node:fs/promises");
const {dirname} = require("node:path");

const MAX_LOG_BYTES = 1024 * 1024;

/**
 * Registro dos erros de rede entre o renderer e o runtime local.
 *
 * A IDE só consegue mostrar a mensagem que o `fetch` do Chromium lhe entrega
 * ("Failed to fetch"), que não distingue conexão recusada de resposta vazia, de
 * requisição descartada por falta de recursos, de mudança de rota. O código
 * real (`net::ERR_*`) só existe no processo principal, e sem ele cada episódio
 * de "perdi a conexão com o servidor local" começa do zero — foi exatamente o
 * que aconteceu aqui: seis hipóteses testadas e descartadas, nenhuma evidência
 * do que o Chromium tinha decidido.
 */
function installNetworkDiagnostics(options) {
  const {webRequest, runtimeOrigin, logPath} = options;
  if (!webRequest?.onErrorOccurred || !runtimeOrigin || !logPath) return {dispose() {}};
  const write = options.write ?? defaultWriter(logPath);
  const onEntry = typeof options.onEntry === "function" ? options.onEntry : undefined;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  const recent = [];

  webRequest.onErrorOccurred({urls: [`${runtimeOrigin}/*`]}, (details) => {
    const entry = {
      at: timestamp(),
      error: details.error,
      method: details.method,
      // A URL pode carregar cursor/consulta; o caminho basta para identificar a rota.
      url: safePath(details.url),
      resourceType: details.resourceType,
    };
    recent.push(entry);
    if (recent.length > 50) recent.shift();
    onEntry?.(entry);
    void write(`${JSON.stringify(entry)}\n`);
  });

  return {
    /** Últimos erros observados, para inspeção via IPC ou testes. */
    recent() {
      return [...recent];
    },
    dispose() {
      webRequest.onErrorOccurred(null);
    },
  };
}

function safePath(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return String(url);
  }
}

function defaultWriter(logPath) {
  let prepared = false;
  return async (line) => {
    try {
      if (!prepared) {
        await mkdir(dirname(logPath), {recursive: true});
        prepared = true;
      }
      // Log de diagnóstico não deve crescer sem limite num app que fica dias aberto.
      const current = await stat(logPath).catch(() => undefined);
      if (current && current.size > MAX_LOG_BYTES) await rm(logPath, {force: true});
      await appendFile(logPath, line, "utf8");
    } catch {
      // Diagnóstico nunca deve derrubar o processo principal.
    }
  };
}

module.exports = {installNetworkDiagnostics};
