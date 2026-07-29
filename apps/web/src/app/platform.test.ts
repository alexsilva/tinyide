import type { PluginManifest } from "@tinyide/plugin-api";
import { describe, expect, it } from "vitest";
import { orderPluginsByDependencies } from "./platform";

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
