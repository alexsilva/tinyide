// @vitest-environment jsdom
import * as Tooltip from "@radix-ui/react-tooltip";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DebugSessionSnapshot } from "@tinyide/plugin-api";
import { DebugSessionView } from "./DebugSessionView";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

describe("DebugSessionView", () => {
  const sampleSession: DebugSessionSnapshot = {
    id: "session-1",
    profileId: "prof-1",
    profileName: "Python",
    breakpoints: [],
    startedAt: 0,
    adapterId: "py-dbg",
    status: "paused",
    stdout: "line 1\n",
    stderr: "",
    frames: [
      { id: "f1", name: "main()", path: "src/app.py", line: 12 },
    ],
    selectedFrameId: "f1",
    scopes: [
      {
        name: "Locals",
        variables: [
          { name: "x", value: "42", type: "int" },
        ],
      },
    ],
  };

  it("renders output, frames, breakpoints and responds to user actions", () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    const onToggleWrap = vi.fn();
    const onClearOutput = vi.fn();
    const onToggleBreakpoint = vi.fn();
    const onSelectFrame = vi.fn();

    act(() => {
      root?.render(
        <Tooltip.Provider>
          <DebugSessionView
            session={sampleSession}
            inspectorWidth={320}
            outputWrap={false}
            outputFollowTail={true}
            outputSegments={[{ kind: "output", label: "", text: "line 1" }]}
            breakpoints={[{ path: "src/app.py", line: 12 }]}
            variableQuery=""
            onToggleOutputWrap={onToggleWrap}
            onClearOutput={onClearOutput}
            onToggleOutputFollowTail={vi.fn()}
            onToggleBreakpoint={onToggleBreakpoint}
            onSelectFrame={onSelectFrame}
            onVariableQueryChange={vi.fn()}
            onBeginInspectorResize={vi.fn()}
            onResetInspectorWidth={vi.fn()}
          />
        </Tooltip.Provider>,
      );
    });

    expect(host.textContent).toContain("line 1");
    expect(host.textContent).toContain("Breakpoints");
    expect(host.textContent).toContain("src/app.py");
    expect(host.textContent).toContain("main()");
    expect(host.textContent).toContain("Locals");
    expect(host.textContent).toContain("42");

    // Click frame
    const frameBtn = host.querySelector(".execution-debug-inspector-section button.is-selected");
    expect(frameBtn).not.toBeNull();
    act(() => (frameBtn as HTMLButtonElement)?.click());
    expect(onSelectFrame).toHaveBeenCalledWith("src/app.py", 12);

    // Click wrap button
    const wrapBtn = host.querySelector<HTMLButtonElement>("button[aria-label='Quebrar linhas']");
    expect(wrapBtn).not.toBeNull();
    act(() => wrapBtn?.click());
    expect(onToggleWrap).toHaveBeenCalledTimes(1);
  });
});
