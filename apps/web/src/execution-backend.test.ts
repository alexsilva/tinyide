/// <reference types="node" />

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

  it.skipIf(process.platform === "win32")("stops the complete process tree created by a profile", async () => {
    const root = await mkdtemp(join(tmpdir(), "tinyide-execution-tree-"));
    const backend = createExecutionBackend({ workspaceRoot: root });
    let processId: string | undefined;
    let descendantPid: number | undefined;

    try {
      const childProgram = [
        "process.on('SIGTERM', () => {});",
        "setInterval(() => {}, 1000);",
      ].join("");
      const parentProgram = [
        "const { spawn } = require('node:child_process');",
        `const child = spawn(process.execPath, ['-e', ${JSON.stringify(childProgram)}], { stdio: 'ignore' });`,
        "console.log(child.pid);",
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
