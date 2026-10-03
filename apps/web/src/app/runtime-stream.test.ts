// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearActiveWorkspaceScope, setActiveWorkspaceScope } from "./project-session";
import { followHostProcess, type HostProcessOutputDelta, type HostProcessSnapshot } from "./runtime";

type Listener = (event: unknown) => void;
type Reply = Partial<HostProcessOutputDelta> | "drop";

/**
 * Servidor de mentira atrás de um WebSocket de mentira: responde a cada `read`
 * com o próximo item do roteiro; `"drop"` derruba a conexão como uma queda de
 * rede (1006), e `refuse` recusa o upgrade antes de abrir.
 */
class FakeWebSocket {
  static replies: Reply[] = [];
  static refuse = false;
  static instances: FakeWebSocket[] = [];
  readonly url: string;
  readyState = 0;
  readonly sent: string[] = [];
  readonly closeCalls: Array<[number | undefined, string | undefined]> = [];
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => {
      if (FakeWebSocket.refuse) {
        this.readyState = 3;
        this.emit("close", { code: 1006, reason: "" });
        return;
      }
      this.readyState = 1;
      this.emit("open");
    });
  }

  addEventListener(name: string, listener: Listener) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name)!.add(listener);
  }

  send(data: string) {
    this.sent.push(data);
    const reply = FakeWebSocket.replies.shift();
    queueMicrotask(() => {
      if (reply === undefined || this.readyState !== 1) return;
      if (reply === "drop") {
        this.readyState = 3;
        this.emit("close", { code: 1006, reason: "" });
        return;
      }
      this.emit("message", { data: JSON.stringify({ type: "output", ...reply }) });
    });
  }

  close(code?: number, reason?: string) {
    this.closeCalls.push([code, reason]);
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.emit("close", { code: code ?? 1005, reason: reason ?? "" });
  }

  private emit(name: string, event: unknown = {}) {
    for (const listener of [...(this.listeners.get(name) ?? [])]) listener(event);
  }
}

function delta(overrides: Partial<HostProcessOutputDelta>): HostProcessOutputDelta {
  return {
    id: "p",
    status: "running",
    stopRequested: false,
    startedAt: 1,
    durationMs: 1,
    startCursor: 0,
    endCursor: 0,
    cursor: 0,
    truncated: false,
    hasMore: false,
    chunks: [],
    ...overrides,
  };
}

function snapshot(id: string): HostProcessSnapshot {
  return {
    id,
    workspaceRoot: "/ws",
    status: "running",
    executable: "node",
    arguments: [],
    workingDirectory: "/ws",
    stdout: "",
    stderr: "",
    outputStartCursor: 0,
    stopRequested: false,
    startedAt: 1,
  } as unknown as HostProcessSnapshot;
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
}

const SCOPE_ID = "tinyide-0123456789abcdef";
const callbacks = { onProcessStarted() {}, onProcessFinished() {}, onOutput() {} };

describe("acompanhamento de processo pelo canal do runtime", () => {
  const fetchMock = vi.fn<(input: string) => Promise<Response>>();

  beforeEach(() => {
    FakeWebSocket.replies = [];
    FakeWebSocket.refuse = false;
    FakeWebSocket.instances = [];
    fetchMock.mockReset();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal("fetch", fetchMock);
    setActiveWorkspaceScope(SCOPE_ID);
  });

  afterEach(() => {
    clearActiveWorkspaceScope();
    vi.unstubAllGlobals();
  });

  it("lê a saída e o fim pelo canal, sem nenhuma requisição de poll", async () => {
    FakeWebSocket.replies = [
      delta({ id: "p1", chunks: [{ stream: "stdout", text: "olá\n" }], cursor: 4, endCursor: 4 }),
      delta({ id: "p1", status: "exited", exitCode: 0, cursor: 4, endCursor: 4, finishedAt: 9 }),
    ];
    const deltas: HostProcessOutputDelta[] = [];
    const process = await followHostProcess(snapshot("p1"), callbacks, (item) => deltas.push(item), () => undefined);

    expect(process).toMatchObject({ status: "exited", exitCode: 0, finishedAt: 9, outputEndCursor: 4 });
    expect(deltas.map((item) => item.chunks.map((chunk) => chunk.text).join(""))).toEqual(["olá\n"]);
    expect(fetchMock).not.toHaveBeenCalled();
    const socket = FakeWebSocket.instances[0]!;
    expect(socket.url).toBe(`ws://localhost:3000/w/${SCOPE_ID}/core-api/execution/processes/p1/stream`);
    expect(socket.sent.map((raw) => JSON.parse(raw))).toEqual([{ type: "read", cursor: 0 }, { type: "read", cursor: 4 }]);
    expect(socket.closeCalls).toEqual([[1000, "processo encerrado"]]);
  });

  it("cai para requisições quando o runtime recusa o canal", async () => {
    FakeWebSocket.refuse = true;
    fetchMock.mockResolvedValueOnce(jsonResponse(delta({
      id: "p2", status: "exited", exitCode: 1, chunks: [{ stream: "stderr", text: "erro\n" }], cursor: 5, endCursor: 5,
    })));
    const deltas: HostProcessOutputDelta[] = [];
    const process = await followHostProcess(snapshot("p2"), callbacks, (item) => deltas.push(item), () => undefined);

    expect(process).toMatchObject({ status: "exited", exitCode: 1 });
    expect(deltas).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe(`/w/${SCOPE_ID}/core-api/execution/processes/p2/output?cursor=0`);
  });

  it("continua por requisições a partir do último cursor quando o canal cai", async () => {
    FakeWebSocket.replies = [
      delta({ id: "p3", chunks: [{ stream: "stdout", text: "parte 1\n" }], cursor: 8, endCursor: 8 }),
      "drop",
    ];
    fetchMock.mockResolvedValueOnce(jsonResponse(delta({
      id: "p3", status: "exited", exitCode: 0, chunks: [{ stream: "stdout", text: "parte 2\n" }], cursor: 16, endCursor: 16,
    })));
    const deltas: HostProcessOutputDelta[] = [];
    const notices: string[][] = [];
    const process = await followHostProcess(snapshot("p3"), callbacks, (item) => deltas.push(item), (lines) => notices.push([...lines]));

    expect(process).toMatchObject({ status: "exited", exitCode: 0, outputEndCursor: 16 });
    expect(deltas.map((item) => item.chunks[0]!.text)).toEqual(["parte 1\n", "parte 2\n"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe(`/w/${SCOPE_ID}/core-api/execution/processes/p3/output?cursor=8`);
    // A queda do canal não é uma falha de rede para o usuário: nada de aviso.
    expect(notices).toEqual([]);
  });

  it("pede a parada do processo quando o cancelamento chega no meio do fluxo", async () => {
    let cancelled = false;
    FakeWebSocket.replies = [
      delta({ id: "p4", chunks: [{ stream: "stdout", text: "a\n" }], cursor: 2, endCursor: 2 }),
      delta({ id: "p4", status: "exited", exitCode: 130, stopRequested: true, cursor: 2, endCursor: 2 }),
    ];
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 202 }));
    const process = await followHostProcess(snapshot("p4"), {
      ...callbacks,
      shouldStop: () => cancelled,
    }, () => { cancelled = true; }, () => undefined);

    expect(process).toMatchObject({ status: "exited", stopRequested: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe(`/w/${SCOPE_ID}/core-api/execution/processes/p4`);
    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]).toMatchObject({ method: "DELETE" });
  });
});
