import { once as onceEvent } from "node:events";
import { createServer } from "node:http";
import { connect } from "node:net";
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  acceptWebSocket,
  isWebSocketUpgradeRequest,
  rejectWebSocketUpgrade,
  webSocketAcceptValue,
} from "./websocket.mjs";

const servers = [];
const sockets = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.destroy();
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  })));
});

async function eventually(predicate, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("Condição não observada a tempo.");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** Servidor HTTP que aceita todo upgrade e entrega a conexão ao teste. */
async function websocketServer(onConnection, options = {}) {
  const server = createServer((_request, response) => {
    response.statusCode = 404;
    response.end();
  });
  server.on("upgrade", (request, socket, head) => {
    if (!isWebSocketUpgradeRequest(request)) {
      rejectWebSocketUpgrade(socket, 400, "not a websocket");
      return;
    }
    onConnection(acceptWebSocket(request, socket, head, options), request);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  return `ws://127.0.0.1:${server.address().port}`;
}

function once(target, event) {
  return new Promise((resolve) => target.addEventListener(event, resolve, { once: true }));
}

function nextMessage(target) {
  return once(target, "message").then((event) => event.data);
}

/** Quadro mascarado como o navegador envia; só o suficiente para os casos de borda. */
function clientFrame(opcode, payload, { fin = true, mask = true } = {}) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const header = [];
  header.push((fin ? 0x80 : 0) | opcode);
  const maskBit = mask ? 0x80 : 0;
  if (body.length < 126) header.push(maskBit | body.length);
  else if (body.length <= 0xffff) header.push(maskBit | 126, body.length >> 8, body.length & 0xff);
  else {
    header.push(maskBit | 127);
    const big = Buffer.alloc(8);
    big.writeBigUInt64BE(BigInt(body.length));
    header.push(...big);
  }
  if (!mask) return Buffer.concat([Buffer.from(header), body]);
  const key = randomBytes(4);
  const masked = Buffer.from(body.map((byte, index) => byte ^ key[index & 3]));
  return Buffer.concat([Buffer.from(header), key, masked]);
}

function parseServerFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const opcode = buffer[offset] & 0x0f;
    let length = buffer[offset + 1] & 0x7f;
    let headerLength = 2;
    if (length === 126) {
      length = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (length === 127) {
      length = Number(buffer.readBigUInt64BE(offset + 2));
      headerLength = 10;
    }
    if (offset + headerLength + length > buffer.length) break;
    frames.push({ opcode, payload: buffer.subarray(offset + headerLength, offset + headerLength + length) });
    offset += headerLength + length;
  }
  return frames;
}

/** Cliente cru: faz o handshake e devolve o socket já pronto para quadros. */
async function rawClient(url) {
  const { hostname, port } = new URL(url);
  const socket = connect(Number(port), hostname);
  sockets.push(socket);
  socket.setNoDelay(true);
  await onceEvent(socket, "connect");
  socket.write([
    "GET / HTTP/1.1",
    `Host: ${hostname}:${port}`,
    "Upgrade: websocket",
    "Connection: Upgrade",
    "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
    "Sec-WebSocket-Version: 13",
    "",
    "",
  ].join("\r\n"));
  let received = Buffer.alloc(0);
  const headerEnd = await new Promise((resolve) => {
    socket.on("data", function onData(chunk) {
      received = Buffer.concat([received, chunk]);
      const end = received.indexOf("\r\n\r\n");
      if (end < 0) return;
      socket.off("data", onData);
      resolve(end + 4);
    });
  });
  expect(received.subarray(0, headerEnd).toString()).toContain("Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
  const leftover = received.subarray(headerEnd);
  const frames = [];
  let pending = leftover;
  const waiters = [];
  const flush = () => {
    const parsed = parseServerFrames(pending);
    if (!parsed.length) return;
    let consumed = 0;
    for (const frame of parsed) {
      consumed += frame.payload.length + (frame.payload.length < 126 ? 2 : frame.payload.length <= 0xffff ? 4 : 10);
      frames.push(frame);
    }
    pending = pending.subarray(consumed);
    while (waiters.length && frames.length) waiters.shift()(frames.shift());
  };
  socket.on("data", (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    flush();
  });
  flush();
  return {
    socket,
    send: (opcode, payload, options) => socket.write(clientFrame(opcode, payload, options)),
    nextFrame: () => (frames.length ? Promise.resolve(frames.shift()) : new Promise((resolve) => waiters.push(resolve))),
    closed: () => onceEvent(socket, "close"),
  };
}

describe("websocket handshake helpers", () => {
  it("computes the RFC 6455 accept value", () => {
    expect(webSocketAcceptValue("dGhlIHNhbXBsZSBub25jZQ==")).toBe("s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
  });

  it("recognises only complete upgrade requests", () => {
    const headers = {
      upgrade: "websocket",
      connection: "keep-alive, Upgrade",
      "sec-websocket-key": "abc",
      "sec-websocket-version": "13",
    };
    expect(isWebSocketUpgradeRequest({ method: "GET", headers })).toBe(true);
    expect(isWebSocketUpgradeRequest({ method: "POST", headers })).toBe(false);
    expect(isWebSocketUpgradeRequest({ method: "GET", headers: { ...headers, "sec-websocket-version": "8" } })).toBe(false);
    expect(isWebSocketUpgradeRequest({ method: "GET", headers: { ...headers, upgrade: "h2c" } })).toBe(false);
    expect(isWebSocketUpgradeRequest({ method: "GET", headers: { ...headers, "sec-websocket-key": undefined } })).toBe(false);
  });

  it("rejects an upgrade with a readable HTTP error", async () => {
    const server = createServer();
    server.on("upgrade", (_request, socket) => rejectWebSocketUpgrade(socket, 409, "abra um workspace"));
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    servers.push(server);
    const socket = connect(server.address().port, "127.0.0.1");
    await onceEvent(socket, "connect");
    socket.write("GET /x HTTP/1.1\r\nHost: a\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: k\r\nSec-WebSocket-Version: 13\r\n\r\n");
    let received = "";
    socket.on("data", (chunk) => { received += chunk; });
    await onceEvent(socket, "close");
    expect(received).toMatch(/^HTTP\/1\.1 409 Conflict/);
    expect(received).toContain('{"error":"abra um workspace"}');
  });
});

describe("websocket connection", () => {
  it("exchanges text messages of every length class with a browser-style client", async () => {
    const url = await websocketServer((connection) => {
      connection.on("message", (data, binary) => {
        connection.send(binary ? data : `echo:${data}`);
      });
    });
    const client = new WebSocket(url);
    await once(client, "open");
    for (const size of [5, 200, 70_000]) {
      const payload = "x".repeat(size);
      client.send(payload);
      const echoed = await nextMessage(client);
      expect(echoed.length).toBe(size + 5);
      expect(echoed.startsWith("echo:")).toBe(true);
    }
    client.binaryType = "arraybuffer";
    client.send(new Uint8Array([1, 2, 3]));
    const binary = await nextMessage(client);
    expect([...new Uint8Array(binary)]).toEqual([1, 2, 3]);
    client.close(1000, "done");
    await once(client, "close");
  });

  it("completes the close handshake in both directions", async () => {
    const serverClosures = [];
    let serverConnection;
    const url = await websocketServer((connection) => {
      serverConnection = connection;
      connection.on("close", (code, reason) => serverClosures.push([code, reason]));
    });
    const first = new WebSocket(url);
    await once(first, "open");
    first.close(4001, "client leaves");
    const closedByClient = await once(first, "close");
    expect(closedByClient.code).toBe(4001);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(serverClosures).toEqual([[4001, "client leaves"]]);
    expect(serverConnection.closed).toBe(true);

    const second = new WebSocket(url);
    await once(second, "open");
    expect(serverConnection.send("still open")).toBe(true);
    expect(await nextMessage(second)).toBe("still open");
    serverConnection.close(1012, "restarting");
    const closedByServer = await once(second, "close");
    expect(closedByServer.code).toBe(1012);
    expect(closedByServer.reason).toBe("restarting");
    expect(serverConnection.send("too late")).toBe(false);
  });

  it("reassembles fragmented messages and answers pings", async () => {
    const received = [];
    const url = await websocketServer((connection) => {
      connection.on("message", (data) => received.push(data));
    });
    const client = await rawClient(url);
    client.send(0x1, "hel", { fin: false });
    client.send(0x9, "ping!");
    const pong = await client.nextFrame();
    expect(pong.opcode).toBe(0xa);
    expect(pong.payload.toString()).toBe("ping!");
    client.send(0x0, "lo ", { fin: false });
    client.send(0x0, "world");
    await eventually(() => received.length > 0);
    expect(received).toEqual(["hello world"]);
  });

  it("fails the connection on unmasked frames", async () => {
    const closures = [];
    const url = await websocketServer((connection) => {
      connection.on("close", (code) => closures.push(code));
    });
    const client = await rawClient(url);
    client.send(0x1, "naked", { mask: false });
    const close = await client.nextFrame();
    expect(close.opcode).toBe(0x8);
    expect(close.payload.readUInt16BE(0)).toBe(1002);
    client.send(0x8, close.payload);
    await client.closed();
    expect(closures).toEqual([1002]);
  });

  it("refuses messages above the configured size", async () => {
    const url = await websocketServer((connection) => {
      connection.on("message", () => { throw new Error("oversized message must not be delivered"); });
    }, { maxMessageBytes: 1024 });
    const client = await rawClient(url);
    client.send(0x1, "a".repeat(2048));
    const close = await client.nextFrame();
    expect(close.opcode).toBe(0x8);
    expect(close.payload.readUInt16BE(0)).toBe(1009);
  });

  it("drops a peer that never answers the heartbeat", async () => {
    const closures = [];
    const url = await websocketServer((connection) => {
      connection.on("close", (code) => closures.push(code));
    }, { heartbeatMs: 30 });
    const client = await rawClient(url);
    const ping = await client.nextFrame();
    expect(ping.opcode).toBe(0x9);
    await client.closed();
    expect(closures).toEqual([1006]);
  });

  it("processes data that arrived together with the upgrade request", async () => {
    const received = [];
    const url = await websocketServer((connection) => {
      connection.on("message", (data) => received.push(data));
    });
    const { hostname, port } = new URL(url);
    const socket = connect(Number(port), hostname);
    sockets.push(socket);
    await onceEvent(socket, "connect");
    const handshake = [
      "GET / HTTP/1.1",
      `Host: ${hostname}:${port}`,
      "Upgrade: websocket",
      "Connection: Upgrade",
      "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
      "Sec-WebSocket-Version: 13",
      "",
      "",
    ].join("\r\n");
    socket.write(Buffer.concat([Buffer.from(handshake), clientFrame(0x1, "early bird")]));
    await eventually(() => received.length > 0);
    expect(received).toEqual(["early bird"]);
  });
});
