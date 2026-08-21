import { describe, expect, it } from "vitest";
import {
  clampDebugInspectorWidth,
  debugOutputOffsetsFor,
  debugOutputSegments,
  filterDebugVariables,
  normalizeDebugPanelLayout,
} from "./debug-panel";

describe("debug panel", () => {
  it("normalizes and clamps the project-local layout", () => {
    expect(normalizeDebugPanelLayout()).toEqual({
      inspectorWidth: 360,
      outputWrap: false,
      outputFollowTail: true,
    });
    expect(clampDebugInspectorWidth(900, 800)).toBe(580);
    expect(clampDebugInspectorWidth(900, 100)).toBe(260);
  });

  it("consolidates the program output into a single stream and keeps data appended after clear", () => {
    const initial = { stdout: "first\n", stderr: "warn\n", error: "adapter\n" };
    const offsets = debugOutputOffsetsFor(initial);
    const next = { stdout: "first\nsecond\n", stderr: "warn\nfailed\n", error: "adapter\npaused\n" };
    expect(debugOutputSegments(next, offsets)).toEqual([
      { kind: "output", label: "", text: "second\nfailed\n" },
      { kind: "system", label: "debugger", text: "paused\n" },
    ]);
    expect(debugOutputSegments({ stdout: "first\n", stderr: "", error: "" }, offsets)).toEqual([]);
  });

  it("preserves matching ancestors while filtering nested variables", () => {
    const variables = [{
      name: "request",
      value: "Request",
      type: "object",
      children: [
        { name: "method", value: "GET", type: "str" },
        { name: "user", value: "User", children: [{ name: "email", value: "dev@example.com" }] },
      ],
    }];
    expect(filterDebugVariables(variables, "email")).toEqual([{ 
      name: "request",
      value: "Request",
      type: "object",
      children: [{
        name: "user",
        value: "User",
        children: [{ name: "email", value: "dev@example.com" }],
      }],
    }]);
    expect(filterDebugVariables(variables, "missing")).toEqual([]);
  });
});
