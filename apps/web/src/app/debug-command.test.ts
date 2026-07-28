import type { DebugAdapterProvider, DebugSessionSnapshot } from "@tinyide/plugin-api";
import { describe, expect, it, vi } from "vitest";
import { sendDebugCommand } from "./runtime";

function snapshot(status: DebugSessionSnapshot["status"], path = "src/main.py", line = 4): DebugSessionSnapshot {
  return {
    id: "debug-1",
    adapterId: "test",
    profileId: "profile-1",
    profileName: "Debug",
    status,
    breakpoints: [],
    frames: [{ id: "0", name: "main", path, line }],
    selectedFrameId: "0",
    scopes: [],
    stdout: "",
    stderr: "",
    startedAt: 1,
  };
}

describe("debug commands", () => {
  it("waits for a step command to reach its next paused source location", async () => {
    const read = vi.fn()
      .mockResolvedValueOnce(snapshot("running"))
      .mockResolvedValueOnce(snapshot("paused", "src/service.py", 12));
    const adapter: DebugAdapterProvider = {
      id: "test",
      name: "Test",
      supports: () => true,
      launch: vi.fn(),
      read,
      setBreakpoints: vi.fn(),
      command: vi.fn(async () => snapshot("running")),
    };

    const result = await sendDebugCommand(adapter, "debug-1", "stepInto");

    expect(result.status).toBe("paused");
    expect(result.frames[0]).toMatchObject({ path: "src/service.py", line: 12 });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("returns non-step commands without polling", async () => {
    const adapter: DebugAdapterProvider = {
      id: "test",
      name: "Test",
      supports: () => true,
      launch: vi.fn(),
      read: vi.fn(),
      setBreakpoints: vi.fn(),
      command: vi.fn(async () => snapshot("running")),
    };

    const result = await sendDebugCommand(adapter, "debug-1", "resume");

    expect(result.status).toBe("running");
    expect(adapter.read).not.toHaveBeenCalled();
  });
});
