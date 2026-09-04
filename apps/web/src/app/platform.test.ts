import type { PluginManifest } from "@tinyide/plugin-api";
import { describe, expect, it, vi } from "vitest";
import {
  orderPluginsByDependencies,
  pluginBackend,
  readStoredPlugins,
  refreshStoredPluginSources,
  rebaseLoopbackPluginUrl,
  type StoredPlugin,
  writeStoredPlugins,
} from "./platform";
import { setActiveHostWorkspaceRoot } from "./host-workspace-state";

function plugin(id: string, name: string, dependencies?: Readonly<Record<string, string>>) {
  const manifest: PluginManifest = {
    id,
    name,
    version: "0.1.0",
    publisher: "tinyide",
    category: "tool",
    engines: { tinyide: ">=0.4.0 <1.0.0" },
    entrypoints: { frontend: "./index.js" },
    activationEvents: ["onStartup"],
    permissions: [],
    ...(dependencies ? { dependencies } : {}),
  };
  return { manifest };
}

describe("plugin restoration order", () => {
  it("restores dependencies before alphabetically earlier dependents", () => {
    const pytest = plugin("tinyide.pytest", "Pytest", {
      "tinyide.python-environments": ">=0.1.1 <1.0.0",
    });
    const pythonEnvironments = plugin("tinyide.python-environments", "Ambientes Python");
    const javascript = plugin("tinyide.javascript", "JavaScript e TypeScript");

    expect(orderPluginsByDependencies([javascript, pytest, pythonEnvironments])).toEqual([
      javascript,
      pythonEnvironments,
      pytest,
    ]);
  });

  it("resolves transitive dependencies without duplicating entries", () => {
    const application = plugin("application", "Application", { service: "*" });
    const service = plugin("service", "Service", { runtime: "*" });
    const runtime = plugin("runtime", "Runtime");

    expect(orderPluginsByDependencies([application, service, runtime])).toEqual([
      runtime,
      service,
      application,
    ]);
  });
});

function storedPlugin(id: string, enabled: boolean): StoredPlugin {
  return {
    manifest: plugin(id, id).manifest,
    manifestUrl: `http://127.0.0.1/plugin/${id}/manifest.json`,
    sourceUrl: `http://127.0.0.1/plugin/${id}/index.js`,
    enabled,
  };
}

describe("plugin state persistence", () => {
  it("reads plugin state from the host persistence API", async () => {
    const stored = [storedPlugin("desktop", false)];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(stored), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(readStoredPlugins()).resolves.toEqual(stored);
    expect(fetchMock).toHaveBeenCalledWith(
      "/core-api/user/state/plugins",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("uses an empty plugin list when no host state exists", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "missing" }), { status: 404 })));

    await expect(readStoredPlugins()).resolves.toEqual([]);
  });

  it("writes plugin state to the host persistence API", async () => {
    const stored = [storedPlugin("python", false)];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => new Response(init?.body as string, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await writeStoredPlugins(stored);

    expect(fetchMock).toHaveBeenCalledWith(
      "/core-api/user/state/plugins",
      expect.objectContaining({ method: "PUT", body: JSON.stringify(stored) }),
    );
  });

  it("rebases packaged plugin URLs when the local runtime port changes", () => {
    expect(rebaseLoopbackPluginUrl(
      "http://127.0.0.1:41821/dev-plugins/python/plugin.json",
      "http://127.0.0.1:43990/",
    )).toBe("http://127.0.0.1:43990/dev-plugins/python/plugin.json");
  });

  it("does not rewrite remote plugin URLs", () => {
    expect(rebaseLoopbackPluginUrl(
      "https://plugins.example.com/python/plugin.json",
      "http://127.0.0.1:43990/",
    )).toBe("https://plugins.example.com/python/plugin.json");
  });
});

describe("plugin source refresh", () => {
  it("busca manifestos em paralelo e preserva a ordem persistida", async () => {
    const stored = [storedPlugin("alpha", true), storedPlugin("beta", false), storedPlugin("gamma", true)];
    let active = 0;
    let maximumActive = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const request = vi.fn(async (url: string) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await gate;
      active -= 1;
      const id = /plugin\/([^/]+)/.exec(url)?.[1] ?? "missing";
      return new Response(JSON.stringify(plugin(id, id).manifest), {status: 200});
    });

    const pending = refreshStoredPluginSources(stored, "http://127.0.0.1/", request);
    expect(maximumActive).toBe(3);
    release();
    const refreshed = await pending;

    expect(refreshed.map((entry) => entry.manifest.id)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("mantém o manifesto persistido quando a origem está indisponível", async () => {
    const stored = [storedPlugin("offline", true)];
    const refreshed = await refreshStoredPluginSources(
      stored,
      "http://127.0.0.1/",
      async () => { throw new Error("offline"); },
    );

    expect(refreshed).toEqual(stored);
  });
});

describe("plugin backend lifecycle", () => {
  it("does not hit the runtime before a workspace is ready", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;
    setActiveHostWorkspaceRoot(undefined);
    try {
      await expect(pluginBackend("tinyide.sample").request("/status")).rejects.toMatchObject({
        message: "Abra um workspace antes de usar este plugin.",
        statusCode: 409,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      setActiveHostWorkspaceRoot(undefined);
      globalThis.fetch = originalFetch;
    }
  });
});
