const { randomUUID } = require("node:crypto");
const { appendFile, mkdir, rename, rm, stat } = require("node:fs/promises");
const { dirname } = require("node:path");
const { formatWithOptions } = require("node:util");

const DEFAULT_MAX_LOG_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_LOG_FILES = 5;
const DEFAULT_FLUSH_DELAY_MS = 100;
const DEFAULT_FLUSH_BYTES = 64 * 1024;

const CONSOLE_METHOD_LEVELS = Object.freeze({
  debug: "debug",
  info: "info",
  log: "info",
  warn: "warn",
  error: "error",
});

const RENDERER_LEVELS = Object.freeze({
  debug: "debug",
  info: "info",
  warning: "warn",
  error: "error",
  0: "debug",
  1: "info",
  2: "warn",
  3: "error",
});

function redactSecrets(value) {
  return String(value)
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi, "$1[REDACTED]")
    .replace(/([?&](?:access_token|refresh_token|client_secret|password|token)=)[^&#\s]+/gi, "$1[REDACTED]")
    .replace(/\b((?:access_token|refresh_token|client_secret|password)\s*[:=]\s*)[^&\s,;]+/gi, "$1[REDACTED]");
}

function formatMessage(args) {
  try {
    return redactSecrets(formatWithOptions({
      colors: false,
      compact: true,
      depth: 6,
      maxArrayLength: 100,
      maxStringLength: 20_000,
      breakLength: Infinity,
    }, ...args));
  } catch {
    return redactSecrets(args.map((value) => String(value)).join(" "));
  }
}

function safeSourceId(sourceId) {
  if (!sourceId) return undefined;
  try {
    const parsed = new URL(sourceId);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return redactSecrets(sourceId);
  }
}

async function rotateLogs(logPath, maxFiles) {
  if (maxFiles <= 0) {
    await rm(logPath, { force: true });
    return;
  }
  await rm(`${logPath}.${maxFiles}`, { force: true }).catch(() => undefined);
  for (let index = maxFiles - 1; index >= 1; index -= 1) {
    await rename(`${logPath}.${index}`, `${logPath}.${index + 1}`).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  }
  await rename(logPath, `${logPath}.1`).catch((error) => {
    if (error?.code !== "ENOENT") throw error;
  });
}

function createFileLogger(options) {
  const logPath = options?.logPath;
  if (!logPath) throw new Error("O caminho do log é obrigatório.");
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  const sessionId = options.sessionId ?? randomUUID();
  const pid = Number.isInteger(options.pid) ? options.pid : process.pid;
  const maxBytes = Number.isFinite(options.maxBytes)
    ? Math.max(1024, Number(options.maxBytes))
    : DEFAULT_MAX_LOG_BYTES;
  const maxFiles = Number.isInteger(options.maxFiles)
    ? Math.max(0, options.maxFiles)
    : DEFAULT_MAX_LOG_FILES;
  const flushDelayMs = Number.isFinite(options.flushDelayMs)
    ? Math.max(0, Number(options.flushDelayMs))
    : DEFAULT_FLUSH_DELAY_MS;
  const flushBytes = Number.isFinite(options.flushBytes)
    ? Math.max(1, Number(options.flushBytes))
    : DEFAULT_FLUSH_BYTES;
  const onError = typeof options.onError === "function" ? options.onError : () => undefined;

  let prepared = false;
  let closed = false;
  let flushTimer;
  let pending = [];
  let pendingBytes = 0;
  let queue = Promise.resolve();

  async function appendBatch(batch, batchBytes) {
    if (!prepared) {
      await mkdir(dirname(logPath), { recursive: true });
      prepared = true;
    }
    const current = await stat(logPath).catch((error) => {
      if (error?.code === "ENOENT") return undefined;
      throw error;
    });
    if (current?.size > 0 && current.size + batchBytes > maxBytes) {
      await rotateLogs(logPath, maxFiles);
    }
    await appendFile(logPath, batch, "utf8");
  }

  function enqueueFlush() {
    if (!pending.length) return queue;
    const batch = pending.join("");
    const batchBytes = pendingBytes;
    pending = [];
    pendingBytes = 0;
    queue = queue
      .then(() => appendBatch(batch, batchBytes))
      .catch((error) => {
        try {
          onError(error);
        } catch {
          // O logger é diagnóstico; erro no callback não deve afetar a IDE.
        }
      });
    return queue;
  }

  function scheduleFlush() {
    if (flushTimer || closed) return;
    flushTimer = setTimeout(() => {
      flushTimer = undefined;
      enqueueFlush();
    }, flushDelayMs);
    flushTimer.unref?.();
  }

  function write(level, source, ...args) {
    if (closed) return false;
    const entry = {
      at: timestamp(),
      level,
      source,
      sessionId,
      pid,
      message: formatMessage(args),
    };
    const line = `${JSON.stringify(entry)}\n`;
    pending.push(line);
    pendingBytes += Buffer.byteLength(line);
    if (pendingBytes >= flushBytes || flushDelayMs === 0) enqueueFlush();
    else scheduleFlush();
    return true;
  }

  async function flush() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = undefined;
    }
    enqueueFlush();
    await queue;
  }

  async function close() {
    if (closed) return;
    await flush();
    closed = true;
  }

  return {
    logPath,
    sessionId,
    write,
    debug(source, ...args) {
      return write("debug", source, ...args);
    },
    info(source, ...args) {
      return write("info", source, ...args);
    },
    warn(source, ...args) {
      return write("warn", source, ...args);
    },
    error(source, ...args) {
      return write("error", source, ...args);
    },
    flush,
    close,
  };
}

function installConsoleFileLogging(logger, options = {}) {
  const consoleRef = options.consoleRef ?? console;
  const source = options.source ?? "main";
  const originals = new Map();
  const wrappers = new Map();

  for (const [method, level] of Object.entries(CONSOLE_METHOD_LEVELS)) {
    if (typeof consoleRef[method] !== "function") continue;
    const original = consoleRef[method].bind(consoleRef);
    const wrapper = (...args) => {
      logger.write(level, source, ...args);
      original(...args);
    };
    originals.set(method, consoleRef[method]);
    wrappers.set(method, wrapper);
    consoleRef[method] = wrapper;
  }

  return {
    dispose() {
      for (const [method, original] of originals.entries()) {
        if (consoleRef[method] === wrappers.get(method)) consoleRef[method] = original;
      }
    },
  };
}

function installWindowFileLogging(window, logger) {
  const webContents = window?.webContents;
  if (!webContents?.on) return { dispose() {} };

  const source = `renderer:${webContents.id ?? "unknown"}`;
  const onConsoleMessage = (details, ...legacyArguments) => {
    const [legacyLevel, legacyMessage, legacyLine, legacySourceId] = legacyArguments;
    const level = RENDERER_LEVELS[details?.level ?? legacyLevel] ?? "info";
    const message = details?.message ?? legacyMessage ?? "";
    const lineNumber = details?.lineNumber ?? legacyLine;
    const sourceId = safeSourceId(details?.sourceId ?? legacySourceId);
    const location = sourceId
      ? `${sourceId}${Number.isInteger(lineNumber) && lineNumber > 0 ? `:${lineNumber}` : ""}`
      : undefined;
    logger.write(level, source, message, ...(location ? [`(${location})`] : []));
  };
  const onUnresponsive = () => logger.warn(source, "Janela não responsiva.");
  const onResponsive = () => logger.info(source, "Janela voltou a responder.");

  webContents.on("console-message", onConsoleMessage);
  window.on?.("unresponsive", onUnresponsive);
  window.on?.("responsive", onResponsive);

  return {
    dispose() {
      webContents.removeListener?.("console-message", onConsoleMessage);
      window.removeListener?.("unresponsive", onUnresponsive);
      window.removeListener?.("responsive", onResponsive);
    },
  };
}

module.exports = {
  DEFAULT_MAX_LOG_BYTES,
  DEFAULT_MAX_LOG_FILES,
  createFileLogger,
  installConsoleFileLogging,
  installWindowFileLogging,
  redactSecrets,
};
