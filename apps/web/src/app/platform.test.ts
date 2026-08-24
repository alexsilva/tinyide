import type { PluginManifest } from "@tinyide/plugin-api";
import { describe, expect, it, vi } from "vitest";
import {
  orderPluginsByDependencies,
  pluginBackend,
  readStoredPlugins,
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

function localStorageWith(value?: readonly StoredPlugin[]) {
  const values = new Map<string, string>();
  if (value) values.set("tinyide.react.plugins.v1", JSON.stringify(value));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    removeItem: vi.fn((key: string) => values.delete(key)),
    setItem: vi.fn((key: string, next: string) => values.set(key, next)),
  };
}

describe("plugin state persistence", () => {
  it("uses desktop state instead of origin-scoped local storage", async () => {
    const local = [storedPlugin("local", true)];
    const desktop = [storedPlugin("desktop", false)];
    const storage = localStorageWith(local);
    const readState = vi.fn(async () => desktop);

    await expect(readStoredPlugins(storage, { readState })).resolves.toEqual(desktop);
    expect(readState).toHaveBeenCalledWith("plugins");
    expect(storage.getItem).not.toHaveBeenCalled();
  });

  it("migrates local plugin state when desktop state does not exist yet", async () => {
    const local = [storedPlugin("local", false)];
    const storage = localStorageWith(local);
    const readState = vi.fn(async () => undefined);

    await expect(readStoredPlugins(storage, { readState })).resolves.toEqual(local);
  });

  it("writes plugin state to durable desktop storage", async () => {
    const stored = [storedPlugin("python", false)];
    const storage = localStorageWith();
    const writeState = vi.fn(async () => true);

    await writeStoredPlugins(storage, stored, { writeState });

    expect(writeState).toHaveBeenCalledWith("plugins", stored);
    expect(storage.setItem).toHaveBeenCalledWith("tinyide.react.plugins.v1", JSON.stringify(stored));
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
