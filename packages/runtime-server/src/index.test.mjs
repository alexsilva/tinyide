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
  const userDataRoot = options.userDataRoot ?? join(root, "user-data");
  await Promise.all([mkdir(webRoot), mkdir(pluginsRoot), mkdir(workspaceRoot), mkdir(userDataRoot, { recursive: true })]);
  await writeFile(join(webRoot, "index.html"), "<!doctype html><title>tinyIde</title>");
  await writeFile(join(webRoot, "app-AbCdEf12.js"), "export {};");
  const runtime = await startTinyIdeRuntime({
    hostRoot: root,
    webRoot,
    pluginsRoot,
    workspaceSearchRoot: root,
    userDataRoot,
    initialWorkspaceRoot: workspaceRoot,
    host: "127.0.0.1",
    port: 0,
    ...options,
  });
  resources.push({ runtime, root });
  // Toda chamada que toca o projeto viaja com o escopo no caminho. O helper
  // deixa isso explícito nos testes: não existe rota de workspace "sem dono".
  const scoped = (path, workspace = workspaceRoot) => (
    `${runtime.url}/w/${runtime.workspaceScopeId(workspace)}${path}`
  );
  return { root, webRoot, pluginsRoot, workspaceRoot, userDataRoot, runtime, scoped };
}

describe("runtime server hardening", () => {
  it("terminates active execution process trees when the runtime closes", async () => {
    const { runtime, root, workspaceRoot, scoped } = await fixture();
    const pidPath = join(root, "child.pid");
    const started = await fetch(scoped("/core-api/execution/processes"), {
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
    const { runtime, scoped } = await fixture();
    const invalid = await fetch(scoped("/plugin-api/%2Fetc/status"));
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({ error: "Identificador de plugin inválido." });

    // Sem escopo o backend do plugin sequer é alcançável.
    expect((await fetch(`${runtime.url}/plugin-api/sample/status`)).status).toBe(409);
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
    const { runtime, workspaceRoot, scoped } = await fixture();
    const selected = await fetch(`${runtime.url}/core-api/workspace`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "workspace", path: workspaceRoot }),
    });
    expect(selected.status).toBe(200);
    await expect(selected.json()).resolves.toEqual({
      workspaceRoot,
      scopeId: runtime.workspaceScopeId(workspaceRoot),
      name: basename(workspaceRoot),
    });
    expect(runtime.workspaceRoot).toBe(workspaceRoot);

    const cleared = await fetch(scoped("/core-api/workspace"), { method: "DELETE" });
    expect(cleared.status).toBe(204);
    expect(runtime.workspaceRoot).toBeUndefined();
    const pluginRequest = await fetch(scoped("/plugin-api/sample/status"));
    expect(pluginRequest.status).toBe(409);
  });

  it("recusa fechar workspace e ler estado de projeto sem escopo na URL", async () => {
    const { runtime } = await fixture();
    const semEscopo = await fetch(`${runtime.url}/core-api/workspace`, { method: "DELETE" });
    expect(semEscopo.status).toBe(400);

    // Chave de projeto fora de escopo é erro, não gravação no arquivo global.
    const estado = await fetch(`${runtime.url}/core-api/user/state/ui-session`);
    expect(estado.status).toBe(400);
    await expect(estado.json()).resolves.toMatchObject({ error: expect.stringContaining("exige escopo") });

    // Chaves do usuário continuam acessíveis sem projeto aberto.
    expect((await fetch(`${runtime.url}/core-api/user/state/recent-projects`)).status).toBe(204);
  });

  it("serves workspace resources through a reconstructible host-backed API", async () => {
    const { workspaceRoot, scoped } = await fixture();
    await mkdir(join(workspaceRoot, "src"));
    await writeFile(join(workspaceRoot, "src", "main.txt"), "before");

    const list = await fetch(scoped("/core-api/workspace/resources?path=src"));
    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toEqual([
      { name: "main.txt", kind: "file" },
    ]);

    const read = await fetch(scoped("/core-api/workspace/resource?path=src%2Fmain.txt"));
    expect(read.status).toBe(200);
    await expect(read.text()).resolves.toBe("before");

    const write = await fetch(scoped("/core-api/workspace/resource?path=src%2Fmain.txt"), {
      method: "PUT",
      headers: { "content-type": "application/octet-stream" },
      body: "after",
    });
    expect(write.status).toBe(200);
    await expect(readFile(join(workspaceRoot, "src", "main.txt"), "utf8")).resolves.toBe("after");

    const create = await fetch(scoped("/core-api/workspace/resources"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "src/new.txt", kind: "file", create: true }),
    });
    expect(create.status).toBe(200);

    const remove = await fetch(scoped("/core-api/workspace/resource?path=src%2Fnew.txt"), {
      method: "DELETE",
    });
    expect(remove.status).toBe(200);
    await expect(readFile(join(workspaceRoot, "src", "new.txt"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("isola o estado de cada workspace pelo caminho da requisição", async () => {
    const { runtime, root, workspaceRoot } = await fixture();
    const secondWorkspace = join(root, "second-workspace");
    await mkdir(secondWorkspace);
    const select = (name, path) => fetch(`${runtime.url}/core-api/workspace`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, path }),
    });
    expect((await select(basename(workspaceRoot), workspaceRoot)).status).toBe(200);
    expect((await select(basename(secondWorkspace), secondWorkspace)).status).toBe(200);

    const context = async (workspace) => fetch(
      `${runtime.url}/w/${runtime.workspaceScopeId(workspace)}/core-api/context`,
    ).then((response) => response.json());
    await expect(context(workspaceRoot)).resolves.toEqual({ workspaceRoot });
    await expect(context(secondWorkspace)).resolves.toEqual({ workspaceRoot: secondWorkspace });

    // Dois projetos, dois diretórios de estado — e um não enxerga o do outro.
    const write = (workspace, value) => fetch(
      `${runtime.url}/w/${runtime.workspaceScopeId(workspace)}/core-api/user/state/ui-session`,
      { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ value }) },
    );
    await write(workspaceRoot, "alpha");
    await write(secondWorkspace, "beta");
    const read = (workspace) => fetch(
      `${runtime.url}/w/${runtime.workspaceScopeId(workspace)}/core-api/user/state/ui-session`,
    ).then((response) => response.json());
    await expect(read(workspaceRoot)).resolves.toEqual({ value: "alpha" });
    await expect(read(secondWorkspace)).resolves.toEqual({ value: "beta" });
  });

  it("resolve o escopo da URL de volta para o projeto e recusa ids inválidos", async () => {
    const { runtime, workspaceRoot } = await fixture();
    await fetch(`${runtime.url}/core-api/workspace`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: basename(workspaceRoot), path: workspaceRoot }),
    });
    const scopeId = runtime.workspaceScopeId(workspaceRoot);

    const descriptor = await fetch(`${runtime.url}/core-api/workspace/scopes/${scopeId}`);
    expect(descriptor.status).toBe(200);
    await expect(descriptor.json()).resolves.toMatchObject({ path: workspaceRoot, scopeId });

    const desconhecido = await fetch(`${runtime.url}/core-api/workspace/scopes/nao-registrado-0000`);
    expect(desconhecido.status).toBe(404);

    const invalido = await fetch(`${runtime.url}/w/..%2F..%2Fetc/core-api/context`);
    expect(invalido.status).toBe(400);
  });

  it("opens only workspace directories in the system file manager", async () => {
    const openedDirectories = [];
    const { workspaceRoot, scoped } = await fixture({
      openInFileManager: async (directory) => { openedDirectories.push(directory); },
    });
    await mkdir(join(workspaceRoot, "src"));
    await writeFile(join(workspaceRoot, "src", "main.ts"), "export {};\n");

    const file = await fetch(scoped("/core-api/workspace/open-in-file-manager"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "src/main.ts" }),
    });
    expect(file.status).toBe(200);
    expect(openedDirectories).toEqual([join(workspaceRoot, "src")]);

    const root = await fetch(scoped("/core-api/workspace/open-in-file-manager"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "" }),
    });
    expect(root.status).toBe(200);
    expect(openedDirectories).toEqual([join(workspaceRoot, "src"), workspaceRoot]);

    const outside = await fetch(scoped("/core-api/workspace/open-in-file-manager"), {
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
    const { runtime, pluginsRoot, scoped } = await fixture();
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

    const first = await fetch(scoped("/plugin-api/sample/ping")).then((response) => response.json());
    const second = await fetch(scoped("/plugin-api/sample/ping")).then((response) => response.json());
    expect(first).toMatchObject({ path: "/ping", requests: 1 });
    expect(second).toMatchObject({ path: "/ping", requests: 2 });
  });

  it("restarts only the changed plugin backend in an isolated worker", async () => {
    const { runtime, pluginsRoot, scoped } = await fixture();
    const pluginRoot = join(pluginsRoot, "reloadable");
    await mkdir(pluginRoot);
    await writeFile(join(pluginRoot, "plugin.json"), JSON.stringify({
      id: "reloadable",
      name: "Reloadable",
      version: "1.0.0",
      entrypoints: { backend: "backend.mjs" },
    }));
    const backendPath = join(pluginRoot, "backend.mjs");
    await writeFile(backendPath, `
      let requests = 0;
      export function createBackend() {
        return (_request, response) => {
          requests += 1;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ version: 1, requests }));
        };
      }
    `);
    runtime.clearManifestCache();

    await expect(fetch(scoped("/plugin-api/reloadable/ping")).then((response) => response.json()))
      .resolves.toEqual({ version: 1, requests: 1 });
    await expect(fetch(scoped("/plugin-api/reloadable/ping")).then((response) => response.json()))
      .resolves.toEqual({ version: 1, requests: 2 });

    await new Promise((resolve) => setTimeout(resolve, 20));
    await writeFile(backendPath, `
      let requests = 0;
      export function createBackend() {
        return (_request, response) => {
          requests += 1;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ version: 2, requests }));
        };
      }
    `);

    await expect(fetch(scoped("/plugin-api/reloadable/ping")).then((response) => response.json()))
      .resolves.toEqual({ version: 2, requests: 1 });
  });

  it("passes the workspace-switch reason to backend dispose only when the workspace changes", async () => {
    const { runtime, root, pluginsRoot, workspaceRoot, scoped } = await fixture();
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
    expect((await fetch(scoped("/plugin-api/observer/status"))).status).toBe(200);
    await runtime.clearBackendCache();
    expect((await fetch(scoped("/plugin-api/observer/status"))).status).toBe(200);
    // Selecionar o segundo projeto não toca no backend do primeiro: cada
    // escopo tem o próprio. O descarte vem de fechar o escopo, não de abrir
    // outro — que é justamente o isolamento que faltava.
    expect((await select(basename(secondWorkspace), secondWorkspace)).status).toBe(200);
    expect((await fetch(scoped("/plugin-api/observer/status"))).status).toBe(200);
    expect((await fetch(scoped("/core-api/workspace"), { method: "DELETE" })).status).toBe(204);

    await expect(readFile(reasonsPath, "utf8").then(JSON.parse)).resolves.toEqual([
      null,
      "workspace-switch",
    ]);
  });

  it("releases the previous workspace when the window that was in it moves to another project", async () => {
    const { runtime, root, pluginsRoot, workspaceRoot, scoped } = await fixture();
    const secondWorkspace = join(root, "second-workspace");
    await mkdir(secondWorkspace);
    const reasonsPath = join(root, "switch-reasons.json");
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
      export function createBackend({ workspaceRoot }) {
        const handler = (_request, response) => response.end("ok");
        handler.dispose = async (options) => {
          const reasons = JSON.parse(readFileSync(${JSON.stringify(reasonsPath)}, "utf8"));
          reasons.push([options?.reason ?? null, workspaceRoot]);
          writeFileSync(${JSON.stringify(reasonsPath)}, JSON.stringify(reasons));
        };
        return handler;
      }
    `);
    runtime.clearManifestCache();

    const select = (path, clientId) => fetch(`${runtime.url}/core-api/workspace`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: basename(path), path, ...(clientId ? { clientId } : {}) }),
    });
    // Duas janelas no primeiro projeto: enquanto uma delas continuar lá, os
    // terminais e processos daquele workspace precisam sobreviver.
    expect((await select(workspaceRoot, "window-alpha")).status).toBe(200);
    expect((await select(workspaceRoot, "window-beta")).status).toBe(200);
    expect((await fetch(scoped("/plugin-api/observer/status"))).status).toBe(200);

    expect((await select(secondWorkspace, "window-alpha")).status).toBe(200);
    await expect(readFile(reasonsPath, "utf8").then(JSON.parse)).resolves.toEqual([]);

    // A última janela saiu: agora não há mais ninguém para quem preservar o
    // estado vivo do projeto anterior.
    expect((await select(secondWorkspace, "window-beta")).status).toBe(200);
    await expect(readFile(reasonsPath, "utf8").then(JSON.parse)).resolves.toEqual([
      ["workspace-switch", workspaceRoot],
    ]);
    expect((await fetch(scoped("/plugin-api/observer/status"))).status).toBe(409);
  });

  it("releases the workspace of a window that closed without switching projects", async () => {
    const { runtime, root, workspaceRoot, scoped } = await fixture();
    const pidPath = join(root, "released-child.pid");
    expect((await fetch(`${runtime.url}/core-api/workspace`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: basename(workspaceRoot), path: workspaceRoot, clientId: "window-alpha" }),
    })).status).toBe(200);
    expect((await fetch(scoped("/core-api/execution/processes"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        executable: process.execPath,
        arguments: ["-e", `require('fs').writeFileSync(${JSON.stringify(pidPath)}, String(process.pid)); setInterval(() => {}, 1000)`],
        workingDirectory: workspaceRoot,
      }),
    })).status).toBe(201);
    let childPid;
    for (let attempt = 0; attempt < 50 && !childPid; attempt += 1) {
      try { childPid = Number(await readFile(pidPath, "utf8")); } catch {}
      if (!childPid) await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(childPid).toBeGreaterThan(0);

    const released = await fetch(`${runtime.url}/core-api/workspace/release`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: "window-alpha" }),
    });
    expect(released.status).toBe(204);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(() => process.kill(childPid, 0)).toThrow(expect.objectContaining({ code: "ESRCH" }));
  });

  it("preserves plugin processes when reload restores the same workspace", async () => {
    const { runtime, root, pluginsRoot, workspaceRoot, scoped } = await fixture();
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

    const activated = await fetch(scoped("/plugin-api/persistent/status"));
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
    const { runtime, root, pluginsRoot, scoped } = await fixture();
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

    const response = await fetch(scoped("/plugin-api/unsafe/ping"));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("backend inválido") });
  });

  it("serves the SPA fallback and rejects malformed plugin asset paths", async () => {
    const { runtime, workspaceRoot, scoped } = await fixture();
    const fallback = await fetch(`${runtime.url}/deep/link`);
    expect(fallback.status).toBe(200);
    expect(await fallback.text()).toContain("tinyIde");

    // A própria página vive dentro do escopo: recarregar /w/<id>/ devolve a
    // aplicação, e é assim que a janela reabre o mesmo projeto sem ponteiro.
    const scopedPage = await fetch(`${runtime.url}/w/${runtime.workspaceScopeId(workspaceRoot)}/`);
    expect(scopedPage.status).toBe(200);
    expect(await scopedPage.text()).toContain("tinyIde");
    // Assets hasheados continuam servidos por baixo do escopo.
    expect((await fetch(scoped("/app-AbCdEf12.js"))).status).toBe(200);

    const malformed = await fetch(`${runtime.url}/dev-plugins/%E0%A4%A`);
    expect(malformed.status).toBe(400);
  });

  it("allows direct workspace updates for embedded hosts", async () => {
    const { runtime, workspaceRoot } = await fixture();
    expect(runtime.setWorkspaceRoot(undefined)).toBeUndefined();
    expect(runtime.setWorkspaceRoot(workspaceRoot)).toBe(workspaceRoot);
    expect(() => runtime.clearBackendCache()).not.toThrow();
  });

  it("entrega o workspace inicial ao escopo do próprio caminho, e a nenhum outro", async () => {
    const { runtime, workspaceRoot, root, userDataRoot } = await fixture();
    const outroWorkspace = join(root, "outro");
    await mkdir(outroWorkspace);

    // O workspace embutido pelo host pertence ao escopo derivado do caminho.
    expect(runtime.workspaceRoot).toBe(workspaceRoot);
    expect(runtime.initialScopeId).toBe(runtime.workspaceScopeId(workspaceRoot));
    // E já nasce registrado em disco, para que um reload em /w/<id> o resolva.
    await expect(readFile(
      join(userDataRoot, "workspaces", runtime.initialScopeId, "workspace.json"),
      "utf8",
    ).then(JSON.parse)).resolves.toMatchObject({ path: workspaceRoot });

    // Requisição sem escopo não alcança arquivo nenhum.
    const semEscopo = await fetch(`${runtime.url}/core-api/workspace/resources?path=`);
    expect(semEscopo.status).toBe(409);

    // Abrir outro projeto não move o do host.
    const trocou = await fetch(`${runtime.url}/core-api/workspace`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: basename(outroWorkspace), path: outroWorkspace }),
    });
    expect(trocou.status).toBe(200);
    expect(await trocou.json()).toMatchObject({ workspaceRoot: outroWorkspace });
    expect(runtime.workspaceRoot).toBe(workspaceRoot);
  });

  it("separa o ponteiro de projeto por host, mesmo compartilhando o diretório de dados", async () => {
    const { runtime, root, userDataRoot } = await fixture();
    const outro = await fixture({ hostId: "desktop", userDataRoot });

    const write = (target, path) => fetch(`${target.url}/core-api/host/state/last-workspace`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path }),
    });
    await write(runtime, join(root, "projeto-do-navegador"));
    await write(outro.runtime, join(root, "projeto-do-desktop"));

    const read = (target) => fetch(`${target.url}/core-api/host/state/last-workspace`)
      .then((response) => response.json());
    await expect(read(runtime)).resolves.toEqual({ path: join(root, "projeto-do-navegador") });
    await expect(read(outro.runtime)).resolves.toEqual({ path: join(root, "projeto-do-desktop") });
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
