import { describe, expect, it } from "vitest";
import type { DebugSessionSnapshot, ExecutionProfile } from "@tinyide/plugin-api";
import { createWorkbenchExecutionSnapshot } from "./execution-snapshot";

function profile(id: string): ExecutionProfile {
  return {
    id,
    name: id.toUpperCase(),
    environment: { mode: "fixed", environmentId: "env-1" },
    steps: [{
      id: "run",
      name: "Run",
      executable: "node",
      command: "node",
      arguments: ["main.js"],
      parameters: ["--inspect"],
      target: { providerId: "node", kindId: "file", value: "main.js" },
      environmentVariables: { MODE: "test" },
    }],
  };
}

function debugSession(profileId: string, startedAt: number): DebugSessionSnapshot {
  return {
    id: `session-${profileId}`,
    adapterId: "node-inspector",
    profileId,
    profileName: profileId.toUpperCase(),
    status: "paused",
    breakpoints: [],
    frames: [],
    scopes: [],
    stdout: "",
    stderr: "",
    startedAt,
  };
}

describe("createWorkbenchExecutionSnapshot", () => {
  it("materializes execution state and focuses the selected profile debug session", () => {
    const sourceProfile = profile("a");
    const snapshot = createWorkbenchExecutionSnapshot({
      profiles: [sourceProfile],
      selectedProfileId: "a",
      environments: [{ id: "env-1", providerId: "node", name: "Node", type: "process", status: "ready", executable: "/usr/bin/node" }],
      selectedEnvironmentId: "env-1",
      selectedEnvironmentIds: { node: "env-1" },
      executions: {
        a: { profileId: "a", profileName: "A", profile: sourceProfile, status: "running", output: ["ready"], data: { source: "test" } },
      },
      debugSessions: {
        a: { session: debugSession("a", 10) },
        b: { session: debugSession("b", 20) },
      },
    });

    expect(snapshot.selectedProfileId).toBe("a");
    expect(snapshot.selectedEnvironmentIds).toEqual({ node: "env-1" });
    expect(snapshot.debugSessions?.map((session) => session.profileId)).toEqual(["a", "b"]);
    expect(snapshot.debugSession?.profileId).toBe("a");
    expect(snapshot.executions[0]).toMatchObject({ profileId: "a", output: ["ready"], data: { source: "test" } });
    expect(snapshot.profiles[0]).not.toBe(sourceProfile);
    expect(snapshot.profiles[0]?.steps).not.toBe(sourceProfile.steps);
    expect(snapshot.profiles[0]?.steps[0]?.parameters).not.toBe(sourceProfile.steps[0]?.parameters);
  });

  it("falls back to the latest debug session when the selected profile is not debugging", () => {
    const snapshot = createWorkbenchExecutionSnapshot({
      profiles: [],
      selectedProfileId: "missing",
      environments: [],
      executions: {},
      debugSessions: {
        older: { session: debugSession("older", 100) },
        latest: { session: debugSession("latest", 300) },
      },
    });

    expect(snapshot.debugSession?.profileId).toBe("latest");
  });
});
