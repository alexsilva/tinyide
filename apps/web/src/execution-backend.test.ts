/// <reference types="node" />

import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
// @ts-expect-error The runtime backend is an ESM JavaScript module.
import { createExecutionBackend } from "../../../packages/runtime-server/src/execution-backend.mjs";

interface BackendResponse<Value = unknown> {
  readonly status: number;
  readonly body: Value;
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

async function callBackend<Value>(
  handler: (request: Readable & { method: string; headers: Record<string, string> }, response: unknown, path: string) => Promise<void>,
  method: string,
  path: string,
  body?: unknown,
): Promise<BackendResponse<Value>> {
  const requestBody = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const request = Object.assign(Readable.from(requestBody), {
    method,
    url: path,
    headers: {} as Record<string, string>,
  });
  return new Promise<BackendResponse<Value>>((resolve, reject) => {
    const response = {
      statusCode: 0,
      setHeader() {},
      end(value = "") {
        try {
          resolve({
            status: response.statusCode,
            body: value ? JSON.parse(String(value)) as Value : undefined as Value,
          });
        } catch (error) {
          reject(error);
        }
      },
    };
    Promise.resolve(handler(request, response, path.split("?", 1)[0]!)).catch(reject);
  });
}

describe("execution backend sessions", () => {
  it("streams process output incrementally with bounded retention", async () => {
    const root = await mkdtemp(join(tmpdir(), "tinyide-execution-stream-"));
    const backend = createExecutionBackend({
      workspaceRoot: root,
      maxOutputChars: 2_048,
      maxOutputReadChars: 256,
      maxSnapshotStreamChars: 256,
      maxSnapshotOutputChars: 512,
    });
    let processId: string | undefined;
    try {
      const program = "for(let i=0;i<600;i++) process.stdout.write(`line-${i.toString().padStart(4,'0')}\\n`);";
      const started = await callBackend<{ readonly id: string }>(backend, "POST", "/execution/processes", {
        executable: process.execPath,
        arguments: ["-e", program],
        workingDirectory: root,
      });
      processId = started.body.id;

      let cursor = 0;
      let truncated = false;
      let output = "";
      let status = "running";
      let hasMore = true;
      for (let attempt = 0; attempt < 100 && (status === "running" || hasMore); attempt += 1) {
        const delta = (await callBackend<{
          readonly status: string;
          readonly cursor: number;
          readonly endCursor: number;
          readonly hasMore: boolean;
          readonly truncated: boolean;
          readonly chunks: readonly { readonly text: string }[];
        }>(backend, "GET", `/execution/processes/${processId}/output?cursor=${cursor}`)).body;
        status = delta.status;
        cursor = delta.cursor;
        hasMore = delta.hasMore;
        truncated ||= delta.truncated;
        output += delta.chunks.map((chunk) => chunk.text).join("");
        if (!delta.hasMore) await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const snapshot = (await callBackend<{
        readonly status: string;
        readonly stdout: string;
        readonly output: string;
        readonly outputStartCursor: number;
        readonly outputEndCursor: number;
      }>(backend, "GET", `/execution/processes/${processId}`)).body;
      expect(snapshot.status).toBe("exited");
      expect(snapshot.stdout.length).toBeLessThanOrEqual(256);
      expect(snapshot.output.length).toBeLessThanOrEqual(512);
      expect(snapshot.outputEndCursor).toBeGreaterThan(snapshot.outputStartCursor);
      expect(truncated).toBe(true);
      expect(output).toContain("line-0599");
    } finally {
      if (processId) await callBackend(backend, "DELETE", `/execution/processes/${processId}`).catch(() => undefined);
      await backend.dispose();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("lists running processes only in their workspace and preserves presentation for reconnection", async () => {
    const root = await mkdtemp(join(tmpdir(), "tinyide-execution-"));
    const otherRoot = await mkdtemp(join(tmpdir(), "tinyide-execution-other-"));
    let activeRoot = root;
    const backend = createExecutionBackend({ workspaceRoot: () => activeRoot });
    let processId: string | undefined;

    try {
      const started = await callBackend<{
        readonly id: string;
        readonly workspaceRoot: string;
        readonly status: string;
        readonly presentation: { readonly sourceId: string; readonly outputPrefix: readonly string[] };
      }>(backend, "POST", "/execution/processes", {
        executable: process.execPath,
        arguments: ["-e", "console.log('ready'); setInterval(() => console.log('tick'), 50)"],
        workingDirectory: root,
        presentation: {
          kind: "profile",
          sourceId: "profile.runserver",
          sourceName: "Django runserver",
          stepId: "runserver",
          stepName: "Run server",
          outputPrefix: ["[perfil] Django runserver", "$ python manage.py runserver"],
        },
      });
      expect(started.status).toBe(201);
      expect(started.body.status).toBe("running");
      expect(started.body.workspaceRoot).toBe(root);
      expect(started.body.presentation.sourceId).toBe("profile.runserver");
      processId = started.body.id;

      const listed = await callBackend<readonly { readonly id: string; readonly status: string }[]>(
        backend,
        "GET",
        "/execution/processes",
      );
      expect(listed.status).toBe(200);
      expect(listed.body).toEqual([expect.objectContaining({ id: processId, status: "running" })]);

      activeRoot = otherRoot;
      const isolatedList = await callBackend<readonly unknown[]>(backend, "GET", "/execution/processes");
      expect(isolatedList.body).toEqual([]);
      const isolatedRead = await callBackend<{ readonly error: string }>(
        backend,
        "GET",
        `/execution/processes/${processId}`,
      );
      expect(isolatedRead.status).toBe(404);

      activeRoot = root;
      let snapshot: { readonly status: string; readonly stdout: string } | undefined;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        snapshot = (await callBackend<{ readonly status: string; readonly stdout: string }>(
          backend,
          "GET",
          `/execution/processes/${processId}`,
        )).body;
        if (snapshot.stdout.includes("ready")) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(snapshot?.stdout).toContain("ready");

      const stopped = await callBackend<{ readonly stopRequested: boolean }>(
        backend,
        "DELETE",
        `/execution/processes/${processId}`,
      );
      expect(stopped.status).toBe(202);
      expect(stopped.body.stopRequested).toBe(true);
      for (let attempt = 0; attempt < 50; attempt += 1) {
        snapshot = (await callBackend<{ readonly status: string; readonly stdout: string }>(
          backend,
          "GET",
          `/execution/processes/${processId}`,
        )).body;
        if (snapshot.status === "exited") break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(snapshot?.status).toBe("exited");
    } finally {
      if (processId) {
        activeRoot = root;
        await callBackend(backend, "DELETE", `/execution/processes/${processId}`).catch(() => undefined);
      }
      await Promise.all([
        rm(root, { recursive: true, force: true }),
        rm(otherRoot, { recursive: true, force: true }),
      ]);
    }
  }, 10_000);

  it("persists provider-owned execution data independently of the bounded output", async () => {
    const root = await mkdtemp(join(tmpdir(), "tinyide-execution-data-"));
    const backend = createExecutionBackend({ workspaceRoot: root, maxOutputChars: 1_024 });
    let processId: string | undefined;
    try {
      const started = await callBackend<{ readonly id: string }>(backend, "POST", "/execution/processes", {
        executable: process.execPath,
        arguments: ["-e", "setTimeout(() => {}, 2000)"],
        workingDirectory: root,
      });
      processId = started.body.id;
      const pytestData = {
        statuses: {
          "tests/test_user.py::test_create": "passed",
          "tests/test_user.py::test_delete": "failed",
        },
        counts: { passed: 1, failed: 1, skipped: 0 },
        total: 2,
      };

      const updated = await callBackend<{ readonly data: Record<string, unknown> }>(
        backend,
        "PUT",
        `/execution/processes/${processId}/data`,
        { providerId: "tinyide.pytest", data: pytestData },
      );
      expect(updated.status).toBe(200);
      expect(updated.body.data["tinyide.pytest"]).toEqual(pytestData);

      const restored = await callBackend<{ readonly data: Record<string, unknown> }>(
        backend,
        "GET",
        `/execution/processes/${processId}`,
      );
      expect(restored.body.data["tinyide.pytest"]).toEqual(pytestData);
    } finally {
      if (processId) await callBackend(backend, "DELETE", `/execution/processes/${processId}`).catch(() => undefined);
      await backend.dispose();
      await rm(root, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === "win32")("stops the complete process tree created by a profile", async () => {
    const root = await mkdtemp(join(tmpdir(), "tinyide-execution-tree-"));
    const backend = createExecutionBackend({ workspaceRoot: root });
    let processId: string | undefined;
    let descendantPid: number | undefined;

    try {
      // O descendente confirma pelo stdout que o handler de SIGTERM já está
      // instalado; o pai só expõe o pid depois disso. Sem a confirmação o teste
      // vira corrida: um SIGTERM entregue antes do handler mata o descendente e
      // deixa a escalada para SIGKILL sem exercício.
      const childProgram = [
        "process.on('SIGTERM', () => {});",
        "process.stdout.write('armed');",
        "setInterval(() => {}, 1000);",
      ].join("");
      const parentProgram = [
        "const { spawn } = require('node:child_process');",
        `const child = spawn(process.execPath, ['-e', ${JSON.stringify(childProgram)}], { stdio: ['ignore', 'pipe', 'ignore'] });`,
        "child.stdout.once('data', () => console.log(child.pid));",
        "setInterval(() => {}, 1000);",
      ].join("");
      const started = await callBackend<{ readonly id: string }>(
        backend,
        "POST",
        "/execution/processes",
        {
          executable: process.execPath,
          arguments: ["-e", parentProgram],
          workingDirectory: root,
        },
      );
      processId = started.body.id;

      for (let attempt = 0; attempt < 50; attempt += 1) {
        const snapshot = (await callBackend<{ readonly stdout: string }>(
          backend,
          "GET",
          `/execution/processes/${processId}`,
        )).body;
        descendantPid = Number.parseInt(snapshot.stdout.trim(), 10) || undefined;
        if (descendantPid) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(descendantPid).toBeTypeOf("number");
      expect(processIsAlive(descendantPid!)).toBe(true);

      const stopped = await callBackend(backend, "DELETE", `/execution/processes/${processId}`);
      expect(stopped.status).toBe(202);
      for (let attempt = 0; attempt < 120 && processIsAlive(descendantPid!); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(processIsAlive(descendantPid!)).toBe(false);
    } finally {
      if (processId) {
        await callBackend(backend, "DELETE", `/execution/processes/${processId}`).catch(() => undefined);
      }
      if (descendantPid && processIsAlive(descendantPid)) {
        process.kill(descendantPid, "SIGKILL");
      }
      await rm(root, { recursive: true, force: true });
    }
  }, 10_000);
});

/** Lado do servidor de um canal, como o runtime entrega ao backend: só o que `attachProcessChannel` usa. */
class FakeChannel extends EventEmitter {
  readonly sent: string[] = [];
  closed = false;
  closure: [number, string] | undefined;

  send(data: string): boolean {
    if (this.closed) return false;
    this.sent.push(data);
    return true;
  }

  close(code = 1000, reason = ""): void {
    if (this.closed) return;
    this.closed = true;
    this.closure = [code, reason];
    this.emit("close", code, reason);
  }

  read(cursor: number): void {
    this.emit("message", JSON.stringify({ type: "read", cursor }), false);
  }

  async next(timeoutMs = 10_000): Promise<Record<string, any>> {
    const deadline = Date.now() + timeoutMs;
    while (!this.sent.length) {
      if (Date.now() > deadline) throw new Error("O canal não recebeu nenhuma mensagem.");
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    return JSON.parse(this.sent.shift()!) as Record<string, any>;
  }
}

interface ChannelBackend {
  (request: Readable & { method: string; headers: Record<string, string> }, response: unknown, path: string): Promise<void>;
  openChannel(channel: FakeChannel, relativePath: string): void;
  dispose(): Promise<void>;
}

describe("execution backend process channels", () => {
  it("delivers output as it arrives and the exit as soon as the process ends", async () => {
    const root = await mkdtemp(join(tmpdir(), "tinyide-execution-channel-"));
    const backend = createExecutionBackend({ workspaceRoot: root }) as ChannelBackend;
    try {
      const started = await callBackend<{ id: string }>(backend, "POST", "/execution/processes", {
        executable: process.execPath,
        arguments: ["-e", "process.stdout.write('cedo\\n'); setTimeout(() => { process.stdout.write('tarde\\n'); process.exit(3); }, 1500);"],
      });
      expect(started.status).toBe(201);
      const channel = new FakeChannel();
      backend.openChannel(channel, `/execution/processes/${started.body.id}/stream`);

      channel.read(0);
      const first = await channel.next();
      expect(first.type).toBe("output");
      expect(first.status).toBe("running");
      expect(first.chunks.map((chunk: { text: string }) => chunk.text).join("")).toBe("cedo\n");

      // Sem saída nova, a leitura fica pendente: nada de resposta vazia a cada poll.
      channel.read(first.cursor);
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(channel.sent).toEqual([]);

      let snapshot = await channel.next();
      let text = snapshot.chunks.map((chunk: { text: string }) => chunk.text).join("");
      while (snapshot.status === "running" || snapshot.hasMore) {
        channel.read(snapshot.cursor);
        snapshot = await channel.next();
        text += snapshot.chunks.map((chunk: { text: string }) => chunk.text).join("");
      }
      expect(text).toBe("tarde\n");
      expect(snapshot.status).toBe("exited");
      expect(snapshot.exitCode).toBe(3);
      expect(snapshot.finishedAt).toBeGreaterThan(0);
    } finally {
      await backend.dispose();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("refuses unknown processes, foreign routes and malformed messages, and closes with the workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "tinyide-execution-channel-"));
    const backend = createExecutionBackend({ workspaceRoot: root }) as ChannelBackend;
    const unknownRoute = new FakeChannel();
    try {
      const missing = new FakeChannel();
      backend.openChannel(missing, "/execution/processes/nope/stream");
      expect(missing.closure).toEqual([4404, "Processo não encontrado."]);

      const foreign = new FakeChannel();
      backend.openChannel(foreign, "/execution/other");
      expect(foreign.closure).toEqual([4400, "Rota sem canal."]);

      const started = await callBackend<{ id: string }>(backend, "POST", "/execution/processes", {
        executable: process.execPath,
        arguments: ["-e", "setTimeout(() => {}, 30000);"],
      });
      const route = `/execution/processes/${started.body.id}/stream`;

      const binary = new FakeChannel();
      backend.openChannel(binary, route);
      binary.emit("message", Buffer.from([1, 2]), true);
      expect(binary.closure).toEqual([4400, "Mensagem binária não suportada."]);

      const invalid = new FakeChannel();
      backend.openChannel(invalid, route);
      invalid.emit("message", "{nope", false);
      expect(invalid.closure).toEqual([4400, "Mensagem inválida."]);

      backend.openChannel(unknownRoute, route);
      unknownRoute.emit("message", JSON.stringify({ type: "nope" }), false);
      expect(JSON.parse(unknownRoute.sent[0]!)).toEqual({ type: "error", message: "Mensagem desconhecida: nope" });
      unknownRoute.read(0);
    } finally {
      await backend.dispose();
      await rm(root, { recursive: true, force: true });
    }
    // A troca de workspace encerra o processo e fecha o canal com "going away".
    expect(unknownRoute.closure).toEqual([1001, "Workspace closed."]);
  });

  it("refuses channels while no workspace is open", () => {
    const backend = createExecutionBackend({ workspaceRoot: () => undefined }) as ChannelBackend;
    const channel = new FakeChannel();
    backend.openChannel(channel, "/execution/processes/x/stream");
    expect(channel.closure).toEqual([4409, "Abra um workspace antes de executar esta operação."]);
  });
});
