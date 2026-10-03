import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";

/**
 * Servidor WebSocket mínimo (RFC 6455) para os canais entre o frontend e o
 * backend de um plugin.
 *
 * Por que não long-polling: o Chromium limita a seis as conexões HTTP/1.1
 * simultâneas por origem, compartilhadas por todas as janelas da IDE. Cada
 * long-poll aberto ocupa uma delas o tempo inteiro, e com alguns terminais e
 * pollers de plugin a fila enche — aí qualquer requisição curta (uma tecla no
 * terminal, salvar um arquivo) espera um long-poll devolver, por até dez
 * segundos. WebSockets têm pool próprio no navegador e não entram nessa conta.
 *
 * Por que não uma dependência: o runtime empacotado só leva dependências de
 * produção, e o subconjunto necessário aqui — handshake, quadros de texto e
 * binários, fragmentação, ping/pong e o fechamento ordenado — é pequeno o
 * bastante para ser lido inteiro.
 */

export const WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
export const DEFAULT_MAX_MESSAGE_BYTES = 16 * 1024 * 1024;
export const DEFAULT_HEARTBEAT_MS = 30_000;
const CLOSE_HANDSHAKE_TIMEOUT_MS = 1_000;
const MAX_CONTROL_PAYLOAD_BYTES = 125;
const MAX_CLOSE_REASON_BYTES = 123;

const OPCODE = Object.freeze({
  CONTINUATION: 0x0,
  TEXT: 0x1,
  BINARY: 0x2,
  CLOSE: 0x8,
  PING: 0x9,
  PONG: 0xa,
});

const STATUS_TEXT = Object.freeze({
  400: "Bad Request",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  426: "Upgrade Required",
  500: "Internal Server Error",
});

export function isWebSocketUpgradeRequest(request) {
  const headers = request?.headers ?? {};
  const upgrade = String(headers.upgrade ?? "").trim().toLowerCase();
  const connection = String(headers.connection ?? "").toLowerCase().split(",").map((token) => token.trim());
  return request?.method === "GET"
    && upgrade === "websocket"
    && connection.includes("upgrade")
    && typeof headers["sec-websocket-key"] === "string"
    && headers["sec-websocket-key"].trim() !== ""
    && String(headers["sec-websocket-version"] ?? "").trim() === "13";
}

export function webSocketAcceptValue(key) {
  return createHash("sha1").update(`${String(key).trim()}${WEBSOCKET_GUID}`).digest("base64");
}

/**
 * Responde a um upgrade recusado como HTTP comum: o navegador converte em
 * falha de conexão, mas quem depura com `curl` lê o motivo.
 */
export function rejectWebSocketUpgrade(socket, statusCode, message) {
  if (!socket || socket.destroyed) return;
  const body = JSON.stringify({ error: message });
  const payload = [
    `HTTP/1.1 ${statusCode} ${STATUS_TEXT[statusCode] ?? "Error"}`,
    "Content-Type: application/json; charset=utf-8",
    `Content-Length: ${Buffer.byteLength(body)}`,
    "Connection: close",
    "",
    body,
  ].join("\r\n");
  socket.once("error", () => undefined);
  socket.end(payload);
}

export function acceptWebSocket(request, socket, head, options = {}) {
  const key = request.headers["sec-websocket-key"];
  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${webSocketAcceptValue(key)}`,
    "",
    "",
  ].join("\r\n"));
  return new WebSocketConnection(socket, head, options);
}

function encodeFrame(opcode, payload) {
  const length = payload.length;
  let header;
  if (length < 126) {
    header = Buffer.alloc(2);
    header[1] = length;
  } else if (length <= 0xffff) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  header[0] = 0x80 | opcode;
  return Buffer.concat([header, payload]);
}

function closePayload(code, reason) {
  const text = Buffer.from(String(reason ?? ""), "utf8").subarray(0, MAX_CLOSE_REASON_BYTES);
  const payload = Buffer.alloc(2 + text.length);
  payload.writeUInt16BE(code, 0);
  text.copy(payload, 2);
  return payload;
}

/**
 * Eventos: `message(data, isBinary)`, `close(code, reason)` e `error(error)`.
 * `send()` devolve `false` quando a conexão já está encerrada — o chamador
 * decide se isso é um erro ou só um cliente que foi embora.
 */
export class WebSocketConnection extends EventEmitter {
  #socket;
  #buffer = Buffer.alloc(0);
  #fragments = [];
  #fragmentOpcode;
  #fragmentBytes = 0;
  #maxMessageBytes;
  #closeSent = false;
  #closed = false;
  #closeTimer;
  #heartbeat;
  #awaitingPong = false;

  constructor(socket, head, { maxMessageBytes = DEFAULT_MAX_MESSAGE_BYTES, heartbeatMs = DEFAULT_HEARTBEAT_MS } = {}) {
    super();
    this.#socket = socket;
    this.#maxMessageBytes = maxMessageBytes;
    socket.setNoDelay?.(true);
    socket.on("data", (chunk) => this.#onData(chunk));
    socket.on("error", (error) => {
      if (this.listenerCount("error") > 0) this.emit("error", error);
      this.#finish(1006, "");
    });
    socket.on("close", () => this.#finish(1006, ""));
    // Sockets do servidor HTTP nascem com `allowHalfOpen`: o FIN do cliente
    // não fecha o nosso lado sozinho, e um canal meio-fechado seguraria o
    // `server.close()` para sempre.
    socket.on("end", () => {
      this.#finish(1006, "");
      socket.end();
    });
    if (heartbeatMs > 0) {
      this.#heartbeat = setInterval(() => this.#beat(), heartbeatMs);
      this.#heartbeat.unref?.();
    }
    // Bytes que vieram no mesmo segmento do handshake. Só são processados no
    // tick seguinte: quem chamou `acceptWebSocket` ainda vai registrar os
    // listeners, e um `message` emitido antes disso se perderia.
    if (head && head.length > 0) {
      const early = Buffer.from(head);
      process.nextTick(() => {
        if (!this.#closed) this.#onData(early);
      });
    }
  }

  get closed() {
    return this.#closed;
  }

  /** Bytes ainda não entregues ao kernel; útil para aplicar backpressure. */
  get bufferedAmount() {
    return this.#socket.writableLength ?? 0;
  }

  send(data) {
    if (this.#closed || this.#closeSent) return false;
    const binary = Buffer.isBuffer(data) || data instanceof Uint8Array;
    const payload = binary ? Buffer.from(data) : Buffer.from(String(data), "utf8");
    return this.#write(encodeFrame(binary ? OPCODE.BINARY : OPCODE.TEXT, payload));
  }

  ping(payload = Buffer.alloc(0)) {
    if (this.#closed || this.#closeSent) return false;
    return this.#write(encodeFrame(OPCODE.PING, Buffer.from(payload).subarray(0, MAX_CONTROL_PAYLOAD_BYTES)));
  }

  /**
   * Fechamento ordenado: envia o quadro de close e espera o eco do cliente.
   * Se ele não chegar, o socket é destruído — um cliente que sumiu não pode
   * manter o canal pendurado.
   */
  close(code = 1000, reason = "") {
    if (this.#closed || this.#closeSent) return;
    this.#closeSent = true;
    this.#write(encodeFrame(OPCODE.CLOSE, closePayload(code, reason)));
    this.#closeTimer = setTimeout(() => {
      this.#finish(code, reason);
      this.#socket.destroy();
    }, CLOSE_HANDSHAKE_TIMEOUT_MS);
    this.#closeTimer.unref?.();
  }

  /** Derruba o socket sem handshake. */
  terminate() {
    this.#finish(1006, "");
    this.#socket.destroy();
  }

  #write(frame) {
    if (this.#socket.destroyed || !this.#socket.writable) return false;
    this.#socket.write(frame);
    return true;
  }

  #beat() {
    if (this.#closed) return;
    if (this.#awaitingPong) {
      this.terminate();
      return;
    }
    this.#awaitingPong = true;
    this.ping();
  }

  #fail(code, reason) {
    this.#fragments = [];
    this.#fragmentOpcode = undefined;
    this.#fragmentBytes = 0;
    this.close(code, reason);
  }

  #onData(chunk) {
    if (this.#closed) return;
    this.#buffer = this.#buffer.length ? Buffer.concat([this.#buffer, chunk]) : Buffer.from(chunk);
    for (;;) {
      const frame = this.#parseFrame();
      if (!frame) return;
      this.#handleFrame(frame);
      if (this.#closed) return;
    }
  }

  #parseFrame() {
    const buffer = this.#buffer;
    if (buffer.length < 2) return undefined;
    const first = buffer[0];
    const second = buffer[1];
    const fin = (first & 0x80) !== 0;
    const rsv = first & 0x70;
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    const lengthMarker = second & 0x7f;
    let headerLength = 2;
    let payloadLength = lengthMarker;
    if (lengthMarker === 126) {
      if (buffer.length < 4) return undefined;
      payloadLength = buffer.readUInt16BE(2);
      headerLength = 4;
    } else if (lengthMarker === 127) {
      if (buffer.length < 10) return undefined;
      const big = buffer.readBigUInt64BE(2);
      if (big > BigInt(Number.MAX_SAFE_INTEGER)) {
        this.#fail(1009, "Mensagem grande demais.");
        return undefined;
      }
      payloadLength = Number(big);
      headerLength = 10;
    }
    if (rsv !== 0) {
      this.#fail(1002, "Extensão não negociada.");
      return undefined;
    }
    if (!masked) {
      this.#fail(1002, "Quadros do cliente precisam ser mascarados.");
      return undefined;
    }
    const isControl = (opcode & 0x08) !== 0;
    if (isControl && (!fin || payloadLength > MAX_CONTROL_PAYLOAD_BYTES)) {
      this.#fail(1002, "Quadro de controle inválido.");
      return undefined;
    }
    if (payloadLength > this.#maxMessageBytes || this.#fragmentBytes + payloadLength > this.#maxMessageBytes) {
      this.#fail(1009, "Mensagem grande demais.");
      return undefined;
    }
    const maskOffset = headerLength;
    headerLength += 4;
    const total = headerLength + payloadLength;
    if (buffer.length < total) return undefined;
    const payload = Buffer.allocUnsafe(payloadLength);
    for (let index = 0; index < payloadLength; index += 1) {
      payload[index] = buffer[headerLength + index] ^ buffer[maskOffset + (index & 3)];
    }
    this.#buffer = buffer.subarray(total);
    return { fin, opcode, payload };
  }

  #handleFrame({ fin, opcode, payload }) {
    switch (opcode) {
      case OPCODE.CLOSE: {
        const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1005;
        const reason = payload.length > 2 ? payload.subarray(2).toString("utf8") : "";
        if (!this.#closeSent) {
          this.#closeSent = true;
          this.#write(encodeFrame(OPCODE.CLOSE, payload.length >= 2 ? closePayload(code, reason) : Buffer.alloc(0)));
        }
        this.#finish(code, reason);
        this.#socket.end();
        return;
      }
      case OPCODE.PING:
        this.#write(encodeFrame(OPCODE.PONG, payload));
        return;
      case OPCODE.PONG:
        this.#awaitingPong = false;
        return;
      case OPCODE.TEXT:
      case OPCODE.BINARY:
        if (this.#fragmentOpcode !== undefined) {
          this.#fail(1002, "Fragmento interrompido por novo quadro de dados.");
          return;
        }
        if (fin) {
          this.#emitMessage(opcode, payload);
          return;
        }
        this.#fragmentOpcode = opcode;
        this.#fragments = [payload];
        this.#fragmentBytes = payload.length;
        return;
      case OPCODE.CONTINUATION: {
        if (this.#fragmentOpcode === undefined) {
          this.#fail(1002, "Continuação sem quadro inicial.");
          return;
        }
        this.#fragments.push(payload);
        this.#fragmentBytes += payload.length;
        if (!fin) return;
        const assembled = Buffer.concat(this.#fragments);
        const assembledOpcode = this.#fragmentOpcode;
        this.#fragments = [];
        this.#fragmentOpcode = undefined;
        this.#fragmentBytes = 0;
        this.#emitMessage(assembledOpcode, assembled);
        return;
      }
      default:
        this.#fail(1002, "Opcode desconhecido.");
    }
  }

  #emitMessage(opcode, payload) {
    if (this.#closeSent) return;
    if (opcode === OPCODE.TEXT) this.emit("message", payload.toString("utf8"), false);
    else this.emit("message", payload, true);
  }

  #finish(code, reason) {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#heartbeat) clearInterval(this.#heartbeat);
    if (this.#closeTimer) clearTimeout(this.#closeTimer);
    this.emit("close", code, reason);
  }
}
