import { describe, expect, it, vi } from "vitest";
import { createPluginBackendResolver, createPluginManifestSnapshot } from "./plugin-runtime-cache.mjs";

function descriptor(id = "sample") {
  return {
    directory: `/plugins/${id}`,
    manifest: {id, entrypoints: {backend: "backend.mjs"}},
  };
}

function backendFixture(overrides = {}) {
  const statBackend = overrides.statBackend ?? vi.fn(async () => ({mtimeMs: 1, isFile: () => true}));
  const createBackendProxy = vi.fn((options) => ({options}));
  const disposeBackend = vi.fn(async () => undefined);
  const resolve = createPluginBackendResolver({
    backendPathFor: overrides.backendPathFor ?? ((entry) => `${entry.directory}/backend.mjs`),
    statBackend,
    createBackendProxy,
    disposeBackend,
  });
  const context = {backendHandlers: new Map(), backendResolutions: new Map()};
  return {resolve, context, statBackend, createBackendProxy, disposeBackend};
}

describe("plugin runtime cache", () => {
  it("indexes the first valid descriptor for each id and builds the strict base policy", () => {
    const first = descriptor();
    const duplicate = {...descriptor(), directory: "/plugins/duplicate"};
    const descriptors = [first, duplicate, {manifest: {}}];
    const snapshot = createPluginManifestSnapshot(descriptors, undefined);

    expect(snapshot.descriptors).toBe(descriptors);
    expect(snapshot.byId.size).toBe(1);
    expect(snapshot.byId.get("sample")).toBe(first);
    expect(snapshot.policy).toContain("script-src 'self'");
    expect(snapshot.policy).not.toContain("wasm-unsafe-eval");
    expect(snapshot.policy).not.toContain("cdn.jsdelivr.net");
  });

  it("includes only valid hashes and permissions requested by plugins", () => {
    const descriptors = [{
      ...descriptor("python"),
      manifest: {
        ...descriptor("python").manifest,
        permissions: ["runtime.wasm", "network.cdn"],
      },
    }];
    const snapshot = createPluginManifestSnapshot(descriptors, [
      "'sha256-YWJjZA=='",
      "'unsafe-inline'",
    ]);

    expect(snapshot.policy).toContain("'sha256-YWJjZA=='");
    const scriptPolicy = snapshot.policy.split("; ").find((entry) => entry.startsWith("script-src"));
    expect(scriptPolicy).not.toContain("'unsafe-inline'");
    expect(snapshot.policy).toContain("'wasm-unsafe-eval'");
    expect(snapshot.policy).toContain("https://cdn.jsdelivr.net");
  });

  it("returns no backend for an unknown plugin or one without a backend", async () => {
    const {resolve, context, statBackend} = backendFixture();
    const frontendOnly = {directory: "/plugins/frontend", manifest: {id: "frontend", entrypoints: {}}};
    const byId = new Map([["frontend", frontendOnly]]);

    await expect(resolve(context, "missing", "/workspace", byId)).resolves.toBeUndefined();
    await expect(resolve(context, "frontend", "/workspace", byId)).resolves.toBeUndefined();
    expect(statBackend).not.toHaveBeenCalled();
    expect(context.backendResolutions.size).toBe(0);
  });

  it("rejects missing, unreadable and non-file backend entrypoints", async () => {
    const entry = descriptor();
    const byId = new Map([["sample", entry]]);

    const missing = backendFixture({backendPathFor: () => undefined});
    await expect(missing.resolve(missing.context, "sample", "/workspace", byId))
      .rejects.toThrow("Caminho de backend inválido");

    const unreadable = backendFixture({statBackend: vi.fn(async () => { throw new Error("gone"); })});
    await expect(unreadable.resolve(unreadable.context, "sample", "/workspace", byId))
      .rejects.toThrow("Caminho de backend inválido");

    const directory = backendFixture({statBackend: vi.fn(async () => ({mtimeMs: 1, isFile: () => false}))});
    await expect(directory.resolve(directory.context, "sample", "/workspace", byId))
      .rejects.toThrow("Caminho de backend inválido");
  });

  it("creates, reuses and hot-reloads one backend for a workspace", async () => {
    let mtimeMs = 1;
    const fixture = backendFixture({
      statBackend: vi.fn(async () => ({mtimeMs, isFile: () => true})),
    });
    const byId = new Map([["sample", descriptor()]]);

    const first = await fixture.resolve(fixture.context, "sample", "/workspace", byId);
    const cached = await fixture.resolve(fixture.context, "sample", "/workspace", byId);
    expect(cached).toBe(first);
    expect(fixture.createBackendProxy).toHaveBeenCalledOnce();
    expect(fixture.disposeBackend).not.toHaveBeenCalled();

    mtimeMs = 2;
    const reloaded = await fixture.resolve(fixture.context, "sample", "/workspace", byId);
    expect(reloaded).not.toBe(first);
    expect(fixture.disposeBackend).toHaveBeenCalledWith(first);
    expect(fixture.createBackendProxy).toHaveBeenLastCalledWith({
      backendPath: "/plugins/sample/backend.mjs",
      workspaceRoot: "/workspace",
      pluginId: "sample",
    });
  });

  it("deduplicates concurrent resolution and does not erase a newer pending operation", async () => {
    let releaseStat;
    const statBackend = vi.fn(() => new Promise((resolve) => { releaseStat = resolve; }));
    const fixture = backendFixture({statBackend});
    const byId = new Map([["sample", descriptor()]]);

    const first = fixture.resolve(fixture.context, "sample", "/workspace", byId);
    const concurrent = fixture.resolve(fixture.context, "sample", "/workspace", byId);
    expect(concurrent).toBe(first);
    expect(statBackend).toHaveBeenCalledOnce();

    const replacement = Promise.resolve("newer");
    fixture.context.backendResolutions.set("sample:/workspace", replacement);
    releaseStat({mtimeMs: 1, isFile: () => true});
    await expect(first).resolves.toBeDefined();
    expect(fixture.context.backendResolutions.get("sample:/workspace")).toBe(replacement);
  });
});
