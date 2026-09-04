import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { createPluginManifestSnapshot } from "./plugin-runtime-cache.mjs";

describe("runtime plugin lookup performance", () => {
  it("resolves a busy backend by id without scanning a growing plugin catalog", () => {
    const descriptors = Array.from({length: 20_000}, (_, index) => ({
      directory: `/plugins/plugin-${index}`,
      manifest: {id: `plugin-${index}`, entrypoints: {backend: "backend.mjs"}},
    }));
    const {byId} = createPluginManifestSnapshot(descriptors);

    const startedAt = performance.now();
    let resolved;
    for (let request = 0; request < 100_000; request += 1) {
      resolved = byId.get("plugin-19999");
    }
    const duration = performance.now() - startedAt;

    expect(resolved).toBe(descriptors[19_999]);
    expect(duration).toBeLessThan(50);
  });
});
