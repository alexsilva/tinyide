// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorExecutionLayers, EditorFoldOverlay, EditorOperationMask } from "./EditorSurfaceParts";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

function mount(element: React.ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(element));
}

describe("EditorSurfaceParts", () => {
  it("keeps fold controls behavior outside App", () => {
    const onOpenPreview = vi.fn();
    const onSchedulePreviewClose = vi.fn();
    const onToggleFold = vi.fn();
    mount(
      <EditorFoldOverlay
        controls={[{ line: 7, folded: true }]}
        inline={false}
        scrollTop={120}
        overlayRef={{ current: null }}
        lineTop={(line) => line * 20}
        onOpenPreview={onOpenPreview}
        onSchedulePreviewClose={onSchedulePreviewClose}
        onToggleFold={onToggleFold}
      />,
    );

    const overlay = host?.querySelector<HTMLElement>(".editor-fold-overlay");
    const button = host?.querySelector<HTMLButtonElement>(".editor-fold-toggle");
    expect(overlay?.style.getPropertyValue("--editor-scroll-top")).toBe("120px");
    expect(button?.style.getPropertyValue("--fold-line-top")).toBe("140px");

    act(() => button?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    act(() => button?.click());
    expect(onOpenPreview).toHaveBeenCalledWith(7);
    expect(onToggleFold).toHaveBeenCalledWith(7);
  });

  it("renders debug, breakpoint and attention layers with the original geometry", () => {
    mount(
      <EditorExecutionLayers
        breakpointLines={[2, 5]}
        activeDebugLine={5}
        activeDebugVisibleLine={4}
        attentionLines={{ startLine: 3, endLine: 5 }}
        inline={false}
        scrollTop={80}
        lineHeight={18}
        lineTop={(line) => 6 + (line - 1) * 18}
        breakpointLinesRef={{ current: null }}
        debugCurrentLineRef={{ current: null }}
      />,
    );

    const breakpointLayer = host?.querySelector<HTMLElement>(".editor-breakpoint-lines");
    const debugLine = host?.querySelector<HTMLElement>(".editor-debug-current-line");
    const attention = host?.querySelector<HTMLElement>(".editor-attention-lines");
    expect(breakpointLayer?.style.getPropertyValue("--editor-scroll-top")).toBe("80px");
    expect(debugLine?.style.getPropertyValue("--debug-line-content-top")).toBe("60px");
    expect(attention?.style.getPropertyValue("--attention-line-height")).toBe("54px");
  });

  it("only shows the busy mask while an editor operation is active", () => {
    mount(<EditorOperationMask label={undefined} />);
    expect(host?.querySelector(".editor-operation-mask")).toBeNull();

    act(() => root?.render(<EditorOperationMask label="Formatando documento..." />));
    expect(host?.textContent).toContain("Formatando documento...");
  });
});
