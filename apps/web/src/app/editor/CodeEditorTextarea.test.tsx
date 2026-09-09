// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodeEditorTextarea } from "./CodeEditorTextarea";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

function renderEditor(highlighted: boolean) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const highlightedScroller = document.createElement("div");
  const onCaptureState = vi.fn();
  const onChange = vi.fn();
  const onKeyDown = vi.fn();
  const onMouseUp = vi.fn();
  const onDoubleClick = vi.fn();
  const onOpenContextMenu = vi.fn();
  const onScroll = vi.fn();
  act(() => {
    root?.render(
      <CodeEditorTextarea
        editorRef={{ current: null }}
        highlighted={highlighted}
        folded={highlighted}
        value="alpha\nbeta"
        readOnly={false}
        highlightedScrollRef={{ current: highlightedScroller }}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onMouseDown={vi.fn()}
        onMouseUp={onMouseUp}
        onDoubleClick={onDoubleClick}
        onCaptureState={onCaptureState}
        onNavigate={vi.fn()}
        onOpenContextMenu={onOpenContextMenu}
        onScroll={onScroll}
      />,
    );
  });
  return {
    textarea: host.querySelector<HTMLTextAreaElement>("textarea")!,
    highlightedScroller,
    onCaptureState,
    onChange,
    onKeyDown,
    onMouseUp,
    onDoubleClick,
    onOpenContextMenu,
    onScroll,
  };
}

describe("CodeEditorTextarea", () => {
  it("preserves the highlighted editor contract and uses its scroller for context actions", () => {
    const { textarea, highlightedScroller, onOpenContextMenu } = renderEditor(true);
    expect(textarea.className).toBe("code-editor code-editor--highlighted code-editor--folded");
    expect(textarea.getAttribute("wrap")).toBe("off");

    act(() => textarea.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 15, clientY: 25 })));
    expect(onOpenContextMenu).toHaveBeenCalledWith(textarea, 15, 25, highlightedScroller);
  });

  it("keeps scrolling on the plain textarea only", () => {
    const { textarea, onScroll } = renderEditor(false);
    expect(textarea.className).toBe("code-editor");
    expect(textarea.hasAttribute("wrap")).toBe(false);

    act(() => textarea.dispatchEvent(new Event("scroll", { bubbles: true })));
    expect(onScroll).toHaveBeenCalledWith(textarea);
  });

  it("forwards completion and folded-pointer events without changing their editor target", () => {
    const { textarea, onChange, onKeyDown, onMouseUp, onDoubleClick } = renderEditor(true);

    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(textarea, "alpha\nbeta.");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "." }));
      textarea.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 8, clientY: 12 }));
      textarea.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 8, clientY: 12 }));
    });

    expect(onChange).toHaveBeenCalledOnce();
    expect(onKeyDown).toHaveBeenCalledOnce();
    expect(onMouseUp).toHaveBeenCalledOnce();
    expect(onDoubleClick).toHaveBeenCalledOnce();
  });

  it("does not attach folded double-click handling to the plain editor", () => {
    const { textarea, onDoubleClick } = renderEditor(false);

    act(() => textarea.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    expect(onDoubleClick).not.toHaveBeenCalled();
  });
});
