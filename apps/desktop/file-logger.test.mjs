import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  createFileLogger,
  installConsoleFileLogging,
  installWindowFileLogging,
  redactSecrets,
} = require("./file-logger.cjs");

const roots = [];

function testLogPath() {
  const root = resolve(".tmp", "file-logger-tests", randomUUID());
  roots.push(root);
  return resolve(root, "tinyide.log");
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("logger de arquivo do desktop", () => {
  it("grava JSONL estruturado e preserva stack de erro", async () => {
    const logPath = testLogPath();
    const logger = createFileLogger({
      logPath,
      sessionId: "session-1",
      pid: 42,
      timestamp: () => "2026-08-31T20:00:00.000Z",
      flushDelayMs: 0,
    });

    logger.error("runtime", "Falha no backend", new Error("boom"));
    await logger.flush();

    const entry = JSON.parse((await readFile(logPath, "utf8")).trim());
    expect(entry).toMatchObject({
      at: "2026-08-31T20:00:00.000Z",
      level: "error",
      source: "runtime",
      sessionId: "session-1",
      pid: 42,
    });
    expect(entry.message).toContain("Falha no backend");
    expect(entry.message).toContain("Error: boom");
  });

  it("rotaciona o arquivo sem crescimento ilimitado", async () => {
    const logPath = testLogPath();
    const logger = createFileLogger({
      logPath,
      maxBytes: 1024,
      maxFiles: 2,
      flushDelayMs: 0,
    });

    logger.info("test", "A".repeat(800));
    await logger.flush();
    logger.info("test", "B".repeat(800));
    await logger.flush();

    expect(await readFile(`${logPath}.1`, "utf8")).toContain("AAAA");
    expect(await readFile(logPath, "utf8")).toContain("BBBB");
  });

  it("remove segredos comuns antes de persistir", async () => {
    const logPath = testLogPath();
    const logger = createFileLogger({ logPath, flushDelayMs: 0 });
    logger.warn(
      "oauth",
      "Authorization: Bearer abc.def-123",
      "http://127.0.0.1/callback?access_token=secret&client_secret=hidden",
    );
    await logger.flush();

    const content = await readFile(logPath, "utf8");
    expect(content).not.toContain("abc.def-123");
    expect(content).not.toContain("access_token=secret");
    expect(content).not.toContain("client_secret=hidden");
    expect(content).toContain("[REDACTED]");
  });

  it("duplica console no arquivo sem alterar a saída original", () => {
    const logger = { write: vi.fn() };
    const originalWarn = vi.fn();
    const consoleRef = {
      debug: vi.fn(),
      info: vi.fn(),
      log: vi.fn(),
      warn: originalWarn,
      error: vi.fn(),
    };
    const logging = installConsoleFileLogging(logger, { consoleRef, source: "desktop" });

    consoleRef.warn("atenção", { code: 7 });

    expect(logger.write).toHaveBeenCalledWith("warn", "desktop", "atenção", { code: 7 });
    expect(originalWarn).toHaveBeenCalledWith("atenção", { code: 7 });
    logging.dispose();
    expect(consoleRef.warn).toBe(originalWarn);
  });

  it("captura console e travamento visual do renderer", () => {
    const logger = { write: vi.fn(), warn: vi.fn(), info: vi.fn() };
    const webContents = new EventEmitter();
    webContents.id = 17;
    const window = new EventEmitter();
    window.webContents = webContents;
    const logging = installWindowFileLogging(window, logger);

    webContents.emit("console-message", {
      level: "error",
      message: "renderer boom",
      lineNumber: 23,
      sourceId: "http://127.0.0.1:9765/src/app.tsx?token=secret",
    });
    window.emit("unresponsive");

    expect(logger.write).toHaveBeenCalledWith(
      "error",
      "renderer:17",
      "renderer boom",
      "(http://127.0.0.1:9765/src/app.tsx:23)",
    );
    expect(logger.warn).toHaveBeenCalledWith("renderer:17", "Janela não responsiva.");
    logging.dispose();
    expect(webContents.listenerCount("console-message")).toBe(0);
  });

  it("redige tokens também em textos avulsos", () => {
    expect(redactSecrets("password=my-secret refresh_token: abc123")).toBe(
      "password=[REDACTED] refresh_token: [REDACTED]",
    );
  });
});
