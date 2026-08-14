import { describe, expect, it } from "vitest";
import type { ExecutionEnvironment } from "@tinyide/plugin-api";
import {
  environmentSelectionsEqual,
  resolveEnvironmentSelections,
  selectedEnvironmentForProvider,
} from "./environment-selection";

const environments: readonly ExecutionEnvironment[] = [
  {
    id: "node-host",
    providerId: "node-runtimes",
    name: "Node.js do host",
    type: "process",
    status: "ready",
    executable: "/usr/bin/node",
  },
  {
    id: "python-project",
    providerId: "python-environments",
    name: "Projeto Python",
    type: "venv",
    status: "ready",
    executable: "/workspace/.venv/bin/python",
    path: "/workspace/.venv",
  },
];

describe("environment selection", () => {
  it("selects one ready environment independently for every provider", () => {
    expect(resolveEnvironmentSelections(environments)).toEqual({
      "node-runtimes": "node-host",
      "python-environments": "python-project",
    });
  });

  it("migrates a legacy global selection without suppressing other providers", () => {
    expect(resolveEnvironmentSelections(environments, {}, { legacySelectedId: "node-host" })).toEqual({
      "node-runtimes": "node-host",
      "python-environments": "python-project",
    });
  });

  it("changes only the provider of a preferred environment", () => {
    const extraPython: ExecutionEnvironment = {
      id: "python-other",
      providerId: "python-environments",
      name: "Outro Python",
      type: "venv",
      status: "ready",
      executable: "/workspace/other/.venv/bin/python",
      path: "/workspace/other/.venv",
    };
    expect(resolveEnvironmentSelections(
      [...environments, extraPython],
      { "node-runtimes": "node-host", "python-environments": "python-project" },
      { preferredId: "python-other" },
    )).toEqual({
      "node-runtimes": "node-host",
      "python-environments": "python-other",
    });
  });

  it("resolves the selected environment only inside the requested provider", () => {
    const selections = resolveEnvironmentSelections(environments);
    expect(selectedEnvironmentForProvider(environments, selections, "python-environments")?.id)
      .toBe("python-project");
    expect(selectedEnvironmentForProvider(environments, selections, "missing")).toBeUndefined();
  });

  it("compares provider selections independently of key order", () => {
    expect(environmentSelectionsEqual(
      { "python-environments": "python-project", "node-runtimes": "node-host" },
      { "node-runtimes": "node-host", "python-environments": "python-project" },
    )).toBe(true);
  });
});
