import type { DebugAdapterProvider, DebugSessionSnapshot } from "@tinyide/plugin-api";
import { describe, expect, it, vi } from "vitest";
import {
  restoreActiveDebugSessions,
  sameDebugSessionSnapshot,
  workspaceRelativeDebugPath,
} from "./debug-session-state";

function session(
  id: string,
  startedAt: number,
  status: DebugSessionSnapshot["status"] = "paused",
  profileId = `profile-${id}`,
): DebugSessionSnapshot {
  return {
    id,
    adapterId: "test-adapter",
    profileId,
    profileName: `Profile ${id}`,
    status,
    breakpoints: [],
    frames: [],
    scopes: [],
    stdout: "",
    stderr: "",
    startedAt,
  };
}

function adapter(sessions: readonly DebugSessionSnapshot[]): DebugAdapterProvider & { command: ReturnType<typeof vi.fn> } {
  const command = vi.fn(async (sessionId: string) => ({
    ...sessions.find((candidate) => candidate.id === sessionId)!,
    status: "stopped" as const,
    finishedAt: Date.now(),
  }));
  return {
    id: "test-adapter",
    name: "Test adapter",
    supports: () => true,
    list: vi.fn(async () => sessions),
    launch: vi.fn(),
    read: vi.fn(),
    setBreakpoints: vi.fn(),
    command,
  };
}

describe("debug session restoration", () => {
  it("restores active sessions from different profiles without stopping them", async () => {
    const provider = adapter([
      session("profile-a", 10),
      session("finished", 15, "completed"),
      session("profile-b", 20, "running"),
    ]);

    const restored = await restoreActiveDebugSessions([provider]);

    expect(restored.sessions.map(({ session }) => session.id)).toEqual(["profile-a", "profile-b"]);
    expect(provider.command).not.toHaveBeenCalled();
    expect(restored.errors).toEqual([]);
  });

  it("stops only an older duplicate session of the same profile", async () => {
    const provider = adapter([
      session("old", 10, "paused", "profile-a"),
      session("current", 20, "running", "profile-a"),
      session("other", 15, "paused", "profile-b"),
    ]);

    const restored = await restoreActiveDebugSessions([provider]);

    expect(restored.sessions.map(({ session }) => session.id)).toEqual(["other", "current"]);
    expect(provider.command).toHaveBeenCalledOnce();
    expect(provider.command).toHaveBeenCalledWith("old", "stop");
  });

  it("keeps restoration available when another adapter cannot list sessions", async () => {
    const provider = adapter([session("current", 20)]);
    const failing: DebugAdapterProvider = {
      ...adapter([]),
      id: "failing",
      list: vi.fn(async () => { throw new Error("offline"); }),
    };

    const restored = await restoreActiveDebugSessions([failing, provider]);

    expect(restored.sessions.map(({ session }) => session.id)).toEqual(["current"]);
    expect(restored.errors.map((error) => error.message)).toEqual(["offline"]);
  });
});

describe("debug source paths", () => {
  it("resolves source files inside the workspace", () => {
    expect(workspaceRelativeDebugPath(
      "/workspace/project/src/service.py",
      "/workspace/project",
    )).toBe("src/service.py");
    expect(workspaceRelativeDebugPath("./src/service.py", "/workspace/project")).toBe("src/service.py");
  });

  it("does not expose sources outside the workspace", () => {
    expect(workspaceRelativeDebugPath("/usr/lib/python3.12/pathlib.py", "/workspace/project")).toBeUndefined();
    expect(workspaceRelativeDebugPath("<string>", "/workspace/project")).toBeUndefined();
  });
});

describe("debug session snapshots", () => {
  it("ignores polling responses that do not change visible debug state", () => {
    const current = session("current", 20, "running");
    expect(sameDebugSessionSnapshot(current, { ...current })).toBe(true);
    expect(sameDebugSessionSnapshot(current, { ...current, stdout: "new output" })).toBe(false);
    expect(sameDebugSessionSnapshot(current, {
      ...current,
      frames: [{ id: "0", name: "task", path: "/workspace/task.py", line: 42 }],
    })).toBe(false);
  });
});
