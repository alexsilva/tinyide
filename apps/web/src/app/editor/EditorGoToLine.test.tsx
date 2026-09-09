// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorGoToLine } from "./EditorGoToLine";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

describe("EditorGoToLine", () => {
  it("renders closed button and opens on click", () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    const onOpen = vi.fn();

    act(() => {
      root?.render(
        <EditorGoToLine
          open={false}
          value=""
          lineCount={100}
          inputRef={{ current: null }}
          onOpen={onOpen}
          onClose={vi.fn()}
          onChange={vi.fn()}
          onGoToLine={vi.fn()}
        />,
      );
    });

    const button = host.querySelector<HTMLButtonElement>("button");
    expect(button).not.toBeNull();
    expect(button?.getAttribute("aria-label")).toBe("Ir para linha");
    act(() => button?.click());
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("submits line number on Enter key", () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    const onGoToLine = vi.fn();
    const onClose = vi.fn();

    act(() => {
      root?.render(
        <EditorGoToLine
          open={true}
          value="42"
          lineCount={100}
          inputRef={{ current: null }}
          onOpen={vi.fn()}
          onClose={onClose}
          onChange={vi.fn()}
          onGoToLine={onGoToLine}
        />,
      );
    });

    const input = host.querySelector<HTMLInputElement>("input");
    expect(input).not.toBeNull();

    act(() => {
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(onGoToLine).toHaveBeenCalledWith(42);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
