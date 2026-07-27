import { describe, expect, it } from "vitest";
import type { HostProcessSnapshot } from "./runtime";
import {
  nextPanelTabAfterClosingProfile,
  openProfileExecutionTab,
  profileExecutionPanelTab,
  profileExecutionPanelTabId,
  profileExecutionOutput,
  profileExecutionStatusLabel,
  profileIdFromExecutionPanelTab,
  restoreProfileExecutions,
  restoredProfileExecutionTabIds,
  resumedProfileProcessOutput,
} from "./profile-execution-state";

function processSnapshot(input: Partial<HostProcessSnapshot> & {
  readonly id: string;
  readonly profileId: string;
  readonly profileName: string;
  readonly startedAt: number;
  readonly runId?: string;
}): HostProcessSnapshot {
  return {
    id: input.id,
    workspaceRoot: "/workspace",
    status: input.status ?? "running",
    executable: input.executable ?? "node",
    arguments: input.arguments ?? [],
    workingDirectory: input.workingDirectory ?? "/workspace",
    presentation: {
      kind: "profile",
      sourceId: input.profileId,
      sourceName: input.profileName,
      ...(input.runId ? { runId: input.runId } : {}),
      stepId: input.id,
      stepName: input.id,
      outputPrefix: [`[perfil] ${input.profileName}`, `[etapa] ${input.id}`],
    },
    stdout: input.stdout ?? "",
    stderr: input.stderr ?? "",
    stopRequested: input.stopRequested ?? false,
    ...(input.exitCode === undefined ? {} : { exitCode: input.exitCode }),
    ...(input.signal === undefined ? {} : { signal: input.signal }),
    startedAt: input.startedAt,
    ...(input.finishedAt === undefined ? {} : { finishedAt: input.finishedAt }),
    durationMs: input.durationMs ?? 0,
  };
}

describe("profile execution state", () => {
  it("uses independent panel tab ids for run and debug sessions", () => {
    const tabId = profileExecutionPanelTabId("python/dev server", "run");
    const debugTabId = profileExecutionPanelTabId("python/dev server", "debug");
    expect(tabId).toBe("execution-profile:run:python%2Fdev%20server");
    expect(debugTabId).toBe("execution-profile:debug:python%2Fdev%20server");
    expect(profileExecutionPanelTab(tabId)).toEqual({ profileId: "python/dev server", mode: "run" });
    expect(profileExecutionPanelTab(debugTabId)).toEqual({ profileId: "python/dev server", mode: "debug" });
    expect(profileIdFromExecutionPanelTab(tabId)).toBe("python/dev server");
    expect(profileIdFromExecutionPanelTab("output")).toBeUndefined();
    expect(profileIdFromExecutionPanelTab("execution-profile:run:%E0%A4%A")).toBeUndefined();
  });

  it("reuses only the same mode tab and selects a neighboring tab after close", () => {
    const pythonRun = profileExecutionPanelTabId("python", "run");
    const pythonDebug = profileExecutionPanelTabId("python", "debug");
    const nodeRun = profileExecutionPanelTabId("node", "run");
    expect(openProfileExecutionTab([pythonRun], "python", "run")).toEqual([pythonRun]);
    expect(openProfileExecutionTab([pythonRun], "python", "debug")).toEqual([pythonRun, pythonDebug]);
    expect(openProfileExecutionTab([pythonRun, pythonDebug], "node", "run"))
      .toEqual([pythonRun, pythonDebug, nodeRun]);
    expect(nextPanelTabAfterClosingProfile([pythonRun, pythonDebug, nodeRun], pythonDebug)).toBe(nodeRun);
    expect(nextPanelTabAfterClosingProfile([pythonRun], pythonRun)).toBe("output");
  });

  it("restores independent state and output for any number of profiles", () => {
    const restored = restoreProfileExecutions([
      processSnapshot({
        id: "python-step",
        profileId: "python",
        profileName: "Python",
        startedAt: 10,
        status: "running",
        stdout: "python-online\n",
      }),
      processSnapshot({
        id: "node-step",
        profileId: "node",
        profileName: "Node",
        startedAt: 20,
        status: "exited",
        exitCode: 0,
        finishedAt: 30,
        stdout: "node-finished\n",
      }),
    ]);

    expect(restored.states.python).toMatchObject({ status: "running", processId: "python-step" });
    expect(restored.states.node).toMatchObject({ status: "completed" });
    expect(restored.states.python!.output.join("\n")).toContain("python-online");
    expect(restored.states.python!.output.join("\n")).not.toContain("node-finished");
    expect(restored.states.node!.output.join("\n")).toContain("node-finished");
    expect(restored.states.node!.output.join("\n")).not.toContain("python-online");
    expect(restored.running).toEqual([
      expect.objectContaining({ profileId: "python", processId: "python-step" }),
    ]);
    expect(restoredProfileExecutionTabIds(restored.states)).toEqual([
      profileExecutionPanelTabId("python", "run"),
    ]);
  });

  it("keeps earlier steps while a resumed profile updates its running step", () => {
    const first = processSnapshot({
      id: "build",
      profileId: "node",
      profileName: "Node",
      startedAt: 10,
      runId: "node-run",
      status: "exited",
      exitCode: 0,
      stdout: "build-ok\n",
    });
    const second = processSnapshot({
      id: "serve",
      profileId: "node",
      profileName: "Node",
      startedAt: 20,
      runId: "node-run",
      status: "running",
      stdout: "listening\n",
    });
    const restored = restoreProfileExecutions([second, first]);
    const output = resumedProfileProcessOutput(restored.running[0]!, {
      ...second,
      stdout: "listening\nrequest-ok\n",
    });

    expect(output.join("\n")).toContain("build-ok");
    expect(output.join("\n")).toContain("request-ok");
    expect(output.filter((line) => line === "[perfil] Node")).toHaveLength(1);
  });

  it("restores only the newest execution of a profile", () => {
    const restored = restoreProfileExecutions([
      processSnapshot({
        id: "old-run",
        profileId: "node",
        profileName: "Node",
        runId: "run-1",
        startedAt: 10,
        status: "exited",
        exitCode: 1,
        stdout: "OLD-OUTPUT\n",
      }),
      processSnapshot({
        id: "new-run",
        profileId: "node",
        profileName: "Node",
        runId: "run-2",
        startedAt: 20,
        status: "exited",
        exitCode: 0,
        stdout: "NEW-OUTPUT\n",
      }),
    ]);

    expect(restored.states.node!.output.join("\n")).toContain("NEW-OUTPUT");
    expect(restored.states.node!.output.join("\n")).not.toContain("OLD-OUTPUT");
    expect(restored.states.node!.status).toBe("completed");
  });

  it("exposes the selected profile status without borrowing another profile output", () => {
    expect(profileExecutionStatusLabel(undefined)).toBe("Não executado");
    expect(profileExecutionOutput({ name: "Python" }, undefined)).toEqual([
      "[perfil] Python",
      "[não executado]",
    ]);
  });
});
