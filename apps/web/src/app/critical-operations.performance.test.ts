import { describe, expect, it } from "vitest";
import { editorDocumentIndex } from "./editor-settings";
import { findTextMatches, replaceTextMatches } from "./editor/text-search";
import { refreshStoredPluginSources, type StoredPlugin } from "./platform";

describe("critical editor operation performance", () => {
  it("replaces 10,000 matches in a 1 MB document within the interactive budget", () => {
    const source = "target abcdefghijklmnopqrstuvwxyz\n".repeat(30_000);
    const matches = findTextMatches(source, "target", { caseSensitive: true });

    const startedAt = performance.now();
    const result = replaceTextMatches(source, matches, "replacement");
    const duration = performance.now() - startedAt;

    expect(matches).toHaveLength(10_000);
    expect(result.length).toBe(1_070_000);
    expect(duration).toBeLessThan(100);
  });

  it("indexes a 6 MB document in one pass within the interactive budget", () => {
    const source = "export function value(input) { return input * 2; } // benchmark\n".repeat(100_000);

    const startedAt = performance.now();
    const index = editorDocumentIndex(source, true);
    const duration = performance.now() - startedAt;

    expect(index.lineCount).toBe(100_001);
    expect(index.lineStarts).toHaveLength(100_001);
    expect(duration).toBeLessThan(150);
  });

  it("refreshes 30 installed plugin manifests within one network latency window", async () => {
    const entries: StoredPlugin[] = Array.from({length: 30}, (_, index) => ({
      manifest: {
        id: `plugin-${index}`,
        name: `Plugin ${index}`,
        version: "1.0.0",
        publisher: "tinyide",
        category: "tool",
        engines: {tinyide: ">=0.4.0 <1.0.0"},
        entrypoints: {frontend: "./index.js"},
        activationEvents: ["onStartup"],
        permissions: [],
      },
      manifestUrl: `http://127.0.0.1/plugins/plugin-${index}/plugin.json`,
      sourceUrl: `http://127.0.0.1/plugins/plugin-${index}/index.js`,
      enabled: true,
    }));
    const request = async (_url: string, _init: RequestInit) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response("{}", {status: 503});
    };

    const startedAt = performance.now();
    await refreshStoredPluginSources(entries, "http://127.0.0.1/", request);
    const duration = performance.now() - startedAt;

    expect(duration).toBeLessThan(100);
  });
});
