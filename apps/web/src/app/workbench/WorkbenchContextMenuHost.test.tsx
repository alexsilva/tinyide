// @vitest-environment jsdom
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WorkbenchContextMenuHost,
  type WorkbenchContextMenuHandle,
} from "./WorkbenchContextMenuHost";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

describe("WorkbenchContextMenuHost", () => {
  it("opens and enriches a menu without requiring the parent to rerender", () => {
    const ref = createRef<WorkbenchContextMenuHandle>();
    const onExecute = vi.fn();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    act(() => root?.render(
      <WorkbenchContextMenuHost ref={ref} workspaceName="tinyide" onExecute={onExecute} />,
    ));
    act(() => ref.current?.open({
      token: 7,
      target: { kind: "root" },
      x: 10,
      y: 20,
      items: [{ id: "open", label: "Abrir" }],
    }));

    expect(host.textContent).toContain("Abrir");
    act(() => ref.current?.update(7, [
      { id: "open", label: "Abrir" },
      { id: "git", label: "Git: Ver alterações" },
    ]));
    expect(host.textContent).toContain("Git: Ver alterações");
  });

  it("ignores stale updates and closes on an outside pointer", () => {
    const ref = createRef<WorkbenchContextMenuHandle>();
    const onDismiss = vi.fn();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    act(() => root?.render(
      <WorkbenchContextMenuHost
        ref={ref}
        workspaceName="tinyide"
        onDismiss={onDismiss}
        onExecute={() => undefined}
      />,
    ));
    act(() => ref.current?.open({
      token: 9,
      target: { kind: "root" },
      x: 10,
      y: 20,
      items: [{ id: "open", label: "Abrir" }],
    }));
    act(() => ref.current?.update(8, [{ id: "stale", label: "Stale" }]));
    expect(host.textContent).not.toContain("Stale");

    act(() => document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    expect(host.textContent).toBe("");
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
