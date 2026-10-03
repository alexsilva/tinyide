import { describe, expect, it } from "vitest";
import { openRuntimeChannel, runtimeChannelUrl } from "./plugin-channel";

type Listener = (event: unknown) => void;

/** WebSocket de mentira com o mínimo que o canal usa. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readonly url: string;
  readyState = 0;
  sent: string[] = [];
  closeCalls: Array<[number | undefined, string | undefined]> = [];
  private listeners = new Map<string, Set<Listener>>();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(name: string, listener: Listener) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name)!.add(listener);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close(code?: number, reason?: string) {
    this.closeCalls.push([code, reason]);
    this.readyState = 3;
    this.emit("close", { code: code ?? 1005, reason: reason ?? "" });
  }

  emit(name: string, event: unknown = {}) {
    for (const listener of [...(this.listeners.get(name) ?? [])]) listener(event);
  }

  open() {
    this.readyState = 1;
    this.emit("open");
  }
}

const Impl = FakeWebSocket as unknown as new (url: string) => WebSocket;

describe("runtimeChannelUrl", () => {
  it("keeps the runtime origin and switches the scheme to WebSocket", () => {
    expect(runtimeChannelUrl("/w/tinyide-abc/plugin-api/tinyide.terminal/sessions/1/stream", "http://127.0.0.1:4321/w/tinyide-abc/"))
      .toBe("ws://127.0.0.1:4321/w/tinyide-abc/plugin-api/tinyide.terminal/sessions/1/stream");
    expect(runtimeChannelUrl("/x", "https://ide.example/")).toBe("wss://ide.example/x");
  });
});

describe("openRuntimeChannel", () => {
  it("resolves once the socket opens and forwards messages, sends and closes", async () => {
    FakeWebSocket.instances = [];
    const pending = openRuntimeChannel("ws://127.0.0.1:1/x", { WebSocketImpl: Impl });
    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    const channel = await pending;

    const received: string[] = [];
    const closures: Array<{ code: number; reason: string }> = [];
    channel.onMessage((data) => received.push(data));
    const closeSubscription = channel.onClose((event) => closures.push(event));
    socket.emit("message", { data: "hello" });
    socket.emit("message", { data: new ArrayBuffer(2) });
    expect(received).toEqual(["hello"]);

    expect(channel.send("ping")).toBe(true);
    expect(socket.sent).toEqual(["ping"]);

    closeSubscription.dispose();
    channel.onClose((event) => closures.push({ ...event, reason: `second:${event.reason}` }));
    socket.emit("close", { code: 1012, reason: "restart" });
    expect(channel.closed).toBe(true);
    expect(closures).toEqual([{ code: 1012, reason: "second:restart" }]);
    expect(channel.send("late")).toBe(false);
  });

  it("rejects as a transient failure when the upgrade is refused before opening", async () => {
    FakeWebSocket.instances = [];
    const pending = openRuntimeChannel("ws://127.0.0.1:1/x", { WebSocketImpl: Impl });
    FakeWebSocket.instances[0]!.emit("close", { code: 1006, reason: "" });
    await expect(pending).rejects.toMatchObject({
      name: "TransientRuntimeError",
      statusCode: 503,
      code: 1006,
    });
  });

  it("closes the socket when the workspace scope is abandoned", async () => {
    FakeWebSocket.instances = [];
    const controller = new AbortController();
    const pending = openRuntimeChannel("ws://127.0.0.1:1/x", { WebSocketImpl: Impl, signal: controller.signal });
    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    const channel = await pending;
    controller.abort();
    expect(socket.closeCalls).toEqual([[1000, "workspace mudou"]]);
    expect(channel.closed).toBe(true);
  });

  it("does not open a socket for an already abandoned scope", async () => {
    FakeWebSocket.instances = [];
    const controller = new AbortController();
    controller.abort(new Error("já mudou"));
    await expect(openRuntimeChannel("ws://127.0.0.1:1/x", { WebSocketImpl: Impl, signal: controller.signal }))
      .rejects.toThrow("já mudou");
    expect(FakeWebSocket.instances).toHaveLength(0);
  });
});
