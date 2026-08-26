import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const MAX_BODY_BYTES = 1024 * 1024;
const DEFAULT_MAX_OUTPUT_CHARS = 512 * 1024;
const DEFAULT_MAX_OUTPUT_READ_CHARS = 64 * 1024;
const DEFAULT_MAX_SNAPSHOT_STREAM_CHARS = 64 * 1024;
const DEFAULT_MAX_SNAPSHOT_OUTPUT_CHARS = 128 * 1024;
const WORKSPACE_SETTINGS_VERSION = 1;
const PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
const workspaceSettingsWrites = new Map();

function writeJson(response, statusCode, value) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) throw new Error("Corpo da requisição excede o limite permitido.");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function requiredString(value, field) {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) throw new Error(`Campo inválido: ${field}`);
  return value;
}

function stringArray(value, field) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.includes("\0"))) {
    throw new Error(`Campo inválido: ${field}`);
  }
  return value;
}

function environmentRecord(value) {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Variáveis de ambiente inválidas.");
  return Object.fromEntries(Object.entries(value).map(([name, item]) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || typeof item !== "string" || item.includes("\0")) {
      throw new Error(`Variável de ambiente inválida: ${name}`);
    }
    return [name, item];
  }));
}

function processPresentation(value) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Apresentação do processo inválida.");
  const kind = requiredString(value.kind, "presentation.kind");
  if (kind !== "profile" && kind !== "script") throw new Error("Tipo de apresentação do processo inválido.");
  const outputPrefix = stringArray(value.outputPrefix ?? [], "presentation.outputPrefix");
  return {
    kind,
    sourceId: requiredString(value.sourceId, "presentation.sourceId"),
    sourceName: requiredString(value.sourceName, "presentation.sourceName"),
    ...(value.runId === undefined ? {} : { runId: requiredString(value.runId, "presentation.runId") }),
    ...(value.stepId === undefined ? {} : { stepId: requiredString(value.stepId, "presentation.stepId") }),
    ...(value.stepName === undefined ? {} : { stepName: requiredString(value.stepName, "presentation.stepName") }),
    outputPrefix,
  };
}

function processDataUpdate(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Dados da execução inválidos.");
  }
  const providerId = requiredString(value.providerId, "providerId");
  const serialized = JSON.stringify(value.data);
  if (serialized === undefined || serialized.length > MAX_BODY_BYTES) {
    throw new Error("Dados da execução excedem o limite permitido.");
  }
  return { providerId, data: JSON.parse(serialized) };
}

function appendOutput(current, chunk, maxChars) {
  const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
  const next = current + text;
  return next.length > maxChars ? next.slice(-maxChars) : next;
}

export function createProcessOutputBuffer(maxChars = DEFAULT_MAX_OUTPUT_CHARS) {
  const segments = [];
  let head = 0;
  let endCursor = 0;
  let retainedChars = 0;

  const compact = () => {
    if (head < 256 || head * 2 < segments.length) return;
    segments.splice(0, head);
    head = 0;
  };

  const trim = () => {
    while (retainedChars > maxChars && head < segments.length) {
      const overflow = retainedChars - maxChars;
      const segment = segments[head];
      if (segment.text.length <= overflow) {
        retainedChars -= segment.text.length;
        head += 1;
        continue;
      }
      segment.text = segment.text.slice(overflow);
      segment.start += overflow;
      retainedChars -= overflow;
    }
    compact();
  };

  const startCursor = () => segments[head]?.start ?? endCursor;

  return {
    append(stream, value) {
      const text = typeof value === "string" ? value : value.toString("utf8");
      if (!text) return;
      const last = segments.at(-1);
      if (last && last.stream === stream && segments.length - 1 >= head) {
        last.text += text;
        last.end += text.length;
      } else {
        segments.push({ stream, text, start: endCursor, end: endCursor + text.length });
      }
      endCursor += text.length;
      retainedChars += text.length;
      trim();
    },
    read(cursor = 0, limit = DEFAULT_MAX_OUTPUT_READ_CHARS) {
      const oldest = startCursor();
      const requested = Number.isFinite(Number(cursor)) ? Math.max(0, Math.trunc(Number(cursor))) : oldest;
      let position = Math.min(Math.max(requested, oldest), endCursor);
      let remaining = Math.max(1, Math.trunc(Number(limit) || DEFAULT_MAX_OUTPUT_READ_CHARS));
      const chunks = [];
      for (let index = head; index < segments.length && remaining > 0; index += 1) {
        const segment = segments[index];
        if (segment.end <= position) continue;
        const offset = Math.max(0, position - segment.start);
        const text = segment.text.slice(offset, offset + remaining);
        if (!text) continue;
        const previous = chunks.at(-1);
        if (previous?.stream === segment.stream) previous.text += text;
        else chunks.push({ stream: segment.stream, text });
        position += text.length;
        remaining -= text.length;
      }
      return {
        startCursor: oldest,
        endCursor,
        cursor: position,
        truncated: requested < oldest,
        hasMore: position < endCursor,
        chunks,
      };
    },
    tail(limit = DEFAULT_MAX_SNAPSHOT_OUTPUT_CHARS) {
      return this.read(Math.max(startCursor(), endCursor - limit), limit);
    },
    status() {
      return {
        startCursor: startCursor(),
        endCursor,
        retainedChars,
        truncated: startCursor() > 0,
      };
    },
  };
}

function processSnapshot(record, snapshotOutputChars = DEFAULT_MAX_SNAPSHOT_OUTPUT_CHARS) {
  const output = record.output.tail(snapshotOutputChars);
  const outputStatus = record.output.status();
  return {
    id: record.id,
    workspaceRoot: record.workspaceRoot,
    status: record.status,
    executable: record.executable,
    arguments: record.arguments,
    workingDirectory: record.workingDirectory,
    presentation: record.presentation,
    stdout: record.stdout,
    stderr: record.stderr,
    output: output.chunks.map((chunk) => chunk.text).join(""),
    outputStartCursor: outputStatus.startCursor,
    outputEndCursor: outputStatus.endCursor,
    outputTruncated: outputStatus.truncated,
    ...(record.data ? { data: record.data } : {}),
    stopRequested: Boolean(record.stopRequested),
    exitCode: record.exitCode,
    signal: record.signal,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    durationMs: (record.finishedAt ?? Date.now()) - record.startedAt,
  };
}

function processOutputSnapshot(record, cursor, maxOutputReadChars) {
  return {
    id: record.id,
    status: record.status,
    stopRequested: Boolean(record.stopRequested),
    exitCode: record.exitCode,
    signal: record.signal,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    durationMs: (record.finishedAt ?? Date.now()) - record.startedAt,
    ...record.output.read(cursor, maxOutputReadChars),
  };
}

function signalProcessTree(record, signal) {
  const pid = record.child.pid;
  if (!Number.isInteger(pid)) return false;
  if (process.platform !== "win32") {
    try {
      process.kill(-pid, signal);
      return true;
    } catch (error) {
      if (error?.code === "ESRCH") return false;
      if (error?.code !== "EPERM") throw error;
    }
  }
  return record.child.kill(signal);
}

function forceStopProcessTree(record) {
  if (process.platform !== "win32") {
    signalProcessTree(record, "SIGKILL");
    return;
  }
  const pid = record.child.pid;
  if (!Number.isInteger(pid)) return;
  const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
    windowsHide: true,
    stdio: "ignore",
  });
  killer.on("error", () => {
    record.child.kill("SIGKILL");
  });
}

function waitForProcessExit(record, timeoutMs) {
  if (record.status !== "running") return Promise.resolve(true);
  return Promise.race([
    new Promise((resolveExit) => record.child.once("close", () => resolveExit(true))),
    new Promise((resolveTimeout) => setTimeout(() => resolveTimeout(false), timeoutMs)),
  ]);
}

async function stopProcessRecord(record, timeoutMs = 1_500) {
  if (record.status !== "running") return;
  record.stopRequested = true;
  if (process.platform === "win32") forceStopProcessTree(record);
  else signalProcessTree(record, "SIGTERM");
  if (await waitForProcessExit(record, timeoutMs)) return;
  forceStopProcessTree(record);
  await waitForProcessExit(record, timeoutMs);
}

export function workspaceSettingsPath(workspaceRoot) {
  return join(workspaceRoot, ".tinyide", "settings.json");
}

function normalizeWorkspaceSettings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Configuração do workspace inválida.");
  const serialized = JSON.stringify(value);
  if (serialized.length > MAX_BODY_BYTES) throw new Error("Configuração do workspace excede o limite permitido.");
  return { ...value, version: WORKSPACE_SETTINGS_VERSION };
}

export async function readWorkspaceSettings(workspaceRoot) {
  try {
    return normalizeWorkspaceSettings(JSON.parse(await readFile(workspaceSettingsPath(workspaceRoot), "utf8")));
  } catch (error) {
    if (error?.code === "ENOENT") return writeWorkspaceSettings(workspaceRoot, { version: WORKSPACE_SETTINGS_VERSION });
    if (error instanceof SyntaxError) throw new Error("O arquivo .tinyide/settings.json contém JSON inválido.");
    throw error;
  }
}

export async function writeWorkspaceSettings(workspaceRoot, value) {
  const settings = normalizeWorkspaceSettings(value);
  const settingsPath = workspaceSettingsPath(workspaceRoot);
  const temporaryPath = `${settingsPath}.${randomUUID()}.tmp`;
  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  await rename(temporaryPath, settingsPath);
  return settings;
}

export async function updateWorkspaceSettings(workspaceRoot, updater) {
  const root = resolve(workspaceRoot);
  const previous = workspaceSettingsWrites.get(root) ?? Promise.resolve();
  const operation = previous.catch(() => undefined).then(async () => {
    const current = await readWorkspaceSettings(root);
    const next = await updater(current);
    return writeWorkspaceSettings(root, next);
  });
  const tail = operation.then(() => undefined, () => undefined);
  workspaceSettingsWrites.set(root, tail);
  try {
    return await operation;
  } finally {
    if (workspaceSettingsWrites.get(root) === tail) workspaceSettingsWrites.delete(root);
  }
}

function normalizedPluginData(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function assertPluginId(pluginId) {
  if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error("Identificador de plugin inválido.");
  return pluginId;
}

export async function readWorkspacePluginData(workspaceRoot, pluginId) {
  const id = assertPluginId(pluginId);
  const settings = await readWorkspaceSettings(workspaceRoot);
  return normalizedPluginData(settings.pluginData?.[id]);
}

export async function replaceWorkspacePluginData(workspaceRoot, pluginId, value) {
  const id = assertPluginId(pluginId);
  const data = normalizedPluginData(value);
  const settings = await updateWorkspaceSettings(workspaceRoot, (current) => ({
    ...current,
    pluginData: {
      ...(current.pluginData ?? {}),
      [id]: data,
    },
  }));
  return normalizedPluginData(settings.pluginData?.[id]);
}

export async function patchWorkspacePluginData(workspaceRoot, pluginId, patch) {
  const id = assertPluginId(pluginId);
  const delta = normalizedPluginData(patch);
  const settings = await updateWorkspaceSettings(workspaceRoot, (current) => ({
    ...current,
    pluginData: {
      ...(current.pluginData ?? {}),
      [id]: {
        ...normalizedPluginData(current.pluginData?.[id]),
        ...delta,
      },
    },
  }));
  return normalizedPluginData(settings.pluginData?.[id]);
}

export function createWorkspacePluginConfiguration(workspaceRoot, pluginId) {
  const root = resolve(workspaceRoot);
  const id = assertPluginId(pluginId);
  return Object.freeze({
    read: () => readWorkspacePluginData(root, id),
    replace: (value) => replaceWorkspacePluginData(root, id, value),
    update: (patch) => patchWorkspacePluginData(root, id, patch),
  });
}

function assertExpectedWorkspace(request, workspaceRoot) {
  const expected = request.headers["x-tinyide-workspace-root"];
  if (typeof expected === "string" && resolve(expected) !== workspaceRoot) {
    throw new Error("O workspace ativo mudou durante a operação de configuração.");
  }
}

export function createExecutionBackend({
  workspaceRoot,
  maxOutputChars = DEFAULT_MAX_OUTPUT_CHARS,
  maxOutputReadChars = DEFAULT_MAX_OUTPUT_READ_CHARS,
  maxSnapshotStreamChars = DEFAULT_MAX_SNAPSHOT_STREAM_CHARS,
  maxSnapshotOutputChars = DEFAULT_MAX_SNAPSHOT_OUTPUT_CHARS,
}) {
  const getWorkspaceRoot = typeof workspaceRoot === "function" ? workspaceRoot : () => workspaceRoot;
  const processes = new Map();
  const resolvedWorkspaceRoot = () => {
    const current = getWorkspaceRoot();
    if (typeof current !== "string" || !current.trim()) {
      throw new Error("Abra um workspace antes de executar esta operação.");
    }
    return resolve(current);
  };

  function startProcess(payload) {
    const workspaceRoot = resolvedWorkspaceRoot();
    const executable = requiredString(payload.executable, "executable");
    const args = stringArray(payload.arguments ?? [], "arguments");
    const workingDirectory = payload.workingDirectory
      ? resolve(workspaceRoot, requiredString(payload.workingDirectory, "workingDirectory"))
      : workspaceRoot;
    const environmentVariables = environmentRecord(payload.environmentVariables);
    const presentation = processPresentation(payload.presentation);
    const id = randomUUID();
    const startedAt = Date.now();
    const child = spawn(executable, args, {
      cwd: workingDirectory,
      env: { ...process.env, ...environmentVariables },
      detached: process.platform !== "win32",
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const record = {
      id, workspaceRoot, child, status: "running", executable, arguments: args, workingDirectory, presentation,
      stdout: "", stderr: "", output: createProcessOutputBuffer(maxOutputChars),
      data: undefined,
      exitCode: undefined, signal: undefined, startedAt, finishedAt: undefined,
    };
    processes.set(id, record);
    const MAX_RETAINED_EXITED_PROCESSES = 25;
    const pruneExitedProcesses = () => {
      const exited = [...processes.values()]
        .filter((item) => item.status === "exited")
        .sort((left, right) => (left.finishedAt ?? 0) - (right.finishedAt ?? 0));
      while (exited.length > MAX_RETAINED_EXITED_PROCESSES) {
        const oldest = exited.shift();
        if (oldest) processes.delete(oldest.id);
      }
    };
    pruneExitedProcesses();

    child.stdout.on("data", (chunk) => {
      record.stdout = appendOutput(record.stdout, chunk, maxSnapshotStreamChars);
      record.output.append("stdout", chunk);
    });
    child.stderr.on("data", (chunk) => {
      record.stderr = appendOutput(record.stderr, chunk, maxSnapshotStreamChars);
      record.output.append("stderr", chunk);
    });
    child.on("error", (error) => {
      const message = `${error.message}\n`;
      record.stderr = appendOutput(record.stderr, message, maxSnapshotStreamChars);
      record.output.append("stderr", message);
      record.status = "exited";
      record.exitCode = -1;
      record.finishedAt = Date.now();
      pruneExitedProcesses();
    });
    child.on("close", (exitCode, signal) => {
      record.status = "exited";
      record.exitCode = exitCode ?? (signal ? 128 : -1);
      record.signal = signal ?? undefined;
      record.finishedAt = Date.now();
      pruneExitedProcesses();
    });
    return processSnapshot(record, maxSnapshotOutputChars);
  }

  const executionBackend = async function executionBackend(request, response, relativePath) {
    try {
      const workspaceRoot = resolvedWorkspaceRoot();
      if (request.method === "GET" && relativePath === "/context") {
        writeJson(response, 200, { workspaceRoot });
        return;
      }
      if (relativePath === "/workspace/settings") {
        assertExpectedWorkspace(request, workspaceRoot);
        if (request.method === "GET") {
          writeJson(response, 200, await readWorkspaceSettings(workspaceRoot));
          return;
        }
        if (request.method === "PUT") {
          const payload = await readJson(request);
          writeJson(response, 200, await updateWorkspaceSettings(workspaceRoot, (current) => ({
            ...payload,
            ...(current.pluginData === undefined ? {} : { pluginData: current.pluginData }),
          })));
          return;
        }
        writeJson(response, 405, { error: "Método não permitido para configuração do workspace." });
        return;
      }
      if (relativePath.startsWith("/workspace/plugin-data/")) {
        const pluginId = decodeURIComponent(relativePath.slice("/workspace/plugin-data/".length));
        assertPluginId(pluginId);
        if (request.method === "GET") {
          writeJson(response, 200, await readWorkspacePluginData(workspaceRoot, pluginId));
          return;
        }
        if (request.method === "PUT") {
          writeJson(response, 200, await replaceWorkspacePluginData(workspaceRoot, pluginId, await readJson(request)));
          return;
        }
        if (request.method === "PATCH") {
          writeJson(response, 200, await patchWorkspacePluginData(workspaceRoot, pluginId, await readJson(request)));
          return;
        }
        writeJson(response, 405, { error: "Método não permitido para dados de plugin do workspace." });
        return;
      }
      if (request.method === "POST" && relativePath === "/execution/processes") {
        writeJson(response, 201, startProcess(await readJson(request)));
        return;
      }
      if (request.method === "GET" && relativePath === "/execution/processes") {
        writeJson(response, 200, [...processes.values()]
          .filter((record) => record.workspaceRoot === workspaceRoot)
          .sort((left, right) => right.startedAt - left.startedAt)
          .map((record) => processSnapshot(record, maxSnapshotOutputChars)));
        return;
      }
      const outputMatch = /^\/execution\/processes\/([^/]+)\/output$/.exec(relativePath);
      if (outputMatch) {
        const record = processes.get(decodeURIComponent(outputMatch[1]));
        if (!record || record.workspaceRoot !== workspaceRoot) {
          writeJson(response, 404, { error: "Processo não encontrado." });
          return;
        }
        if (request.method !== "GET") {
          writeJson(response, 405, { error: "Método não permitido para saída do processo." });
          return;
        }
        const requestUrl = new URL(request.url ?? relativePath, "http://localhost");
        writeJson(
          response,
          200,
          processOutputSnapshot(record, requestUrl.searchParams.get("cursor"), maxOutputReadChars),
        );
        return;
      }
      const dataMatch = /^\/execution\/processes\/([^/]+)\/data$/.exec(relativePath);
      if (dataMatch) {
        const record = processes.get(decodeURIComponent(dataMatch[1]));
        if (!record || record.workspaceRoot !== workspaceRoot) {
          writeJson(response, 404, { error: "Processo não encontrado." });
          return;
        }
        if (request.method !== "PUT") {
          writeJson(response, 405, { error: "Método não permitido para dados da execução." });
          return;
        }
        const update = processDataUpdate(await readJson(request));
        record.data = { ...(record.data ?? {}), [update.providerId]: update.data };
        writeJson(response, 200, processSnapshot(record, maxSnapshotOutputChars));
        return;
      }
      const match = /^\/execution\/processes\/([^/]+)$/.exec(relativePath);
      if (match) {
        const record = processes.get(decodeURIComponent(match[1]));
        if (!record || record.workspaceRoot !== workspaceRoot) {
          writeJson(response, 404, { error: "Processo não encontrado." });
          return;
        }
        if (request.method === "GET") {
          writeJson(response, 200, processSnapshot(record, maxSnapshotOutputChars));
          return;
        }
        if (request.method === "DELETE") {
          if (record.status === "running" && !record.stopRequested) void stopProcessRecord(record).catch((error) => {
            const message = `Falha ao encerrar a árvore de processos: ${error instanceof Error ? error.message : String(error)}\n`;
            record.stderr = appendOutput(record.stderr, message, maxSnapshotStreamChars);
            record.output.append("stderr", message);
          });
          writeJson(response, 202, processSnapshot(record, maxSnapshotOutputChars));
          return;
        }
      }
      writeJson(response, 404, { error: "Endpoint do core não encontrado." });
    } catch (error) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  };
  executionBackend.dispose = async () => {
    const running = [...processes.values()].filter((record) => record.status === "running");
    await Promise.allSettled(running.map((record) => stopProcessRecord(record)));
    processes.clear();
  };
  return executionBackend;
}
