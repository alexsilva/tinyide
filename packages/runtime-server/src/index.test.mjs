import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startTinyIdeRuntime } from "./index.mjs";

const resources = [];

afterEach(async () => {
  await Promise.all(resources.splice(0).map(async ({ runtime, root }) => {
    await runtime?.close();
    await rm(root, { recursive: true, force: true });
  }));
});

async function fixture(options = {}) {
  const root = await mkdtemp(join(tmpdir(), "tinyide-runtime-"));
  const webRoot = join(root, "web");
  const pluginsRoot = join(root, "plugins");
  const workspaceRoot = join(root, "workspace");
  await Promise.all([mkdir(webRoot), mkdir(pluginsRoot), mkdir(workspaceRoot)]);
  await writeFile(join(webRoot, "index.html"), "<!doctype html><title>tinyIde</title>");
  await writeFile(join(webRoot, "app-AbCdEf12.js"), "export {};");
  const runtime = await startTinyIdeRuntime({
    hostRoot: root,
    webRoot,
    pluginsRoot,
    workspaceSearchRoot: root,
    initialWorkspaceRoot: workspaceRoot,
    host: "127.0.0.1",
    port: 0,
    ...options,
  });
  resources.push({ runtime, root });
  return { root, webRoot, pluginsRoot, workspaceRoot, runtime };
}

describe("runtime server hardening", () => {
  it("terminates active execution process trees when the runtime closes", async () => {
    const { runtime, root, workspaceRoot } = await fixture();
    const pidPath = join(root, "child.pid");
    const started = await fetch(`${runtime.url}/core-api/execution/processes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        executable: process.execPath,
        arguments: ["-e", `require('fs').writeFileSync(${JSON.stringify(pidPath)}, String(process.pid)); setInterval(() => {}, 1000)`],
        workingDirectory: workspaceRoot,
      }),
    });
    expect(started.status).toBe(201);
    let childPid;
    for (let attempt = 0; attempt < 50 && !childPid; attempt += 1) {
      try { childPid = Number(await readFile(pidPath, "utf8")); } catch {}
      if (!childPid) await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(childPid).toBeGreaterThan(0);

    await runtime.close();
    const resource = resources.find((item) => item.runtime === runtime);
    if (resource) resource.runtime = undefined;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(() => process.kill(childPid, 0)).toThrow(expect.objectContaining({ code: "ESRCH" }));
  });

  it("sets browser security headers and caches hashed assets immutably", async () => {
    const { runtime } = await fixture();
    const html = await fetch(runtime.url);
    expect(html.status).toBe(200);
    expect(html.headers.get("x-content-type-options")).toBe("nosniff");
    expect(html.headers.get("x-frame-options")).toBe("DENY");
    expect(html.headers.get("content-security-policy")).toContain("object-src 'none'");
    expect(html.headers.get("content-security-policy")).not.toContain("cdn.jsdelivr.net");
    expect(html.headers.get("content-security-policy")).not.toContain("wasm-unsafe-eval");
    expect(html.headers.get("cache-control")).toBe("no-cache");

    const asset = await fetch(`${runtime.url}/app-AbCdEf12.js`);
    expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  it("extends the browser policy only for plugin-declared CDN and WebAssembly permissions", async () => {
    const { runtime, pluginsRoot } = await fixture();
    const pluginRoot = join(pluginsRoot, "python");
    await mkdir(pluginRoot);
    await writeFile(join(pluginRoot, "plugin.json"), JSON.stringify({
      id: "tinyide.python",
      name: "Python",
      version: "1.0.0",
      permissions: ["runtime.wasm", "network.cdn"],
    }));
    runtime.clearManifestCache();

    const response = await fetch(runtime.url);
    const policy = response.headers.get("content-security-policy");
    expect(policy).toContain("script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net");
    expect(policy).toContain("connect-src 'self' ws: https://cdn.jsdelivr.net");
  });

  it("allows explicitly hashed development preambles without enabling arbitrary inline scripts", async () => {
    const hash = "'sha256-Z2/iFzh9VMlVkEOar1f/oSHWwQk3ve1qk/C2WdsC4Xk='";
    const { runtime } = await fixture({ inlineScriptHashes: [hash, "'unsafe-inline'", "invalid"] });
    const response = await fetch(runtime.url);
    const policy = response.headers.get("content-security-policy");
    const scriptDirective = policy?.split(";").find((directive) => directive.trim().startsWith("script-src")) ?? "";
    expect(policy).toContain(`script-src 'self' ${hash}`);
    expect(scriptDirective).not.toContain("'unsafe-inline'");
    expect(scriptDirective).not.toContain("invalid");
  });

  it("limits JSON request bodies before parsing them", async () => {
    const { runtime } = await fixture();
    const response = await fetch(`${runtime.url}/core-api/workspace`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "workspace", padding: "x".repeat(1024 * 1024) }),
    });
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("limite") });
  });

  it("rejects cross-origin API calls while accepting the runtime origin", async () => {
    const { runtime, workspaceRoot } = await fixture();
    const blocked = await fetch(`${runtime.url}/core-api/workspace`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://attacker.example",
      },
      body: JSON.stringify({ name: "workspace", path: workspaceRoot }),
    });
    expect(blocked.status).toBe(403);
    await expect(blocked.json()).resolves.toEqual({ error: "Origem da requisição não autorizada." });

    const accepted = await fetch(`${runtime.url}/core-api/workspace`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: runtime.url,
      },
      body: JSON.stringify({ name: "workspace", path: workspaceRoot }),
    });
    expect(accepted.status).toBe(200);
  });

  it("rejects malformed or unsafe plugin identifiers without invoking a backend", async () => {
    const { runtime } = await fixture();
    const invalid = await fetch(`${runtime.url}/plugin-api/%2Fetc/status`);
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({ error: "Identificador de plugin inválido." });
  });

  it("caches plugin directory discovery and supports explicit invalidation", async () => {
    const { runtime, pluginsRoot } = await fixture();
    const initial = await fetch(`${runtime.url}/dev-plugins/index.json`).then((response) => response.json());
    expect(initial.plugins).toEqual([]);

    const pluginRoot = join(pluginsRoot, "sample");
    await mkdir(pluginRoot);
    await writeFile(join(pluginRoot, "plugin.json"), JSON.stringify({ id: "sample", name: "Sample", version: "1.0.0" }));

    const cached = await fetch(`${runtime.url}/dev-plugins/index.json`).then((response) => response.json());
    expect(cached.plugins).toEqual([]);
    runtime.clearManifestCache();
    const refreshed = await fetch(`${runtime.url}/dev-plugins/index.json`).then((response) => response.json());
    expect(refreshed.plugins).toHaveLength(1);
  });

  it("reuses parsed plugin manifests until the cache is invalidated", async () => {
    const { runtime, pluginsRoot } = await fixture();
    const pluginRoot = join(pluginsRoot, "cached");
    await mkdir(pluginRoot);
    await writeFile(join(pluginRoot, "plugin.json"), JSON.stringify({
      id: "cached",
      name: "Cached",
      version: "1.0.0",
    }));
    runtime.clearManifestCache();

    const first = await fetch(`${runtime.url}/dev-plugins/index.json`).then((response) => response.json());
    expect(first.plugins).toHaveLength(1);
    await writeFile(join(pluginRoot, "plugin.json"), "{invalid json");

    const cached = await fetch(`${runtime.url}/dev-plugins/index.json`).then((response) => response.json());
    expect(cached.plugins).toHaveLength(1);
    runtime.clearManifestCache();
    const refreshed = await fetch(`${runtime.url}/dev-plugins/index.json`).then((response) => response.json());
    expect(refreshed.plugins).toEqual([]);
  });

  it("ignores invalid manifests in the catalog", async () => {
    const { runtime, pluginsRoot } = await fixture();
    const pluginRoot = join(pluginsRoot, "invalid");
    await mkdir(pluginRoot);
    await writeFile(join(pluginRoot, "plugin.json"), "{invalid json");
    runtime.clearManifestCache();

    const catalog = await fetch(`${runtime.url}/dev-plugins/index.json`).then((response) => response.json());
    expect(catalog.plugins).toEqual([]);
  });

  it("selects and clears a workspace through the public API", async () => {
    const { runtime, workspaceRoot } = await fixture();
    const selected = await fetch(`${runtime.url}/core-api/workspace`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "workspace", path: workspaceRoot }),
    });
    expect(selected.status).toBe(200);
    await expect(selected.json()).resolves.toEqual({ workspaceRoot });
    expect(runtime.workspaceRoot).toBe(workspaceRoot);

    const cleared = await fetch(`${runtime.url}/core-api/workspace`, { method: "DELETE" });
    expect(cleared.status).toBe(204);
    expect(runtime.workspaceRoot).toBeUndefined();
    const pluginRequest = await fetch(`${runtime.url}/plugin-api/sample/status`);
    expect(pluginRequest.status).toBe(409);
  });

  it("serves workspace resources through a reconstructible host-backed API", async () => {
    const { runtime, workspaceRoot } = await fixture();
    await mkdir(join(workspaceRoot, "src"));
    await writeFile(join(workspaceRoot, "src", "main.txt"), "before");

    const list = await fetch(`${runtime.url}/core-api/workspace/resources?path=src`);
    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toEqual([
      { name: "main.txt", kind: "file" },
    ]);

    const read = await fetch(`${runtime.url}/core-api/workspace/resource?path=src%2Fmain.txt`);
    expect(read.status).toBe(200);
    await expect(read.text()).resolves.toBe("before");

    const write = await fetch(`${runtime.url}/core-api/workspace/resource?path=src%2Fmain.txt`, {
      method: "PUT",
      headers: { "content-type": "application/octet-stream" },
      body: "after",
    });
    expect(write.status).toBe(200);
    await expect(readFile(join(workspaceRoot, "src", "main.txt"), "utf8")).resolves.toBe("after");

    const create = await fetch(`${runtime.url}/core-api/workspace/resources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "src/new.txt", kind: "file", create: true }),
    });
    expect(create.status).toBe(200);

    const remove = await fetch(`${runtime.url}/core-api/workspace/resource?path=src%2Fnew.txt`, {
      method: "DELETE",
    });
    expect(remove.status).toBe(200);
    await expect(readFile(join(workspaceRoot, "src", "new.txt"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("isolates workspace selection between browser sessions", async () => {
    const { runtime, root, workspaceRoot } = await fixture();
    const secondWorkspace = join(root, "second-workspace");
    await mkdir(secondWorkspace);
    const select = (sessionId, name, path) => fetch(`${runtime.url}/core-api/workspace`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tinyide-session-id": sessionId,
      },
      body: JSON.stringify({ name, path }),
    });
    expect((await select("session-a", basename(workspaceRoot), workspaceRoot)).status).toBe(200);
    expect((await select("session-b", basename(secondWorkspace), secondWorkspace)).status).toBe(200);

    const context = async (sessionId) => fetch(`${runtime.url}/core-api/context`, {
      headers: { "x-tinyide-session-id": sessionId },
    }).then((response) => response.json());
    await expect(context("session-a")).resolves.toEqual({ workspaceRoot });
    await expect(context("session-b")).resolves.toEqual({ workspaceRoot: secondWorkspace });
  });

  it("opens only workspace directories in the system file manager", async () => {
    const openedDirectories = [];
    const { runtime, workspaceRoot } = await fixture({
      openInFileManager: async (directory) => { openedDirectories.push(directory); },
    });
    await mkdir(join(workspaceRoot, "src"));
    await writeFile(join(workspaceRoot, "src", "main.ts"), "export {};\n");

    const file = await fetch(`${runtime.url}/core-api/workspace/open-in-file-manager`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "src/main.ts" }),
    });
    expect(file.status).toBe(200);
    expect(openedDirectories).toEqual([join(workspaceRoot, "src")]);

    const root = await fetch(`${runtime.url}/core-api/workspace/open-in-file-manager`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "" }),
    });
    expect(root.status).toBe(200);
    expect(openedDirectories).toEqual([join(workspaceRoot, "src"), workspaceRoot]);

    const outside = await fetch(`${runtime.url}/core-api/workspace/open-in-file-manager`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "../outside" }),
    });
    expect(outside.status).toBe(400);
    expect(openedDirectories).toHaveLength(2);
  });

  it("rejects invalid workspace selections", async () => {
    const { runtime, root } = await fixture();
    const invalidName = await fetch(`${runtime.url}/core-api/workspace`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "../workspace" }),
    });
    expect(invalidName.status).toBe(400);

    const unavailable = await fetch(`${runtime.url}/core-api/workspace`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "missing", path: join(root, "missing") }),
    });
    expect(unavailable.status).toBe(400);
  });

  it("loads a plugin backend and reuses it while unchanged", async () => {
    const { runtime, pluginsRoot } = await fixture();
    const pluginRoot = join(pluginsRoot, "sample");
    await mkdir(pluginRoot);
    await writeFile(join(pluginRoot, "plugin.json"), JSON.stringify({
      id: "sample",
      name: "Sample",
      version: "1.0.0",
      entrypoints: { backend: "backend.mjs" },
    }));
    await writeFile(join(pluginRoot, "backend.mjs"), `
      let requests = 0;
      export function createBackend({ workspaceRoot }) {
        return (_request, response, path) => {
          requests += 1;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ path, requests, workspaceRoot }));
        };
      }
    `);
    runtime.clearManifestCache();

    const first = await fetch(`${runtime.url}/plugin-api/sample/ping`).then((response) => response.json());
    const second = await fetch(`${runtime.url}/plugin-api/sample/ping`).then((response) => response.json());
    expect(first).toMatchObject({ path: "/ping", requests: 1 });
    expect(second).toMatchObject({ path: "/ping", requests: 2 });
  });

  it("passes the workspace-switch reason to backend dispose only when the workspace changes", async () => {
    const { runtime, root, pluginsRoot, workspaceRoot } = await fixture();
    const secondWorkspace = join(root, "second-workspace");
    await mkdir(secondWorkspace);
    const reasonsPath = join(root, "dispose-reasons.json");
    await writeFile(reasonsPath, "[]");
    const pluginRoot = join(pluginsRoot, "observer");
    await mkdir(pluginRoot);
    await writeFile(join(pluginRoot, "plugin.json"), JSON.stringify({
      id: "observer",
      name: "Observer",
      version: "1.0.0",
      entrypoints: { backend: "backend.mjs" },
    }));
    await writeFile(join(pluginRoot, "backend.mjs"), `
      import { readFileSync, writeFileSync } from "node:fs";
      export function createBackend() {
        const handler = (_request, response) => response.end("ok");
        handler.dispose = async (options) => {
          const reasons = JSON.parse(readFileSync(${JSON.stringify(reasonsPath)}, "utf8"));
          reasons.push(options?.reason ?? null);
          writeFileSync(${JSON.stringify(reasonsPath)}, JSON.stringify(reasons));
        };
        return handler;
      }
    `);
    runtime.clearManifestCache();

    const select = (name, path) => fetch(`${runtime.url}/core-api/workspace`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, path }),
    });
    expect((await fetch(`${runtime.url}/plugin-api/observer/status`)).status).toBe(200);
    await runtime.clearBackendCache();
    expect((await fetch(`${runtime.url}/plugin-api/observer/status`)).status).toBe(200);
    expect((await select(basename(secondWorkspace), secondWorkspace)).status).toBe(200);
    expect((await fetch(`${runtime.url}/plugin-api/observer/status`)).status).toBe(200);
    expect((await select(basename(workspaceRoot), workspaceRoot)).status).toBe(200);

    // Recarga rotineira (cache limpo) preserva recursos: sem motivo. Troca de
    // workspace encerra-os: motivo "workspace-switch".
    await expect(readFile(reasonsPath, "utf8").then(JSON.parse)).resolves.toEqual([
      null,
      "workspace-switch",
      "workspace-switch",
    ]);
  });

  it("preserves plugin processes when reload restores the same workspace", async () => {
    const { runtime, root, pluginsRoot, workspaceRoot } = await fixture();
    const pluginRoot = join(pluginsRoot, "persistent");
    const pidPath = join(root, "plugin-child.pid");
    await mkdir(pluginRoot);
    await writeFile(join(pluginRoot, "plugin.json"), JSON.stringify({
      id: "persistent",
      name: "Persistent",
      version: "1.0.0",
      entrypoints: { backend: "backend.mjs" },
    }));
    await writeFile(join(pluginRoot, "backend.mjs"), `
      import { spawn } from "node:child_process";
      import { writeFileSync } from "node:fs";
      export function createBackend() {
        const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
          detached: false,
          stdio: "ignore",
        });
        writeFileSync(${JSON.stringify(pidPath)}, String(child.pid));
        const handler = (_request, response) => response.end("ok");
        handler.dispose = async () => {
          if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
          await new Promise((resolve) => child.once("close", resolve));
        };
        return handler;
      }
    `);
    runtime.clearManifestCache();

    const activated = await fetch(`${runtime.url}/plugin-api/persistent/status`);
    expect(activated.status).toBe(200);
    const childPid = Number(await readFile(pidPath, "utf8"));
    expect(childPid).toBeGreaterThan(0);

    const restored = await fetch(`${runtime.url}/core-api/workspace`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "workspace", path: workspaceRoot }),
    });
    expect(restored.status).toBe(200);
    expect(() => process.kill(childPid, 0)).not.toThrow();

    await runtime.close();
    const resource = resources.find((item) => item.runtime === runtime);
    if (resource) resource.runtime = undefined;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(() => process.kill(childPid, 0)).toThrow(expect.objectContaining({ code: "ESRCH" }));
  });

  it("blocks plugin backends that escape their plugin directory", async () => {
    const { runtime, root, pluginsRoot } = await fixture();
    await writeFile(join(root, "outside-backend.mjs"), "export function createBackend() {}");
    const pluginRoot = join(pluginsRoot, "unsafe");
    await mkdir(pluginRoot);
    await writeFile(join(pluginRoot, "plugin.json"), JSON.stringify({
      id: "unsafe",
      name: "Unsafe",
      version: "1.0.0",
      entrypoints: { backend: "../../outside-backend.mjs" },
    }));
    runtime.clearManifestCache();

    const response = await fetch(`${runtime.url}/plugin-api/unsafe/ping`);
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("backend inválido") });
  });

  it("serves the SPA fallback and rejects malformed plugin asset paths", async () => {
    const { runtime } = await fixture();
    const fallback = await fetch(`${runtime.url}/deep/link`);
    expect(fallback.status).toBe(200);
    expect(await fallback.text()).toContain("tinyIde");

    const malformed = await fetch(`${runtime.url}/dev-plugins/%E0%A4%A`);
    expect(malformed.status).toBe(400);
  });

  it("allows direct workspace updates for embedded hosts", async () => {
    const { runtime, workspaceRoot } = await fixture();
    expect(runtime.setWorkspaceRoot(undefined)).toBeUndefined();
    expect(runtime.setWorkspaceRoot(workspaceRoot)).toBe(workspaceRoot);
    expect(() => runtime.clearBackendCache()).not.toThrow();
  });

  it("configures conservative HTTP server limits", async () => {
    const { runtime } = await fixture();
    expect(runtime.server.maxHeadersCount).toBe(100);
    expect(runtime.server.headersTimeout).toBe(80_000);
    expect(runtime.server.requestTimeout).toBe(120_000);
    expect(runtime.server.keepAliveTimeout).toBe(75_000);
  });

  it("mantém keep-alive acima do pool do cliente para evitar reset de socket reusado", async () => {
    const { runtime } = await fixture();
    // O Chromium mantém sockets ociosos no pool por minutos; um keepAliveTimeout menor
    // faz o servidor fechar a conexão que o navegador está prestes a reusar.
    expect(runtime.server.keepAliveTimeout).toBeGreaterThanOrEqual(60_000);
    expect(runtime.server.headersTimeout).toBeGreaterThan(runtime.server.keepAliveTimeout);
    expect(runtime.server.requestTimeout).toBeGreaterThan(runtime.server.headersTimeout);
  });
});
